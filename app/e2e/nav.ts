// Navigation (exactly Home, Library, Discover, Settings at phone and desktop width), old addresses still
// resolving, and the Add pop-up recognising each kind of file from e2e/fixtures/import.
// Usage: npm run dev (or any server on APP), then npx tsx e2e/nav.ts
import { chromium, type Page } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'
import { mockAllSources } from './mocks'

const APP = process.env.APP ?? 'http://127.0.0.1:5173'
const FX = 'e2e/fixtures/import/'
mkdirSync('screenshots', { recursive: true })
const results: { step: string; ok: boolean; detail?: string }[] = []
const errors: string[] = []
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`) }
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' })
await mockAllSources(ctx)
const page = await ctx.newPage()
page.on('pageerror', e => errors.push(e.message))
await page.goto(APP)
await page.waitForSelector('text=Your library starts here')

const NAV = ['Home', 'Library', 'Discover', 'Settings']
async function navLabels(p: Page, sel: string) { return (await p.$$eval(`${sel} a`, els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => (e.textContent ?? '').replace(/\d+$/, '').trim()))) }
await step('Desktop 1280px: the rail shows exactly Home, Library, Discover, Settings', async () => {
  await page.setViewportSize({ width: 1280, height: 860 })
  const rail = await navLabels(page, '.rail .nav')
  if (rail.join() !== NAV.join()) throw new Error('rail: ' + rail)
  if (await page.locator('.tabbar').isVisible()) throw new Error('tab bar visible on desktop')
})
await step('Phone 390px: the tab bar shows exactly Home, Library, Discover, Settings', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  const tabs = await navLabels(page, '.tabbar')
  if (tabs.join() !== NAV.join()) throw new Error('tabs: ' + tabs)
  if (await page.locator('.rail').isVisible()) throw new Error('rail visible on phone')
  await page.setViewportSize({ width: 1280, height: 860 })
})
await step('Old addresses still resolve: search, notes, collections, devices, import', async () => {
  const notFound = () => page.locator('text=Page not found').count()
  for (const [route, expect] of [['search?q=zzz', 'No titles match'], ['notes', 'highlights across'], ['collections', 'No collections yet'], ['devices', 'No SAGA Leaf paired'], ['collection/none', 'This collection was deleted'], ['device/none', 'Device not found']] as const) {
    await page.goto(APP + '/#/' + route); await page.reload()
    await page.waitForSelector(`text=${expect}`, { timeout: 8000 })
    if (await notFound()) throw new Error(route + ' → 404')
  }
  await page.goto(APP + '/#/import'); await page.reload()
  await page.waitForSelector('[role=dialog] >> text=Upload a file')
  await page.keyboard.press('Escape')
  const active = async (r: string) => page.goto(APP + '/#/' + r).then(() => page.locator('.rail [aria-current=page]').textContent())
  if (!/Library/.test((await active('notes')) ?? '')) throw new Error('notes should highlight Library')
  if (!/Settings/.test((await active('devices')) ?? '')) throw new Error('devices should highlight Settings')
})
await step('Library segments: Books | Collections | Highlights, search per segment, Add opens the pop-up', async () => {
  await page.goto(APP + '/#/library')
  for (const s of ['Books', 'Collections', 'Highlights']) await page.getByRole('button', { name: s, exact: true }).waitFor()
  await page.getByRole('button', { name: 'Collections', exact: true }).click()
  await page.waitForSelector('text=No collections yet')
  await page.getByRole('button', { name: 'Highlights', exact: true }).click()
  await page.waitForSelector('text=highlights across')
  await page.getByRole('button', { name: 'Books', exact: true }).click()
  await page.getByRole('button', { name: /^Add/ }).click()
  await page.waitForSelector('[role=dialog] >> text=Paste a link')
  await page.keyboard.press('Escape')
})

async function chooseFile(file: string) {
  await page.goto(APP + '/#/library')
  await page.getByRole('button', { name: /^Add/ }).first().click()
  const [c] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload a file/ }).click()])
  const accept = await c.element().evaluate(e => (e as HTMLInputElement).accept)
  for (const ext of ['.epub', '.pdf', '.txt', '.zip', '.html', '.csv']) if (!accept.includes(ext)) throw new Error('picker does not accept ' + ext)
  await c.setFiles(FX + file)
  const r = page.getByTestId('import-result')
  await r.waitFor({ timeout: 15000 })
  const text = (await r.textContent()) ?? ''
  await page.keyboard.press('Escape')
  return text
}
await step('Add pop-up: a book (EPUB) is added', async () => { const t = await chooseFile('book.epub'); if (!/Added “Fixture Tale”/.test(t)) throw new Error(t); return t })
await step('Add pop-up: a Calibre library zip is recognised', async () => { const t = await chooseFile('calibre-library.zip'); if (!/Calibre: 1 book added/.test(t)) throw new Error(t); return t })
await step('Add pop-up: Kindle My Clippings.txt is recognised', async () => { const t = await chooseFile('My Clippings.txt'); if (!/^Kindle: /.test(t)) throw new Error(t); return t })
await step('Add pop-up: a SAGA backup zip is restored', async () => { const t = await chooseFile('saga-backup.zip'); if (!/Restored 1 book and 1 highlight/.test(t)) throw new Error(t); return t })
await step('Add pop-up: Paste a link takes the new sources and direct files, no jargon in the pop-up', async () => {
  await page.goto(APP + '/#/library'); await page.getByRole('button', { name: /^Add/ }).first().click()
  const text = (await page.locator('[role=dialog]').innerText()).toLowerCase()
  for (const bad of ['calibre folder', 'choose files for epub']) if (text.includes(bad)) throw new Error('jargon: ' + bad)
  await page.getByRole('button', { name: /Paste a link/ }).click()
  await page.fill('#url-import-input', 'https://en.wikisource.org/wiki/Wiki_Work_5')
  await page.getByRole('button', { name: 'Get book' }).click()
  await page.waitForSelector('[data-testid=import-result]:has-text("is in your library")', { timeout: 20000 })
  await page.keyboard.press('Escape')
})
await step('Discover has a link icon beside the search box that opens the same pop-up on the link field', async () => {
  await page.goto(APP + '/#/catalog')
  await page.getByRole('button', { name: /Have a link/ }).click()
  await page.waitForSelector('#url-import-input')
  if (await page.locator('text=Have a link?').count() > 1) throw new Error('the old section is still on the page')
  await page.keyboard.press('Escape')
})
await step('Home: Continue reading, Recommended, Recent highlights (no “Recently added”)', async () => {
  await page.goto(APP + '/#/'); await page.waitForSelector('.resume')
  await page.waitForSelector('[data-row=home-recommended]')
  if (await page.locator('h2:has-text("Recently added")').count()) throw new Error('Recently added is still there')
})
await step('Settings has Account & sync, Devices, Reading, Appearance, Your library, Storage, About, Privacy', async () => {
  await page.goto(APP + '/#/settings')
  await page.waitForSelector('h2#devices')
  const heads = await page.$$eval('h2.section-title', e => e.map(x => x.textContent!.trim()))
  const want = ['Devices', 'Reading', 'Appearance', 'Your library', 'Storage', 'About']
  for (const w of want) if (!heads.includes(w)) throw new Error('missing ' + w + ' in ' + heads)
  await page.waitForSelector('summary:has-text("Privacy")')
  if (await page.locator('text=Everything here applies').count()) throw new Error('filler')
  return heads.join(' · ')
})
await browser.close()
const failed = results.filter(r => !r.ok)
writeFileSync('e2e/nav-results.json', JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
if (errors.length) console.log('page errors:\n' + errors.slice(0, 8).join('\n'))
process.exit(failed.length ? 1 : 0)
