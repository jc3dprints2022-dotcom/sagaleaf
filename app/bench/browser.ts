// Browser measurements in Chrome with real IndexedDB: bulk import through the
// UI, opening a long book, page-turn latency, JS heap, and axe-core scans.
import { chromium } from 'playwright-core'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeBook, asEpub, asTxt } from './gen'

const APP = process.env.APP ?? 'http://127.0.0.1:5173'
const N = Number(process.env.N ?? 300)
const dir = mkdtempSync(join(tmpdir(), 'saga-books-'))
const files: string[] = []
for (let i = 0; i < N; i++) { const b = makeBook(5000 + i, 20_000 + (i % 7) * 6000); const p = join(dir, `${i}.${i % 2 ? 'epub' : 'txt'}`); writeFileSync(p, i % 2 ? asEpub(b) : asTxt(b)); files.push(p) }
const out: Record<string, unknown> = { at: new Date().toISOString(), env: 'Chrome (playwright-core), real IndexedDB, dev server' }
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'saga-bp-')), { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-precise-memory-info'], viewport: { width: 1360, height: 860 } })
const page = ctx.pages()[0]
await page.goto(APP); await page.waitForSelector('text=Your library starts here')

// 1. bulk import through the file picker
await page.goto(APP + '/#/library')
const t0 = Date.now()
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add books' }).click()])
await chooser.setFiles(files)
await page.waitForSelector('text=Import finished', { timeout: 600_000 })
const importMs = Date.now() - t0
const count = await page.evaluate(`(async () => (await window.__saga.store.db.books.toArray()).length)()`) as number
out.uiBulkImport = { files: N, imported: count, totalSeconds: +(importMs / 1000).toFixed(1), msPerBook: +(importMs / N).toFixed(1) }
await page.getByRole('button', { name: 'Done' }).click()

// 2. library screen with N books: time to first tiles after navigation
await page.goto(APP + '/#/')
const t1 = Date.now(); await page.goto(APP + '/#/library'); await page.waitForSelector('.book-tile >> nth=20'); out.libraryRenderMs = { books: count, msToTiles: Date.now() - t1 }
const t2 = Date.now(); await page.fill('input[placeholder^="Title"]', 'lantern'); await page.waitForTimeout(50); out.libraryFilterMs = Date.now() - t2

// 3. long book: Moby-Dick (1.4 MB EPUB, ~215k words)
const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add books' }).click()])
const ti = Date.now(); await c2.setFiles(['public/samples/moby-dick.epub']); await page.waitForSelector('text=Added “Moby Dick”'); const mobyImport = Date.now() - ti
const id = await page.evaluate(`(async () => (await window.__saga.store.db.books.toArray()).find(b => b.title === 'Moby Dick').id)()`) as string
const to = Date.now(); await page.goto(APP + `/#/read/${id}`)
let frame
for (let k = 0; k < 100 && !frame; k++) { for (const f of page.frames()) if (f.url().startsWith('blob:') && ((await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) > 200)) frame = f; if (!frame) await page.waitForTimeout(100) }
const openMs = Date.now() - to
await page.waitForTimeout(1000)
const turns: number[] = []
for (let k = 0; k < 20; k++) {
  const before = await page.getAttribute('.r-stage', 'data-cfi')
  const a = Date.now(); await page.keyboard.press('ArrowRight')
  await page.waitForFunction(b => document.querySelector('.r-stage')?.getAttribute('data-cfi') !== b, before, { timeout: 3000, polling: 'raf' }).catch(() => 0)
  turns.push(Date.now() - a); await page.waitForTimeout(60)
}
const sorted = [...turns].sort((x, y) => x - y)
const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
const cfiBefore = await page.getAttribute('.r-stage', 'data-cfi')
const jump = Date.now(); await page.evaluate(() => { const s = document.querySelector('.r-slider') as HTMLInputElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(s, '850'); s.dispatchEvent(new Event('input', { bubbles: true })) })
await page.waitForFunction(b => document.querySelector('.r-stage')?.getAttribute('data-cfi') !== b, cfiBefore, { timeout: 8000, polling: 'raf' }).catch(() => 0)
const jumpMs = Date.now() - jump
await page.waitForTimeout(300)
const landed = await page.locator('.r-mini').textContent()
out.longBook = { title: 'Moby Dick', importMs: mobyImport, openToTextMs: openMs, pageTurnMs: { p50: sorted[10], p95: sorted[18], max: sorted[19] }, jumpTo85PercentMs: jumpMs, landedAt: landed, jsHeapMB: +(heap / 1048576).toFixed(1), libraryBooks: count + 1 }

// 4. accessibility: axe-core on each main screen (WCAG 2.1 A/AA rules)
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')
const screens = ['', 'library', `book/${id}`, 'notes', 'search?q=whale', 'collections', 'devices', 'settings', 'catalog', 'author']
const a11y: Record<string, { violations: number; serious: number; rules: string[] }> = {}
for (const s of screens) {
  await page.goto(APP + '/#/' + s); await page.waitForTimeout(900)
  await page.addScriptTag({ content: axe })
  const r = await page.evaluate(async () => { const res = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }); return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length })) })
  a11y[s || 'home'] = { violations: r.length, serious: r.filter(v => v.impact === 'serious' || v.impact === 'critical').length, rules: r.map(v => `${v.id} (${v.impact}, ${v.n})`) }
}
await page.goto(APP + `/#/read/${id}`); await page.waitForTimeout(2500); await page.addScriptTag({ content: axe })
const rr = await page.evaluate(async () => { const res = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }); return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length })) })
a11y['reader (app chrome)'] = { violations: rr.length, serious: rr.filter(v => v.impact === 'serious' || v.impact === 'critical').length, rules: rr.map(v => `${v.id} (${v.impact}, ${v.n})`) }
out.accessibility = a11y
await ctx.close()
mkdirSync('bench', { recursive: true })
writeFileSync('bench/browser-results.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
