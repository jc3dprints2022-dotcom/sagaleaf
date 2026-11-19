// Renders the Android launcher icons and splash screens from public/icon.svg, so the
// app shows SAGA's leaf instead of Capacitor's placeholder art. Re-run after changing
// the icon:  cd app && node scripts/android-assets.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const res = join(app, 'android/app/src/main/res')
if (!existsSync(res)) { console.error('No android/ project. Run `npx cap add android` first.'); process.exit(1) }

const svg = readFileSync(join(app, 'public/icon.svg'), 'utf8')
const TILE = svg.match(/<rect\b[^>]*fill="([^"]+)"/)[1]              // #1f2a30, the icon's background
const SPLASH_BG = '#eceee9'                                            // PRODUCT.backgroundColor
const glyph = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect\b[^>]*\/>/, '')
const png = (s, w, h = w) => new Resvg(s, { fitTo: { mode: 'width', value: w }, background: 'rgba(0,0,0,0)' }).render().asPng()
const svgOf = (viewBox, body, w = 1, h = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">${body}</svg>`

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${d}`)
  // Legacy icons (before Android 8): 48dp, the rounded tile and a circle.
  writeFileSync(join(dir, 'ic_launcher.png'), png(svg, 48 * k))
  writeFileSync(join(dir, 'ic_launcher_round.png'), png(svgOf('0 0 64 64', `<circle cx="32" cy="32" r="32" fill="${TILE}"/>${glyph}`), 48 * k))
  // Adaptive foreground: 108dp canvas, shown through a 72dp mask, so the glyph keeps the size it has on the tile.
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), png(svgOf('-16 -16 96 96', glyph), 108 * k))
}
writeFileSync(join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${TILE.toUpperCase()}</color>\n</resources>\n`)

// Splash screens: keep each file's size, paint the app background with the icon in the middle.
const size = f => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)] }
for (const dir of readdirSync(res).filter(n => n.startsWith('drawable'))) {
  const f = join(res, dir, 'splash.png')
  if (!existsSync(f)) continue
  const [w, h] = size(f), icon = Math.round(Math.min(w, h) * 0.28)
  const body = `<rect width="${w}" height="${h}" fill="${SPLASH_BG}"/><svg x="${(w - icon) / 2}" y="${(h - icon) / 2}" width="${icon}" height="${icon}" viewBox="0 0 64 64">${svg.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>`
  writeFileSync(f, png(svgOf(`0 0 ${w} ${h}`, body, w, h), w, h))
}
console.log('Android icons and splash screens written from public/icon.svg')
