import { chromium } from 'playwright-core'
import { mkdtempSync, readFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join, resolve } from 'node:path'
import { FakeSupabase, mockSupabaseCdn } from './mocks'
const HTML = readFileSync(resolve('dist-standalone/saga-reader.html'), 'utf8')
const ORIGIN = 'https://saga.proxima-3d.com/saga-reader.html'
const fake = new FakeSupabase('https://uxlvtbqmhcheklazboxr.supabase.co')
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'f-')), { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
await ctx.route('https://saga.proxima-3d.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }))
await mockSupabaseCdn(ctx); await fake.install(ctx)
const page = ctx.pages()[0]
page.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)))
page.on('pageerror', e => console.log('pageerror', e.message))
await page.goto(ORIGIN + '#/settings'); await page.fill('input[type=email]', 'a@b.c'); await page.getByRole('button', { name: 'Email me a sign-in link' }).click(); await page.waitForTimeout(1500)
await page.goto(`${ORIGIN}?code=${fake.issueCode('a@b.c')}`); await page.waitForTimeout(4000)
console.log('URL', page.url())
console.log(fake.log.map(l => l.method + ' ' + l.path.slice(0, 80)).join('\n'))
console.log((await page.locator('main').innerText()).slice(0, 400))
console.log(await page.evaluate(() => Object.keys(localStorage)))
await ctx.close()
