import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Store } from '../core/store'
import { SyncEngine, type EngineStatus } from '../core/sync/engine'
import { syncLeaf } from '../core/leaf/sync'
import { sweepOrphans } from '../core/library'
import { localPlatform, localPlatformImage } from './localPlatform'
import { installLocalLeaf } from './localLeaf'

export const store = new Store()
export const engine = new SyncEngine(store)
engine.leafSync = peer => syncLeaf(store, peer)

export const PLATFORM_URL = (import.meta.env.VITE_PLATFORM_URL as string | undefined) ?? 'http://127.0.0.1:8791'
/** Single-file build: runs from disk with no server. The publishing demo and a
 *  simulated Leaf run inside the page; only device-to-device sync needs a server. */
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1'
export const DEV_SIMULATORS = import.meta.env.DEV || import.meta.env.VITE_SIMULATORS === '1'
/** The in-page simulated Leaf is offered in the standalone file and in development. */
export const LOCAL_LEAF = STANDALONE || import.meta.env.DEV
if (LOCAL_LEAF) installLocalLeaf()

let ready: Promise<void> | null = null
export function boot() {
  return (ready ??= (async () => {
    await store.init()
    await navigator.storage?.persist?.().catch(() => false)
    sweepOrphans(store).catch(() => 0)
    engine.start()
  })())
}

/** Re-runs `fn` whenever one of `tables` changes. */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[], tables: string[]): T | undefined {
  const [v, setV] = useState<T>()
  const fnRef = useRef(fn); fnRef.current = fn
  useEffect(() => {
    let alive = true, seq = 0
    const run = () => { const n = ++seq; fnRef.current().then(r => { if (alive && n === seq) setV(r) }).catch(e => console.error(e)) }
    run()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = store.on(t => { if (tables.some(x => t.has(x)) && !timer) timer = setTimeout(() => { timer = undefined; run() }, 120) })
    return () => { alive = false; clearTimeout(timer); off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export function useSyncStatus(): EngineStatus {
  return useSyncExternalStore(cb => engine.onStatus(() => cb()), () => engine.status)
}

// ---------- router (hash based: works offline and from file:// or any static host)
export type Route = { name: string; params: Record<string, string>; query: URLSearchParams }
function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const query = new URLSearchParams(qs ?? '')
  const [a, b] = parts
  switch (a) {
    case undefined: case '': return { name: 'home', params: {}, query }
    case 'book': return { name: 'book', params: { id: b }, query }
    case 'read': return { name: 'read', params: { id: b }, query }
    case 'collection': return { name: 'collection', params: { id: b }, query }
    case 'device': return { name: 'device', params: { id: b }, query }
    case 'catalog': return b ? { name: 'catalog-item', params: { id: b }, query } : { name: 'catalog', params: {}, query }
    case 'author': return b ? { name: 'author-sub', params: { id: b }, query } : { name: 'author', params: {}, query }
    default: return { name: a, params: {}, query }
  }
}
let current = parse()
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => { current = parse(); subs.forEach(s => s()) })
export const useRoute = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => current)
export const go = (path: string) => { location.hash = '#/' + path.replace(/^\/+/, '') }
export const href = (path: string) => '#/' + path.replace(/^\/+/, '')

// ---------- toasts
export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; ms?: number }
let toasts: Toast[] = []
const tsubs = new Set<() => void>()
export function toast(text: string, action?: Toast['action'], ms = 4200) {
  const t = { id: Date.now() + Math.random(), text, action, ms }
  toasts = [...toasts, t]; tsubs.forEach(s => s())
  setTimeout(() => { toasts = toasts.filter(x => x !== t); tsubs.forEach(s => s()) }, ms)
}
export const useToasts = () => useSyncExternalStore(cb => { tsubs.add(cb); return () => tsubs.delete(cb) }, () => toasts)

// ---------- workspace (demo roles for the author/publisher prototype)
export interface DemoUser { id: string; name: string; role: 'reader' | 'author' | 'publisher' }
export const DEMO_USERS: DemoUser[] = [
  { id: 'reader-1', name: 'You (reader)', role: 'reader' },
  { id: 'author-ada', name: 'Ada Marsh (demo author)', role: 'author' },
  { id: 'pub-north', name: 'Northlight Press (demo publisher)', role: 'publisher' },
]
export function platform(path: string, init: RequestInit = {}, user?: DemoUser) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (user) { headers['x-demo-user'] = user.id; headers['x-demo-role'] = user.role; headers['x-demo-name'] = user.name }
  return (STANDALONE ? localPlatform(path, { ...init, headers }) : fetch(PLATFORM_URL + path, { ...init, headers })).then(async r => {
    const ct = r.headers.get('content-type') ?? ''
    const body = ct.includes('json') ? await r.json() : await r.arrayBuffer()
    if (!r.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${r.status}`), { status: r.status, body })
    return body
  })
}

/** Image URL for a platform path (book covers). */
export function usePlatformImage(path: string) {
  const [src, setSrc] = useState(STANDALONE ? '' : PLATFORM_URL + path)
  useEffect(() => { if (STANDALONE) { let live = true; localPlatformImage(path).then(u => live && setSrc(u)); return () => { live = false } } else setSrc(PLATFORM_URL + path) }, [path])
  return src
}

// Test hook for the end-to-end suites. Present in development and standalone builds.
if (import.meta.env.DEV || STANDALONE) (window as unknown as Record<string, unknown>).__saga = { store, engine }
