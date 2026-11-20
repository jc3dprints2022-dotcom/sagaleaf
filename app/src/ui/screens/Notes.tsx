import { useMemo, useState } from 'react'
import { store, useLive, href, useRoute, toast } from '../../app/state'
import { importUi } from './ImportModal'
import { loadBooks, loadAnnotations, downloadBytes } from '../../app/data'
import { HL_COLORS, hlCss } from '../components'
import { Icon } from '../icons'
import { annotationsMarkdown, webAnnotations } from '../../core/library'
import { loadPending, attachPending, discardPending, matchBook, type Clipping } from '../../core/kindle'
import type { BookView } from '../../app/data'
import { ago, norm, hlcTime } from '../../core/util'
import type { Annotation } from '../../core/types'

/** The Highlights segment of Library. `q` is the Library's search box. */
export function NotesBody({ q }: { q: string }) {
  const route = useRoute()
  const books = useLive(loadBooks, [], ['books'])
  const anns = useLive(() => loadAnnotations(), [], ['annotations'])
  const [color, setColor] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [bookId, setBookId] = useState<string | null>(route.query.get('book'))
  const [showDeleted, setShowDeleted] = useState(false)
  const byId = useMemo(() => new Map((books ?? []).map(b => [b.id, b])), [books])
  const synced = useLive(() => store.getMeta<Record<string, { title: string; author: string }>>('cloudBooks', {}), [], ['meta'])
  const tags = useMemo(() => [...new Set((anns ?? []).flatMap(a => a.tags ?? []))].sort(), [anns])
  const filtered = useMemo(() => (anns ?? []).filter(a => a.kind !== 'bookmark' && !!a.deleted === showDeleted && (!color || a.color === color) && (!tag || a.tags?.includes(tag)) && (!bookId || a.bookId === bookId) && (!q || norm(`${a.exact} ${a.note} ${(a.tags ?? []).join(' ')} ${byId.get(a.bookId)?.title ?? ''}`).includes(norm(q)))), [anns, color, tag, bookId, q, showDeleted, byId])
  const groups = useMemo(() => { const m = new Map<string, Annotation[]>(); for (const a of filtered) m.set(a.bookId, [...(m.get(a.bookId) ?? []), a]); return [...m] }, [filtered])
  const conflicts = (anns ?? []).filter(a => a.conflicts?.length && !a.deleted).length
  const deletedCount = (anns ?? []).filter(a => a.deleted && a.kind !== 'bookmark').length
  if (!anns || !books) return null
  const live = anns.filter(a => !a.deleted)

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <p className="muted" style={{ flex: 1, margin: 0 }}>{live.filter(a => a.kind !== 'bookmark').length} highlights across {new Set(live.map(a => a.bookId)).size} books</p>
        <div className="row">
          <button className="btn small" onClick={() => importUi.open()}><Icon.upload />Import Kindle highlights</button>
          <button className="btn small" disabled={!live.length} onClick={() => downloadBytes('saga-highlights.md', annotationsMarkdown(books, live), 'text/markdown')}><Icon.download />Markdown</button>
          <button className="btn small" disabled={!live.length} onClick={() => downloadBytes('saga-highlights.jsonld', JSON.stringify(webAnnotations(books, live), null, 1), 'application/ld+json')} title="W3C Web Annotation format, readable by other tools">Web Annotation</button>
        </div>
      </div>
      <KindleReview books={books} />
      {conflicts > 0 && <div className="banner warn"><span>{conflicts} note{conflicts > 1 ? ' was' : 's were'} edited on two devices at once. Both versions are kept until you choose.</span></div>}
      <div className="toolbar">
        <select className="input" style={{ width: 'auto' }} value={bookId ?? ''} onChange={e => setBookId(e.target.value || null)} aria-label="Book"><option value="">All books</option>{books.filter(b => anns.some(a => a.bookId === b.id)).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Colour">{HL_COLORS.map(c => <button key={c.id} className="swatch" style={{ background: c.css }} aria-label={c.label} aria-pressed={color === c.id} onClick={() => setColor(color === c.id ? null : c.id)} />)}</div>
      </div>
      {!!tags.length && <div className="row wrap" style={{ gap: 6, marginTop: -10, marginBottom: 20 }}>{tags.map(t => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}</div>}

      {!groups.length ? (
        <div className="empty"><h2>{showDeleted ? 'Nothing deleted' : q || color || tag ? 'No matches' : 'No highlights yet'}</h2><p>{showDeleted ? 'Deleted highlights appear here so you can bring them back.' : 'While reading, select a passage and pick a colour. Add a note to remember why it mattered.'}</p></div>
      ) : groups.map(([bid, list]) => {
        const b = byId.get(bid)
        return (
          <section key={bid} style={{ marginBottom: 30 }}>
            <h2 className="section-title" style={{ marginTop: 10 }}><span className="title-serif" style={{ fontSize: 20 }}>{b?.title ?? synced?.[bid]?.title ?? 'Removed book'}</span><span className="muted small">{list.length}</span></h2>
            <div className="list">{list.map(a => <NoteRow key={a.id} a={a} canOpen={!!b && b.fileState === 'local'} />)}</div>
          </section>
        )
      })}
      <button className="btn quiet small" onClick={() => setShowDeleted(!showDeleted)}><Icon.restore />{showDeleted ? 'Back to highlights' : `Recently deleted (${deletedCount})`}</button>
    </>
  )
}

function NoteRow({ a, canOpen }: { a: Annotation; canOpen: boolean }) {
  return (
    <div className="note-row" style={{ '--hl': hlCss(a.color) } as React.CSSProperties}>
      {a.exact && <blockquote>{a.exact}</blockquote>}
      {a.note && <p className="note">{a.note}</p>}
      {a.conflicts?.map((c, i) => <div key={i} className="conflict"><b>Also written on another device</b> {ago(hlcTime(c.at))}: {c.note} <button className="btn small quiet" onClick={() => store.put<Annotation>('annotation', a.id, { note: c.note, noteResolved: a.conflicts!.map(x => x.at), updatedAt: Date.now() } as Partial<Annotation>)}>Use this</button><button className="btn small quiet" onClick={() => store.put<Annotation>('annotation', a.id, { note: `${a.note}\n\n${c.note}`, noteResolved: [c.at], updatedAt: Date.now() } as Partial<Annotation>)}>Keep both</button></div>)}
      <div className="meta">
        <span>{a.label || 'Location'}, {Math.round(a.fraction * 100)}%</span>
        {(a.tags ?? []).map(t => <span key={t}>#{t}</span>)}
        {a.origin && a.origin !== store.deviceName && <span>from {a.origin}</span>}
        {a.orphaned && a.exact && <span className="pill warn">Passage not found in this edition (kept)</span>}
        <span className="spacer" />
        {a.deleted ? <button className="btn small" onClick={async () => { await store.put<Annotation>('annotation', a.id, { deleted: false }); toast('Restored') }}><Icon.restore />Restore</button>
          : canOpen && <a className="btn small quiet" href={href(`read/${a.bookId}?ann=${a.id}`)}>Open in book</a>}
      </div>
    </div>
  )
}

/** Kindle clippings whose book wasn't obviously in the library. They stay here
 *  (on this device) until the reader attaches them to a book or discards them. */
function KindleReview({ books }: { books: BookView[] }) {
  const pending = useLive(() => loadPending(store), [], ['meta'])
  const groups = useMemo(() => {
    const m = new Map<string, Clipping[]>()
    for (const c of pending ?? []) { const k = c.title + '\u0001' + c.author; m.set(k, [...(m.get(k) ?? []), c]) }
    return [...m.values()]
  }, [pending])
  if (!groups.length) return null
  const local = books.filter(b => b.fileState === 'local').sort((a, b) => a.sortTitle.localeCompare(b.sortTitle))
  return (
    <section className="card kindle-review" aria-labelledby="kr-h" style={{ marginBottom: 26 }}>
      <h2 className="section-title" id="kr-h">Kindle highlights waiting for a book <span className="muted small">{pending!.length}</span></h2>
      
      <div className="list">{groups.map(g => <ReviewGroup key={g[0].title + g[0].author} list={g} books={local} />)}</div>
    </section>
  )
}

function ReviewGroup({ list, books }: { list: Clipping[]; books: BookView[] }) {
  const guess = matchBook(list[0].title, '', books)
  const [bookId, setBookId] = useState(guess?.id ?? '')
  const [open, setOpen] = useState(false)
  const ids = list.map(c => c.id)
  return (
    <div className="list-row" style={{ display: 'block' }} data-kindle-title={list[0].title}>
      <div className="row wrap" style={{ alignItems: 'baseline' }}>
        <div style={{ flex: 1, minWidth: 200 }}><b className="title-serif">{list[0].title}</b>{list[0].author && <span className="muted small"> · {list[0].author}</span>} <span className="muted small">· {list.length} item{list.length === 1 ? '' : 's'}</span></div>
        <select className="input" style={{ width: 'auto', maxWidth: 260 }} value={bookId} onChange={e => setBookId(e.target.value)} aria-label={`Book for “${list[0].title}”`}>
          <option value="">Choose a book…</option>
          {books.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
        </select>
        <button className="btn small primary" disabled={!bookId} onClick={async () => { try { const n = await attachPending(store, ids, bookId); toast(`${n} Kindle highlight${n === 1 ? '' : 's'} attached`) } catch (e) { toast((e as Error).message) } }}>Attach</button>
        <button className="btn small quiet" onClick={async () => { await discardPending(store, ids); toast('Discarded') }}>Discard</button>
        <button className="btn small quiet" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>{list.slice(0, 50).map(c => <li key={c.id}>{c.kind === 'note' ? <i>Note: {c.text}</i> : <>“{c.text}”{c.note && <i> — {c.note}</i>}</>} <span className="muted">{c.location ? `(location ${c.location})` : ''}</span></li>)}</ul>}
    </div>
  )
}
