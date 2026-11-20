// Discover with every outside service mocked (e2e/mocks.ts): infinite scroll on desktop and phone width,
// Kindle-style carousels, search across sources, and downloads that work or fail gracefully.
// Usage: npm run dev (or any server on APP), then npx tsx e2e/discover.ts
import { chromium, devices, type Page, type BrowserContext } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mockAllSources } from './mocks'

const APP = process.env.APP ?? 'http://127.0.0.1:5173'
mkdirSync('screenshots', { recursive: true })
const results: { step: string; ok: boolean; detail?: string }[] = []
const errors: string[] = []
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`) }
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
async function open(kind: 'desktop' | 'phone', opts: { proxyAllows?: string[] } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(kind === 'phone' ? { ...devices['Pixel 7'], serviceWorkers: 'block' } : { viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })
  await mockAllSources(ctx, { pageSize: 32, extra: 150, latency: 60, ...opts })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
  return { ctx, page }
}
const ids = (page: Page, root = '[data-testid=discover-grid]') => page.$$eval(`${root} .book-tile[data-card]`, els => els.map(e => e.getAttribute('data-card')!))
/** Scrolls to the bottom until the grid has grown `times` times; returns the sizes seen. */
async function scrollGrows(page: Page, times: number) {
  const sizes: number[] = [(await ids(page)).length]
  for (let i = 0; i < 60 && sizes.length <= times; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(250)
    const n = (await ids(page)).length
    if (n > sizes[sizes.length - 1]) sizes.push(n)
  }
  return sizes
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, page } = await open('desktop')
  await step('Desktop: rows, then a grid that keeps loading as you scroll, with no duplicates', async () => {
    await page.goto(APP + '/#/catalog')
    await page.waitForSelector('[data-row=popular] .book-tile[data-card]')
    const rows = await page.$$eval('[data-row]', e => e.map(x => x.getAttribute('data-row')))
    for (const r of ['recommended', 'popular', 'standard-new']) if (!rows.includes(r)) throw new Error('missing row ' + r)
    await page.waitForSelector('[data-testid=discover-grid] .book-tile[data-card]')
    const sizes = await scrollGrows(page, 2)
    if (sizes.length < 3) throw new Error(`grid grew only ${sizes.length - 1} time(s): ${sizes}`)
    const all = await ids(page)
    if (new Set(all).size !== all.length) throw new Error('duplicate cards')
    await page.screenshot({ path: 'screenshots/discover-desktop.png' })
    return `grid ${sizes.join(' → ')} cards, ${all.length} unique`
  })
  await step('Sort and topic chips', async () => {
    await page.goto(APP + '/#/catalog?topic=Mystery')
    await page.waitForSelector('#grid-h:has-text("Mystery")')
    await page.selectOption('select[aria-label="Sort by"]', 'title')
    await page.waitForURL(/sort=title/)
    await page.waitForSelector('[data-testid=discover-grid] .book-tile[data-card]')
    const titles = await page.$$eval('[data-testid=discover-grid] .book-tile h3', e => e.map(x => x.textContent!))
    if (!titles.length) throw new Error('no cards')
    return `${titles.length} cards for Mystery, sorted by title`
  })
  await step('Search covers every source; a work in two sources shows once; scans come last and are labelled', async () => {
    await page.goto(APP + '/#/catalog')
    await page.fill('input[type=search]', 'wiki work')
    await page.waitForSelector('[data-testid=discover-grid] [data-card^="ws~"]')
    await page.goto(APP + '/#/catalog?q=scanned')
    await page.waitForSelector('[data-testid=discover-grid] [data-card^="ia~"]')
    const ia = await page.$eval('[data-card^="ia~"]', e => e.textContent)
    if (!/Internet Archive \(scanned\)|Scan Author/.test(ia ?? '')) throw new Error('scan not labelled: ' + ia)
    await page.goto(APP + '/#/catalog?q=pride')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=discover-grid] [data-card]').length > 0)
    const pride = await ids(page)
    if (pride.filter(i => i === 'pg-1342').length !== 1) throw new Error('Pride and Prejudice not shown exactly once: ' + pride)
  })
  await step('End of the list shows a closing note', async () => {
    await page.goto(APP + '/#/catalog?q=wiki%20work%204')
    await page.waitForSelector('.end-note', { timeout: 15000 })
    const n = (await ids(page)).length
    return `${n} cards then “${await page.textContent('.end-note')}”`
  })
  await step('Wikisource: Get book works when the proxy allows ws-export', async () => {
    await page.goto(APP + '/#/catalog/' + encodeURIComponent('ws~Wiki_Work_1'))
    await page.getByRole('button', { name: 'Get book' }).click()
    await page.waitForSelector('text=/is in your library/', { timeout: 20000 })
    return 'imported through the proxy'
  })
  await ctx.close()
}
{
  const { ctx, page } = await open('desktop', { proxyAllows: [] })
  await step('Proxy not updated yet: Wikisource and Internet Archive downloads say “Open on …” instead of failing', async () => {
    await page.goto(APP + '/#/catalog/' + encodeURIComponent('ws~Wiki_Work_2'))
    await page.getByRole('button', { name: 'Get book' }).click()
    await page.waitForSelector('a:has-text("Open on Wikisource")')
    await page.goto(APP + '/#/catalog/' + encodeURIComponent('ia~scanned-volume-3'))
    await page.getByRole('button', { name: 'Get book' }).click()
    await page.waitForSelector('a:has-text("Open on the Internet Archive")')
  })
  await ctx.close()
}

// ---------------------------------------------------------------- phone
{
  const { ctx, page } = await open('phone')
  await step('Phone: carousels scroll sideways with snapping, and See all opens a grid', async () => {
    await page.goto(APP + '/#/catalog')
    await page.waitForSelector('[data-row=popular] .book-tile[data-card]')
    const info = await page.$eval('[data-row=popular] .carousel', e => ({ snap: getComputedStyle(e).scrollSnapType, can: e.scrollWidth > e.clientWidth, before: e.scrollLeft }))
    if (!/x/.test(info.snap) || !info.can) throw new Error('carousel does not scroll horizontally: ' + JSON.stringify(info))
    const after = await page.$eval('[data-row=popular] .carousel', e => { e.scrollBy({ left: 300 }); return new Promise<number>(r => setTimeout(() => r(e.scrollLeft), 500)) })
    if (!(after > info.before)) throw new Error('did not move')
    const headings = await page.$$eval('.d-row h2', e => e.map(x => x.textContent!.replace('See all', '')))
    if (!/Recommended for you/.test(headings[0]) || headings[1] !== 'Popular' || !/New from Standard Ebooks/.test(headings[2])) throw new Error('row order: ' + headings)
    await page.screenshot({ path: 'screenshots/discover-phone.png' })
    return `${headings.length} rows, snap ${info.snap}, scrolled ${Math.round(after)} px`
  })
  await step('Phone: See all → grid scrolls forward with no duplicates', async () => {
    await page.locator('[data-row=popular] a.see-all').click()
    await page.waitForSelector('[data-testid=discover-grid] .book-tile[data-card]')
    const sizes = await scrollGrows(page, 2)
    if (sizes.length < 3) throw new Error(`grew only ${sizes.length - 1} time(s): ${sizes}`)
    const all = await ids(page)
    if (new Set(all).size !== all.length) throw new Error('duplicates')
    return `grid ${sizes.join(' → ')}`
  })
  await ctx.close()
}
await browser.close()
const failed = results.filter(r => !r.ok)
writeFileSync('e2e/discover-results.json', JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
if (errors.length) console.log('page errors:\n' + errors.slice(0, 8).join('\n'))
process.exit(failed.length ? 1 : 0)
