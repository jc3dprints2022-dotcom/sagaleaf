// Stale-while-revalidate cache for Discover responses. Lists live for ~24 h:
// a cached answer is shown at once (memory first, then IndexedDB), and an old one
// is refreshed in the background. Its own small database, so the library's is untouched.
import Dexie, { type Table } from 'dexie'

export const LIST_TTL = 24 * 3600_000
interface Row { key: string; at: number; value: unknown }
class CacheDB extends Dexie {
  rows!: Table<Row, string>
  constructor() { super('saga-discover-cache'); this.version(1).stores({ rows: 'key, at' }) }
}
let db: CacheDB | null = null
const mem = new Map<string, Row>()
const inflight = new Map<string, Promise<unknown>>()
const MIRROR = 'saga.swr.'
/** Small lists are mirrored to localStorage so a returning visit paints them in the same frame, with no database read. */
export function peekSync<T>(key: string): { at: number; value: T } | null {
  const m = mem.get(key)
  if (m) return m as { at: number; value: T }
  try { const s = localStorage.getItem(MIRROR + key); if (s) { const r = JSON.parse(s) as Row; mem.set(key, r); return r as { at: number; value: T } } } catch { /* none */ }
  return null
}
let writes = 0
const BIG = 'saga.swr.big'
const hasLocalStorage = () => { try { localStorage.getItem('x'); return true } catch { return false } }
const bigKeys = (): string[] => { try { return JSON.parse(localStorage.getItem(BIG) ?? '[]') } catch { return [] } }
const getDb = () => { try { return (db ??= new CacheDB()) } catch { return null } }
/** localStorage is the fast path (synchronous, and no database to open on a cold start). Entries too big for it go to IndexedDB. */
function mirror(row: Row): boolean {
  try {
    const s = JSON.stringify(row)
    if (s.length > 160_000) return false
    localStorage.setItem(MIRROR + row.key, s)
    if (++writes % 12 !== 0) return true
    const keys = Object.keys(localStorage).filter(k => k.startsWith(MIRROR) && k !== MIRROR + 'big')
    if (keys.length > 60) for (const k of keys.sort((x, y) => (JSON.parse(localStorage.getItem(x) ?? '{}').at ?? 0) - (JSON.parse(localStorage.getItem(y) ?? '{}').at ?? 0)).slice(0, keys.length - 45)) localStorage.removeItem(k)
    return true
  } catch { return false }
}

export async function peek<T>(key: string): Promise<{ at: number; value: T } | null> {
  const m = peekSync<T>(key)
  if (m) return m
  if (hasLocalStorage() && !bigKeys().includes(key)) return null
  try {
    const r = await getDb()?.rows.get(key)
    if (r) { mem.set(key, r); return r as { at: number; value: T } }
  } catch { /* no storage: memory only */ }
  return null
}
export async function store<T>(key: string, value: T, o: { mirror?: boolean } = {}) {
  const row = { key, at: Date.now(), value }
  mem.set(key, row)
  if (o.mirror !== false && mirror(row)) return
  // too big for localStorage (or none): IndexedDB, off the critical path
  setTimeout(async () => {
    try {
      const d = getDb()
      await d?.rows.put(row)
      if (hasLocalStorage()) try { localStorage.setItem(BIG, JSON.stringify([...new Set([...bigKeys(), key])].slice(-60))) } catch { /* ignore */ }
      if (d && mem.size % 40 === 0) { const n = await d.rows.count(); if (n > 300) { const old = await d.rows.orderBy('at').limit(n - 250).primaryKeys(); await d.rows.bulkDelete(old) } }
    } catch { /* quota or private mode */ }
  }, 1500)
}
export const clearMemory = () => { mem.clear(); try { for (const k of Object.keys(localStorage)) if (k.startsWith(MIRROR)) localStorage.removeItem(k) } catch { /* none */ } }

export interface SwrOpts<T> {
  ttl?: number
  /** Called with a cached value as soon as there is one (fresh or stale). */
  onCached?: (v: T, at: number) => void
  /** Called with the refreshed value when a stale one was shown first. */
  onFresh?: (v: T) => void
}
/** Fresh cache: no request. Stale cache: shown first, refreshed after (a failed refresh keeps the stale copy). No cache: fetch. */
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false
export async function swr<T>(key: string, fetcher: () => Promise<T>, o: SwrOpts<T> = {}): Promise<T> {
  // the same request asked for twice at once (several rows want the same list) is made once
  const share = (): Promise<T> => { const f = inflight.get(key); if (f) return f as Promise<T>; const p = fetcher().finally(() => { inflight.delete(key) }); inflight.set(key, p); return p }
  const hit = await peek<T>(key)
  const ttl = o.ttl ?? LIST_TTL
  if (hit) {
    o.onCached?.(hit.value, hit.at)
    if (Date.now() - hit.at < ttl || offline()) return hit.value
    try { const v = await share(); void store(key, v); o.onFresh?.(v); return v } catch { return hit.value }
  }
  if (offline()) throw new Error('offline')   // no request is even attempted
  const v = await share()
  void store(key, v)
  return v
}

/** Runs tasks for one host at most once per `gapMs` (Wikisource, Open Library and the Internet Archive ask for ≤ 1 request a second). */
export function throttle(gapMs: number, now: () => number = Date.now, wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))) {
  let last = -Infinity, chain: Promise<unknown> = Promise.resolve()
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => { const d = last + gapMs - now(); if (d > 0) await wait(d); last = now(); return fn() })
    chain = run.catch(() => undefined)
    return run
  }
}
