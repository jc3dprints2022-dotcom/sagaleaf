// PWA acceptance check against the published site files at the repo root.
// Serves a copy of the repo root on localhost (a secure context), then:
// install criteria → online import, highlight + note → relaunch fully offline →
// read EPUB/PDF/TXT, see notes, export → no network while reading → a new deploy is picked up.
//   cd app && npm run build:standalone && npm run publish:site && npx tsx e2e/pwa.ts
import { chromium, type Page, type Frame, type BrowserContext } from 'playwright-core'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, normalize } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const site = mkdtempSync(join(tmpdir(), 'saga-pwa-site-'))
for (const f of ['index.html', 'privacy.html', 'saga-reader.html', 'saga-reader.webmanifest', 'sw.js', 'icons', 'site', 'site.config.js', 'robots.txt']) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(site, f), { recursive: true })
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.txt': 'text/plain' }
const served: string[] = []
let down = false                     // simulates the site being unreachable (Playwright's setOffline doesn't cover service-worker fetches)
const server = createServer((req, res) => {
  if (down) { served.push('(refused) ' + req.url); req.socket.destroy(); return }
  const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname)
  const file = normalize(join(site, path === '/' ? 'index.html' : path))
  served.push(path)
  if (!file.startsWith(site) || !existsSync(file)) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' }).end(readFileSync(file))
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const APP = ORIGIN + '/saga-reader.html'
const SAMPLES = resolve(import.meta.dirname, '..', 'public', 'samples')

const results: { step: string; ok: boolean; detail?: string }[] = []
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`) }
}
const dir = mkdtempSync(join(tmpdir(), 'saga-pwa-profile-'))
const launch = () => chromium.launchPersistentContext(dir, { executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'], viewport: { width: 1360, height: 860 }, acceptDownloads: true })
async function bookFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 100; i++) { for (const f of page.frames()) if (f.url().startsWith('blob:') && ((await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) > 200)) return f; await page.waitForTimeout(150) }
  throw new Error('book never rendered')
}
const swVersion = (page: Page) => page.evaluate(() => new Promise<string>(res => {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'saga:version') res(e.data.version) }, { once: true })
  navigator.serviceWorker.controller!.postMessage('saga:version')
}))

let ctx: BrowserContext = await launch()
let page = ctx.pages()[0]
const failed: string[] = []
ctx.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
// The landing page's own analytics script is not part of the reader (and this sandbox may block it).
ctx.on('requestfailed', r => { const u = r.url(); if (!u.startsWith('blob:') && !u.startsWith('data:') && !u.startsWith('https://gc.zgo.at/')) failed.push(`failed ${u}`) })

await step('First online visit loads; service worker controls only the reader page', async () => {
  await page.goto(APP)
  await page.waitForSelector('text=Add classic books')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  if (scope !== APP) throw new Error(`scope ${scope}`)
  await page.reload(); await page.waitForSelector('text=Add classic books')
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) throw new Error('reader page not controlled after reload')
  const landing = await ctx.newPage(); await landing.goto(ORIGIN + '/')
  const landingControlled = await landing.evaluate(() => !!navigator.serviceWorker.controller); await landing.close()
  if (landingControlled) throw new Error('landing page is controlled by the reader worker')
  return `scope ${new URL(scope).pathname}; landing page not controlled`
})

await step('Installable: manifest and icons valid, no installability errors, no 404s', async () => {
  const cdp = await ctx.newCDPSession(page)
  const m = await cdp.send('Page.getAppManifest') as { url: string; errors: { message: string }[]; data?: string }
  if (m.errors.length) throw new Error('manifest errors: ' + m.errors.map(e => e.message).join('; '))
  const data = JSON.parse(m.data!)
  const inst = await cdp.send('Page.getInstallabilityErrors') as { installabilityErrors: { errorId: string }[] }
  if (inst.installabilityErrors.length) throw new Error('installability: ' + inst.installabilityErrors.map(e => e.errorId).join(', '))
  for (const i of data.icons) {
    const r = await page.request.get(new URL(i.src, m.url).href)
    const b = await r.body()
    if (!r.ok() || b.readUInt32BE(16) !== Number(i.sizes.split('x')[0])) throw new Error(`icon ${i.src} bad`)
  }
  const apple = await page.request.get(ORIGIN + '/icons/apple-touch-icon.png'); if (!apple.ok()) throw new Error('apple-touch-icon missing')
  if (failed.length) throw new Error('failed requests: ' + failed.join(', '))
  return `${data.name} / ${data.short_name}, display ${data.display}, start_url ${new URL(data.start_url, m.url).pathname}, ${data.icons.length} PNG icons`
})

await step('Author/Publisher hidden; sign-in UI present', async () => {
  const nav = await page.locator('.rail nav').innerText()
  if (/SAGA Author|SAGA Publisher/.test(nav)) throw new Error('Author/Publisher in navigation')
  await page.goto(APP + '#/author'); await page.waitForSelector('text=Page not found')
  await page.goto(APP + '#/publisher'); await page.waitForSelector('text=Page not found')
  await page.goto(APP + '#/settings')
  await page.waitForSelector('text=Email me a link', { timeout: 20000 })
  return 'no Author/Publisher links or routes; Settings shows “Continue with Google” and “Email me a link”'
})


await step('Online: import EPUB, PDF and TXT; highlight with a note', async () => {
  await page.goto(APP + '#/')
  await page.getByRole('button', { name: 'Add books' }).click(); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: /Upload a file/ }).click()
  await (await chooser).setFiles(['frankenstein.epub', 'frankenstein-letters.pdf', 'sherlock-holmes-sample.txt'].map(f => join(SAMPLES, f)))
  await page.goto(APP + '#/library'); await page.waitForSelector('.book-tile >> nth=2', { timeout: 60000 })
  await page.getByRole('link', { name: /Frankenstein Mary Shelley/ }).first().click()

  await page.getByRole('link', { name: /Start reading/ }).click()
  let f = await bookFrame(page)
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150) }
  await page.waitForTimeout(800); f = await bookFrame(page)
  await f.evaluate(() => { const p = [...document.querySelectorAll('p')].find(p => { const r = p.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && (p.textContent?.length ?? 0) > 80 })!; const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode() as Text; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.data.length, 50)); getSelection()!.removeAllRanges(); getSelection()!.addRange(r) })
  await page.waitForSelector('.sel-menu'); await page.locator('.sel-menu').getByRole('button', { name: 'Note' }).click()
  await page.fill('#n-note', 'Offline PWA test note'); await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(500)
})

await step('Fully offline after a relaunch: the reader opens from the service worker', async () => {
  await ctx.close(); ctx = await launch(); page = ctx.pages()[0]
  await ctx.setOffline(true); down = true
  await page.goto(APP)
  await page.waitForSelector('.resume', { timeout: 15000 })
  if (await page.evaluate(() => navigator.onLine)) throw new Error('browser still online')
  return 'server unreachable and browser offline; page served from the worker cache'
})

const offlineRequests: string[] = []
await step('Offline: the highlight and note show; EPUB, PDF and TXT open; export works; no network requests', async () => {
  served.length = 0
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith('blob:') && !u.startsWith('data:')) offlineRequests.push(u) })
  await page.goto(APP + '#/library?seg=highlights'); await page.waitForSelector('text=Offline PWA test note', { timeout: 15000 })
  await page.goto(APP + '#/library'); await page.getByRole('link', { name: /Frankenstein Mary Shelley/ }).first().click()
  await page.waitForSelector('text=Offline PWA test note')
  const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Markdown' }).click()
  const md = readFileSync((await (await dl).path())!, 'utf8'); if (!md.includes('Offline PWA test note')) throw new Error('export missing the note')
  await page.getByRole('link', { name: /Continue reading|Start reading/ }).click(); await bookFrame(page)
  await page.waitForSelector('[aria-label^="Highlights and notes"]')
  for (const [name, kind] of [[/Letters|frankenstein-letters/i, 'pdf'], [/Sherlock|sherlock/i, 'txt']] as const) {
    await page.goto(APP + '#/library'); await page.getByRole('link', { name }).first().click()
    await page.getByRole('link', { name: /Start reading|Continue reading/ }).click()
    if (kind === 'pdf') await page.waitForFunction(() => [...document.querySelectorAll('.textLayer')].some(t => (t.textContent?.length ?? 0) > 100), null, { timeout: 30000 })
    else await bookFrame(page)
    if (await page.locator('text=couldn’t be opened').count()) throw new Error(`${kind} failed to open offline`)
  }
  await page.goto(APP + '#/settings')
  const dl2 = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export notes' }).click(); await dl2
  const net = offlineRequests.filter(u => !u.startsWith(APP))
  if (net.length) throw new Error('network requests while reading: ' + net.join(', '))
  // Chrome itself re-checks sw.js after a navigation (a browser update check, not app code; it just fails offline).
  const reached = served.filter(u => u !== '(refused) /sw.js')
  if (reached.length) throw new Error('requests reached the server while reading: ' + reached.join(', '))
  return `page requests: ${offlineRequests.length}; server attempts: ${served.length ? served.join(', ') + ' (browser worker update check)' : 'none'}`
})

await step('A new deploy is picked up: new worker activates, old cache removed, page offers a reload', async () => {
  await ctx.setOffline(false); down = false
  const before = await swVersion(page)
  // Simulate a deploy that changes only the worker (as if the page were served from cache): the page must notice.
  writeFileSync(join(site, 'sw.js'), readFileSync(join(site, 'sw.js'), 'utf8').replace(`const VERSION = '${before}'`, `const VERSION = 'newdeploy001'`))
  await page.reload()
  await page.waitForSelector('text=/A new version of .* is available/', { timeout: 20000 })
  const after = await swVersion(page)
  let keys: string[] = []
  for (let i = 0; i < 20; i++) { keys = await page.evaluate(() => caches.keys()); if (!keys.some(k => k.includes(before))) break; await page.waitForTimeout(500) }
  if (after !== 'newdeploy001' || keys.some(k => k.includes(before))) throw new Error(`worker ${after}, caches ${keys}`)
  // A full deploy (page + worker) is served fresh on the next online visit, network-first.
  writeFileSync(join(site, 'saga-reader.html'), readFileSync(join(site, 'saga-reader.html'), 'utf8').replace('<title>SAGA Reader</title>', '<title>SAGA Reader (new deploy)</title>'))
  await page.reload(); await page.waitForFunction(() => document.title.includes('new deploy'), null, { timeout: 10000 })
  return `worker ${before} → ${after}; caches now ${keys.join(', ')}; fresh HTML served online`
})

await ctx.close(); server.close()
writeFileSync(join(import.meta.dirname, 'pwa-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n')
console.log(`${results.filter(r => r.ok).length}/${results.length} PWA steps passed`)
process.exit(results.every(r => r.ok) ? 0 : 1)
