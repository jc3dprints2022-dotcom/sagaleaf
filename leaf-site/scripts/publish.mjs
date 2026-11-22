// Builds the static export and publishes it to /leaf/ at the repo root (served by GitHub Pages).
// Only the old /leaf/ folder is deleted; nothing else at the root is touched.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(site, '..')
const out = join(site, 'out')
const dest = join(repo, 'leaf')

if (!process.argv.includes('--no-build')) execSync('npx next build', { cwd: site, stdio: 'inherit' })
if (!existsSync(join(out, 'index.html'))) throw new Error('export missing: leaf-site/out/index.html')
if (!existsSync(join(repo, 'CNAME')) || !statSync(join(repo, 'saga-reader.html')).isFile()) throw new Error('refusing to publish: repo root not recognised')

rmSync(dest, { recursive: true, force: true })
cpSync(out, dest, { recursive: true })
// Belt and braces: Pages runs Jekyll on the root; the root .nojekyll keeps _next/ served.
writeFileSync(join(dest, '.nojekyll'), '')
console.log(`published ${out} -> ${dest}`)
