// Discover. Free public-domain books from Project Gutenberg (via Gutendex),
// plus, when FEATURES.authorPortal is on, books published through SAGA Author.
import { useCallback, useEffect, useState } from 'react'
import { store, href, go, toast, platform, DEMO_USERS } from '../../app/state'
import { FEATURES } from '../../app/features'
import { PlatformImg } from '../components'
import { importBytes } from '../../core/library'
import { Icon } from '../icons'
import { tintOf, fmtBytes } from '../../core/util'
import { UrlImport } from './Import'
import { cachedSE, fetchSENewReleases, cachedSEBook, getStandardEbook, seCatalogId, seSegmentsOf, unslug, SE_ORIGIN, type SEBook } from '../../app/standardebooks'
import { TOPICS, listUrl, fetchPage, cachedPopular, cachePopular, cachedBook, fetchBook, getBook, DownloadBlocked, authorsOf, personName, coverOf, shortTitle, catalogIdOf, gutenbergPage, type GBook } from '../../app/gutendex'

export interface CatalogItem { id: string; title: string; author: string; description: string; language: string; subjects: string[]; price: number; license: string; words: number; hasCover: boolean; fileSize: number; publishedAt: number; series?: string }
const reader = DEMO_USERS[0]

function CatCover({ item, width }: { item: CatalogItem; width?: number | string }) {
  const h = tintOf(item.title + item.author)
  if (item.hasCover) return <div className="cover" style={{ width }}><PlatformImg path={`/api/catalog/${item.id}/cover`} /></div>
  return <div className="cover gen" style={{ width, '--gen-bg': `hsl(${h} 28% 34%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties}><span className="t">{item.title}</span><span className="rule" /><span className="a">{item.author}</span></div>
}

const PRIVACY_NOTE = 'Getting a book from Discover tells that catalog which book you took, as a store would. Nothing about your reading is shared.'

function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => { const up = () => setOn(true), down = () => setOn(false); addEventListener('online', up); addEventListener('offline', down); return () => { removeEventListener('online', up); removeEventListener('offline', down) } }, [])
  return on
}

export function Catalog() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [topic, setTopic] = useState('')
  const [source, setSource] = useState<'pg' | 'se'>(() => (localStorage.getItem('saga.discover.source') === 'se' ? 'se' : 'pg'))
  useEffect(() => { try { localStorage.setItem('saga.discover.source', source) } catch { /* private mode */ } }, [source])
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 450); return () => clearTimeout(t) }, [q])
  return (
    <>
      <h1 className="page-title">Discover</h1>
      <p className="page-sub">Free public-domain books from Project Gutenberg and Standard Ebooks. Each one is a DRM-free file you keep, the same as anything you import.</p>
      <div className="row wrap" style={{ gap: 6, marginBottom: 18 }} role="group" aria-label="Source">
        <button className="chip" aria-pressed={source === 'pg'} onClick={() => setSource('pg')}>Project Gutenberg</button>
        <button className="chip" aria-pressed={source === 'se'} onClick={() => setSource('se')}>Standard Ebooks</button>
      </div>
      {source === 'pg' ? <>
        <label className="search-input" style={{ display: 'block', maxWidth: 520, marginBottom: 14 }}><span className="sr-only">Search free books</span><Icon.search /><input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search titles and authors" /></label>
        <div className="row wrap" style={{ gap: 6, marginBottom: 22 }} role="group" aria-label="Topics">
          <button className="chip" aria-pressed={!topic} onClick={() => setTopic('')}>Popular</button>
          {TOPICS.map(t => <button key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(topic === t ? '' : t)}>{t}</button>)}
        </div>
        {FEATURES.authorPortal && <AuthorCatalogSection q={debounced} />}
        <GutenbergList search={debounced} topic={topic} />
      </> : <StandardEbooksList />}
      <section aria-labelledby="paste-h" style={{ marginTop: 34 }}>
        <h2 className="section-title" id="paste-h">Have a link?</h2>
        <UrlImport />
      </section>
      <p className="small muted" style={{ marginTop: 30 }}>Free public-domain books from <a href="https://www.gutenberg.org" target="_blank" rel="noreferrer">Project Gutenberg</a> and <a href={SE_ORIGIN} target="_blank" rel="noreferrer">Standard Ebooks</a>. {PRIVACY_NOTE}</p>
    </>
  )
}

// ---------- Standard Ebooks (public new-releases feed; downloads fetched directly, CORS allowed)
function SECover({ b, width }: { b: SEBook; width?: number | string }) {
  const [broken, setBroken] = useState(false)
  if (b.cover && !broken) return <div className="cover" style={{ width }}><img src={b.cover} alt="" loading="lazy" onError={() => setBroken(true)} /></div>
  const h = tintOf(b.title + b.author)
  return <div className="cover gen" style={{ width, '--gen-bg': `hsl(${h} 28% 34%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties}><span className="t">{b.title}</span><span className="rule" /><span className="a">{b.author}</span></div>
}

function StandardEbooksList() {
  const online = useOnline()
  const cached = cachedSE()
  const [books, setBooks] = useState<SEBook[] | null>(cached?.books ?? null)
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading')
  useEffect(() => {
    let live = true
    if (!online) { setState('offline'); return }
    setState('loading')
    fetchSENewReleases().then(b => { if (live) { setBooks(b); setState('ready') } }).catch(() => { if (live) setState(navigator.onLine ? 'error' : 'offline') })
    return () => { live = false }
  }, [online])
  return (
    <section aria-labelledby="se-h" aria-busy={state === 'loading'}>
      <h2 className="section-title" id="se-h">New from Standard Ebooks</h2>
      <p className="small muted" style={{ marginTop: -6 }}>Carefully produced editions of public-domain books. Standard Ebooks’ full catalogue feed needs a membership, so this lists their public new-releases feed; for any other title, open it on <a href={`${SE_ORIGIN}/ebooks`} target="_blank" rel="noreferrer">standardebooks.org</a> and paste its link below.</p>
      {state === 'offline' && <div className="banner warn" role="status">Discover needs an internet connection; your library still works offline.{cached ? ` Showing the list from ${new Date(cached.at).toLocaleDateString()}.` : ''}</div>}
      {state === 'error' && <div className="banner warn" role="status">Standard Ebooks’ feed couldn’t be loaded in this browser. Browse <a href={`${SE_ORIGIN}/ebooks`} target="_blank" rel="noreferrer">standardebooks.org</a> and paste a book’s link below; the download itself works directly.</div>}
      {state === 'loading' && !books?.length && <p className="muted">Loading books…</p>}
      {!!books?.length && <div className="shelf">{books.map(b => <a key={b.pageUrl} className="book-tile" href={href(`catalog/${seCatalogId(b.segments)}`)}><SECover b={b} /><div className="meta"><h3>{b.title}</h3><p>{b.author}</p></div></a>)}</div>}
    </section>
  )
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
          {blocked && <div className="banner" style={{ marginTop: 16, maxWidth: 620 }} role="status"><span>Your browser didn’t let SAGA Reader download this file directly. <a href={blocked} target="_blank" rel="noreferrer">Download it from Standard Ebooks</a>, then add it with <b>Add books</b> in your Library or drop it onto this window.</span></div>}
          {b.summary && <p className="desc" style={{ marginTop: 22 }}>{b.summary}</p>}
          <dl className="facts" style={{ marginTop: 22 }}>
            <dt>Rights</dt><dd>Public domain in the USA; Standard Ebooks releases its own work on the edition under CC0. If you live elsewhere, check your country’s copyright rules.</dd>
            <dt>Source</dt><dd><a href={b.pageUrl} target="_blank" rel="noreferrer">This book on Standard Ebooks</a>. The EPUB is downloaded straight from standardebooks.org.</dd>
          </dl>
          <p className="small muted">{PRIVACY_NOTE}</p>
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

function GutenbergList({ search, topic }: { search: string; topic: string }) {
  const online = useOnline()
  const popular = !search.trim() && !topic
  const [books, setBooks] = useState<GBook[] | null>(() => (popular ? cachedPopular()?.page.results ?? null : null))
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error' | 'more'>('loading')
  const [stale, setStale] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    const cached = popular ? cachedPopular() : null
    setBooks(cached?.page.results ?? (popular ? null : null)); setNext(null); setStale(null)
    if (!online) { setState('offline'); if (cached) setStale(cached.at); return }
    setState('loading')
    fetchPage(listUrl({ search, topic })).then(p => {
      if (!live) return
      if (popular) cachePopular(p)
      setBooks(p.results); setNext(p.next); setState('ready')
    }).catch(() => { if (!live) return; setState(navigator.onLine ? 'error' : 'offline'); if (cached) setStale(cached.at) })
    return () => { live = false }
  }, [search, topic, online, popular])
  const more = useCallback(async () => {
    if (!next) return
    setState('more')
    try { const p = await fetchPage(next); setBooks(b => [...(b ?? []), ...p.results]); setNext(p.next); setState('ready') } catch { setState(navigator.onLine ? 'error' : 'offline') }
  }, [next])

  const heading = search.trim() ? `Results for “${search.trim()}”${topic ? ` in ${topic}` : ''}` : topic || 'Popular'
  return (
    <section aria-labelledby="g-h" aria-busy={state === 'loading'}>
      <h2 className="section-title" id="g-h">{heading}</h2>
      {state === 'offline' && <div className="banner warn" role="status">Discover needs an internet connection; your library still works offline.{stale ? ` Showing the popular list from ${new Date(stale).toLocaleDateString()}.` : ''}</div>}
      {state === 'error' && <div className="banner warn" role="status">Project Gutenberg’s catalog didn’t answer. Try again in a moment; your library works as usual.{stale ? ' Showing the last popular list.' : ''}</div>}
      {state === 'loading' && !books?.length && <p className="muted">Loading books…</p>}
      {state === 'ready' && books && !books.length && <div className="empty"><h2>No free books match</h2><p>Try an author’s surname, fewer words, or another topic.</p></div>}
      {!!books?.length && <div className="shelf">{books.map(b => <a key={b.id} className="book-tile" href={href(`catalog/pg-${b.id}`)}><GCover b={b} /><div className="meta"><h3>{shortTitle(b.title)}</h3><p>{authorsOf(b)}</p></div></a>)}</div>}
      {next && (state === 'ready' || state === 'more') && <div style={{ marginTop: 22 }}><button className="btn" disabled={state === 'more'} onClick={more}>{state === 'more' ? 'Loading…' : 'Show more'}</button></div>}
    </section>
  )
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
          {blocked && <div className="banner" style={{ marginTop: 16, maxWidth: 620 }} role="status"><span>Your browser didn’t let SAGA Reader download this file directly, so the download opens from Project Gutenberg in a new tab (<a href={blocked} target="_blank" rel="noreferrer">open it here</a> if nothing appeared). When it has downloaded, add it with <b>Add books</b> in your Library, or drop the file onto this window.</span></div>}
          {!!b.summaries?.length && <p className="desc" style={{ marginTop: 22 }}>{b.summaries[0]}</p>}
          <dl className="facts" style={{ marginTop: 22 }}>
            {!!b.subjects.length && <><dt>Subjects</dt><dd>{b.subjects.join('; ')}</dd></>}
            {!!b.bookshelves.length && <><dt>Shelves</dt><dd>{b.bookshelves.map(s => s.replace(/^Category:\s*/, '')).join(', ')}</dd></>}
            {!!b.translators?.length && <><dt>Translated by</dt><dd>{b.translators.map(personName).join(', ')}</dd></>}
            <dt>Language</dt><dd>{b.languages.join(', ')}</dd>
            <dt>Rights</dt><dd>Public domain in the USA. If you live elsewhere, check your country’s copyright rules.</dd>
            <dt>Source</dt><dd><a href={gutenbergPage(b.id)} target="_blank" rel="noreferrer">Project Gutenberg eBook #{b.id}</a>, digitised by volunteers. {b.download_count ? `Downloaded ${b.download_count.toLocaleString()} times in the last 30 days.` : ''}</dd>
          </dl>
          <p className="small muted">{PRIVACY_NOTE}</p>
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
  if (/^se~[a-z0-9-]+(~[a-z0-9-]+)+$/.test(id)) return <SEItemView id={id} />
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
