import { useEffect, useState } from 'react'
import { store, useLive, toast } from '../../app/state'
import { Seg, Toggle, Modal } from '../components'
import { useAccount, prepareSignIn, signInWithEmail, signInWithGoogle, signOut, startSync, stopSyncByUser, syncNow, libraryCode } from '../../app/account'
import { Icon } from '../icons'
import { exportLibrary, importBackup, sweepOrphans } from '../../core/library'
import { downloadBytes, pickFiles } from '../../app/data'
import { fmtBytes } from '../../core/util'
import { FONTS, THEMES } from '../reader/engine'
import type { ReaderPrefs } from '../../core/types'

export function Settings() {
  const appearance = useLive(() => store.getMeta<'system' | 'light' | 'dark'>('appearance', 'system'), [], ['meta'])
  const prefs = useLive(() => store.prefs(), [], ['meta'])
  const autoDownload = useLive(() => store.getMeta('autoDownload', true), [], ['meta'])
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  const [busy, setBusy] = useState('')
  useEffect(() => { (async () => { const e = await navigator.storage?.estimate?.(); const p = await navigator.storage?.persisted?.(); setEst({ usage: e?.usage, quota: e?.quota, persisted: p }) })() }, [busy])
  if (!prefs) return null
  const setP = (p: Partial<ReaderPrefs>) => store.setMeta('prefs', { ...prefs, ...p })

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Everything here applies to this device.</p>

      <h2 className="section-title">Appearance</h2>
      <div className="panel row wrap"><span style={{ flex: 1 }}>App colours</span><Seg label="App colours" value={appearance ?? 'system'} onChange={v => store.setMeta('appearance', v)} options={[{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>

      <h2 className="section-title">Reading</h2>
      <div className="panel">
        <div className="row wrap" style={{ marginBottom: 16 }}><span style={{ flex: 1 }}>Page colour</span><Seg label="Page colour" value={prefs.theme} onChange={v => setP({ theme: v })} options={[{ value: 'day', label: 'Day' }, { value: 'warm', label: 'Warm' }, { value: 'mist', label: 'E-ink' }, { value: 'night', label: 'Night' }, { value: 'auto', label: 'Auto' }]} /></div>
        <div className="row wrap" style={{ marginBottom: 16 }}><span style={{ flex: 1 }}>Typeface</span><select className="input" style={{ width: 240 }} value={prefs.font} onChange={e => setP({ font: e.target.value })} aria-label="Typeface">{Object.keys(FONTS).map(f => <option key={f} value={f}>{f === 'System' ? 'System sans' : f}</option>)}</select></div>
        <div className="row wrap" style={{ marginBottom: 16 }}><label htmlFor="s-size" style={{ flex: 1 }}>Text size <span className="muted num">{prefs.size}px</span></label><input id="s-size" type="range" min={12} max={36} value={prefs.size} onChange={e => setP({ size: Number(e.target.value) })} style={{ width: 240, accentColor: 'var(--accent)' }} /></div>
        <div style={{ padding: '18px 22px', borderRadius: 10, background: (THEMES[prefs.theme] ?? THEMES.day).bg, color: (THEMES[prefs.theme] ?? THEMES.day).fg, fontFamily: FONTS[prefs.font], fontSize: prefs.size, lineHeight: prefs.lineHeight }}>
          It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Atkinson Hyperlegible and OpenDyslexic are designed for low vision and dyslexia. More options, like spacing and margins, are in the reader’s text menu.</p>
      </div>

      <AccountSection />

      <h2 className="section-title">Your library</h2>
      <div className="list">
        <div className="list-row"><div style={{ flex: 1 }}><b>Back up everything</b><p className="small muted" style={{ margin: 0 }}>One .zip with your original files, highlights, notes, positions and collections. Readable without SAGA Reader: notes are included as Markdown and W3C Web Annotations.</p></div>
          <button className="btn small" disabled={!!busy} onClick={async () => { setBusy('export'); const z = await exportLibrary(store); downloadBytes(`saga-library-${new Date().toISOString().slice(0, 10)}.zip`, z, 'application/zip'); setBusy(''); toast(`Backup saved (${fmtBytes(z.length)})`) }}><Icon.download />{busy === 'export' ? 'Preparing…' : 'Export library'}</button></div>
        <div className="list-row"><div style={{ flex: 1 }}><b>Notes only</b><p className="small muted" style={{ margin: 0 }}>Small backup without book files.</p></div>
          <button className="btn small" onClick={async () => { const z = await exportLibrary(store, { includeFiles: false }); downloadBytes(`saga-notes-${new Date().toISOString().slice(0, 10)}.zip`, z, 'application/zip') }}>Export notes</button></div>
        <div className="list-row"><div style={{ flex: 1 }}><b>Restore from a backup</b><p className="small muted" style={{ margin: 0 }}>Merges into this library. Nothing you have is overwritten or deleted.</p></div>
          <button className="btn small" disabled={!!busy} onClick={async () => { const [f] = await pickFiles('.zip,application/zip', false); if (!f) return; setBusy('import'); try { const r = await importBackup(store, new Uint8Array(await f.arrayBuffer())); toast(`Restored ${r.books} books and ${r.annotations} highlights`) } catch (e) { toast((e as Error).message, undefined, 7000) } finally { setBusy('') } }}><Icon.upload />{busy === 'import' ? 'Restoring…' : 'Restore'}</button></div>
        <div className="list-row"><div style={{ flex: 1 }}><b>Download books from my other devices automatically</b><p className="small muted" style={{ margin: 0 }}>When sync includes files. Off: download each book when you need it.</p></div><Toggle label="Download automatically" checked={autoDownload ?? true} onChange={v => store.setMeta('autoDownload', v)} /></div>
      </div>

      <h2 className="section-title">Privacy</h2>
      <div className="panel">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>No account is needed. No analytics, no ads. SAGA Reader doesn’t record what you read.</li>
          <li>Books, highlights, notes and reading positions are stored on this device.</li>
          <li>If you sign in, we store your email address (through Supabase, our sign-in provider). Only if you turn on “Sync my notes and reading progress” do we also store your highlights, notes, bookmarks and reading positions (with each book’s title, so they’re labelled on your other devices), encrypted on this device with your library code first. Your book files are never uploaded.</li>
          <li>Device sync and the SAGA Leaf are off until you set them up. Device sync is encrypted here first too; the sync service can’t read it.</li>
          <li>Getting a book from Discover tells that catalog which book you took, as a store would. Nothing about your reading is shared.</li>
        </ul>
      </div>

      <h2 className="section-title">Storage</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>{est.usage != null ? <>Using <b>{fmtBytes(est.usage)}</b>{est.quota ? ` of about ${fmtBytes(est.quota)} available to SAGA Reader` : ''}.</> : 'Storage size isn’t available in this browser.'} {est.persisted ? 'The browser has agreed not to clear this data.' : 'The browser may clear this data under storage pressure; install SAGA Reader or allow persistent storage to prevent that.'}</p>
        <div className="row wrap">
          {!est.persisted && <button className="btn small" onClick={async () => { const ok = await navigator.storage?.persist?.(); setBusy(String(Math.random())); toast(ok ? 'Storage is now persistent' : 'The browser declined. Installing SAGA Reader as an app usually allows it.') }}>Keep my data</button>}
          <button className="btn small quiet" onClick={async () => { const n = await sweepOrphans(store); toast(n ? `Cleaned up ${n} leftover item${n > 1 ? 's' : ''}` : 'Nothing to clean up') }}>Clean up leftovers</button>
        </div>
      </div>

      <h2 className="section-title">About</h2>
      <p className="small muted">SAGA Reader 0.2. Reads EPUB, PDF and TXT on your devices and the SAGA Leaf. Free books in Discover come from Project Gutenberg. EPUB rendering by foliate-js, PDF by pdf.js. Device: {store.deviceName} ({store.deviceId}).</p>
    </>
  )
}

function AccountSection() {
  const a = useAccount()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [newCode, setNewCode] = useState<string | null>(null)
  const [showCode, setShowCode] = useState<string | null>(null)
  useEffect(() => { prepareSignIn() }, [])
  if (a.availability === 'off') return null
  const signedIn = !!a.email
  const sync = a.sync
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const status = sync.phase === 'syncing' || sync.phase === 'starting' ? 'Syncing…'
    : sync.phase === 'idle' && sync.last ? `Up to date. Last synced ${new Date(sync.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''
  return (
    <>
      <h2 className="section-title">Account <span className="pill">Optional</span></h2>
      <div className="panel" aria-live="polite">
        {!signedIn ? <>
          <p style={{ marginTop: 0 }}>You don’t need an account. Sign in only if you want your notes and reading progress on your other devices.</p>
          {a.availability === 'needs-web' && <p className="small muted" style={{ marginBottom: 0 }}>Sign-in works when SAGA Reader is opened from its web address, not from a file on this computer.</p>}
          {a.availability === 'unavailable' && <p className="small muted" style={{ marginBottom: 0 }}>Sign-in isn’t available right now (the sign-in service couldn’t be reached). Everything else works without it.</p>}
          {(a.availability === 'idle' || a.availability === 'loading' || a.availability === 'ready') && <>
            <form className="row wrap" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); if (email.includes('@')) void run(() => signInWithEmail(email)) }}>
              <input className="input" type="email" required autoComplete="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: '1 1 240px', maxWidth: 340 }} />
              <button className="btn primary" type="submit" disabled={busy || a.availability === 'loading'}>Email me a sign-in link</button>
              <button className="btn" type="button" disabled={busy || a.availability === 'loading'} onClick={() => void run(signInWithGoogle)}>Continue with Google</button>
            </form>
          </>}
          {a.pending && <p className="small" role="status" style={{ marginBottom: 0 }}>{a.pending}</p>}
        </> : <>
          <div className="row wrap"><span style={{ flex: 1 }}>Signed in as <b>{a.email}</b></span><button className="btn small" disabled={busy} onClick={() => void run(signOut)}>Sign out</button></div>
          <div className="list-row" style={{ padding: '16px 0 0', borderBottom: 0 }}>
            <div style={{ flex: 1 }}><b>Sync my notes and reading progress</b><p className="small muted" style={{ margin: 0 }}>Highlights, notes, bookmarks and reading positions, encrypted on this device before upload. Book files stay here.</p></div>
            <Toggle label="Sync my notes and reading progress" checked={sync.on} onChange={v => void run(async () => { if (v) { const r = await startSync(); if (r?.created) setNewCode(r.created) } else await stopSyncByUser() })} />
          </div>
          {sync.on && sync.phase === 'needs-code' && <form className="row wrap" style={{ gap: 8, marginTop: 12 }} onSubmit={e => { e.preventDefault(); void run(() => startSync(code)) }}>
            <p className="small" style={{ width: '100%', margin: 0 }}>{sync.message}</p>
            <input className="input" placeholder="saga-xxxxx-xxxxx-xxxxx" aria-label="Library code" value={code} onChange={e => setCode(e.target.value)} style={{ maxWidth: 300 }} autoComplete="off" spellCheck={false} />
            <button className="btn primary" type="submit" disabled={busy || !code.trim()}>Use this code</button>
          </form>}
          {sync.on && sync.phase !== 'needs-code' && <div className="row wrap" style={{ marginTop: 12, gap: 10 }}>
            <span className="small muted" style={{ flex: 1 }}>{sync.message ?? status}</span>
            <button className="btn small quiet" disabled={sync.phase === 'syncing'} onClick={() => void syncNow()}><Icon.sync />Sync now</button>
            <button className="btn small quiet" onClick={async () => setShowCode(await libraryCode())}>Show library code</button>
          </div>}
        </>}
      </div>
      {newCode && <Modal title="Save your library code" onClose={() => setNewCode(null)} actions={<><button className="btn" onClick={() => { void navigator.clipboard?.writeText(newCode); toast('Library code copied') }}><Icon.copy />Copy</button><button className="btn primary" onClick={() => setNewCode(null)}>I’ve saved it</button></>}>
        <p style={{ marginTop: 0 }}>Your notes are encrypted with this code before they leave this device, so nobody else can read them, including us. To sync another device, sign in there and enter this code.</p>
        <p className="code-display" style={{ font: '600 20px ui-monospace, monospace', letterSpacing: '.04em', userSelect: 'all' }}>{newCode}</p>
        <p className="small muted" style={{ marginBottom: 0 }}>If you lose it, your synced notes can’t be recovered from the account; the notes on your devices are unaffected. You can see it again here in Settings.</p>
      </Modal>}
      {showCode && <Modal title="Library code" onClose={() => setShowCode(null)} actions={<button className="btn primary" onClick={() => setShowCode(null)}>Done</button>}>
        <p style={{ marginTop: 0 }}>Enter this on another device to sync with it.</p>
        <p style={{ font: '600 20px ui-monospace, monospace', letterSpacing: '.04em', userSelect: 'all' }}>{showCode}</p>
      </Modal>}
    </>
  )
}
