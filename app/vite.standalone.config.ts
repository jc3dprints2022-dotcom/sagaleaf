// One self-contained HTML file: no server, opens from disk (file://).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') },
  base: './',
  publicDir: false,
  build: {
    target: 'es2022', outDir: 'dist-standalone', emptyOutDir: true,
    assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
