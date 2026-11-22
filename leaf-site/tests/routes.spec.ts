import { test, expect } from '@playwright/test'

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
