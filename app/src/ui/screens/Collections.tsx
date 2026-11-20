import { useState } from 'react'
import { useLive, href, go, toast } from '../../app/state'
import { loadCollections, createCollection, renameCollection, deleteCollection, loadBooks, setMembership } from '../../app/data'
import { Cover, ProgressBar, Modal } from '../components'
import { Icon } from '../icons'

/** The Collections segment of Library. `q` filters by name. */
export function CollectionsBody({ q }: { q: string }) {
  const cols = useLive(loadCollections, [], ['collections', 'members'])
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const [name, setName] = useState('')
  if (!cols || !books) return null
  return (
    <>
      <form className="row" style={{ maxWidth: 460, marginBottom: 30 }} onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; const id = await createCollection(name); setName(''); go(`collection/${id}`) }}>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Name a new collection" aria-label="New collection name" />
        <button className="btn primary" type="submit"><Icon.plus />Create</button>
      </form>
      {!cols.length ? <div className="empty"><h2>No collections yet</h2><p>Try “Summer reading”, “Research” or “Re-read someday”.</p></div> : (
        <div className="grid-2">{cols.filter(c => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())).map(c => {
          const bs = c.bookIds.map(id => books.find(b => b.id === id)).filter(Boolean).slice(0, 4)
          return (
            <a key={c.id} href={href(`collection/${c.id}`)} className="panel" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 18, alignItems: 'center' }}>
              <div style={{ display: 'flex', width: 120, flex: 'none' }}>{bs.length ? bs.map((b, i) => <div key={b!.id} style={{ width: 58, marginLeft: i ? -34 : 0, zIndex: 4 - i }}><Cover book={b!} /></div>) : <div style={{ width: 58 }} className="cover" />}</div>
              <div><h3 className="title-serif" style={{ fontSize: 19 }}>{c.name}</h3><p className="small muted" style={{ margin: '4px 0 0' }}>{c.bookIds.length} book{c.bookIds.length === 1 ? '' : 's'}</p></div>
            </a>
          )
        })}</div>
      )}
    </>
  )
}

export function CollectionDetail({ id }: { id: string }) {
  const cols = useLive(loadCollections, [], ['collections', 'members'])
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const c = cols?.find(x => x.id === id)
  if (!cols || !books) return null
  if (!c) return <div className="empty"><h2>This collection was deleted</h2><a className="btn" href={href('library?seg=collections')}>All collections</a></div>
  const members = c.bookIds.map(bid => books.find(b => b.id === bid)).filter(Boolean)
  return (
    <>
      <a href={href('library?seg=collections')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 14 }}><Icon.back />Library</a>
      <div className="row wrap"><h1 className="page-title" style={{ flex: 1 }}>{c.name}</h1>
        <button className="btn small" onClick={() => setAdding(true)}><Icon.plus />Add books</button>
        <button className="btn small quiet" onClick={() => setRenaming(c.name)}>Rename</button>
        <button className="btn small quiet danger" onClick={async () => { await deleteCollection(c.id); toast(`Deleted “${c.name}”. The books are still in your library.`); go('library?seg=collections') }}>Delete</button>
      </div>
      <p className="page-sub">{members.length} book{members.length === 1 ? '' : 's'}</p>
      {!members.length ? <div className="empty"><h2>Empty for now</h2><p>Add books from here, or from any book’s page.</p><button className="btn primary" onClick={() => setAdding(true)}>Add books</button></div> : (
        <div className="shelf">{members.map(b => <a key={b!.id} className="book-tile" href={href(`book/${b!.id}`)}><Cover book={b!} /><div className="meta"><h3>{b!.title}</h3><p>{b!.author}</p>{b!.progress > 0.002 && <ProgressBar value={b!.progress} />}</div></a>)}</div>
      )}
      {adding && <Modal title={`Add to ${c.name}`} onClose={() => setAdding(false)} actions={<button className="btn primary" onClick={() => setAdding(false)}>Done</button>}>
        <MemberList books={books} collectionId={c.id} initial={c.bookIds} />
      </Modal>}
      {renaming != null && <Modal title="Rename collection" onClose={() => setRenaming(null)} actions={<><button className="btn quiet" onClick={() => setRenaming(null)}>Cancel</button><button className="btn primary" onClick={async () => { if (renaming.trim()) await renameCollection(c.id, renaming); setRenaming(null) }}>Rename</button></>}>
        <input className="input" autoFocus value={renaming} onChange={e => setRenaming(e.target.value)} aria-label="Collection name" style={{ marginTop: 12 }} />
      </Modal>}
    </>
  )
}

function MemberList({ books, collectionId, initial }: { books: { id: string; title: string; author: string }[]; collectionId: string; initial: string[] }) {
  const [on, setOn] = useState(() => new Set(initial))
  return (
    <div className="list" style={{ maxHeight: 420, overflow: 'auto', marginTop: 12 }}>
      {books.map(b => <label key={b.id} className="list-row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={on.has(b.id)} onChange={e => { const v = e.target.checked; setOn(s => { const n = new Set(s); if (v) n.add(b.id); else n.delete(b.id); return n }); void setMembership(collectionId, b.id, v) }} /><span style={{ flex: 1 }}>{b.title}<span className="muted small"> {b.author}</span></span></label>)}
    </div>
  )
}
