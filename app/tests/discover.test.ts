// Discover: Wikisource and Open Library / Internet Archive normalizers, dedupe, the merged feed, caching,
// request spacing, graceful download failures, native sign-in return, and link parsing.
import './node-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dedupe, interleave, cardKey, sameWork, type DiscoverCard } from '../src/app/card'
import { parseWikisource, wikisourceUrl, wsEpubUrl, fetchWikisource, normalizeWikisource } from '../src/app/wikisource'
import { normalizeOpenLibrary, openLibraryUrl, resolveIaEpub, pickEpub, isRestricted, iaDownloadUrl } from '../src/app/openlibrary'
import { createFeed, matchStandard, tastes, recommended, ROW_FETCH, parseLink, getWikisource, getInternetArchive, OpenOnSource, type Sources } from '../src/app/discover'
import { swr, throttle, clearMemory } from '../src/app/swr'
import { completeNativeSignIn, NATIVE_REDIRECT } from '../src/app/account'
import { PROXY } from '../src/app/gutendex'
import type { SEBook } from '../src/app/standardebooks'

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'discover', n), 'utf8'))
const card = (o: Partial<DiscoverCard> & { title: string; author: string; source: DiscoverCard['source'] }): DiscoverCard => ({ id: `${o.source}-${o.title}`, subjects: [], pageUrl: 'x', ...o })

describe('Wikisource', () => {
  it('normalizes pages into cards, in API order, skipping subpages and non-works', () => {
    const { cards, cont } = parseWikisource(fx('wikisource-category.json'))
    expect(cards.map(c => c.title)).toEqual(['Pride and Prejudice', 'A Study in Scarlet', 'Dracula'])
    const study = cards[1]
    expect(study).toMatchObject({ id: 'ws~A_Study_in_Scarlet_(Doyle)', source: 'wikisource', author: 'Doyle', cover: 'https://upload.wikimedia.org/thumb/study.jpg', summary: 'A Study in Scarlet is a detective novel.' })
    expect(study.pageUrl).toBe('https://en.wikisource.org/wiki/A_Study_in_Scarlet_(Doyle)')
    expect(cards[0].author).toBe('Wikisource')           // no author hint in the title
    expect(cards[2].author).toBe('Wikisource')           // "(1897)" is a year, not an author
    expect(cont).toEqual({ gcmcontinue: 'page|4a4f4e|9999', continue: 'gcmcontinue||' })
    expect(normalizeWikisource({ title: 'Work/Part' })).toBeNull()
  })

  it('lists Validated texts then Proofread texts, and searches both, with CORS on', () => {
    const list = new URL(wikisourceUrl({}))
    expect(list.origin + list.pathname).toBe('https://en.wikisource.org/w/api.php')
    expect(list.searchParams.get('origin')).toBe('*')
    expect(list.searchParams.get('gcmtitle')).toBe('Category:Validated_texts')
    expect(new URL(wikisourceUrl({}, 1)).searchParams.get('gcmtitle')).toBe('Category:Proofread_texts')
    const search = new URL(wikisourceUrl({ q: 'dracula' }))
    expect(search.searchParams.get('generator')).toBe('search')
    expect(search.searchParams.get('gsrsearch')).toBe('dracula incategory:"Validated texts|Proofread texts"')
  })

  it('builds the ws-export EPUB address', () => {
    expect(wsEpubUrl('A Study in Scarlet (Doyle)')).toBe('https://ws-export.wmcloud.org/?lang=en&page=A_Study_in_Scarlet_(Doyle)&format=epub-3')
  })

  it('moves from the first category to the second when the first runs out', async () => {
    clearMemory()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return new Response(JSON.stringify({ query: { pages: [{ title: 'Some Book', index: 1 }] } })) })
    const first = await fetchWikisource({ q: '', cursor: undefined })
    expect(first.next).toEqual({ cat: '1' })
    const second = await fetchWikisource({ q: '', cursor: first.next! })
    expect(new URL(calls[1]).searchParams.get('gcmtitle')).toBe('Category:Proofread_texts')
    expect(second.next).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('Open Library and the Internet Archive', () => {
  const docs = fx('openlibrary-search.json').docs
  it('normalizes works that have an Internet Archive scan; skips the rest', () => {
    const cards = docs.map(normalizeOpenLibrary).filter(Boolean)
    expect(cards.map((c: DiscoverCard) => c.title)).toEqual(['Pride and Prejudice', 'Dracula'])
    expect(cards[0]).toMatchObject({ id: 'ia~prideprejudice00aust', source: 'internetarchive', scanned: true, author: 'Jane Austen', year: 1813, cover: 'https://covers.openlibrary.org/b/id/8231856-M.jpg', iaIds: ['prideprejudice00aust', 'prideprejudice01aust'] })
    expect(cards[1].iaIds).toEqual(['dracula00stok'])     // periodical ids (sim_…) are dropped
    expect(cards[1].author).toBe('Bram Stoker and Someone Else')
  })

  it('searches public editions with the requested fields', () => {
    const u = new URL(openLibraryUrl({ q: 'austen' }, 2, 20))
    expect(u.origin + u.pathname).toBe('https://openlibrary.org/search.json')
    expect(u.searchParams.get('ebook_access')).toBe('public')
    expect(u.searchParams.get('fields')).toBe('key,title,author_name,first_publish_year,cover_i,ia,subject')
    expect(u.searchParams.get('page')).toBe('2')
  })

  it('skips an access-restricted item and takes the next id that has an EPUB', async () => {
    const meta: Record<string, unknown> = { prideprejudice00aust: fx('ia-metadata-restricted.json'), prideprejudice01aust: fx('ia-metadata-open.json') }
    expect(isRestricted(meta.prideprejudice00aust as never)).toBe(true)
    const asked: string[] = []
    const r = await resolveIaEpub(['prideprejudice00aust', 'prideprejudice01aust'], async id => { asked.push(id); return meta[id] as never })
    expect(asked).toEqual(['prideprejudice00aust', 'prideprejudice01aust'])
    expect(r).toEqual({ id: 'prideprejudice01aust', url: 'https://archive.org/download/prideprejudice01aust/scan/prideprejudice01aust.epub' })
    expect(pickEpub(meta.prideprejudice01aust as never)).toBe('scan/prideprejudice01aust.epub')
    expect(iaDownloadUrl('a b', 'x y.epub')).toBe('https://archive.org/download/a%20b/x%20y.epub')
  })

  it('gives up (null) when every item is restricted or has no EPUB', async () => {
    expect(await resolveIaEpub(['a'], async () => fx('ia-metadata-restricted.json'))).toBeNull()
    expect(await resolveIaEpub(['a'], async () => ({ files: [{ name: 'a.pdf' }] }))).toBeNull()
    expect(await resolveIaEpub(['a'], async () => { throw new Error('down') })).toBeNull()
  })
})

describe('merging sources', () => {
  const se = card({ source: 'standardebooks', title: 'Pride and Prejudice', author: 'Jane Austen', id: 'se~jane-austen~pride-and-prejudice' })
  const pg = card({ source: 'gutenberg', title: 'Pride and Prejudice', author: 'Jane Austen', id: 'pg-1342' })
  const ws = card({ source: 'wikisource', title: 'Pride and Prejudice', author: 'Wikisource', id: 'ws~Pride_and_Prejudice' })
  const ia = card({ source: 'internetarchive', title: 'Pride and Prejudice', author: 'Jane Austen', scanned: true, id: 'ia~x' })

  it('treats title + author as the identity, ignoring case, punctuation, subtitles and name order', () => {
    expect(cardKey({ title: 'Frankenstein; Or, The Modern Prometheus', author: 'Shelley, Mary Wollstonecraft' })).toBe(cardKey({ title: 'Frankenstein', author: 'Mary Shelley' }))
    expect(sameWork(pg, ws)).toBe(true)                 // Wikisource names no author: title decides
    expect(sameWork(pg, card({ source: 'gutenberg', title: 'Pride and Prejudice', author: 'Someone Else' }))).toBe(false)
  })

  it('prefers the Standard Ebooks edition, then Gutenberg, then Wikisource', () => {
    expect(dedupe([ws, pg, se]).map(c => c.id)).toEqual(['se~jane-austen~pride-and-prejudice'])
    expect(dedupe([ws, pg]).map(c => c.id)).toEqual(['pg-1342'])
  })

  it('never shows a scan next to a clean edition, in the same batch or on a later page', () => {
    expect(dedupe([ia, pg]).map(c => c.id)).toEqual(['pg-1342'])
    const seen: DiscoverCard[] = []
    dedupe([pg], seen)
    expect(dedupe([ia], seen)).toEqual([])
    expect(dedupe([ia]).map(c => c.id)).toEqual(['ia~x'])  // alone, it stays
  })

  it('drops what an earlier page already showed', () => {
    const seen: DiscoverCard[] = []
    expect(dedupe([pg], seen)).toHaveLength(1)
    expect(dedupe([se], seen)).toHaveLength(0)
  })

  it('interleaves lists of different lengths', () => { expect(interleave<unknown>([[1, 2, 3], ['a'], [true, false]])).toEqual([1, 'a', true, 2, false, 3]) })
})

describe('the feed', () => {
  const mk = (source: DiscoverCard['source'], n: number, prefix: string): DiscoverCard[] => Array.from({ length: n }, (_, i) => card({ source, title: `${prefix} ${i}`, author: `Author ${prefix}` }))
  function sources(over: Partial<Sources> = {}) {
    const calls = { pg: 0, ws: 0, ol: 0 }
    const s: Sources = {
      standard: async () => [{ segments: ['a', 'b'], title: 'SE Only', author: 'Ann', epubUrl: '', pageUrl: '' } as SEBook],
      gutenberg: async (_q, cursor) => { const n = Number(cursor ?? 0); calls.pg++; return { cards: mk('gutenberg', 4, `PG${n}`), next: n < 2 ? String(n + 1) : null } },
      wikisource: async q => { calls.ws++; const n = Number(q.cursor?.p ?? 0); return { cards: mk('wikisource', 2, `WS${n}`), next: n < 1 ? { p: String(n + 1) } : null, category: 0 } },
      openlibrary: async (_q, page) => { calls.ol++; return { cards: [card({ source: 'internetarchive', title: `Scan ${page}`, author: 'Z', scanned: true })], more: page < 2 } },
      ...over,
    }
    return { s, calls }
  }
  it('interleaves sources page by page with no duplicates; scans only come last, and only for a search', async () => {
    const { s, calls } = sources()
    const feed = createFeed({ q: '', topic: '', sort: 'popular' }, s)
    const ids = new Set<string>()
    let pages = 0
    while (!feed.done && pages < 10) { for (const c of await feed.loadMore()) { expect(ids.has(c.id)).toBe(false); ids.add(c.id) }; pages++ }
    expect(calls.ol).toBe(0)
    expect(feed.cards.map(c => c.title).slice(0, 3)).toEqual(['PG0 0', 'SE Only', 'WS0 0'])
    expect(feed.cards.length).toBe(1 + 12 + 4)

    const search = createFeed({ q: 'x', topic: '', sort: 'popular' }, sources().s)
    while (!search.done) await search.loadMore()
    const titles = search.cards.map(c => c.title)
    expect(titles.slice(-2)).toEqual(['Scan 1', 'Scan 2'])
    expect(titles.findIndex(t => t.startsWith('Scan'))).toBeGreaterThan(titles.findIndex(t => t.startsWith('PG2')))
  })

  it('prefetch() loads the next page ahead; loadMore() then answers from it', async () => {
    const { s, calls } = sources()
    const feed = createFeed({ q: '', topic: '', sort: 'popular' }, s)
    await feed.loadMore()
    feed.prefetch(); feed.prefetch()
    await new Promise(r => setTimeout(r, 5))
    expect(calls.pg).toBe(2)                              // page 2 already requested, once
    const before = calls.pg
    const next = await feed.loadMore()
    expect(next.length).toBeGreaterThan(0)
    expect(calls.pg).toBe(before)
  })

  it('survives one source failing, and reports failure when all do', async () => {
    const down = async () => { throw new Error('down') }
    const partial = createFeed({ q: '', topic: '', sort: 'popular' }, sources({ wikisource: down as never }).s)
    expect((await partial.loadMore()).length).toBeGreaterThan(0); expect(partial.failed).toBe(false)
    const none = createFeed({ q: '', topic: '', sort: 'popular' }, sources({ standard: down as never, gutenberg: down as never, wikisource: down as never }).s)
    await none.loadMore()
    expect(none.failed).toBe(true)
  })

  it('matches new Standard Ebooks releases against a search', () => {
    const books = [{ segments: ['jane-austen', 'emma'], title: 'Emma', author: 'Jane Austen', epubUrl: '', pageUrl: '' }, { segments: ['x', 'y'], title: 'Other', author: 'Else', epubUrl: '', pageUrl: '' }] as SEBook[]
    expect(matchStandard(books, { q: 'austen', topic: '', sort: 'popular' }).map(c => c.title)).toEqual(['Emma'])
    expect(matchStandard(books, { q: '', topic: '', sort: 'popular' })).toHaveLength(2)
  })
})

describe('recommendations', () => {
  it('reads authors and topics from the library', () => {
    const t = tastes([{ title: 'Emma', author: 'Jane Austen', subjects: ['Love stories'] }, { title: 'Persuasion', author: 'Jane Austen' }, { title: 'A Study in Scarlet', author: 'Arthur Conan Doyle', subjects: ['Detective and mystery stories'] }, { title: 'x', author: 'Unknown author' }])
    expect(t.authors).toEqual(['Jane Austen', 'Arthur Conan Doyle'])
    expect(t.topics).toEqual(['Mystery'])
  })
  it('suggests other works by those authors, not what the library has; falls back to Popular when it has nothing to go on', async () => {
    const asked: string[] = []
    const pgCard = (t: string, a: string) => card({ source: 'gutenberg', title: t, author: a, id: `pg-${t}` })
    const s: Sources = {
      standard: async () => [], wikisource: async () => ({ cards: [], next: null, category: 0 }), openlibrary: async () => ({ cards: [], more: false }),
      gutenberg: async q => { asked.push(q.q || q.topic); return { cards: q.q === 'Austen' ? [pgCard('Emma', 'Jane Austen'), pgCard('Persuasion', 'Jane Austen'), pgCard('Sense and Sensibility', 'Jane Austen'), pgCard('Mansfield Park', 'Jane Austen'), pgCard('Northanger Abbey', 'Jane Austen')] : [pgCard('Popular Thing', 'Pop')], next: null } },
    }
    const r = await recommended([{ title: 'Emma', author: 'Jane Austen' }], s)
    expect(r.fallback).toBe(false)
    expect(asked[0]).toBe('Austen')
    expect(r.cards.map(c => c.title)).not.toContain('Emma')
    expect(r.cards.length).toBe(4)
    const empty = await recommended([], s)
    expect(empty.fallback).toBe(true)
    expect(empty.cards.map(c => c.title)).toEqual(['Popular Thing'])
  })

  it('Recommended falls back to Popular, quickly, when its own requests fail or hang', async () => {
    const pgCard = (t: string, a: string) => card({ title: t, author: a, source: 'gutenberg' })
    const opts: unknown[] = []
    const s: Sources = {
      standard: async () => [], wikisource: async () => ({ cards: [], next: null, category: 0 }), openlibrary: async () => ({ cards: [], more: false }),
      gutenberg: async (q, _c, o) => { opts.push(o); if (q.q === 'Austen') throw new Error('timed out'); if (q.q) return new Promise(() => {}); return { cards: [pgCard('Popular Thing', 'Pop'), pgCard('Emma', 'Jane Austen')], next: null } },
    }
    vi.useFakeTimers()
    try {
      const p = recommended([{ title: 'Emma', author: 'Jane Austen' }, { title: 'Dracula', author: 'Bram Stoker' }], s)
      await vi.advanceTimersByTimeAsync(ROW_FETCH.timeoutMs * 2 + 1000)     // the hung request is given up on
      const r = await p
      expect(r.fallback).toBe(true)
      expect(r.cards.map(c => c.title)).toEqual(['Popular Thing'])          // still minus what the library has
      expect(opts.every(o => o === ROW_FETCH)).toBe(true)                    // short timeout + one retry on every request
    } finally { vi.useRealTimers() }
  })
})

describe('cache and spacing', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('serves a cached list at once, and refreshes a stale one in the background', async () => {
    clearMemory()
    const f = vi.fn(async () => 'v1')
    expect(await swr('k1', f, { ttl: 1000 })).toBe('v1')
    expect(await swr('k1', f, { ttl: 1000 })).toBe('v1')
    expect(f).toHaveBeenCalledTimes(1)                    // fresh: no second request
    const seen: string[] = []
    const g = vi.fn(async () => 'v2')
    const out = await swr('k1', g, { ttl: -1, onCached: v => seen.push('cached:' + v), onFresh: v => seen.push('fresh:' + v) })
    expect(out).toBe('v2'); expect(seen).toEqual(['cached:v1', 'fresh:v2'])
    const failing = await swr('k1', async () => { throw new Error('offline') }, { ttl: -1 })
    expect(failing).toBe('v2')                            // offline: the stale copy still shows
  })
  it('spaces requests to a host at least the gap apart', async () => {
    let t = 0
    const waits: number[] = []
    const slot = throttle(1000, () => t, async ms => { waits.push(ms); t += ms })
    const starts: number[] = []
    await Promise.all([1, 2, 3].map(() => slot(async () => { starts.push(t) })))
    expect(starts).toEqual([0, 1000, 2000])
  })
})

describe('downloads that can’t be made from here', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('Wikisource: an unreachable or refused proxy becomes "Open on Wikisource"', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return new Response('host not allowed', { status: 403 }) })
    const err = await getWikisource('Dracula').catch(e => e)
    expect(err).toBeInstanceOf(OpenOnSource)
    expect(err.label).toBe('Wikisource'); expect(err.url).toBe('https://en.wikisource.org/wiki/Dracula')
    expect(calls).toEqual([PROXY + encodeURIComponent('https://ws-export.wmcloud.org/?lang=en&page=Dracula&format=epub-3')])
  })
  it('Internet Archive: restricted items and missing proxy access end in "Open on the Internet Archive"', async () => {
    vi.stubGlobal('fetch', async (u: string) => u.includes('/metadata/') ? new Response(JSON.stringify(fx('ia-metadata-restricted.json'))) : new Response('nope', { status: 403 }))
    const err = await getInternetArchive(['prideprejudice00aust']).catch(e => e)
    expect(err).toBeInstanceOf(OpenOnSource); expect(err.url).toBe('https://archive.org/details/prideprejudice00aust')
    vi.stubGlobal('fetch', async (u: string) => u.includes('/metadata/') ? new Response(JSON.stringify(fx('ia-metadata-open.json'))) : new Response('nope', { status: 403 }))
    expect(await getInternetArchive(['prideprejudice01aust']).catch(e => e)).toBeInstanceOf(OpenOnSource)
  })
})

describe('links', () => {
  it('recognises every source and direct files', () => {
    expect(parseLink('https://www.gutenberg.org/ebooks/1342')).toEqual({ kind: 'gutenberg' })
    expect(parseLink('https://standardebooks.org/ebooks/jane-austen/emma')).toEqual({ kind: 'standardebooks' })
    expect(parseLink('https://en.wikisource.org/wiki/A_Study_in_Scarlet_(Doyle)')).toEqual({ kind: 'wikisource', title: 'A Study in Scarlet (Doyle)' })
    expect(parseLink('https://en.wikisource.org/wiki/Author:Jane_Austen')).toBeNull()
    expect(parseLink('https://archive.org/details/prideprejudice01aust')).toEqual({ kind: 'archive', id: 'prideprejudice01aust' })
    expect(parseLink('https://example.com/files/book.epub')).toEqual({ kind: 'direct', url: 'https://example.com/files/book.epub' })
    expect(parseLink('https://example.com/page')).toBeNull()
  })
})

describe('signing in on Android', () => {
  it('appUrlOpen → exchangeCodeForSession(code), then the browser closes', async () => {
    const order: string[] = []
    const auth = { exchangeCodeForSession: vi.fn(async (code: string) => { order.push('exchange:' + code); return { data: {}, error: null } as never }) }
    const r = await completeNativeSignIn(`${NATIVE_REDIRECT}?code=abc123`, auth, async () => { order.push('close') })
    expect(r).toEqual({ ok: true })
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(order).toEqual(['close', 'exchange:abc123'])
  })
  it('reports an error return and ignores unrelated links', async () => {
    const auth = { exchangeCodeForSession: vi.fn() }
    expect(await completeNativeSignIn(`${NATIVE_REDIRECT}?error=access_denied&error_description=No+thanks`, auth, async () => {})).toEqual({ ok: false, error: 'No thanks' })
    expect((await completeNativeSignIn('https://example.com/?code=1', auth, async () => {})).ok).toBe(false)
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    const bad = { exchangeCodeForSession: async () => ({ data: {}, error: { message: 'bad verifier' } }) as never }
    expect(await completeNativeSignIn(`${NATIVE_REDIRECT}?code=zzz`, bad, async () => {})).toEqual({ ok: false, error: 'bad verifier' })
  })
})
