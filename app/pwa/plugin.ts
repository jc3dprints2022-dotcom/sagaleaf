// Vite plugin for the single-file build: turns dist-standalone/ into an
// installable PWA next to saga-reader.html.
//   - stamps a content hash into the app (import.meta.env.VITE_SAGA_BUILD) and the service worker
//   - adds the manifest link and iOS home-screen tags to the HTML
//   - writes saga-reader.webmanifest, sw.js and PNG icons rendered from public/icon.svg
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { Resvg } from '@resvg/resvg-js'
import { PRODUCT } from '../src/app/product'

export const BUILD_PLACEHOLDER = '__SAGA_BUILD_ID__'
export const MANIFEST = PRODUCT.page.replace(/\.html$/, '') + '.webmanifest'
const here = import.meta.dirname

const ICONS = [
  { file: 'icons/icon-192.png', size: 192, purpose: 'any', maskable: false },
  { file: 'icons/icon-512.png', size: 512, purpose: 'any', maskable: false },
  { file: 'icons/icon-maskable-192.png', size: 192, purpose: 'maskable', maskable: true },
  { file: 'icons/icon-maskable-512.png', size: 512, purpose: 'maskable', maskable: true },
]
const APPLE_ICON = 'icons/apple-touch-icon.png'

/** Full-bleed square for maskable/iOS icons: the artwork already sits inside the safe zone, so only the rounded corners go. */
const fullBleed = (svg: string) => svg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1')
const png = (svg: string, size: number) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

export function manifest() {
  return {
    id: PRODUCT.page,
    name: PRODUCT.name,
    short_name: PRODUCT.shortName,
    description: PRODUCT.description,
    start_url: PRODUCT.page,
    scope: PRODUCT.page,
    display: 'standalone',
    background_color: PRODUCT.backgroundColor,
    theme_color: PRODUCT.themeColor,
    categories: ['books', 'education', 'productivity'],
    icons: ICONS.map(i => ({ src: i.file, sizes: `${i.size}x${i.size}`, type: 'image/png', purpose: i.purpose })),
  }
}

export function sagaPwa(): Plugin {
  let outDir = ''
  return {
    name: 'saga-pwa',
    apply: 'build',
    enforce: 'post',
    config: () => ({ define: { 'import.meta.env.VITE_SAGA_BUILD': JSON.stringify(BUILD_PLACEHOLDER) } }),
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    transformIndexHtml: html => ({ html: html.replace(/<title>[^<]*<\/title>/, `<title>${PRODUCT.name}</title>`), tags: [
      { tag: 'link', attrs: { rel: 'manifest', href: MANIFEST }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: APPLE_ICON }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: PRODUCT.shortName }, injectTo: 'head' },
    ] }),
    writeBundle() {
      // Content hash of the built page, stamped back into it and into the worker.
      const htmlPath = join(outDir, 'index.html')
      const html = readFileSync(htmlPath, 'utf8')
      if (!html.includes(BUILD_PLACEHOLDER)) throw new Error('saga-pwa: build id placeholder missing from the HTML')
      const build = createHash('sha256').update(html).digest('hex').slice(0, 12)
      writeFileSync(htmlPath, html.replaceAll(BUILD_PLACEHOLDER, build))

      const svg = readFileSync(join(here, '..', 'public', 'icon.svg'), 'utf8')
      mkdirSync(join(outDir, 'icons'), { recursive: true })
      for (const i of ICONS) writeFileSync(join(outDir, i.file), png(i.maskable ? fullBleed(svg) : svg, i.size))
      writeFileSync(join(outDir, APPLE_ICON), png(fullBleed(svg), 180))
      writeFileSync(join(outDir, MANIFEST), JSON.stringify(manifest(), null, 2) + '\n')

      const assets = [MANIFEST, ...ICONS.map(i => i.file), APPLE_ICON]
      const sw = readFileSync(join(here, 'sw.js'), 'utf8')
        .replaceAll(BUILD_PLACEHOLDER, build)
        .replaceAll('__CACHE_PREFIX__', PRODUCT.shortName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-shell')
        .replaceAll('__PAGE__', PRODUCT.page)
        .replace('__ASSETS__', assets.map(a => JSON.stringify(a)).join(', '))
      writeFileSync(join(outDir, 'sw.js'), sw)
      writeFileSync(join(outDir, 'build-id.txt'), build + '\n')
      writeFileSync(join(outDir, 'published-files.json'), JSON.stringify(PUBLISHED_FILES))
    },
  }
}

/** Files publish:site copies to the repo root, besides the page itself. */
export const PUBLISHED_FILES = ['sw.js', MANIFEST, ...ICONS.map(i => i.file), APPLE_ICON]
