// Screenshots of every homepage scene + shop, cart, support, product, at desktop and phone sizes,
// plus a reduced-motion run. Usage: serve the repo root (npx serve -l 4600 ..) then node scripts/screenshots.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://localhost:4600/leaf'
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const SCENES = [
  ['00-hero', 0], ['01-assembly-mid', 0.12], ['02-assembly-end', 0.235], ['03-hw-display', 0.28], ['04-hw-buttons', 0.33],
  ['05-hw-ports', 0.38], ['06-hw-ring-xray', 0.413], ['07-hw-ring-snap', 0.447], ['08-hw-thin', 0.485], ['09-screen-fill', 0.555],
  ['10-screen-pageturn', 0.575], ['11-screen-type', 0.608], ['12-screen-highlight-note', 0.68], ['13-ecosystem', 0.78], ['14-studio-cta', 0.96],
]
const VIEWS = [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const save = async (p, name, full = false) => {
  const png = `${OUT}${name}.png`
  await p.screenshot({ path: png, fullPage: full })
  execFileSync('convert', [png, '-quality', '72', `${OUT}${name}.webp`]); rmSync(png)
  console.log('shot', name)
}
for (const [vn, viewport] of VIEWS) {
  const ctx = await b.newContext({ viewport, hasTouch: vn === 'phone' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/`); await p.waitForFunction(() => !!window.__leafStory); await p.mouse.move(10, 10); await p.mouse.move(20, 20); await p.waitForFunction(() => document.documentElement.classList.contains('stage-ready'), null, { timeout: 60000 })
  for (const [name, f] of SCENES) {
    await p.evaluate(f => { const s = document.getElementById('story'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f) }, f)
    await p.waitForTimeout(1600)
    await save(p, `${vn}-home-${name}`)
  }
  for (const [name, path] of [['shop', '/shop/'], ['product', '/shop/saga-leaf/'], ['support', '/support/']]) {
    await p.goto(BASE + path); await p.waitForTimeout(2500); await save(p, `${vn}-${name}`)
  }
  await p.goto(BASE + '/shop/'); await p.waitForTimeout(2000)
  await p.getByLabel(/Slate/).check(); await p.waitForTimeout(2500); await save(p, `${vn}-shop-slate`)
  await p.goto(BASE + '/cart/'); await p.waitForTimeout(1200); await save(p, `${vn}-cart`)
  await ctx.close()
}
// Reduced motion: no scroll-jacking, stacked sections with the static renders.
for (const [vn, viewport] of VIEWS) {
  const ctx = await b.newContext({ viewport, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/`); await p.waitForTimeout(1500)
  const cls = await p.evaluate(() => document.documentElement.className)
  if (cls.includes('cinematic')) throw new Error('reduced motion still went cinematic')
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)) } scrollTo(0, 0) })
  await p.waitForTimeout(800)
  await save(p, `reduced-motion-${vn}-home`, true)
  await ctx.close()
}
await b.close()
