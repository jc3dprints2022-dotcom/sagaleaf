import { useEffect, useState } from 'react'
import { store, useLive, toast, useRoute } from '../../app/state'
import { Seg, Toggle, Modal } from '../components'
import { useAccount, prepareSignIn, signInWithEmail, signInWithGoogle, signOut, syncNow, deleteAccount } from '../../app/account'
import { Icon } from '../icons'
import { exportLibrary, sweepOrphans } from '../../core/library'
import { downloadBytes } from '../../app/data'
import { fmtBytes } from '../../core/util'
import { FONTS, THEMES } from '../reader/engine'
import type { ReaderPrefs } from '../../core/types'
import { PRODUCT } from '../../app/product'
import { DevicesSection } from './Devices'
import { importUi } from './ImportModal'

export function Settings() {
  const route = useRoute()
  const appearance = useLive(() => store.getMeta<'system' | 'light' | 'dark'>('appearance', 'system'), [], ['meta'])
  const prefs = useLive(() => store.prefs(), [], ['meta'])
  const autoDownload = useLive(() => store.getMeta('autoDownload', true), [], ['meta'])
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  const [busy, setBusy] = useState('')
  useEffect(() => { (async () => { const e = await navigator.storage?.estimate?.(); const p = await navigator.storage?.persisted?.(); setEst({ usage: e?.usage, quota: e?.quota, persisted: p }) })() }, [busy])
  const at = route.name === 'devices' ? 'devices' : route.query.get('at')
  useEffect(() => { if (at && prefs) document.getElementById(at)?.scrollIntoView({ block: 'start' }) }, [at, !!prefs])  // eslint-disable-line react-hooks/exhaustive-deps
  if (!prefs) return null
  const setP = (p: Partial<ReaderPrefs>) => store.setMeta('prefs', { ...prefs, ...p })

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <AccountSection />

      <h2 className="section-title" id="devices">Devices</h2>
      <DevicesSection />

      <h2 className="section-title" id="reading">Reading</h2>
      <div className="panel">
        <div className="row wrap" style={{ marginBottom: 16 }}><span style={{ flex: 1 }}>Page colour</span><Seg label="Page colour" value={prefs.theme} onChange={v => setP({ theme: v })} options={[{ value: 'day', label: 'Day' }, { value: 'warm', label: 'Warm' }, { value: 'mist', label: 'E-ink' }, { value: 'night', label: 'Night' }, { value: 'auto', label: 'Auto' }]} /></div>
        <div className="row wrap" style={{ marginBottom: 16 }}><span style={{ flex: 1 }}>Typeface</span><select className="input" style={{ width: 240 }} value={prefs.font} onChange={e => setP({ font: e.target.value })} aria-label="Typeface">{Object.keys(FONTS).map(f => <option key={f} value={f}>{f === 'System' ? 'System sans' : f}</option>)}</select></div>
        <div className="row wrap" style={{ marginBottom: 16 }}><label htmlFor="s-size" style={{ flex: 1 }}>Text size <span className="muted num">{prefs.size}px</span></label><input id="s-size" type="range" min={12} max={36} value={prefs.size} onChange={e => setP({ size: Number(e.target.value) })} style={{ width: 240, accentColor: 'var(--accent)' }} /></div>
        <div style={{ padding: '18px 22px', borderRadius: 10, background: (THEMES[prefs.theme] ?? THEMES.day).bg, color: (THEMES[prefs.theme] ?? THEMES.day).fg, fontFamily: FONTS[prefs.font], fontSize: prefs.size, lineHeight: prefs.lineHeight }}>
          It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
        </div>
      </div>

      <h2 className="section-title" id="appearance">Appearance</h2>
      <div className="panel row wrap"><span style={{ flex: 1 }}>App colours</span><Seg label="App colours" value={appearance ?? 'system'} onChange={v => store.setMeta('appearance', v)} options={[{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>

      <h2 className="section-title" id="library">Your library</h2>
      <div className="list">
        <div className="list-row"><b style={{ flex: 1 }}>Back up everything</b>
          <button className="btn small" disabled={!!busy} onClick={async () => { setBusy('export'); const z = await exportLibrary(store); downloadBytes(`saga-library-${new Date().toISOString().slice(0, 10)}.zip`, z, 'application/zip'); setBusy(''); toast(`Backup saved (${fmtBytes(z.length)})`) }}><Icon.download />{busy === 'export' ? 'Preparing…' : 'Export library'}</button></div>
        <div className="list-row"><b style={{ flex: 1 }}>Notes only</b>
          <button className="btn small" onClick={async () => { const z = await exportLibrary(store, { includeFiles: false }); downloadBytes(`saga-notes-${new Date().toISOString().slice(0, 10)}.zip`, z, 'application/zip') }}>Export notes</button></div>
        <div className="list-row"><b style={{ flex: 1 }}>Restore from a backup</b>
          <button className="btn small" onClick={() => importUi.open()}><Icon.upload />Restore</button></div>
        <div className="list-row"><b style={{ flex: 1 }}>Download my other devices’ books automatically</b><Toggle label="Download automatically" checked={autoDownload ?? true} onChange={v => store.setMeta('autoDownload', v)} /></div>
      </div>

      <h2 className="section-title" id="storage">Storage</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>{est.usage != null ? <>Using <b>{fmtBytes(est.usage)}</b>{est.quota ? ` of about ${fmtBytes(est.quota)}` : ''}.</> : 'Storage size isn’t available here.'} {est.persisted ? 'Your data is protected from automatic clean-up.' : 'The browser may clear this data when space runs low.'}</p>
        <div className="row wrap">
          {!est.persisted && <button className="btn small" onClick={async () => { const ok = await navigator.storage?.persist?.(); setBusy(String(Math.random())); toast(ok ? 'Storage is now persistent' : `The browser declined. Installing ${PRODUCT.name} as an app usually allows it.`) }}>Keep my data</button>}
          <button className="btn small quiet" onClick={async () => { const n = await sweepOrphans(store); toast(n ? `Cleaned up ${n} leftover item${n > 1 ? 's' : ''}` : 'Nothing to clean up') }}>Clean up leftovers</button>
        </div>
      </div>

      <h2 className="section-title" id="about">About</h2>
      <p className="small muted">{PRODUCT.name} 0.3. EPUB rendering by foliate-js, PDF by pdf.js. Free books from Standard Ebooks, Project Gutenberg, Wikisource and the Internet Archive. This device: {store.deviceName}.</p>
      <details className="panel privacy">
        <summary>Privacy</summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          <li>No analytics, no ads. {PRODUCT.name} doesn’t record what you read.</li>
          <li>Books, highlights and notes stay on this device unless you sign in.</li>
          <li>Signed in, your book list, highlights, notes, bookmarks and reading positions are stored in your account (Supabase), readable only by you. Book files are never uploaded.</li>
          <li>Getting a book from Discover tells that site which book you took.</li>
        </ul>
      </details>
    </>
  )
}

function AccountSection() {
  const a = useAccount()
  const [email, setEmail] = useState('')
  const [emailForm, setEmailForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { prepareSignIn() }, [])
  if (a.availability === 'off') return null
  const signedIn = !!a.email
  const sync = a.sync
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const ready = a.availability === 'idle' || a.availability === 'loading' || a.availability === 'ready'
  const status = sync.message ?? (sync.phase === 'syncing' || sync.phase === 'starting' ? 'Syncing…' : sync.last ? `Up to date. Last synced ${new Date(sync.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '')
  return (
    <>
      <h2 className="section-title" id="account">Account &amp; sync</h2>
      <div className="panel account-card" aria-live="polite">
        {!signedIn ? <>
          {a.availability === 'needs-web' && <p className="small muted" style={{ margin: 0 }}>Sign-in works when {PRODUCT.name} is opened from its web address.</p>}
          {a.availability === 'unavailable' && <p className="small muted" style={{ margin: 0 }}>Sign-in isn’t available right now. Everything else works without it.</p>}
          {ready && <>
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn primary google" disabled={busy || a.availability === 'loading'} onClick={() => void run(signInWithGoogle)}>Continue with Google</button>
              <button className="btn" disabled={busy || a.availability === 'loading'} aria-expanded={emailForm} onClick={() => setEmailForm(v => !v)}>Email me a link</button>
            </div>
            {emailForm && <form className="row wrap" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); if (email.includes('@')) void run(() => signInWithEmail(email)) }}>
              <input className="input" type="email" required autoComplete="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: '1 1 240px', maxWidth: 340 }} />
              <button className="btn primary" type="submit" disabled={busy}>Send link</button>
            </form>}
          </>}
          {a.pending && <p className="small" role="status" style={{ margin: 0 }}>{a.pending}</p>}
        </> : <>
          <div className="row wrap"><span style={{ flex: 1 }}>Signed in as <b>{a.email}</b></span><button className="btn small" disabled={busy} onClick={() => void run(signOut)}>Sign out</button></div>
          <div className="row wrap" style={{ gap: 10 }}>
            <span className="small muted" style={{ flex: 1 }} data-testid="sync-status">{status}</span>
            <button className="btn small" disabled={sync.phase === 'syncing' || sync.phase === 'starting'} onClick={() => void syncNow()}><Icon.sync />Sync now</button>
          </div>
          <div><button className="btn small quiet danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete account and synced data</button></div>
        </>}
      </div>
      {confirmDelete && <Modal title="Delete account and synced data?" onClose={() => setConfirmDelete(false)} actions={<><button className="btn quiet" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn danger" disabled={busy} onClick={() => void run(async () => { const r = await deleteAccount(); setConfirmDelete(false); toast(r.message, undefined, 8000) })}>Delete</button></>}>
        <p style={{ marginTop: 0 }}>This removes your synced book list, highlights, notes and positions from the cloud and signs you out. Books and notes on this device stay.</p>
      </Modal>}
    </>
  )
}
