// Offline behaviour against the production build (service worker active):
// load once online → go fully offline → relaunch → read and highlight → back online.
// (Device sync used to be tested here through the self-hosted relay, which has no UI anymore; account sync
// across two devices, including books and notes, is covered by e2e/accounts.ts.)
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
await step('First visit online: service worker installs, books added', async () => {
  await page.goto(APP); await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.getByRole('button', { name: 'Add classic books' }).click(); await page.waitForSelector('text=Added 5 public-domain books', { timeout: 60000 })
})
await step('Fully offline: the app relaunches from the service worker', async () => {
  await ctx.close(); ctx = await launch(dirA); page = ctx.pages()[0]
  await ctx.setOffline(true)
  await page.goto(APP).catch(() => 0)
  await page.waitForSelector('text=Open your library', { timeout: 15000 })
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
await step('Back online: the app carries on, highlight kept', async () => {
  await ctx.setOffline(false)
  await page.goto(APP + '/#/library?seg=highlights'); await page.waitForSelector('.note-row', { timeout: 15000 })
})
await ctx.close()
writeFileSync('e2e/offline-results.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
console.log(`${results.filter(r => r.ok).length}/${results.length} offline steps passed`)
process.exit(results.every(r => r.ok) ? 0 : 1)
