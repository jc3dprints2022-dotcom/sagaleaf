// Account sync: one row per book in the user's own table (Supabase
// public.saga_sync, row-level security), holding that book's highlights, notes,
// bookmarks and reading positions. Rows are sealed on this device with the
// library code's key (AES-GCM, same scheme as relay sync), so the service
// stores ciphertext only. Book files are never uploaded.
//
// Pull merges rows field by field (newest clock wins; concurrent note edits are
// kept as conflicts). Push uploads a book only when its content changed since
// the copy last seen on the server, so a book's row always holds the merged state.
import type { Store } from '../store'
import type { Clocked } from '../db'
import { sealJson, openJson, type LibraryKeys } from './crypto'

export interface CloudRow { book_id: string; data: SealedData; updated_at: string }
export interface SealedData { v: 1; alg: 'AES-GCM-256'; lib: string; box: string }
export interface CloudApi {
  list(since?: string): Promise<CloudRow[]>
  get(bookId: string): Promise<CloudRow | null>
  upsert(rows: { book_id: string; data: SealedData; updated_at: string }[]): Promise<void>
}
interface BookPayload { v: 1; book?: { title: string; author: string }; annotations: Clocked<Record<string, unknown>>[]; positions: Clocked<Record<string, unknown>>[] }

export const KEY_ROW = '_saga_key_check'
const MARGIN_MS = 10 * 60_000    // tolerate clock differences between devices when asking "what changed since"
export class KeyMismatch extends Error { constructor() { super('That library code doesn’t match the one used on your other devices.') } }

export class CloudSync {
  constructor(private store: Store, private api: CloudApi, private keys: LibraryKeys) {}
  private seal = async (v: unknown): Promise<SealedData> => ({ v: 1, alg: 'AES-GCM-256', lib: this.keys.libraryId.slice(0, 8), box: await sealJson(this.keys, v) })

  /** First use on an account stores a key check; later devices must hold the same library code. */
  async verifyKey() {
    const row = await this.api.get(KEY_ROW)
    if (!row) { await this.api.upsert([{ book_id: KEY_ROW, data: await this.seal({ check: 'saga-reader' }), updated_at: new Date().toISOString() }]); return 'created' as const }
    try { const v = await openJson<{ check: string }>(this.keys, row.data.box); if (v.check !== 'saga-reader') throw new Error() } catch { throw new KeyMismatch() }
    return 'matched' as const
  }

  async payload(bookId: string): Promise<BookPayload> {
    const anns = await this.store.db.annotations.where('bookId').equals(bookId).toArray() as unknown as Clocked<Record<string, unknown>>[]
    const pos = await this.store.db.positions.where('bookId').equals(bookId).toArray() as unknown as Clocked<Record<string, unknown>>[]
    const strip = (r: Clocked<Record<string, unknown>>) => { const { conflicts: _drop, ...rest } = r as Record<string, unknown>; return rest as Clocked<Record<string, unknown>> }
    const byId = (a: Clocked<Record<string, unknown>>, b: Clocked<Record<string, unknown>>) => String(a.id) < String(b.id) ? -1 : 1
    const b = await this.store.db.books.get(bookId)
    const known = b && !b.deleted ? { title: b.title, author: b.author } : (await this.store.getMeta<Record<string, { title: string; author: string }>>('cloudBooks', {}))[bookId]
    return { v: 1, ...(known ? { book: known } : {}), annotations: anns.filter(a => a._c).map(strip).sort(byId), positions: pos.filter(p => p._c).sort(byId) }
  }
  /** Changes whenever any field or note version changes. */
  static digest(p: BookPayload) {
    const part = (r: Clocked<Record<string, unknown>>) => `${r.id}|${Object.values(r._c ?? {}).sort().at(-1) ?? ''}|${Object.keys((r as { _heads?: object })._heads ?? {}).sort().join(',')}|${((r as { _sup?: string[] })._sup ?? []).length}`
    return `${p.annotations.length}/${p.positions.length}:` + [...p.annotations, ...p.positions].map(part).join(';')
  }

  private async seen() { return this.store.getMeta<Record<string, string>>('cloudSeen', {}) }
  private async localBookIds() {
    const ids = new Set<string>()
    await this.store.db.annotations.each(a => { ids.add(a.bookId) })
    await this.store.db.positions.each(p => { ids.add(p.bookId) })
    return ids
  }

  /** Merge rows changed on the server since the last pull. */
  async pull(): Promise<{ books: number; changed: number; unreadable: number }> {
    const last = await this.store.getMeta<string | null>('cloudLastPull', null)
    const since = last ? new Date(new Date(last).getTime() - MARGIN_MS).toISOString() : undefined
    const rows = await this.api.list(since)
    const seen = await this.seen()
    const titles = await this.store.getMeta<Record<string, { title: string; author: string }>>('cloudBooks', {})
    let changed = 0, unreadable = 0, books = 0, newest = last ?? ''
    for (const row of rows) {
      if (row.updated_at > newest) newest = row.updated_at
      if (row.book_id === KEY_ROW) continue
      let p: BookPayload
      try { p = await openJson<BookPayload>(this.keys, row.data.box) } catch { unreadable++; continue }
      books++
      if (p.book?.title) titles[row.book_id] = p.book
      changed += await this.store.mergeSnapshot('annotation', p.annotations ?? [])
      changed += await this.store.mergeSnapshot('position', p.positions ?? [])
      seen[row.book_id] = CloudSync.digest({ v: 1, annotations: (p.annotations ?? []).slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : 1), positions: (p.positions ?? []).slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : 1) })
    }
    await this.store.setMeta('cloudSeen', seen)
    await this.store.setMeta('cloudBooks', titles)
    if (newest) await this.store.setMeta('cloudLastPull', newest)
    return { books, changed, unreadable }
  }

  /** Upload every book whose local state differs from the server's copy. */
  async push(): Promise<number> {
    const seen = await this.seen()
    const rows: { book_id: string; data: SealedData; updated_at: string }[] = []
    const digests: Record<string, string> = {}
    for (const id of await this.localBookIds()) {
      const p = await this.payload(id)
      const d = CloudSync.digest(p)
      if (seen[id] === d) continue
      rows.push({ book_id: id, data: await this.seal(p), updated_at: new Date().toISOString() })
      digests[id] = d
    }
    for (let i = 0; i < rows.length; i += 25) await this.api.upsert(rows.slice(i, i + 25))
    if (rows.length) await this.store.setMeta('cloudSeen', { ...seen, ...digests })
    return rows.length
  }

  async sync() { const pulled = await this.pull(); const pushed = await this.push(); return { ...pulled, pushed } }
}
