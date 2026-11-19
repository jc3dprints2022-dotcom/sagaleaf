// Optional account (Supabase Auth): email magic link or Google. The app works
// fully without it. Signing in only enables "Sync my notes and reading
// progress", which uploads each book's highlights, notes, bookmarks and reading
// positions, sealed on this device with the library code (see core/sync/cloud).
// Book files are never uploaded.
//
// supabase-js is loaded from a CDN only when it's needed: when you start
// signing in, when an earlier session exists, or when a sign-in link returns
// here. Until then SAGA Reader makes no requests to Supabase. If the
// configuration at the top of the HTML file is empty, or Supabase can't be
// reached, sign-in is hidden or disabled and nothing else changes.
import { useEffect, useState } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { store } from './state'
import { CloudSync, KeyMismatch, KEY_ROW, type CloudApi, type CloudRow } from '../core/sync/cloud'
import { deriveKeys, newLibrarySecret } from '../core/sync/crypto'

declare const SAGA_AUTH: { supabaseUrl?: string; supabaseAnonKey?: string } | undefined
const CONFIG = (() => { try { return typeof SAGA_AUTH === 'undefined' ? null : SAGA_AUTH } catch { return null } })()
export const SUPABASE_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm',
  'https://esm.sh/@supabase/supabase-js@2.119.1',
]
const TABLE = 'saga_sync'

export type AuthAvailability = 'off' | 'needs-web' | 'idle' | 'loading' | 'ready' | 'unavailable'
export interface AccountState {
  availability: AuthAvailability
  email: string | null
  userId: string | null
  sync: { on: boolean; phase: 'off' | 'starting' | 'idle' | 'syncing' | 'error' | 'needs-code'; last: number | null; message: string | null; books: number }
  pending: string | null          // a message for the sign-in form (link sent, errors)
}

const configured = !!(CONFIG?.supabaseUrl?.trim() && CONFIG?.supabaseAnonKey?.trim())
const onWeb = typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
let state: AccountState = {
  availability: !configured ? 'off' : !onWeb ? 'needs-web' : 'idle',
  email: null, userId: null, pending: null,
  sync: { on: false, phase: 'off', last: null, message: null, books: 0 },
}
const listeners = new Set<() => void>()
function set(p: Partial<AccountState> | ((s: AccountState) => Partial<AccountState>)) {
  state = { ...state, ...(typeof p === 'function' ? p(state) : p) }
  for (const l of listeners) l()
}
const setSync = (p: Partial<AccountState['sync']>) => set(s => ({ sync: { ...s.sync, ...p } }))
export function useAccount() {
  const [, force] = useState(0)
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return state
}

// ---------------------------------------------------------------- client
let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null
function load(): Promise<SupabaseClient | null> {
  if (!configured || !onWeb) return Promise.resolve(null)
  return (loading ??= (async () => {
    set({ availability: 'loading' })
    for (const url of SUPABASE_CDN) {
      try {
        const mod = await import(/* @vite-ignore */ url) as typeof import('@supabase/supabase-js')
        client = mod.createClient(CONFIG!.supabaseUrl!.trim(), CONFIG!.supabaseAnonKey!.trim(), {
          auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'saga-reader-auth' },
        })
        client.auth.onAuthStateChange((_e, session) => { void onSession(session) })
        const { data } = await client.auth.getSession()
        await onSession(data.session)
        cleanCallbackUrl()
        set({ availability: 'ready' })
        return client
      } catch { /* try the next CDN */ }
    }
    loading = null
    set({ availability: 'unavailable' })
    return null
  })())
}

const hadSession = () => { try { return !!localStorage.getItem('saga-reader-auth') } catch { return false } }
const isCallback = () => typeof location !== 'undefined' && /[?&](code|error|error_description)=/.test(location.search)
// Captured before supabase-js loads: it removes ?code= from the address once it has used it.
let callback: { error: string | null } | null = null
function cleanCallbackUrl() {
  if (!callback) return
  const err = callback.error
  callback = null
  let back = '#/settings'
  try { back = sessionStorage.getItem('saga.authReturn') || back; sessionStorage.removeItem('saga.authReturn') } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname + back)
  dispatchEvent(new HashChangeEvent('hashchange'))
  if (err) set({ pending: `Sign-in didn’t finish: ${err}` })
}

/** At startup: reconnect a saved session, or finish a sign-in link. Otherwise do nothing (no network). */
export function initAccount() {
  if (isCallback()) callback = { error: new URLSearchParams(location.search).get('error_description') }
  if (state.availability === 'idle' && (hadSession() || callback)) void load()
}
/** Settings calls this so it can show whether sign-in is available before you use it. */
export const prepareSignIn = () => { if (state.availability === 'idle') void load() }

async function onSession(session: Session | null) {
  const email = session?.user.email ?? null, userId = session?.user.id ?? null
  const changedUser = userId !== state.userId
  set({ email, userId, pending: session ? null : state.pending })
  if (!session) { stopSync(); setSync({ on: false, phase: 'off' }); return }
  if (changedUser) {
    const on = await store.getMeta<boolean>('cloudSyncOn', false)
    const owner = await store.getMeta<string | null>('cloudSyncUser', null)
    if (on && owner === userId) void startSync()
    else setSync({ on: false, phase: 'off' })
  }
}

const redirectUrl = () => location.origin + location.pathname
function rememberReturn() { try { sessionStorage.setItem('saga.authReturn', location.hash || '#/settings') } catch { /* ignore */ } }

export async function signInWithEmail(email: string) {
  const c = await load()
  if (!c) return
  rememberReturn()
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } })
  set({ pending: error ? `Couldn’t send the link: ${error.message}` : `Check ${email.trim()} for a sign-in link. Open it in this browser on this device.` })
}
export async function signInWithGoogle() {
  const c = await load()
  if (!c) return
  rememberReturn()
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } })
  if (error) set({ pending: `Google sign-in didn’t start: ${error.message}` })
}
export async function signOut() {
  stopSync()
  await client?.auth.signOut({ scope: 'local' }).catch(() => {})
  await store.setMeta('cloudSyncOn', false)
  await store.setMeta('cloudSeen', {}); await store.setMeta('cloudLastPull', null); await store.setMeta('cloudSyncUser', null)
  set({ email: null, userId: null, pending: null })
  setSync({ on: false, phase: 'off', last: null, message: null, books: 0 })
}

// ---------------------------------------------------------------- sync
function api(c: SupabaseClient, userId: string): CloudApi {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }
  return {
    async list(since) {
      const out: CloudRow[] = []
      for (let from = 0; ; from += 500) {
        let q = c.from(TABLE).select('book_id,data,updated_at').order('updated_at', { ascending: true }).range(from, from + 499)
        if (since) q = q.gt('updated_at', since)
        const { data, error } = await q
        fail(error)
        out.push(...(data as CloudRow[]))
        if (!data || data.length < 500) return out
      }
    },
    async get(bookId) { const { data, error } = await c.from(TABLE).select('book_id,data,updated_at').eq('book_id', bookId).maybeSingle(); fail(error); return data as CloudRow | null },
    async upsert(rows) { const { error } = await c.from(TABLE).upsert(rows.map(r => ({ user_id: userId, ...r })), { onConflict: 'user_id,book_id' }); fail(error) },
  }
}

let engine: CloudSync | null = null
let timer: ReturnType<typeof setInterval> | null = null
let debounce: ReturnType<typeof setTimeout> | null = null
let unsub: (() => void) | null = null
let running: Promise<void> | null = null

function stopSync() {
  engine = null
  if (timer) clearInterval(timer); timer = null
  if (debounce) clearTimeout(debounce); debounce = null
  unsub?.(); unsub = null
  removeEventListener('online', kick); removeEventListener('focus', kick)
}
const kick = () => { void syncNow() }

export async function syncNow() {
  if (!engine) return
  if (running) return running
  running = (async () => {
    if (!navigator.onLine) { setSync({ phase: 'error', message: 'Offline. Changes are kept here and sync when you’re back online.' }); return }
    setSync({ phase: 'syncing' })
    try {
      const r = await engine!.sync()
      setSync({ phase: 'idle', last: Date.now(), books: Math.max(state.sync.books, r.books + r.pushed), message: r.unreadable ? `${r.unreadable} synced book${r.unreadable > 1 ? 's' : ''} couldn’t be decrypted with this device’s library code.` : null })
    } catch (e) {
      setSync({ phase: 'error', message: `Sync paused: ${(e as Error).message}. It retries automatically.` })
    } finally { running = null }
  })()
  return running
}

/** Turn sync on. Without a library code on this device, the account's first device creates one;
 *  later devices are asked for it (pass `code`). */
export async function startSync(code?: string): Promise<{ created?: string } | void> {
  const c = await load()
  if (!c || !state.userId) return
  setSync({ on: true, phase: 'starting', message: null })
  try {
    let secret = code?.trim() || await store.getMeta<string | null>('librarySecret', null)
    let created: string | undefined
    const probe = api(c, state.userId)
    if (!secret) {
      if (await probe.get(KEY_ROW)) { setSync({ phase: 'needs-code', message: 'Enter the library code from a device where sync is already on.' }); return }
      secret = newLibrarySecret(); created = secret
    }
    let keys
    try { keys = await deriveKeys(secret) } catch { setSync({ phase: 'needs-code', message: 'That doesn’t look like a library code. It starts with “saga-”.' }); return }
    const e = new CloudSync(store, probe, keys)
    try { await e.verifyKey() } catch (err) {
      if (err instanceof KeyMismatch) { setSync({ phase: 'needs-code', message: code ? err.message : 'This device has a different library code from your account. Enter the code from a device where sync is on.' }); return }
      throw err
    }
    await store.setMeta('librarySecret', secret)
    await store.setMeta('cloudSyncOn', true)
    await store.setMeta('cloudSyncUser', state.userId)
    stopSync()
    engine = e
    unsub = store.on(t => {
      if (!t.has('annotations') && !t.has('positions')) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(kick, 4000)
    })
    timer = setInterval(() => { if (document.visibilityState === 'visible') kick() }, 60_000)
    addEventListener('online', kick); addEventListener('focus', kick)
    await syncNow()
    return created ? { created } : undefined
  } catch (err) {
    setSync({ phase: 'error', message: `Couldn’t turn on sync: ${(err as Error).message}` })
  }
}

export async function stopSyncByUser() {
  stopSync()
  await store.setMeta('cloudSyncOn', false)
  setSync({ on: false, phase: 'off', message: null })
}
export const libraryCode = () => store.getMeta<string | null>('librarySecret', null)
