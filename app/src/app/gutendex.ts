// Discover: free public-domain books from Project Gutenberg, listed through the
// Gutendex API (https://gutendex.com). Getting a book downloads its file once
// and imports it like any other book, so it then works offline and is a normal
// DRM-free file. The last Popular page is cached so Discover opens with books
// even offline.
import { importBytes } from '../core/library'
import { store } from './state'

export const GUTENDEX = 'https://gutendex.com'

// Gutendex and Project Gutenberg don't allow browser (CORS) requests, so every
// request to them goes through SAGA's read-only proxy.
export const PROXY = 'https://uxlvtbqmhcheklazboxr.supabase.co/functions/v1/gutenberg-proxy?url='
const PROXIED_HOSTS = /^https?:\/\/(gutendex\.com|(www\.)?gutenberg\.org|gutenberg\.pglaf\.org|aleph\.gutenberg\.org)\//i
/** The URL to actually fetch: Gutendex/Gutenberg URLs are wrapped in the proxy, anything else is unchanged. */
/** Wraps any URL in the proxy. Also used for Standard Ebooks' Atom feed, which sends no CORS header. */
export const withProxy = (url: string) => PROXY + encodeURIComponent(url)
export const viaProxy = (url: string) => PROXIED_HOSTS.test(url) ? withProxy(url) : url
const proxiedFetch = (url: string, init?: RequestInit) => fetch(viaProxy(url), init)
export interface GPerson { name: string; birth_year: number | null; death_year: number | null }
export interface GBook {
  id: number; title: string; authors: GPerson[]; translators?: GPerson[]; subjects: string[]; bookshelves: string[]
  languages: string[]; copyright: boolean | null; media_type: string; formats: Record<string, string>; download_count: number; summaries?: string[]
}
export interface GPage { count: number; next: string | null; previous: string | null; results: GBook[] }

export const TOPICS = ['Fiction', 'Mystery', 'Science Fiction', 'Romance', 'Adventure', 'Philosophy', 'History', 'Children']
export const LICENSE = 'Public domain in the USA. From Project Gutenberg.'
export const catalogIdOf = (id: number) => `pg-${id}`
export const gutenbergPage = (id: number) => `https://www.gutenberg.org/ebooks/${id}`

/** "Austen, Jane" → "Jane Austen"; "Marcus Aurelius, Emperor of Rome" stays "Marcus Aurelius". */
export function personName(p: GPerson) {
  const [last, given] = p.name.split(',').map(s => s.trim())
  if (!given || /\b(of|the)\b/i.test(given) || !/^[A-ZÀ-ɏ]/.test(given)) return last
  return `${given.replace(/\s*\(.*\)$/, '')} ${last}`
}
export const authorsOf = (b: GBook) => b.authors.length ? b.authors.slice(0, 2).map(personName).join(' and ') + (b.authors.length > 2 ? ' and others' : '') : 'Unknown author'
export const coverOf = (b: GBook) => b.formats['image/jpeg']
export const shortTitle = (t: string) => t.replace(/\s*[:;]\s.*$/s, '').replace(/\s+/g, ' ').trim()

// ---------- listing
export function listUrl(q: { search?: string; topic?: string }) {
  const u = new URL(GUTENDEX + '/books/')
  u.searchParams.set('copyright', 'false')        // public domain in the USA only
  if (q.search?.trim()) u.searchParams.set('search', q.search.trim())
  if (q.topic) u.searchParams.set('topic', q.topic)
  if (!q.search?.trim()) u.searchParams.set('sort', 'popular')
  return u.toString()
}

export async function fetchPage(url: string): Promise<GPage> {
  const r = await proxiedFetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`Discover couldn’t load books (${r.status}).`)
  const page = await r.json() as GPage
  rememberBooks(page.results)
  return page
}

// ---------- local cache (localStorage: small, synchronous, survives offline)
const POPULAR_KEY = 'saga.discover.popular.v1', ITEMS_KEY = 'saga.discover.items.v1'
const read = <T>(k: string): T | null => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) as T : null } catch { return null } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full or blocked: Discover still works online */ } }

export function cachedPopular() { return read<{ at: number; page: GPage }>(POPULAR_KEY) }
export function cachePopular(page: GPage) { write(POPULAR_KEY, { at: Date.now(), page }) }
function rememberBooks(books: GBook[]) {
  const items = read<Record<string, GBook>>(ITEMS_KEY) ?? {}
  for (const b of books) items[b.id] = b
  const keys = Object.keys(items)
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete items[k]
  write(ITEMS_KEY, items)
}
export function cachedBook(id: number) { return read<Record<string, GBook>>(ITEMS_KEY)?.[id] ?? null }
export async function fetchBook(id: number): Promise<GBook> {
  const r = await proxiedFetch(`${GUTENDEX}/books/${id}`, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(r.status === 404 ? 'This book isn’t in the catalog.' : `Discover couldn’t load this book (${r.status}).`)
  const b = await r.json() as GBook
  rememberBooks([b])
  return b
}

// ---------- getting a book
/** Download candidates, best first: EPUB, then EPUB without images, then plain text. */
export function fileCandidates(b: GBook): { url: string; ext: 'epub' | 'txt' }[] {
  const out: { url: string; ext: 'epub' | 'txt' }[] = []
  const epub = b.formats['application/epub+zip']
  if (epub) out.push({ url: epub, ext: 'epub' })
  const noImages = Object.values(b.formats).find(u => /\.epub\.noimages$/.test(u)) ?? `https://www.gutenberg.org/ebooks/${b.id}.epub.noimages`
  if (!out.some(c => c.url === noImages)) out.push({ url: noImages, ext: 'epub' })
  const txtKey = Object.keys(b.formats).filter(k => k.startsWith('text/plain') && !/\.zip$/.test(b.formats[k])).sort((a, z) => (/utf-8/i.test(z) ? 1 : 0) - (/utf-8/i.test(a) ? 1 : 0))[0]
  if (txtKey) out.push({ url: b.formats[txtKey], ext: 'txt' })
  return out
}

/** The browser refused the download (usually CORS); the reader can download it themselves. */
export class DownloadBlocked extends Error { constructor(public url: string) { super('Your browser blocked the download.') } }

export async function getBook(b: GBook): Promise<{ bookId: string; title: string }> {
  const cands = fileCandidates(b)
  let blocked = false, lastError = ''
  for (const c of cands) {
    let bytes: Uint8Array
    try {
      const r = await proxiedFetch(c.url, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) { lastError = `The file wasn’t available (${r.status}).`; continue }
      bytes = new Uint8Array(await r.arrayBuffer())
    } catch { blocked = true; continue }        // network error or CORS refusal: try the next format, then fall back
    if (c.ext === 'epub' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) { lastError = 'The download wasn’t an EPUB file.'; continue }
    const res = await importBytes(store, `${shortTitle(b.title)}.${c.ext}`, bytes, { source: 'catalog', catalogId: catalogIdOf(b.id), license: LICENSE })
    if (res.status === 'failed') { lastError = res.error ?? 'The file couldn’t be added.'; continue }
    // Already in the library (same file imported before): link it to this Discover entry.
    const existing = await store.db.books.get(res.bookId!)
    if (existing && !existing.catalogId) await store.put('book', existing.id, { catalogId: catalogIdOf(b.id), license: existing.license ?? LICENSE })
    return { bookId: res.bookId!, title: shortTitle(b.title) }
  }
  if (blocked) throw new DownloadBlocked(cands[0]?.url ?? gutenbergPage(b.id))
  throw new Error(lastError || 'This book has no downloadable file.')
}
