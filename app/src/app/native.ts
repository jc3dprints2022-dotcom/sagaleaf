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

export const IS_NATIVE = import.meta.env.VITE_NATIVE === '1' || Capacitor.isNativePlatform()

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
  const apply = () => {
    const dark = document.documentElement.dataset.appearance === 'dark'
    // Dark = light icons on a dark page.
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  }
  apply()
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] })
}

// Lets e2e/native.ts drive the web half of "open from another app" without an emulator.
if (import.meta.env.VITE_NATIVE === '1') (globalThis as Record<string, unknown>).__sagaNative = { openExternalFiles }

/** The splash waits for this (launchAutoHide is off), so every start path must end here or in initNative. */
export const hideSplash = () => { if (IS_NATIVE) void SplashScreen.hide().catch(() => {}) }

/** Call once the app has rendered. */
export async function initNative() {
  if (!IS_NATIVE) return
  followAppearance()
  requestAnimationFrame(hideSplash)
  try {
    await OpenedFiles.addListener('filesOpened', e => { void openExternalFiles(e.files) })
    const { files } = await OpenedFiles.takePending()
    if (files.length) await openExternalFiles(files)
  } catch { /* plugin missing (older shell): opening files from other apps just isn't available */ }
}
