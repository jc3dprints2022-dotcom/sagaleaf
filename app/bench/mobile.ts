// Mobile-first timings: Chrome with a Pixel 7 profile, 4x CPU throttle, production build served by
// `vite preview`, and the outside network replaced by e2e/mocks.ts (120 ms per request).
// Usage: npm run build && (npx vite preview &) && npx tsx bench/mobile.ts [label]
import { chromium, devices } from 'playwright-core'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockAllSources } from '../e2e/mocks'

const APP = process.env.APP ?? 'http://127.0.0.1:4173'
const label = process.argv[2] ?? 'run'
const RUNS = Number(process.env.RUNS ?? 3)
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const samples: Record<string, number[]> = {}
const rec = (k: string, v: number) => (samples[k] ??= []).push(Math.round(v))
// Waits poll on every animation frame: Playwright's default polling backs off in steps (up to 500 ms), which would swamp these numbers.
const until = (page: import('playwright-core').Page, sel: string) => page.waitForFunction(s => { const e = document.querySelector(s); return !!e && (e as HTMLElement).offsetParent !== null }, sel, { polling: 'raf', timeout: 30000 })
const untilText = (page: import('playwright-core').Page, re: string) => page.waitForFunction(r => new RegExp(r).test(document.body.innerText), re, { polling: 'raf', timeout: 30000 })

for (let run = 0; run < RUNS; run++) {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' })
  await mockAllSources(ctx, { pageSize: 32, extra: 150, latency: 120 })
  const page = await ctx.newPage()
  // first card painted, measured inside the page (milliseconds since navigation start)
  await page.addInitScript(() => { const w = window as unknown as { __firstTile?: number }; document.addEventListener('DOMContentLoaded', () => { new MutationObserver((_m, o) => { if (document.querySelector('.book-tile:not(.skel)')) { w.__firstTile = performance.now(); o.disconnect() } }).observe(document.body, { childList: true, subtree: true }) }) })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const TILE = '.book-tile:not(.skel)'
  const tiles = () => page.locator(TILE).count()

  // 1. Discover, cold (nothing cached)
  let t = Date.now()
  await page.goto(APP + '/#/catalog')
  await until(page, TILE)
  rec('discoverColdMs', await page.evaluate(() => (window as unknown as { __firstTile: number }).__firstTile))
  // 2. next page
  await page.waitForTimeout(800)
  // the new Discover shows carousels; "See all" opens the grid whose next page is measured (the old one had Show more)
  const seeAll = page.locator('[data-row=popular] a.see-all')
  if (await seeAll.count()) { await seeAll.click(); await until(page, '[data-testid=discover-grid] .book-tile:not(.skel)'); await page.waitForTimeout(1500) }
  const before = await tiles()
  t = Date.now()
  const more = page.getByRole('button', { name: 'Show more' })
  if (await more.count()) await more.click()
  else await page.evaluate(() => document.querySelectorAll('[data-sentinel], .sentinel').forEach(e => e.scrollIntoView()))
  for (let i = 0; i < 100 && (await tiles()) <= before; i++) { await page.mouse.wheel(0, 6000); await page.waitForTimeout(50) }
  rec('nextPageMs', Date.now() - t)
  // 3. Discover, warm (reload with whatever the app cached)
  await page.goto(APP + '/#/catalog')
  await page.reload()
  await until(page, TILE)
  rec('discoverWarmMs', await page.evaluate(() => (window as unknown as { __firstTile: number }).__firstTile))
  // 4. Get book (download + import of a ~0.8 MB EPUB)
  await page.goto(APP + '/#/catalog/pg-1342')
  const get = page.getByRole('button', { name: 'Get book' })
  await get.waitFor()
  t = Date.now()
  await get.click()
  await untilText(page, 'is in your library')
  rec('getBookMs', Date.now() - t)
  // 5. open book to first page
  const id = await page.evaluate(`(async () => (await window.__saga.store.db.books.toArray())[0].id)()`).catch(() => null) as string | null
  await page.goto(APP + '/#/library')
  await page.waitForSelector('.shelf .book-tile')
  await page.waitForTimeout(500)
  t = Date.now()
  await page.locator('.shelf .book-tile').first().click()
  await page.getByRole('link', { name: /Start reading|Continue reading/ }).click()
  let ok = false
  for (let i = 0; i < 400 && !ok; i++) {
    for (const f of page.frames()) if (f.url().startsWith('blob:') && (await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) > 200) ok = true
    if (!ok) await page.waitForTimeout(25)
  }
  rec('openBookMs', Date.now() - t)
  await page.waitForTimeout(1200)
  // 6. close book back to the Library list
  t = Date.now()
  await page.getByRole('link', { name: 'Close book' }).click()
  const shelf = page.locator('.shelf .book-tile:visible').first()
  if (!(await shelf.isVisible().catch(() => false))) {
    await page.waitForTimeout(150)
    if (!(await shelf.isVisible().catch(() => false))) await page.locator('.tabbar a[href="#/library"]').click()
  }
  await until(page, '.shelf .book-tile')
  rec('closeToLibraryMs', Date.now() - t)
  void id
  await browser.close()
}
const summary = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, { median: med(v), runs: v }]))
mkdirSync('bench', { recursive: true })
writeFileSync(`bench/mobile-${label}.json`, JSON.stringify({ at: new Date().toISOString(), env: 'Chrome (Pixel 7 profile), 4x CPU throttle, production build, mocked network +120 ms/request', summary }, null, 2))
console.log(JSON.stringify(summary, null, 1))
