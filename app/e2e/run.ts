// End-to-end journey in a real browser (Chrome via playwright-core):
// import → open → read → highlight → close app → reopen → resume →
// pair + sync with the simulated Leaf → read on the Leaf → resume in app → continue.
// Plus the author → publisher → catalog → reader → Leaf slice, and screenshots.
import { chromium, type BrowserContext, type Page, type Frame } from 'playwright-core'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockGutendex } from './mocks'

const APP = process.env.APP ?? 'http://127.0.0.1:5173'
const LEAF = process.env.LEAF ?? 'http://127.0.0.1:8790'
const SHOTS = 'screenshots'
mkdirSync(SHOTS, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'saga-e2e-'))
const results: { step: string; ok: boolean; ms?: number; detail?: string }[] = []
const metrics: Record<string, number> = {}
let ctx!: BrowserContext, page!: Page
const errors: string[] = []

async function launch(viewport = { width: 1360, height: 860 }) {
  ctx = await chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], viewport, deviceScaleFactor: 1 })
  page = ctx.pages()[0] ?? await ctx.newPage()
  await mockGutendex(ctx)
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  // 192.168.4.1 is the real Leaf hotspot address that discovery probes; firmware 1.0.0 sends no CORS headers (documented)
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION_REFUSED|Failed to load resource|192\.168\.4\.1|sagaleaf\.local/.test(m.text())) errors.push('console: ' + m.text().slice(0, 240)) })
}
async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now()
  try { const d = await fn(); results.push({ step: name, ok: true, ms: Date.now() - t0, detail: d || undefined }); console.log(`✓ ${name} (${Date.now() - t0} ms)${d ? ' — ' + d : ''}`) }
  catch (e) { results.push({ step: name, ok: false, ms: Date.now() - t0, detail: (e as Error).message.split('\n')[0] }); console.log(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`); await shot('FAILED-' + name.replace(/\W+/g, '-').slice(0, 40)) }
}
const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => 0)
const sim = (p: string, b: unknown = {}) => fetch(LEAF + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json())
const dbg = <T>(fn: string) => page.evaluate(`(async () => { const { store } = window.__saga; ${fn} })()`) as Promise<T>
async function bookFrame(): Promise<Frame> {
  for (let i = 0; i < 60; i++) {
    for (const f of page.frames()) if (f !== page.mainFrame() && f.url().startsWith('blob:')) { const t = await f.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0); if (t > 200) return f }
    await page.waitForTimeout(150)
  }
  throw new Error('book content never rendered')
}
const pct = async () => Number((await page.locator('.r-mini').textContent())?.replace('%', '') ?? NaN)
async function myPos() { return dbg<{ fraction: number; snippet: string; section: number }>(`const p = (await store.db.positions.toArray()).find(p => p.deviceId === store.deviceId); return p`) }

await launch()
await page.goto(APP)
await page.waitForSelector('text=Your library starts here')
await shot('01-welcome-empty')

// ---------------------------------------------------------------- 1. import
let bookId = ''
await step('Import an EPUB through the file picker', async () => {
  await page.goto(APP + '/#/library')
  const t0 = Date.now()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add books' }).click()])
  await chooser.setFiles(['public/samples/pride-and-prejudice.epub'])
  await page.waitForSelector('text=Added “Pride and Prejudice”')
  metrics.importMs = Date.now() - t0
  bookId = await dbg<string>(`return (await store.db.books.toArray())[0].id`)
  return `imported in ${metrics.importMs} ms`
})
await step('Import a PDF and a TXT; re-importing the same file is detected as a duplicate', async () => {
  const [c1] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add books' }).click()])
  await c1.setFiles(['public/samples/frankenstein-letters.pdf', 'public/samples/sherlock-holmes-sample.txt', 'public/samples/pride-and-prejudice.epub'])
  await page.waitForSelector('text=/2 added, 1 already in your library/')
  const n = await dbg<number>(`return (await store.db.books.toArray()).length`)
  if (n !== 3) throw new Error(`expected 3 books, got ${n}`)
  await page.waitForTimeout(600); await shot('02-library')
})

// ---------------------------------------------------------------- 2. open + read
let frame: Frame
await step('Open the book and render the first chapter', async () => {
  await page.goto(APP + `/#/book/${bookId}`); await page.waitForSelector('h1:has-text("Pride and Prejudice")')
  await shot('03-book-details')
  const t0 = Date.now()
  await page.getByRole('link', { name: 'Start reading' }).click()
  frame = await bookFrame()
  metrics.openMs = Date.now() - t0
  const txt = await frame.evaluate(() => document.body.innerText)
  if (!txt.includes('It is a truth universally acknowledged')) throw new Error('opening line not visible')
  await page.waitForTimeout(500); await shot('04-reader-day')
  return `first page visible ${metrics.openMs} ms after tapping Start reading`
})
await step('Read: turn pages with the keyboard and see progress move', async () => {
  const before = await pct()
  for (let i = 0; i < 14; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(140) }
  await page.waitForTimeout(1600)
  const after = await pct(), p = await myPos()
  if (!(after > before)) throw new Error(`progress did not move (${before} → ${after})`)
  if (!p || p.fraction <= 0) throw new Error('position not saved')
  return `${before}% → ${after}%, saved at section ${p.section}`
})

// ---------------------------------------------------------------- 3. highlight
let hlText = ''
await step('Highlight a passage with the selection menu', async () => {
  frame = await bookFrame()
  hlText = await frame.evaluate(() => {
    const ps = [...document.querySelectorAll('p')].filter(p => { const r = p.getBoundingClientRect(); return r.width > 0 && (p.textContent?.length ?? 0) > 90 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight })
    const p = ps[1] ?? ps[0]
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const t = walker.nextNode() as Text
    const r = document.createRange(); const s = Math.min(4, t.data.length - 1); r.setStart(t, s); r.setEnd(t, Math.min(t.data.length, s + 60))
    const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r); return r.toString()
  })
  await page.waitForSelector('.sel-menu', { timeout: 4000 })
  await shot('05-selection-menu')
  await page.getByRole('button', { name: 'Highlight Amber' }).click()
  await page.waitForSelector('text=Highlighted')
  const a = await dbg<{ exact: string; cfi: string }[]>(`return (await store.db.annotations.toArray())`)
  if (a.length !== 1 || !a[0].exact.includes(hlText.trim().slice(0, 20))) throw new Error('annotation not stored as selected')
  await page.waitForTimeout(400)
  await page.keyboard.press('n'); await page.waitForSelector('.r-note'); await shot('06-reader-notes-panel'); await page.keyboard.press('Escape')
  return `“${hlText.trim().slice(0, 50)}…”`
})
await step('Add a note to the highlight', async () => {
  await page.keyboard.press('n'); await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.fill('#n-note', 'Mrs Bennet in one line.'); await page.fill('#n-tags', 'character')
  await shot('07-note-editor')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')
  const a = await dbg<{ note: string; tags: string[] }[]>(`return (await store.db.annotations.toArray())`)
  if (a[0].note !== 'Mrs Bennet in one line.' || a[0].tags[0] !== 'character') throw new Error('note not saved')
})
await step('Reading settings: night theme, larger type, highlight stays anchored', async () => {
  await page.keyboard.press('a'); await page.waitForSelector('.r-type')
  await page.getByRole('button', { name: 'Night' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Larger' }).click()
  await page.waitForTimeout(800); await shot('08-reader-type-panel-night')
  await page.keyboard.press('Escape'); await page.waitForTimeout(700)
  await shot('09-reader-night')
  const a = await dbg<{ orphaned?: boolean; exact: string; section: number; start: number; end: number }[]>(`return (await store.db.annotations.toArray())`)
  if (a[0].orphaned) throw new Error('highlight lost its anchor after the layout changed')
  // restore day theme for later screenshots
  await page.keyboard.press('a'); await page.getByRole('button', { name: 'Day' }).click(); for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Smaller' }).click(); await page.keyboard.press('Escape')
})
await step('Search inside the book and jump to a result', async () => {
  await page.keyboard.press('/'); await page.fill('.r-panel input', 'Netherfield'); await page.waitForSelector('.r-hits button')
  await shot('10-reader-search')
  const n = await page.locator('.r-hits button').count()
  await page.locator('.r-hits button').nth(3).click(); await page.waitForTimeout(800)
  frame = await bookFrame()
  const has = await frame.evaluate(() => getSelection()?.toString())
  await page.keyboard.press('Escape')
  if (!/Netherfield/i.test(has ?? '')) throw new Error('search result not selected on screen')
  // go back to where we were reading
  return `${n} matches`
})
await step('Table of contents navigation', async () => {
  await page.keyboard.press('t'); await page.waitForSelector('.r-toc'); await shot('11-reader-toc')
  await page.keyboard.press('Escape')
})
// return to reading position for the resume check
const posBefore = await (async () => { await page.goto(APP + `/#/read/${bookId}`); await bookFrame(); for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150) } await page.waitForTimeout(1500); return myPos() })()

// ---------------------------------------------------------------- 4. close + reopen
await step('Close the app and reopen: library, highlight and position survive', async () => {
  await ctx.close()
  await launch()
  const t0 = Date.now()
  await page.goto(APP)
  await page.waitForSelector('.resume .passage')
  metrics.homeAfterRestartMs = Date.now() - t0
  const passage = await page.locator('.resume .passage').textContent()
  if (!passage?.replace(/\s+/g, ' ').includes(posBefore.snippet.split(' ').slice(0, 5).join(' '))) throw new Error(`home passage doesn't match saved position: “${passage?.slice(0, 80)}” vs “${posBefore.snippet}”`)
  await shot('12-home-continue-reading')
  const n = await dbg<number>(`return (await store.db.annotations.toArray()).length`)
  if (n !== 1) throw new Error('highlight missing after restart')
  return `home ready ${metrics.homeAfterRestartMs} ms after launch, showing the saved sentence`
})
await step('Resume: Continue reading opens at the same sentence', async () => {
  const t0 = Date.now()
  await page.getByRole('link', { name: 'Continue reading' }).click()
  frame = await bookFrame()
  metrics.resumeMs = Date.now() - t0
  await page.waitForTimeout(600)
  const visible = await frame.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const p = await myPos()
  if (!visible.includes(posBefore.snippet.split(' ').slice(0, 6).join(' '))) throw new Error('resumed page does not contain the saved sentence')
  if (Math.abs(p.fraction - posBefore.fraction) > 0.003) throw new Error(`position drifted ${posBefore.fraction} → ${p.fraction}`)
  return `text on screen ${metrics.resumeMs} ms after tapping Continue`
})

// ---------------------------------------------------------------- 5. Leaf
let peerId = ''
await step('Discover and pair the simulated Leaf with its on-screen code', async () => {
  await page.goto(APP + '/#/devices'); await page.waitForSelector('text=No SAGA Leaf paired'); await shot('13-devices-empty')
  await page.getByRole('button', { name: 'Find my SAGA Leaf' }).click()
  await page.waitForSelector('text=SAGA Leaf (simulated)')
  await shot('14-pair-discover')
  await page.getByRole('button', { name: /SAGA Leaf \(simulated\)/ }).click()
  await page.waitForSelector('input[aria-label="Pairing code"]')
  const code = (await (await fetch(LEAF + '/sim/state')).json()).pairing.code
  await page.fill('input[aria-label="Pairing code"]', code)
  await shot('15-pair-code')
  await page.getByRole('button', { name: 'Pair', exact: true }).click()
  await page.waitForURL(/#\/device\//)
  peerId = decodeURIComponent(page.url().split('/device/')[1])
})
await step('The book being read is converted and sent to the Leaf automatically', async () => {
  const t0 = Date.now()
  await page.waitForSelector('text=/On the SAGA Leaf/', { timeout: 30000 })
  metrics.leafTransferMs = Date.now() - t0
  await shot('16-device-detail')
  const st = await (await fetch(LEAF + '/sim/state')).json()
  if (st.books.length !== 1 || st.books[0].title !== 'Pride and Prejudice') throw new Error('book not on the simulated Leaf')
  return `transfer finished ${metrics.leafTransferMs} ms after pairing`
})
let leafPctAfter = 0
await step('The Leaf opens at the phone’s position; read 10 pages and highlight on the Leaf', async () => {
  const st = await (await fetch(LEAF + '/sim/state')).json()
  const lid = st.books[0].id
  await sim('/sim/open', { bookId: lid })
  const scr = await (await fetch(LEAF + '/sim/screen')).json()
  const first = scr.text.replace(/\s+/g, ' ')
  const snippetWords = posBefore.snippet.split(' ').slice(0, 4).join(' ')
  if (!first.includes(snippetWords)) throw new Error(`Leaf did not open at the app's position: “${first.slice(0, 80)}” vs “${snippetWords}”`)
  await sim('/sim/turn', { bookId: lid, pages: 10 })
  const hl = await sim('/sim/highlight', { bookId: lid, note: 'Read on the Leaf' })
  leafPctAfter = (await (await fetch(LEAF + '/sim/state')).json()).progress[lid].progress
  const leafPage = await ctx.newPage(); await leafPage.goto(LEAF + '/device'); await leafPage.waitForTimeout(1200); await leafPage.screenshot({ path: `${SHOTS}/17-leaf-simulator-screen.png` }); await leafPage.close()
  return `Leaf now at ${(leafPctAfter * 100).toFixed(1)}%, highlighted “${hl.selected.slice(0, 40)}…”`
})
await step('Sync back: app shows the Leaf’s place and offers to jump there', async () => {
  await page.goto(APP + `/#/device/${encodeURIComponent(peerId)}`)
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await page.waitForSelector('text=/^Synced:/'); metrics.leafSyncMs = Date.now() - t0
  await page.goto(APP + `/#/read/${bookId}`); await bookFrame()
  await page.waitForSelector('.r-jump', { timeout: 6000 })
  await shot('18-reader-jump-to-leaf')
  await page.getByRole('button', { name: 'Go there' }).click(); await page.waitForTimeout(1500)
  const now = await pct()
  if (Math.abs(now / 100 - leafPctAfter) > 0.02) throw new Error(`jumped to ${now}%, Leaf was at ${(leafPctAfter * 100).toFixed(1)}%`)
  const anns = await dbg<{ note: string; orphaned?: boolean }[]>(`return (await store.db.annotations.toArray()).filter(a => !a.deleted)`)
  const leafAnn = anns.find(a => a.note === 'Read on the Leaf')
  if (!leafAnn || leafAnn.orphaned) throw new Error('Leaf highlight missing or unanchored')
  const st = await (await fetch(LEAF + '/sim/state')).json()
  const onLeaf = Object.values(st.annotations)[0] as { note: string }[]
  if (!onLeaf.some(a => a.note === 'Mrs Bennet in one line.')) throw new Error('app highlight did not reach the Leaf')
  return `sync ${metrics.leafSyncMs} ms; resumed at ${now}%; highlights now on both sides`
})
await step('Continue reading in the app after the Leaf', async () => {
  const before = await pct()
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150) }
  await page.waitForTimeout(1500)
  const p = await myPos()
  if (!(p.fraction * 100 >= before)) throw new Error('position not advancing')
  await shot('19-reader-continued')
  return `now ${(p.fraction * 100).toFixed(1)}%`
})

// ---------------------------------------------------------------- 6. secondary screens
await step('Highlights and notes screen', async () => { await page.goto(APP + '/#/notes'); await page.waitForSelector('.note-row'); await shot('20-notes') })
await step('Library-wide full-text search', async () => {
  await page.goto(APP + '/#/search?q=Holmes'); await page.waitForSelector('text=/passages/'); await page.waitForTimeout(400); await shot('21-search')
})
await step('Collections: create and add a book', async () => {
  await page.goto(APP + '/#/collections'); await page.fill('input[aria-label="New collection name"]', 'Victorian classics'); await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/collection\//); await page.getByRole('button', { name: 'Add books' }).first().click()
  await page.locator('.modal label').filter({ hasText: 'Pride and Prejudice' }).locator('input').check(); await page.locator('.modal label').filter({ hasText: 'Sherlock' }).locator('input').check()
  await page.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(400); await shot('22-collection')
})
await step('Settings and backup export', async () => {
  await page.goto(APP + '/#/settings'); await page.waitForSelector('text=Back up everything'); await shot('23-settings')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export library' }).click()])
  const p = await dl.path(); const size = (await import('node:fs')).statSync(p!).size
  if (size < 500_000) throw new Error('backup suspiciously small')
  return `backup ${(size / 1024).toFixed(0)} KB`
})
await step('Devices overview with sync off and one Leaf', async () => { await page.goto(APP + '/#/devices'); await page.waitForTimeout(500); await shot('24-devices') })

// ---------------------------------------------------------------- 7. publishing slice
let subUrl = ''
await step('Discover: popular free books from Project Gutenberg; search and topics', async () => {
  await page.goto(APP + '/#/catalog'); await page.waitForSelector('.book-tile img'); await shot('25-discover')
  await page.getByRole('button', { name: 'Adventure', exact: true }).click(); await page.waitForSelector('#g-h:has-text("Adventure")')
  await page.getByRole('button', { name: 'Popular', exact: true }).click()
  await page.fill('input[type=search]', 'doyle'); await page.waitForFunction(() => [...document.querySelectorAll('.book-tile h3')].map(e => e.textContent).join('|') === 'The Adventures of Sherlock Holmes')
  await page.locator('.book-tile').first().click(); await page.waitForSelector('text=Detective and mystery stories, English'); await shot('26-discover-item')
})
await step('Get a free book, open it, and it goes to the SAGA Leaf', async () => {
  await page.goto(APP + '/#/catalog/pg-1342'); await page.getByRole('button', { name: 'Get book' }).click(); await page.waitForSelector('text=/Pride and Prejudice” is in your library/')
  await page.getByRole('link', { name: 'Read', exact: true }).click(); await bookFrame(); await page.waitForTimeout(500)
  const id = await dbg<string>(`return (await store.db.books.toArray()).find(b => b.catalogId === 'pg-1342').id`)
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200) }
  await page.waitForTimeout(1300)
  await page.goto(APP + `/#/device/${encodeURIComponent(peerId)}`)
  await page.getByRole('button', { name: 'Sync now' }).click(); await page.waitForSelector('text=/Synced:/')
  const st = await (await fetch(LEAF + '/sim/state')).json()
  if (!st.books.some((b: { sagaId: string }) => b.sagaId === id)) throw new Error('Discover book not on the SAGA Leaf')
  return 'Discover book is on the simulated SAGA Leaf'
})
await step('Author and Publisher are hidden (FEATURES.authorPortal is off)', async () => {
  if (/Author|Publisher/.test(await page.locator('.rail').innerText())) throw new Error('nav shows them')
  await page.goto(APP + '/#/publisher'); await page.waitForSelector('text=Page not found')
})

// ---------------------------------------------------------------- 8. mobile + dark
await step('Phone-size layout: home and reader', async () => {
  await ctx.close(); await launch({ width: 390, height: 844 })
  await page.goto(APP); await page.waitForSelector('.resume'); await shot('32-mobile-home')
  await page.getByRole('link', { name: 'Continue reading' }).click(); await bookFrame(); await page.waitForTimeout(800); await shot('33-mobile-reader')
  await page.goto(APP + '/#/library'); await page.waitForTimeout(800); await shot('34-mobile-library')
})
await step('Dark appearance', async () => {
  await ctx.close(); await launch()
  await page.goto(APP + '/#/settings'); await page.getByRole('button', { name: 'Dark' }).click()
  await page.goto(APP); await page.waitForSelector('.resume'); await page.waitForTimeout(500); await shot('35-dark-home')
  await page.goto(APP + '/#/library'); await page.waitForTimeout(600); await shot('36-dark-library')
  await page.goto(APP + '/#/settings'); await page.getByRole('button', { name: 'Match system' }).click()
})

await ctx.close()
const failed = results.filter(r => !r.ok)
writeFileSync('e2e/results.json', JSON.stringify({ at: new Date().toISOString(), results, metrics, consoleErrors: errors }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
console.log('metrics', metrics)
if (errors.length) console.log('console errors:\n' + errors.slice(0, 15).join('\n'))
process.exit(failed.length ? 1 : 0)
