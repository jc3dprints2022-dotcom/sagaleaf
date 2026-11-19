// Standard Ebooks (https://standardebooks.org) and "paste a link" import.
//
// URLs used (see docs/IMPORT.md):
//   Book page        https://standardebooks.org/ebooks/<author>/<title>[/<translator>…]
//   EPUB download    https://standardebooks.org/ebooks/<segments>/downloads/<segments joined by _>.epub
//                    (the "compatible epub"; "_advanced.epub" is also accepted when pasted)
//   New releases     https://standardebooks.org/feeds/atom/new-releases   (public Atom feed)
// The full OPDS and Atom catalogue feeds (/feeds/opds, /feeds/atom/all) need a
// Patrons Circle login, so Discover lists the public new-releases feed and
// offers the paste box for anything else.
//
// Standard Ebooks downloads send Access-Control-Allow-Origin: *, so they are
// fetched directly, never through the Gutenberg proxy. Gutenberg links go
// through the existing Discover code in gutendex.ts (Gutendex + proxy).
import { importBytes } from '../core/library'
import { isZip } from '../core/epub'
import { store } from './state'
import { fetchBook, cachedBook, getBook, DownloadBlocked, type GBook } from './gutendex'

export const SE_ORIGIN = 'https://standardebooks.org'
export const SE_NEW_RELEASES = SE_ORIGIN + '/feeds/atom/new-releases'
export const SE_LICENSE = 'Public domain in the USA. Standard Ebooks edition, released under CC0.'

export type ParsedUrl =
  | { kind: 'gutenberg'; id: number }
  | { kind: 'standardebooks'; segments: string[]; pageUrl: string; epubUrl: string }

const SLUG = /^[a-z0-9][a-z0-9_-]*$/   // translator/illustrator segments join several people with _

/** Recognises Project Gutenberg and Standard Ebooks links. Anything else is null. */
export function parseBookUrl(input: string): ParsedUrl | null {
  let u: URL
  try { u = new URL(input.trim().replace(/^(?!https?:\/\/)/i, 'https://')) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (/^(gutenberg\.org|gutenberg\.pglaf\.org|aleph\.gutenberg\.org)$/.test(host)) {
    const m = u.pathname.match(/^\/(?:ebooks|cache\/epub|files)\/(\d+)(?:[./]|$)/) ?? u.pathname.match(/^\/(?:[\d/]+\/)?(\d+)\/(?:pg)?\d+[^/]*$/)
    return m ? { kind: 'gutenberg', id: Number(m[1]) } : null
  }
  if (host === 'standardebooks.org') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'ebooks') return null
    // Segments run from after /ebooks/ up to /downloads/ or /text/ (pages inside the book).
    const stop = parts.findIndex((x, i) => i > 0 && (x === 'downloads' || x === 'text'))
    const segs = parts.slice(1, stop < 0 ? undefined : stop)
    const dl = parts[stop] === 'downloads' ? stop : -1
    if (segs.length < 2 || !segs.every(s => SLUG.test(s))) return null
    const base = `${SE_ORIGIN}/ebooks/${segs.join('/')}`
    const file = dl >= 0 ? parts[dl + 1] ?? '' : ''
    const stem = segs.join('_')
    // Keep the advanced EPUB if that is what was pasted; anything else (azw3, kepub) becomes the compatible EPUB.
    const epubUrl = file === `${stem}_advanced.epub` ? `${base}/downloads/${file}` : `${base}/downloads/${stem}.epub`
    return { kind: 'standardebooks', segments: segs, pageUrl: base, epubUrl }
  }
  return null
}

export const seCatalogId = (segments: string[]) => `se~${segments.join('~')}`
export const seSegmentsOf = (catalogId: string) => catalogId.replace(/^se~/, '').split('~')

/** Title-cases a slug as a fallback name: "pride-and-prejudice" → "Pride and Prejudice". */
export function unslug(s: string) {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
  return s.split('-').map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

/** Downloads a Standard Ebooks EPUB directly (CORS allowed) and adds it to the library. */
export async function getStandardEbook(p: { segments: string[]; pageUrl: string; epubUrl: string }, title?: string): Promise<{ bookId: string; title: string }> {
  let bytes: Uint8Array
  try {
    const r = await fetch(p.epubUrl, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(r.status === 404 ? 'Standard Ebooks has no book at that address.' : `Standard Ebooks didn’t send the file (${r.status}).`)
    bytes = new Uint8Array(await r.arrayBuffer())
  } catch (e) {
    if (e instanceof Error && /Standard Ebooks/.test(e.message)) throw e
    throw new DownloadBlocked(p.epubUrl)
  }
  if (!isZip(bytes)) throw new Error('Standard Ebooks sent a page instead of the EPUB. Open the book’s page and download it there, then add the file to your library.')
  const name = `${p.segments.join('_')}.epub`
  const res = await importBytes(store, name, bytes, { source: 'catalog', catalogId: seCatalogId(p.segments), license: SE_LICENSE })
  if (res.status === 'failed') throw new Error(res.error ?? 'The file couldn’t be added.')
  const existing = await store.db.books.get(res.bookId!)
  if (existing && !existing.catalogId) await store.put('book', existing.id, { catalogId: seCatalogId(p.segments), license: existing.license ?? SE_LICENSE })
  return { bookId: res.bookId!, title: res.title ?? title ?? unslug(p.segments[1]) }
}

/** The "paste a link" import for Gutenberg and Standard Ebooks. */
export async function importFromUrl(input: string): Promise<{ bookId: string; title: string }> {
  const p = parseBookUrl(input)
  if (!p) throw new Error('Paste a link to a book on Project Gutenberg (gutenberg.org/ebooks/…) or Standard Ebooks (standardebooks.org/ebooks/…).')
  if (p.kind === 'standardebooks') return getStandardEbook(p)
  let b: GBook | null = cachedBook(p.id)
  if (!b) {
    try { b = await fetchBook(p.id) }
    catch (e) {
      if (/isn’t in the catalog/.test((e as Error).message)) throw e
      // Gutendex is down or slow: the file URLs follow a fixed pattern, so try them anyway.
      b = { id: p.id, title: `Project Gutenberg eBook ${p.id}`, authors: [], subjects: [], bookshelves: [], languages: [], copyright: false, media_type: 'Text', download_count: 0, formats: { 'application/epub+zip': `https://www.gutenberg.org/ebooks/${p.id}.epub3.images` } }
    }
  }
  if (b.copyright) throw new Error('Project Gutenberg marks this book as still in copyright in the USA, so SAGA doesn’t download it.')
  return getBook(b)
}

// ---------------------------------------------------------------- new releases feed
export interface SEBook { segments: string[]; title: string; author: string; summary?: string; cover?: string; epubUrl: string; pageUrl: string; updated?: string }

/** Parses Standard Ebooks' Atom (or OPDS acquisition) feed. Only standardebooks.org links are trusted. */
export function parseSEFeed(xml: string): SEBook[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const els = (root: Document | Element, n: string) => Array.from(root.getElementsByTagName('*')).filter(e => (e.localName || e.tagName.split(':').pop()) === n)
  const txt = (e?: Element) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const out: SEBook[] = []
  for (const entry of els(doc, 'entry')) {
    const links = els(entry, 'link').map(l => ({ href: l.getAttribute('href') ?? '', rel: l.getAttribute('rel') ?? '', type: l.getAttribute('type') ?? '', title: l.getAttribute('title') ?? '' }))
    const abs = (h: string) => { try { return new URL(h, SE_ORIGIN).href } catch { return '' } }
    const page = [txt(els(entry, 'id')[0]), ...links.filter(l => l.rel === 'alternate' || !l.rel).map(l => l.href)].map(abs).find(h => parseBookUrl(h)?.kind === 'standardebooks')
    if (!page) continue
    const p = parseBookUrl(page) as Extract<ParsedUrl, { kind: 'standardebooks' }>
    const enclosure = links.filter(l => l.type === 'application/epub+zip' && /\.epub$/.test(l.href) && !/kepub|advanced/.test(l.href)).map(l => abs(l.href)).find(h => h.startsWith(SE_ORIGIN + '/'))
    const thumb = links.find(l => /image\/thumbnail|thumbnail/.test(l.rel))?.href ?? links.find(l => /opds-spec\.org\/image$/.test(l.rel))?.href
    const author = els(entry, 'author').map(a => txt(els(a, 'name')[0])).filter(Boolean).join(' and ')
    out.push({
      segments: p.segments, pageUrl: p.pageUrl, epubUrl: enclosure ?? p.epubUrl,
      title: txt(els(entry, 'title')[0]) || unslug(p.segments[1]), author: author || unslug(p.segments[0]),
      summary: txt(els(entry, 'summary')[0]) || undefined, cover: thumb ? abs(thumb) : undefined, updated: txt(els(entry, 'updated')[0]) || undefined,
    })
  }
  return out
}

const SE_KEY = 'saga.discover.se.v1'
export function cachedSE(): { at: number; books: SEBook[] } | null { try { const s = localStorage.getItem(SE_KEY); return s ? JSON.parse(s) : null } catch { return null } }
export async function fetchSENewReleases(): Promise<SEBook[]> {
  const r = await fetch(SE_NEW_RELEASES, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`Standard Ebooks’ feed didn’t answer (${r.status}).`)
  const books = parseSEFeed(await r.text())
  try { localStorage.setItem(SE_KEY, JSON.stringify({ at: Date.now(), books })) } catch { /* storage full */ }
  return books
}
export function cachedSEBook(segments: string[]) { return cachedSE()?.books.find(b => b.segments.join('/') === segments.join('/')) ?? null }
