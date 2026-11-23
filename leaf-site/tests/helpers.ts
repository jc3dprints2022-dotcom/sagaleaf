import type { Page } from '@playwright/test'

export const ORIGIN = 'http://localhost:4610'
/** Keep every test offline: anything that is not the local server is aborted. */
export const offline = (page: Page) => page.route(url => !url.toString().startsWith(ORIGIN + '/'), r => r.abort())

/** Loads a page with a 3D canvas and waits until the model (CAD or fallback) has drawn. */
export async function openScene(page: Page, path: '/leaf/' | '/leaf/shop/', opts: { abortGlb?: boolean } = {}) {
  await offline(page)
  if (opts.abortGlb) await page.route('**/models/leaf.glb', r => r.abort())
  await page.goto(path)
  // The scene loads on first intent; wait for hydration, then nudge the pointer.
  if (path === '/leaf/') await page.waitForFunction(() => !!(window as any).__leafStory)
  else await page.getByTestId('to-cart').waitFor()
  await page.waitForTimeout(300)
  await page.mouse.move(20, 20); await page.mouse.move(60, 60)
  await page.waitForFunction(() => !!(window as any).__leaf, null, { timeout: 60_000 })
  if (path === '/leaf/') await page.waitForFunction(() => document.documentElement.classList.contains('stage-ready'), null, { timeout: 60_000 })
  else await page.waitForSelector('[data-testid=preview][data-ready]', { timeout: 60_000 })
}

/**
 * Scrolls the homepage story to a fraction of its length and waits for the deterministic signal
 * that the scrubbed timeline has caught up: `data-settled="1"` and `data-progress` equal to the
 * target. No timeouts are involved in deciding that it has settled.
 */
export async function scrubTo(page: Page, f: number) {
  await page.evaluate(f => { const s = document.getElementById('story')!; scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f) }, f)
  await page.waitForFunction(f => {
    const s = document.getElementById('story')!
    return s.dataset.settled === '1' && Math.abs(Number(s.dataset.progress) - f) < 0.0006
  }, f, { timeout: 30_000 })
  // one painted frame after settling, so the canvas has drawn this state
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
}
