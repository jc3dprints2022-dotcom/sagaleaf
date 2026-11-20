// Account sync: one row per book in the user's own table (Supabase
// public.saga_sync, row-level security: user_id = auth.uid()), holding that
// book's entry (title, author, cover thumbnail, where to get the file again),
// highlights, notes, bookmarks and reading positions. Signing in with the same
// account on another device is all it takes; there is no code or passphrase.
// Rows are protected by Supabase auth, row-level security and HTTPS. They are
// not end-to-end encrypted. Book files are never uploaded.
//
// Pull merges rows field by field (newest clock wins; concurrent note edits are
// kept as conflicts). Push uploads a book only when its content changed since
// the copy last seen on the server, so a book's row always holds the merged state.
// Rows written by the earlier, encrypted version ({ v: 1, box }) are skipped on
// pull and replaced by the next push of that book.
import type { Store } from '../store'
import type { Clocked } from '../db'
import type { Book } from '../types'
import { sortKey, tintOf } from '../util'

export interface PlainData { v: 2; payload: BookPayload }
export type RowData = PlainData | { v: 1; [k: string]: unknown }
export interface CloudRow { book_id: string; data: RowData; updated_at: string }
export interface CloudApi {
  list(since?: string): Promise<CloudRow[]>
  get(bookId: string): Promise<CloudRow | null>
  upsert(rows: { book_id: string; data: RowData; updated_at: string }[]): Promise<void>
}
/** What another device needs to show a book and, if it has a source, fetch the file. */
export interface BookEntry {
  title: string; author: string
  format?: Book['format']; size?: number; hash?: string; language?: string; addedAt?: number
  source?: Book['source']; catalogId?: string; sourceUrl?: string; license?: string
  cover?: string            // small data: URL thumbnail (only for files that came from a user's own import)
  deleted?: boolean
}
export interface BookPayload { v: 1; book?: BookEntry; annotations: Clocked<Record<string, unknown>>[]; positions: Clocked<Record<string, unknown>>[] }

/** Legacy marker row of the encrypted version; never read or written now. */
export const KEY_ROW = '_saga_key_check'
const MARGIN_MS = 10 * 60_000    // tolerate clock differences between devices when asking "what changed since"
export type CoverMaker = (cover: { data: Uint8Array; type: string }) => Promise<string | undefined>

export class CloudSync {
  /** Called after a pull with remote books that have a source and no file on this device. */
  onRemoteBooks?: (ids: string[]) => void
  constructor(private store: Store, private api: CloudApi, private makeCover: CoverMaker = defaultCover) {}

  async entry(bookId: string, withCover: boolean): Promise<BookEntry | undefined> {
    const b = await this.store.db.books.get(bookId)
    if (!b) return (await this.store.getMeta<Record<string, BookEntry>>('cloudBooks', {}))[bookId]
    const e: BookEntry = { title: b.title, author: b.author, format: b.format, size: b.size, hash: b.hash, language: b.language, addedAt: b.addedAt, source: b.source, catalogId: b.catalogId, sourceUrl: b.sourceUrl, license: b.license }
    if (b.deleted) e.deleted = true
    if (withCover && !b.catalogId && !b.sourceUrl && b.fileState === 'local') {
      const c = await this.store.db.covers.get(bookId)
      if (c) e.cover = await this.makeCover(c).catch(() => undefined)
    }
    return JSON.parse(JSON.stringify(e)) as BookEntry
  }

  async payload(bookId: string, withCover = false): Promise<BookPayload> {
    const anns = await this.store.db.annotations.where('bookId').equals(bookId).toArray() as unknown as Clocked<Record<string, unknown>>[]
    const pos = await this.store.db.positions.where('bookId').equals(bookId).toArray() as unknown as Clocked<Record<string, unknown>>[]
    const strip = (r: Clocked<Record<string, unknown>>) => { const { conflicts: _drop, ...rest } = r as Record<string, unknown>; return rest as Clocked<Record<string, unknown>> }
    const byId = (a: Clocked<Record<string, unknown>>, b: Clocked<Record<string, unknown>>) => String(a.id) < String(b.id) ? -1 : 1
    const book = await this.entry(bookId, withCover)
    return { v: 1, ...(book ? { book } : {}), annotations: anns.filter(a => a._c).map(strip).sort(byId), positions: pos.filter(p => p._c).sort(byId) }
  }
  /** Changes whenever any field, note version or book detail changes. */
  static digest(p: BookPayload) {
    const part = (r: Clocked<Record<string, unknown>>) => `${r.id}|${Object.values(r._c ?? {}).sort().at(-1) ?? ''}|${Object.keys((r as { _heads?: object })._heads ?? {}).sort().join(',')}|${((r as { _sup?: string[] })._sup ?? []).length}`
    const b = p.book ? [p.book.title, p.book.author, p.book.catalogId, p.book.sourceUrl, p.book.deleted ? 'x' : ''].join('~') : ''
    return `${b}#${p.annotations.length}/${p.positions.length}:` + [...p.annotations, ...p.positions].map(part).join(';')
  }

  private async seen() { return this.store.getMeta<Record<string, string>>('cloudSeen', {}) }
  private async localBookIds() {
    const ids = new Set<string>()
    await this.store.db.books.each(b => { if (!b.deleted) ids.add(b.id) })
    await this.store.db.annotations.each(a => { ids.add(a.bookId) })
    await this.store.db.positions.each(p => { ids.add(p.bookId) })
    return ids
  }

  /** A book another device added: shown here as "on your other device" (or fetched by source). */
  private async addRemoteBook(id: string, e: BookEntry): Promise<boolean> {
    const have = await this.store.db.books.get(id)
    if (have) return false
    if (e.deleted) return false
    const title = e.title || 'Untitled', author = e.author || 'Unknown author'
    let hasCover = false
    if (e.cover?.startsWith('data:')) {
      try { const m = /^data:([^;,]+);base64,(.*)$/.exec(e.cover); if (m) { await this.store.db.covers.put({ bookId: id, type: m[1], data: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) }); hasCover = true } } catch { /* no cover */ }
    }
    await this.store.db.books.put({
      id, hash: e.hash ?? id, format: e.format ?? 'epub', title, author, sortTitle: sortKey(title), language: e.language, subjects: [], identifiers: [], size: e.size ?? 0,
      addedAt: e.addedAt ?? Date.now(), source: e.source ?? 'import', catalogId: e.catalogId, sourceUrl: e.sourceUrl, license: e.license, hasCover, tint: tintOf(title + author),
      fileState: 'remote', status: 'new', indexed: false, sections: 0, chars: 0,
    } as Clocked<Book>)
    return true
  }

  /** Merge rows changed on the server since the last pull. */
  async pull(): Promise<{ books: number; changed: number; unreadable: number; added: string[] }> {
    const last = await this.store.getMeta<string | null>('cloudLastPull', null)
    const since = last ? new Date(new Date(last).getTime() - MARGIN_MS).toISOString() : undefined
    const rows = await this.api.list(since)
    const seen = await this.seen()
    const titles = await this.store.getMeta<Record<string, BookEntry>>('cloudBooks', {})
    let changed = 0, unreadable = 0, books = 0, newest = last ?? ''
    const added: string[] = []
    for (const row of rows) {
      if (row.updated_at > newest) newest = row.updated_at
      if (row.book_id === KEY_ROW) continue
      const p = row.data && (row.data as PlainData).v === 2 ? (row.data as PlainData).payload : null
      if (!p || !Array.isArray(p.annotations) || !Array.isArray(p.positions)) { unreadable++; continue }   // an older encrypted row: replaced by the next push
      books++
      if (p.book?.title) { titles[row.book_id] = p.book; if (await this.addRemoteBook(row.book_id, p.book)) added.push(row.book_id) }
      changed += await this.store.mergeSnapshot('annotation', p.annotations)
      changed += await this.store.mergeSnapshot('position', p.positions)
      seen[row.book_id] = CloudSync.digest({ v: 1, book: p.book, annotations: p.annotations.slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : 1), positions: p.positions.slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : 1) })
    }
    await this.store.setMeta('cloudSeen', seen)
    await this.store.setMeta('cloudBooks', titles)
    if (newest) await this.store.setMeta('cloudLastPull', newest)
    if (added.length) { this.store.emit('books', 'covers'); this.onRemoteBooks?.(added) }
    return { books, changed, unreadable, added }
  }

  /** Upload every book whose local state differs from the server's copy. */
  async push(): Promise<number> {
    const seen = await this.seen()
    const rows: { book_id: string; data: RowData; updated_at: string }[] = []
    const digests: Record<string, string> = {}
    for (const id of await this.localBookIds()) {
      const light = await this.payload(id)
      const d = CloudSync.digest(light)
      if (seen[id] === d) continue
      const p = await this.payload(id, true)
      rows.push({ book_id: id, data: { v: 2, payload: p }, updated_at: new Date().toISOString() })
      digests[id] = d
    }
    for (let i = 0; i < rows.length; i += 25) await this.api.upsert(rows.slice(i, i + 25))
    if (rows.length) await this.store.setMeta('cloudSeen', { ...seen, ...digests })
    return rows.length
  }

  async sync() { const pulled = await this.pull(); const pushed = await this.push(); return { ...pulled, pushed } }
}

/** A ~160px JPEG thumbnail as a data: URL (browser); in other environments only a cover that is already small. */
async function defaultCover(c: { data: Uint8Array; type: string }): Promise<string | undefined> {
  const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
  try {
    if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
      const bmp = await createImageBitmap(new Blob([c.data as BlobPart], { type: c.type }))
      const k = Math.min(1, 160 / bmp.width), cv = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)))
      cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
      const out = new Uint8Array(await (await cv.convertToBlob({ type: 'image/jpeg', quality: 0.7 })).arrayBuffer())
      return `data:image/jpeg;base64,${b64(out)}`
    }
  } catch { /* fall through */ }
  return c.data.length <= 24_000 ? `data:${c.type};base64,${b64(c.data)}` : undefined
}
