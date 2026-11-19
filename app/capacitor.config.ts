// Capacitor shell for Android (and later iOS). It wraps the single-file build made by
// `npm run build:native` (dist-native/: no manifest, no service worker).
// androidScheme stays at Capacitor's default 'https', so the WebView origin is
// https://localhost: secure context, and the origin the Gutenberg proxy allows.
import type { CapacitorConfig } from '@capacitor/cli'
import { readFileSync } from 'node:fs'

const identity = JSON.parse(readFileSync(new URL('./identity.json', import.meta.url), 'utf8')) as { name: string; androidApplicationId: string }

const config: CapacitorConfig = {
  // Both come from identity.json (the Android build reads the same file for applicationId and label).
  appId: identity.androidApplicationId,
  appName: identity.name,
  webDir: 'dist-native',
  android: { allowMixedContent: false },
  plugins: {
    // Shown until the library has rendered; src/app/native.ts hides it.
    SplashScreen: { launchAutoHide: false, backgroundColor: '#eceee9', showSpinner: false },
    // Edge to edge (required from Android 16): the page pads itself with env(safe-area-inset-*).
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
}

export default config
