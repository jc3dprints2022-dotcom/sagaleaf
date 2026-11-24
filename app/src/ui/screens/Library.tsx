import { useMemo, useState, useEffect } from 'react'
import MiniSearch from 'minisearch'
import { store, useLive, href, go, toast, useRoute } from '../../app/state'
import { loadBooks, loadCollections, setMembership, deleteBookWithUndo, type BookView } from '../../app/data'
import { Cover, ProgressBar, Seg, Modal, pct } from '../components'
import { Icon } from '../icons'
import { fmtBytes } from '../../core/util'
import { duplicateGroups, mergeDuplicate, searchText, type Hit } from '../../core/library'
import { importUi } from './ImportModal'
import { CollectionsBody } from './Collections'
import { NotesBody } from './Notes'

type Sort = 'recent' | 'added' | 'title' | 'author' | 'progress'
type Seg = 'books' | 'collections' | 'highlights'
export const SEG_OF_ROUTE: Record<string, Seg> = { notes: 'highlights', collections: 'collections' }
type Filter = 'all' | 'reading' | 'new' | 'finished' | 'leaf' | 'pdf'

const replaceHash = (h: string) => { location.replace(h) }

export function Library() {
  const route = useRoute()
  const seg: Seg = SEG_OF_ROUTE[route.name] ?? (route.query.get('seg') as Seg | null) ?? 'books'
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const leaves = useLive(async () => (await store.db.peers.toArray()).filter(p => p.kind === 'leaf'), [], ['peers'])
  const [q, setQ] = useState(route.query.get('q') ?? '')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('saga.sort') as Sort) || 'recent')
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<'grid' | 'rows'>(() => (localStorage.getItem('saga.view') as 'grid') || 'grid')
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [collect, setCollect] = useState(false)
  useEffect(() => { try { localStorage.setItem('saga.sort', sort); localStorage.setItem('saga.view', view) } catch { /* private mode */ } }, [sort, view])

  const onLeaf = useMemo(() => new Set((leaves ?? []).flatMap(l => Object.keys(l.leaf?.map ?? {}))), [leaves])
  const index = useMemo(() => {
    const ms = new MiniSearch<BookView>({ fields: ['title', 'author', 'series', 'subjectsText', 'publisher'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, author: 2 } } })
    ms.addAll((books ?? []).map(b => ({ ...b, subjectsText: (b.subjects ?? []).join(' ') })))
    return ms
  }, [books])
  const dupes = useMemo(() => duplicateGroups(books ?? []), [books])
  const [dismissed, setDismissed] = useState<string[]>(() => JSON.parse(localStorage.getItem('saga.dupesDismissed') ?? '[]'))

  const shown = useMemo(() => {
    let list = books ?? []
    if (q.trim()) { const ids = new Set(index.search(q).map(r => r.id)); list = list.filter(b => ids.has(b.id)) }
    list = list.filter(b => filter === 'all' || (filter === 'reading' && b.progress > 0.002 && b.progress < 0.995) || (filter === 'new' && b.progress <= 0.002) || (filter === 'finished' && (b.status === 'finished' || b.progress >= 0.995)) || (filter === 'leaf' && onLeaf.has(b.id)) || (filter === 'pdf' && b.format === 'pdf'))
    const cmp: Record<Sort, (a: BookView, b: BookView) => number> = {
      recent: (a, b) => (b.lastAt || b.addedAt) - (a.lastAt || a.addedAt), added: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.sortTitle.localeCompare(b.sortTitle), author: (a, b) => lastName(a.author).localeCompare(lastName(b.author)) || a.sortTitle.localeCompare(b.sortTitle),
      progress: (a, b) => b.progress - a.progress,
    }
    return [...list].sort(cmp[sort])
  }, [books, q, filter, sort, index, onLeaf])

  // full text: passages inside books, from the local index (Books segment)
  useEffect(() => {
    if (seg !== 'books' || q.trim().length < 2) { setHits(null); return }
    const sig = { aborted: false }
    const t = setTimeout(async () => { const r = await searchText(store, q, { limit: 200, signal: sig }); if (!sig.aborted) setHits(r) }, 250)
    return () => { sig.aborted = true; clearTimeout(t) }
  }, [q, seg])
  const grouped = useMemo(() => { const m = new Map<string, Hit[]>(); for (const h of hits ?? []) m.set(h.bookId, [...(m.get(h.bookId) ?? []), h]); return [...m] }, [hits])
  useEffect(() => { if (route.name === 'import') importUi.open() }, [route.name])
  const urlQ = route.query.get('q')
  useEffect(() => { if (route.name === 'search' && urlQ != null) setQ(urlQ) }, [route.name, urlQ])   // the old #/search?q= address
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  if (!books) return null
  const visibleDupes = dupes.filter(g => !dismissed.includes(g.map(b => b.id).sort().join('|')))

  const placeholder = seg === 'books' ? 'Search titles, authors and the text of your books' : seg === 'collections' ? 'Search collections' : 'Search highlights, notes and tags'
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <h1 className="page-title" style={{ flex: 1 }}>Library</h1>
        {sel && seg === 'books' ? (
          <div className="row">
            <span className="muted small">{sel.size} selected</span>
            <button className="btn small" disabled={!sel.size} onClick={() => setCollect(true)}>Add to collection</button>
            {!!leaves?.length && <button className="btn small" disabled={!sel.size} onClick={async () => { for (const l of leaves) { l.leaf!.send = { ...l.leaf!.send, ...Object.fromEntries([...sel].map(id => [id, true])) }; await store.db.peers.put(l) } store.emit('peers'); toast(`${sel.size} book${sel.size > 1 ? 's' : ''} will go to your SAGA Leaf on the next sync`); setSel(null); import('../../app/state').then(m => m.engine.schedule(0)) }}>Send to SAGA Leaf</button>}
            <button className="btn small danger" disabled={!sel.size} onClick={async () => { for (const id of sel) { const b = books.find(x => x.id === id); if (b) await deleteBookWithUndo(b) } setSel(null) }}>Remove</button>
            <button className="btn small quiet" onClick={() => setSel(null)}>Done</button>
          </div>
        ) : (
          <div className="row">{seg === 'books' && <button className="btn quiet small" onClick={() => setSel(new Set())}>Select</button>}<button className="btn primary" onClick={() => importUi.open()}><Icon.plus />Add</button></div>
        )}
      </div>
      <div className="lib-head">
        <Seg<Seg> label="Library" value={seg} onChange={v => replaceHash(`#/library?seg=${v}`)} options={[{ value: 'books', label: 'Books' }, { value: 'collections', label: 'Collections' }, { value: 'highlights', label: 'Highlights' }]} />
        <label className="search-input"><span className="sr-only">Search the library</span><Icon.search /><input className="input" type="search" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      {seg === 'collections' && <CollectionsBody q={q} />}
      {seg === 'highlights' && <NotesBody q={q} />}
      {seg === 'books' && <>
      {visibleDupes.slice(0, 1).map(g => (
        <div key={g[0].id} className="banner warn">
          <span><b>Possible duplicate:</b> {g.length} copies of “{g[0].title}” ({g.map(b => `${b.format.toUpperCase()} ${fmtBytes(b.size)}`).join(', ')}).</span>
          <button className="btn small" onClick={async () => { const keep = g.slice().sort((a, b) => (b.format === 'epub' ? 1 : 0) - (a.format === 'epub' ? 1 : 0) || b.addedAt - a.addedAt)[0]; for (const d of g) if (d.id !== keep.id) await mergeDuplicate(store, keep.id, d.id); toast(`Kept the ${keep.format.toUpperCase()}; highlights from the other copy moved over`) }}>Merge, keep highlights</button>
          <button className="btn small quiet" onClick={() => { const k = g.map(b => b.id).sort().join('|'); const n = [...dismissed, k]; setDismissed(n); localStorage.setItem('saga.dupesDismissed', JSON.stringify(n)) }}>Keep both</button>
        </div>
      ))}

      <div className="toolbar">
        <select className="input" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="recent">Recently read</option><option value="added">Recently added</option><option value="title">Title</option><option value="author">Author</option><option value="progress">Progress</option>
        </select>
        <Seg label="View" value={view} onChange={setView} options={[{ value: 'grid', label: 'Covers' }, { value: 'rows', label: 'List' }]} />
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 24 }} role="group" aria-label="Filter">
        {([['all', 'All'], ['reading', 'Reading'], ['new', 'Not started'], ['finished', 'Finished'], ...(leaves?.length ? [['leaf', 'On SAGA Leaf']] : []), ...(books.some(b => b.format === 'pdf') ? [['pdf', 'PDFs']] : [])] as [Filter, string][]).map(([v, l]) => <button key={v} className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>

      {!shown.length ? (
        <div className="empty"><h2>{q ? 'No titles match' : 'No books here yet'}</h2>{!q && <p>Change the filter, or add books.</p>}{!q && <button className="btn primary" onClick={() => importUi.open()}>Add books</button>}</div>
      ) : view === 'grid' ? (
        <div className="shelf">
          {shown.map(b => (
            <a key={b.id} className={`book-tile${sel?.has(b.id) ? ' selected' : ''}`} href={href(`book/${b.id}`)} onClick={e => { if (sel) { e.preventDefault(); toggle(b.id) } }}>
              {sel && <span className="check">{sel.has(b.id) && <Icon.check width={14} />}</span>}
              <Cover book={b} showFormat />
              <div className="meta"><h3>{b.title}</h3><p>{b.author}</p><span className="sr-only">{pct(b.progress)}</span>{b.progress > 0.002 && <ProgressBar value={b.progress} label={`${b.title}: ${pct(b.progress)}`} />}</div>
            </a>
          ))}
        </div>
      ) : (
        <div className="list book-rows">
          {shown.map(b => (
            <div key={b.id} className="list-row" role="link" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') go(`book/${b.id}`) }} onClick={() => (sel ? toggle(b.id) : go(`book/${b.id}`))} style={sel?.has(b.id) ? { background: 'var(--accent-soft)' } : undefined}>
              <Cover book={b} />
              <div style={{ flex: 1, minWidth: 0 }}><h3 className="title-serif">{b.title}</h3><p className="small muted" style={{ margin: 0 }}>{b.author}{b.series ? `, ${b.series}${b.seriesIndex ? ' ' + b.seriesIndex : ''}` : ''}</p></div>
              <span className="pill">{b.format.toUpperCase()}</span>
              {onLeaf.has(b.id) && <span className="pill copper">On SAGA Leaf</span>}
              <span className="small muted num" style={{ width: 84, textAlign: 'right' }}>{pct(b.progress)}</span>
            </div>
          ))}
        </div>
      )}

      {q.trim().length >= 2 && (
        <section aria-label="Inside your books" style={{ marginTop: 28 }}>
          <h2 className="section-title">Inside your books {hits && <span className="muted small num">{hits.length}{hits.length >= 200 ? '+' : ''} passages</span>}</h2>
          {hits && !hits.length && <p className="muted">No passage contains “{q}”.</p>}
          {grouped.map(([bid, list]) => {
            const b = books.find(x => x.id === bid); if (!b) return null
            return (
              <div key={bid} style={{ marginBottom: 20 }}>
                <h3 className="title-serif" style={{ fontSize: 17, margin: '0 0 8px' }}>{b.title} <span className="muted small" style={{ fontFamily: 'var(--ui)' }}>{list.length}</span></h3>
                <div className="list">{list.slice(0, 5).map((h, i) => <a key={i} className="list-row" href={href(`read/${bid}?s=${h.section}&o=${h.start}`)} style={{ color: 'inherit', textDecoration: 'none' }}><span className="title-serif">…{h.before.slice(-70)}<mark style={{ background: 'var(--hl-amber)', borderRadius: 2 }}>{h.match}</mark>{h.after.slice(0, 90)}…</span></a>)}</div>
              </div>
            )
          })}
        </section>
      )}
      </>}
      {collect && sel && seg === 'books' && <CollectPicker bookIds={[...sel]} onClose={() => { setCollect(false); setSel(null) }} />}
    </>
  )
}

const lastName = (a: string) => a.split(',')[0].trim().split(/\s+/).pop() ?? a

export function CollectPicker({ bookIds, onClose }: { bookIds: string[]; onClose: () => void }) {
  const cols = useLive(loadCollections, [], ['collections', 'members'])
  const [name, setName] = useState('')
  return (
    <Modal title="Add to collection" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="list" style={{ margin: '14px 0' }}>
        {(cols ?? []).map(c => {
          const all = bookIds.every(id => c.bookIds.includes(id))
          return <label key={c.id} className="list-row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={all} onChange={async e => { for (const id of bookIds) await setMembership(c.id, id, e.target.checked) }} /><span style={{ flex: 1 }}>{c.name}</span><span className="small muted">{c.bookIds.length}</span></label>
        })}
        {!cols?.length && <p className="list-row muted small">No collections yet.</p>}
      </div>
      <form className="row" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; const { createCollection } = await import('../../app/data'); const id = await createCollection(name); for (const b of bookIds) await setMembership(id, b, true); setName('') }}>
        <input className="input" placeholder="New collection name" value={name} onChange={e => setName(e.target.value)} aria-label="New collection name" />
        <button className="btn" type="submit">Create</button>
      </form>
    </Modal>
  )
}
