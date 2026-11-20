// Open Library + Internet Archive public-domain scans. Open Library's search
// (CORS allowed) finds borrowable-free ("public") editions; the Internet Archive
// metadata (CORS allowed) tells which file to download and whether the item is
// access-restricted. archive.org/download redirects to *.archive.org without
// CORS headers, so the file goes through SAGA's proxy. Scans are OCR: quality
// varies, so they are labelled and shown after cleaner sources.
import type { DiscoverCard } from './card'
import { swr, throttle } from './swr'

export const OL_SEARCH = 'https://openlibrary.org/search.json'
export const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,ia,subject'
export const IA_LICENSE = 'Public domain scan from the Internet Archive; the text is machine-read and may contain errors.'
export const iaCatalogId = (ia: string) => `ia~${ia}`
export const iaIdOf = (id: string) => id.replace(/^ia~/, '')
export const iaPage = (ia: string) => `https://archive.org/details/${encodeURIComponent(ia)}`
export const olCover = (coverId: number) => `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`

export interface OlDoc { key?: string; title?: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; ia?: string[]; subject?: string[] }

/** One Open Library work → one card. Needs a title and at least one Internet Archive id; the first id is the primary one.
 *  Up to four ids ride along in `iaIds`; the download tries them in order. */
export function normalizeOpenLibrary(d: OlDoc): (DiscoverCard & { iaIds: string[] }) | null {
  const ids = (d.ia ?? []).filter(x => typeof x === 'string' && x && !/^sim_/.test(x))
  if (!d.title || !ids.length) return null
  return {
    id: iaCatalogId(ids[0]), source: 'internetarchive', title: d.title.trim(), author: (d.author_name ?? []).slice(0, 2).join(' and ') || 'Unknown author',
    cover: d.cover_i ? olCover(d.cover_i) : undefined, year: d.first_publish_year, subjects: (d.subject ?? []).slice(0, 8),
    pageUrl: iaPage(ids[0]), scanned: true, iaIds: ids.slice(0, 4),
  }
}

export function openLibraryUrl(q: { q?: string; topic?: string; sort?: 'popular' | 'new' | 'title' }, page = 1, limit = 20) {
  const terms = [q.q?.trim(), q.topic ? `subject:"${q.topic.toLowerCase()}"` : ''].filter(Boolean).join(' ') || 'subject:fiction'
  const u = new URL(OL_SEARCH)
  u.searchParams.set('q', terms); u.searchParams.set('ebook_access', 'public'); u.searchParams.set('fields', OL_FIELDS)
  u.searchParams.set('limit', String(limit)); u.searchParams.set('page', String(page))
  if (q.sort === 'new') u.searchParams.set('sort', 'new')
  return u.toString()
}

const slot = throttle(1000)
const get = (url: string) => slot(async () => { const r = await fetch(url, { signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`The Internet Archive didn’t answer (${r.status}).`); return r.json() })

export async function fetchOpenLibrary(q: { q?: string; topic?: string; sort?: 'popular' | 'new' | 'title' }, page = 1): Promise<{ cards: DiscoverCard[]; more: boolean }> {
  const url = openLibraryUrl(q, page)
  const j = await swr<{ numFound?: number; docs?: OlDoc[] }>(`ol:${url}`, () => get(url))
  const docs = j.docs ?? []
  return { cards: docs.map(normalizeOpenLibrary).filter((c): c is DiscoverCard & { iaIds: string[] } => !!c), more: page * 20 < (j.numFound ?? 0) }
}

// ---------------------------------------------------------------- download
export interface IaFile { name: string; format?: string; size?: string }
export interface IaMetadata { metadata?: Record<string, unknown>; files?: IaFile[] }
/** True for lending-library and otherwise access-restricted items: they have no public file. */
export const isRestricted = (m: IaMetadata) => { const v = m.metadata?.['access-restricted-item']; return v === true || String(v).toLowerCase() === 'true' }
/** The EPUB to fetch: prefers the file whose format says EPUB, else any .epub. */
export function pickEpub(m: IaMetadata): string | null {
  const files = m.files ?? []
  return (files.find(f => /^epub$/i.test(f.format ?? '') && /\.epub$/i.test(f.name)) ?? files.find(f => /\.epub$/i.test(f.name)))?.name ?? null
}
export const iaDownloadUrl = (id: string, file: string) => `https://archive.org/download/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`

/** The first Internet Archive id that is not restricted and has an EPUB; null when none does. */
export async function resolveIaEpub(ids: string[], fetchMeta: (id: string) => Promise<IaMetadata> = id => get(`https://archive.org/metadata/${encodeURIComponent(id)}`)): Promise<{ id: string; url: string } | null> {
  for (const id of ids) {
    let m: IaMetadata
    try { m = await fetchMeta(id) } catch { continue }
    if (isRestricted(m)) continue
    const f = pickEpub(m)
    if (f) return { id, url: iaDownloadUrl(id, f) }
  }
  return null
}
