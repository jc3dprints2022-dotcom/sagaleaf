// Android shell (Capacitor) glue. Everything here is a no-op on the web.
//   - status bar icons follow the app's light/dark appearance (Capacitor 8 SystemBars;
//     the WebView is edge to edge and the CSS pads with env(safe-area-inset-*))
//   - the splash screen stays up until the library has rendered
//   - books opened from other apps ("Open with", share sheet) are imported and opened
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { importFiles } from '../core/library'
import { importDropped } from './importers'
import { go, store, toast } from './state'

/** Native build or Capacitor WebView: decides service worker and sign-in (build-time decisions). */
export const IS_NATIVE = import.meta.env.VITE_NATIVE === '1' || Capacitor.isNativePlatform()

/** Plugin calls go through here. They run only inside the Capacitor shell, only when that shell
 *  has the plugin, and never throw: a sync throw or a rejected promise is swallowed. The native
 *  bundle in a plain browser (e2e/native.ts) or an older shell without a plugin does nothing. */
export const pluginAvailable = (name: string) => {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name) } catch { return false }
}
export function callPlugin<T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  if (!pluginAvailable(name)) return Promise.resolve(undefined)
  try { return Promise.resolve(fn()).catch(() => undefined) } catch { return Promise.resolve(undefined) }
}

interface OpenedFile { uri: string; name: string; type?: string | null }
interface OpenedFilesPlugin {
  takePending(): Promise<{ files: OpenedFile[] }>
  addListener(event: 'filesOpened', cb: (e: { files: OpenedFile[] }) => void): Promise<PluginListenerHandle>
}
/** Native side: android/app/src/main/java/llc/proxima/reader/OpenedFilesPlugin.java */
const OpenedFiles = registerPlugin<OpenedFilesPlugin>('OpenedFiles')

const BOOK = /\.(epub|pdf|txt)$/i
const EXT: Record<string, string> = { 'application/epub+zip': '.epub', 'application/pdf': '.pdf', 'text/plain': '.txt' }

/** Reads a content:// URI through Capacitor's local server (streams, no base64 copy). */
async function toFile(f: OpenedFile): Promise<File> {
  const res = await fetch(Capacitor.convertFileSrc(f.uri))
  if (!res.ok) throw new Error(`couldn’t read the file (${res.status})`)
  const blob = await res.blob()
  const type = f.type || blob.type
  // Providers sometimes give names without an extension ("document:1234"); the importer goes by extension.
  const name = BOOK.test(f.name) ? f.name : f.name + (EXT[type] ?? '')
  return new File([blob], name, { type })
}

export async function openExternalFiles(list: OpenedFile[]) {
  const files: File[] = []
  for (const f of list) {
    try { files.push(await toFile(f)) } catch (e) { toast(`${f.name}: ${(e as Error).message}`, undefined, 7000) }
  }
  if (!files.length) return
  if (files.length === 1 && BOOK.test(files[0].name)) {
    // One book: open it straight away (already in the library counts too).
    const [r] = await importFiles(store, files)
    if (r.status === 'failed') toast(`${r.name}: ${r.error}`, undefined, 7000)
    else go(`read/${r.bookId}`)
    return
  }
  await importDropped(files)
}

function followAppearance() {
  if (!pluginAvailable('SystemBars')) return
  const apply = () => {
    const dark = document.documentElement.dataset.appearance === 'dark'
    // Dark = light icons on a dark page.
    void callPlugin('SystemBars', () => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))
  }
  apply()
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] })
}

// Lets e2e/native.ts drive the web half of "open from another app" without an emulator.
if (import.meta.env.VITE_NATIVE === '1') (globalThis as Record<string, unknown>).__sagaNative = { openExternalFiles }

/** The splash waits for this (launchAutoHide is off), so every start path must end here or in initNative. */
export const hideSplash = () => { void callPlugin('SplashScreen', () => SplashScreen.hide()) }

/** Call once the app has rendered. Safe anywhere: without the shell or a plugin, that part is skipped. */
export async function initNative() {
  if (!IS_NATIVE) return
  followAppearance()
  requestAnimationFrame(hideSplash)
  await callPlugin('OpenedFiles', async () => {
    await OpenedFiles.addListener('filesOpened', e => { const files = e?.files; if (files?.length) void openExternalFiles(files) })
    const files = (await OpenedFiles.takePending())?.files
    if (files?.length) await openExternalFiles(files)
  })
}
