// Account sync (Supabase saga_sync rows): convergence, conflict safety, encryption.
import './node-dom'
import { describe, it, expect } from 'vitest'
import { freshStore } from './helpers'
import { CloudSync, KeyMismatch, KEY_ROW, type CloudApi, type CloudRow } from '../src/core/sync/cloud'
import { newLibrarySecret, deriveKeys } from '../src/core/sync/crypto'
import type { Annotation, Position } from '../src/core/types'

/** In-memory stand-in for the user's rows (what RLS would show one signed-in user). */
function fakeTable() {
  const rows = new Map<string, CloudRow>()
  let t = Date.now()
  const api: CloudApi = {
    async list(since) { return [...rows.values()].filter(r => !since || r.updated_at > since).map(r => structuredClone(r)) },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)!) : null },
    // the server's clock decides updated_at ordering, like a database default would
    async upsert(list) { for (const r of list) rows.set(r.book_id, { ...structuredClone(r), updated_at: new Date(++t).toISOString() }) },
  }
  return { rows, api }
}
const ann = (bookId: string, extra: Partial<Annotation> = {}): Partial<Annotation> => ({ bookId, kind: 'highlight', color: 'amber', exact: 'It is a truth universally acknowledged', prefix: '', suffix: '', start: 0, end: 38, section: 1, note: '', tags: [], createdAt: Date.now(), updatedAt: Date.now(), ...extra })

async function twoDevices() {
  const secret = newLibrarySecret()
  const keys = await deriveKeys(secret)
  const t = fakeTable()
  const a = await freshStore(undefined, 'Phone'), b = await freshStore(undefined, 'Laptop')
  return { t, a, b, ca: new CloudSync(a, t.api, keys), cb: new CloudSync(b, t.api, keys), secret }
}

describe('account sync', () => {
  it('moves highlights, notes, bookmarks and positions between devices, one row per book', async () => {
    const { t, a, b, ca, cb } = await twoDevices()
    await a.put<Annotation>('annotation', 'h1', ann('book1', { note: 'Famous opening' }))
    await a.put<Annotation>('annotation', 'bm', ann('book1', { kind: 'bookmark', exact: '' }))
    await a.put<Annotation>('annotation', 'h2', ann('book2'))
    await a.put<Position>('position', `book1:${a.deviceId}`, { bookId: 'book1', deviceId: a.deviceId, deviceName: 'Phone', section: 5, offset: 10, fraction: 0.3, snippet: 'x', at: a.clock.tick() })
    expect(await ca.sync()).toMatchObject({ pushed: 2 })
    expect([...t.rows.keys()].sort()).toEqual(['book1', 'book2'])
    await cb.sync()
    expect((await b.db.annotations.get('h1'))!.note).toBe('Famous opening')
    expect((await b.db.annotations.get('bm'))!.kind).toBe('bookmark')
    expect((await b.db.positions.get(`book1:${a.deviceId}`))!.fraction).toBe(0.3)
    // nothing changed: nothing uploaded again
    expect(await ca.sync()).toMatchObject({ pushed: 0 })
    expect(await cb.sync()).toMatchObject({ pushed: 0 })
  })

  it('stores only ciphertext', async () => {
    const { t, a, ca, secret } = await twoDevices()
    await a.put<Annotation>('annotation', 'p', ann('bk', { note: 'my private thought about Darcy' }))
    await ca.sync()
    const raw = JSON.stringify([...t.rows.values()])
    expect(raw).not.toContain('Darcy'); expect(raw).not.toContain('truth universally'); expect(raw).not.toContain(secret)
  })

  it('a row upload carries both devices’ changes (no device overwrites another)', async () => {
    const { a, b, ca, cb } = await twoDevices()
    await a.put<Annotation>('annotation', 'x', ann('bk')); await ca.sync(); await cb.sync()
    await a.put<Annotation>('annotation', 'x', { color: 'rose' })
    await b.put<Annotation>('annotation', 'y', ann('bk', { start: 90, end: 99, exact: 'single man' }))
    await b.put<Annotation>('annotation', 'x', { tags: ['theme'] })
    await ca.sync(); await cb.sync(); await ca.sync()
    for (const s of [a, b]) {
      const x = (await s.db.annotations.get('x'))!
      expect(x.color).toBe('rose'); expect(x.tags).toEqual(['theme'])
      expect(await s.db.annotations.get('y')).toBeTruthy()
    }
  })

  it('never silently discards a note edited on two devices at once', async () => {
    const { a, b, ca, cb } = await twoDevices()
    await a.put<Annotation>('annotation', 'n', ann('bk', { note: 'first' })); await ca.sync(); await cb.sync()
    await a.put<Annotation>('annotation', 'n', { note: 'written on the phone' })
    await b.put<Annotation>('annotation', 'n', { note: 'written on the laptop' })
    await ca.sync(); await cb.sync(); await ca.sync(); await cb.sync()
    const na = (await a.db.annotations.get('n'))!, nb = (await b.db.annotations.get('n'))!
    expect(na.note).toBe(nb.note)
    const all = [na.note, ...(na.conflicts ?? []).map(c => c.note)].sort()
    expect(all).toEqual(['written on the laptop', 'written on the phone'])
    expect([nb.note, ...(nb.conflicts ?? []).map(c => c.note)].sort()).toEqual(all)
    // a later edit on top of the shown note settles it everywhere
    await b.put<Annotation>('annotation', 'n', { note: 'merged', noteResolved: (nb.conflicts ?? []).map(c => c.at) })
    await cb.sync(); await ca.sync()
    expect((await a.db.annotations.get('n'))!.note).toBe('merged')
    expect((await a.db.annotations.get('n'))!.conflicts ?? []).toEqual([])
  })

  it('an edit beats a delete that had not seen it; the newer action wins either way', async () => {
    const { a, b, ca, cb } = await twoDevices()
    await a.put<Annotation>('annotation', 'd', ann('bk')); await ca.sync(); await cb.sync()
    await a.remove('annotation', 'd')
    await b.put<Annotation>('annotation', 'd', { note: 'added a note offline' })
    await ca.sync(); await cb.sync(); await ca.sync()
    for (const s of [a, b]) { const d = (await s.db.annotations.get('d'))!; expect(d.deleted).toBeFalsy(); expect(d.note).toBe('added a note offline') }
  })

  it('refuses a different library code instead of mixing libraries', async () => {
    const { t, ca } = await twoDevices()
    expect(await ca.verifyKey()).toBe('created')
    expect(await ca.verifyKey()).toBe('matched')
    const other = new CloudSync(await freshStore(), t.api, await deriveKeys(newLibrarySecret()))
    await expect(other.verifyKey()).rejects.toBeInstanceOf(KeyMismatch)
    expect(t.rows.has(KEY_ROW)).toBe(true)
  })
})
