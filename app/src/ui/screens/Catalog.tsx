// Discover: one page over Standard Ebooks, Project Gutenberg, Wikisource and the Internet Archive's scans
// (app/discover.ts). Carousels on a phone, rows plus a grid on a desktop, infinite scroll on every grid.
// When FEATURES.authorPortal is on it also lists books published through SAGA Author.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { store, href, go, toast, platform, DEMO_USERS, useRoute, useLive } from '../../app/state'
import { FEATURES } from '../../app/features'
import { PlatformImg } from '../components'
import { importBytes } from '../../core/library'
import { Icon } from '../icons'
import { tintOf, fmtBytes } from '../../core/util'
import { importUi } from './ImportModal'
import { loadBooks } from '../../app/data'
import { CardTile, Carousel, DCover, Skeletons, prefetchCovers, useMobile } from '../discoverParts'
import { SOURCE_LABEL, type DiscoverCard } from '../../app/card'
import { TOPICS, SORTS, createFeed, rowCards, rowFeed, rowTitle, rememberCards, cardById, getByCatalogId, openLabel, OpenOnSource, catalogHref, emptyQuery, type Feed, type Query, type RowId, type Sort } from '../../app/discover'
import { swr, peekSync } from '../../app/swr'
import { cachedSEBook, getStandardEbook, seCatalogId, seSegmentsOf, unslug, SE_ORIGIN, type SEBook } from '../../app/standardebooks'
import { cachedBook, fetchBook, getBook, DownloadBlocked, authorsOf, personName, coverOf, shortTitle, catalogIdOf, gutenbergPage, type GBook } from '../../app/gutendex'
import { PRODUCT } from '../../app/product'

export interface CatalogItem { id: string; title: string; author: string; description: string; language: string; subjects: string[]; price: number; license: string; words: number; hasCover: boolean; fileSize: number; publishedAt: number; series?: string }
const reader = DEMO_USERS[0]

function CatCover({ item, width }: { item: CatalogItem; width?: number | string }) {
  const h = tintOf(item.title + item.author)
  if (item.hasCover) return <div className="cover" style={{ width }}><PlatformImg path={`/api/catalog/${item.id}/cover`} /></div>
  return <div className="cover gen" style={{ width, '--gen-bg': `hsl(${h} 28% 34%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties}><span className="t">{item.title}</span><span className="rule" /><span className="a">{item.author}</span></div>
}

function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => { const up = () => setOn(true), down = () => setOn(false); addEventListener('online', up); addEventListener('offline', down); return () => { removeEventListener('online', up); removeEventListener('offline', down) } }, [])
  return on
}
const replaceHash = (h: string) => { location.replace(h) }
const discoverHref = (p: { q?: string; topic?: string; sort?: string; row?: string }) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v && !(k === 'sort' && v === 'popular')) u.set(k, v)
  const s = u.toString()
  return '#/catalog' + (s ? '?' + s : '')
}

export function Catalog() {
  const route = useRoute()
  const mobile = useMobile()
  const online = useOnline()
  const topic = route.query.get('topic') ?? '', sort = (route.query.get('sort') as Sort | null) ?? 'popular', row = route.query.get('row') as RowId | null
  const urlQ = route.query.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  useEffect(() => { setQ(urlQ) }, [urlQ])
  useEffect(() => { if (q === urlQ) return; const t = setTimeout(() => { const now = new URLSearchParams(location.hash.split('?')[1] ?? ''); replaceHash(discoverHref({ q: q.trim(), topic: now.get('topic') ?? '', sort: now.get('sort') ?? 'popular' })) }, 450); return () => clearTimeout(t) }, [q])  // eslint-disable-line react-hooks/exhaustive-deps
  const searching = !!(urlQ.trim() || topic)
  const library = useLive(loadBooks, [], ['books'])
  const query: Query = useMemo(() => ({ q: urlQ.trim(), topic, sort }), [urlQ, topic, sort])
  const heading = row ? rowTitle(row) : searching ? `${urlQ.trim() ? `Results for “${urlQ.trim()}”` : topic}${urlQ.trim() && topic ? ` in ${topic}` : ''}` : 'Popular'

  return (
    <>
      <h1 className="page-title">Discover</h1>
      <div className="d-search">
        <label className="search-input"><span className="sr-only">Search free books</span><Icon.search /><input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search titles and authors" /></label>
        <button className="icon-btn" onClick={() => importUi.open({ link: true })} aria-label="Have a link? Add a book from a link" title="Have a link?"><Icon.link /></button>
      </div>
      <div className="chip-row" role="group" aria-label="Topics">
        {TOPICS.map(t => <button key={t} className="chip" aria-pressed={topic === t} onClick={() => replaceHash(discoverHref({ q: urlQ.trim(), topic: topic === t ? '' : t, sort }))}>{t}</button>)}
      </div>
      {!online && <div className="banner warn" role="status">Discover needs an internet connection; your library still works offline. Lists you have seen before still show.</div>}
      {FEATURES.authorPortal && !row && !searching && <AuthorCatalogSection q="" />}

      {row ? <>
        <div className="d-grid-head"><a href={discoverHref({})} className="btn quiet small" style={{ marginLeft: -10 }}><Icon.back />Discover</a><h2 className="section-title" id="grid-h">{heading}</h2></div>
        <FeedGrid key={row} makeFeed={() => rowFeed(row, library ?? [])} ready={row !== 'recommended' || !!library} />
      </> : searching ? <>
        <div className="d-grid-head"><h2 className="section-title" id="grid-h">{heading}</h2>
          <select className="input" style={{ width: 'auto' }} value={sort} aria-label="Sort by" onChange={e => replaceHash(discoverHref({ q: urlQ.trim(), topic, sort: e.target.value }))}>{SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <FeedGrid key={JSON.stringify(query)} makeFeed={() => createFeed(query)} empty="No free books match. Try an author’s surname, fewer words, or another topic." />
      </> : <>
        <Rows library={library} />
        {!mobile && <>
          <div className="d-grid-head"><h2 className="section-title" id="grid-h">Browse all</h2>
            <select className="input" style={{ width: 'auto' }} value={sort} aria-label="Sort by" onChange={e => replaceHash(discoverHref({ sort: e.target.value }))}>{SORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <FeedGrid key={'all-' + sort} makeFeed={() => createFeed({ ...emptyQuery, sort })} />
        </>}
      </>}
      <p className="small muted" style={{ marginTop: 30 }}>Free public-domain books from <a href={SE_ORIGIN} target="_blank" rel="noreferrer">Standard Ebooks</a>, <a href="https://www.gutenberg.org" target="_blank" rel="noreferrer">Project Gutenberg</a>, <a href="https://en.wikisource.org" target="_blank" rel="noreferrer">Wikisource</a> and the <a href="https://archive.org" target="_blank" rel="noreferrer">Internet Archive</a>.</p>
    </>
  )
}

// ---------- rows (carousels): Recommended, Popular, New from Standard Ebooks, then one per topic. Each loads when it nears the screen.
const ROWS: RowId[] = ['recommended', 'popular', 'standard-new', ...TOPICS.map(t => `topic:${t}` as RowId)]
function Rows({ library }: { library: { title: string; author: string; subjects?: string[]; catalogId?: string }[] | undefined }) {
  return <>{ROWS.map((id, i) => <LazyRow key={id} id={id} index={i} library={library} />)}</>
}
function LazyRow({ id, index, library }: { id: RowId; index: number; library: { title: string; author: string; subjects?: string[]; catalogId?: string }[] | undefined }) {
  const host = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(index < 2)
  const sig = id === 'recommended' ? (library ?? []).map(b => b.author).sort().join('|').length + ':' + (library?.length ?? 0) : ''
  const warm = peekSync<DiscoverCard[]>(`row:v1:${id}:${sig}`)?.value ?? null   // a returning visit paints at once
  const [cards, setCards] = useState<DiscoverCard[] | null>(warm)
  const [loading, setLoading] = useState(!warm)
  useEffect(() => {
    if (near) return
    const el = host.current; if (!el) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: '150px 0px' })
    io.observe(el); return () => io.disconnect()
  }, [near])
  useEffect(() => {
    if (!near || (id === 'recommended' && !library)) return
    let live = true
    setLoading(true)
    // the Standard Ebooks feed waits until the first row has painted, so the first request goes out alone
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = () => swr<DiscoverCard[]>(`row:v1:${id}:${sig}`, () => rowCards(id, library ?? []), {
      ttl: id === 'recommended' ? 3600_000 : undefined,
      onCached: v => { if (live) { setCards(v); prefetchCovers(v, index < 2 ? 10 : 0) } },
      onFresh: v => { if (live) setCards(v) },
    }).then(v => { if (live) { setCards(v); void rememberCards(v); if (index < 2) prefetchCovers(v) } })
      .catch(() => { if (live) setCards(c => c ?? []) })
      .finally(() => { if (live) setLoading(false) })
    if (id === 'standard-new' && !warm) timer = setTimeout(go, 500); else go()
    return () => { live = false; clearTimeout(timer) }
  }, [near, id, sig, !!library])  // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={host}><Carousel id={id} title={rowTitle(id)} cards={cards} loading={loading || !near} seeAll={discoverHref({ row: id })} priority={index < 2} empty={id === 'standard-new' ? 'Standard Ebooks’ new releases couldn’t be loaded right now.' : undefined} /></div>
}

// ---------- grid with infinite scroll: an IntersectionObserver sentinel, the next page prefetched as soon as this one renders
function FeedGrid({ makeFeed, empty, ready = true }: { makeFeed: () => Feed; empty?: string; ready?: boolean }) {
  const feed = useMemo(() => (ready ? makeFeed() : null), [ready])  // eslint-disable-line react-hooks/exhaustive-deps
  const [cards, setCards] = useState<DiscoverCard[]>([])
  const [state, setState] = useState<'loading' | 'idle' | 'done' | 'error'>('loading')
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    if (!feed || busy.current) return
    busy.current = true; setState('loading')
    try {
      const b = await feed.loadMore()
      setCards(c => { const have = new Set(c.map(x => x.id)); return [...c, ...b.filter(x => !have.has(x.id))] })
      void rememberCards(b); prefetchCovers(b, 10)
      setState(feed.done ? 'done' : 'idle')
    } catch { setState('error') } finally { busy.current = false }
  }, [feed])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (state === 'idle') feed?.prefetch() }, [cards, state, feed])
  useEffect(() => {
    const el = sentinel.current
    if (!el || state !== 'idle') return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) void load() }, { rootMargin: '900px 0px' })
    io.observe(el); return () => io.disconnect()
  }, [state, cards.length, load])
  if (!feed) return <div className="shelf" aria-busy="true"><Skeletons n={12} /></div>
  return (
    <section aria-labelledby="grid-h" aria-busy={state === 'loading'}>
      {state === 'error' && <div className="banner warn" role="status"><span>{feed.failed || !cards.length ? 'Discover couldn’t load books right now. Your library works as usual.' : 'More books couldn’t be loaded.'}</span><button className="btn small" onClick={() => { setState('idle'); void load() }}>Try again</button></div>}
      {state === 'done' && !cards.length && <div className="empty"><h2>No free books match</h2><p>{empty ?? 'Nothing here right now.'}</p></div>}
      <div className="shelf" data-testid="discover-grid">
        {cards.map((c, i) => <CardTile key={c.id} card={c} priority={i < 8} />)}
        {state === 'loading' && <Skeletons n={cards.length ? 6 : 12} />}
      </div>
      {state === 'idle' && <div ref={sentinel} className="sentinel" data-sentinel />}
      {state === 'done' && !!cards.length && <p className="end-note">That’s everything for now.</p>}
    </section>
  )
}

// ---------- Wikisource and Internet Archive item page
function CardItemView({ id }: { id: string }) {
  const online = useOnline()
  const [c, setC] = useState<(DiscoverCard & { iaIds?: string[] }) | null>(null)
  const [owned, setOwned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<{ url: string; label: string } | null>(null)
  useEffect(() => { void cardById(id).then(setC) }, [id])
  useEffect(() => { store.db.books.where('catalogId').equals(id).first().then(x => setOwned(x && !x.deleted ? x.id : null)) }, [id, busy])
  if (!c) return <p className="muted">Loading…</p>
  async function get() {
    if (!navigator.onLine) { toast('Getting a book needs an internet connection.'); return }
    setBusy(true); setBlocked(null)
    try {
      const r = await getByCatalogId(id, c!)
      toast(`“${r.title}” is in your library`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
      setOwned(r.bookId)
    } catch (e) {
      if (e instanceof OpenOnSource) setBlocked({ url: e.url, label: openLabel(c!) })
      else if (e instanceof DownloadBlocked) setBlocked({ url: e.url, label: openLabel(c!) })
      else toast((e as Error).message, undefined, 7000)
    } finally { setBusy(false) }
  }
  return (
    <>
      <a href={href('catalog')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 18 }}><Icon.back />Discover</a>
      <div className="detail">
        <DCover card={c} width="100%" priority />
        <div>
          <h1>{c.title}</h1>
          <p className="by">{c.author}</p>
          <div className="row wrap">
            {owned ? <a className="btn primary" href={href(`read/${owned}`)}>Read</a> : <button className="btn primary" disabled={busy || !online} onClick={get}><Icon.download />{busy ? 'Getting book…' : 'Get book'}</button>}
            {owned && <span className="pill ok"><Icon.check width={14} />In your library</span>}
          </div>
          {blocked && <div className="banner" style={{ marginTop: 16, maxWidth: 620 }} role="status"><span>This one can’t be downloaded from here yet. <a href={blocked.url} target="_blank" rel="noreferrer">{blocked.label}</a> to read or save it, then add the file from your Library.</span></div>}
          {c.summary && <p className="desc" style={{ marginTop: 22 }}>{c.summary}</p>}
          <dl className="facts" style={{ marginTop: 22 }}>
            {c.year ? <><dt>First published</dt><dd>{c.year}</dd></> : null}
            {!!c.subjects.length && <><dt>Subjects</dt><dd>{c.subjects.join('; ')}</dd></>}
            {c.scanned && <><dt>Quality</dt><dd>Scanned from a print copy; the text is machine-read and may contain errors.</dd></>}
            <dt>Source</dt><dd><a href={c.pageUrl} target="_blank" rel="noreferrer">{SOURCE_LABEL[c.source]}</a></dd>
          </dl>
        </div>
      </div>
    </>
  )
}


// ---------- Standard Ebooks item page (the book lives at standardebooks.org; downloads fetched directly, CORS allowed)
function SECover({ b, width }: { b: SEBook; width?: number | string }) {
  return <DCover card={{ id: seCatalogId(b.segments), title: b.title, author: b.author, cover: b.cover }} width={width} />
}

function SEItemView({ id }: { id: string }) {
  const segments = seSegmentsOf(id)
  const b: SEBook = cachedSEBook(segments) ?? { segments, title: unslug(segments[1] ?? ''), author: unslug(segments[0] ?? ''), pageUrl: `${SE_ORIGIN}/ebooks/${segments.join('/')}`, epubUrl: `${SE_ORIGIN}/ebooks/${segments.join('/')}/downloads/${segments.join('_')}.epub?source=download` }
  const [owned, setOwned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  useEffect(() => { store.db.books.where('catalogId').equals(id).first().then(x => setOwned(x && !x.deleted ? x.id : null)) }, [id, busy])
  async function get() {
    if (!navigator.onLine) { toast('Getting a book needs an internet connection.'); return }
    setBusy(true); setBlocked(null)
    try {
      const r = await getStandardEbook(b, b.title)
      toast(`“${r.title}” is in your library`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
      setOwned(r.bookId)
    } catch (e) {
      if (e instanceof DownloadBlocked) setBlocked(e.url)
      else toast((e as Error).message, undefined, 7000)
    } finally { setBusy(false) }
  }
  return (
    <>
      <a href={href('catalog')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 18 }}><Icon.back />Discover</a>
      <div className="detail">
        <SECover b={b} width="100%" />
        <div>
          <h1>{b.title}</h1>
          <p className="by">{b.author}</p>
          <div className="row wrap">
            {owned ? <a className="btn primary" href={href(`read/${owned}`)}>Read</a> : <button className="btn primary" disabled={busy} onClick={get}><Icon.download />{busy ? 'Getting book…' : 'Get book'}</button>}
            {owned && <span className="pill ok"><Icon.check width={14} />In your library</span>}
          </div>
          {blocked && <div className="banner" style={{ marginTop: 16, maxWidth: 620 }} role="status"><span>Your browser didn’t let {PRODUCT.name} download this file directly. <a href={blocked} target="_blank" rel="noreferrer">Download it from Standard Ebooks</a>, then add it with <b>Add books</b> in your Library or drop it onto this window.</span></div>}
          {b.summary && <p className="desc" style={{ marginTop: 22 }}>{b.summary}</p>}
          <dl className="facts" style={{ marginTop: 22 }}>
            <dt>Rights</dt><dd>Public domain in the USA; the Standard Ebooks edition is CC0.</dd>
            <dt>Source</dt><dd><a href={b.pageUrl} target="_blank" rel="noreferrer">Standard Ebooks</a></dd>
          </dl>
        </div>
      </div>
    </>
  )
}

function GCover({ b, width }: { b: GBook; width?: number | string }) {
  const [broken, setBroken] = useState(false)
  const src = coverOf(b)
  if (src && !broken) return <div className="cover" style={{ width }}><img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /></div>
  const h = tintOf(b.title + b.id)
  return <div className="cover gen" style={{ width, '--gen-bg': `hsl(${h} 28% 34%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties}><span className="t">{shortTitle(b.title)}</span><span className="rule" /><span className="a">{authorsOf(b)}</span></div>
}

function GutenbergItemView({ id }: { id: number }) {
  const online = useOnline()
  const [b, setB] = useState<GBook | null | undefined>(() => cachedBook(id) ?? undefined)
  const [err, setErr] = useState('')
  const [owned, setOwned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  useEffect(() => {
    if (cachedBook(id) && !online) return
    if (!online) { if (!b) setErr('Discover needs an internet connection; your library still works offline.'); return }
    fetchBook(id).then(setB).catch(e => { if (!cachedBook(id)) { setB(null); setErr((e as Error).message) } })
  }, [id, online])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { store.db.books.where('catalogId').equals(catalogIdOf(id)).first().then(x => setOwned(x && !x.deleted ? x.id : null)) }, [id, busy])
  const back = <a href={href('catalog')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 18 }}><Icon.back />Discover</a>
  if (!b) return <>{back}{err ? <div className="empty"><h2>Book unavailable</h2><p>{err}</p></div> : <p className="muted">Loading…</p>}</>
  async function get() {
    if (!navigator.onLine) { toast('Getting a book needs an internet connection.'); return }
    setBusy(true); setBlocked(null)
    try {
      const r = await getBook(b!)
      toast(`“${r.title}” is in your library`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
      setOwned(r.bookId)
    } catch (e) {
      if (e instanceof DownloadBlocked) { setBlocked(e.url); window.open(e.url, '_blank', 'noopener') }
      else toast((e as Error).message, undefined, 7000)
    } finally { setBusy(false) }
  }
  const years = (p: { birth_year: number | null; death_year: number | null }) => p.birth_year || p.death_year ? ` (${p.birth_year ?? '?'}–${p.death_year ?? ''})` : ''
  return (
    <>
      {back}
      <div className="detail">
        <GCover b={b} width="100%" />
        <div>
          <h1>{b.title}</h1>
          <p className="by">{b.authors.length ? b.authors.map(a => personName(a) + years(a)).join(', ') : 'Unknown author'}</p>
          <div className="row wrap">
            {owned ? <a className="btn primary" href={href(`read/${owned}`)}>Read</a> : <button className="btn primary" disabled={busy} onClick={get}><Icon.download />{busy ? 'Getting book…' : 'Get book'}</button>}
            {owned && <span className="pill ok"><Icon.check width={14} />In your library</span>}
          </div>
          {blocked && <div className="banner" style={{ marginTop: 16, maxWidth: 620 }} role="status"><span>Your browser didn’t let {PRODUCT.name} download this file directly, so the download opens from Project Gutenberg in a new tab (<a href={blocked} target="_blank" rel="noreferrer">open it here</a> if nothing appeared). When it has downloaded, add it with <b>Add books</b> in your Library, or drop the file onto this window.</span></div>}
          {!!b.summaries?.length && <p className="desc" style={{ marginTop: 22 }}>{b.summaries[0]}</p>}
          <dl className="facts" style={{ marginTop: 22 }}>
            {!!b.subjects.length && <><dt>Subjects</dt><dd>{b.subjects.join('; ')}</dd></>}
            {!!b.bookshelves.length && <><dt>Shelves</dt><dd>{b.bookshelves.map(s => s.replace(/^Category:\s*/, '')).join(', ')}</dd></>}
            {!!b.translators?.length && <><dt>Translated by</dt><dd>{b.translators.map(personName).join(', ')}</dd></>}
            <dt>Language</dt><dd>{b.languages.join(', ')}</dd>
            <dt>Rights</dt><dd>Public domain in the USA</dd>
            <dt>Source</dt><dd><a href={gutenbergPage(b.id)} target="_blank" rel="noreferrer">Project Gutenberg eBook #{b.id}</a></dd>
          </dl>
        </div>
      </div>
    </>
  )
}

// ---------- SAGA Author catalog (only when FEATURES.authorPortal is on)
function AuthorCatalogSection({ q }: { q: string }) {
  const [items, setItems] = useState<CatalogItem[]>([])
  useEffect(() => { platform(`/api/catalog?q=${encodeURIComponent(q)}`).then(r => setItems(r as CatalogItem[])).catch(() => setItems([])) }, [q])
  if (!items.length) return null
  return <>
    <h2 className="section-title">From SAGA Author <span className="pill">Demo</span></h2>
    <p className="small muted" style={{ marginTop: -6 }}>Published through the SAGA Author prototype. No payments are taken; priced books record a test sale.</p>
    <div className="shelf" style={{ marginBottom: 34 }}>{items.map(i => <a key={i.id} className="book-tile" href={href(`catalog/${i.id}`)}><CatCover item={i} /><div className="meta"><h3>{i.title}</h3><p>{i.author}</p><p>{i.price ? `$${i.price.toFixed(2)}` : 'Free'}</p></div></a>)}</div>
  </>
}

export function CatalogItemView({ id }: { id: string }) {
  if (/^pg-\d+$/.test(id)) return <GutenbergItemView id={Number(id.slice(3))} />
  if (/^se~[a-z0-9-]+(~[a-z0-9_-]+)+$/.test(id)) return <SEItemView id={id} />
  if (/^(ws|ia)~./.test(id)) return <CardItemView id={id} />
  if (FEATURES.authorPortal) return <PlatformItemView id={id} />
  return <div className="empty"><h2>Not in Discover</h2><a className="btn" href={href('catalog')}>Discover</a></div>
}

function PlatformItemView({ id }: { id: string }) {
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [owned, setOwned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { platform(`/api/catalog/${id}`).then(r => setItem(r as CatalogItem)).catch(() => setItem(null)) }, [id])
  useEffect(() => { store.db.books.where('catalogId').equals(id).first().then(b => setOwned(b && !b.deleted ? b.id : null)) }, [id, busy])
  if (!item) return null
  async function get() {
    setBusy(true)
    try {
      await platform(`/api/catalog/${id}/acquire`, { method: 'POST' }, reader)
      const file = new Uint8Array(await platform(`/api/catalog/${id}/file`) as ArrayBuffer)
      const r = await importBytes(store, `${item!.title}.epub`, file, { source: 'catalog', catalogId: id, license: item!.license })
      if (r.status === 'failed') throw new Error(r.error)
      toast(`“${item!.title}” is in your library`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
      setOwned(r.bookId!)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <>
      <a href={href('catalog')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 18 }}><Icon.back />Discover</a>
      <div className="detail">
        <CatCover item={item} width="100%" />
        <div>
          <h1>{item.title}</h1>
          <p className="by">{item.author}</p>
          <div className="row wrap">
            {owned ? <a className="btn primary" href={href(`read/${owned}`)}>Read</a> : <button className="btn primary" disabled={busy} onClick={get}>{busy ? 'Adding…' : item.price ? `Get for $${item.price.toFixed(2)} (test, no charge)` : 'Get free'}</button>}
            {owned && <span className="pill ok"><Icon.check width={14} />In your library</span>}
          </div>
          <p className="desc" style={{ marginTop: 22 }}>{item.description}</p>
          <dl className="facts">
            <dt>Length</dt><dd>{item.words.toLocaleString()} words, about {Math.max(1, Math.round(item.words / 250 / 60))} hours</dd>
            <dt>Licence</dt><dd>{item.license}</dd>
            <dt>File</dt><dd>EPUB, {fmtBytes(item.fileSize)}, no DRM</dd>
            <dt>Language</dt><dd>{item.language}</dd>
            {!!item.subjects.length && <><dt>Subjects</dt><dd>{item.subjects.join(', ')}</dd></>}
          </dl>
        </div>
      </div>
    </>
  )
}
