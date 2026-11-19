import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { store, useLive, href, useRoute } from '../../app/state'
import { loadBooks, loadAnnotations, type BookView } from '../../app/data'
import { searchText, type Hit } from '../../core/library'
import { Cover } from '../components'
import { Icon } from '../icons'
import { norm } from '../../core/util'

export function Search() {
  const route = useRoute()
  const [q, setQ] = useState(route.query.get('q') ?? '')
  const books = useLive(loadBooks, [], ['books'])
  const anns = useLive(() => loadAnnotations(), [], ['annotations'])
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [ms, setMs] = useState(0)
  const byId = useMemo(() => new Map((books ?? []).map(b => [b.id, b])), [books])
  const titleIndex = useMemo(() => { const m = new MiniSearch<BookView>({ fields: ['title', 'author', 'series'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } } }); m.addAll(books ?? []); return m }, [books])
  const bookHits = q.trim().length > 1 ? titleIndex.search(q).slice(0, 8).map(r => byId.get(r.id)!).filter(Boolean) : []
  const noteHits = q.trim().length > 1 ? (anns ?? []).filter(a => !a.deleted && norm(`${a.exact} ${a.note}`).includes(norm(q))).slice(0, 6) : []
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return }
    const sig = { aborted: false }
    const t = setTimeout(async () => { const t0 = performance.now(); const r = await searchText(store, q, { limit: 200, signal: sig }); if (!sig.aborted) { setHits(r); setMs(Math.round(performance.now() - t0)) } }, 200)
    return () => { sig.aborted = true; clearTimeout(t) }
  }, [q])
  const grouped = useMemo(() => { const m = new Map<string, Hit[]>(); for (const h of hits ?? []) m.set(h.bookId, [...(m.get(h.bookId) ?? []), h]); return [...m] }, [hits])

  return (
    <>
      <h1 className="page-title">Search</h1>
      <p className="page-sub">Looks through titles, your notes and the full text of every book, on this device. Nothing is sent anywhere.</p>
      <label className="search-input" style={{ maxWidth: 640, display: 'block', marginBottom: 28 }}><span className="sr-only">Search everything</span><Icon.search /><input autoFocus className="input" style={{ height: 48, fontSize: 17 }} value={q} onChange={e => { setQ(e.target.value); history.replaceState(null, '', `#/search?q=${encodeURIComponent(e.target.value)}`) }} placeholder="A title, an author, or a phrase you remember" /></label>
      {q.trim().length < 2 ? <p className="muted">Try a character’s name or a line you half remember.</p> : (
        <>
          {!!bookHits.length && <><h2 className="section-title">Books</h2><div className="hscroll">{bookHits.map(b => <a key={b.id} className="book-tile" href={href(`book/${b.id}`)}><Cover book={b} /><div className="meta"><h3>{b.title}</h3><p>{b.author}</p></div></a>)}</div></>}
          {!!noteHits.length && <><h2 className="section-title">Your highlights</h2><div className="list">{noteHits.map(a => <a key={a.id} className="list-row" href={href(`read/${a.bookId}?ann=${a.id}`)} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}><p className="title-serif" style={{ margin: 0 }}>{a.exact.slice(0, 200)}</p><p className="small muted" style={{ margin: '4px 0 0' }}>{a.note ? a.note + ' — ' : ''}{byId.get(a.bookId)?.title}</p></a>)}</div></>}
          <h2 className="section-title">Inside your books {hits && <span className="muted small num">{hits.length}{hits.length >= 200 ? '+' : ''} passages, {ms} ms</span>}</h2>
          {hits && !hits.length && <p className="muted">No passage contains “{q}”.</p>}
          {grouped.map(([bid, list]) => {
            const b = byId.get(bid); if (!b) return null
            return (
              <section key={bid} style={{ marginBottom: 22 }}>
                <h3 className="title-serif" style={{ fontSize: 17, margin: '0 0 8px' }}>{b.title} <span className="muted small" style={{ fontFamily: 'var(--ui)' }}>{list.length}</span></h3>
                <div className="list">{list.slice(0, 5).map((h, i) => <a key={i} className="list-row" href={href(`read/${bid}?s=${h.section}&o=${h.start}`)} style={{ color: 'inherit', textDecoration: 'none' }}><span className="title-serif">…{h.before.slice(-70)}<mark style={{ background: 'var(--hl-amber)', borderRadius: 2 }}>{h.match}</mark>{h.after.slice(0, 90)}…</span></a>)}</div>
              </section>
            )
          })}
        </>
      )}
    </>
  )
}
