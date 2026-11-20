import { useEffect, useState } from 'react'
import { store, engine, useLive, href, go, toast, DEV_SIMULATORS, LOCAL_LEAF } from '../../app/state'
import { loadBooks } from '../../app/data'
import { Modal, Toggle, ProgressBar } from '../components'
import { Icon } from '../icons'
import { ago, fmtBytes, hlcTime } from '../../core/util'
import { discover, productName, LeafClient, DEFAULT_CANDIDATES, SIM_CANDIDATES, isLocalDevice, type LeafHello } from '../../core/leaf/client'
import { LOCAL_LEAF_URL } from '../../app/localLeaf'
import { LeafScreen } from './LeafScreen'
import { addLeafPeer } from '../../core/leaf/sync'
import type { Peer } from '../../core/types'
import { PRODUCT } from '../../app/product'

/** Settings > Devices: this device's name, the other devices signed in to the account, and SAGA Leaf pairing. */
export function DevicesSection() {
  const peers = useLive(() => store.db.peers.toArray(), [], ['peers'])
  const others = useLive(async () => {
    const m = new Map<string, { name: string; at: number }>()
    for (const p of await store.db.positions.toArray()) {
      if (p.deleted || p.deviceId === store.deviceId || p.deviceId.startsWith('leaf-')) continue
      const at = hlcTime(p.at), cur = m.get(p.deviceId)
      if (!cur || at > cur.at) m.set(p.deviceId, { name: p.deviceName, at })
    }
    return [...m].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at)
  }, [], ['positions'])
  const [pairing, setPairing] = useState(false)
  const [name, setName] = useState(store.deviceName)
  if (!peers) return null
  const leaves = peers.filter(p => p.kind === 'leaf')
  return (
    <>
      <div className="panel row wrap">
        <Icon.devices width={22} />
        <label className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}><span className="sr-only">Device name</span><input className="input" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== store.deviceName && store.setDeviceName(name.trim()).then(() => toast('Renamed. Your other devices see the new name after the next sync.'))} /></label>
        <span className="pill">This device</span>
      </div>
      {!!others?.length && <div className="list" style={{ marginTop: 10 }}>{others.map(o => <div key={o.id} className="list-row"><Icon.devices width={20} /><b style={{ flex: 1 }}>{o.name}</b><span className="small muted">last seen {ago(o.at)}</span></div>)}</div>}
      <h3 className="sub-title">SAGA Leaf <button className="btn small" onClick={() => setPairing(true)}><Icon.plus />Add a SAGA Leaf</button></h3>
      {!leaves.length ? <p className="muted small" style={{ margin: 0 }}>No SAGA Leaf paired. <button className="linklike" onClick={() => setPairing(true)}>Find my SAGA Leaf</button></p>
        : <div className="stack">{leaves.map(l => <LeafCard key={l.id} peer={l} />)}</div>}
      {pairing && <PairLeaf onClose={() => setPairing(false)} />}
    </>
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
  const peer = useLive(async () => (await store.db.peers.get(id)) ?? null, [id], ['peers'])
  const books = useLive(loadBooks, [], ['books', 'positions'])
  const transfers = useLive(() => store.db.transfers.where('peerId').equals(id).toArray(), [id], ['transfers'])
  const [busy, setBusy] = useState(false)
  const [screen, setScreen] = useState(false)
  const passage = useLeafPassage(id)
  if (peer === undefined || !books) return null
  if (!peer || peer.kind !== 'leaf') return <div className="empty"><h2>Device not found</h2><a className="btn" href={href('settings?at=devices')}>Settings</a></div>
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
      <a href={href('settings?at=devices')} className="btn quiet small" style={{ marginLeft: -10, marginBottom: 14 }}><Icon.back />Settings</a>
      <div className="device-card" style={{ marginBottom: 26 }}>
        {leafArt(peer, passage || 'No book open yet.')}
        <div>
          <h1 className="page-title">{peer.name}</h1>
          <div className="stat-line"><span>Firmware <b>{L.firmware ?? (v2 ? '2.x' : '1.0.0')}</b></span><span>{isLocalDevice(peer.url) ? 'Runs inside this page' : peer.url.replace(/^https?:\/\//, '')}</span>{L.battery?.available && <span>Battery <b>{L.battery.percent}%</b></span>}{L.storage && <span><b>{fmtBytes(L.storage.usedBytes)}</b> of {fmtBytes(L.storage.capacityBytes)} used</span>}</div>
          <div className="row wrap">
            <button className="btn primary small" disabled={busy} onClick={async () => { setBusy(true); const r = await engine.syncPeer(peer); setBusy(false); toast(r.errors.length ? r.errors[0] : summary(r, peer.name), undefined, 6000) }}><Icon.sync />{busy ? 'Syncing…' : 'Sync now'}</button>
            {isLocalDevice(peer.url) ? <button className="btn small" onClick={() => setScreen(true)}>Open simulated screen</button>
              : peer.url.includes('127.0.0.1') && <a className="btn small" href={`${peer.url}/device`} target="_blank" rel="noreferrer">Open simulated screen</a>}
            <button className="btn small quiet danger" onClick={async () => { if (!confirm(`Forget ${peer.name}? Books stay on the device.`)) return; if (v2) await new LeafClient(peer.url, peer.token).unpair(store.deviceId).catch(() => 0); await store.db.peers.delete(peer.id); store.emit('peers'); go('settings?at=devices') }}>Forget this SAGA Leaf</button>
          </div>
        </div>
      </div>

      <div className="panel row"><div style={{ flex: 1 }}><b>Send what I’m reading</b></div><Toggle label="Send what I’m reading" checked={L.autoSend} onChange={v => set({ autoSend: v })} /></div>

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
      {screen && <Modal title={peer.name} onClose={() => setScreen(false)} wide><LeafScreen /><div className="actions"><button className="btn primary" onClick={async () => { await engine.syncPeer(peer); const p = await store.db.peers.get(peer.id); toast(p?.lastError ? `Couldn’t reach ${peer.name}` : `${peer.name} is up to date`) }}><Icon.sync />Sync now</button><button className="btn" onClick={() => setScreen(false)}>Done</button></div></Modal>}
    </>
  )
}

function summary(r: { uploaded: number; pulled: number; pushed: number; applied: number }, name: string) {
  const parts = [r.uploaded && `${r.uploaded} book${r.uploaded > 1 ? 's' : ''} sent`, r.pulled && 'picked up your place on the SAGA Leaf', r.applied && `${r.applied} highlight${r.applied > 1 ? 's' : ''} updated`, r.pushed && 'sent your latest place and notes'].filter(Boolean)
  return parts.length ? `Synced: ${parts.join(', ')}` : `Synced: ${name} was already up to date`
}
