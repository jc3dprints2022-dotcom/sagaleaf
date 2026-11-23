import { test, expect } from '@playwright/test'
import { offline, scrubTo } from './helpers'
import { T, PHONE_ON, PHONE_SCREEN_AT, PHONE_SCREENS, phoneAt, phoneScreenAt } from '../src/three/timeline'

/** Scrubbed tweens can land a hair apart depending on frame timing; compare numbers within 0.01. */
const TOL = 0.01
function diffState(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOL ? [] : [`${path}: ${a} vs ${b}`]
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap(k => diffState((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k))
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`]
}

test('homepage timeline scrubs forward and back to identical states', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await offline(page)
  await page.goto('/leaf/')
  await page.waitForFunction(() => !!window.__leafStory)
  const snap = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__leafStory!.state, (k, v) => k === '_gsap' ? undefined : v)))
  const go = (f: number) => scrubTo(page, f)
  // 0.8 used to be flaky: it sat exactly on a phone-screen switch. The screen is now a pure function of time.
  const checkpoints = [0.1, 0.3, 0.45, 0.6, 0.68, 0.753, 0.8, 0.97]
  const forward: Record<number, any> = {}
  await go(0); const start = await snap()
  for (const f of checkpoints) { await go(f); forward[f] = await snap() }
  for (const f of checkpoints) expect(forward[f].phone.screen, `phone screen at ${f}`).toBe(phoneScreenAt(f * T))
  for (const f of [...checkpoints].reverse()) { await go(f); expect(diffState(await snap(), forward[f]), `state at ${f} after reversing`).toEqual([]) }
  await go(0)
  expect(diffState(await snap(), start), 'state back at the top').toEqual([])
  // Only the hero copy is visible again; no beat left stuck on screen.
  const visible = await page.$$eval('[data-beat]', els => els.filter(e => getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05).map(e => (e as HTMLElement).dataset.beat))
  expect(visible).toEqual(['hero'])
})

test('phone screen selection is a pure function of timeline time, with explicit thresholds', () => {
  expect(phoneScreenAt(0)).toBe(-1)
  expect(phoneScreenAt(PHONE_ON - 0.001)).toBe(-1)
  expect(phoneScreenAt(PHONE_ON)).toBe(0)
  PHONE_SCREEN_AT.forEach((t, i) => {
    expect(phoneScreenAt(t - 1e-9)).toBe(i)
    expect(phoneScreenAt(t)).toBe(i + 1)
  })
  expect(phoneScreenAt(T)).toBe(PHONE_SCREENS.length - 1)
  // same input, same output, whatever was asked before
  for (const [t, want] of [[80, 3], [20, -1], [80, 3], [99, 4], [80, 3], [76, 1], [80, 3]]) expect(phoneScreenAt(t)).toBe(want)
  expect(phoneAt(80)).toEqual(phoneAt(80))
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
  // the app strip shows the real screenshots, and the page scrolls natively
  await expect(page.getByTestId('app-strip').locator('img')).toHaveCount(5)
  await page.evaluate(() => scrollTo(0, 1200))
  expect(await page.evaluate(() => scrollY)).toBe(1200)
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
