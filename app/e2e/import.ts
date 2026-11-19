// Library import, end to end, against the published site files at the repo root
// (the installed-PWA build: one HTML file + sw.js, no server-side book store).
//   Calibre folder (webkitdirectory) and zip → DRM book refused with the reason
//   Kindle My Clippings.txt → attached to the Calibre book; the rest waits for review
//   Gutenberg book via "paste a link" (Gutendex + proxy) and a Standard Ebooks EPUB
//   via Discover (direct download, CORS) → relaunch fully offline → both open.
// The network is mocked: Gutendex/Gutenberg through the proxy URL, and
// standardebooks.org, answer with sample books. This checks SAGA's side of the
// exchange, not that those sites are up.
//   cd app && npm run build:standalone && npm run publish:site && npx tsx e2e/import.ts
import { chromium, type Page, type Frame, type BrowserContext } from 'playwright-core'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, normalize } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
// Same value as PROXY in src/app/gutendex.ts (that module needs the browser, so it isn't imported here).
const PROXY = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app', 'gutendex.ts'), 'utf8').match(/export const PROXY = '([^']+)'/)![1]

const ROOT = resolve(import.meta.dirname, '..', '..')
const SAMPLES = resolve(import.meta.dirname, '..', 'public', 'samples')
const FIX = resolve(import.meta.dirname, '..', 'tests', 'fixtures')
const site = mkdtempSync(join(tmpdir(), 'saga-import-site-'))
for (const f of ['saga-reader.html', 'saga-reader.webmanifest', 'sw.js', 'icons']) cpSync(join(ROOT, f), join(site, f), { recursive: true })
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }
let down = false
const server = createServer((req, res) => {
  if (down) { req.socket.destroy(); return }
  const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname)
  const file = normalize(join(site, path))
  if (!file.startsWith(site) || !existsSync(file)) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const APP = `http://127.0.0.1:${(server.address() as { port: number }).port}/saga-reader.html`

// ---- fixtures on disk
const work = mkdtempSync(join(tmpdir(), 'saga-import-fx-'))
const lib = join(work, 'Calibre Library')
const ppDir = join(lib, 'Jane Austen', 'Pride and Prejudice (7)')
const frDir = join(lib, 'Mary Shelley', 'Frankenstein (3)')
mkdirSync(ppDir, { recursive: true }); mkdirSync(frDir, { recursive: true })
writeFileSync(join(lib, 'metadata.db'), 'SQLite format 3')
writeFileSync(join(ppDir, 'metadata.opf'), readFileSync(join(FIX, 'calibre', 'metadata.opf')))
writeFileSync(join(ppDir, 'Pride and Prejudice - Jane Austen.epub'), readFileSync(join(SAMPLES, 'pride-and-prejudice.epub')))
const drm = unzipSync(readFileSync(join(SAMPLES, 'frankenstein.epub')))
drm['META-INF/rights.xml'] = strToU8('<rights xmlns="http://ns.adobe.com/adept"/>')
writeFileSync(join(frDir, 'Frankenstein - Mary Shelley.epub'), zipSync(drm))
const zipPath = join(work, 'calibre-library.zip')
writeFileSync(zipPath, zipSync({
  'Calibre Library/Arthur Conan Doyle/The Adventures of Sherlock Holmes (9)/Sherlock Holmes.txt': readFileSync(join(SAMPLES, 'sherlock-holmes-sample.txt')),
  'Calibre Library/Arthur Conan Doyle/The Adventures of Sherlock Holmes (9)/metadata.opf': strToU8(readFileSync(join(FIX, 'calibre', 'metadata.opf'), 'utf8').replace('Pride and Prejudice (Calibre edition)', 'The Adventures of Sherlock Holmes').replace(/Jane Austen/g, 'Arthur Conan Doyle')),
}))

const results: { step: string; ok: boolean; detail?: string }[] = []
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`) }
}
async function bookFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 100; i++) { for (const f of page.frames()) if (f.url().startsWith('blob:') && ((await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) > 200)) return f; await page.waitForTimeout(150) }
  throw new Error('book never rendered')
}
const profile = mkdtempSync(join(tmpdir(), 'saga-import-profile-'))
const launch = () => chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'], viewport: { width: 1360, height: 900 } })

// ---- mocked outside world
const seCalls: string[] = [], proxyCalls: string[] = []
const SE_FEED = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>New releases</title>
<entry><id>https://standardebooks.org/ebooks/herman-melville/moby-dick</id><title>Moby Dick</title><author><name>Herman Melville</name></author><summary>A whaling voyage.</summary>
<link href="https://standardebooks.org/ebooks/herman-melville/moby-dick/downloads/herman-melville_moby-dick.epub" rel="enclosure" type="application/epub+zip"/></entry></feed>`
async function mockNetwork(ctx: BrowserContext) {
  await ctx.route('https://standardebooks.org/**', async route => {
    const u = route.request().url(); seCalls.push(u)
    const cors = { 'access-control-allow-origin': '*' }
    // Like the real site: the feed has no CORS header (so a direct fetch fails in the browser), and
    // a download only returns the EPUB with ?source=download; without it, an HTML "download started" page.
    if (u.endsWith('/feeds/atom/new-releases')) return route.fulfill({ status: 200, headers: { 'content-type': 'application/atom+xml' }, body: SE_FEED })
    if (u === 'https://standardebooks.org/ebooks/herman-melville/moby-dick/downloads/herman-melville_moby-dick.epub?source=download') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/epub+zip' }, body: readFileSync(join(SAMPLES, 'moby-dick.epub')) })
    if (u.includes('/downloads/')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><h1>Your Download Has Started!</h1></html>' })
    return route.fulfill({ status: 404, headers: cors, body: '' })
  })
  await ctx.route(PROXY.split('?')[0] + '**', async route => {
    const target = decodeURIComponent(new URL(route.request().url()).searchParams.get('url') ?? ''); proxyCalls.push(target)
    const cors = { 'access-control-allow-origin': '*' }
    if (target === 'https://standardebooks.org/feeds/atom/new-releases') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/atom+xml' }, body: SE_FEED })
    if (target === 'https://gutendex.com/books/84') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 84, title: 'Frankenstein; Or, The Modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft', birth_year: 1797, death_year: 1851 }], subjects: [], bookshelves: [], languages: ['en'], copyright: false, media_type: 'Text', formats: { 'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images' }, download_count: 1 }) })
    if (target === 'https://www.gutenberg.org/ebooks/84.epub3.images') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/epub+zip' }, body: readFileSync(join(SAMPLES, 'frankenstein.epub')) })
    return route.fulfill({ status: 404, headers: cors, body: '{}' })
  })
}

let ctx = await launch()
await mockNetwork(ctx)
// Exercise the webkitdirectory fallback (the File System Access picker can't be driven by automation).
await ctx.addInitScript(() => { delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker })
let page = ctx.pages()[0]
page.on('pageerror', e => console.log('  page error:', e.message))

await step('Import screen is reachable from the Library', async () => {
  await page.goto(APP + '#/library'); await page.waitForSelector('text=Library')
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.waitForSelector('h1:has-text("Import")')
  await page.evaluate(() => navigator.serviceWorker.ready)
})

await step('Calibre folder: title and author from metadata.opf; DRM book refused with the existing message', async () => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose Calibre folder' }).click()
  await (await chooser).setFiles(lib)
  const list = page.getByRole('list', { name: 'Calibre import results' })
  await list.locator('li').nth(1).waitFor({ timeout: 60000 })
  const added = await list.locator('li[data-status="added"]').innerText()
  if (!added.includes('Pride and Prejudice (Calibre edition)') || !added.includes('Jane Austen')) throw new Error('added row: ' + added)
  const skipped = await list.locator('li[data-status="skipped"]').innerText()
  if (!skipped.includes('This book is DRM-protected. SAGA doesn’t remove DRM, so it can’t be opened.')) throw new Error('skipped row: ' + skipped)
  return `${added.split('\n')[0]} | ${skipped.replace(/\s+/g, ' ')}`
})

await step('Calibre zip imports too', async () => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose a zip' }).click()
  await (await chooser).setFiles(zipPath)
  await page.getByRole('list', { name: 'Calibre import results' }).locator('li[data-status="added"]', { hasText: 'The Adventures of Sherlock Holmes' }).waitFor({ timeout: 60000 })
})

await step('Kindle My Clippings.txt: attaches to the matching book; unmatched titles wait for review', async () => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose Kindle export' }).click()
  await (await chooser).setFiles(join(FIX, 'kindle', 'My Clippings.txt'))
  const banner = page.locator('.import-card .banner', { hasText: 'highlight' })
  await banner.waitFor({ timeout: 20000 })
  const text = await banner.innerText()
  if (!/1 highlight added to 1 book/.test(text) || !/3 waiting/.test(text)) throw new Error(text)
  await page.goto(APP + '#/notes')
  await page.waitForSelector('text=Kindle highlights waiting for a book')
  await page.waitForSelector('blockquote:has-text("It is a truth universally acknowledged")')
  await page.waitForSelector('text=The most famous opening line in English.')
  const war = page.locator('[data-kindle-title="The Art of War"]')
  const opts = await war.locator('option').allInnerTexts()
  await war.locator('select').selectOption({ index: opts.findIndex(o => o.startsWith('The Adventures of Sherlock Holmes')) })
  await war.getByRole('button', { name: 'Attach' }).click()
  await page.waitForSelector('text=Reread chapter on terrain.')
  return text.replace(/\s+/g, ' ')
})

let gutenbergId = '', seId = ''
await step('Gutenberg book via “paste a link” (Gutendex and the Gutenberg proxy)', async () => {
  await page.goto(APP + '#/catalog')
  await page.fill('#url-import-input', 'https://www.gutenberg.org/ebooks/84')
  await page.getByRole('button', { name: 'Get book' }).click()
  await page.waitForSelector('text=/“Frankenstein” is in your library/', { timeout: 30000 })
  for (const want of ['https://gutendex.com/books/84', 'https://www.gutenberg.org/ebooks/84.epub3.images']) if (!proxyCalls.includes(want)) throw new Error('proxy calls ' + proxyCalls.join())
  gutenbergId = await page.evaluate(async () => { const s = (window as unknown as { __saga: { store: { db: { books: { where(k: string): { equals(v: string): { first(): Promise<{ id: string } | undefined> } } } } } } }).__saga.store; return (await s.db.books.where('catalogId').equals('pg-84').first())?.id ?? '' })
  if (!gutenbergId) throw new Error('book not stored')
  return `book ${gutenbergId}; proxy saw ${proxyCalls.length} requests`
})

await step('Standard Ebooks in Discover: feed via the proxy, EPUB downloaded directly with ?source=download', async () => {
  const before = proxyCalls.length
  await page.goto(APP + '#/catalog')
  await page.getByRole('button', { name: 'Standard Ebooks' }).click()
  await page.getByRole('link', { name: /Moby Dick Herman Melville/ }).click()
  await page.getByRole('button', { name: 'Get book' }).click()
  await page.waitForSelector('text=/is in your library/', { timeout: 30000 })
  await page.waitForSelector('a.btn:has-text("Read")')
  // (Opening Discover also loads Gutenberg's popular list through the proxy; only the Standard Ebooks requests matter here.)
  const viaProxy = proxyCalls.slice(before).filter(u => u.startsWith('https://standardebooks.org/'))
  if (viaProxy.join() !== 'https://standardebooks.org/feeds/atom/new-releases') throw new Error('proxy saw: ' + viaProxy.join())
  if (seCalls.join() !== 'https://standardebooks.org/ebooks/herman-melville/moby-dick/downloads/herman-melville_moby-dick.epub?source=download') throw new Error('direct requests: ' + seCalls.join())
  seId = await page.evaluate(async () => { const s = (window as unknown as { __saga: { store: { db: { books: { where(k: string): { equals(v: string): { first(): Promise<{ id: string } | undefined> } } } } } } }).__saga.store; return (await s.db.books.where('catalogId').equals('se~herman-melville~moby-dick').first())?.id ?? '' })
  if (!seId) throw new Error('book not stored')
  return `via proxy: feed only; direct: ${seCalls.join()}`
})

await step('Fully offline after a relaunch: both downloaded books and the Calibre book open', async () => {
  await ctx.close(); ctx = await launch(); page = ctx.pages()[0]
  await ctx.setOffline(true); down = true
  const outside: string[] = []
  // Chrome's own manifest/icon checks hit the (unreachable) site; anything else leaving the page would be the app going online.
  const origin = new URL(APP).origin
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith('blob:') && !u.startsWith('data:') && !u.startsWith(origin)) outside.push(u) })
  await page.goto(APP)
  await page.waitForSelector('text=Recently added', { timeout: 15000 })
  for (const id of [gutenbergId, seId]) {
    await page.goto(APP + `#/read/${id}`)
    await bookFrame(page)
    if (await page.locator('text=couldn’t be opened').count()) throw new Error(`${id} failed to open offline`)
  }
  await page.goto(APP + '#/library'); await page.getByRole('link', { name: /Pride and Prejudice \(Calibre edition\)/ }).first().click()
  await page.getByRole('link', { name: /Start reading|Continue reading/ }).click(); await bookFrame(page)
  if (outside.length) throw new Error('network requests while offline: ' + outside.join(', '))
  return 'Gutenberg, Standard Ebooks and Calibre books render from IndexedDB with the server down'
})

await ctx.close(); server.close()
writeFileSync(join(import.meta.dirname, 'import-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n')
console.log(`${results.filter(r => r.ok).length}/${results.length} import steps passed`)
process.exit(results.every(r => r.ok) ? 0 : 1)
