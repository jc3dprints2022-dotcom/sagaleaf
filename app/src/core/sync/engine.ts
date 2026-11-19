// Sync engine. Talks to any number of peers:
//   relay — the SAGA sync relay (end-to-end encrypted op log + book files)
//   leaf  — a SAGA Leaf device (see ../leaf/sync.ts)
// Runs on edits (debounced), on reconnect and on a timer. Every step is
// idempotent, so an interrupted sync simply resumes next time.
import type { Store } from '../store'
import type { Book, Op, Peer } from '../types'
import { deriveKeys, sealJson, openJson, seal, open, blobName, type LibraryKeys } from './crypto'
import { importBytes } from '../library'
import { sha256 } from '../util'
import { PRODUCT } from '../../app/product'

export const CHUNK = 512 * 1024
export type Fetch = typeof fetch

export interface SyncResult { pushed: number; pulled: number; applied: number; conflicts: number; kept: number; uploaded: number; downloaded: number; errors: string[] }
const empty = (): SyncResult => ({ pushed: 0, pulled: 0, applied: 0, conflicts: 0, kept: 0, uploaded: 0, downloaded: 0, errors: [] })

export class RelayClient {
  private keys?: Promise<LibraryKeys>
  constructor(private peer: Peer, private f: Fetch = (...a) => fetch(...a)) {}
  k() { return (this.keys ??= deriveKeys(this.peer.secret!)) }
  async url(path: string) { return `${this.peer.url.replace(/\/$/, '')}/sync/${(await this.k()).libraryId}${path}` }
  private async req(path: string, init?: RequestInit) {
    const r = await this.f(await this.url(path), init)
    if (!r.ok) throw new Error(`relay ${r.status} ${await r.text().catch(() => '')}`.trim())
    return r
  }
  async push(ops: Op[], device: string) {
    const payload = await sealJson(await this.k(), ops)
    return (await (await this.req('/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, count: ops.length, payload }) })).json()) as { cursor: number }
  }
  async pull(after: number) {
    const r = await (await this.req(`/ops?after=${after}`)).json() as { batches: { cursor: number; device: string; payload: string }[]; cursor: number; more: boolean }
    const k = await this.k()
    const ops: Op[] = []
    for (const b of r.batches) ops.push(...await openJson<Op[]>(k, b.payload))
    return { ops, cursor: r.cursor, more: r.more }
  }
  async blobState(hash: string) {
    const r = await this.f(await this.url(`/blobs/${await blobName(await this.k(), hash)}`))
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`relay ${r.status}`)
    return (await r.json()) as { chunks: number[]; total: number; complete: boolean }
  }
  async putChunk(hash: string, n: number, total: number, data: Uint8Array) {
    const body = await seal(await this.k(), data)
    await this.req(`/blobs/${await blobName(await this.k(), hash)}/${n}?total=${total}`, { method: 'PUT', body: body as BodyInit, headers: { 'content-type': 'application/octet-stream' } })
  }
  async getChunk(hash: string, n: number) {
    const r = await this.req(`/blobs/${await blobName(await this.k(), hash)}/${n}`)
    return open(await this.k(), new Uint8Array(await r.arrayBuffer()))
  }
}

export interface EngineStatus { state: 'idle' | 'syncing' | 'offline' | 'error'; lastSyncAt?: number; message?: string; pending: number; progress?: { label: string; done: number; total: number } }

export class SyncEngine {
  status: EngineStatus = { state: 'idle', pending: 0 }
  private listeners = new Set<(s: EngineStatus) => void>()
  private timer?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  private running: Promise<void> | null = null
  private again = false
  leafSync?: (peer: Peer) => Promise<SyncResult>

  constructor(public store: Store, public f: Fetch = (...a) => fetch(...a)) {}

  onStatus(fn: (s: EngineStatus) => void) { this.listeners.add(fn); fn(this.status); return () => { this.listeners.delete(fn) } }
  private set(s: Partial<EngineStatus>) { this.status = { ...this.status, ...s }; for (const l of this.listeners) l(this.status) }

  start() {
    let pendingTimer: ReturnType<typeof setTimeout> | undefined
    this.store.on(t => {
      if (!(t.has('annotations') || t.has('positions') || t.has('books') || t.has('collections') || t.has('members'))) return
      this.schedule(1500)
      // keep "N changes waiting" accurate immediately, even while offline
      clearTimeout(pendingTimer); pendingTimer = setTimeout(async () => this.set({ pending: await this.pendingCount() }), 250)
    })
    this.interval = setInterval(() => this.schedule(0), 30_000)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(0))
      window.addEventListener('offline', async () => this.set({ state: 'offline', pending: await this.pendingCount() }))
    }
    this.schedule(500)
  }
  stop() { clearTimeout(this.timer); clearInterval(this.interval) }
  schedule(ms: number) { clearTimeout(this.timer); this.timer = setTimeout(() => void this.syncAll(), ms) }

  async pendingCount() {
    const peers = (await this.store.db.peers.toArray()).filter(p => p.kind === 'relay')
    if (!peers.length) return 0
    const min = Math.min(...peers.map(p => p.pushedSeq))
    return this.store.db.ops.where('seq').above(min).count()
  }

  async syncAll(): Promise<void> {
    if (this.running) { this.again = true; return this.running }
    this.running = (async () => {
      do {
        this.again = false
        const peers = await this.store.db.peers.toArray()
        if (!peers.length) { this.set({ state: 'idle', pending: 0 }); break }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.set({ state: 'offline', pending: await this.pendingCount() }); break }
        this.set({ state: 'syncing' })
        let failed = ''
        for (const p of peers) {
          const r = await this.syncPeer(p).catch(e => ({ ...empty(), errors: [String((e as Error).message ?? e)] }))
          if (r.errors.length && p.kind === 'relay') failed = r.errors[0]
        }
        this.set({ state: failed ? 'error' : 'idle', message: failed || undefined, lastSyncAt: Date.now(), pending: await this.pendingCount(), progress: undefined })
      } while (this.again)
    })().finally(() => { this.running = null })
    return this.running
  }

  async syncPeer(peer: Peer): Promise<SyncResult> {
    if (peer.kind === 'leaf') return this.leafSync ? this.leafSync(peer) : empty()
    return this.syncRelay(peer)
  }

  async syncRelay(peer: Peer): Promise<SyncResult> {
    const res = empty()
    const c = new RelayClient(peer, this.f)
    const save = async (patch: Partial<Peer>) => { Object.assign(peer, patch); await this.store.db.peers.update(peer.id, patch) }
    try {
      // 1. push local ops, in batches, advancing the cursor only after the relay accepts them.
      for (;;) {
        const ops = await this.store.opsAfter(peer.pushedSeq, 400)
        if (!ops.length) break
        await c.push(ops.map(({ seq, ...o }) => { void seq; return o }), this.store.deviceId)
        res.pushed += ops.length
        await save({ pushedSeq: ops[ops.length - 1].seq! })
      }
      // 2. pull and merge.
      for (;;) {
        const { ops, cursor, more } = await c.pull(peer.pulledCursor)
        if (ops.length) { const a = await this.store.apply(ops); res.applied += a.applied; res.conflicts += a.conflicts; res.kept += a.kept; res.pulled += ops.length }
        await save({ pulledCursor: cursor })
        if (!more) break
      }
      // 3. book files, only if the user allowed it for this peer.
      if (peer.syncFiles) await this.syncFiles(c, res)
      await save({ lastSyncAt: Date.now(), lastError: undefined })
    } catch (e) {
      res.errors.push((e as Error).message)
      await save({ lastError: (e as Error).message })
    }
    return res
  }

  private async syncFiles(c: RelayClient, res: SyncResult) {
    const books = (await this.store.db.books.toArray()).filter(b => !b.deleted)
    const done = (await this.store.getMeta<string[]>('uploadedBlobs', []))
    const doneSet = new Set(done)
    for (const b of books.filter(b => b.fileState === 'local' && !doneSet.has(b.hash))) {
      if (await this.uploadBlob(c, b)) { res.uploaded++; doneSet.add(b.hash); await this.store.setMeta('uploadedBlobs', [...doneSet]) }
    }
    if (await this.store.getMeta('autoDownload', true)) {
      for (const b of books.filter(b => b.fileState === 'remote')) if (await this.downloadBlob(c, b)) res.downloaded++
    }
  }

  async uploadBlob(c: RelayClient, b: Book) {
    const file = await this.store.db.files.get(b.hash)
    if (!file) return false
    const total = Math.max(1, Math.ceil(file.data.length / CHUNK))
    const state = await c.blobState(b.hash)
    const have = new Set(state?.chunks ?? [])
    for (let n = 0; n < total; n++) {
      if (have.has(n)) continue
      this.set({ progress: { label: `Uploading ${b.title}`, done: n, total } })
      await c.putChunk(b.hash, n, total, file.data.subarray(n * CHUNK, (n + 1) * CHUNK))
    }
    return true
  }

  async downloadBlob(c: RelayClient, b: Book) {
    const state = await c.blobState(b.hash)
    if (!state?.complete) return false
    const parts: Uint8Array[] = []
    for (let n = 0; n < state.total; n++) {
      this.set({ progress: { label: `Downloading ${b.title}`, done: n, total: state.total } })
      parts.push(await c.getChunk(b.hash, n))
    }
    const size = parts.reduce((s, p) => s + p.length, 0)
    const data = new Uint8Array(size); let o = 0
    for (const p of parts) { data.set(p, o); o += p.length }
    if ((await sha256(data)) !== b.hash) throw new Error(`Downloaded file for “${b.title}” failed its integrity check; it will be fetched again.`)
    const r = await importBytes(this.store, b.filename ?? `${b.title}.${b.format}`, data, { source: b.source, catalogId: b.catalogId, license: b.license })
    return r.status !== 'failed'
  }
}

export async function addRelayPeer(store: Store, url: string, secret: string, syncFiles = true): Promise<Peer> {
  const keys = await deriveKeys(secret)
  const peer: Peer = { id: 'relay-' + keys.libraryId.slice(0, 8), kind: 'relay', name: `${PRODUCT.shortName} Sync`, url, secret, pushedSeq: 0, pulledCursor: 0, syncFiles }
  await store.db.peers.put(peer)
  await store.setMeta('librarySecret', secret)
  return peer
}
