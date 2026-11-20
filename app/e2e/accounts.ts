// Optional accounts, end to end, as served from the real web address.
// Supabase, its CDN and Gutendex are stood in for by e2e/mocks.ts (the test
// machine has no internet); the app code, supabase-js and the sync engine are real.
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FakeSupabase, mockSupabaseCdn, mockGutendex } from './mocks'

const HTML = readFileSync(resolve(process.env.FILE ?? 'dist-standalone/saga-reader.html'), 'utf8')
const ORIGIN = 'https://saga.proxima-3d.com/saga-reader.html'
const SUPA = 'https://uxlvtbqmhcheklazboxr.supabase.co'
const SHOTS = 'screenshots/accounts'; mkdirSync(SHOTS, { recursive: true })
const fake = new FakeSupabase(SUPA)
fake.googleEmail = 'reader@example.com'   // the same person signs in with Google on the second device
const results: { step: string; ok: boolean; ms: number; detail?: string }[] = []
const errors: string[] = []
const requests: string[] = []
const EMAIL = 'reader@example.com'
const live: Record<string, { page: Page }> = {}

async function device(name: string, opts: { html?: string; cdn?: 'serve' | 'down'; googleEmail?: string } = {}) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), `saga-acct-${name}-`)), { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], viewport: { width: 1360, height: 860 } })
  await ctx.route('https://saga.proxima-3d.com/**', route => route.request().url().split('?')[0].split('#')[0].endsWith('/saga-reader.html')
    ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: opts.html ?? HTML }) : route.fulfill({ status: 404, body: '' }))
  await mockSupabaseCdn(ctx, opts.cdn ?? 'serve'); await fake.install(ctx); await mockGutendex(ctx, { extra: 5 })
  ctx.on('request', r => { const u = r.url(); if (/supabase|jsdelivr|esm\.sh/.test(u) && !/functions\/v1\/gutenberg-proxy/.test(u)) requests.push(`${name}|${u}`) })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  live[name] = { page }
  page.on('pageerror', e => errors.push(`${name} pageerror: ${(e.stack ?? e.message).split('\n').slice(0, 4).join(' ← ')}`))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|192\.168\.4\.1|sagaleaf\.local|ERR_|bad HTTP response code \(404\)|Manifest fetch/.test(m.text())) errors.push(`${name}: ${m.text().slice(0, 200)}`) })
  return { ctx, page }
}
async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now()
  try { const d = await fn(); results.push({ step: name, ok: true, ms: Date.now() - t0, detail: d || undefined }); console.log(`✓ ${name} (${Date.now() - t0} ms)${d ? ' — ' + d : ''}`) }
  catch (e) { for (const [n, d] of Object.entries(live)) await d.page.screenshot({ path: `${SHOTS}/FAILED-${n}-${name.replace(/\W+/g, '-').slice(0, 30)}.png` }).catch(() => 0); results.push({ step: name, ok: false, ms: Date.now() - t0, detail: (e as Error).message.split('\n').slice(0, 6).join(' | ') }); console.log(`✗ ${name}: ${(e as Error).message.split('\n').slice(0, 6).join(' | ').slice(0, 700)}`) }
}
const shot = (p: Page, n: string) => p.screenshot({ path: `${SHOTS}/${n}.png` }).catch(() => 0)
const dbg = <T>(p: Page, fn: string) => p.evaluate(`(async () => { const { store } = window.__saga; ${fn} })()`) as Promise<T>
const addPride = async (p: Page) => {
  await p.goto(ORIGIN + '#/library'); await p.getByRole('button', { name: /^Add/ }).first().click()
  const [c] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Upload a file/ }).click()])
  await c.setFiles('public/samples/pride-and-prejudice.epub')
  await p.waitForSelector('text=/Added “Pride and Prejudice”|already in your library/', { timeout: 30000 }); await p.keyboard.press('Escape')
  return dbg<string>(p, `return (await store.db.books.toArray()).find(b => b.title === 'Pride and Prejudice').id`)
}

const A = await device('A')
let prideA = ''

await step('No account needed: nothing is loaded from Supabase until Settings; Google is the primary button', async () => {
  prideA = await addPride(A.page)
  await A.page.goto(ORIGIN + '#/library'); await A.page.waitForTimeout(800)
  if (requests.some(r => r.startsWith('A|'))) throw new Error(`requested before Settings: ${requests[0]}`)
  await A.page.goto(ORIGIN + '#/settings'); await A.page.waitForSelector('h2:has-text("Account & sync")')
  const google = A.page.getByRole('button', { name: 'Continue with Google' })
  await google.waitFor()
  if (!(await google.evaluate(e => e.classList.contains('primary')))) throw new Error('Google is not the primary button')
  await A.page.getByRole('button', { name: 'Email me a link' }).waitFor()
  await shot(A.page, '01-settings-signed-out')
})
await step('Email me a link: sends the link with the site’s redirect address', async () => {
  await A.page.getByRole('button', { name: 'Email me a link' }).click()
  await A.page.fill('input[type=email]', EMAIL); await A.page.getByRole('button', { name: 'Send link' }).click()
  await A.page.waitForSelector(`text=Check ${EMAIL} for a sign-in link.`)
  if (fake.otpRedirects.at(-1) !== ORIGIN) throw new Error(`redirect_to was ${fake.otpRedirects.at(-1)}`)
  return `redirect_to ${fake.otpRedirects.at(-1)}`
})
await step('Opening the link signs in and sync starts by itself: no code, no switch', async () => {
  await A.page.goto(`${ORIGIN}?code=${fake.issueCode(EMAIL)}`)
  await A.page.waitForSelector(`text=Signed in as`)
  if (A.page.url() !== ORIGIN + '#/settings') throw new Error(`url not cleaned: ${A.page.url()}`)
  if (!(await A.page.locator(`b:text("${EMAIL}")`).count())) throw new Error('email not shown')
  const legacyUser = [...fake.users.keys()][0]
  fake.rows.set(`${legacyUser}|${prideA}`, { user_id: legacyUser, book_id: prideA, data: { v: 1, box: 'old-ciphertext', lib: 'x' }, updated_at: new Date(Date.now() - 1000).toISOString() })
  fake.rows.set(`${legacyUser}|_saga_key_check`, { user_id: legacyUser, book_id: '_saga_key_check', data: { v: 1, box: 'old', lib: 'x' }, updated_at: new Date(Date.now() - 1000).toISOString() })
  await shot(A.page, '02-signed-in')
})
await step('First device: everything uploads on its own, one plain row per book; no recovery code anywhere', async () => {
  await dbg(A.page, `
    await store.put('annotation', 'acct-h1', { bookId: '${prideA}', kind: 'highlight', color: 'amber', exact: 'It is a truth universally acknowledged', prefix: '', suffix: '', start: 0, end: 38, section: 2, note: 'Opening line, the narrator’s irony about Darcy', tags: [], label: 'Chapter 1', fraction: 0.01, createdAt: Date.now(), updatedAt: Date.now() })
    await store.put('annotation', 'acct-bm', { bookId: '${prideA}', kind: 'bookmark', color: 'amber', exact: '', prefix: '', suffix: '', start: 0, end: 0, section: 4, note: '', tags: [], label: 'Chapter 3', fraction: 0.05, createdAt: Date.now(), updatedAt: Date.now() })
    await store.put('position', '${prideA}:' + store.deviceId, { bookId: '${prideA}', deviceId: store.deviceId, deviceName: 'Laptop browser', section: 6, offset: 0, fraction: 0.083, snippet: 'Mr. Bennet was among the earliest of those', at: store.clock.tick() })`)
  await A.page.getByRole('button', { name: 'Sync now' }).click()
  await A.page.waitForSelector('text=/Up to date/')
  if (await A.page.locator('text=/library code|recovery code|passphrase/i').count()) throw new Error('a code is mentioned in the UI')
  const rows = [...fake.rows.values()]
  const mine = rows.find(r => r.book_id === prideA)!
  const data = mine.data as unknown as { v: number; payload: { book: { title: string; catalogId?: string }; annotations: { note: string }[] } }
  if (data.v !== 2 || data.payload.book.title !== 'Pride and Prejudice') throw new Error('row not replaced by the plain format: ' + JSON.stringify(mine.data).slice(0, 120))
  if (!data.payload.annotations.some(a => a.note.includes('Darcy'))) throw new Error('note missing from the row')
  if (rows.some(r => !r.user_id)) throw new Error('row without user_id')
  if (!/Synced/.test(await A.page.locator('.rail-foot').innerText())) throw new Error('sidebar status doesn’t show sync')
  await shot(A.page, '04-sync-on')
  return `${rows.length} rows; the old encrypted row for the book was overwritten`
})

const B = await device('B')
await step('Second device: Continue with Google, same account, and everything is just there', async () => {
  await B.page.goto(ORIGIN + '#/settings'); await B.page.getByRole('button', { name: 'Continue with Google' }).click()
  await B.page.waitForSelector('text=Signed in as', { timeout: 20000 })
  if (B.page.url() !== ORIGIN + '#/settings') throw new Error(`url: ${B.page.url()}`)
  const auth = fake.log.find(l => l.path.startsWith('/auth/v1/authorize'))!
  const q = new URL(SUPA + auth.path).searchParams
  if (q.get('provider') !== 'google' || q.get('redirect_to') !== ORIGIN || !q.get('code_challenge')) throw new Error(auth.path)
  await B.page.waitForSelector('text=/Up to date/')
  if (await B.page.locator('input[aria-label="Library code"]').count()) throw new Error('asked for a code')
})
await step('The book and its notes arrive on the second device: “On your other device” with an Add file action', async () => {
  const id = prideA
  await B.page.goto(ORIGIN + `#/book/${id}`)
  await B.page.waitForSelector('h1:has-text("Pride and Prejudice")')
  await B.page.waitForSelector('text=On your other device')
  await B.page.getByRole('button', { name: 'Add file' }).waitFor()
  await B.page.goto(ORIGIN + '#/notes'); await B.page.waitForSelector('text=Opening line, the narrator’s irony about Darcy')
  await shot(B.page, '06-notes-synced')
})
await step('After adding the same book, it opens at the first device’s reading place', async () => {
  const prideB = await addPride(B.page)
  if (prideB !== prideA) throw new Error('book ids differ across devices')
  await B.page.goto(ORIGIN + `#/read/${prideB}`)
  await B.page.waitForSelector('text=Picked up where you left off on Laptop browser', { timeout: 15000 })
  await B.page.waitForTimeout(2500)
  const mine = await dbg<{ section: number; fraction: number }>(B.page, `return (await store.db.positions.toArray()).find(p => p.deviceId === store.deviceId && p.bookId === '${prideA}')`)
  if (mine?.section !== 6) throw new Error(`opened in section ${mine?.section}, the first device was in section 6`)
  await shot(B.page, '07-resumed')
  return `opened in section 6 (${Math.round(mine.fraction * 100)}% through)`
})
await step('A book from Discover has its source synced: the other device downloads it by itself', async () => {
  // add a Gutenberg book on A through Discover, sync, and watch B pick it up from the source
  await A.page.goto(ORIGIN + '#/catalog/pg-10000'); await A.page.getByRole('button', { name: 'Get book' }).click(); await A.page.waitForSelector('text=/is in your library/', { timeout: 30000 })
  await A.page.goto(ORIGIN + '#/settings'); await A.page.getByRole('button', { name: 'Sync now' }).click(); await A.page.waitForSelector('text=/Up to date/')
  const got = await dbg<string>(A.page, `return (await store.db.books.toArray()).find(b => b.catalogId === 'pg-10000').id`)
  await B.page.goto(ORIGIN + '#/settings'); await B.page.getByRole('button', { name: 'Sync now' }).click(); await B.page.waitForSelector('text=/Up to date/')
  const t0 = Date.now()
  for (;;) {
    const st = await dbg<{ state: string; catalogId: string } | null>(B.page, `const b = await store.db.books.get('${got}'); return b && { state: b.fileState, catalogId: b.catalogId }`)
    if (st?.state === 'local') break
    if (Date.now() - t0 > 30000) throw new Error('not downloaded: ' + JSON.stringify(st))
    await B.page.waitForTimeout(500)
  }
  return 'downloaded from Project Gutenberg on the second device'
})
await step('An edit on the second device reaches the first', async () => {
  await dbg(B.page, `await store.put('annotation', 'acct-h1', { note: 'Edited on the second device', updatedAt: Date.now() })`)
  await B.page.goto(ORIGIN + '#/settings'); await B.page.getByRole('button', { name: 'Sync now' }).click(); await B.page.waitForSelector('text=/Up to date/')
  await A.page.goto(ORIGIN + '#/settings'); await A.page.getByRole('button', { name: 'Sync now' }).click(); await A.page.waitForSelector('text=/Up to date/')
  const note = await dbg<string>(A.page, `return (await store.db.annotations.get('acct-h1')).note`)
  if (note !== 'Edited on the second device') throw new Error(note)
})
await step('Changes sync automatically a few seconds after you make them', async () => {
  await dbg(A.page, `await store.put('annotation', 'acct-h2', { bookId: '${prideA}', kind: 'highlight', color: 'sage', exact: 'single man in possession', prefix: '', suffix: '', start: 50, end: 74, section: 2, note: 'auto', tags: [], label: 'Chapter 1', fraction: 0.012, createdAt: Date.now(), updatedAt: Date.now() })`)
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) { const rows = fake.log.filter(l => l.method === 'POST' && l.path.startsWith('/rest/v1/saga_sync')).length; await A.page.waitForTimeout(500); if (fake.log.filter(l => l.method === 'POST' && l.path.startsWith('/rest/v1/saga_sync')).length > rows) break }
  await B.page.getByRole('button', { name: 'Sync now' }).click(); await B.page.waitForSelector('text=/Up to date/')
  if (!(await dbg<boolean>(B.page, `return !!(await store.db.annotations.get('acct-h2'))`))) throw new Error('not synced automatically')
  return `uploaded ${((Date.now() - t0) / 1000).toFixed(1)} s after the edit`
})
await step('Reload keeps you signed in and sync on', async () => {
  await A.page.reload(); await A.page.goto(ORIGIN + '#/settings'); await A.page.waitForSelector(`text=Signed in as`)
  await A.page.waitForSelector('text=/Up to date/')
})
await step('Sign out: email gone, notes stay on the device; no Supabase calls on next launch', async () => {
  await B.page.goto(ORIGIN + '#/settings'); await B.page.getByRole('button', { name: 'Sign out' }).click()
  await B.page.getByRole('button', { name: 'Continue with Google' }).waitFor()
  if (!(await dbg<boolean>(B.page, `return !!(await store.db.annotations.get('acct-h1'))`))) throw new Error('local notes removed')
  const before = requests.filter(r => r.startsWith('B|')).length
  await B.page.goto(ORIGIN + '#/library'); await B.page.reload(); await B.page.waitForTimeout(1500)
  if (requests.filter(r => r.startsWith('B|')).length !== before) throw new Error('Supabase contacted after signing out')
  await shot(B.page, '08-signed-out')
})
await step('Delete account and synced data: rows removed, delete-account called, signed out, books stay', async () => {
  await A.page.goto(ORIGIN + '#/settings'); await A.page.getByRole('button', { name: 'Delete account and synced data' }).click()
  await A.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await A.page.getByRole('button', { name: 'Continue with Google' }).waitFor({ timeout: 15000 })
  if (fake.rows.size) throw new Error(`${fake.rows.size} rows left on the server`)
  if (!fake.deletedAccounts.length) throw new Error('delete-account function not called')
  if (!(await dbg<boolean>(A.page, `return (await store.db.books.toArray()).length > 0`))) throw new Error('local books removed')
})
await A.ctx.close(); await B.ctx.close()

await step('Empty configuration: no sign-in UI, no requests, everything else works', async () => {
  const html = HTML.replace(/supabaseUrl: "[^"]*"/, 'supabaseUrl: ""')
  if (html === HTML) throw new Error('config not found at the top of the file')
  const C = await device('C', { html })
  await addPride(C.page)
  await C.page.goto(ORIGIN + '#/settings'); await C.page.waitForSelector('text=Your library')
  if (await C.page.locator('h2:has-text("Account & sync")').count()) throw new Error('account section shown')
  if (requests.some(r => r.startsWith('C|'))) throw new Error('requested Supabase')
  await C.ctx.close()
})
await step('Supabase or its CDN unreachable: sign-in is disabled with a note; no errors', async () => {
  const D = await device('D', { cdn: 'down' })
  await D.page.goto(ORIGIN + '#/settings'); await D.page.waitForSelector('text=/Sign-in isn’t available right now/')
  if (await D.page.getByRole('button', { name: 'Continue with Google' }).count()) throw new Error('buttons still shown')
  await shot(D.page, '09-unavailable'); await D.ctx.close()
})

const failed = results.filter(r => !r.ok)
writeFileSync('e2e/accounts-results.json', JSON.stringify({ at: new Date().toISOString(), results, consoleErrors: errors }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
if (errors.length) console.log('console errors:\n' + errors.slice(0, 15).join('\n'))
process.exit(failed.length || errors.length ? 1 : 0)
