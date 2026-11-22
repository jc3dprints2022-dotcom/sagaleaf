import { test, expect } from '@playwright/test'

test('homepage timeline scrubs forward and back to identical states', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route(url => !/^http:\/\/localhost:4610\//.test(url.toString()), r => r.abort())
  await page.goto('/leaf/')
  await page.waitForFunction(() => !!window.__leafStory)
  const snap = () => page.evaluate(() => JSON.stringify(window.__leafStory!.state, (k, v) => k === '_gsap' ? undefined : typeof v === 'number' ? Math.round(v * 1e3) / 1e3 : v))
  const go = async (f: number) => {
    await page.evaluate(f => { const s = document.getElementById('story')!; scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f) }, f)
    // wait for the scrubbed timeline to settle
    // wait until the scrubbed timeline has fully caught up with the scroll position
    await page.waitForFunction(f => {
      const w = window as any, p = w.__leafStory!.progress()
      const ok = w.__lastP === p && Math.abs(p - f) < 0.003; w.__lastP = p; return ok
    }, f, { timeout: 15000, polling: 250 })
  }
  const checkpoints = [0.1, 0.3, 0.45, 0.6, 0.68, 0.8, 0.97]
  const forward: Record<number, string> = {}
  await go(0); const start = await snap()
  for (const f of checkpoints) { await go(f); forward[f] = await snap() }
  for (const f of [...checkpoints].reverse()) { await go(f); expect(await snap(), `state at ${f} after reversing`).toBe(forward[f]) }
  await go(0)
  expect(await snap()).toBe(start)
  // Only the hero copy is visible again; no beat left stuck on screen.
  const visible = await page.$$eval('[data-beat]', els => els.filter(e => getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05).map(e => (e as HTMLElement).dataset.beat))
  expect(visible).toEqual(['hero'])
})

test('reduced motion: static stacked path, no Lenis, no canvas', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4610/leaf/')
  await page.waitForTimeout(1500)
  const cls = await page.evaluate(() => document.documentElement.className)
  expect(cls).not.toContain('cinematic')
  expect(cls).not.toContain('lenis')
  expect(await page.locator('canvas').count()).toBe(0)
  await expect(page.getByRole('heading', { name: 'Built to be held, not tapped.' })).toBeVisible()
  await expect(page.locator('img[src$="renders/leaf-exploded.webp"]')).toBeVisible()
  await ctx.close()
})

test('keyboard: skip link and nav are reachable with visible focus', async ({ page }) => {
  await page.goto('/leaf/shop/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(outline).toBe('solid')
})
