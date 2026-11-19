// SAGA Leaf device core: the simulated firmware, independent of transport and
// storage. The Node simulator (leaf-sim.ts) serves it over HTTP with files on
// disk; the standalone app runs it in the page with IndexedDB storage.
//
// Protocol 1 reproduces firmware 1.0.0 (src/saga/net/web_server.cpp in
// saga-leaf-firmware) endpoint by endpoint, including its on-SD layout:
//   saga/books/<id>/{original.txt|original.epub, metadata.json}
//   saga/progress/<id>.json   {"chapter","offset","progress"}
//   saga/annotations/<id>.json [{id,kind,chapter,start,end,selected,note,location,createdAt}]
// Protocol 2 is the PROPOSED firmware extension (docs/LEAF_PROTOCOL.md).
import { convertEpubToText } from '../src/vendor/leaf-epub-convert.js'

export interface LeafStorage {
  read(path: string): Promise<Uint8Array | null>
  write(path: string, data: Uint8Array): Promise<void>
  append(path: string, data: Uint8Array): Promise<void>
  remove(path: string): Promise<void>          // a file, or everything under a directory
  list(dir: string): Promise<string[]>         // immediate children (names)
  usedBytes(): Promise<number>
}
export interface CoreOptions { name: string; protocol: 1 | 2; password: string; capacityBytes: number; charsPerPage: number; battery: number | null; quiet: boolean }
export interface Faults { offline?: boolean; latencyMs?: number; dropUploadAfterBytes?: number; failNextRequests?: number }
export interface CoreRequest { method: string; path: string; query: URLSearchParams; auth: string; json?: Record<string, unknown>; bytes?: Uint8Array; file?: { name: string; data: Uint8Array } }
export interface CoreResponse { status: number; body: unknown; type?: string; drop?: boolean }
export interface DevAnn { id: string; kind: 'bookmark' | 'highlight' | 'note'; chapter: number; start: number; end: number; selected: string; note: string; location: string; createdAt: number; rev?: number; deleted?: boolean; sagaId?: string }
export interface Progress { chapter: number; offset: number; progress: number; rev?: number; snippet?: string; counter?: number }
interface Settings { deviceId: string; tokens: Record<string, { name: string; token: string; at: number }>; counter: number }

const CHAPTER_CAP = 16 * 1024   // the firmware chapterizer's soft cap (bytes)
const enc = new TextEncoder(), dec = new TextDecoder()
const J = (v: unknown) => enc.encode(typeof v === 'string' ? v : JSON.stringify(v, null, 1))
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')
const b64url = (n: number) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function sha256hex(d: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d as unknown as BufferSource)), b => b.toString(16).padStart(2, '0')).join('') }

export class LeafCore {
  faults: Faults = {}
  pairing: { id: string; code: string; clientId: string; clientName: string; expires: number; attempts: number } | null = null
  screen: { view: 'library' | 'reading' | 'pairing'; bookId?: string } = { view: 'library' }
  log: string[] = []
  deviceId = ''
  counter = 0
  private textCache = new Map<string, string[]>()

  constructor(public store: LeafStorage, public o: CoreOptions) {}

  async init() {
    const s = await this.settings()
    if (!s) await this.saveSettings({ deviceId: 'leaf-' + hex(5), tokens: {}, counter: 0 })
    const cur = (await this.settings())!
    this.deviceId = cur.deviceId; this.counter = cur.counter ?? 0
    return this
  }
  note(msg: string) { this.log.unshift(`${new Date().toISOString().slice(11, 19)} ${msg}`); this.log.length = Math.min(this.log.length, 60); if (!this.o.quiet) console.log(`[leaf] ${msg}`) }

  // ------------------------------------------------------------ storage helpers
  private async readJson<T>(p: string): Promise<T | null> { const b = await this.store.read(p); return b ? JSON.parse(dec.decode(b)) : null }
  private async settings() { return this.readJson<Settings>('saga/settings/device.json') }
  private async saveSettings(s: Settings) { s.counter = this.counter; await this.store.write('saga/settings/device.json', J(s)) }
  async bookIds() {
    const ids = await this.store.list('saga/books')
    const out: string[] = []
    for (const id of ids) if (await this.store.read(`saga/books/${id}/metadata.json`)) out.push(id)
    return out
  }
  async meta(id: string) { return (await this.readJson<Record<string, unknown> & { id: string; title: string; author: string; file: string; format: string; sha256?: string; sagaId?: string; sizeBytes: number }>(`saga/books/${id}/metadata.json`))! }
  async progress(id: string) { return this.readJson<Progress>(`saga/progress/${id}.json`) }
  async annotations(id: string) { return (await this.readJson<DevAnn[]>(`saga/annotations/${id}.json`)) ?? [] }
  private async setAnnotations(id: string, a: DevAnn[]) { await this.store.write(`saga/annotations/${id}.json`, J(a)) }
  async books() {
    const out = []
    for (const id of await this.bookIds()) { const m = await this.meta(id); const p = await this.progress(id); out.push({ ...m, progress: p?.progress ?? (m.progress as number) ?? 0 }) }
    return out
  }

  /** The device reads TXT with its streaming reader and splits it into bounded chapters. */
  async chapters(id: string): Promise<string[]> {
    if (this.textCache.has(id)) return this.textCache.get(id)!
    const m = await this.meta(id)
    const raw = (await this.store.read(`saga/books/${id}/${m.file}`))!
    const text = m.format === 'epub' ? (await convertEpubToText(raw.slice().buffer)).text : dec.decode(raw)
    const out: string[] = []; let cur = ''
    for (const para of text.split(/\n{2,}/)) {
      const add = (cur ? '\n\n' : '') + para
      if (cur && enc.encode(cur + add).length > CHAPTER_CAP) { out.push(cur); cur = para } else cur += add
    }
    if (cur) out.push(cur)
    this.textCache.set(id, out)
    return out
  }
  static b2c(ch: string, b: number) { return dec.decode(enc.encode(ch).subarray(0, b)).length }
  static c2b(ch: string, c: number) { return enc.encode(ch.slice(0, c)).length }
  async fraction(id: string, chapter: number, byteOff: number) {
    const ch = await this.chapters(id); const lens = ch.map(c => enc.encode(c).length); const tot = lens.reduce((a, b) => a + b, 0) || 1
    return Math.min(1, (lens.slice(0, chapter).reduce((a, b) => a + b, 0) + byteOff) / tot)
  }
  async snippet(id: string, chapter: number, byteOff: number) {
    const ch = (await this.chapters(id))[chapter] ?? ''
    let c = LeafCore.b2c(ch, byteOff); while (c > 0 && !/\s/.test(ch[c - 1])) c--
    return ch.slice(c, c + 200).replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' ')
  }
  async page(id: string, chapter: number, byteOff: number) {
    const ch = (await this.chapters(id))[chapter] ?? ''
    const c = LeafCore.b2c(ch, byteOff)
    let end = Math.min(ch.length, c + this.o.charsPerPage)
    if (end < ch.length) { const sp = ch.lastIndexOf(' ', end); if (sp > c + 50) end = sp + 1 }
    return { text: ch.slice(c, end), nextByte: LeafCore.c2b(ch, end), atEnd: end >= ch.length }
  }

  // ------------------------------------------------------------ device-side actions
  async turn(id: string, pages: number) {
    const ch = await this.chapters(id)
    let p: Progress = (await this.progress(id)) ?? { chapter: 0, offset: 0, progress: 0, rev: 0 }
    for (let i = 0; i < Math.abs(pages); i++) {
      if (pages > 0) {
        const pg = await this.page(id, p.chapter, p.offset)
        if (pg.atEnd) { if (p.chapter + 1 < ch.length) p = { ...p, chapter: p.chapter + 1, offset: 0 } }
        else p = { ...p, offset: pg.nextByte }
      } else {
        const t = ch[p.chapter]; const c = LeafCore.b2c(t, p.offset)
        if (c === 0 && p.chapter > 0) { const prev = ch[p.chapter - 1]; p = { ...p, chapter: p.chapter - 1, offset: LeafCore.c2b(prev, Math.max(0, prev.length - this.o.charsPerPage)) } }
        else p = { ...p, offset: LeafCore.c2b(t, Math.max(0, c - this.o.charsPerPage)) }
      }
    }
    await this.writeProgress(id, p.chapter, p.offset)
    const m = await this.meta(id); m.lastReadAt = Date.now(); await this.store.write(`saga/books/${id}/metadata.json`, J(m))
    return (await this.progress(id))!
  }
  async writeProgress(id: string, chapter: number, offset: number) {
    const cur = await this.progress(id)
    this.counter++
    const p: Progress = { chapter, offset, progress: +(await this.fraction(id, chapter, offset)).toFixed(4), rev: (cur?.rev ?? 0) + 1, snippet: await this.snippet(id, chapter, offset), counter: this.counter }
    await this.store.write(`saga/progress/${id}.json`, J(p))
    await this.saveSettings((await this.settings())!)
    return p
  }
  async highlightOnPage(id: string, note = '') {
    const p = (await this.progress(id)) ?? { chapter: 0, offset: 0, progress: 0 }
    const ch = (await this.chapters(id))[p.chapter]
    const c = LeafCore.b2c(ch, p.offset)
    const rest = ch.slice(c, c + this.o.charsPerPage)
    const m = rest.match(/[^.!?]{12,}[.!?]/)
    const s = c + (m ? rest.indexOf(m[0]) : 0), e = s + (m ? m[0].length : Math.min(60, rest.length))
    const list = await this.annotations(id)
    const a: DevAnn = { id: hex(8), kind: note ? 'note' : 'highlight', chapter: p.chapter, start: LeafCore.c2b(ch, s), end: LeafCore.c2b(ch, e), selected: ch.slice(s, e).trim(), note, location: `Section ${p.chapter + 1}`, createdAt: 0, rev: bump(list) }
    list.push(a); await this.setAnnotations(id, list)
    this.note(`highlighted “${a.selected.slice(0, 40)}…”`)
    return a
  }
  async commitBook(filename: string, data: Uint8Array, extra: { title?: string; author?: string; sha256?: string; sagaId?: string }) {
    const id = hex(8)
    const isEpub = /\.epub$/i.test(filename)
    const file = isEpub ? 'original.epub' : 'original.txt'
    await this.store.write(`saga/books/${id}/${file}`, data)
    const m = { id, title: extra.title || filename, author: extra.author || 'Unknown', mediaType: 'ebook', format: isEpub ? 'epub' : 'txt', file, sizeBytes: data.length, addedAt: Date.now(), lastReadAt: 0, progress: 0, hasCover: false, schema: 1, ...(extra.sha256 ? { sha256: extra.sha256 } : {}), ...(extra.sagaId ? { sagaId: extra.sagaId } : {}) }
    await this.store.write(`saga/books/${id}/metadata.json`, J(m))
    this.note(`received “${m.title}” (${Math.round(data.length / 1024)} KB)`)
    return id
  }

  /** What the 240×320 screen shows right now. */
  async screenState() {
    const base = { name: this.o.name, protocol: this.o.protocol, log: this.log.slice(0, 8), battery: this.o.battery }
    if (this.screen.view === 'pairing' && this.pairing) return { ...base, view: 'pairing', code: this.pairing.code, client: this.pairing.clientName }
    if (this.screen.view === 'reading' && this.screen.bookId && (await this.store.read(`saga/books/${this.screen.bookId}/metadata.json`))) {
      const id = this.screen.bookId
      const pr = (await this.progress(id)) ?? { chapter: 0, offset: 0, progress: 0 }
      const pg = await this.page(id, pr.chapter, pr.offset)
      const anns = (await this.annotations(id)).filter(a => !a.deleted && a.chapter === pr.chapter)
      return { ...base, view: 'reading', bookId: id, title: (await this.meta(id)).title, text: pg.text, progress: pr.progress, highlights: anns.map(a => a.selected) }
    }
    return { ...base, view: 'library', books: (await this.books()).map(b => ({ id: b.id, title: b.title, author: b.author, progress: b.progress })) }
  }
  open(bookId: string) { this.screen = { view: 'reading', bookId } }
  back() { this.screen = { view: 'library' } }
  async state() {
    const books = await this.books()
    const progress: Record<string, Progress | null> = {}, annotations: Record<string, DevAnn[]> = {}
    for (const b of books) { progress[b.id as string] = await this.progress(b.id as string); annotations[b.id as string] = await this.annotations(b.id as string) }
    return { deviceId: this.deviceId, protocol: this.o.protocol, faults: this.faults, pairing: this.pairing ? { code: this.pairing.code } : null, books, progress, annotations }
  }

  // ------------------------------------------------------------ protocol
  async handle(req: CoreRequest): Promise<CoreResponse> {
    const ok = (body: unknown, status = 200): CoreResponse => ({ status, body })
    const err = (status: number, error: string): CoreResponse => ({ status, body: { error } })
    const { method, path } = req
    try {
      const v2 = this.o.protocol >= 2
      const tokens = (await this.settings())?.tokens ?? {}
      const authed = req.auth === `Bearer ${this.o.password}` || (v2 && Object.values(tokens).some(t => req.auth === `Bearer ${t.token}`))
      const status = async () => ({
        connected: true, mode: 'station', ssid: 'SimNet', ip: '127.0.0.1', storageType: 'sd', product: 'Saga Leaf', firmware: v2 ? '2.0.0-sim' : '1.0.0',
        battery: v2 && this.o.battery != null ? { available: true, percent: this.o.battery, state: 'discharging' } : { available: false, percent: null, state: 'unknown' },
        storage: { capacityBytes: this.o.capacityBytes, usedBytes: await this.store.usedBytes(), bookCount: (await this.bookIds()).length },
      })

      // ---------------- protocol 1 (firmware 1.0.0) ----------------
      if (path === '/api/status' && method === 'GET') return ok(await status())
      if (path === '/api/books' && method === 'GET') return ok({ books: (await this.books()).map(({ sha256, sagaId, ...b }) => (v2 ? { ...b, sha256, sagaId } : b)) })
      if (path === '/api/notes' && method === 'GET') {
        const notes = []
        for (const id of await this.bookIds()) for (const a of await this.annotations(id)) if (!a.deleted) notes.push({ bookId: id, text: a.selected, note: a.note, location: a.location })
        return ok({ notes })
      }
      if (path === '/api/auth/check') return authed ? ok({ ok: true }) : err(401, 'auth required')
      if (path === '/api/upload' && method === 'POST') {
        const filename = req.query.get('filename') ?? ''
        if (!authed) return err(401, 'auth required')
        if (!/^[\w .()'-]{1,120}\.(txt|epub)$/i.test(filename) || !req.file) return err(400, 'upload failed (only .txt and .epub reach the device)')
        const budget = this.o.capacityBytes - (await this.store.usedBytes()) - 32 * 1024
        if (req.file.data.length > budget) return err(507, `not enough room - ${Math.floor(Math.max(0, budget + 32 * 1024) / 1024)} KB free of ${Math.floor(this.o.capacityBytes / 1024)} KB. Delete a book, or send a smaller one.`)
        const id = await this.commitBook(filename, req.file.data, { title: req.query.get('title') ?? undefined, author: req.query.get('author') ?? undefined })
        return ok({ ok: true, id }, 201)
      }
      if (path.startsWith('/api/books/')) {
        const rest = path.slice('/api/books/'.length).split('/')
        const id = rest[0]
        if (rest.length === 1) {
          if (!authed) return err(401, 'auth required')
          if (!/^[0-9a-f]{16}$/.test(id)) return err(400, 'bad id')
          if (method === 'DELETE') {
            await this.store.remove(`saga/books/${id}`); await this.store.remove(`saga/annotations/${id}.json`); await this.store.remove(`saga/progress/${id}.json`)
            this.textCache.delete(id); this.note(`deleted book ${id}`)
            return ok({ ok: true })
          }
          if (method === 'PUT') {
            if (!(await this.store.read(`saga/books/${id}/metadata.json`))) return err(404, 'no such book')
            const b = req.json ?? {}; const m = await this.meta(id)
            if (b.title) m.title = String(b.title); if (typeof b.author === 'string') m.author = b.author
            await this.store.write(`saga/books/${id}/metadata.json`, J(m))
            return ok({ ok: true, book: m })
          }
          return err(405, 'method not allowed')
        }
        if (!v2) return err(404, 'not found')
        return await this.v2Book(req, id, rest.slice(1), authed)
      }
      if (path === '/api/notes/export') {
        if (!authed) return err(401, 'auth required')
        let md = '# Saga Leaf — Notes & Highlights\n\n'
        for (const id of await this.bookIds()) { const a = (await this.annotations(id)).filter(x => !x.deleted); if (!a.length) continue; md += `## ${(await this.meta(id)).title}\n\n` + a.map(x => `> ${x.selected}\n\n${x.note ? x.note + '\n\n' : ''}`).join('') }
        return { status: 200, body: md, type: 'text/markdown; charset=utf-8' }
      }
      if (!v2) return path.startsWith('/api/') ? err(404, 'not found') : { status: 200, type: 'text/html', body: '<!doctype html><title>Saga Leaf</title><p>Saga Leaf web interface (simulated firmware 1.0.0). Open <a href="/device">/device</a> for the simulated screen.' }

      // ---------------- protocol 2 (proposed) ----------------
      if (path === '/api/v2/hello') return ok({ protocol: 2, deviceId: this.deviceId, name: this.o.name, product: 'Saga Leaf', model: 'V1-sim', firmware: '2.0.0-sim', capabilities: ['pair', 'progress', 'annotations', 'resumable-upload', 'sha256', 'battery', 'storage'], paired: authed })
      if (path === '/api/v2/pair/start' && method === 'POST') {
        const b = req.json ?? {}
        this.pairing = { id: hex(6), code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0'), clientId: String(b.clientId ?? ''), clientName: String(b.clientName ?? 'SAGA Reader'), expires: Date.now() + 120_000, attempts: 0 }
        this.screen = { view: 'pairing' }
        this.note(`pairing request from ${this.pairing.clientName}: showing code ${this.pairing.code}`)
        return ok({ pairingId: this.pairing.id, expiresIn: 120 })
      }
      if (path === '/api/v2/pair/confirm' && method === 'POST') {
        const b = req.json ?? {}; const p = this.pairing
        if (!p || p.id !== b.pairingId || Date.now() > p.expires) return err(410, 'pairing expired, start again')
        if (++p.attempts > 5) { this.pairing = null; this.screen = { view: 'library' }; return err(429, 'too many attempts, start again') }
        if (String(b.code) !== p.code) return err(403, 'wrong code')
        const s = (await this.settings())!; const token = b64url(24)
        s.tokens[p.clientId || hex(4)] = { name: p.clientName, token, at: Date.now() }; await this.saveSettings(s)
        this.pairing = null; this.screen = { view: 'library' }
        this.note(`paired with ${p.clientName}`)
        return ok({ token, deviceId: this.deviceId, name: this.o.name })
      }
      if (path.startsWith('/api/v2/pair/') && method === 'DELETE') {
        if (!authed) return err(401, 'auth required')
        const s = (await this.settings())!; delete s.tokens[decodeURIComponent(path.slice('/api/v2/pair/'.length))]; await this.saveSettings(s)
        return ok({ ok: true })
      }
      if (!authed) return err(401, 'auth required')
      if (path === '/api/v2/state') {
        const st = await status()
        const books = []
        for (const id of await this.bookIds()) { const m = await this.meta(id); const anns = await this.annotations(id); books.push({ id, title: m.title, author: m.author, sizeBytes: m.sizeBytes, sha256: m.sha256, sagaId: m.sagaId, progressRev: (await this.progress(id))?.rev ?? 0, annotationRev: Math.max(0, ...anns.map(a => a.rev ?? 0)) }) }
        return ok({ deviceId: this.deviceId, counter: this.counter, storage: st.storage, battery: this.o.battery != null ? { available: true, percent: this.o.battery, state: 'discharging' } : { available: false, percent: null, state: 'unknown' }, books })
      }
      if (path === '/api/v2/uploads' && method === 'POST') {
        const b = (req.json ?? {}) as { filename?: string; size?: number; sha256?: string; title?: string; author?: string; sagaId?: string }
        if (!/\.(txt|epub)$/i.test(b.filename ?? '')) return err(400, 'only .txt and .epub reach the device')
        if (!((b.size ?? 0) > 0) || !/^[0-9a-f]{64}$/.test(b.sha256 ?? '')) return err(400, 'size and sha256 required')
        const free = this.o.capacityBytes - (await this.store.usedBytes()) - 32 * 1024
        if (b.size! > free) return err(507, `not enough room - ${Math.max(0, Math.floor(free / 1024))} KB free of ${Math.floor(this.o.capacityBytes / 1024)} KB. Delete a book, or send a smaller one.`)
        for (const id of await this.bookIds()) if ((await this.meta(id)).sha256 === b.sha256) return ok({ uploadId: null, existing: id, received: b.size })
        for (const f of (await this.store.list('saga/imports')).filter(f => f.endsWith('.json'))) {
          const u = await this.readJson<{ id: string; sha256: string }>(`saga/imports/${f}`)
          if (u && u.sha256 === b.sha256) return ok({ uploadId: u.id, received: (await this.store.read(`saga/imports/${u.id}.part`))?.length ?? 0 })
        }
        const id = hex(8)
        await this.store.write(`saga/imports/${id}.json`, J({ id, ...b, started: Date.now() }))
        await this.store.write(`saga/imports/${id}.part`, new Uint8Array(0))
        return ok({ uploadId: id, received: 0 }, 201)
      }
      const up = path.match(/^\/api\/v2\/uploads\/([0-9a-f]{16})(\/commit)?$/)
      if (up) {
        const id = up[1]
        const meta = await this.readJson<{ size: number; sha256: string; filename: string; title?: string; author?: string; sagaId?: string }>(`saga/imports/${id}.json`)
        if (!meta) return err(404, 'no such upload')
        const have = (await this.store.read(`saga/imports/${id}.part`))?.length ?? 0
        if (method === 'GET') return ok({ uploadId: id, received: have, size: meta.size })
        if (method === 'PUT' && !up[2]) {
          const off = Number(req.query.get('offset'))
          if (off !== have) return ok({ error: 'offset mismatch', received: have }, 409)
          const chunk = req.bytes ?? new Uint8Array(0)
          const drop = this.faults.dropUploadAfterBytes
          if (drop != null && have + chunk.length > drop) {
            const keep = Math.max(0, drop - have)
            if (keep) await this.store.append(`saga/imports/${id}.part`, chunk.subarray(0, keep))
            this.faults.dropUploadAfterBytes = undefined
            this.note(`connection dropped mid-upload at ${have + keep} bytes`)
            return { status: 0, body: null, drop: true }
          }
          await this.store.append(`saga/imports/${id}.part`, chunk)
          return ok({ received: have + chunk.length })
        }
        if (method === 'POST' && up[2]) {
          if (have !== meta.size) return ok({ error: 'upload incomplete', received: have }, 409)
          const data = (await this.store.read(`saga/imports/${id}.part`))!
          const hash = await sha256hex(data)
          await this.store.remove(`saga/imports/${id}.part`); await this.store.remove(`saga/imports/${id}.json`)
          if (hash !== meta.sha256) return err(422, 'checksum mismatch - the file was damaged in transfer and has been discarded')
          const bookId = await this.commitBook(meta.filename, data, { title: meta.title, author: meta.author, sha256: hash, sagaId: meta.sagaId })
          return ok({ ok: true, id: bookId }, 201)
        }
      }
      return err(404, 'not found')
    } catch (e) { return err(500, (e as Error).message) }
  }

  private async v2Book(req: CoreRequest, id: string, rest: string[], authed: boolean): Promise<CoreResponse> {
    const ok = (body: unknown, status = 200): CoreResponse => ({ status, body })
    const err = (status: number, error: string): CoreResponse => ({ status, body: { error } })
    if (!authed) return err(401, 'auth required')
    if (!(await this.store.read(`saga/books/${id}/metadata.json`))) return err(404, 'no such book')
    if (rest[0] === 'progress') {
      if (req.method === 'GET') { const p = await this.progress(id); return ok(p ? { ...p, fraction: p.progress } : { chapter: 0, offset: 0, progress: 0, fraction: 0, rev: 0, snippet: '' }) }
      if (req.method === 'PUT') {
        const b = (req.json ?? {}) as { snippet?: string; fraction?: number; baseRev?: number; from?: string }
        const cur = await this.progress(id)
        if ((cur?.rev ?? 0) !== b.baseRev) return ok({ error: 'the Leaf has a newer position', current: cur }, 409)
        const ch = await this.chapters(id)
        let chapter = 0, offset = 0
        const want = String(b.snippet ?? '').replace(/\s+/g, ' ').trim()
        const hit = want ? findIn(ch, want, b.fraction) : null
        if (hit) { chapter = hit.chapter; offset = LeafCore.c2b(ch[hit.chapter], hit.index) }
        else { const tot = ch.reduce((a, c) => a + c.length, 0); let t = (b.fraction ?? 0) * tot; for (chapter = 0; chapter < ch.length - 1 && t > ch[chapter].length; chapter++) t -= ch[chapter].length; offset = LeafCore.c2b(ch[chapter], Math.round(t)) }
        const p = await this.writeProgress(id, chapter, offset)
        this.note(`position set by ${b.from ?? 'app'} to ${(p.progress * 100).toFixed(1)}%`)
        return ok(p)
      }
    }
    if (rest[0] === 'annotations') {
      if (req.method === 'GET') { const since = Number(req.query.get('since') ?? 0); const all = await this.annotations(id); return ok({ rev: Math.max(0, ...all.map(a => a.rev ?? 0)), annotations: all.filter(a => (a.rev ?? 0) > since) }) }
      if (req.method === 'POST') {
        const list = await this.annotations(id); const ch = await this.chapters(id)
        let changed = 0
        for (const a of ((req.json ?? {}).annotations ?? []) as { sagaId: string; kind: DevAnn['kind']; exact: string; note: string; deleted?: boolean; fraction?: number }[]) {
          const existing = list.find(x => x.sagaId === a.sagaId || x.id === a.sagaId)
          if (existing) {
            if (existing.note !== a.note || !!existing.deleted !== !!a.deleted || existing.kind !== a.kind) { existing.note = a.note; existing.deleted = a.deleted; existing.kind = a.kind; existing.rev = bump(list); changed++ }
            continue
          }
          if (a.deleted) continue
          const hit = findIn(ch, a.exact.replace(/\s+/g, ' ').trim(), a.fraction)
          const chapter = hit?.chapter ?? 0, s = hit?.index ?? 0
          list.push({ id: hex(8), sagaId: a.sagaId, kind: a.kind, chapter, start: LeafCore.c2b(ch[chapter], s), end: LeafCore.c2b(ch[chapter], s + a.exact.length), selected: a.exact, note: a.note, location: `Section ${chapter + 1}`, createdAt: 0, rev: bump(list) })
          changed++
        }
        await this.setAnnotations(id, list)
        return ok({ ok: true, changed, rev: Math.max(0, ...list.map(a => a.rev ?? 0)) })
      }
    }
    return err(404, 'not found')
  }
}

const bump = (list: DevAnn[]) => Math.max(0, ...list.map(x => x.rev ?? 0)) + 1

export function findIn(chapters: string[], snippet: string, fraction?: number) {
  const needle = snippet.toLowerCase().slice(0, 80)
  if (needle.length < 8) return null
  const tot = chapters.reduce((a, c) => a + c.length, 0) || 1
  let best: { chapter: number; index: number; d: number } | null = null, before = 0
  for (let c = 0; c < chapters.length; c++) {
    const norm = chapters[c].toLowerCase().replace(/\s/g, ' ')
    let i = norm.indexOf(needle)
    if (i < 0) { const collapsed = norm.replace(/ +/g, ' '); const j = collapsed.indexOf(needle); if (j >= 0) { let k = 0, n = 0; while (n < j && k < norm.length) { if (!(norm[k] === ' ' && norm[k - 1] === ' ')) n++; k++ } i = k } }
    while (i >= 0) {
      const d = fraction == null ? 0 : Math.abs((before + i) / tot - fraction)
      if (!best || d < best.d) best = { chapter: c, index: i, d }
      i = norm.indexOf(needle, i + 1)
    }
    before += chapters[c].length
  }
  return best
}

/** Adapt a LeafCore to the fetch() interface, for running a simulated Leaf inside the page. */
export function coreFetch(core: LeafCore): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const req = new Request(input, init)
    if (core.faults.offline) throw new TypeError('Failed to fetch')
    if (core.faults.failNextRequests) { core.faults.failNextRequests--; throw new TypeError('Failed to fetch') }
    if (core.faults.latencyMs) await new Promise(r => setTimeout(r, core.faults.latencyMs))
    const url = new URL(req.url)
    const cr: CoreRequest = { method: req.method, path: url.pathname, query: url.searchParams, auth: req.headers.get('authorization') ?? '' }
    const ct = req.headers.get('content-type') ?? ''
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (ct.includes('multipart/form-data')) { const fd = await req.formData(); const f = [...fd.values()].find(v => typeof v !== 'string') as File | undefined; if (f) cr.file = { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } }
      else if (ct.includes('json')) cr.json = await req.json().catch(() => ({}))
      else cr.bytes = new Uint8Array(await req.arrayBuffer())
    }
    const r = await core.handle(cr)
    if (r.drop) throw new TypeError('Failed to fetch')
    const type = r.type ?? 'application/json; charset=utf-8'
    return new Response(type.startsWith('application/json') ? JSON.stringify(r.body) : String(r.body), { status: r.status, headers: { 'content-type': type } })
  }
}
