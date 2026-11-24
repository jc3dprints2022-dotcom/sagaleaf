// Discover: one search across Standard Ebooks, Project Gutenberg, Wikisource and
// (last, as scans) the Internet Archive. Each source normalizes to a DiscoverCard;
// a Feed pages through all of them at once, dedupes, interleaves and can prefetch
// its next page. Getting a book dispatches on the catalog id.
import { importBytes } from '../core/library'
import { isZip } from '../core/epub'
import { store } from './state'
import { dedupe, interleave, sameWork, SOURCE_LABEL, type DiscoverCard } from './card'
import { swr, peek, store as cacheStore } from './swr'
import {
  fetchPage, listUrl, cachedBook, fetchBook, getBook, withProxy, coverOf, authorsOf, shortTitle, catalogIdOf, gutenbergPage, DownloadBlocked, TOPICS, type GBook, type FetchOpts,
} from './gutendex'
import { fetchSENewReleases, cachedSE, getStandardEbook, seCatalogId, seSegmentsOf, unslug, SE_ORIGIN, parseBookUrl, importFromUrl, type SEBook } from './standardebooks'
import { fetchWikisource, wsCatalogId, wsEpubUrl, wsPage, wsTitleOf, WS_LICENSE, type WsQuery } from './wikisource'
import { fetchOpenLibrary, resolveIaEpub, iaIdOf, iaPage, IA_LICENSE } from './openlibrary'

export { TOPICS }
export type Sort = 'popular' | 'new' | 'title'
export const SORTS: { value: Sort; label: string }[] = [{ value: 'popular', label: 'Popular' }, { value: 'new', label: 'Newest' }, { value: 'title', label: 'Title' }]
export interface Query { q: string; topic: string; sort: Sort }
export const emptyQuery: Query = { q: '', topic: '', sort: 'popular' }
export const catalogHref = (id: string) => `#/catalog/${encodeURIComponent(id)}`

// ---------------------------------------------------------------- normalizers
export function fromGutenberg(b: GBook): DiscoverCard {
  return { id: catalogIdOf(b.id), source: 'gutenberg', title: shortTitle(b.title), author: authorsOf(b), cover: coverOf(b), summary: b.summaries?.[0], subjects: b.subjects.slice(0, 8), pageUrl: gutenbergPage(b.id) }
}
export function fromStandardEbook(b: SEBook): DiscoverCard {
  return { id: seCatalogId(b.segments), source: 'standardebooks', title: b.title, author: b.author, cover: b.cover, summary: b.summary, subjects: [], pageUrl: b.pageUrl }
}

// ---------------------------------------------------------------- sources
export interface Sources {
  standard(): Promise<SEBook[]>
  gutenberg(q: Query, cursor: string | null, opts?: FetchOpts): Promise<{ cards: DiscoverCard[]; next: string | null }>
  wikisource(q: WsQuery): ReturnType<typeof fetchWikisource>
  openlibrary(q: Query, page: number): Promise<{ cards: DiscoverCard[]; more: boolean }>
}
let seFlight: Promise<SEBook[]> | null = null
const standardFeed = async (): Promise<SEBook[]> => cachedSE()?.books && (Date.now() - cachedSE()!.at < 24 * 3600_000 || navigator.onLine === false) ? cachedSE()!.books : navigator.onLine === false ? Promise.reject(new Error('offline')) : fetchSENewReleases().catch(e => { const c = cachedSE(); if (c) return c.books; throw e })
export const liveSources: Sources = {
  standard: () => (seFlight ??= standardFeed().finally(() => { seFlight = null })),
  async gutenberg(q, cursor, opts) {
    const url = cursor ?? listUrl({ search: q.q, topic: q.topic, sort: q.sort })
    const p = await swr(`pg:${url}`, () => fetchPage(url, opts))
    return { cards: p.results.filter(b => !b.copyright).map(fromGutenberg), next: p.next }
  },
  wikisource: fetchWikisource,
  openlibrary: (q, page) => fetchOpenLibrary(q, page),
}

/** New Standard Ebooks releases that match the search (the feed has no search of its own). */
export function matchStandard(books: SEBook[], q: Query): DiscoverCard[] {
  const words = (q.q + ' ' + q.topic).toLowerCase().split(/\s+/).filter(Boolean)
  const hay = (b: SEBook) => `${b.title} ${b.author} ${b.summary ?? ''}`.toLowerCase()
  return books.filter(b => words.every(w => hay(b).includes(w))).map(fromStandardEbook)
}

export interface Feed {
  /** Everything loaded so far. */
  readonly cards: DiscoverCard[]
  readonly done: boolean
  readonly failed: boolean
  loadMore(): Promise<DiscoverCard[]>
  /** Starts loading the next page so loadMore() answers at once. */
  prefetch(): void
}

/** Pages through all sources together. Order within a page: Standard Ebooks, Gutenberg, Wikisource, interleaved;
 *  the scanned Internet Archive editions only follow once the others are used up, and only for a search or topic. */
export function createFeed(q: Query, src: Sources = liveSources): Feed {
  const cards: DiscoverCard[] = []
  const seen: DiscoverCard[] = []
  const st = { se: false, pg: undefined as string | null | undefined, ws: undefined as Record<string, string> | null | undefined, ia: 0, iaDone: !(q.q.trim() || q.topic), errors: 0, ok: 0 }
  let buffered: Promise<DiscoverCard[]> | null = null
  let chain: Promise<unknown> = Promise.resolve()
  const settled = <T>(p: Promise<T>) => p.then(v => { st.ok++; return v }, () => { st.errors++; return null })
  const cleanDone = () => st.se && st.pg === null && st.ws === null

  async function page(): Promise<DiscoverCard[]> {
    const tasks: { k: 'se' | 'pg' | 'ws'; p: Promise<DiscoverCard[]> }[] = []
    if (!st.se) tasks.push({ k: 'se', p: settled(src.standard()).then(b => { st.se = true; return b ? matchStandard(b, q) : [] }) })
    if (st.pg !== null) tasks.push({ k: 'pg', p: settled(src.gutenberg(q, st.pg ?? null)).then(r => { if (!r) { st.pg = null; return [] } st.pg = r.next; return r.cards }) })
    if (st.ws !== null) tasks.push({ k: 'ws', p: settled(src.wikisource({ q: q.q, topic: q.topic, sort: q.sort, cursor: st.ws ?? undefined })).then(r => { if (!r) { st.ws = null; return [] } st.ws = r.next; return r.cards }) })
    // Popular leads with Gutenberg (the only source that ranks); Newest leads with Standard Ebooks.
    const order = q.sort === 'new' ? ['se', 'pg', 'ws'] : ['pg', 'se', 'ws']
    const done = await Promise.all(tasks.map(async t => ({ k: t.k, cards: await t.p })))
    let batch = interleave(order.map(k => done.find(d => d.k === k)?.cards ?? []))
    if (cleanDone() && !st.iaDone) {
      const r = await settled(src.openlibrary(q, st.ia + 1))
      if (!r) st.iaDone = true; else { st.ia++; if (!r.more) st.iaDone = true; batch = batch.concat(r.cards) }
    }
    batch = dedupe(batch, seen)
    if (q.sort === 'title') batch.sort((a, b) => a.title.localeCompare(b.title))
    return batch
  }
  async function run(): Promise<DiscoverCard[]> {
    const job = chain.then(async () => {
      for (let i = 0; i < 4; i++) {
        const b = await page()
        if (b.length || feed.done) { cards.push(...b); return b }
      }
      return []
    })
    chain = job.catch(() => undefined)
    return job
  }
  const feed: Feed = {
    cards,
    get done() { return cleanDone() && st.iaDone },
    get failed() { return st.errors > 0 && st.ok === 0 },
    loadMore() { const p = buffered ?? run(); buffered = null; return p },
    prefetch() { if (!buffered && !feed.done) { buffered = run(); buffered.catch(() => { buffered = null }) } },
  }
  return feed
}

// ---------------------------------------------------------------- rows
/** Cards in a carousel; "See all" opens the grid for the rest. */
export const ROW_SIZE = 14
export type RowId = 'recommended' | 'popular' | 'standard-new' | `topic:${string}`
export const rowTitle = (id: RowId) => id === 'recommended' ? 'Recommended for you' : id === 'popular' ? 'Popular' : id === 'standard-new' ? 'New from Standard Ebooks' : id.slice(6)

const AUTHORLESS = /^(unknown|anonymous)/i
interface LibraryBook { title: string; author: string; subjects?: string[]; catalogId?: string }
/** Authors the reader owns most of, and TOPICS their subjects fall under: what "Recommended for you" is built from. */
export function tastes(books: LibraryBook[]): { authors: string[]; topics: string[] } {
  const a = new Map<string, number>(), t = new Map<string, number>()
  for (const b of books) {
    if (b.author && !AUTHORLESS.test(b.author)) a.set(b.author, (a.get(b.author) ?? 0) + 1)
    const text = (b.subjects ?? []).join(' ').toLowerCase()
    for (const topic of TOPICS) {
      const words = topic.toLowerCase() === 'children' ? ['children', 'juvenile'] : topic.toLowerCase() === 'mystery' ? ['mystery', 'detective'] : topic.toLowerCase() === 'science fiction' ? ['science fiction'] : [topic.toLowerCase()]
      if (words.some(w => text.includes(w))) t.set(topic, (t.get(topic) ?? 0) + 1)
    }
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(x => x[0])
  return { authors: top(a, 3), topics: top(t, 2) }
}
const surname = (a: string) => (a.includes(',') ? a.split(',')[0] : a.split(/\s+/).pop() ?? a).trim()

/** Works by the authors in the library and popular ones from its topics, minus what the library has. `fallback` is true when it is just Popular. */
export async function recommended(books: LibraryBook[], src: Sources = liveSources): Promise<{ cards: DiscoverCard[]; fallback: boolean }> {
  const { authors, topics } = tastes(books)
  const owned = (c: DiscoverCard) => books.some(b => b.catalogId === c.id || sameWork(b, c))
  // Each request gives up after ROW_FETCH.timeoutMs and is tried once more; one that still fails counts as an empty
  // list. They run together, with Popular alongside as the fallback, so the row never waits on a slow request for long.
  // (the cap also covers a request that is shared with a slower caller of the same list)
  const cap = ROW_FETCH.timeoutMs! * (ROW_FETCH.retries! + 1) + 1000
  const ask = (q: Query) => Promise.race([src.gutenberg(q, null, ROW_FETCH), new Promise<never>((_, no) => setTimeout(no, cap))]).then(r => r.cards, () => [] as DiscoverCard[])
  const wanted = [...authors.map(a => ask({ q: surname(a), topic: '', sort: 'popular' })), ...topics.map(t => ask({ q: '', topic: t, sort: 'popular' }))]
  const popular = ask(emptyQuery)
  const cards = dedupe(interleave(await Promise.all(wanted)).filter(c => !owned(c)))
  if (cards.length >= 4) return { cards: cards.slice(0, ROW_SIZE), fallback: false }
  return { cards: dedupe(await popular).filter(c => !owned(c)).slice(0, ROW_SIZE), fallback: true }
}
/** Recommended is an extra on Home and Discover: 8 s and one retry per request, not the 60 s a search is allowed. */
export const ROW_FETCH = { timeoutMs: 8000, retries: 1 } satisfies FetchOpts
const LAST_RECOMMENDED = 'row:v1:recommended:last'
/** Recommended cards, or the last set that loaded when nothing can be fetched now. Throws only when there is neither,
 *  so an empty answer is never cached as the row's content. */
async function recommendedOrLast(library: LibraryBook[], src: Sources): Promise<DiscoverCard[]> {
  const cards = (await recommended(library, src).catch(() => ({ cards: [] as DiscoverCard[] }))).cards
  if (cards.length) { void cacheStore(LAST_RECOMMENDED, cards); return cards }
  const last = (await peek<DiscoverCard[]>(LAST_RECOMMENDED))?.value.filter(c => !library.some(b => b.catalogId === c.id || sameWork(b, c))) ?? []
  if (!last.length) throw new Error('Recommended couldn’t be loaded.')
  return last
}

/** First screenful of a row. */
export async function rowCards(id: RowId, library: LibraryBook[], src: Sources = liveSources): Promise<DiscoverCard[]> {
  if (id === 'recommended') return recommendedOrLast(library, src)
  if (id === 'standard-new') return (await src.standard()).map(fromStandardEbook).slice(0, ROW_SIZE)
  const q: Query = { q: '', topic: id.startsWith('topic:') ? id.slice(6) : '', sort: 'popular' }
  // carousels use the fast sources only; Wikisource is limited to 1 request a second and is kept for the grids and search
  return (await createFeed(q, { ...src, standard: async () => [], wikisource: async () => ({ cards: [], next: null, category: 0 }) }).loadMore()).slice(0, ROW_SIZE)
}
/** The grid behind a row's "See all". */
export function rowFeed(id: RowId, library: LibraryBook[], src: Sources = liveSources): Feed {
  if (id === 'standard-new') return createFeed({ ...emptyQuery, sort: 'new' }, { ...src, gutenberg: async () => ({ cards: [], next: null }), wikisource: async () => ({ cards: [], next: null, category: 0 }) })
  if (id === 'recommended') {
    let cache: Promise<DiscoverCard[]> | null = null, used = false
    const cards: DiscoverCard[] = []
    return { cards, get done() { return used }, failed: false, loadMore: async () => { if (used) return []; used = true; const r = await (cache ??= recommendedOrLast(library, src).catch(() => [])); cards.push(...r); return r }, prefetch() { cache ??= recommendedOrLast(library, src).catch(() => []) } }
  }
  return createFeed({ q: '', topic: id.startsWith('topic:') ? id.slice(6) : '', sort: 'popular' }, src)
}

// ---------------------------------------------------------------- one card by id
export async function rememberCards(list: (DiscoverCard & { iaIds?: string[] })[]) { for (const c of list) void cacheStore(`card:${c.id}`, c, { mirror: false }) }
export async function cardById(id: string): Promise<(DiscoverCard & { iaIds?: string[] }) | null> {
  const hit = await peek<DiscoverCard & { iaIds?: string[] }>(`card:${id}`)
  if (hit) return hit.value
  if (id.startsWith('ws~')) { const t = wsTitleOf(id); return { id, source: 'wikisource', title: t.replace(/\s*\([^)]*\)$/, ''), author: 'Wikisource', subjects: [], pageUrl: wsPage(t) } }
  if (id.startsWith('ia~')) return { id, source: 'internetarchive', title: unslug(iaIdOf(id).replace(/[_.]/g, '-')), author: 'Unknown author', subjects: [], pageUrl: iaPage(iaIdOf(id)), scanned: true }
  return null
}

// ---------------------------------------------------------------- getting a book
/** The download didn't work from here; the reader can open the source instead. */
export class OpenOnSource extends DownloadBlocked {
  constructor(url: string, public label: string) { super(url) }
}
export const openLabel = (c: Pick<DiscoverCard, 'source'>) => `Open on ${c.source === 'internetarchive' ? 'the Internet Archive' : SOURCE_LABEL[c.source]}`

async function fetchEpub(url: string, viaProxy: boolean, open: { url: string; label: string }): Promise<Uint8Array> {
  let r: Response
  try { r = await fetch(viaProxy ? withProxy(url) : url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(90_000) }) } catch { throw new OpenOnSource(open.url, open.label) }
  if (!r.ok) throw new OpenOnSource(open.url, open.label)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (!isZip(bytes)) throw new OpenOnSource(open.url, open.label)
  return bytes
}
async function adopt(bytes: Uint8Array, name: string, extra: { catalogId?: string; sourceUrl?: string; license: string }) {
  const res = await importBytes(store, name, bytes, { source: 'catalog', ...extra }, { defer: true })
  if (res.status === 'failed') throw new Error(res.error ?? 'The file couldn’t be added.')
  const existing = await store.db.books.get(res.bookId!)
  if (existing && !existing.catalogId && extra.catalogId) await store.put('book', existing.id, { catalogId: extra.catalogId, license: existing.license ?? extra.license })
  return { bookId: res.bookId!, title: res.title ?? name }
}

export async function getWikisource(title: string) {
  const open = { url: wsPage(title), label: 'Wikisource' }
  const bytes = await fetchEpub(wsEpubUrl(title), true, open)
  return adopt(bytes, `${title}.epub`, { catalogId: wsCatalogId(title), license: WS_LICENSE })
}
export async function getInternetArchive(ids: string[]) {
  const open = { url: iaPage(ids[0]), label: 'the Internet Archive' }
  const f = await resolveIaEpub(ids)
  if (!f) throw new OpenOnSource(open.url, open.label)
  const bytes = await fetchEpub(f.url, true, open)
  return adopt(bytes, `${f.id}.epub`, { catalogId: `ia~${ids[0]}`, license: IA_LICENSE })
}

/** Gets whatever a catalog id names. */
export async function getByCatalogId(id: string, hint?: { iaIds?: string[] }): Promise<{ bookId: string; title: string }> {
  if (/^pg-\d+$/.test(id)) { const n = Number(id.slice(3)); return getBook(cachedBook(n) ?? await fetchBook(n)) }
  if (id.startsWith('se~')) { const segments = seSegmentsOf(id), base = `${SE_ORIGIN}/ebooks/${segments.join('/')}`; return getStandardEbook({ segments, pageUrl: base, epubUrl: `${base}/downloads/${segments.join('_')}.epub?source=download` }) }
  if (id.startsWith('ws~')) return getWikisource(wsTitleOf(id))
  if (id.startsWith('ia~')) return getInternetArchive(hint?.iaIds ?? [iaIdOf(id)])
  throw new Error('This book isn’t in Discover.')
}

// ---------------------------------------------------------------- links
/** What a pasted link is. Beyond Gutenberg and Standard Ebooks (see parseBookUrl): Wikisource pages, Internet Archive items, direct file links. */
export type LinkKind = { kind: 'wikisource'; title: string } | { kind: 'archive'; id: string } | { kind: 'direct'; url: string } | { kind: 'gutenberg' | 'standardebooks' }
export function parseLink(input: string): LinkKind | null {
  const p = parseBookUrl(input)
  if (p) return { kind: p.kind }
  let u: URL
  try { u = new URL(input.trim().replace(/^(?!https?:\/\/)/i, 'https://')) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'en.wikisource.org') {
    const m = /^\/wiki\/(.+)$/.exec(u.pathname) ?? (u.pathname === '/w/index.php' ? [null, u.searchParams.get('title') ?? ''] : null)
    const title = m ? decodeURIComponent(String(m[1])).replace(/_/g, ' ').trim() : ''
    return title && !title.includes('/') && !/^[A-Za-z ]+:/.test(title) ? { kind: 'wikisource', title } : null
  }
  if (host === 'archive.org') { const m = /^\/(?:details|download)\/([^/]+)/.exec(u.pathname); return m ? { kind: 'archive', id: decodeURIComponent(m[1]) } : null }
  if (/\.(epub|pdf)$/i.test(u.pathname)) return { kind: 'direct', url: u.href }
  return null
}

/** Imports whatever the link points at. */
export async function importLink(input: string): Promise<{ bookId: string; title: string }> {
  const l = parseLink(input)
  if (!l) throw new Error('Paste a link to a book on Project Gutenberg, Standard Ebooks, Wikisource or the Internet Archive, or a direct link to an .epub or .pdf file.')
  if (l.kind === 'gutenberg' || l.kind === 'standardebooks') return importFromUrl(input)
  if (l.kind === 'wikisource') return getWikisource(l.title)
  if (l.kind === 'archive') return getInternetArchive([l.id])
  if (l.kind !== 'direct') throw new Error('Unsupported link.')
  const name = decodeURIComponent(new URL(l.url).pathname.split('/').pop() ?? 'book.epub')
  let r: Response
  try { r = await fetch(l.url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(90_000) }) } catch { throw new DownloadBlocked(l.url) }
  if (!r.ok) throw new Error(`That link didn’t send the file (${r.status}).`)
  return adopt(new Uint8Array(await r.arrayBuffer()), name, { sourceUrl: l.url, license: 'Added from a link' })
}

/** For a book that arrived by sync with a source and no file: get it from its source. */
export async function fetchBySource(b: { catalogId?: string; sourceUrl?: string }): Promise<{ bookId: string; title: string } | null> {
  if (b.catalogId) return getByCatalogId(b.catalogId, (await cardById(b.catalogId)) ?? undefined)
  if (b.sourceUrl) return importLink(b.sourceUrl)
  return null
}
