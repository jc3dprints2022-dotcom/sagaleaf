// The Android build's web bundle (dist-native/, made by `npm run build:native`) in a phone-sized
// Chromium with no network: only the page's own origin answers, as in the Capacitor WebView
// (https://localhost there, http://localhost here). This stands in for an emulator run, which
// the CI sandbox can't do (no KVM). It checks:
//   - no service worker, no manifest, no sign-in anywhere
//   - import a local EPUB through the file picker, read it, highlight
//   - kill the browser and relaunch: the highlight is still there
//   - the web half of "open with" from another app (src/app/native.ts openExternalFiles)
// Usage: npm run build:native && npx tsx e2e/native.ts
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DIST = resolve('dist-native'), SAMPLES = resolve('public/samples')
const SHOTS = 'screenshots/native'
mkdirSync(SHOTS, { recursive: true })
const server = createServer((req, res) => {
  const path = req.url!.split('?')[0]
  try {
    const body = path === '/' || path === '/index.html' ? readFileSync(join(DIST, 'index.html')) : readFileSync(join(SAMPLES, path.replace(/^\/samples\//, '')))
    res.writeHead(200, { 'content-type': path.endsWith('.epub') ? 'application/epub+zip' : 'text/html' }); res.end(body)
  } catch { res.writeHead(404); res.end() }
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const ORIGIN = `http://localhost:${(server.address() as { port: number }).port}`

const profile = mkdtempSync(join(tmpdir(), 'saga-native-'))
const results: { step: string; ok: boolean; detail?: string }[] = []
const blocked: string[] = [], errors: string[] = []
let ctx!: BrowserContext, page!: Page

async function launch() {
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'],
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  })
  // No network: anything that isn't the page's own origin fails, like a phone in airplane mode.
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(ORIGIN) || /^(data|blob):/.test(u)) return r.continue(); blocked.push(u); return r.abort('internetdisconnected') })
  page = ctx.pages()[0] ?? await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
}
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`); await page.screenshot({ path: `${SHOTS}/FAILED.png` }).catch(() => 0) }
}
const dbg = <T>(fn: string) => page.evaluate(`(async () => { const { store } = window.__saga; ${fn} })()`) as Promise<T>
const liveHighlights = () => dbg<number>(`return (await store.db.annotations.toArray()).filter(a => !a.deleted).length`)
async function bookFrame(): Promise<Frame> {
  for (let i = 0; i < 80; i++) {
    for (const f of page.frames()) if (f !== page.mainFrame() && /^(blob:|about:srcdoc)/.test(f.url())) { const t = await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0); if (t > 200) return f }
    await page.waitForTimeout(150)
  }
  throw new Error('book content never rendered')
}

await launch()
let bookId = ''
await step('Starts with no network, no account, no service worker', async () => {
  await page.goto(ORIGIN + '/'); await page.waitForSelector('text=Your library starts here')
  const sw = await page.evaluate(() => navigator.serviceWorker?.getRegistrations().then(r => r.length) ?? 0)
  const manifest = await page.locator('link[rel=manifest]').count()
  if (sw || manifest) throw new Error(`service workers: ${sw}, manifest links: ${manifest}`)
  await page.screenshot({ path: `${SHOTS}/01-home.png` })
})
await step('No sign-in anywhere (Settings has no Account section)', async () => {
  await page.goto(ORIGIN + '/#/settings'); await page.waitForSelector('text=Back up everything')
  const n = await page.getByText(/Continue with Google|Send sign-in link|^Account/).count()
  if (n) throw new Error(`${n} sign-in elements`)
})
await step('Import a local EPUB with the file picker', async () => {
  await page.goto(ORIGIN + '/#/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose files' }).click()
  await (await chooser).setFiles(join(SAMPLES, 'frankenstein.epub'))
  await page.waitForSelector('text=/Added “/', { timeout: 30000 })
  bookId = await dbg<string>(`return (await store.db.books.toArray())[0].id`)
  return await dbg<string>(`return (await store.db.books.toArray())[0].title`)
})
let hl = ''
await step('Read and add a highlight', async () => {
  await page.goto(ORIGIN + `/#/read/${bookId}`); let f = await bookFrame()
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(160) }
  await page.waitForTimeout(800); f = await bookFrame()
  hl = await f.evaluate(() => {
    const ps = [...document.querySelectorAll('p')].filter(p => { const r = p.getBoundingClientRect(); return r.width > 0 && (p.textContent?.length ?? 0) > 60 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight })
    const p = ps[0]; const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode() as Text
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.data.length, 40))
    const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r); return r.toString()
  })
  await page.waitForSelector('.sel-menu', { timeout: 4000 })
  await page.getByRole('button', { name: /^Highlight / }).first().click(); await page.waitForSelector('text=Highlighted')
  await page.waitForTimeout(1200); await page.screenshot({ path: `${SHOTS}/02-highlight.png` })
  return `“${hl.trim().slice(0, 40)}”`
})
await step('Kill the app and relaunch: the highlight is still there', async () => {
  await ctx.close(); await launch(); await page.goto(ORIGIN + '/')
  await page.waitForSelector('text=/Continue reading|Frankenstein/')
  const n = await liveHighlights(); if (n !== 1) throw new Error(`${n} highlights after relaunch`)
  await page.goto(ORIGIN + '/#/notes'); await page.waitForSelector(`text=${hl.trim().slice(0, 20)}`, { timeout: 8000 })
  await page.screenshot({ path: `${SHOTS}/03-after-relaunch.png` })
})
await step('"Open with" from another app (web half): imports and opens the book', async () => {
  // On a phone the URI is content://…; Capacitor.convertFileSrc maps it to the local server. Here it's a plain URL,
  // with a provider-style name that has no extension.
  await page.evaluate(u => (window as unknown as { __sagaNative: { openExternalFiles(l: unknown[]): Promise<void> } }).__sagaNative.openExternalFiles([{ uri: u, name: 'document:1042', type: 'application/epub+zip' }]), ORIGIN + '/samples/moby-dick.epub')
  await page.waitForURL(/#\/read\//, { timeout: 30000 }); await bookFrame()
  const t = await dbg<string[]>(`return (await store.db.books.toArray()).map(b => b.title)`)
  if (!t.some(x => /moby/i.test(x))) throw new Error(`library: ${t.join(', ')}`)
  await page.screenshot({ path: `${SHOTS}/04-opened-from-outside.png` })
  return t.join(', ')
})
await step('Made no requests outside the app', async () => {
  const outside = blocked.filter(u => !/sagaleaf\.local|192\.168\.4\.1/.test(u))   // Leaf discovery probes only run on the Devices screen
  if (outside.length) throw new Error(outside.slice(0, 5).join(', '))
  if (errors.length) throw new Error('page errors: ' + errors.slice(0, 3).join(' | '))
})
await ctx.close(); server.close()
writeFileSync('e2e/native-results.json', JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
