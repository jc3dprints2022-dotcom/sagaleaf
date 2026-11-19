// Copies the single-file build and its PWA files to the site root, where GitHub
// Pages serves them next to the landing page:
//   /saga-reader.html, /saga-reader.webmanifest, /sw.js, /icons/*
// Usage: cd app && npm ci && npm run build:standalone && npm run publish:site
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(app, '..')
const dist = resolve(app, 'dist-standalone')
const listFile = resolve(dist, 'published-files.json')
if (!existsSync(resolve(dist, 'saga-reader.html')) || !existsSync(listFile)) {
  console.error('No build found. Run `npm run build:standalone` first.'); process.exit(1)
}
for (const f of ['saga-reader.html', ...JSON.parse(readFileSync(listFile, 'utf8'))]) {
  mkdirSync(dirname(resolve(root, f)), { recursive: true })
  copyFileSync(resolve(dist, f), resolve(root, f))
  console.log(`${f.padEnd(32)} ${(statSync(resolve(dist, f)).size / 1024).toFixed(0).padStart(6)} KB`)
}
console.log(`build ${readFileSync(resolve(dist, 'build-id.txt'), 'utf8').trim()} published to ${root}`)
