// @vitest-environment node
import './node-dom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshStore, sample } from './helpers'
import { startPlatform } from '../server/platform'
import { SyncEngine, addRelayPeer, RelayClient, CHUNK } from '../src/core/sync/engine'
import { newLibrarySecret, deriveKeys } from '../src/core/sync/crypto'
import { importBytes } from '../src/core/library'
import type { Annotation, Position } from '../src/core/types'

let srv: { port: number; close: () => Promise<void> }, dir: string, URL_: string
beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), 'saga-')); srv = await startPlatform({ port: 0, dir, quiet: true }); URL_ = `http://127.0.0.1:${srv.port}` })
afterAll(async () => { await srv.close() })

async function pair(secret = newLibrarySecret(), files = true) {
  const a = await freshStore(undefined, 'Phone'), b = await freshStore(undefined, 'Laptop')
  const ea = new SyncEngine(a), eb = new SyncEngine(b)
  await addRelayPeer(a, URL_, secret, files); await addRelayPeer(b, URL_, secret, files)
  return { a, b, ea, eb, secret }
}
const ann = (bookId: string, over: Partial<Annotation> = {}): Partial<Annotation> => ({ bookId, kind: 'highlight', section: 3, start: 10, end: 40, exact: 'It is a truth universally acknowledged', prefix: '', suffix: '', note: '', color: 'amber', tags: [], label: 'Chapter I', fraction: 0.01, createdAt: 1, updatedAt: 1, ...over })

describe('synchronization', () => {
  it('replicates annotations, positions and library metadata between two devices', async () => {
    const { a, b, ea, eb } = await pair()
    const r = await importBytes(a, 'p.epub', sample('pride-and-prejudice.epub'))
    await a.put<Annotation>('annotation', 'h1', ann(r.bookId!, { note: 'Famous opening' }))
    await a.put<Position>('position', `${r.bookId}:${a.deviceId}`, { bookId: r.bookId!, deviceId: a.deviceId, deviceName: 'Phone', section: 5, offset: 100, fraction: 0.07, snippet: 'x', at: a.clock.tick() })
    await ea.syncAll(); await eb.syncAll()
    expect((await b.db.annotations.get('h1'))!.note).toBe('Famous opening')
    expect((await b.db.positions.get(`${r.bookId}:${a.deviceId}`))!.fraction).toBe(0.07)
    const book = (await b.db.books.get(r.bookId!))!
    expect(book.title).toBe('Pride and Prejudice')
    // file arrived too (user allowed file sync), verified by hash
    expect(book.fileState).toBe('local')
    expect((await b.db.texts.where('bookId').equals(r.bookId!).count())).toBeGreaterThan(60)
  })

  it('stores only ciphertext on the relay', async () => {
    const { a, ea, secret } = await pair()
    await a.put<Annotation>('annotation', 'secret-note', ann('bk', { note: 'my private thought about Darcy' }))
    await ea.syncAll()
    const { libraryId } = await deriveKeys(secret)
    const opsDir = join(dir, 'relay', libraryId, 'ops')
    const raw = readdirSync(opsDir).map(f => readFileSync(join(opsDir, f), 'utf8')).join('')
    expect(raw).not.toContain('Darcy')
    expect(raw).not.toContain('truth universally')
    expect(raw).not.toContain(secret)
  })

  it('merges offline edits from both sides when they reconnect', async () => {
    const { a, b, ea, eb } = await pair(undefined, false)
    await a.put<Annotation>('annotation', 'x', ann('bk')); await ea.syncAll(); await eb.syncAll()
    // both offline: A recolours, B adds a tag and a second highlight
    await a.put<Annotation>('annotation', 'x', { color: 'rose' })
    await b.put<Annotation>('annotation', 'x', { tags: ['theme'] })
    await b.put<Annotation>('annotation', 'y', ann('bk', { start: 90, end: 99, exact: 'single man' }))
    await ea.syncAll(); await eb.syncAll(); await ea.syncAll()
    for (const s of [a, b]) {
      const x = (await s.db.annotations.get('x'))!
      expect(x.color).toBe('rose'); expect(x.tags).toEqual(['theme'])
      expect(await s.db.annotations.get('y')).toBeTruthy()
    }
  })

  it('never silently discards a note when two devices edit it concurrently', async () => {
    const { a, b, ea, eb } = await pair(undefined, false)
    await a.put<Annotation>('annotation', 'n', ann('bk', { note: 'first' })); await ea.syncAll(); await eb.syncAll()
    await a.put<Annotation>('annotation', 'n', { note: 'written on the phone' })
    await b.put<Annotation>('annotation', 'n', { note: 'written on the laptop' })
    await ea.syncAll(); await eb.syncAll(); await ea.syncAll()
    const na = (await a.db.annotations.get('n'))!, nb = (await b.db.annotations.get('n'))!
    expect(na.note).toBe(nb.note) // converged
    const all = [na.note, ...(na.conflicts ?? []).map(c => c.note)]
    expect(all).toContain('written on the phone'); expect(all).toContain('written on the laptop')
    expect([nb.note, ...(nb.conflicts ?? []).map(c => c.note)].sort()).toEqual(all.sort())
  })

  it('an edit beats a delete that had not seen it', async () => {
    const { a, b, ea, eb } = await pair(undefined, false)
    await a.put<Annotation>('annotation', 'd', ann('bk')); await ea.syncAll(); await eb.syncAll()
    await a.remove('annotation', 'd')
    await b.put<Annotation>('annotation', 'd', { note: 'added a note offline' })
    await eb.syncAll(); await ea.syncAll(); await eb.syncAll()
    const da = (await a.db.annotations.get('d'))!, db_ = (await b.db.annotations.get('d'))!
    expect(db_.deleted).toBeFalsy(); expect(db_.note).toBe('added a note offline')
    expect(da.note).toBe('added a note offline')
    // the deleting side keeps the content (soft delete) either way
    expect(da.exact).toBe('It is a truth universally acknowledged')
  })

  it('keeps every device’s reading position (no position overwrites another)', async () => {
    const { a, b, ea, eb } = await pair(undefined, false)
    await a.put<Position>('position', `bk:${a.deviceId}`, { bookId: 'bk', deviceId: a.deviceId, deviceName: 'Phone', section: 9, offset: 0, fraction: 0.4, snippet: '', at: a.clock.tick() })
    await b.put<Position>('position', `bk:${b.deviceId}`, { bookId: 'bk', deviceId: b.deviceId, deviceName: 'Laptop', section: 2, offset: 0, fraction: 0.1, snippet: '', at: b.clock.tick() })
    await ea.syncAll(); await eb.syncAll(); await ea.syncAll()
    expect(await a.db.positions.where('bookId').equals('bk').count()).toBe(2)
    expect(await b.db.positions.where('bookId').equals('bk').count()).toBe(2)
  })

  it('is idempotent: re-applying the same ops changes nothing', async () => {
    const { a, b, ea, eb } = await pair(undefined, false)
    await a.put<Annotation>('annotation', 'i', ann('bk', { note: 'once' })); await ea.syncAll(); await eb.syncAll()
    const ops = await a.opsAfter(0)
    const r = await b.apply(ops)
    expect(r.applied).toBe(0)
    expect((await b.db.annotations.get('i'))!.note).toBe('once')
  })

  it('handles partial sync: edits made during an interrupted push are sent next time', async () => {
    const { a, b, eb } = await pair(undefined, false)
    let calls = 0
    const flaky: typeof fetch = async (u, init) => { if (++calls === 2) throw new Error('network dropped'); return fetch(u, init) }
    const ea = new SyncEngine(a, flaky)
    for (let i = 0; i < 3; i++) await a.put<Annotation>('annotation', 'p' + i, ann('bk', { note: 'n' + i }))
    await ea.syncAll() // push ok, pull fails
    await a.put<Annotation>('annotation', 'p3', ann('bk', { note: 'n3' }))
    await ea.syncAll()
    await eb.syncAll()
    expect(await b.db.annotations.count()).toBe(4)
  })
})

describe('interrupted transfers', () => {
  it('resumes a book upload from the last completed chunk and verifies the download', async () => {
    const secret = newLibrarySecret()
    const a = await freshStore(undefined, 'Phone')
    const peer = await addRelayPeer(a, URL_, secret, true)
    const r = await importBytes(a, 'moby.epub', sample('moby-dick.epub'))
    const book = (await a.db.books.get(r.bookId!))!
    const total = Math.ceil(book.size / CHUNK)
    expect(total).toBeGreaterThan(2)
    let puts = 0
    const dropAfter2: typeof fetch = async (u, init) => { if (init?.method === 'PUT' && ++puts > 2) throw new Error('connection reset'); return fetch(u, init) }
    const e1 = new SyncEngine(a, dropAfter2)
    const res1 = await e1.syncRelay(peer)
    expect(res1.errors[0]).toMatch(/connection reset/)
    const c = new RelayClient(peer)
    expect((await c.blobState(book.hash))!.chunks).toEqual([0, 1])
    let resumedPuts = 0
    const count: typeof fetch = async (u, init) => { if (init?.method === 'PUT') resumedPuts++; return fetch(u, init) }
    const res2 = await new SyncEngine(a, count).syncRelay(peer)
    expect(res2.errors).toEqual([])
    expect(resumedPuts).toBe(total - 2) // only the missing chunks
    // a second device downloads and the hash matches
    const b = await freshStore(undefined, 'Laptop'); await addRelayPeer(b, URL_, secret, true)
    await new SyncEngine(b).syncAll()
    const got = (await b.db.books.get(book.id))!
    expect(got.fileState).toBe('local')
    expect((await b.db.files.get(book.hash))!.data.length).toBe(book.size)
  })

  it('rejects a corrupted download instead of importing it', async () => {
    const secret = newLibrarySecret()
    const a = await freshStore(); const peer = await addRelayPeer(a, URL_, secret, true)
    await importBytes(a, 'f.epub', sample('frankenstein.epub'))
    await new SyncEngine(a).syncAll()
    const b = await freshStore(); const pb = await addRelayPeer(b, URL_, secret, false)
    await new SyncEngine(b).syncAll()
    const book = (await b.db.books.toArray())[0]
    expect(book.fileState).toBe('remote')
    const evil: typeof fetch = async (u, init) => {
      const res = await fetch(u, init)
      if (String(u).includes('/blobs/') && /\/\d+$/.test(String(u))) { void peer; return new Response(new Uint8Array(40), { status: 200 }) }
      return res
    }
    await b.db.peers.update(pb.id, { syncFiles: true })
    const r = await new SyncEngine(b, evil).syncRelay({ ...pb, syncFiles: true })
    expect(r.errors.join(' ')).toMatch(/operation-specific|decrypt|integrity|OperationError/i)
    expect((await b.db.books.get(book.id))!.fileState).toBe('remote')
  })
})
