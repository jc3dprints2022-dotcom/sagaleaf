import { useCallback, useEffect, useState } from 'react'
import { href, toast, platform, DEMO_USERS } from '../../app/state'
import { StatusPill, type Submission } from './Author'
import { Modal, PlatformImg } from '../components'

const pub = DEMO_USERS[2]

export default function Publisher() {
  const [subs, setSubs] = useState<Submission[] | null>(null)
  const [open, setOpen] = useState<Submission | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const load = useCallback(() => { platform('/api/submissions', {}, pub).then(r => setSubs(r as Submission[])).catch(() => setErr('The SAGA platform server isn’t running. Start it with npm run platform.')) }, [])
  useEffect(load, [load])
  async function decide(decision: 'approve' | 'changes') {
    if (!open) return
    if (decision === 'changes' && !note.trim()) return toast('Tell the author what to change.')
    try { await platform(`/api/submissions/${open.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, note }) }, pub); toast(decision === 'approve' ? `Published “${open.title}” to the demo catalog` : 'Sent back to the author'); setOpen(null); setNote(''); load() }
    catch (e) { toast((e as Error).message) }
  }
  if (err) return <div className="empty"><h2>Platform offline</h2><p>{err}</p></div>
  const queue = (subs ?? []).filter(s => s.status === 'submitted'), done = (subs ?? []).filter(s => s.status !== 'submitted')
  return (
    <>
      <div className="banner"><span><b>SAGA Publisher prototype.</b> Demo reviewer account “Northlight Press”. Approving publishes to the demo catalog on your own server only.</span></div>
      <h1 className="page-title">Review queue</h1>
      <p className="page-sub">{queue.length ? `${queue.length} book${queue.length > 1 ? 's' : ''} waiting.` : 'Nothing waiting for review.'}</p>
      {!!queue.length && <div className="list">{queue.map(s => <button key={s.id} className="list-row" style={{ width: '100%', background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(s)}><div style={{ flex: 1 }}><h3 className="title-serif">{s.title}</h3><p className="small muted" style={{ margin: 0 }}>{s.author}, submitted by {s.authorName}, {s.words.toLocaleString()} words, {s.issues.filter(i => i.level === 'warning').length} warnings</p></div><StatusPill s={s.status} /></button>)}</div>}
      {!!done.length && <><h2 className="section-title">Decided</h2><div className="list">{done.map(s => <div key={s.id} className="list-row"><div style={{ flex: 1 }}><h3 className="title-serif">{s.title}</h3><p className="small muted" style={{ margin: 0 }}>{s.author}</p></div>{s.catalogId && <a className="btn small quiet" href={href(`catalog/${s.catalogId}`)}>In catalog</a>}<StatusPill s={s.status} /></div>)}</div></>}
      {open && (
        <Modal wide title={open.title} onClose={() => setOpen(null)} actions={<><button className="btn" onClick={() => decide('changes')}>Request changes</button><button className="btn primary" onClick={() => decide('approve')}>Approve and publish</button></>}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20, marginTop: 10 }}>
            <div style={{ width: 120, flex: 'none' }}>{open.hasCover ? <div className="cover"><PlatformImg path={`/api/submissions/${open.id}/cover`} /></div> : <div className="cover" />}</div>
            <div style={{ flex: 1 }}>
              <p style={{ marginTop: 0 }}><b>{open.author}</b>, {open.language}, {open.price ? `$${open.price.toFixed(2)}` : 'free'}, {open.license}{open.isbn ? `, ISBN ${open.isbn}` : ''}</p>
              <p className="small" style={{ maxHeight: 140, overflow: 'auto' }}>{open.description}</p>
              <p className="small muted">File check: {open.issues.length ? open.issues.map(i => i.message).join(' ') : 'no problems.'}</p>
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}><label htmlFor="rn">Note to the author</label><textarea id="rn" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Required when requesting changes" /></div>
        </Modal>
      )}
    </>
  )
}
