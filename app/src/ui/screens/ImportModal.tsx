// Add books: one pop-up with two choices. A file or folder is looked at to see what it is (a book, a Calibre
// library, Kindle highlights, a SAGA backup) and goes to the matching importer; a link can be a Gutenberg,
// Standard Ebooks, Wikisource or Internet Archive page, or a direct .epub or .pdf. One result line at the end.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast, go, useRoute } from '../../app/state'
import { pickFiles } from '../../app/data'
import { importAny, importTree, pickFolder, type ImportOutcome } from '../../app/importers'
import { importLink } from '../../app/discover'
import { DownloadBlocked } from '../../app/gutendex'
import { Modal, ProgressBar } from '../components'
import { Icon } from '../icons'
import { IS_NATIVE } from '../../app/native'

// open/close from anywhere (Library's Add, Discover's link icon, the old #/import address)
let open = false
let initialLink = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(s => s())
export const importUi = {
  open: (opts: { link?: boolean } = {}) => { open = true; initialLink = !!opts.link; emit() },
  close: () => { open = false; emit() },
}
const useOpen = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => open)

export const FILE_TYPES = '.epub,.pdf,.txt,.zip,.html,.htm,.csv,application/epub+zip,application/pdf,text/plain,application/zip,text/html,text/csv'
const canPickFolder = () => !IS_NATIVE && typeof window !== 'undefined' && ('showDirectoryPicker' in window || 'webkitdirectory' in document.createElement('input'))

export function ImportModal() {
  const isOpen = useOpen()
  const route = useRoute()
  // going somewhere else closes it (the old #/import address opens it instead)
  useEffect(() => { if (route.name !== 'import') importUi.close() }, [route.name, route.params.id])
  if (!isOpen) return null
  return <ImportDialog key={String(initialLink)} startWithLink={initialLink} />
}

function ImportDialog({ startWithLink }: { startWithLink: boolean }) {
  const [mode, setMode] = useState<'choose' | 'link'>(startWithLink ? 'link' : 'choose')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [url, setUrl] = useState('')
  const [blocked, setBlocked] = useState<string | null>(null)
  const close = importUi.close

  async function run(job: () => Promise<ImportOutcome | null>) {
    setBusy(true); setOutcome(null); setBlocked(null); setProgress(null)
    try { const r = await job(); if (r) setOutcome(r) } catch (e) { setOutcome({ line: (e as Error).message }) } finally { setBusy(false); setProgress(null) }
  }
  const onProgress = (done: number, total: number) => setProgress({ done, total })
  const upload = () => run(async () => { const f = await pickFiles(FILE_TYPES); return f.length ? importAny(f, onProgress) : null })
  const folder = () => run(async () => { const t = await pickFolder(); return t ? importTree(t, onProgress) : null })
  async function getLink(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    if (!navigator.onLine) { setOutcome({ line: 'Getting a book needs an internet connection.' }); return }
    await run(async () => {
      try {
        const r = await importLink(url)
        setUrl('')
        return { line: `“${r.title}” is in your library`, action: { label: 'Read now', href: `#/read/${r.bookId}` } }
      } catch (err) {
        if (err instanceof DownloadBlocked) { setBlocked(err.url); return null }
        throw err
      }
    })
  }

  return (
    <Modal title="Add books" onClose={close} actions={outcome || mode === 'link' ? <button className="btn" onClick={close}>{outcome ? 'Done' : 'Cancel'}</button> : undefined}>
      {mode === 'choose' ? (
        <div className="import-choices">
          <button className="import-choice" disabled={busy} onClick={upload}><Icon.upload width={26} /><b>Upload a file</b><span>Books, highlights and backups</span></button>
          <button className="import-choice" disabled={busy} onClick={() => { setMode('link'); setOutcome(null) }}><Icon.link width={26} /><b>Paste a link</b><span>From a free book site</span></button>
        </div>
      ) : (
        <form onSubmit={getLink} className="url-import" style={{ marginTop: 14 }}>
          <label className="small muted" htmlFor="url-import-input" style={{ display: 'block', marginBottom: 6 }}>Link to a book</label>
          <div className="row">
            <input id="url-import-input" className="input" type="url" inputMode="url" autoFocus placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
            <button className="btn primary" type="submit" disabled={busy || !url.trim()}><Icon.download />{busy ? 'Getting…' : 'Get book'}</button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>Project Gutenberg, Standard Ebooks, Wikisource, Internet Archive, or a link ending in .epub or .pdf.</p>
          <button type="button" className="btn quiet small" style={{ marginLeft: -10, marginTop: 6 }} onClick={() => { setMode('choose'); setOutcome(null); setBlocked(null) }}><Icon.back />Back</button>
        </form>
      )}
      {mode === 'choose' && canPickFolder() && !busy && !outcome && <p className="small" style={{ margin: '14px 0 0' }}>Have a whole folder? <button className="linklike" onClick={folder}>Upload a folder</button></p>}
      {progress && progress.total > 0 && <div style={{ marginTop: 14 }}><ProgressBar value={progress.done / progress.total} label="Adding" /><p className="small muted num">{progress.done} of {progress.total}</p></div>}
      {busy && !progress && <p className="small muted" role="status" style={{ marginTop: 14 }}>Working…</p>}
      {blocked && <div className="banner" style={{ marginTop: 14 }} role="status"><span>Couldn’t download this one from here. <a href={blocked} target="_blank" rel="noreferrer">Open the link</a>, save the file, then upload it.</span></div>}
      {outcome && (
        <div className="banner" role="status" style={{ marginTop: 14 }} data-testid="import-result">
          <span>{outcome.line}</span>
          {outcome.action && <button className="btn small" onClick={() => { const h = outcome.action!.href; close(); if (h.startsWith('#/')) go(h.slice(2)); else location.href = h }}>{outcome.action.label}</button>}
        </div>
      )}
    </Modal>
  )
}

/** For code that wants the same single-line result as a toast. */
export const importFromPicker = async () => { const f = await pickFiles(FILE_TYPES); if (!f.length) return; const r = await importAny(f); toast(r.line) }
