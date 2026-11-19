// Offline behaviour against the production build (service worker active):
// load once online with sync on → go fully offline → relaunch → read and
// highlight → change is queued → back online → a second device receives it.
import { chromium, type Page, type Frame } from 'playwright-core'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const APP = process.env.APP ?? 'http://127.0.0.1:4173'
const results: { step: string; ok: boolean; detail?: string }[] = []
async function step(name: string, fn: () => Promise<string | void>) {
  try { const d = await fn(); results.push({ step: name, ok: true, detail: d || undefined }); console.log(`✓ ${name}${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`) }
}
const launch = (dir: string) => chromium.launchPersistentContext(dir, { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], viewport: { width: 1360, height: 860 } })
async function bookFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 80; i++) { for (const f of page.frames()) if (f.url().startsWith('blob:') && ((await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0)) > 200)) return f; await page.waitForTimeout(150) }
  throw new Error('book never rendered')
}
const dirA = mkdtempSync(join(tmpdir(), 'saga-off-a-')), dirB = mkdtempSync(join(tmpdir(), 'saga-off-b-'))
let ctx = await launch(dirA); let page = ctx.pages()[0]
let code = ''
await step('First visit online: service worker installs, books added, sync turned on', async () => {
  await page.goto(APP); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.getByRole('button', { name: 'Add classic books' }).click(); await page.waitForSelector('text=Added 5 public-domain books', { timeout: 60000 })
  await page.goto(APP + '/#/devices'); await page.getByRole('button', { name: 'Turn on sync' }).click()
  code = (await page.locator('.modal .code-box').textContent())!.trim()
  await page.locator('.modal').getByRole('button', { name: 'Turn on sync' }).click(); await page.waitForSelector('text=Sync is on')
  // let the files upload so the other device can download them
  await page.waitForSelector('text=/Up to date/', { timeout: 60000 })
  return `library code ${code.slice(0, 10)}…`
})
await step('Fully offline: the app relaunches from the service worker', async () => {
  await ctx.close(); ctx = await launch(dirA); page = ctx.pages()[0]
  await ctx.setOffline(true)
  await page.goto(APP).catch(() => 0)
  await page.waitForSelector('text=Recently added', { timeout: 15000 })
  const online = await page.evaluate(() => navigator.onLine)
  if (online) throw new Error('browser still reports online')
  await page.screenshot({ path: 'screenshots/37-offline-home.png' })
})
await step('Offline: open a book, turn pages, highlight', async () => {
  await page.goto(APP + '/#/library'); await page.getByRole('link', { name: /Frankenstein Mary Shelley/ }).first().click()
  await page.getByRole('link', { name: /Start reading/ }).click()
  let f = await bookFrame(page)
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150) }
  await page.waitForTimeout(800); f = await bookFrame(page)
  await f.evaluate(() => { const p = [...document.querySelectorAll('p')].find(p => { const r = p.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && (p.textContent?.length ?? 0) > 80 })!; const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode() as Text; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(t.data.length, 50)); getSelection()!.removeAllRanges(); getSelection()!.addRange(r) })
  await page.waitForSelector('.sel-menu'); await page.getByRole('button', { name: 'Highlight Sage' }).click(); await page.waitForSelector('text=Highlighted')
})
await step('Offline: status says changes are waiting, in plain words', async () => {
  await page.goto(APP + '/#/'); await page.waitForTimeout(800)
  const t = await page.locator('.rail-foot').textContent()
  if (!/Offline\. \d+ changes? will sync later/.test(t ?? '')) throw new Error(`status was “${t}”`)
  await page.screenshot({ path: 'screenshots/38-offline-pending.png' })
  return t!.trim()
})
await step('Back online: the queued change syncs by itself', async () => {
  await ctx.setOffline(false)
  await page.waitForSelector('.rail-foot >> text=/Up to date/', { timeout: 30000 })
  return (await page.locator('.rail-foot').textContent())!.trim()
})
await ctx.close()
await step('A second device joins with the code and receives the offline highlight and the books', async () => {
  const c2 = await launch(dirB); const p2 = c2.pages()[0]
  await p2.goto(APP + '/#/devices'); await p2.getByRole('button', { name: 'I have a library code' }).click()
  await p2.fill('#lc', code); await p2.locator('.modal').getByRole('button', { name: 'Join' }).click()
  await p2.waitForSelector('text=/Joined your library/', { timeout: 60000 })
  await p2.goto(APP + '/#/notes'); await p2.waitForSelector('.note-row', { timeout: 30000 })
  await p2.goto(APP + '/#/library'); await p2.waitForSelector('.book-tile >> nth=4', { timeout: 60000 })
  await p2.waitForTimeout(4000); await p2.screenshot({ path: 'screenshots/39-second-device-library.png' })
  const n = await p2.locator('.book-tile').count()
  await c2.close()
  return `${n} books and the highlight arrived`
})
writeFileSync('e2e/offline-results.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
console.log(`${results.filter(r => r.ok).length}/${results.length} offline steps passed`)
process.exit(results.every(r => r.ok) ? 0 : 1)
