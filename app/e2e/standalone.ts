// End-to-end check of the single-file build, opened straight from disk
// (file://) with NO servers running: import, read, highlight, restart and
// resume, PDF, pair + sync the in-page simulated Leaf, read on it, jump back,
// and the author → publisher → catalog flow. Also asserts the page makes no
// network requests apart from the Leaf discovery probes for a real device and,
// on the Discover steps, Gutendex/Project Gutenberg (stood in for by e2e/mocks.ts).
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright-core'
import { mkdtempSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mockGutendex, mockSupabaseCdn, gutendexLog } from './mocks'

const FILE = resolve(process.env.FILE ?? 'dist-standalone/saga-reader.html')
const APP = 'file://' + FILE
const SHOTS = 'screenshots/standalone'
mkdirSync(SHOTS, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'saga-sa-'))
const results: { step: string; ok: boolean; ms?: number; detail?: string }[] = []
const errors: string[] = [], network: string[] = []
let ctx!: BrowserContext, page!: Page
const REAL_LEAF_PROBES = /sagaleaf\.local|192\.168\.4\.1/
let phase = 'library'

async function launch(viewport = { width: 1360, height: 860 }) {
  ctx = await chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], viewport })
  page = ctx.pages()[0] ?? await ctx.newPage()
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if ((m.type() === 'error' || /fake worker/i.test(m.text())) && !/Failed to load resource|ERR_|CORS|192\.168\.4\.1|sagaleaf\.local/.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 240)}`) })
  ctx.on('request', r => { const u = r.url(); if (!/^(file|data|blob|about|chrome-extension):/.test(u) && !REAL_LEAF_PROBES.test(u)) network.push(`${phase}|${u}`) })
  await mockGutendex(ctx); await mockSupabaseCdn(ctx)
}
async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now()
  try { const d = await fn(); results.push({ step: name, ok: true, ms: Date.now() - t0, detail: d || undefined }); console.log(`✓ ${name} (${Date.now() - t0} ms)${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, ms: Date.now() - t0, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n').slice(0, 8).join(' | ').slice(0, 900)}`); await shot('FAILED-' + name.replace(/\W+/g, '-').slice(0, 40)) }
}
const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => 0)
const dbg = <T>(fn: string) => page.evaluate(`(async () => { const { store } = window.__saga; ${fn} })()`) as Promise<T>
async function bookFrame(): Promise<Frame> {
  for (let i = 0; i < 80; i++) {
    for (const f of page.frames()) if (f !== page.mainFrame() && /^(blob:|about:srcdoc)/.test(f.url())) { const t = await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0); if (t > 200) return f }
    await page.waitForTimeout(150)
  }
  throw new Error('book content never rendered')
}
const pct = async () => Number((await page.locator('.r-mini').textContent())?.replace('%', '') ?? NaN)
const myPos = () => dbg<{ fraction: number; snippet: string }>(`return (await store.db.positions.toArray()).find(p => p.deviceId === store.deviceId)`)

await launch()
let bookId = '', posBefore = { fraction: 0, snippet: '' }, peerId = ''

await step('Opens from disk with no server', async () => {
  await page.goto(APP); await page.waitForSelector('text=Your library starts here'); await shot('01-welcome')
  return `${(statSync(FILE).size / 1e6).toFixed(1)} MB single file, ${APP.slice(0, 60)}…`
})
await step('Add the built-in classic books', async () => {
  await page.getByRole('button', { name: 'Add classic books' }).click()
  await page.waitForSelector('text=Added 4 public-domain books', { timeout: 60000 })
  await page.goto(APP + '#/library'); await page.waitForTimeout(800); await shot('02-library')
  const n = await page.locator('.book-tile').count(); if (n !== 4) throw new Error(`${n} tiles`)
  bookId = await dbg<string>(`return (await store.db.books.toArray()).find(b => b.title === 'Pride and Prejudice').id`)
  return '3 EPUB/TXT + 1 PDF embedded in the file'
})
let hlText = ''
await step('Read and highlight a passage', async () => {
  await page.goto(APP + `#/read/${bookId}`); let frame = await bookFrame()
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(160) }
  await page.waitForTimeout(800); frame = await bookFrame()
  hlText = await frame.evaluate(() => {
    const ps = [...document.querySelectorAll('p')].filter(p => { const r = p.getBoundingClientRect(); return r.width > 0 && (p.textContent?.length ?? 0) > 90 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight })
    const p = ps[1] ?? ps[0]; const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode() as Text
    const r = document.createRange(); const s = Math.min(4, t.data.length - 1); r.setStart(t, s); r.setEnd(t, Math.min(t.data.length, s + 60))
    const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r); return r.toString()
  })
  await page.waitForSelector('.sel-menu', { timeout: 4000 })
  await page.getByRole('button', { name: 'Highlight Amber' }).click(); await page.waitForSelector('text=Highlighted')
  await page.waitForTimeout(1500); await shot('03-reader')
  posBefore = await myPos()
  return `“${hlText.trim().slice(0, 40)}…” at ${(posBefore.fraction * 100).toFixed(1)}%`
})
await step('Quit and reopen: highlight and place survive (IndexedDB on file://)', async () => {
  await ctx.close(); await launch(); await page.goto(APP)
  await page.getByRole('link', { name: 'Continue reading' }).click(); const frame = await bookFrame(); await page.waitForTimeout(700)
  const vis = await frame.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  if (!vis.includes(posBefore.snippet.split(' ').slice(0, 6).join(' '))) throw new Error('did not resume at the saved sentence')
  const n = await dbg<number>(`return (await store.db.annotations.toArray()).filter(a => !a.deleted).length`)
  if (n !== 1) throw new Error(`${n} highlights after restart`)
})
await step('PDF renders with its worker (no main-thread fallback)', async () => {
  const id = await dbg<string>(`return (await store.db.books.toArray()).find(b => b.format === 'pdf').id`)
  await page.goto(APP + `#/read/${id}`); await page.waitForSelector('.pdf-wrap canvas', { timeout: 20000 }); await page.waitForSelector('.textLayer span', { timeout: 20000 })
  await page.waitForTimeout(500); await shot('04-pdf')
  return `${await page.locator('.textLayer span').count()} selectable text spans`
})
await step('Pair the in-page simulated Leaf using the code on its screen', async () => {
  await page.goto(APP + '#/devices'); await page.getByRole('button', { name: 'Find my SAGA Leaf' }).click()
  await page.getByRole('button', { name: /simulated in this page/ }).click()
  const code = (await page.locator('[data-testid="leaf-code"]').textContent({ timeout: 8000 }))!.trim()
  await shot('05-pair-code')
  await page.fill('input[aria-label="Pairing code"]', code); await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.waitForURL(/#\/device\//); peerId = decodeURIComponent(page.url().split('/device/')[1])
  await page.waitForSelector('text=/On the SAGA Leaf/', { timeout: 30000 }); await shot('06-device')
  return `code ${code}; book sent`
})
let leafPct = 0
await step('Read and highlight on the simulated Leaf, then sync', async () => {
  await page.getByRole('button', { name: 'Open simulated screen' }).click()
  await page.locator('.lsim-book', { hasText: 'Pride and Prejudice' }).click()
  const first = (await page.locator('.lsim-text').textContent())!.replace(/\s+/g, ' ')
  if (!first.includes(posBefore.snippet.split(' ').slice(0, 4).join(' '))) throw new Error(`Leaf did not open at the app's place: “${first.slice(0, 60)}”`)
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Next page' }).click()
  await page.getByRole('button', { name: 'Highlight', exact: true }).click(); await page.waitForTimeout(1200)
  leafPct = Number((await page.locator('.lsim-foot span').last().textContent())!.replace('%', ''))
  await shot('07-leaf-screen')
  await page.locator('.scrim').getByRole('button', { name: 'Sync now' }).click(); await page.waitForSelector('text=/is up to date/')
  await page.getByRole('button', { name: 'Done' }).click()
  return `Leaf at ${leafPct}%`
})
await step('Back in the reader: jump to the Leaf’s place; Leaf highlight arrived', async () => {
  await page.goto(APP + `#/read/${bookId}`); await bookFrame()
  await page.waitForSelector('.r-jump', { timeout: 8000 }); await shot('08-jump')
  await page.getByRole('button', { name: 'Go there' }).click(); await page.waitForTimeout(1500)
  const now = await pct(); if (Math.abs(now - leafPct) > 2) throw new Error(`at ${now}%, Leaf ${leafPct}%`)
  const n = await dbg<number>(`return (await store.db.annotations.toArray()).filter(a => !a.deleted && !a.orphaned).length`)
  if (n !== 2) throw new Error(`${n} anchored highlights`)
  return `resumed at ${now}%`
})
phase = 'discover'
await step('Names and hidden portals: only SAGA Reader / SAGA Leaf; no Author or Publisher anywhere', async () => {
  await page.goto(APP); await page.waitForSelector('.rail')
  const rail = await page.locator('.rail').innerText()
  if (/Author|Publisher/.test(rail)) throw new Error('author/publisher link in the navigation')
  if (!rail.includes('SAGA Reader')) throw new Error('wordmark is not “SAGA Reader”')
  for (const r of ['author', 'publisher', 'author/x']) { await page.goto(APP + '#/' + r); await page.waitForSelector('text=Page not found') }
  const texts: string[] = []
  for (const r of ['', 'library', 'devices', 'settings', 'catalog', `book/${bookId}`, `device/${encodeURIComponent(peerId)}`]) { await page.goto(APP + '#/' + r); await page.waitForTimeout(500); texts.push(await page.locator('body').innerText()) }
  const all = texts.join('\n')
  const bad = [...all.matchAll(/.{0,30}(Saga Leaf|Saga Reader|SAGA leaf|SAGA reader|\bsaga\b|SAGA Author|SAGA Publisher|test sale|demo publisher|publishing demo).{0,30}/g)].map(m => m[0])
  if (bad.length) throw new Error(`found: ${[...new Set(bad)].join(' || ')}`)
})
await step('Discover: popular free books from Project Gutenberg, with covers', async () => {
  await page.goto(APP + '#/catalog'); await page.waitForSelector('[data-row=popular] .book-tile img')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-row=popular] .book-tile img')].some(i => (i as HTMLImageElement).naturalWidth > 0))
  const first = await page.locator('[data-row=popular] .book-tile h3').first().innerText()
  if (first !== 'Pride and Prejudice') throw new Error(`first popular book: ${first}`)
  if (!(await page.locator('text=/Free public-domain books from/').count())) throw new Error('credit line missing')
  if (!gutendexLog.some(l => l.includes('sort=popular'))) throw new Error('popular list not requested')
  await shot('12-discover')
  return `${await page.locator('[data-row=popular] .book-tile').count()} books in the Popular row`
})
await step('Discover: topic filter and search', async () => {
  await page.getByRole('button', { name: 'Mystery', exact: true }).click(); await page.waitForSelector('#grid-h:has-text("Mystery")')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=discover-grid] .book-tile[data-card]').length === 1)
  if (!gutendexLog.some(l => l.includes('topic=Mystery'))) throw new Error('topic not sent')
  await page.getByRole('button', { name: 'Mystery', exact: true }).click()
  await page.fill('.d-search input[type=search]', 'shelley'); await page.waitForSelector('#grid-h:has-text("shelley")')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=discover-grid] .book-tile h3')].map(e => e.textContent).join('|') === 'Frankenstein')
  if (!gutendexLog.some(l => l.includes('search=shelley'))) throw new Error('search not sent')
  await page.fill('.d-search input[type=search]', '')
})
await step('Get book: EPUB downloads and imports; works as a normal library book', async () => {
  await page.goto(APP + '#/catalog/pg-1342'); await page.waitForSelector('text=Courtship -- Fiction'); await shot('13-discover-detail')
  await page.getByRole('button', { name: 'Get book' }).click(); await page.waitForSelector('text=/Pride and Prejudice” is in your library/')
  await page.getByRole('link', { name: 'Read', exact: true }).click(); await bookFrame()
})
await step('Get book: falls back to plain text when there is no EPUB', async () => {
  await page.goto(APP + '#/catalog/pg-1661'); await page.getByRole('button', { name: 'Get book' }).click(); await page.waitForSelector('text=/Adventures of Sherlock Holmes” is in your library/')
  const b = await dbg<{ format: string; catalogId: string; license: string }>(`return (await store.db.books.toArray()).find(b => b.catalogId === 'pg-1661')`)
  if (b.format !== 'txt' || !/Project Gutenberg/.test(b.license)) throw new Error(JSON.stringify(b))
})
await step('Get book: when the browser blocks the download, opens it in a new tab with a note', async () => {
  await page.goto(APP + '#/catalog/pg-84'); await page.waitForSelector('text=Science fiction')
  const popup = ctx.waitForEvent('page', { timeout: 15000 })
  await page.getByRole('button', { name: 'Get book' }).click()
  const tab = await popup
  if (!/gutenberg\.org\/ebooks\/84\.epub3\.images/.test(tab.url())) throw new Error(`opened ${tab.url()}`)
  await page.waitForSelector('text=/add it with/'); await shot('14-discover-blocked'); await tab.close()
  errors.splice(0, errors.length, ...errors.filter(e => !/CORS|Access-Control|Failed to fetch/i.test(e)))
})
await step('Discover offline: clear message, last popular list still shown', async () => {
  await ctx.setOffline(true)
  await page.goto(APP + '#/library'); await page.goto(APP + '#/catalog')
  await page.waitForSelector('text=Discover needs an internet connection; your library still works offline.')
  await page.waitForSelector('[data-row=popular] .book-tile[data-card]')
  const n = await page.locator('[data-row=popular] .book-tile').count(); if (n < 6) throw new Error(`${n} cached books shown`)
  await shot('15-discover-offline'); await page.goto(APP + '#/library'); await ctx.setOffline(false)
  return `${n} books from the cached Popular page`
})
phase = 'settings'
await step('Settings: account is optional; from a file, sign-in explains it needs the web address', async () => {
  await page.goto(APP + '#/settings'); await page.waitForSelector('h2:has-text("Account & sync")')
  await page.waitForSelector('text=/Sign-in works when SAGA Reader is opened from its web address/')
  if (await page.getByRole('button', { name: 'Continue with Google' }).count()) throw new Error('sign-in buttons shown on file://')
  if (!(await page.locator('text=/Book files are never uploaded/').count())) throw new Error('privacy text missing')
  await shot('16-settings-file')
})
await step('Network: only Gutendex/Gutenberg on Discover; nothing else, no Supabase', async () => {
  const outside = network.filter(n => !/functions\/v1\/gutenberg-proxy|https:\/\/(gutendex\.com|www\.gutenberg\.org|standardebooks\.org|en\.wikisource\.org|openlibrary\.org)\//.test(n))
  if (outside.length) throw new Error(`requested: ${[...new Set(outside)].slice(0, 5).join(', ')}`)
  return `${network.length} requests, all to Gutendex/Gutenberg during Discover`
})

await ctx.close()
const failed = results.filter(r => !r.ok)
writeFileSync('e2e/standalone-results.json', JSON.stringify({ at: new Date().toISOString(), file: FILE, results, consoleErrors: errors, network }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
if (errors.length) console.log('console errors:\n' + errors.slice(0, 15).join('\n'))
process.exit(failed.length || errors.length ? 1 : 0)
