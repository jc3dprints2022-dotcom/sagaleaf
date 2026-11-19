import { useState } from 'react'
import { store, useLive, href, go, toast, engine } from '../../app/state'
import { loadBooks, loadAnnotations, loadCollections, setMembership, editBook, deleteBookWithUndo, downloadBytes, setStatus } from '../../app/data'
import { Cover, ProgressBar, Modal, Toggle, pct, hlCss } from '../components'
import { Icon } from '../icons'
import { ago, fmtBytes, hlcTime, sortKey } from '../../core/util'
import { annotationsMarkdown } from '../../core/library'
import { RelayClient } from '../../core/sync/engine'
import type { Book } from '../../core/types'
import { PRODUCT } from '../../app/product'

export function BookDetails({ id }: { id: string }) {
  const book = useLive(async () => (await loadBooks()).find(b => b.id === id) ?? null, [id], ['books', 'positions'])
  const anns = useLive(() => loadAnnotations(id), [id], ['annotations'])
  const cols = useLive(loadCollections, [], ['collections', 'members'])
  const leaves = useLive(async () => (await store.db.peers.toArray()).filter(p => p.kind === 'leaf'), [], ['peers'])
  const [editing, setEditing] = useState(false)
  const [fetching, setFetching] = useState(false)
  if (book === undefined) return null
  if (!book) return <div className="empty"><h2>This book isn’t in your library</h2><p>It may have been removed on this or another device.</p><a className="btn" href={href('library')}>Back to library</a></div>

  const live = (anns ?? []).filter(a => !a.deleted)
  const hl = live.filter(a => a.kind !== 'bookmark')
  const devices = book.positions.filter((p, i, arr) => arr.findIndex(x => x.deviceId === p.deviceId) === i)

  async function fetchFile() {
    setFetching(true)
    try {
      const relay = (await store.db.peers.toArray()).find(p => p.kind === 'relay')
      if (!relay) throw new Error('Turn on sync to fetch books from your other devices.')
      const ok = await engine.downloadBlob(new RelayClient(relay), book!)
      if (!ok) throw new Error(`The file hasn’t been uploaded from your other device yet. Open ${PRODUCT.name} there with file sync on.`)
      toast('Downloaded. Ready to read offline.')
    } catch (e) { toast((e as Error).message, undefined, 7000) } finally { setFetching(false) }
  }

  return (
    <>
      <a href={href('library')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 18 }}><Icon.back />Library</a>
      <div className="detail">
        <Cover book={book} width="100%" />
        <div>
          <h1>{book.title}</h1>
          <p className="by">{book.author}{book.series ? <span className="muted">, {book.series}{book.seriesIndex ? ` ${book.seriesIndex}` : ''}</span> : null}</p>
          <div className="row wrap">
            {book.fileState === 'remote'
              ? <button className="btn primary" disabled={fetching} onClick={fetchFile}><Icon.download />{fetching ? 'Downloading…' : 'Download to this device'}</button>
              : <a className="btn primary" href={href(`read/${book.id}`)}>{book.progress > 0.002 ? 'Continue reading' : 'Start reading'}</a>}
            <button className="btn" onClick={() => setEditing(true)}>Edit details</button>
            <select className="input" style={{ width: 'auto', height: 38, borderRadius: 999 }} aria-label="Reading status" value={book.status === 'finished' || book.progress >= 0.995 ? 'finished' : book.progress > 0.002 ? 'reading' : book.status} onChange={e => setStatus(book.id, e.target.value as Book['status'])}>
              <option value="new">Not started</option><option value="reading">Reading</option><option value="finished">Finished</option>
            </select>
          </div>

          {devices.length > 0 && (
            <div className="panel" style={{ marginTop: 22 }}>
              <h3 style={{ fontSize: 14, marginBottom: 12 }}>Where you are</h3>
              <div className="stack">
                {devices.map(p => (
                  <div key={p.id} className="row">
                    <span className={`dot ${p.deviceId.startsWith('leaf-') ? 'copper' : 'ok'}`} />
                    <span style={{ width: 170 }}>{p.deviceId === store.deviceId ? 'This device' : p.deviceName}</span>
                    <div style={{ flex: 1 }}><ProgressBar value={p.fraction} copper={p.deviceId.startsWith('leaf-')} /></div>
                    <span className="small muted num" style={{ width: 150, textAlign: 'right' }}>{pct(p.fraction)}, {ago(hlcTime(p.at))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {book.description && <p className="desc" style={{ marginTop: 22 }} dangerouslySetInnerHTML={undefined}>{book.description}</p>}

          <dl className="facts">
            <dt>Format</dt><dd>{book.format.toUpperCase()}, {fmtBytes(book.size)}{book.fileState === 'remote' ? ' (on your other devices)' : ''}</dd>
            {book.publisher && <><dt>Publisher</dt><dd>{book.publisher}</dd></>}
            {book.published && <><dt>Published</dt><dd>{book.published.slice(0, 10)}</dd></>}
            {book.language && <><dt>Language</dt><dd>{book.language}</dd></>}
            {!!book.subjects?.length && <><dt>Subjects</dt><dd>{book.subjects.slice(0, 6).join(', ')}</dd></>}
            <dt>Added</dt><dd>{new Date(book.addedAt).toLocaleDateString()}{book.source === 'catalog' ? (book.catalogId?.startsWith('pg-') ? ' from Project Gutenberg' : ' from Discover') : ''}{book.license ? `, ${book.license}` : ''}</dd>
          </dl>

          {!!leaves?.length && (
            <div className="panel">
              {leaves.map(l => {
                const on = !!l.leaf?.map[book.id], want = !!l.leaf?.send[book.id]
                return (
                  <div key={l.id} className="row">
                    <Icon.devices width={20} color="var(--copper)" />
                    <div style={{ flex: 1 }}><b>{l.name}</b><p className="small muted" style={{ margin: 0 }}>{on ? 'On the device. Position and highlights sync both ways.' : want ? 'Waiting to send on the next sync.' : 'Not on the device.'}</p></div>
                    <Toggle label={`Keep on ${l.name}`} checked={want || on} onChange={async v => { l.leaf!.send = { ...l.leaf!.send, [book.id]: v }; await store.db.peers.put(l); store.emit('peers'); if (v) engine.schedule(0); else if (on) toast('It stays on the SAGA Leaf until you remove it there or from Devices.') }} />
                  </div>
                )
              })}
            </div>
          )}

          <h2 className="section-title">Collections</h2>
          <div className="row wrap" style={{ gap: 8 }}>
            {(cols ?? []).map(c => <button key={c.id} className="chip" aria-pressed={c.bookIds.includes(book.id)} onClick={() => setMembership(c.id, book.id, !c.bookIds.includes(book.id))}>{c.name}</button>)}
            <a className="chip" href={href('collections')}><Icon.plus width={14} />New</a>
          </div>

          <h2 className="section-title">Highlights and notes <span className="muted small">{hl.length}</span>
            {hl.length > 0 && <button className="btn quiet small" onClick={() => downloadBytes(`${book.title} - notes.md`, annotationsMarkdown([book], live), 'text/markdown')}>Export Markdown</button>}
          </h2>
          {hl.length ? (
            <div className="list">{hl.slice(0, 8).map(a => (
              <a key={a.id} className="note-row" href={href(`read/${book.id}?ann=${a.id}`)} style={{ display: 'block', color: 'inherit', textDecoration: 'none', '--hl': hlCss(a.color) } as React.CSSProperties}>
                {a.exact && <blockquote>{a.exact}</blockquote>}{a.note && <p className="note">{a.note}</p>}
                <div className="meta"><span>{a.label}</span><span>{Math.round(a.fraction * 100)}%</span>{a.orphaned && a.exact && <span className="pill warn">Passage not found in this edition</span>}</div>
              </a>
            ))}{hl.length > 8 && <a className="list-row" href={href(`notes?book=${book.id}`)}>See all {hl.length}</a>}</div>
          ) : <p className="muted">Select text while reading to highlight it or add a note.</p>}

          <div className="row wrap" style={{ marginTop: 40, gap: 8 }}>
            {book.fileState === 'local' && <button className="btn small" onClick={async () => { const f = await store.db.files.get(book.hash); if (f) downloadBytes(book.filename ?? `${book.title}.${book.format}`, f.data, f.type) }}><Icon.download />Download original file</button>}
            <button className="btn small danger" onClick={async () => { await deleteBookWithUndo(book); go('library') }}><Icon.trash />Remove from library</button>
          </div>
        </div>
      </div>
      {editing && <EditBook book={book} onClose={() => setEditing(false)} />}
    </>
  )
}

function EditBook({ book, onClose }: { book: Book; onClose: () => void }) {
  const [f, setF] = useState({ title: book.title, author: book.author, series: book.series ?? '', seriesIndex: book.seriesIndex?.toString() ?? '', subjects: (book.subjects ?? []).join(', '), description: book.description ?? '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  async function save() {
    if (!f.title.trim()) return toast('A book needs a title.')
    await editBook(book.id, { title: f.title.trim(), sortTitle: sortKey(f.title), author: f.author.trim() || 'Unknown author', series: f.series.trim() || undefined, seriesIndex: f.seriesIndex ? Number(f.seriesIndex) : undefined, subjects: f.subjects.split(',').map(s => s.trim()).filter(Boolean), description: f.description.trim() || undefined })
    toast('Details saved'); onClose()
  }
  return (
    <Modal title="Edit details" onClose={onClose} actions={<><button className="btn quiet" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <p className="small muted">Changes stay in {PRODUCT.name}. Your original file isn’t modified.</p>
      <div className="field"><label htmlFor="e-t">Title</label><input id="e-t" className="input" value={f.title} onChange={set('title')} /></div>
      <div className="field"><label htmlFor="e-a">Author</label><input id="e-a" className="input" value={f.author} onChange={set('author')} /></div>
      <div className="row"><div className="field" style={{ flex: 3 }}><label htmlFor="e-s">Series</label><input id="e-s" className="input" value={f.series} onChange={set('series')} /></div><div className="field" style={{ flex: 1 }}><label htmlFor="e-n">Number</label><input id="e-n" className="input" inputMode="decimal" value={f.seriesIndex} onChange={set('seriesIndex')} /></div></div>
      <div className="field"><label htmlFor="e-g">Subjects</label><input id="e-g" className="input" value={f.subjects} onChange={set('subjects')} /><span className="hint">Separate with commas</span></div>
      <div className="field"><label htmlFor="e-d">Description</label><textarea id="e-d" className="input" value={f.description} onChange={set('description')} /></div>
    </Modal>
  )
}
