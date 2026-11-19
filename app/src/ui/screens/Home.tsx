import { store, useLive, href, go } from '../../app/state'
import { importDropped } from '../../app/importers'
import { loadBooks, addSamples, pickFiles, loadAnnotations, type BookView } from '../../app/data'
import { Cover, ProgressBar, hlCss, pct, chapterLabel } from '../components'
import { Icon } from '../icons'
import { ago } from '../../core/util'
import { useState } from 'react'
import { PRODUCT } from '../../app/product'

const FONT_STACK: Record<string, string> = {
  Literata: "'Literata Variable', Georgia, serif", Newsreader: "'Newsreader Variable', Georgia, serif",
  'Atkinson Hyperlegible': "'Atkinson Hyperlegible', system-ui, sans-serif", OpenDyslexic: "'OpenDyslexic', sans-serif",
  Georgia: 'Georgia, serif', System: 'system-ui, sans-serif',
}
export const fontStack = (f: string) => FONT_STACK[f] ?? FONT_STACK.Literata

async function passageFor(b: BookView) {
  const p = b.position
  if (!p || p.section < 0) return null
  const row = await store.db.texts.get([b.id, p.section])
  if (!row) return null
  const t = row.text
  let s = Math.max(0, Math.min(p.offset, t.length - 1))
  while (s > 0 && !/\s/.test(t[s - 1])) s--
  let lead = t.slice(Math.max(0, s - 90), s); lead = lead.slice(lead.search(/\s/) + 1)
  return { lead: lead.replace(/\s+/g, ' '), text: t.slice(s, s + 420).replace(/\s+/g, ' '), chapter: chapterLabel(row.title) }
}

export function Home() {
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const prefs = useLive(() => store.prefs(), [], ['meta'])
  const reading = (books ?? []).filter(b => b.progress > 0.002 && b.progress < 0.995 && b.status !== 'finished').sort((a, b) => b.lastAt - a.lastAt)
  const current = reading[0]
  const passage = useLive(async () => (current ? passageFor(current) : null), [current?.id, current?.position?.at], ['positions'])
  const recent = (books ?? []).slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 12)
  const notes = useLive(async () => (await loadAnnotations()).filter(a => !a.deleted && a.kind !== 'bookmark').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [], ['annotations'])
  const leaves = useLive(async () => (await store.db.peers.toArray()).filter(p => p.kind === 'leaf'), [], ['peers'])
  const [busy, setBusy] = useState(false)

  if (!books) return null
  if (!books.length) return (
    <>
      <h1 className="page-title">Your library starts here</h1>
      <p className="page-sub">{PRODUCT.name} keeps your books, highlights and notes on your own devices. Nothing is uploaded unless you turn on sync.</p>
      <div className="empty">
        <h2>Add your first book</h2>
        <p>Drop EPUB, PDF or text files anywhere on this page, or choose them from your computer. DRM-free files only.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={async () => importDropped(await pickFiles())}><Icon.plus />Choose files</button>
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await addSamples(); setBusy(false) }}>{busy ? 'Adding…' : 'Add classic books'}</button>
        </div>
        <p className="small muted" style={{ marginTop: 18 }}>The classics are public-domain editions (Standard Ebooks and Project Gutenberg).</p>
        <p className="small muted">Coming from Calibre or Kindle? <a href={href('import')}>Import your library or highlights</a>.</p>
      </div>
    </>
  )

  const font = fontStack(prefs?.font ?? 'Literata')
  return (
    <>
      {current ? (
        <section className="resume" aria-label="Continue reading" style={{ '--read-font': font } as React.CSSProperties}>
          <div>
            {passage ? <p className="passage long"><span className="lead">{passage.lead} </span>{passage.text}</p> : <p className="passage">{current.title}</p>}
            <div className="where">
              <h2>{current.title}</h2>
              <p>{passage?.chapter ? `${passage.chapter}, ` : ''}{pct(current.progress)} read{current.lastDevice ? `, last on ${current.lastDevice === store.deviceName ? 'this device' : current.lastDevice} ${ago(current.lastAt)}` : ''}</p>
            </div>
            <div className="actions">
              <a className="btn primary" href={href(`read/${current.id}`)}>Continue reading</a>
              {reading.length > 1 && <span className="small muted">Also reading: {reading.slice(1, 3).map((b, i) => <span key={b.id}>{i ? ', ' : ''}<a href={href(`read/${b.id}`)}>{b.title}</a></span>)}</span>}
            </div>
          </div>
          <a href={href(`book/${current.id}`)} aria-label={`About ${current.title}`}><Cover book={current} /></a>
        </section>
      ) : (
        <section className="resume" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <p className="passage" style={{ fontFamily: font }}>Pick something to read. {PRODUCT.name} will remember the exact sentence you stop on, on every device.</p>
            <div className="actions"><a className="btn primary" href={href('library')}>Open your library</a></div>
          </div>
        </section>
      )}

      <h2 className="section-title">Recently added <a href={href('library')}>All books</a></h2>
      <div className="hscroll">
        {recent.map(b => (
          <a key={b.id} className="book-tile" href={href(`book/${b.id}`)}>
            <Cover book={b} showFormat />
            <div className="meta"><h3>{b.title}</h3><p>{b.author}</p>{b.progress > 0.002 && <ProgressBar value={b.progress} />}</div>
          </a>
        ))}
      </div>

      {!!leaves?.length && (
        <>
          <h2 className="section-title">Your SAGA Leaf <a href={href('devices')}>Devices</a></h2>
          <div className="list">{leaves.map(l => (
            <a key={l.id} className="list-row" href={href(`device/${l.id}`)} style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className={`dot ${l.lastError ? 'off' : 'copper'}`} />
              <div style={{ flex: 1 }}><h3>{l.name}</h3><p className="small muted" style={{ margin: 0 }}>{Object.keys(l.leaf?.map ?? {}).length} books on the device{l.leaf?.battery?.available ? `, battery ${l.leaf.battery.percent}%` : ''}, {l.lastError ? 'not reachable right now' : `synced ${ago(l.lastSyncAt)}`}</p></div>
            </a>
          ))}</div>
        </>
      )}

      {!!notes?.length && (
        <>
          <h2 className="section-title">Recent highlights <a href={href('notes')}>All notes</a></h2>
          <div className="grid-2">
            {notes.map(a => {
              const b = books.find(x => x.id === a.bookId)
              return (
                <a key={a.id} className="quote-card" href={href(`read/${a.bookId}?ann=${a.id}`)} onClick={e => { if (!b) { e.preventDefault(); go('notes') } }} style={{ '--hl': hlCss(a.color) } as React.CSSProperties}>
                  <blockquote>{a.exact.length > 260 ? a.exact.slice(0, 260) + '…' : a.exact}</blockquote>
                  {a.note && <p className="note">{a.note}</p>}
                  <p className="small muted" style={{ margin: 0 }}>{b?.title ?? 'Removed book'}</p>
                </a>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
