import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,mjs}'], maximumFileSizeToCacheInBytes: 6_000_000 },
      manifest: {
        name: 'SAGA Reader', short_name: 'SAGA Reader', display: 'standalone',
        background_color: '#f3eee4', theme_color: '#f3eee4', start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  optimizeDeps: { exclude: ['foliate-js'] },
  test: { environment: 'happy-dom', environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true, disableIframePageLoading: true } } }, include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 60000, pool: 'forks' },
})
