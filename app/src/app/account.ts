// Optional account (Supabase Auth): Google first, or an emailed link. The app
// works fully without it. Signing in turns sync on by itself: your library's
// entries, highlights, notes, bookmarks and reading positions follow the
// account to your other devices; a book with a source (Discover or a link)
// downloads there by itself, an uploaded file shows as "On your other device".
// There is no code or passphrase: rows are protected by Supabase auth, row-level
// security and HTTPS. Book files are never uploaded (see core/sync/cloud).
//
// supabase-js is loaded only when it's needed: when you start signing in, when an
// earlier session exists, or when a sign-in link returns here. The web app imports
// it from a CDN; the Android app bundles it. Until then SAGA Reader makes no
// requests to Supabase. If the configuration at the top of the HTML file is
// empty, or Supabase can't be reached, sign-in is hidden or disabled and nothing
// else changes.
//
// In the Android app the browser is opened for Google (it refuses embedded
// WebViews) and returns through llc.proxima.readerleaf://auth-callback, which
// MainActivity catches; the code in that URL is exchanged for a session (PKCE).
import { useEffect, useState } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { store } from './state'
import { FEATURES } from './features'
import { CloudSync, type CloudApi, type CloudRow, type RowData } from '../core/sync/cloud'
import { mergeDuplicate } from '../core/library'
import { fetchBySource } from './discover'
import { callPlugin } from './native'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

declare const SAGA_AUTH: { supabaseUrl?: string; supabaseAnonKey?: string } | undefined
const CONFIG = (() => { try { return typeof SAGA_AUTH === 'undefined' ? null : SAGA_AUTH } catch { return null } })()
export const SUPABASE_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm',
  'https://esm.sh/@supabase/supabase-js@2.119.1',
]
const TABLE = 'saga_sync'
export const NATIVE_REDIRECT = 'llc.proxima.readerleaf://auth-callback'

export type AuthAvailability = 'off' | 'needs-web' | 'idle' | 'loading' | 'ready' | 'unavailable'
export interface AccountState {
  availability: AuthAvailability
  email: string | null
  userId: string | null
  sync: { on: boolean; phase: 'off' | 'starting' | 'idle' | 'syncing' | 'error'; last: number | null; message: string | null; books: number }
  pending: string | null          // a message for the sign-in form (link sent, errors)
}

const nativeShell = import.meta.env.VITE_NATIVE === '1' || !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
const configured = !!(CONFIG?.supabaseUrl?.trim() && CONFIG?.supabaseAnonKey?.trim()) && (!nativeShell || FEATURES.nativeSignIn)
// http(s) pages, and the Android WebView, whose origin is https://localhost
const onWeb = nativeShell || (typeof location !== 'undefined' && /^https?:$/.test(location.protocol))
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
async function importSupabase(): Promise<typeof import('@supabase/supabase-js')> {
  // The native build bundles the library (this branch is removed from the web build).
  if (import.meta.env.VITE_NATIVE === '1') return import('@supabase/supabase-js')
  let last: unknown
  for (const url of SUPABASE_CDN) { try { return await import(/* @vite-ignore */ url) as typeof import('@supabase/supabase-js') } catch (e) { last = e } }
  throw last
}
function load(): Promise<SupabaseClient | null> {
  if (!configured || !onWeb) return Promise.resolve(null)
  return (loading ??= (async () => {
    set({ availability: 'loading' })
    try {
      const mod = await importSupabase()
      client = mod.createClient(CONFIG!.supabaseUrl!.trim(), CONFIG!.supabaseAnonKey!.trim(), {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: !nativeShell, storageKey: 'saga-reader-auth' },
      })
      client.auth.onAuthStateChange((_e, session) => { void onSession(session) })
      const { data } = await client.auth.getSession()
      await onSession(data.session)
      cleanCallbackUrl()
      set({ availability: 'ready' })
      return client
    } catch {
      loading = null
      set({ availability: 'unavailable' })
      return null
    }
  })())
}

const hadSession = () => { try { return !!localStorage.getItem('saga-reader-auth') } catch { return false } }
const isCallback = () => !nativeShell && typeof location !== 'undefined' && /[?&](code|error|error_description)=/.test(location.search)
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
  if (nativeShell && configured) void listenForAuthReturn()
  if (state.availability === 'idle' && (hadSession() || callback)) whenOnline(load)
}
/** Settings calls this so it can show whether sign-in is available before you use it. */
export const prepareSignIn = () => { if (state.availability === 'idle') whenOnline(load) }
/** Offline (e.g. the installed app opened with no network), wait for the network instead of trying the CDN and failing. */
function whenOnline(fn: () => unknown) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) { fn(); return }
  addEventListener('online', () => { if (state.availability === 'idle') fn() }, { once: true })
}

async function onSession(session: Session | null) {
  const email = session?.user.email ?? null, userId = session?.user.id ?? null
  const changedUser = userId !== state.userId
  set({ email, userId, pending: session ? null : state.pending })
  if (!session) { stopSync(); setSync({ on: false, phase: 'off' }); return }
  // Signing in is all it takes: sync starts by itself (and on every launch with a saved session).
  if (changedUser) void startSync()
}

const redirectUrl = () => (nativeShell ? NATIVE_REDIRECT : location.origin + location.pathname)
function rememberReturn() { try { sessionStorage.setItem('saga.authReturn', location.hash || '#/settings') } catch { /* ignore */ } }

export async function signInWithEmail(email: string) {
  const c = await load()
  if (!c) return
  rememberReturn()
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } })
  set({ pending: error ? `Couldn’t send the link: ${error.message}` : nativeShell ? `Check ${email.trim()} for a sign-in link. Opening it brings you back to the app.` : `Check ${email.trim()} for a sign-in link. Open it in this browser on this device.` })
}
let lastAuthUrl = ''
export async function signInWithGoogle() {
  const c = await load()
  if (!c) return
  rememberReturn()
  if (nativeShell) {
    // Google refuses embedded WebViews: open the system browser; the callback comes back through appUrlOpen.
    const { data, error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } })
    if (error || !data?.url) { set({ pending: `Google sign-in didn’t start: ${error?.message ?? 'no address returned'}` }); return }
    lastAuthUrl = data.url
    await callPlugin('Browser', () => Browser.open({ url: data.url }))
    return
  }
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } })
  if (error) set({ pending: `Google sign-in didn’t start: ${error.message}` })
}

/** Finishes a sign-in that returned to the app: swaps the code in the callback URL for a session, then closes the browser. */
export async function completeNativeSignIn(url: string, auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession'>, closeBrowser: () => Promise<unknown> = () => callPlugin('Browser', () => Browser.close())): Promise<{ ok: boolean; error?: string }> {
  if (!url.startsWith(NATIVE_REDIRECT)) return { ok: false, error: 'not an auth callback' }
  const q = new URL(url.replace(/^[^:]+:\/\//, 'https://')).searchParams
  const hash = new URLSearchParams(url.split('#')[1] ?? '')
  const code = q.get('code'), err = q.get('error_description') ?? q.get('error') ?? hash.get('error_description')
  await closeBrowser()
  if (!code) { const m = err ?? 'the sign-in link had no code'; set({ pending: `Sign-in didn’t finish: ${m}` }); return { ok: false, error: m } }
  const { error } = await auth.exchangeCodeForSession(code)
  if (error) { set({ pending: `Sign-in didn’t finish: ${error.message}` }); return { ok: false, error: error.message } }
  return { ok: true }
}
async function listenForAuthReturn() {
  const handle = async (url: string) => { const c = await load(); if (c) await completeNativeSignIn(url, c.auth) }
  await callPlugin('App', async () => { await CapApp.addListener('appUrlOpen', e => { if (e?.url) void handle(e.url) }) })
  // The app was started by the link (cold start).
  void callPlugin('App', async () => { const l = await CapApp.getLaunchUrl(); if (l?.url) await handle(l.url) })
}
// Lets e2e/native.ts stand in for Android handing the callback URL to the app.
if (import.meta.env.VITE_NATIVE === '1') (globalThis as Record<string, unknown>).__sagaAuth = { appUrlOpen: async (url: string) => { const c = await load(); return c ? completeNativeSignIn(url, c.auth) : { ok: false } }, lastAuthUrl: () => lastAuthUrl }

export async function signOut() {
  stopSync()
  await client?.auth.signOut({ scope: 'local' }).catch(() => {})
  await forgetAccountData()
  set({ email: null, userId: null, pending: null })
  setSync({ on: false, phase: 'off', last: null, message: null, books: 0 })
}
async function forgetAccountData() {
  await store.setMeta('cloudSyncOn', false)
  await store.setMeta('cloudSeen', {}); await store.setMeta('cloudLastPull', null); await store.setMeta('cloudSyncUser', null)
}

/** Deletes this account's synced rows, asks the delete-account function (app/supabase/functions/delete-account) to remove the
 *  sign-in itself when it is reachable, and signs out. Books and notes on this device are untouched. */
export async function deleteAccount(): Promise<{ rows: boolean; account: boolean; message: string }> {
  const c = await load()
  let rows = false, account = false
  if (c && state.userId) {
    stopSync()
    const del = await c.from(TABLE).delete().eq('user_id', state.userId)
    rows = !del.error
    try { const r = await c.functions.invoke('delete-account', { method: 'POST' }); account = !r.error } catch { account = false }
  }
  await signOut()
  const message = rows && account ? 'Your account and its synced data are deleted. Your books and notes on this device are still here.'
    : rows ? 'Your synced data is deleted and you’re signed out. The account itself couldn’t be removed from here yet.'
    : 'You’re signed out here, but the synced data couldn’t be deleted right now. Try again when you’re online.'
  return { rows, account, message }
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
    async upsert(rows) { const { error } = await c.from(TABLE).upsert(rows.map(r => ({ user_id: userId, ...r, data: r.data as RowData })), { onConflict: 'user_id,book_id' }); fail(error) },
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
      setSync({ phase: 'idle', last: Date.now(), books: Math.max(state.sync.books, r.books + r.pushed), message: null })
    } catch (e) {
      setSync({ phase: 'error', message: `Sync paused: ${(e as Error).message}. It retries automatically.` })
    } finally { running = null }
  })()
  return running
}

/** Starts syncing for the signed-in account: no code, no questions. */
export async function startSync(): Promise<void> {
  const c = await load()
  if (!c || !state.userId) return
  setSync({ on: true, phase: 'starting', message: null })
  try {
    // A different account than last time on this device starts from a clean "what's been synced" state.
    const owner = await store.getMeta<string | null>('cloudSyncUser', null)
    if (owner !== state.userId) { await store.setMeta('cloudSeen', {}); await store.setMeta('cloudLastPull', null); await store.setMeta('cloudBooks', {}) }
    await store.setMeta('cloudSyncOn', true)
    await store.setMeta('cloudSyncUser', state.userId)
    stopSync()
    const e = new CloudSync(store, api(c, state.userId))
    e.onRemoteBooks = ids => { void autoDownload(ids) }
    engine = e
    unsub = store.on(t => {
      if (!t.has('annotations') && !t.has('positions') && !t.has('books')) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(kick, 4000)
    })
    timer = setInterval(() => { if (document.visibilityState === 'visible') kick() }, 60_000)
    addEventListener('online', kick); addEventListener('focus', kick)
    await syncNow()
    void retryRemoteDownloads()
  } catch (err) {
    setSync({ phase: 'error', message: `Couldn’t turn on sync: ${(err as Error).message}` })
  }
}

// ---------------------------------------------------------------- books from other devices
const tried = new Set<string>()
let downloading: Promise<void> = Promise.resolve()
/** Books that arrived with a source download from it (one at a time) unless the reader turned that off. */
export function autoDownload(ids: string[]) {
  downloading = downloading.then(async () => {
    if (!(await store.getMeta('autoDownload', true))) return
    for (const id of ids) {
      if (tried.has(id) || !navigator.onLine) continue
      tried.add(id)
      const b = await store.db.books.get(id)
      if (!b || b.deleted || b.fileState !== 'remote' || (!b.catalogId && !b.sourceUrl)) continue
      try {
        const r = await fetchBySource(b)
        // A different edition of the same file (Wikisource and the Internet Archive build theirs on request): keep the notes.
        if (r && r.bookId !== id) await mergeDuplicate(store, r.bookId, id)
      } catch { /* stays "on your other device"; the book page has a download button */ }
    }
  }).catch(() => undefined)
  return downloading
}
async function retryRemoteDownloads() {
  const remote = (await store.db.books.toArray()).filter(b => !b.deleted && b.fileState === 'remote' && (b.catalogId || b.sourceUrl)).map(b => b.id)
  if (remote.length) await autoDownload(remote)
}
export const forceRetry = (id: string) => { tried.delete(id); return autoDownload([id]) }
