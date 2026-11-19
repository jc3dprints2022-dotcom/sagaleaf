// Calibre library import. A Calibre library is a folder tree:
//   Calibre Library/
//     metadata.db                      (SQLite; not needed)
//     Jane Austen/
//       Pride and Prejudice (12)/
//         metadata.opf                 (title, author, series, …)
//         cover.jpg
//         Pride and Prejudice - Jane Austen.epub
// The reader picks the folder (or a zip of it). Each book folder is imported
// from its DRM-free EPUB, PDF or TXT, in that order of preference, with title
// and author from metadata.opf or, failing that, the folder names. Files with
// DRM are skipped and the reason is reported; nothing tries to remove it.
import { unzipSync } from 'fflate'
import type { Store } from './store'
import type { Book } from './types'
import { importBytes, type ImportResult } from './library'
import { yieldToUi } from './util'
import { PRODUCT } from '../app/product'

export interface TreeFile { path: string; read(): Promise<Uint8Array> }

export interface CalibreMeta { title?: string; author?: string; series?: string; seriesIndex?: number; language?: string; publisher?: string; description?: string; subjects?: string[]; identifiers?: string[] }
export interface CalibreBook { dir: string; opf?: TreeFile; files: TreeFile[] }
export interface CalibreResult { dir: string; title: string; author: string; status: 'added' | 'duplicate' | 'skipped'; bookId?: string; file?: string; reasons: string[] }

const BOOK_EXT = /\.(epub|pdf|txt)$/i
const OTHER_EBOOK = /\.(mobi|azw|azw3|azw4|kfx|prc|lit|lrf|fb2|djvu|cbz|cbr|cb7|docx|rtf|odt|htmlz|txtz|pdb|snb|tcr|kepub)$/i
const RANK = (p: string) => (/\.epub$/i.test(p) ? 0 : /\.pdf$/i.test(p) ? 1 : 2)

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** Files from a zip of a Calibre library (or of part of one). */
export function filesFromZip(zip: Uint8Array): TreeFile[] {
  const entries = unzipSync(zip, { filter: f => !f.name.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name) && (BOOK_EXT.test(f.name) || OTHER_EBOOK.test(f.name) || /(^|\/)metadata\.opf$/i.test(f.name)) })
  return Object.entries(entries).map(([path, data]) => ({ path, read: async () => data }))
}

/** True when a zip looks like a Calibre library rather than an EPUB. */
export function zipLooksLikeCalibre(zip: Uint8Array) {
  try {
    let opf = false, epubRoot = false
    unzipSync(zip, { filter: f => { if (/(^|\/)metadata\.opf$/i.test(f.name)) opf = true; if (f.name === 'mimetype' || f.name === 'META-INF/container.xml') epubRoot = true; return false } })
    return opf && !epubRoot
  } catch { return false }
}

/** Groups files by book folder. A folder is a book if it holds metadata.opf or an ebook file. */
export function groupCalibreBooks(files: TreeFile[]): CalibreBook[] {
  const byDir = new Map<string, CalibreBook>()
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const name = basename(path)
    const isOpf = /^metadata\.opf$/i.test(name)
    if (!isOpf && !BOOK_EXT.test(name) && !OTHER_EBOOK.test(name)) continue
    const dir = dirname(path)
    const b = byDir.get(dir) ?? byDir.set(dir, { dir, files: [] }).get(dir)!
    if (isOpf) b.opf = { ...f, path }; else b.files.push({ ...f, path })
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir))
}

/** Reads Calibre's metadata.opf (OPF 2 with calibre: meta names). */
export function parseCalibreOpf(src: string): CalibreMeta {
  // Calibre writes <?xml version='1.0' …?> with single quotes, which some XML parsers reject; the declaration adds nothing here.
  const doc = new DOMParser().parseFromString(src.replace(/^\uFEFF?\s*<\?xml[^>]*\?>/, ''), 'application/xml')
  const all = (n: string) => Array.from(doc.getElementsByTagName('*')).filter(e => (e.localName || e.tagName.split(':').pop()) === n)
  const txt = (e?: Element) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const creators = all('creator')
  const authors = creators.filter(c => { const r = c.getAttribute('opf:role') ?? c.getAttributeNS('http://www.idpf.org/2007/opf', 'role') ?? c.getAttribute('role'); return !r || r === 'aut' }).map(txt).filter(Boolean)
  const meta = (name: string) => all('meta').find(m => m.getAttribute('name') === name)?.getAttribute('content') ?? undefined
  const series = meta('calibre:series')
  const idx = Number(meta('calibre:series_index'))
  const out: CalibreMeta = {
    title: txt(all('title')[0]) || undefined,
    author: authors.length ? authors.slice(0, 3).join(' and ') : undefined,
    series: series || undefined, seriesIndex: series && Number.isFinite(idx) ? idx : undefined,
    language: txt(all('language')[0]) || undefined, publisher: txt(all('publisher')[0]) || undefined,
    description: txt(all('description')[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
    subjects: all('subject').map(txt).filter(Boolean).slice(0, 12),
    identifiers: all('identifier').flatMap(e => { const s = (e.getAttribute('opf:scheme') ?? e.getAttribute('scheme') ?? '').toLowerCase(); const v = txt(e); return !v || s === 'calibre' ? [] : s && s !== 'uuid' ? [`${s}:${v}`] : [v] }),
  }
  if (out.author === 'Unknown') out.author = undefined
  return out
}

/** "Jane Austen/Pride and Prejudice (12)" → title and author from Calibre's folder names. */
export function metaFromFolders(dir: string): { title?: string; author?: string } {
  const parts = dir.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1]
  if (!leaf) return {}
  const title = leaf.replace(/\s*\(\d+\)$/, '').trim()
  const author = parts.length >= 2 ? parts[parts.length - 2].trim() : undefined
  return { title: title || undefined, author: author && author !== 'Unknown' ? author : undefined }
}

export async function importCalibre(store: Store, files: TreeFile[], onProgress?: (done: number, total: number, last: CalibreResult) => void): Promise<CalibreResult[]> {
  const books = groupCalibreBooks(files)
  const out: CalibreResult[] = []
  for (let i = 0; i < books.length; i++) {
    const r = await importOne(store, books[i])
    out.push(r)
    onProgress?.(i + 1, books.length, r)
    await yieldToUi()
  }
  return out
}

async function importOne(store: Store, b: CalibreBook): Promise<CalibreResult> {
  let meta: CalibreMeta = {}
  if (b.opf) { try { meta = parseCalibreOpf(new TextDecoder().decode(await b.opf.read())) } catch { /* fall back to folder names */ } }
  const folder = metaFromFolders(b.dir)
  const title = meta.title ?? folder.title ?? 'Untitled', author = meta.author ?? folder.author ?? 'Unknown author'
  const res: CalibreResult = { dir: b.dir, title, author, status: 'skipped', reasons: [] }
  const usable = b.files.filter(f => BOOK_EXT.test(f.path)).sort((x, y) => RANK(x.path) - RANK(y.path))
  const other = b.files.filter(f => !BOOK_EXT.test(f.path))
  if (!usable.length) {
    res.reasons.push(other.length
      ? `Only ${[...new Set(other.map(f => f.path.split('.').pop()!.toUpperCase()))].join(', ')} here. ${PRODUCT.shortName} opens EPUB, PDF and TXT; if the book is DRM-free, convert it to EPUB in Calibre first.`
      : 'No book file in this folder.')
    return res
  }
  const extra: Partial<Book> = { title, author }
  for (const k of ['series', 'seriesIndex', 'language', 'publisher', 'description'] as const) if (meta[k] != null) (extra as Record<string, unknown>)[k] = meta[k]
  if (meta.subjects?.length) extra.subjects = meta.subjects
  if (meta.identifiers?.length) extra.identifiers = meta.identifiers
  for (const f of usable) {
    let r: ImportResult
    try { r = await importBytes(store, basename(f.path), await f.read(), extra) }
    catch (e) { r = { name: f.path, status: 'failed', error: (e as Error).message } }
    if (r.status === 'failed') { res.reasons.push(`${basename(f.path)}: ${r.error}`); continue }
    res.status = r.status === 'duplicate' ? 'duplicate' : 'added'
    res.bookId = r.bookId; res.file = basename(f.path)
    return res
  }
  return res
}
