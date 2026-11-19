// Copies the single-file build to the site root, where GitHub Pages serves it
// as https://saga.proxima-3d.com/saga-reader.html.
//   cd app && npm ci && npm run build:standalone && npm run publish:site
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(app, '..')
const built = resolve(app, 'dist-standalone/saga-reader.html')
if (!existsSync(built)) { console.error('No build found. Run `npm run build:standalone` first.'); process.exit(1) }
copyFileSync(built, resolve(root, 'saga-reader.html'))
console.log(`saga-reader.html  ${(statSync(built).size / 1e6).toFixed(2)} MB -> ${root}`)
