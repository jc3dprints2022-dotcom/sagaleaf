// Wikisource (English): proofread and validated texts, listed with the MediaWiki
// API (CORS allowed with origin=*). The EPUB is built on demand by Wikimedia's
// ws-export tool, which sends no CORS header, so it goes through SAGA's proxy.
//   list    https://en.wikisource.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:Validated_texts…
//   search  …&generator=search&gsrsearch=<terms> incategory:"Validated texts|Proofread texts"
//   EPUB    https://ws-export.wmcloud.org/?lang=en&page=<Title>&format=epub-3
import type { DiscoverCard } from './card'
import { swr, throttle } from './swr'

export const WS_API = 'https://en.wikisource.org/w/api.php'
export const WS_CATEGORIES = ['Category:Validated_texts', 'Category:Proofread_texts']
export const WS_LICENSE = 'Public domain. Transcribed and proofread by Wikisource volunteers (CC BY-SA 4.0 for the transcription).'
const API_UA = 'SAGA-Reader/0.2 (public-domain book browser; https://saga.proxima-3d.com)'
export const wsPage = (title: string) => `https://en.wikisource.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')}`
export const wsEpubUrl = (title: string) => `https://ws-export.wmcloud.org/?lang=en&page=${encodeURIComponent(title.replace(/ /g, '_'))}&format=epub-3`
export const wsCatalogId = (title: string) => 'ws~' + title.replace(/ /g, '_')
export const wsTitleOf = (id: string) => id.replace(/^ws~/, '').replace(/_/g, ' ')

export interface WsPage { pageid?: number; title: string; index?: number; extract?: string; thumbnail?: { source: string } }

/** "A Study in Scarlet (Doyle)" → title "A Study in Scarlet", author "Doyle". Subpages ("Work/Chapter 1") and
 *  non-works (Author:, Portal:, Index:…) are not whole texts and give null. */
export function normalizeWikisource(p: WsPage): DiscoverCard | null {
  const raw = (p.title ?? '').trim()
  if (!raw || raw.includes('/') || /^[A-Za-z ]+:/.test(raw)) return null
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw)
  const hint = m && !/\d/.test(m[2]) ? m[2].trim() : ''
  const title = (m ? m[1] : raw).trim()
  if (!title) return null
  const extract = (p.extract ?? '').replace(/\s+/g, ' ').trim()
  return {
    id: wsCatalogId(raw), source: 'wikisource', title, author: hint || 'Wikisource', pageUrl: wsPage(raw),
    cover: p.thumbnail?.source, summary: extract || undefined, subjects: [],
  }
}

export type WsSort = 'popular' | 'new' | 'title'
export interface WsQuery { q?: string; topic?: string; sort?: WsSort; cursor?: Record<string, string> }
export interface WsResult { cards: DiscoverCard[]; next: Record<string, string> | null; category: number }

const common = { action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '240', exintro: '1', explaintext: '1', exchars: '220', exlimit: 'max' }
/** The request for one page of results. A category pages with `gcmcontinue`; search with `gsroffset`. */
export function wikisourceUrl(q: WsQuery, categoryIndex = 0, limit = 20): string {
  const u = new URL(WS_API)
  for (const [k, v] of Object.entries(common)) u.searchParams.set(k, v)
  const terms = [q.q?.trim(), q.topic].filter(Boolean).join(' ')
  if (terms) {
    u.searchParams.set('generator', 'search'); u.searchParams.set('gsrnamespace', '0'); u.searchParams.set('gsrlimit', String(limit))
    u.searchParams.set('gsrsearch', `${terms} incategory:"Validated texts|Proofread texts"`)
  } else {
    u.searchParams.set('generator', 'categorymembers'); u.searchParams.set('gcmtitle', WS_CATEGORIES[categoryIndex]); u.searchParams.set('gcmtype', 'page'); u.searchParams.set('gcmlimit', String(limit))
    if (q.sort === 'new') { u.searchParams.set('gcmsort', 'timestamp'); u.searchParams.set('gcmdir', 'descending') }
  }
  for (const [k, v] of Object.entries(q.cursor ?? {})) if (k !== 'continue' || v) u.searchParams.set(k, v)
  return u.toString()
}

/** Normalizes an API answer (formatversion 2: pages is an array carrying `index` for generator order). */
export function parseWikisource(json: unknown): { cards: DiscoverCard[]; cont: Record<string, string> | null } {
  const j = json as { query?: { pages?: WsPage[] }; continue?: Record<string, string | number> }
  const pages = [...(j?.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const cards = pages.map(normalizeWikisource).filter((c): c is DiscoverCard => !!c)
  const cont = j?.continue ? Object.fromEntries(Object.entries(j.continue).map(([k, v]) => [k, String(v)])) : null
  return { cards, cont }
}

const slot = throttle(1000)
async function fetchApi(url: string) {
  const r = await slot(() => fetch(url, { headers: { 'Api-User-Agent': API_UA }, signal: AbortSignal.timeout(30_000) }))
  if (!r.ok) throw new Error(`Wikisource didn’t answer (${r.status}).`)
  return r.json()
}

/** One page of Wikisource: Validated texts first, then Proofread texts; search covers both at once. */
export async function fetchWikisource(q: WsQuery): Promise<WsResult> {
  const searching = !!(q.q?.trim() || q.topic)
  const category = Number(q.cursor?.cat ?? 0)
  const cursor = q.cursor ? Object.fromEntries(Object.entries(q.cursor).filter(([k]) => k !== 'cat')) : undefined
  const url = wikisourceUrl({ ...q, cursor }, category)
  const { cards, cont } = parseWikisource(await swr(`ws:${url}`, () => fetchApi(url)))
  if (cont) return { cards, next: { ...cont, ...(searching ? {} : { cat: String(category) }) }, category }
  if (!searching && category + 1 < WS_CATEGORIES.length) return { cards, next: { cat: String(category + 1) }, category }
  return { cards, next: null, category }
}
