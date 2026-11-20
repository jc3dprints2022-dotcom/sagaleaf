import { store, useLive, href, go } from '../../app/state'
import { loadBooks, addSamples, loadAnnotations, type BookView } from '../../app/data'
import { importUi } from './ImportModal'
import { Carousel, prefetchCovers } from '../discoverParts'
import { rowCards, rememberCards } from '../../app/discover'
import { swr, peekSync } from '../../app/swr'
import type { DiscoverCard } from '../../app/card'
import { Cover, hlCss, pct, chapterLabel } from '../components'
import { Icon } from '../icons'
import { ago } from '../../core/util'
import { useEffect, useState } from 'react'
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
  const notes = useLive(async () => (await loadAnnotations()).filter(a => !a.deleted && a.kind !== 'bookmark').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4), [], ['annotations'])
  const [busy, setBusy] = useState(false)
  useEffect(() => { const t = setTimeout(() => { void import('../reader/Reader') }, 1500); return () => clearTimeout(t) }, [])   // the reader is ready before it's needed

  if (!books) return null
  if (!books.length) return (
    <>
      <h1 className="page-title">Your library starts here</h1>
      <div className="empty">
        <h2>Add your first book</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => importUi.open()}><Icon.plus />Add books</button>
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await addSamples(); setBusy(false) }}>{busy ? 'Adding…' : 'Add classic books'}</button>
          <a className="btn" href={href('catalog')}>Browse Discover</a>
        </div>
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

      <RecommendedRow books={books} />

      {!!notes?.length && (
        <>
          <h2 className="section-title">Recent highlights <a href={href('library?seg=highlights')}>All highlights</a></h2>
          <div className="grid-2">
            {notes.map(a => {
              const b = books.find(x => x.id === a.bookId)
              return (
                <a key={a.id} className="quote-card" href={href(`read/${a.bookId}?ann=${a.id}`)} onClick={e => { if (!b) { e.preventDefault(); go('library?seg=highlights') } }} style={{ '--hl': hlCss(a.color) } as React.CSSProperties}>
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

/** A Discover row built from the authors and subjects in the library (Popular while it is empty or too small to tell). */
function RecommendedRow({ books }: { books: BookView[] }) {
  const sig = books.length + ':' + books.map(b => b.author).join('|').length
  const warm = peekSync<DiscoverCard[]>(`row:v1:recommended:${sig}`)?.value ?? null
  const [cards, setCards] = useState<DiscoverCard[] | null>(warm)
  const [loading, setLoading] = useState(!warm)
  useEffect(() => {
    let live = true
    swr<DiscoverCard[]>(`row:v1:recommended:${sig}`, () => rowCards('recommended', books), { ttl: 3600_000, onCached: v => { if (live) { setCards(v); setLoading(false) } } })
      .then(v => { if (live) { setCards(v); prefetchCovers(v, 8); void rememberCards(v) } })
      .catch(() => { if (live) setCards(c => c ?? []) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [sig])  // eslint-disable-line react-hooks/exhaustive-deps
  if (!loading && !cards?.length) return null
  return <Carousel id="home-recommended" title="Recommended" cards={cards} loading={loading} seeAll={href('catalog?row=recommended')} />
}
