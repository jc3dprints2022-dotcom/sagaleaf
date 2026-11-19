import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Book } from '../core/types'
import { store, useLive, useToasts, useSyncStatus, usePlatformImage } from '../app/state'
import { useAccount } from '../app/account'
import { Icon } from './icons'
import { ago } from '../core/util'

const coverUrls = new Map<string, string>()
export function useCoverUrl(bookId: string, has: boolean) {
  const [url, setUrl] = useState(() => coverUrls.get(bookId))
  useEffect(() => {
    if (!has || coverUrls.has(bookId)) { setUrl(coverUrls.get(bookId)); return }
    let alive = true
    store.db.covers.get(bookId).then(c => {
      if (!c || !alive) return
      const u = URL.createObjectURL(new Blob([c.data as BlobPart], { type: c.type }))
      coverUrls.set(bookId, u); setUrl(u)
    })
    return () => { alive = false }
  }, [bookId, has])
  return url
}

/** Covers: the publisher's art when the file has one; otherwise a typographic
 *  cover generated from the title, tinted per book so shelves stay legible. */
export function Cover({ book, width, showFormat }: { book: Pick<Book, 'id' | 'title' | 'author' | 'hasCover' | 'tint' | 'format'> & { fileState?: Book['fileState'] }; width?: number | string; showFormat?: boolean }) {
  const url = useCoverUrl(book.id, book.hasCover)
  const style = useMemo(() => {
    const h = book.tint ?? 200
    const dark = document.documentElement.dataset.appearance === 'dark'
    return { width, '--gen-bg': `hsl(${h} ${dark ? 22 : 28}% ${dark ? 26 : 34}%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties
  }, [book.tint, width])
  const badges = (<>
    {showFormat && book.format !== 'epub' && <span className="fmt">{book.format.toUpperCase()}</span>}
    {book.fileState === 'remote' && <span className="cloud" title="On your other devices; downloads when you open it"><Icon.cloud /></span>}
  </>)
  if (url) return <div className="cover" style={{ width }}><img src={url} alt="" loading="lazy" />{badges}</div>
  return (
    <div className="cover gen" style={style} aria-hidden="true" lang="en">
      <span className="t">{book.title}</span><span className="rule" /><span className="a">{book.author}</span>{badges}
    </div>
  )
}

export function Modal({ title, children, onClose, actions, wide }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(720px,100%)' } : undefined}>
        <div className="row" style={{ alignItems: 'flex-start' }}><h2 style={{ flex: 1 }}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.close /></button></div>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  )
}

export function Toasts() {
  const list = useToasts()
  return <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className="toast"><span>{t.text}</span>{t.action && <button onClick={t.action.run}>{t.action.label}</button>}</div>)}</div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <span className="toggle"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={e => onChange(e.target.checked)} /><span /></span>
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return <div className="seg" role="group" aria-label={label}>{options.map(o => <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>
}

/** Sync state in plain words. Technical detail lives on the Devices screen. */
export function SyncStatusLine() {
  const s = useSyncStatus()
  const account = useAccount()
  const peers = useLive(() => store.db.peers.toArray(), [], ['peers'])
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t) }, [])
  if (!peers) return null
  const relay = peers.some(p => p.kind === 'relay')
  const leaves = peers.filter(p => p.kind === 'leaf')
  let dot = 'off', text = 'Only on this device'
  if (relay || leaves.length) {
    if (s.state === 'syncing') { dot = 'busy'; text = s.progress?.label ?? 'Syncing…' }
    else if (s.state === 'offline') { dot = 'off'; text = s.pending ? `Offline. ${s.pending} change${s.pending > 1 ? 's' : ''} will sync later` : 'Offline. Reading works as usual' }
    else if (s.state === 'error') { dot = 'err'; text = 'Can’t reach sync right now' }
    else { dot = 'ok'; text = s.lastSyncAt ? `Up to date, ${ago(s.lastSyncAt)}` : 'Up to date' }
  } else if (account.sync.on) {
    const ph = account.sync.phase
    if (ph === 'syncing' || ph === 'starting') { dot = 'busy'; text = 'Syncing notes…' }
    else if (ph === 'error' || ph === 'needs-code') { dot = 'err'; text = ph === 'needs-code' ? 'Sync needs your library code' : (typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline. Notes sync later' : 'Notes sync paused') }
    else { dot = 'ok'; text = account.sync.last ? `Notes synced, ${ago(account.sync.last)}` : 'Notes synced' }
  }
  return (
    <a href={!relay && !leaves.length && account.sync.on ? '#/settings' : '#/devices'} className="row small" style={{ gap: 10, padding: '8px 10px', borderRadius: 8, color: 'var(--ink-2)', textDecoration: 'none' }}>
      <span className={`dot ${dot}`} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      {leaves.length > 0 && <span className="dot copper" title={`${leaves.length} SAGA Leaf paired`} />}
    </a>
  )
}

export function ProgressBar({ value: raw, copper, label = 'Progress' }: { value: number; copper?: boolean; label?: string }) {
  const value = Number.isFinite(raw) ? raw : 0
  return <div className={`bar${copper ? ' copper' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>
}

export const HL_COLORS = [
  { id: 'amber', label: 'Amber', css: 'var(--hl-amber)', hex: '#f2d27a' },
  { id: 'sage', label: 'Sage', css: 'var(--hl-sage)', hex: '#b9d8b0' },
  { id: 'sky', label: 'Sky', css: 'var(--hl-sky)', hex: '#b5d3ea' },
  { id: 'rose', label: 'Rose', css: 'var(--hl-rose)', hex: '#efbfc4' },
]
export const hlCss = (id: string) => HL_COLORS.find(c => c.id === id)?.css ?? 'var(--hl-amber)'
export const hlHex = (id: string) => HL_COLORS.find(c => c.id === id)?.hex ?? '#f2d27a'

export function pct(f: number) { return f >= 0.995 ? 'Finished' : f < 0.005 ? 'Not started' : `${Math.round(f * 100)}%` }

/** "III" or "12" alone reads oddly; give bare numerals a word. */
export function chapterLabel(t?: string) {
  const x = (t ?? '').trim()
  return /^([IVXLCDM]+|\d+)\.?$/.test(x) ? `Chapter ${x.replace(/\.$/, '')}` : x
}

/** A cover image served by the SAGA platform (the demo server, or the in-page demo in the standalone file). */
export function PlatformImg({ path, alt = '' }: { path: string; alt?: string }) {
  const src = usePlatformImage(path)
  return src ? <img src={src} alt={alt} /> : null
}
