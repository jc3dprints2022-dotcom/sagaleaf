// Renders the static WebP fallbacks (reduced motion / no WebGL) from the same concept model.
// Usage: npm run build && npx serve -l 4600 <dir with leaf -> out> ; BASE=http://localhost:4600/leaf node scripts/renders.mjs
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
const BASE = process.env.BASE ?? 'http://localhost:4600/leaf'
const OUT = new URL('../public/renders/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const shots = [
  ['leaf-hero', 'hero'], ['leaf-assembled', 'assembled'], ['leaf-slate', 'assembled&skin=slate'], ['leaf-exploded', 'exploded'],
  ['leaf-rear', 'rear'], ['leaf-side', 'side'], ['leaf-studio', 'studio'],
]
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } })
for (const [name, q] of shots) {
  await p.goto(`${BASE}/still/?v=${q}`)
  await p.waitForSelector('body[data-ready="1"]', { timeout: 60000 })
  const png = `${OUT}${name}.png`
  await p.locator('canvas').screenshot({ path: png })
  execFileSync('convert', [png, '-quality', '80', '-define', 'webp:method=6', `${OUT}${name}.webp`])
  if (name === 'leaf-studio') execFileSync('convert', [png, '-resize', '1200x750^', '-gravity', 'center', '-extent', '1200x630', '-quality', '82', new URL('../public/og.jpg', import.meta.url).pathname])
  rmSync(png); console.log('rendered', name)
}
await p.setViewportSize({ width: 480, height: 800 })
await p.goto(`${BASE}/still/?v=screen`)
await p.waitForSelector('body[data-ready="1"]')
const png = `${OUT}leaf-screen.png`
const data = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
const { writeFileSync } = await import('node:fs')
writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'))
// e-paper tone: multiply white by the panel colour, stay grayscale-warm
execFileSync('convert', [png, '-fill', '#DBDBD1', '-colorize', '0', '(', '+clone', '-fill', '#DBDBD1', '-colorize', '100', ')', '-compose', 'multiply', '-composite', '-quality', '82', `${OUT}leaf-screen.webp`])
rmSync(png); console.log('rendered leaf-screen')
await b.close()
