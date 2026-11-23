import { test, expect } from '@playwright/test'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PAGES = ['/', '/privacy.html', '/saga-reader.html', '/leaf/', '/leaf/shop/', '/leaf/cart/', '/leaf/support/', '/leaf/shop/saga-leaf/']

for (const path of PAGES) {
  test(`200 with no failed same-origin assets: ${path}`, async ({ page }) => {
    const bad: string[] = []
    page.on('response', r => { if (r.url().startsWith('http://localhost:4610/') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
    await page.route(url => !/^http:\/\/localhost:4610\//.test(url.toString()), r => r.abort())
    const res = await page.goto(path)
    expect(res?.status()).toBe(200)
    await page.waitForLoadState('networkidle')
    if (path.startsWith('/leaf/')) {
      await page.waitForTimeout(2500)
      expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull()
      expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0)
      expect(await page.locator('link[rel=canonical]').getAttribute('href')).toMatch(/^https:\/\/saga\.proxima-3d\.com\/leaf\//)
    }
    expect(bad).toEqual([])
  })
}

test('200 for the CAD model, its manifest and every real app screenshot under /leaf/', async ({ request }) => {
  const files = ['models/leaf.glb', 'models/leaf.parts.json', ...readdirSync(join(__dirname, '..', 'public', 'app', 'real')).map(f => `app/real/${f}`), ...readdirSync(join(__dirname, '..', 'public', 'renders')).map(f => `renders/${f}`)]
  expect(files.filter(f => f.startsWith('app/real/')).length).toBe(24)
  for (const f of files) {
    const res = await request.get(`http://localhost:4610/leaf/${f}`)
    expect(res.status(), f).toBe(200)
    expect((await res.body()).byteLength, f).toBe(statSync(join(__dirname, '..', 'public', f)).size)
  }
})
