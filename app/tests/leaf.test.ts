// @vitest-environment node
import './node-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LeafDevice } from '../sim/leaf-sim'
import { LeafClient, discover } from '../src/core/leaf/client'
import { syncLeaf, addLeafPeer } from '../src/core/leaf/sync'
import { freshStore, sample } from './helpers'
import { importBytes, bookTexts } from '../src/core/library'
import { findQuote, quoteAt, absoluteFraction } from '../src/core/anchor'
import type { Annotation, Position, Peer } from '../src/core/types'
import type { Store } from '../src/core/store'

let dev: LeafDevice, srv: { port: number; close: () => Promise<void> }, url: string
const sim = (p: string, b: unknown = {}) => fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json())

async function boot(protocol: 1 | 2, extra = {}) {
  dev = new LeafDevice({ dir: mkdtempSync(join(tmpdir(), 'leaf-')), port: 0, protocol, quiet: true, ...extra })
  srv = await dev.listen(); url = `http://127.0.0.1:${srv.port}`
}
async function pairV2(store: Store) {
  const c = new LeafClient(url)
  const h = await c.hello()
  const { pairingId } = await c.pairStart(store.deviceId, 'SAGA Reader test')
  const code = (await (await fetch(url + '/sim/state')).json()).pairing.code
  const { token } = await c.pairConfirm(pairingId, code)
  return addLeafPeer(store, h, token)
}
afterEach(async () => { await srv?.close() })

describe('device simulator: firmware 1.0.0 compatibility', () => {
  beforeEach(() => boot(1))
  it('serves the firmware status, books and auth endpoints', async () => {
    const s = await (await fetch(url + '/api/status')).json()
    expect(s).toMatchObject({ product: 'Saga Leaf', firmware: '1.0.0', battery: { available: false, percent: null } })
    expect((await fetch(url + '/api/auth/check')).status).toBe(401)
    expect((await fetch(url + '/api/auth/check', { headers: { authorization: 'Bearer sagaleaf1' } })).status).toBe(200)
    expect((await fetch(url + '/api/v2/hello')).status).toBe(404)
    expect((await fetch(url + '/api/status')).headers.get('access-control-allow-origin')).toBeNull() // like the real firmware: no CORS
  })
  it('accepts a multipart upload into the firmware SD layout and refuses other formats', async () => {
    const c = new LeafClient(url, 'sagaleaf1')
    const id = await c.uploadV1('Pride.txt', new TextEncoder().encode('It is a truth universally acknowledged.'), 'Pride and Prejudice', 'Jane Austen')
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    const meta = JSON.parse(readFileSync(join(dev.root, 'books', id, 'metadata.json'), 'utf8'))
    expect(meta).toMatchObject({ id, title: 'Pride and Prejudice', author: 'Jane Austen', format: 'txt', file: 'original.txt', mediaType: 'ebook', schema: 1 })
    await expect(c.uploadV1('x.pdf', new Uint8Array(10), 'x', 'y')).rejects.toThrow(/only .txt and .epub/)
  })
  it('reports storage full with real numbers (HTTP 507) instead of corrupting storage', async () => {
    await srv.close(); await boot(1, { capacityBytes: 64 * 1024 })
    const c = new LeafClient(url, 'sagaleaf1')
    await expect(c.uploadV1('big.txt', new Uint8Array(200 * 1024).fill(65), 'Big', 'X')).rejects.toMatchObject({ status: 507 })
    expect(dev.bookIds()).toHaveLength(0)
  })
})

describe('device discovery and pairing (protocol 2)', () => {
  beforeEach(() => boot(2))
  it('discovers reachable devices and ignores dead addresses', async () => {
    const found = await discover([url, 'http://127.0.0.1:1'])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ protocol: 2, name: 'SAGA Leaf (simulated)' })
  })
  it('pairs with the code shown on the device, rejects a wrong code, rate-limits guesses', async () => {
    const c = new LeafClient(url)
    const { pairingId } = await c.pairStart('client-1', 'Phone')
    await expect(c.pairConfirm(pairingId, '000000x')).rejects.toMatchObject({ status: 403 })
    const code = (await (await fetch(url + '/sim/state')).json()).pairing.code
    const { token } = await c.pairConfirm(pairingId, code)
    expect(token.length).toBeGreaterThan(20)
    expect((await fetch(url + '/api/v2/state')).status).toBe(401)
    expect((await fetch(url + '/api/v2/state', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    const p2 = await c.pairStart('client-2', 'Attacker')
    for (let i = 0; i < 5; i++) await c.pairConfirm(p2.pairingId, String(i).padStart(6, '9')).catch(() => 0)
    await expect(c.pairConfirm(p2.pairingId, (await (await fetch(url + '/sim/state')).json()).pairing?.code ?? '1')).rejects.toBeTruthy()
  })
})

describe('Leaf sync (protocol 2, simulated)', () => {
  beforeEach(() => boot(2))

  async function setup() {
    const store = await freshStore(undefined, 'Phone')
    const r = await importBytes(store, 'p.epub', sample('pride-and-prejudice.epub'))
    const peer = await pairV2(store)
    peer.leaf!.send[r.bookId!] = true
    await store.db.peers.put(peer)
    return { store, bookId: r.bookId!, peer }
  }

  it('converts and transfers a book, verified by checksum', async () => {
    const { store, bookId, peer } = await setup()
    const res = await syncLeaf(store, peer)
    expect(res.errors).toEqual([])
    expect(res.uploaded).toBe(1)
    const leafId = peer.leaf!.map[bookId]
    const m = dev.meta(leafId)
    expect(m).toMatchObject({ title: 'Pride and Prejudice', format: 'txt', sagaId: bookId })
    expect(readFileSync(join(dev.root, 'books', leafId, 'original.txt'), 'utf8')).toContain('It is a truth universally acknowledged')
    expect((await store.db.transfers.get(`${peer.id}:${bookId}`))!.state).toBe('done')
    // idempotent: nothing is sent twice
    expect((await syncLeaf(store, peer)).uploaded).toBe(0)
    expect(dev.bookIds()).toHaveLength(1)
  })

  it('resumes a transfer that was cut off mid-way, sending only the rest', async () => {
    const { store, bookId, peer } = await setup()
    await sim('/sim/faults', { dropUploadAfterBytes: 150_000 })
    const r1 = await syncLeaf(store, peer)
    expect(r1.errors.length).toBe(1)
    const t1 = (await store.db.transfers.get(`${peer.id}:${bookId}`))!
    expect(t1.state).toBe('paused')
    expect(dev.bookIds()).toHaveLength(0)
    let bytes = 0
    const counting: typeof fetch = async (u, init) => { if (init?.method === 'PUT' && init.body) bytes += (init.body as Uint8Array).length; return fetch(u, init) }
    const r2 = await syncLeaf(store, peer, counting)
    expect(r2.errors).toEqual([])
    expect(dev.bookIds()).toHaveLength(1)
    expect(bytes).toBeLessThan(t1.size - 140_000)
    expect((await store.db.transfers.get(`${peer.id}:${bookId}`))!.state).toBe('done')
  })

  it('a newly sent book opens on the Leaf at the phone’s position in the same sync', async () => {
    const store = await freshStore(undefined, 'Phone')
    const r = await importBytes(store, 'p.epub', sample('pride-and-prejudice.epub'))
    const tx = (await bookTexts(store, r.bookId!)).map(t => t.text)
    const sec = tx.findIndex(t => t.includes('was not left long to the silent contemplation'))
    const off = tx[sec].indexOf('was not left long')
    await store.put<Position>('position', `${r.bookId}:${store.deviceId}`, { bookId: r.bookId!, deviceId: store.deviceId, deviceName: 'Phone', section: sec, offset: off, fraction: 0.3, snippet: 'was not left long to the silent contemplation of his successful love', at: store.clock.tick() })
    const peer = await pairV2(store)
    const res = await syncLeaf(store, peer)   // auto-send picks it up because it is being read
    expect(res.errors).toEqual([]); expect(res.uploaded).toBe(1)
    const leafId = peer.leaf!.map[r.bookId!]
    expect(dev.progress(leafId)?.snippet).toMatch(/^was not left long/)
  })

  it('carries the reading position phone → Leaf → phone using text anchors', async () => {
    const { store, bookId, peer } = await setup()
    await syncLeaf(store, peer)
    const tx = (await bookTexts(store, bookId)).map(t => t.text)
    // phone reads to chapter 20
    const sec = tx.findIndex(t => t.includes('was not left long to the silent contemplation'))
    const off = tx[sec].indexOf('was not left long') - 'Mr. Collins '.length
    await store.put<Position>('position', `${bookId}:${store.deviceId}`, { bookId, deviceId: store.deviceId, deviceName: 'Phone', section: sec, offset: off, fraction: absoluteFraction(tx.map(t => t.length), sec, off), snippet: 'Mr. Collins was not left long to the silent contemplation of his', at: store.clock.tick() })
    await syncLeaf(store, peer)
    const leafId = peer.leaf!.map[bookId]
    const scr = await (await fetch(url + '/sim/screen')).json(); void scr
    await sim('/sim/open', { bookId: leafId })
    const page = await (await fetch(url + '/sim/screen')).json()
    expect(page.text.replace(/\s+/g, ' ').startsWith('Mr. Collins was not left long')).toBe(true)
    // reader continues on the Leaf for 5 pages
    await sim('/sim/turn', { bookId: leafId, pages: 5 })
    const devSnippet = dev.progress(leafId)!.snippet!
    await syncLeaf(store, peer)
    const leafRow = (await store.db.positions.get(`${bookId}:${peer.id}`))!
    expect(leafRow.deviceName).toBe('SAGA Leaf (simulated)')
    expect(tx[leafRow.section].slice(leafRow.offset).replace(/\s+/g, ' ').startsWith(devSnippet.slice(0, 40))).toBe(true)
    expect(leafRow.fraction).toBeGreaterThan(absoluteFraction(tx.map(t => t.length), sec, off))
  })

  it('does not overwrite a position read on the Leaf when the phone also moved (keeps both)', async () => {
    const { store, bookId, peer } = await setup()
    await syncLeaf(store, peer)
    const leafId = peer.leaf!.map[bookId]
    await sim('/sim/turn', { bookId: leafId, pages: 30 })
    await store.put<Position>('position', `${bookId}:${store.deviceId}`, { bookId, deviceId: store.deviceId, deviceName: 'Phone', section: 2, offset: 0, fraction: 0.02, snippet: '', at: store.clock.tick() })
    const before = dev.progress(leafId)!
    await syncLeaf(store, peer)
    expect(dev.progress(leafId)!.offset).toBe(before.offset)
    const rows = await store.db.positions.where('bookId').equals(bookId).toArray()
    expect(rows.map(r => r.deviceName).sort()).toEqual(['Phone', 'SAGA Leaf (simulated)'])
  })

  it('syncs highlights both ways, anchored to the right passage', async () => {
    const { store, bookId, peer } = await setup()
    await syncLeaf(store, peer)
    const leafId = peer.leaf!.map[bookId]
    // highlight made on the phone
    const tx = (await bookTexts(store, bookId)).map(t => t.text)
    const m = findQuote(tx, { exact: 'a single man in possession of a good fortune' })!
    await store.put<Annotation>('annotation', 'ph1', { bookId, kind: 'note', section: m.section, start: m.start, end: m.end, ...quoteAt(tx[m.section], m.start, m.end), note: 'irony', color: 'amber', tags: [], label: 'I', fraction: 0.001, createdAt: Date.now(), updatedAt: Date.now() })
    // highlight made on the Leaf, a few pages in
    await sim('/sim/turn', { bookId: leafId, pages: 3 })
    const leafAnn = await sim('/sim/highlight', { bookId: leafId })
    await syncLeaf(store, peer)
    const onDevice = dev.annotations(leafId)
    expect(onDevice.some(a => a.sagaId === 'ph1' && a.note === 'irony' && a.selected.includes('single man'))).toBe(true)
    const imported = (await store.db.annotations.get(`leaf-${peer.id}-${leafAnn.id}`))!
    expect(imported.orphaned).toBeFalsy()
    expect(tx[imported.section].slice(imported.start, imported.end).replace(/\s+/g, ' ').trim()).toBe(leafAnn.selected.replace(/\s+/g, ' ').trim())
    // a second sync is a no-op
    const again = await syncLeaf(store, peer)
    expect(again.applied).toBe(0)
    expect(dev.annotations(leafId).length).toBe(2)
  })

  it('reconnects after the device was offline and keeps the reading made meanwhile', async () => {
    const { store, bookId, peer } = await setup()
    await syncLeaf(store, peer)
    await sim('/sim/faults', { offline: true })
    const r = await syncLeaf(store, peer)
    expect(r.errors[0]).toMatch(/reach the SAGA Leaf|answer in time/)
    expect((await store.db.peers.get(peer.id))!.lastError).toBeTruthy()
    // days pass: reading happens on the device, offline
    await sim('/sim/faults', { offline: false })
    const leafId = peer.leaf!.map[bookId]
    await sim('/sim/turn', { bookId: leafId, pages: 12 })
    const r2 = await syncLeaf(store, peer)
    expect(r2.errors).toEqual([])
    expect((await store.db.positions.get(`${bookId}:${peer.id}`))!.fraction).toBeGreaterThan(0)
    expect((await store.db.peers.get(peer.id))!.lastError).toBeFalsy()
  })

  it('reports battery and storage', async () => {
    const { store, peer } = await setup()
    await syncLeaf(store, peer)
    const p = (await store.db.peers.get(peer.id)) as Peer
    expect(p.leaf!.battery).toMatchObject({ available: true, percent: 82 })
    expect(p.leaf!.storage!.bookCount).toBe(1)
  })
})

describe('Leaf sync against firmware 1.0.0 (protocol 1)', () => {
  beforeEach(() => boot(1, { cors: true }))
  it('sends books with the password and imports device notes one way', async () => {
    const store = await freshStore()
    const r = await importBytes(store, 'f.epub', sample('frankenstein.epub'))
    const c = new LeafClient(url)
    const peer = await addLeafPeer(store, { ...(await c.hello()), url }, 'sagaleaf1')
    peer.leaf!.send[r.bookId!] = true
    const res = await syncLeaf(store, peer)
    expect(res.errors).toEqual([])
    const leafId = peer.leaf!.map[r.bookId!]
    expect(existsSync(join(dev.root, 'books', leafId, 'original.txt'))).toBe(true)
    await dev.turn(leafId, 2); await dev.highlightOnPage(leafId, 'from the device')
    const res2 = await syncLeaf(store, peer)
    expect(res2.applied).toBe(1)
    const a = (await store.db.annotations.toArray())[0]
    expect(a.note).toBe('from the device'); expect(a.orphaned).toBeFalsy()
    expect((await syncLeaf(store, peer)).applied).toBe(0)
  })
})
