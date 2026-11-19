// Library operations: import, dedupe, delete, export/backup, restore, search.
import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import type { Store } from './store'
import type { Annotation, Book, Collection, Format, Member, Position } from './types'
import { parseEpub, extractEpubText, isZip, sectionTextOf } from './epub'
import { parseTxt, chapterXhtml } from './txt'
import { parsePdf, renderPdfCover } from './pdf'
import { sha256, sortKey, tintOf, workKey, yieldToUi, norm } from './util'
import type { TextRow } from './db'
import { PRODUCT } from '../app/product'

export type ImportStatus = 'added' | 'duplicate' | 'restored' | 'failed'
export interface ImportResult { name: string; status: ImportStatus; bookId?: string; title?: string; error?: string; possibleDuplicateOf?: string[]; ms?: number }

export function detectFormat(name: string, b: Uint8Array): Format | { error: string } {
  const lower = name.toLowerCase()
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'
  if (isZip(b)) {
    if (/\.(cbz|cbr)$/.test(lower)) return { error: 'Comic archives aren’t supported yet.' }
    if (/\.(docx|odt|pages)$/.test(lower)) return { error: 'Word-processor files aren’t ebooks. Export to EPUB first.' }
    return 'epub'
  }
  if (/\.(mobi|azw3?|kfx|prc)$/.test(lower)) return { error: 'Kindle formats aren’t supported yet. If the book is DRM-free, convert it to EPUB with Calibre.' }
  if (/\.(acsm)$/.test(lower)) return { error: `This is a download ticket for a DRM-protected book, not the book itself. ${PRODUCT.shortName} can’t open DRM-protected books.` }
  if (/\.(txt|text|md)$/.test(lower) || isProbablyText(b)) return 'txt'
  return { error: `${PRODUCT.shortName} can open EPUB, PDF and plain-text files. This file isn’t one of those.` }
}
function isProbablyText(b: Uint8Array) {
  const n = Math.min(b.length, 4096); let bad = 0
  for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32)) bad++ }
  return n > 0 && bad / n < 0.01
}

export const DRM_MESSAGE = `This book is DRM-protected. ${PRODUCT.shortName} doesn’t remove DRM, so it can’t be opened.`

/** PDFs locked with Adobe DRM (ADEPT/"EBX") or Adobe LiveCycle policy server.
 *  Detection only: SAGA refuses them, it never tries to open them. */
export function isDrmPdf(b: Uint8Array) {
  return indexOfAscii(b, '/EBX_HANDLER') >= 0 || indexOfAscii(b, '/Adobe.APS') >= 0
}
function indexOfAscii(b: Uint8Array, needle: string) {
  const n = Array.from(needle, c => c.charCodeAt(0)), first = n[0]
  for (let i = b.indexOf(first); i >= 0 && i <= b.length - n.length; i = b.indexOf(first, i + 1)) {
    let j = 1
    while (j < n.length && b[i + j] === n[j]) j++
    if (j === n.length) return i
  }
  return -1
}

export async function importBytes(store: Store, name: string, bytes: Uint8Array, extra: Partial<Book> = {}): Promise<ImportResult> {
  const t0 = performance.now()
  const fmt = detectFormat(name, bytes)
  if (typeof fmt !== 'string') return { name, status: 'failed', error: fmt.error }
  const hash = await sha256(bytes)
  const id = hash.slice(0, 16)
  const existing = await store.db.books.get(id)
  if (existing && !existing.deleted && existing.fileState === 'local') return { name, status: 'duplicate', bookId: id, title: existing.title }

  let meta: Partial<Book> = {}
  let texts: { section: number; title: string; text: string }[] = []
  let cover: { data: Uint8Array; type: string } | null = null
  try {
    if (fmt === 'epub') {
      const p = parseEpub(bytes)
      if (p.drm) return { name, status: 'failed', error: DRM_MESSAGE }
      texts = extractEpubText(bytes, p)
      meta = { title: p.title, author: p.author, language: p.language, publisher: p.publisher, description: p.description, published: p.published, series: p.series, seriesIndex: p.seriesIndex, subjects: p.subjects.slice(0, 12), identifiers: p.identifiers }
      cover = p.cover ?? null
    } else if (fmt === 'pdf') {
      if (isDrmPdf(bytes)) return { name, status: 'failed', error: DRM_MESSAGE }
      const p = await parsePdf(bytes)
      texts = p.pages
      meta = { title: p.title || cleanName(name), author: p.author || 'Unknown author' }
      const c = await renderPdfCover(bytes)
      if (c) cover = { data: c, type: 'image/jpeg' }
    } else {
      const p = parseTxt(bytes, name)
      // stored text = exactly what the rendered chapter's body.textContent will be
      texts = p.chapters.map((c, i) => ({ section: i, title: c.title, text: sectionTextOf(chapterXhtml(c)) }))
      meta = { title: p.title ?? cleanName(name), author: p.author ?? 'Unknown author' }
    }
  } catch (e) {
    return { name, status: 'failed', error: friendly(e) }
  }
  if (!texts.some(t => t.text.trim())) {
    if (fmt === 'pdf') return { name, status: 'failed', error: `This PDF has no selectable text (it’s probably scanned images). ${PRODUCT.shortName} can’t read it yet.` }
    return { name, status: 'failed', error: 'No readable text was found in this file.' }
  }

  // Metadata the caller already knows (a Calibre library's metadata.opf) wins over the file's own.
  const title = (extra.title || meta.title || cleanName(name)).trim()
  const author = (extra.author || meta.author || 'Unknown author').trim()
  const wk = workKey(title, author)
  const others = (await store.db.books.where('sortTitle').equals(sortKey(title)).toArray())
    .filter(b => b.id !== id && !b.deleted && workKey(b.title, b.author) === wk)

  const book: Book = {
    id, hash, format: fmt, title, author, sortTitle: sortKey(title), subjects: [], identifiers: [],
    ...meta, ...extra,
    size: bytes.length, addedAt: existing?.addedAt ?? Date.now(), source: extra.source ?? 'import',
    hasCover: !!cover, tint: tintOf(title + author), fileState: 'local', status: existing?.status ?? 'new',
    indexed: true, sections: texts.length, chars: texts.reduce((n, t) => n + t.text.length, 0), filename: name,
  } as Book

  // File, cover and text land first; the book record (which makes the book
  // visible and replicates) is written last. A crash in between leaves only
  // unreferenced rows, which `sweepOrphans` removes.
  await store.db.transaction('rw', [store.db.files, store.db.covers, store.db.texts], async () => {
    await store.db.files.put({ hash, data: bytes, type: mime(fmt), size: bytes.length })
    if (cover) await store.db.covers.put({ bookId: id, ...cover })
    await store.db.texts.where('bookId').equals(id).delete()
    await store.db.texts.bulkPut(texts.map(t => ({ bookId: id, section: t.section, title: t.title, text: t.text })))
  })
  const fields: Partial<Book> & { deleted?: boolean } = { ...book }
  if (existing?.deleted) fields.deleted = false
  await store.put<Book>('book', id, fields)
  store.emit('files', 'covers')
  return {
    name, status: existing?.deleted ? 'restored' : existing ? 'restored' : 'added', bookId: id, title,
    possibleDuplicateOf: others.length ? others.map(o => o.id) : undefined, ms: Math.round(performance.now() - t0),
  }
}

export async function importFiles(store: Store, files: File[], onProgress?: (done: number, total: number, last: ImportResult) => void) {
  const results: ImportResult[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    let r: ImportResult
    try { r = await importBytes(store, f.name, new Uint8Array(await f.arrayBuffer())) }
    catch (e) { r = { name: f.name, status: 'failed', error: friendly(e) } }
    results.push(r)
    onProgress?.(i + 1, files.length, r)
    if (i % 4 === 3) await yieldToUi()
  }
  return results
}

const cleanName = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled'
const mime = (f: Format) => (f === 'epub' ? 'application/epub+zip' : f === 'pdf' ? 'application/pdf' : 'text/plain')
const friendly = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e)
  if (/password/i.test(m)) return 'This PDF is password-protected.'
  if (/Invalid PDF|FormatError/i.test(m)) return 'This PDF is damaged and couldn’t be read.'
  return m.length < 200 ? m : 'This file couldn’t be read.'
}

export async function bookTexts(store: Store, bookId: string): Promise<TextRow[]> {
  return store.db.texts.where('bookId').equals(bookId).sortBy('section')
}

export async function removeBook(store: Store, bookId: string) {
  const b = await store.db.books.get(bookId)
  if (!b) return
  await store.remove('book', bookId)
  await store.db.transaction('rw', [store.db.files, store.db.covers, store.db.texts, store.db.books], async () => {
    const sameHash = (await store.db.books.where('hash').equals(b.hash).toArray()).filter(x => !x.deleted)
    if (!sameHash.length) await store.db.files.delete(b.hash)
    await store.db.covers.delete(bookId)
    await store.db.texts.where('bookId').equals(bookId).delete()
  })
  store.emit('files')
}

/** Remove file/text rows that no live book references (e.g. after a crash mid-import). */
export async function sweepOrphans(store: Store) {
  const live = new Set((await store.db.books.toArray()).filter(b => !b.deleted).map(b => b.hash))
  const liveIds = new Set((await store.db.books.toArray()).filter(b => !b.deleted).map(b => b.id))
  let n = 0
  for (const k of await store.db.files.toCollection().primaryKeys()) if (!live.has(k as string)) { await store.db.files.delete(k as string); n++ }
  const textKeys = await store.db.texts.toCollection().primaryKeys()
  const dead = textKeys.filter(k => !liveIds.has((k as [string, number])[0]))
  if (dead.length) { await store.db.texts.bulkDelete(dead as [string, number][]); n += dead.length }
  return n
}

/** Merge a probable duplicate into the book being kept: annotations move over
 *  and are re-anchored by their quoted text the next time the book opens. */
export async function mergeDuplicate(store: Store, keepId: string, dropId: string) {
  const anns = await store.db.annotations.where('bookId').equals(dropId).toArray()
  for (const a of anns) {
    if (a.deleted) continue
    const { _c, ...rest } = a
    void _c
    await store.put<Annotation>('annotation', a.id + '-m', { ...rest, id: a.id + '-m', bookId: keepId, section: -1, orphaned: false, updatedAt: Date.now() })
  }
  const mems = await store.db.members.where('bookId').equals(dropId).toArray()
  for (const m of mems) if (!m.deleted) await store.put<Member>('member', `${m.collectionId}:${keepId}`, { collectionId: m.collectionId, bookId: keepId })
  await removeBook(store, dropId)
}

// ---------------------------------------------------------------- search
export interface Hit { bookId: string; section: number; start: number; end: number; before: string; match: string; after: string }

/** Passage search inside one book or across the library, from the local text
 *  index, so it works offline and without opening the book. */
export async function searchText(store: Store, query: string, opts: { bookId?: string; limit?: number; signal?: { aborted: boolean } } = {}): Promise<Hit[]> {
  const q = norm(query).replace(/\s+/g, ' ').trim()
  if (q.length < 2) return []
  const limit = opts.limit ?? 200
  const hits: Hit[] = []
  const coll = opts.bookId ? store.db.texts.where('bookId').equals(opts.bookId) : store.db.texts.toCollection()
  const live = opts.bookId ? null : new Set((await store.db.books.toArray()).filter(b => !b.deleted).map(b => b.id))
  await coll.until(() => hits.length >= limit || !!opts.signal?.aborted).each(row => {
    if (live && !live.has(row.bookId)) return
    const hay = norm(row.text)
    // norm() can change length (ligatures, decomposition); fall back to a slow path only then.
    const same = hay.length === row.text.length
    let i = hay.indexOf(q)
    let perSection = 0
    while (i >= 0 && hits.length < limit && perSection < 50) {
      const start = same ? i : approxIndex(row.text, q, i)
      const end = start + query.trim().length
      hits.push({ bookId: row.bookId, section: row.section, start, end, before: row.text.slice(Math.max(0, start - 60), start).replace(/\s+/g, ' '), match: row.text.slice(start, end), after: row.text.slice(end, end + 80).replace(/\s+/g, ' ') })
      perSection++
      i = hay.indexOf(q, i + q.length)
    }
  })
  return hits.sort((a, b) => (a.bookId === b.bookId ? a.section - b.section || a.start - b.start : 0))
}
function approxIndex(text: string, q: string, guess: number) {
  const lo = Math.max(0, guess - 50)
  const win = norm(text.slice(lo, guess + q.length + 100))
  const j = win.indexOf(q)
  return j >= 0 ? lo + j : guess
}

// ---------------------------------------------------------------- export
const strip = <T extends object>(r: T) => { const { _c, ...rest } = r as T & { _c?: unknown }; void _c; return rest }

export async function exportLibrary(store: Store, opts: { includeFiles?: boolean } = {}): Promise<Uint8Array> {
  const books = (await store.db.books.toArray()).filter(b => !b.deleted)
  const annotations = (await store.db.annotations.toArray()).map(strip)
  const positions = (await store.db.positions.toArray()).map(strip)
  const collections = (await store.db.collections.toArray()).filter(c => !c.deleted).map(strip)
  const members = (await store.db.members.toArray()).filter(m => !m.deleted).map(strip)
  const files: Record<string, Uint8Array> = {}
  const manifest = {
    format: 'saga-library', version: 1, exportedAt: new Date().toISOString(), device: store.deviceName,
    books: books.map(b => ({ ...strip(b), file: opts.includeFiles === false || b.fileState !== 'local' ? null : `books/${b.hash}.${b.format}` })),
    annotations, positions, collections, members,
  }
  files['library.json'] = strToU8(JSON.stringify(manifest, null, 1))
  files['annotations.md'] = strToU8(annotationsMarkdown(books, annotations as Annotation[]))
  files['annotations.jsonld'] = strToU8(JSON.stringify(webAnnotations(books, annotations as Annotation[]), null, 1))
  files['README.txt'] = strToU8(`${PRODUCT.name} library export.\n\nbooks/ holds your original files, unchanged.\nannotations.md is a readable copy of your highlights and notes.\nannotations.jsonld uses the W3C Web Annotation model so other tools can import it.\nlibrary.json holds everything ${PRODUCT.shortName} needs to restore this library.\n`)
  if (opts.includeFiles !== false) {
    for (const b of books) {
      if (b.fileState !== 'local') continue
      const f = await store.db.files.get(b.hash)
      if (f) files[`books/${b.hash}.${b.format}`] = f.data
    }
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.startsWith('books/') ? 0 : 6 }]])) as never)
}

export async function importBackup(store: Store, zip: Uint8Array, onProgress?: (d: number, t: number) => void) {
  const files = unzipSync(zip)
  if (!files['library.json']) throw new Error(`This isn’t a ${PRODUCT.shortName} library export (library.json is missing).`)
  const m = JSON.parse(strFromU8(files['library.json']))
  let books = 0, annotations = 0
  const list = m.books as (Book & { file: string | null })[]
  for (let i = 0; i < list.length; i++) {
    const b = list[i]
    if (b.file && files[b.file]) {
      const r = await importBytes(store, b.filename ?? `${b.title}.${b.format}`, files[b.file], { source: b.source, catalogId: b.catalogId, license: b.license })
      if (r.status !== 'failed') books++
    }
    const { file, ...rest } = b; void file
    const live = await store.db.books.get(b.id)
    await store.put<Book>('book', b.id, { ...rest, fileState: live?.fileState ?? 'remote', indexed: live?.indexed ?? false })
    onProgress?.(i + 1, list.length)
  }
  for (const a of m.annotations as Annotation[]) { await store.put<Annotation>('annotation', a.id, a); annotations++ }
  for (const p of m.positions as Position[]) if (p.deviceId === store.deviceId || !(await store.db.positions.get(p.id))) await store.put<Position>('position', p.id, p)
  for (const c of m.collections as Collection[]) await store.put<Collection>('collection', c.id, c)
  for (const mm of m.members as Member[]) await store.put<Member>('member', mm.id, mm)
  return { books, annotations }
}

export function annotationsMarkdown(books: Book[], anns: Annotation[]) {
  const live = anns.filter(a => !a.deleted)
  let out = '# Highlights and notes\n\n'
  for (const b of books) {
    const mine = live.filter(a => a.bookId === b.id && a.kind !== 'bookmark').sort((x, y) => x.fraction - y.fraction)
    if (!mine.length) continue
    out += `## ${b.title}\n*${b.author}*\n\n`
    for (const a of mine) {
      out += `> ${a.exact.replace(/\s+/g, ' ').trim()}\n\n`
      if (a.note) out += `${a.note}\n\n`
      for (const c of a.conflicts ?? []) out += `*(Also written on another device: ${c.note})*\n\n`
      out += `— ${a.label || 'Location'} · ${Math.round(a.fraction * 100)}%${a.tags?.length ? ' · ' + a.tags.map(t => '#' + t).join(' ') : ''}\n\n`
    }
  }
  return out
}

export function webAnnotations(books: Book[], anns: Annotation[]) {
  const byId = new Map(books.map(b => [b.id, b]))
  return {
    '@context': 'http://www.w3.org/ns/anno.jsonld', type: 'AnnotationCollection',
    items: anns.filter(a => !a.deleted && byId.has(a.bookId)).map(a => ({
      id: `urn:saga:annotation:${a.id}`, type: 'Annotation', created: new Date(a.createdAt).toISOString(), modified: new Date(a.updatedAt).toISOString(),
      motivation: a.kind === 'bookmark' ? 'bookmarking' : a.note ? 'commenting' : 'highlighting',
      body: a.note ? [{ type: 'TextualBody', value: a.note, format: 'text/plain' }] : undefined,
      target: {
        source: `urn:sha256:${byId.get(a.bookId)!.hash}`, title: byId.get(a.bookId)!.title,
        selector: [
          { type: 'TextQuoteSelector', exact: a.exact, prefix: a.prefix, suffix: a.suffix },
          { type: 'TextPositionSelector', start: a.start, end: a.end, refinedBy: undefined, section: a.section },
          ...(a.cfi ? [{ type: 'FragmentSelector', conformsTo: 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html', value: a.cfi }] : []),
        ],
      },
    })),
  }
}
