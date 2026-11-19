// One self-contained HTML file: no server, opens from disk (file://).
// On the web it is also an installable PWA (manifest, icons, service worker; see pwa/).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { sagaPwa } from './pwa/plugin'

// `--mode native` builds the same page for the Capacitor shell (capacitor.config.ts) into
// dist-native/: no manifest, no sw.js, and VITE_NATIVE=1 so no worker code path can run.
export default defineConfig(({ mode }) => { const native = mode === 'native'; return {
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), sagaPwa({ native })],
  define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1'), 'import.meta.env.VITE_NATIVE': JSON.stringify(native ? '1' : '') },
  base: './',
  publicDir: false,
  build: {
    target: 'es2022', outDir: native ? 'dist-native' : 'dist-standalone', emptyOutDir: true,
    assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
} })
