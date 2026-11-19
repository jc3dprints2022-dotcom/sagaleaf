// Import: loose files, a Calibre library, Kindle highlights, or a link to a
// free book. All of it lands in this browser's own storage, so it works the
// same in the installed app and offline (except fetching a book from a link).
import { useState } from 'react'
import { href, go, toast } from '../../app/state'
import { pickFiles } from '../../app/data'
import { importDropped, pickFolder, runCalibreImport, calibreFromZipFile, importKindleFile, kindleSummary, calibreSummary } from '../../app/importers'
import { importFromUrl } from '../../app/standardebooks'
import { DownloadBlocked } from '../../app/gutendex'
import type { CalibreResult } from '../../core/calibre'
import type { ClippingImportResult } from '../../core/kindle'
import type { TreeFile } from '../../core/calibre'
import { ProgressBar } from '../components'
import { Icon } from '../icons'

export function ImportScreen() {
  return (
    <>
      <h1 className="page-title">Import</h1>
      <p className="page-sub">Bring in books and highlights you already have. Everything is stored in this browser on this device; nothing is uploaded. SAGA opens DRM-free books only and never removes DRM.</p>
      <section className="card import-card" aria-labelledby="imp-files">
        <h2 className="section-title" id="imp-files">EPUB, PDF and text files</h2>
        <p className="small muted">Choose files, or drop them anywhere in the app.</p>
        <button className="btn primary" onClick={async () => { const f = await pickFiles(); if (f.length) await importDropped(f) }}><Icon.plus />Choose files</button>
      </section>
      <CalibreImport />
      <KindleImport />
      <section className="card import-card" aria-labelledby="imp-url">
        <h2 className="section-title" id="imp-url">A free book from a link</h2>
        <UrlImport />
      </section>
    </>
  )
}

function CalibreImport() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<CalibreResult[] | null>(null)
  async function run(get: () => Promise<TreeFile[] | null>) {
    setResults(null)
    let files: TreeFile[] | null
    try { files = await get() } catch (e) { toast((e as Error).message, undefined, 7000); return }
    if (!files) return
    if (!files.length) { toast('No EPUB, PDF, TXT or metadata.opf files in that folder.', undefined, 7000); return }
    setBusy(true); setProgress({ done: 0, total: 0 })
    const res: CalibreResult[] = []
    try {
      await runCalibreImport(files, (done, total, r) => { res.unshift(r); setProgress({ done, total }); setResults([...res]) })
      toast(calibreSummary(res), undefined, 6000)
    } catch (e) { toast((e as Error).message, undefined, 7000) } finally { setBusy(false) }
  }
  return (
    <section className="card import-card" aria-labelledby="imp-calibre">
      <h2 className="section-title" id="imp-calibre">Calibre library</h2>
      <p className="small muted">Choose your Calibre library folder (usually “Calibre Library”) or a zip of it. Each book comes in from its EPUB, PDF or TXT, with the title and author from Calibre’s metadata.opf. Books with DRM are skipped, with the reason.</p>
      <div className="row wrap">
        <button className="btn" disabled={busy} onClick={() => run(pickFolder)}><Icon.library />Choose Calibre folder</button>
        <button className="btn" disabled={busy} onClick={() => run(async () => { const [f] = await pickFiles('.zip,application/zip', false); return f ? calibreFromZipFile(f) : null })}>Choose a zip</button>
      </div>
      {progress && progress.total > 0 && <div style={{ marginTop: 14 }}><ProgressBar value={progress.done / progress.total} label="Calibre import" /><p className="small muted num">{progress.done} of {progress.total} books</p></div>}
      {results && !!results.length && (
        <ul className="progress-list import-results" aria-label="Calibre import results" style={{ listStyle: 'none', padding: 0 }}>
          {results.map(r => (
            <li key={r.dir} data-status={r.status}>
              <span className={`dot ${r.status === 'skipped' ? 'err' : r.status === 'duplicate' ? 'off' : 'ok'}`} style={{ marginTop: 7 }} />
              <span><b>{r.title}</b> <span className="muted">{r.author}</span>{' '}
                {r.status === 'added' ? <span className="muted">added from {r.file}</span> : r.status === 'duplicate' ? <span className="muted">already in your library</span> : <span className="muted">skipped</span>}
                {r.status === 'added' && r.bookId && <> · <a href={href(`book/${r.bookId}`)}>Open</a></>}
                {!!r.reasons.length && <span className="small muted reasons" style={{ display: 'block' }}>{r.reasons.join(' ')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function KindleImport() {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ClippingImportResult | null>(null)
  return (
    <section className="card import-card" aria-labelledby="imp-kindle">
      <h2 className="section-title" id="imp-kindle">Kindle highlights and notes</h2>
      <p className="small muted">Choose <b>My Clippings.txt</b> (in the “documents” folder when your Kindle is connected by USB), or a notebook export from a Kindle app (HTML or CSV). Highlights attach to the matching book in your library; the rest wait in Highlights &amp; notes until you choose a book. Only your notes are read: SAGA doesn’t open or convert Kindle book files.</p>
      <button className="btn" disabled={busy} onClick={async () => {
        const [f] = await pickFiles('.txt,.html,.htm,.csv,text/plain,text/html,text/csv', false); if (!f) return
        setBusy(true)
        try { const r = await importKindleFile(f); setRes(r); toast(`Kindle: ${kindleSummary(r)}`, undefined, 6000) }
        catch (e) { toast((e as Error).message, undefined, 8000) } finally { setBusy(false) }
      }}><Icon.notes />{busy ? 'Reading…' : 'Choose Kindle export'}</button>
      {res && (
        <div className="banner" role="status" style={{ marginTop: 14 }}>
          <span>{kindleSummary(res)}.{res.books.length ? ` Added to ${res.books.map(b => `“${b.title}” (${b.count})`).join(', ')}.` : ''}{res.bookmarks ? ` ${res.bookmarks} bookmark${res.bookmarks === 1 ? '' : 's'} skipped.` : ''}</span>
          <button className="btn small" onClick={() => go('notes')}>{res.pending ? 'Review' : 'View highlights'}</button>
        </div>
      )}
    </section>
  )
}

/** "Paste a Gutenberg or Standard Ebooks link". Also used in Discover. */
export function UrlImport() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    if (!navigator.onLine) { toast('Getting a book needs an internet connection.'); return }
    setBusy(true); setBlocked(null)
    try {
      const r = await importFromUrl(url)
      toast(`“${r.title}” is in your library`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
      setUrl('')
    } catch (err) {
      if (err instanceof DownloadBlocked) setBlocked(err.url)
      else toast((err as Error).message, undefined, 8000)
    } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="url-import">
      <label className="small muted" htmlFor="url-import-input" style={{ display: 'block', marginBottom: 6 }}>Paste a link to a book page on Project Gutenberg or Standard Ebooks.</label>
      <div className="row" style={{ maxWidth: 620 }}>
        <input id="url-import-input" className="input" type="url" inputMode="url" placeholder="https://standardebooks.org/ebooks/…  or  https://www.gutenberg.org/ebooks/…" value={url} onChange={e => setUrl(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy || !url.trim()}><Icon.download />{busy ? 'Getting book…' : 'Get book'}</button>
      </div>
      {blocked && <div className="banner" style={{ marginTop: 12, maxWidth: 620 }} role="status"><span>Your browser didn’t let SAGA Reader download this file directly. <a href={blocked} target="_blank" rel="noreferrer">Download it here</a>, then add it with <b>Choose files</b> or drop it onto this window.</span></div>}
    </form>
  )
}
