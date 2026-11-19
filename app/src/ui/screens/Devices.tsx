import { useEffect, useState } from 'react'
import { store, engine, useLive, href, go, toast, useSyncStatus, PLATFORM_URL, DEV_SIMULATORS, LOCAL_LEAF, STANDALONE } from '../../app/state'
import { loadBooks } from '../../app/data'
import { Modal, Toggle, ProgressBar } from '../components'
import { Icon } from '../icons'
import { ago, fmtBytes } from '../../core/util'
import { newLibrarySecret } from '../../core/sync/crypto'
import { addRelayPeer } from '../../core/sync/engine'
import { discover, productName, LeafClient, DEFAULT_CANDIDATES, SIM_CANDIDATES, isLocalDevice, type LeafHello } from '../../core/leaf/client'
import { LOCAL_LEAF_URL } from '../../app/localLeaf'
import { LeafScreen } from './LeafScreen'
import { addLeafPeer } from '../../core/leaf/sync'
import type { Peer } from '../../core/types'
import { PRODUCT } from '../../app/product'

export function Devices() {
  const peers = useLive(() => store.db.peers.toArray(), [], ['peers'])
  const status = useSyncStatus()
  const [pairing, setPairing] = useState(false)
  const [linking, setLinking] = useState<null | 'new' | 'join'>(null)
  const [name, setName] = useState(store.deviceName)
  if (!peers) return null
  const relay = peers.find(p => p.kind === 'relay')
  const leaves = peers.filter(p => p.kind === 'leaf')

  return (
    <>
      <h1 className="page-title">Devices</h1>
      <p className="page-sub">Your library lives on each of your devices. Sync keeps them in step; nothing depends on a server to keep working.</p>

      <h2 className="section-title">This device</h2>
      <div className="panel row wrap">
        <Icon.devices width={22} />
        <label className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}><span className="sr-only">Device name</span><input className="input" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== store.deviceName && store.setDeviceName(name.trim()).then(() => toast('Renamed. Other devices see the new name after the next sync.'))} /></label>
        <span className="small muted">Shown on your other devices, e.g. “Continue from {name}”.</span>
      </div>

      <h2 className="section-title">Sync between your phones and computers</h2>
      {relay ? <RelayCard relay={relay} status={status} /> : (
        <div className="panel">
          <p style={{ marginTop: 0, maxWidth: '62ch' }}>Turn on sync to carry your place, highlights, notes and collections between devices. Everything is encrypted on this device with a key only your devices hold; the sync service stores scrambled data it can’t read.</p>
          <div className="row wrap"><button className="btn primary" onClick={() => setLinking('new')}><Icon.sync />Turn on sync</button><button className="btn" onClick={() => setLinking('join')}>I have a library code</button></div>
        </div>
      )}

      <h2 className="section-title">SAGA Leaf <button className="btn small" onClick={() => setPairing(true)}><Icon.plus />Add a SAGA Leaf</button></h2>
      {!leaves.length ? (
        <div className="empty" style={{ padding: 36 }}><h2>No SAGA Leaf paired</h2><p>Your SAGA Leaf carries the books you’re reading and comes back with your place and highlights. Turn on its Wi-Fi from Settings on the device, then add it here.</p><button className="btn primary" onClick={() => setPairing(true)}>Find my SAGA Leaf</button></div>
      ) : <div className="stack">{leaves.map(l => <LeafCard key={l.id} peer={l} />)}</div>}

      {pairing && <PairLeaf onClose={() => setPairing(false)} />}
      {linking && <LinkSync mode={linking} onClose={() => setLinking(null)} />}
    </>
  )
}

function RelayCard({ relay, status }: { relay: Peer; status: ReturnType<typeof useSyncStatus> }) {
  const [show, setShow] = useState(false)
  const remote = useLive(async () => (await store.db.books.toArray()).filter(b => !b.deleted && b.fileState === 'remote').length, [], ['books'])
  const state = status.state === 'syncing' ? 'Syncing now' : status.state === 'offline' ? 'Offline' : relay.lastError ? 'Can’t reach the sync service' : 'Up to date'
  return (
    <div className="panel">
      <div className="row wrap">
        <span className={`dot ${status.state === 'syncing' ? 'busy' : relay.lastError ? 'err' : status.state === 'offline' ? 'off' : 'ok'}`} />
        <b>{state}</b>
        <span className="muted small">{relay.lastSyncAt ? `last synced ${ago(relay.lastSyncAt)}` : 'not synced yet'}{status.pending ? `, ${status.pending} change${status.pending > 1 ? 's' : ''} waiting` : ''}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => engine.syncAll().then(() => toast('Synced'))}><Icon.sync />Sync now</button>
      </div>
      {relay.lastError && <p className="small" style={{ color: 'var(--danger)' }}>{relay.lastError}. Your changes are safe on this device and will go out when the connection is back.</p>}
      {status.progress && <div style={{ margin: '12px 0' }}><p className="small muted" style={{ margin: '0 0 6px' }}>{status.progress.label}</p><ProgressBar value={status.progress.done / status.progress.total} /></div>}
      <div className="row" style={{ marginTop: 16 }}>
        <div style={{ flex: 1 }}><b>Sync book files too</b><p className="small muted" style={{ margin: 0 }}>Uploads your files (encrypted) so other devices can download them. Off: only progress, highlights and notes sync.{remote ? ` ${remote} book${remote > 1 ? 's are' : ' is'} waiting to download here.` : ''}</p></div>
        <Toggle label="Sync book files" checked={relay.syncFiles} onChange={async v => { await store.db.peers.update(relay.id, { syncFiles: v }); store.emit('peers'); engine.schedule(0) }} />
      </div>
      <div style={{ marginTop: 18 }}>
        <b>Add another device</b>
        <p className="small muted" style={{ margin: '2px 0 10px' }}>Open {PRODUCT.name} there, choose “I have a library code”, and enter this code. Anyone with the code can read your synced library, so keep it private.</p>
        {show ? <div className="code-box">{relay.secret}</div> : <button className="btn small" onClick={() => setShow(true)}>Show library code</button>}
      </div>
      <div className="row" style={{ marginTop: 18 }}><span className="spacer" /><button className="btn small quiet danger" onClick={async () => { if (!confirm('Stop syncing this device? Your library stays here, nothing is deleted.')) return; await store.db.peers.delete(relay.id); store.emit('peers'); toast('Sync turned off on this device') }}>Turn off sync on this device</button></div>
    </div>
  )
}

function LinkSync({ mode, onClose }: { mode: 'new' | 'join'; onClose: () => void }) {
  const [secret] = useState(() => newLibrarySecret())
  const [code, setCode] = useState('')
  const [url, setUrl] = useState(PLATFORM_URL)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go_() {
    setBusy(true); setErr('')
    const s = mode === 'new' ? secret : code.trim().toLowerCase()
    if (!/^saga-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/.test(s)) { setErr('That code doesn’t look right. It has the form saga-xxxxx-xxxxx-xxxxx.'); setBusy(false); return }
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/api/health').catch(() => null)
      if (!r?.ok) throw new Error('The sync service didn’t answer. Check the address, or try again when you’re online.')
      await addRelayPeer(store, url.replace(/\/$/, ''), s, true)
      store.emit('peers'); await engine.syncAll()
      toast(mode === 'new' ? 'Sync is on' : 'Joined your library. Books and notes are arriving.')
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title={mode === 'new' ? 'Turn on sync' : 'Join your library'} onClose={onClose} actions={<><button className="btn quiet" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={go_}>{busy ? 'Connecting…' : mode === 'new' ? 'Turn on sync' : 'Join'}</button></>}>
      {mode === 'new' ? <>
        <p>This is your library code. Your devices use it to encrypt and find your library. Write it down or keep it in a password manager: if you lose every device, it’s the only way back to your synced notes.</p>
        <div className="code-box">{secret}</div>
      </> : <div className="field" style={{ marginTop: 12 }}><label htmlFor="lc">Library code</label><input id="lc" className="input" autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="saga-xxxxx-xxxxx-xxxxx" autoComplete="off" spellCheck={false} /><span className="hint">Find it on a device that already syncs: Devices, then Show library code.</span></div>}
      <details style={{ marginTop: 16 }} open={STANDALONE}><summary className="small muted">Sync service address</summary>{STANDALONE && <p className="small" style={{ marginBottom: 0 }}>This copy of {PRODUCT.name} runs straight from a file, so there’s no sync service built in. Start one on a computer your devices can reach (<code>npm run platform</code> in the {PRODUCT.name} project) and enter its address here. Everything else, including the simulated SAGA Leaf, works without it.</p>}<input className="input" value={url} onChange={e => setUrl(e.target.value)} style={{ marginTop: 8 }} aria-label="Sync service address" /><p className="small muted">You can run your own; it only stores encrypted data.</p></details>
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
    </Modal>
  )
}

function useLeafPassage(peerId: string) {
  return useLive(async () => {
    const p = (await store.db.positions.toArray()).filter(x => x.deviceId === peerId && !x.deleted).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
    if (!p) return ''
    const row = await store.db.texts.get([p.bookId, p.section])
    if (!row) return p.snippet
    let s = p.offset; while (s > 0 && !/\s/.test(row.text[s - 1])) s--
    return row.text.slice(s, s + 360).replace(/\s+/g, ' ')
  }, [peerId], ['positions'])
}
const isSim = (url: string) => url.includes('127.0.0.1') || isLocalDevice(url)

function leafArt(peer: Peer, text = '') {
  const sim = /simulat/i.test(peer.name) || isSim(peer.url)
  return <div className={`leaf-art${sim ? ' sim' : ''}${peer.lastError ? ' off' : ''}`} aria-hidden="true"><div className="scr">{text}</div></div>
}

function LeafCard({ peer }: { peer: Peer }) {
  const L = peer.leaf!
  const onDevice = Object.keys(L.map).length
  const used = L.storage ? L.storage.usedBytes / L.storage.capacityBytes : 0
  const [busy, setBusy] = useState(false)
  const passage = useLeafPassage(peer.id)
  return (
    <div className="device-card">
      {leafArt(peer, passage || 'No book open yet.')}
      <div>
        <div className="row wrap"><h3 className="title-serif" style={{ fontSize: 20, flex: 1 }}>{peer.name}</h3>{peer.lastError ? <span className="pill">Not reachable</span> : <span className="pill copper">Paired</span>}</div>
        <div className="stat-line">
          <span><b>{onDevice}</b> book{onDevice === 1 ? '' : 's'} on it</span>
          {L.battery?.available ? <span>Battery <b>{L.battery.percent}%</b></span> : <span title="Firmware 1.0.0 hardware has no battery sense line">Battery level not available</span>}
          {L.storage && <span><b>{fmtBytes(L.storage.capacityBytes - L.storage.usedBytes)}</b> free</span>}
          <span>{peer.lastSyncAt ? `Synced ${ago(peer.lastSyncAt)}` : 'Not synced yet'}</span>
        </div>
        {L.storage && <ProgressBar value={used} copper />}
        {peer.lastError && <p className="small muted">{peer.lastError} Make sure the SAGA Leaf’s Wi-Fi is on and it’s on the same network. Your reading on the SAGA Leaf is kept and syncs when it’s back.</p>}
        <div className="row wrap" style={{ marginTop: 16 }}>
          <button className="btn small primary" disabled={busy} onClick={async () => { setBusy(true); await engine.syncPeer(peer); setBusy(false); const p = await store.db.peers.get(peer.id); toast(p?.lastError ? `Couldn’t reach ${peer.name}` : `${peer.name} is up to date`) }}><Icon.sync />{busy ? 'Syncing…' : 'Sync now'}</button>
          <a className="btn small" href={href(`device/${peer.id}`)}>Manage</a>
        </div>
      </div>
    </div>
  )
}

function PairLeaf({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState<LeafHello[] | null>(null)
  const [manual, setManual] = useState('')
  const [chosen, setChosen] = useState<LeafHello | null>(null)
  const [pairingId, setPairingId] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function scan(extra: string[] = []) {
    setFound(null); setErr('')
    const saved = (await store.db.peers.toArray()).filter(p => p.kind === 'leaf').map(p => p.url)
    const r = await discover([...extra, ...(LOCAL_LEAF ? [LOCAL_LEAF_URL] : []), ...saved, ...DEFAULT_CANDIDATES, ...(DEV_SIMULATORS ? SIM_CANDIDATES : [])])
    setFound(r)
  }
  useEffect(() => { void scan() }, [])
  async function choose(h: LeafHello) {
    setChosen(h); setErr('')
    if (h.protocol === 2) {
      try { const r = await new LeafClient(h.url).pairStart(store.deviceId, `${PRODUCT.name} on ${store.deviceName}`); setPairingId(r.pairingId) } catch (e) { setErr((e as Error).message) }
    }
  }
  async function confirm() {
    if (!chosen) return
    setBusy(true); setErr('')
    try {
      const c = new LeafClient(chosen.url)
      let token: string
      if (chosen.protocol === 2) { const r = await c.pairConfirm(pairingId, code.trim()); token = r.token }
      else { c.token = pw; await c.checkPassword(); token = pw }
      const peer = await addLeafPeer(store, chosen, token)
      toast(`Paired with ${chosen.name}. Books you’re reading will be sent now.`)
      onClose(); go(`device/${peer.id}`)
      void engine.syncPeer(peer)
    } catch (e) { setErr((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403 ? (chosen.protocol === 2 ? 'That code doesn’t match the one on the SAGA Leaf.' : 'Wrong password. The default is printed in the SAGA Leaf’s manual; you may have changed it in its settings.') : (e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Modal title={chosen ? `Pair ${chosen.name}` : 'Add a SAGA Leaf'} onClose={onClose}>
      {!chosen ? <>
        <p className="muted small">On the SAGA Leaf: Settings, Wi-Fi, then “Connect to phone”. Keep this device on the same Wi-Fi, or join the SAGA Leaf’s own network (SagaLeaf).</p>
        <div className="list" style={{ margin: '14px 0' }}>
          {found === null && <div className="list-row"><span className="dot busy" />Looking for SAGA Leaf devices…</div>}
          {found?.map(h => (
            <button key={h.url} className="list-row" style={{ width: '100%', background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => choose(h)}>
              <Icon.devices width={22} color="var(--copper)" />
              <div style={{ flex: 1 }}><b>{productName(h.name)}</b><p className="small muted" style={{ margin: 0 }}>{isLocalDevice(h.url) ? 'Runs inside this page' : h.url.replace(/^https?:\/\//, '')}, firmware {h.firmware}{h.url.includes('127.0.0.1') ? ' (simulator)' : ''}</p></div>
              <span className="pill">{h.protocol === 2 ? 'Full sync' : 'Books and notes'}</span>
            </button>
          ))}
          {found?.length === 0 && <div className="list-row muted small">No SAGA Leaf found. Check its Wi-Fi is on, or enter its address below.</div>}
        </div>
        <form className="row" onSubmit={e => { e.preventDefault(); const u = manual.trim(); if (u) void scan([/^https?:/.test(u) ? u : `http://${u}`]) }}>
          <input className="input" placeholder="Address, e.g. 192.168.1.40" value={manual} onChange={e => setManual(e.target.value)} aria-label="SAGA Leaf address" />
          <button className="btn" type="submit">Look</button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>Browsers can’t scan your network, so {PRODUCT.name} checks the SAGA Leaf’s usual addresses. Using {PRODUCT.name} from a secure (https) address? Browsers block it from reaching a SAGA Leaf; use the installed app or the local address.</p>
      </> : chosen.protocol === 2 ? <>
        <p>Enter the 6-digit code now showing on the SAGA Leaf’s screen.</p>
        {isLocalDevice(chosen.url) ? <div style={{ margin: '10px 0 16px' }}><LeafScreen showLog={false} /></div>
          : chosen.url.includes('127.0.0.1') && <p className="small"><a href={`${chosen.url}/device`} target="_blank" rel="noreferrer">Open the simulated SAGA Leaf screen</a> to see the code.</p>}
        <input className="input" autoFocus inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ fontSize: 26, letterSpacing: '.3em', textAlign: 'center', height: 56 }} aria-label="Pairing code" />
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="actions"><button className="btn quiet" onClick={() => setChosen(null)}>Back</button><button className="btn primary" disabled={code.length !== 6 || busy} onClick={confirm}>{busy ? 'Pairing…' : 'Pair'}</button></div>
      </> : <>
        <p>This SAGA Leaf runs firmware {chosen.firmware}. It can receive books and share its notes, but can’t yet sync your reading position; a firmware update adds that.</p>
        <div className="field"><label htmlFor="lpw">SAGA Leaf password</label><input id="lpw" type="password" className="input" value={pw} onChange={e => setPw(e.target.value)} autoFocus /><span className="hint">Set on the SAGA Leaf under Settings, Wi-Fi.</span></div>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="actions"><button className="btn quiet" onClick={() => setChosen(null)}>Back</button><button className="btn primary" disabled={!pw || busy} onClick={confirm}>{busy ? 'Connecting…' : 'Connect'}</button></div>
      </>}
    </Modal>
  )
}

export function DeviceDetail({ id }: { id: string }) {
  const peer = useLive(() => store.db.peers.get(id), [id], ['peers'])
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const transfers = useLive(() => store.db.transfers.where('peerId').equals(id).toArray(), [id], ['transfers'])
  const [busy, setBusy] = useState(false)
  const [screen, setScreen] = useState(false)
  const passage = useLeafPassage(id)
  if (peer === undefined || !books) return null
  if (!peer || peer.kind !== 'leaf') return <div className="empty"><h2>Device not found</h2><a className="btn" href={href('devices')}>Devices</a></div>
  const L = peer.leaf!
  const v2 = L.protocol === 2
  const set = async (patch: Partial<typeof L>) => { peer.leaf = { ...L, ...patch }; await store.db.peers.put(peer); store.emit('peers') }
  const caps: [string, boolean, string][] = [
    ['Receive books', true, v2 ? 'Resumable, checked by checksum' : 'Whole-file upload; restarts if interrupted'],
    ['Highlights and notes', true, v2 ? 'Both ways' : `From the SAGA Leaf to ${PRODUCT.name} only`],
    ['Reading position', v2, v2 ? 'Both ways, by matching text' : 'Needs firmware 2 (progress endpoints)'],
    ['Battery level', !!L.battery?.available, L.battery?.available ? 'Reported by the device' : 'Needs a battery-sense line on the board'],
    ['Secure pairing', v2, v2 ? 'Code shown on the device, per-app token' : 'Shared device password'],
  ]
  return (
    <>
      <a href={href('devices')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 14 }}><Icon.back />Devices</a>
      <div className="device-card" style={{ marginBottom: 26 }}>
        {leafArt(peer, passage || 'No book open yet.')}
        <div>
          <h1 className="page-title">{peer.name}</h1>
          <div className="stat-line"><span>Firmware <b>{L.firmware ?? (v2 ? '2.x' : '1.0.0')}</b></span><span>{isLocalDevice(peer.url) ? 'Runs inside this page' : peer.url.replace(/^https?:\/\//, '')}</span>{L.battery?.available && <span>Battery <b>{L.battery.percent}%</b></span>}{L.storage && <span><b>{fmtBytes(L.storage.usedBytes)}</b> of {fmtBytes(L.storage.capacityBytes)} used</span>}</div>
          <div className="row wrap">
            <button className="btn primary small" disabled={busy} onClick={async () => { setBusy(true); const r = await engine.syncPeer(peer); setBusy(false); toast(r.errors.length ? r.errors[0] : summary(r, peer.name), undefined, 6000) }}><Icon.sync />{busy ? 'Syncing…' : 'Sync now'}</button>
            {isLocalDevice(peer.url) ? <button className="btn small" onClick={() => setScreen(true)}>Open simulated screen</button>
              : peer.url.includes('127.0.0.1') && <a className="btn small" href={`${peer.url}/device`} target="_blank" rel="noreferrer">Open simulated screen</a>}
            <button className="btn small quiet danger" onClick={async () => { if (!confirm(`Forget ${peer.name}? Books stay on the device.`)) return; if (v2) await new LeafClient(peer.url, peer.token).unpair(store.deviceId).catch(() => 0); await store.db.peers.delete(peer.id); store.emit('peers'); go('devices') }}>Forget this SAGA Leaf</button>
          </div>
        </div>
      </div>

      <div className="panel row"><div style={{ flex: 1 }}><b>Send what I’m reading</b><p className="small muted" style={{ margin: 0 }}>Books you’ve started go to the SAGA Leaf automatically. Switch any book off below to keep it off.</p></div><Toggle label="Send what I’m reading" checked={L.autoSend} onChange={v => set({ autoSend: v })} /></div>

      <h2 className="section-title">Books</h2>
      <div className="list">
        {books.filter(b => b.fileState === 'local').sort((a, b) => Number(!!L.map[b.id]) - Number(!!L.map[a.id]) || b.lastAt - a.lastAt).map(b => {
          const t = transfers?.find(x => x.bookId === b.id)
          const on = !!L.map[b.id], want = !!L.send[b.id]
          const leafPos = b.positions.find(p => p.deviceId === peer.id)
          return (
            <div key={b.id} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="title-serif">{b.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {on ? (leafPos ? `On the SAGA Leaf, ${Math.round(leafPos.fraction * 100)}% read there` : 'On the SAGA Leaf') : t?.state === 'sending' ? `Sending ${Math.round((t.sent / Math.max(1, t.size)) * 100)}%` : t?.state === 'paused' ? `Paused at ${Math.round((t.sent / Math.max(1, t.size)) * 100)}%: ${t.error}. Resumes on the next sync.` : t?.state === 'failed' ? t.error : want ? 'Waiting to send' : ''}
                </p>
                {t && (t.state === 'sending' || t.state === 'paused') && <div style={{ marginTop: 6, maxWidth: 320 }}><ProgressBar value={t.sent / Math.max(1, t.size)} copper /></div>}
              </div>
              {on && <button className="btn small quiet" onClick={async () => { await new LeafClient(peer.url, peer.token).deleteBook(L.map[b.id]).catch(e => toast((e as Error).message)); const m = { ...L.map }; delete m[b.id]; await set({ map: m, send: { ...L.send, [b.id]: false } }); toast(`Removed from ${peer.name}. Highlights made there are kept in ${PRODUCT.name}.`) }}>Remove from SAGA Leaf</button>}
              {!on && <Toggle label={`Send ${b.title}`} checked={want} onChange={v => { void set({ send: { ...L.send, [b.id]: v } }).then(() => { if (v) void engine.syncPeer(peer) }) }} />}
            </div>
          )
        })}
      </div>

      <h2 className="section-title">What this SAGA Leaf can do</h2>
      <div className="list">{caps.map(([k, ok, note]) => <div key={k} className="list-row"><span className={`dot ${ok ? 'ok' : 'off'}`} /><span style={{ width: 200 }}>{k}</span><span className="small muted">{note}</span></div>)}</div>
      {!v2 && <p className="small muted" style={{ marginTop: 12 }}>The missing pieces need the firmware changes described in the SAGA Leaf protocol document (docs/LEAF_PROTOCOL.md).</p>}
      {screen && <Modal title={peer.name} onClose={() => setScreen(false)} wide><LeafScreen /><div className="actions"><button className="btn primary" onClick={async () => { await engine.syncPeer(peer); const p = await store.db.peers.get(peer.id); toast(p?.lastError ? `Couldn’t reach ${peer.name}` : `${peer.name} is up to date`) }}><Icon.sync />Sync now</button><button className="btn" onClick={() => setScreen(false)}>Done</button></div></Modal>}
    </>
  )
}

function summary(r: { uploaded: number; pulled: number; pushed: number; applied: number }, name: string) {
  const parts = [r.uploaded && `${r.uploaded} book${r.uploaded > 1 ? 's' : ''} sent`, r.pulled && 'picked up your place on the SAGA Leaf', r.applied && `${r.applied} highlight${r.applied > 1 ? 's' : ''} updated`, r.pushed && 'sent your latest place and notes'].filter(Boolean)
  return parts.length ? `Synced: ${parts.join(', ')}` : `Synced: ${name} was already up to date`
}
