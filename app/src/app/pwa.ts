// Installable web app: service worker registration, the update notice and the
// "Install app" hint. Only the single-file build served over https (or from
// localhost) registers a worker; dev builds, file:// and the Capacitor shell don't.
import { useSyncExternalStore } from 'react'
import { PRODUCT } from './product'
import { STANDALONE, toast } from './state'

/** Content hash of this build, stamped in by pwa/plugin.ts. The worker reports the same id. */
export const BUILD = (import.meta.env.VITE_SAGA_BUILD as string | undefined) ?? 'dev'

/** Native shell: the native build (VITE_NATIVE), or any build loaded inside Capacitor's WebView. */
const isNativeShell = () => import.meta.env.VITE_NATIVE === '1' || !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
const secure = () => location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

export function registerServiceWorker() {
  if (!STANDALONE || !('serviceWorker' in navigator) || !secure() || isNativeShell()) return
  const sw = navigator.serviceWorker
  // Scope is just this page, so the worker never controls the landing page or anything else on the site.
  const scope = new URL(location.pathname, location.href).href
  const askVersion = () => sw.controller?.postMessage('saga:version')
  sw.addEventListener('message', e => {
    if (e.data?.type === 'saga:version' && e.data.version !== BUILD) offerReload()
  })
  sw.addEventListener('controllerchange', askVersion)
  const register = () => sw.register(new URL('sw.js', location.href).href, { scope, updateViaCache: 'none' }).then(reg => {
    // Long-open tabs (an installed app can stay open for days) still find new deploys.
    let last = Date.now()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - last > 60 * 60_000) { last = Date.now(); reg.update().catch(() => {}) }
    })
  }).catch(() => { /* no worker (e.g. sw.js not deployed): the app works as before, just not offline */ })
  // Registering also checks for a new sw.js; offline, an existing worker keeps serving and the check waits for the network.
  window.addEventListener('load', () => {
    askVersion()
    if (navigator.onLine) register()
    else window.addEventListener('online', register, { once: true })
  }, { once: true })
}

let offered = false
function offerReload() {
  if (offered) return
  offered = true
  toast(`A new version of ${PRODUCT.name} is available.`, { label: 'Reload', run: () => location.reload() }, 24 * 60 * 60_000)
}

// ---------- install hint
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export type InstallHint = { kind: 'prompt'; install: () => void } | { kind: 'ios' } | null

const DISMISS_KEY = 'saga.installHint.dismissed'
const dismissedBefore = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

let hint: InstallHint = null
const subs = new Set<() => void>()
const setHint = (h: InstallHint) => { hint = h; subs.forEach(s => s()) }

export function initInstallHint() {
  if (!STANDALONE || !secure() || isNativeShell() || installed() || dismissedBefore()) return
  if (isIos()) { setHint({ kind: 'ios' }); return }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    const ev = e as BeforeInstallPromptEvent
    setHint({ kind: 'prompt', install: () => { ev.prompt().catch(() => {}); ev.userChoice.then(() => setHint(null), () => setHint(null)) } })
  })
  window.addEventListener('appinstalled', () => setHint(null))
}
export function dismissInstallHint() {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* fine: hidden for this visit only */ }
  setHint(null)
}
export const useInstallHint = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb) } }, () => hint)
