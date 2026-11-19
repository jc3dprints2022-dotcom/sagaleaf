import { useEffect, useState, useCallback } from 'react'
import { href, go, toast, platform, DEMO_USERS } from '../../app/state'
import { PlatformImg } from '../components'
import { pickFiles } from '../../app/data'
import { Icon } from '../icons'
import { fmtBytes, ago } from '../../core/util'

export interface Submission {
  id: string; status: string; title: string; subtitle?: string; author: string; description: string; language: string; subjects: string[]; series?: string; seriesIndex?: number
  isbn?: string; publishedDate?: string; price: number; license: string; territories: string; drm: string; fileSize: number; words: number; hasCover: boolean
  issues: { level: 'error' | 'warning' | 'info'; code: string; message: string }[]; history: { at: number; who: string; action: string; note?: string }[]; catalogId?: string; reviewNote?: string; updatedAt: number; authorName: string
}
export const author = DEMO_USERS[1]
export const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', ''], submitted: ['In review', 'warn'], 'changes-requested': ['Changes requested', 'err'], published: ['Published', 'ok'], withdrawn: ['Withdrawn', ''], approved: ['Approved', 'ok'],
}
export function StatusPill({ s }: { s: string }) { const [l, c] = STATUS[s] ?? [s, '']; return <span className={`pill ${c}`}>{l}</span> }

export default function Author({ id }: { id?: string }) {
  return (
    <>
      <div className="banner"><span><b>SAGA Author prototype.</b> Signed in as the demo account “{author.name.replace(' (demo author)', '')}”. Uploads stay on your own platform server; nothing is published publicly and no money moves.</span></div>
      {id ? <SubmissionEditor id={id} /> : <AuthorHome />}
    </>
  )
}

async function samplePublicDomain() {
  const url = import.meta.env.VITE_STANDALONE === '1' ? (await import('../../app/embeddedSamples')).EMBEDDED_SAMPLES[1][1] : `${import.meta.env.BASE_URL}samples/frankenstein.epub`
  return new Blob([await (await fetch(url)).arrayBuffer()], { type: 'application/epub+zip' })
}

function AuthorHome() {
  const [subs, setSubs] = useState<Submission[] | null>(null)
  const [report, setReport] = useState<{ label: string; rows: { catalogId: string; title: string; price: number; libraryAdds: number; realReaderAdds: number; sales: number; refunds: number; gross: number; processing: number; sagaFee: number; authorNet: number; days: Record<string, { adds: number; sales: number }> }[] } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    platform('/api/submissions', {}, author).then(r => setSubs(r as Submission[])).catch(() => setErr('The SAGA platform server isn’t running. Start it with npm run platform.'))
    platform('/api/reports', {}, author).then(r => setReport(r as typeof report)).catch(() => 0)
  }, [])
  useEffect(load, [load])
  async function upload(sample = false) {
    const f = sample ? await samplePublicDomain() : (await pickFiles('.epub,application/epub+zip', false))[0]; if (!f) return
    setBusy(true)
    try { const s = await platform('/api/submissions', { method: 'POST', body: f, headers: { 'content-type': 'application/epub+zip' } }, author) as Submission; go(`author/${s.id}`) }
    catch (e) { toast((e as Error).message, undefined, 8000) } finally { setBusy(false) }
  }
  if (err) return <div className="empty"><h2>Platform offline</h2><p>{err}</p></div>
  return (
    <>
      <div className="row wrap"><h1 className="page-title" style={{ flex: 1 }}>Your books</h1><button className="btn primary" disabled={busy} onClick={() => upload()}><Icon.upload />{busy ? 'Checking your file…' : 'Upload an EPUB'}</button></div>
      <p className="page-sub">Upload a finished EPUB. SAGA checks it the way readers’ devices will, then you fill in the details and send it for review.</p>
      {!subs ? null : !subs.length ? <div className="empty"><h2>No books yet</h2><p>Start with an EPUB you have the rights to publish. To try the flow, use a public-domain book.</p><button className="btn" disabled={busy} onClick={() => upload(true)}>Try it with Frankenstein</button></div> : (
        <div className="list">{subs.map(s => (
          <a key={s.id} className="list-row" href={href(`author/${s.id}`)} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div style={{ flex: 1 }}><h3 className="title-serif">{s.title}</h3><p className="small muted" style={{ margin: 0 }}>{s.words.toLocaleString()} words, {s.price ? `$${s.price.toFixed(2)}` : 'free'}, updated {ago(s.updatedAt)}</p></div>
            <StatusPill s={s.status} />
          </a>
        ))}</div>
      )}
      {!!report?.rows.length && (
        <>
          <h2 className="section-title">Readers and earnings</h2>
          <div className="banner test"><span>TEST DATA. Simulated and demo events, not real sales or real readers.</span></div>
          {report.rows.map(r => {
            const days = Object.entries(r.days).sort().slice(-30)
            const max = Math.max(1, ...days.map(([, d]) => d.adds))
            return (
              <div key={r.catalogId} className="panel">
                <div className="row wrap"><h3 className="title-serif" style={{ fontSize: 18, flex: 1 }}>{r.title}</h3>
                  <button className="btn small" onClick={async () => { await platform('/api/reports/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ catalogId: r.catalogId }) }, author); load() }}>Add 30 days of simulated activity</button></div>
                <div className="chart" aria-label="Library adds per day, last 30 days" style={{ margin: '16px 0' }}>{days.map(([d, v]) => <i key={d} title={`${d}: ${v.adds} adds, ${v.sales} sales`} style={{ height: `${(v.adds / max) * 100}%` }} />)}</div>
                <table className="data"><thead><tr><th>Library adds</th><th>From real reader actions</th><th className="r">Sales</th><th className="r">Refunds</th><th className="r">Gross</th><th className="r">Card fees (est.)</th><th className="r">SAGA 15%</th><th className="r">You receive</th></tr></thead>
                  <tbody><tr><td>{r.libraryAdds}</td><td>{r.realReaderAdds}</td><td className="r">{r.sales}</td><td className="r">{r.refunds}</td><td className="r">${r.gross.toFixed(2)}</td><td className="r">${r.processing.toFixed(2)}</td><td className="r">${r.sagaFee.toFixed(2)}</td><td className="r"><b>${r.authorNet.toFixed(2)}</b></td></tr></tbody></table>
                <p className="small muted" style={{ marginBottom: 0 }}>Model shown: SAGA keeps a flat 15% and pays card fees from it. This is the proposal in the business model document, not an agreement.</p>
              </div>
            )
          })}
        </>
      )}
    </>
  )
}

function SubmissionEditor({ id }: { id: string }) {
  const [s, setS] = useState<Submission | null>(null)
  const [draft, setDraft] = useState<Partial<Submission>>({})
  const [saving, setSaving] = useState(false)
  const [coverBust, setCoverBust] = useState(0)
  useEffect(() => { platform(`/api/submissions/${id}`, {}, author).then(r => { setS(r as Submission); setDraft({}) }).catch(e => toast((e as Error).message)) }, [id])
  if (!s) return null
  const v = { ...s, ...draft }
  const editable = s.status === 'draft' || s.status === 'changes-requested'
  const set = (k: keyof Submission) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: k === 'price' || k === 'seriesIndex' ? (e.target.value === '' ? undefined : Number(e.target.value)) : k === 'subjects' ? e.target.value.split(',').map(x => x.trimStart()) : e.target.value })
  async function save() {
    setSaving(true)
    try { const r = await platform(`/api/submissions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...draft, subjects: v.subjects.map(x => x.trim()).filter(Boolean) }) }, author) as Submission; setS(r); setDraft({}); toast('Saved') ; return true }
    catch (e) { toast((e as Error).message, undefined, 6000); return false } finally { setSaving(false) }
  }
  async function submit() {
    if (Object.keys(draft).length && !(await save())) return
    try { const r = await platform(`/api/submissions/${id}/submit`, { method: 'POST' }, author) as Submission; setS(r); toast('Sent for review') }
    catch (e) { toast((e as Error).message, undefined, 7000) }
  }
  const errors = s.issues.filter(i => i.level === 'error'), warnings = s.issues.filter(i => i.level === 'warning'), infos = s.issues.filter(i => i.level === 'info')
  return (
    <>
      <a href={href('author')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 14 }}><Icon.back />Your books</a>
      <div className="row wrap"><h1 className="page-title" style={{ flex: 1 }}>{v.title || 'Untitled'}</h1><StatusPill s={s.status} /></div>
      {s.status === 'changes-requested' && s.reviewNote && <div className="banner warn"><span><b>The reviewer asked for changes:</b> {s.reviewNote}</span></div>}
      {s.status === 'published' && s.catalogId && <div className="banner"><span>Live in the demo catalog.</span><a className="btn small" href={href(`catalog/${s.catalogId}`)}>View as a reader</a></div>}

      <div className="detail" style={{ gridTemplateColumns: '200px minmax(0,1fr)' }}>
        <div>
          {s.hasCover ? <div className="cover"><PlatformImg path={`/api/submissions/${id}/cover?b=${coverBust}`} alt="Cover" /></div> : <div className="cover gen" style={{ '--gen-bg': '#44535a', '--gen-ink': '#eef' } as React.CSSProperties}><span className="t">{v.title}</span><span className="rule" /><span className="a">No cover yet</span></div>}
          {editable && <button className="btn small" style={{ marginTop: 12, width: '100%' }} onClick={async () => { const [f] = await pickFiles('image/jpeg,image/png,image/webp,image/svg+xml', false); if (!f) return; try { const r = await platform(`/api/submissions/${id}/cover`, { method: 'PUT', body: f, headers: { 'content-type': f.type } }, author) as Submission; setS(r); setCoverBust(Date.now()) } catch (e) { toast((e as Error).message) } }}>Replace cover</button>}
          <p className="small muted">{fmtBytes(s.fileSize)}, {s.words.toLocaleString()} words</p>
        </div>
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>File check</h2>
          <div className="list">
            {!s.issues.length && <div className="issue"><span className="pill ok">Passed</span>No problems found.</div>}
            {[...errors, ...warnings, ...infos].map((i, k) => <div key={k} className="issue"><span className={`pill ${i.level === 'error' ? 'err' : i.level === 'warning' ? 'warn' : ''}`}>{i.level === 'error' ? 'Must fix' : i.level === 'warning' ? 'Should fix' : 'Tip'}</span><span>{i.message}</span></div>)}
          </div>
          {errors.length > 0 && <p className="small" style={{ color: 'var(--danger)' }}>Fix these in your EPUB and upload it again. Readers’ devices would fail on them.</p>}

          <h2 className="section-title">Details readers see</h2>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="field"><label htmlFor="a-t">Title</label><input id="a-t" className="input" value={v.title} onChange={set('title')} /></div>
            <div className="field"><label htmlFor="a-st">Subtitle</label><input id="a-st" className="input" value={v.subtitle ?? ''} onChange={set('subtitle')} /></div>
            <div className="field"><label htmlFor="a-a">Author name</label><input id="a-a" className="input" value={v.author} onChange={set('author')} /></div>
            <div className="field"><label htmlFor="a-d">Description</label><textarea id="a-d" className="input" style={{ minHeight: 140 }} value={v.description} onChange={set('description')} /><span className="hint">{v.description.length} characters. Readers decide from the first two sentences.</span></div>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="a-s">Series</label><input id="a-s" className="input" value={v.series ?? ''} onChange={set('series')} /></div>
              <div className="field" style={{ flex: 1, minWidth: 90 }}><label htmlFor="a-si">Number</label><input id="a-si" className="input" inputMode="decimal" value={v.seriesIndex ?? ''} onChange={set('seriesIndex')} /></div>
              <div className="field" style={{ flex: 1, minWidth: 110 }}><label htmlFor="a-l">Language</label><input id="a-l" className="input" value={v.language} onChange={set('language')} /></div>
            </div>
            <div className="field"><label htmlFor="a-sub">Subjects</label><input id="a-sub" className="input" value={v.subjects.join(', ')} onChange={set('subjects')} /></div>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="a-i">ISBN</label><input id="a-i" className="input" value={v.isbn ?? ''} onChange={set('isbn')} placeholder="Optional for SAGA" /><span className="hint">Checked for a valid checksum.</span></div>
              <div className="field" style={{ flex: 1, minWidth: 120 }}><label htmlFor="a-p">Price (USD)</label><input id="a-p" className="input" inputMode="decimal" value={v.price ?? 0} onChange={set('price')} /><span className="hint">{v.price ? `You’d receive $${(v.price * 0.85).toFixed(2)} per sale` : 'Free'}</span></div>
            </div>
            <div className="row wrap" style={{ alignItems: 'flex-start' }}>
              <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="a-lic">Licence</label><select id="a-lic" className="input" value={v.license} onChange={set('license')}><option>All rights reserved</option><option>CC BY 4.0</option><option>CC BY-NC 4.0</option><option>CC0 / Public domain</option></select></div>
              <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="a-drm">Protection</label><select id="a-drm" className="input" value={v.drm} onChange={set('drm')}><option value="none">None (DRM-free)</option><option value="watermark">Buyer watermark (planned)</option></select><span className="hint">SAGA doesn’t offer locking DRM.</span></div>
            </div>
          </fieldset>
          {editable && <div className="row" style={{ marginTop: 8 }}><button className="btn" disabled={saving || !Object.keys(draft).length} onClick={save}>{saving ? 'Saving…' : 'Save draft'}</button><button className="btn primary" disabled={errors.length > 0} onClick={submit}>Send for review</button></div>}
          {s.status === 'submitted' && <p className="muted">In review. You’ll see the result here.</p>}

          <h2 className="section-title">History</h2>
          <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>{s.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()}: {h.action}{h.note ? `: ${h.note}` : ''}</li>)}</ol>
        </div>
      </div>
    </>
  )
}
