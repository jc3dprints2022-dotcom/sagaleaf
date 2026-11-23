// Renders the static WebP images (posters, the reduced-motion / no-WebGL path, og.jpg) from the
// live scenes, i.e. from the rev 4 CAD model in public/models/leaf.glb.
// Usage: npm run publish, serve the repo root (npx serve -l 4610 ..), then `npm run renders`,
// then publish again so the new images are in /leaf/.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://localhost:4610/leaf'
const OUT = new URL('../public/renders/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const webp = (png, name, q = '80') => { execFileSync('convert', [png, '-quality', q, '-define', 'webp:method=6', `${OUT}${name}.webp`]); rmSync(png); console.log('rendered', name) }
const shots = [
  ['leaf-hero', 'hero'], ['leaf-assembled', 'assembled'], ['leaf-slate', 'assembled&skin=slate'], ['leaf-exploded', 'exploded'],
  ['leaf-rear', 'rear'], ['leaf-side', 'side'], ['leaf-studio', 'studio'],
]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const still = async (p, q) => {
  await p.goto(`${BASE}/still/?v=${q}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 90000 })
  // Every still must come from the CAD model, never from the procedural fallback.
  const model = await p.evaluate(() => document.body.dataset.model)
  if (model !== 'cad') throw new Error(`still ${q} was drawn with the "${model}" model, expected "cad"`)
}
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
for (const [name, q] of shots) {
  await still(p, q)
  const png = `${OUT}${name}.png`
  await p.locator('canvas').screenshot({ path: png })
  if (name === 'leaf-studio') execFileSync('convert', [png, '-resize', '1200x750^', '-gravity', 'center', '-extent', '1200x630', '-quality', '82', new URL('../public/og.jpg', import.meta.url).pathname])
  webp(png, name)
}
// Phone poster: the hero frame as a narrow screen frames it (390 × 844 @2x).
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pp = await ctx.newPage()
  await still(pp, 'hero')
  await pp.locator('canvas').screenshot({ path: `${OUT}leaf-hero-phone.png` })
  webp(`${OUT}leaf-hero-phone.png`, 'leaf-hero-phone', '74')
  await ctx.close()
}
// Shop posters: stills of the configurator preview itself, one per concept finish (600 × 450 @2x).
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const sp = await ctx.newPage()
  await sp.addInitScript(() => localStorage.clear())
  await sp.goto(`${BASE}/shop/`)
  await sp.mouse.move(30, 30); await sp.mouse.move(60, 60)
  await sp.waitForSelector('[data-testid=preview][data-ready=cad]', { timeout: 90000 })
  await sp.addStyleTag({ content: '[data-testid=preview]{width:600px!important;height:450px!important;aspect-ratio:auto!important}' })
  for (const [name, label] of [['leaf-shop-copper', /Copper/], ['leaf-shop-slate', /Slate/]]) {
    await sp.getByLabel(label).check()
    await sp.waitForTimeout(1800)
    // read the canvas itself, so the HTML label and button over it are not baked into the poster
    const png64 = await sp.evaluate(() => document.querySelector('[data-testid=preview] canvas').toDataURL('image/png'))
    writeFileSync(`${OUT}${name}.png`, Buffer.from(png64.split(',')[1], 'base64'))
    webp(`${OUT}${name}.png`, name, '78')
  }
  await ctx.close()
}
await p.setViewportSize({ width: 480, height: 800 })
await p.goto(`${BASE}/still/?v=screen`)
await p.waitForSelector('body[data-ready="1"]')
const png = `${OUT}leaf-screen.png`
const data = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'))
// e-paper tone: multiply white by the panel colour, stay grayscale-warm
execFileSync('convert', [png, '-fill', '#DBDBD1', '-colorize', '0', '(', '+clone', '-fill', '#DBDBD1', '-colorize', '100', ')', '-compose', 'multiply', '-composite', '-quality', '82', `${OUT}leaf-screen.webp`])
rmSync(png); console.log('rendered leaf-screen')
await b.close()
