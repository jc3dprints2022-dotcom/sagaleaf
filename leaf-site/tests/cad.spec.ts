import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openScene, scrubTo, offline, ORIGIN } from './helpers'
import { PHONE_SCREENS } from '../src/three/timeline'

const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'models', 'leaf.parts.json'), 'utf8'))
const GROUPS = ['bezel', 'panel', 'pcb', 'battery', 'ring', 'tray', 'skin', 'buttons'] as const
const BUTTONS = ['btn-back', 'btn-prev', 'btn-select', 'btn-next'] as const
/** The assembly's bounding box from the manifest (union of the eight group boxes), in mm. */
const BOX = GROUPS.reduce((acc, g) => ({
  min: acc.min.map((v: number, i: number) => Math.min(v, manifest.groups[g].bbox_mm.min[i])),
  max: acc.max.map((v: number, i: number) => Math.max(v, manifest.groups[g].bbox_mm.max[i])),
}), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
const leaf = <T>(page: Page, fn: string) => page.evaluate(new Function(`return (async () => { const L = window.__leaf; ${fn} })()`) as () => Promise<T>)

test('manifest sanity: the assembly box is the one the task states', () => {
  expect(BOX.min).toEqual([-0.75, -0.75, -0.6])
  expect(BOX.max).toEqual([63.44, 101.27, 7.87])
})

test('1. GLB contract: groups, buttons, bounding box and screen UVs', async ({ page }) => {
  await openScene(page, '/leaf/shop/')
  const glb = await leaf<any>(page, `return L.inspectGlb('/leaf/models/leaf.glb')`)
  for (const name of [...GROUPS, ...BUTTONS, 'leaf', 'screen']) expect(glb.nodes, `node ${name}`).toContain(name)
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(glb.bbox.min[i] - BOX.min[i]), `bbox min[${i}] ${glb.bbox.min[i]}`).toBeLessThanOrEqual(0.05)
    expect(Math.abs(glb.bbox.max[i] - BOX.max[i]), `bbox max[${i}] ${glb.bbox.max[i]}`).toBeLessThanOrEqual(0.05)
  }
  expect(glb.screenUv).toMatchObject({ count: 4, min: [0, 0], max: [1, 1] })
  expect(glb.bytes).toBe(readFileSync(join(__dirname, '..', 'public', 'models', 'leaf.glb')).byteLength)
  // every part node in the manifest exists in the file, each wrapping its `-mesh` child
  for (const g of GROUPS) for (const m of manifest.groups[g].meshes) {
    expect(glb.nodes).toContain(m.node)
    expect(glb.nodes).toContain(`${m.node}-mesh`)
  }
})

for (const path of ['/leaf/', '/leaf/shop/'] as const) {
  test(`2. CAD in use on ${path}: the scene draws the GLB, not the procedural model`, async ({ page }) => {
    await openScene(page, path)
    const info = await leaf<any>(page, `return { kind: L.kind, names: L.meshNames(), bbox: L.bboxMm(), uv: L.screenUv(), load: L.load }`)
    expect(info.kind).toBe('cad')
    expect(info.names).toContain('rear-skin-mesh')
    expect(info.names).toContain('screen-mesh')
    for (const procedural of ['skin-floor', 'skin-walls', 'tray-floor', 'tray-walls', 'usb-opening']) expect(info.names).not.toContain(procedural)
    expect(info.uv).toMatchObject({ count: 4, min: [0, 0], max: [1, 1] })
    expect(info.load.bytes).toBeGreaterThan(50_000)
    if (path === '/leaf/shop/') for (let i = 0; i < 3; i++) {
      expect(Math.abs(info.bbox.min[i] - BOX.min[i])).toBeLessThanOrEqual(0.05)
      expect(Math.abs(info.bbox.max[i] - BOX.max[i])).toBeLessThanOrEqual(0.05)
    }
    expect(await page.evaluate(() => document.documentElement.dataset.leafModel ?? document.querySelector<HTMLElement>('[data-testid=preview]')?.dataset.ready)).toBe('cad')
  })
}

function expectExploded(groups: any, buttonsX: any) {
  // front to back along z
  const z = GROUPS.filter(g => g !== 'buttons').map(g => groups[g].centerZ)
  for (let i = 1; i < z.length; i++) expect(z[i - 1], `${GROUPS[i - 1]} is in front of ${GROUPS[i]}`).toBeGreaterThan(z[i])
  // button caps are outside the shell's x-range (the core body: 0 … tray max x)
  const x1 = manifest.groups.tray.bbox_mm.max[0]
  for (const b of ['btn-back', 'btn-prev']) expect(buttonsX[b][1], `${b} left of the shell`).toBeLessThan(0)
  for (const b of ['btn-select', 'btn-next']) expect(buttonsX[b][0], `${b} right of the shell`).toBeGreaterThan(x1)
}
function expectAssembled(groups: any, buttonsX: any) {
  for (const g of GROUPS) {
    for (const v of [...groups[g].offset, ...groups[g].rotation]) expect(Math.abs(v), `${g} offset`).toBeLessThan(1e-6)
    const b = manifest.groups[g].bbox_mm
    expect(Math.abs(groups[g].centerZ - (b.min[2] + b.max[2]) / 2), `${g} at its CAD z`).toBeLessThanOrEqual(0.05)
  }
  for (const b of BUTTONS) {
    const box = manifest.groups.buttons.meshes.find((m: any) => m.node === b).bbox_mm
    expect(Math.abs(buttonsX[b][0] - box.min[0])).toBeLessThanOrEqual(0.05)
    expect(Math.abs(buttonsX[b][1] - box.max[0])).toBeLessThanOrEqual(0.05)
  }
}

test('3. explode: CAD positions at 0, ordered front to back at 1, caps outside the shell', async ({ page }) => {
  await openScene(page, '/leaf/shop/')
  const at = (t: number) => leaf<any>(page, `L.explode(${t}); return { groups: L.groups(), buttonsX: L.buttonsX() }`)
  const zero = await at(0)
  expectAssembled(zero.groups, zero.buttonsX)
  const full = await at(1)
  expectExploded(full.groups, full.buttonsX)
  const back = await at(0)
  expectAssembled(back.groups, back.buttonsX)
})

test('3b. explode on the homepage: exploded in the hero, every group home when the assembly ends', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openScene(page, '/leaf/')
  const read = () => leaf<any>(page, `return { groups: L.groups(), buttonsX: L.buttonsX() }`)
  await scrubTo(page, 0)
  const hero = await read()
  expectExploded(hero.groups, hero.buttonsX)
  await scrubTo(page, 0.245) // assembly runs 6–24 on the 0–100 timeline
  const done = await read()
  expectAssembled(done.groups, done.buttonsX)
})

test('4. finish: Slate and Copper recolour rear-skin only', async ({ browser }) => {
  // reduced motion makes the swap immediate (no detach animation), so the colour can be read at once
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await openScene(page, '/leaf/shop/')
  const colors = () => leaf<Record<string, string>>(page, `return L.colors()`)
  const copper = await colors()
  expect(copper['rear-skin-mesh']).toBe('#b8663a')
  await page.getByLabel(/Slate/).check()
  await expect.poll(async () => (await colors())['rear-skin-mesh']).toBe('#45484e')
  const slate = await colors()
  for (const [name, c] of Object.entries(slate)) if (name !== 'rear-skin-mesh') expect(c, `${name} unchanged by Slate`).toBe(copper[name])
  await page.getByLabel(/Copper/).check()
  await expect.poll(async () => (await colors())['rear-skin-mesh']).toBe('#b8663a')
  expect(await colors()).toEqual(copper)
  await ctx.close()
})

test('4b. finish with motion: the skin detaches, changes colour and comes back to its CAD position', async ({ page }) => {
  await openScene(page, '/leaf/shop/')
  await page.getByLabel(/Slate/).check()
  await expect.poll(() => leaf<string>(page, `return L.colors()['rear-skin-mesh']`), { timeout: 10_000 }).toBe('#45484e')
  await expect.poll(() => leaf<number>(page, `const s = L.groups().skin; return Math.max(...s.offset.map(Math.abs), ...s.rotation.map(Math.abs))`), { timeout: 10_000 }).toBeLessThan(1e-6)
  await expect(page.getByText('Showing the Slate rear skin')).toBeAttached()
})

test('5. screenshots are real: the phone and the static strip only use /leaf/app/real/', async ({ page, request, browser }) => {
  // (a) the ecosystem phone: every texture it requests while the story plays through
  const requested: string[] = []
  page.on('request', r => { if (/\/leaf\/app\//.test(r.url())) requested.push(new URL(r.url()).pathname) })
  await page.setViewportSize({ width: 1280, height: 800 })
  await openScene(page, '/leaf/')
  await scrubTo(page, 0.78)
  await expect.poll(() => requested.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(PHONE_SCREENS.length)
  expect([...new Set(requested)].sort()).toEqual(PHONE_SCREENS.map(s => `/leaf/${s.file}`).sort())
  expect(PHONE_SCREENS.map(s => s.file)).toEqual(['library', 'reader-highlighted', 'typography', 'discover', 'settings'].map(n => `app/real/phone-${n}.webp`))
  // (b) the static strip (reduced-motion path) and every other app image on the site
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const p2 = await ctx.newPage()
  const all = new Set<string>()
  for (const path of ['/leaf/', '/leaf/shop/saga-leaf/', '/leaf/support/']) {
    await p2.goto(ORIGIN + path)
    const srcs = await p2.$$eval('img', els => els.map(e => e.getAttribute('src')!).filter(s => /\/app\//.test(s)))
    if (path === '/leaf/') {
      const strip = await p2.getByTestId('app-strip').locator('img').evaluateAll(els => els.map(e => e.getAttribute('src')))
      expect(strip).toEqual(PHONE_SCREENS.map(s => `/leaf/${s.file}`))
    }
    expect(srcs.length).toBeGreaterThan(0)
    for (const s of srcs) { expect(s, `${path} app image`).toMatch(/^\/leaf\/app\/real\/(phone|tablet)-[a-z-]+\.webp$/); all.add(s) }
    // every <img> on the page has real dimensions and alt text; below-the-fold ones are lazy
    const imgs = await p2.$$eval('img', els => els.map(e => ({ src: e.getAttribute('src'), w: e.getAttribute('width'), h: e.getAttribute('height'), alt: e.getAttribute('alt'), lazy: e.loading === 'lazy', hidden: e.closest('[aria-hidden=true]') !== null })))
    for (const i of imgs) {
      expect(Number(i.w), `${i.src} width`).toBeGreaterThan(0)
      expect(Number(i.h), `${i.src} height`).toBeGreaterThan(0)
      if (!i.hidden) expect((i.alt ?? '').length, `${i.src} alt`).toBeGreaterThan(15)
      if (/\/app\/real\//.test(i.src!)) expect(i.lazy, `${i.src} lazy`).toBe(true)
    }
  }
  for (const s of [...all, ...PHONE_SCREENS.map(s => `/leaf/${s.file}`)]) expect((await request.get(ORIGIN + s)).status(), s).toBe(200)
  await ctx.close()
})

test('6. labels: concept screen, concept finishes, CAD estimates, no "Concept render"', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openScene(page, '/leaf/')
  // device-screen beat
  await scrubTo(page, 0.6)
  await expect(page.locator('[data-badge=screen]')).toBeVisible()
  await expect(page.locator('[data-badge=screen]')).toHaveText('Concept screen: device UI in development')
  await expect(page.locator('[data-badge=render]')).toBeHidden()
  // a CAD-rendered beat
  await scrubTo(page, 0.3)
  await expect(page.locator('[data-badge=render] .badge-cad')).toBeVisible()
  await expect(page.locator('[data-badge=render] .badge-cad')).toHaveText('Rendered from rev 4 CAD')
  await expect(page.locator('[data-badge=render] .badge-fallback')).toBeHidden()

  // finishes carry a concept label
  await page.goto('/leaf/shop/')
  await expect(page.getByTestId('finish-note')).toContainText(/concept finishes/i)
  await expect(page.getByText('Concept configurator.')).toBeVisible()
  await expect(page.getByTestId('preview').locator('.concept-badge')).toContainText(/Rendered from rev 4 CAD · concept finish/i)

  // static path too (all copy visible at once)
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const p2 = await ctx.newPage()
  for (const path of ['/leaf/', '/leaf/shop/', '/leaf/shop/saga-leaf/', '/leaf/cart/', '/leaf/support/']) {
    await p2.goto(ORIGIN + path)
    const html = await p2.content()
    expect(html, `${path}: no "Concept render"`).not.toMatch(/concept render/i)
    if (path === '/leaf/') {
      await expect(p2.locator('[data-beat=screen] figcaption')).toHaveText('Concept screen: device UI in development')
      await expect(p2.locator('footer')).toContainText('rendered from the rev 4 CAD model')
      await expect(p2.locator('footer')).toContainText('CAD estimates, not measurements')
    }
    if (path === '/leaf/' || path === '/leaf/shop/saga-leaf/') {
      // Every block of text that states the device's size, thickness, corner radius or weight
      // must say it is an estimate. (Part figures such as the panel's datasheet active area or
      // the 0.8 mm PCB are covered below: on the spec page each sits in a row with a status tag.)
      const blocks = await p2.$$eval('li, tr, p, figcaption, dd', els => els.map(e => (e as HTMLElement).innerText.replace(/\s+/g, ' ')))
      const DEVICE = /\d+(\.\d+)? × \d+(\.\d+)? × \d+(\.\d+)? mm|mm thin|\b\d+ g\b|Corner radius|\bThickness\b/
      const hits = blocks.filter(b => DEVICE.test(b))
      expect(hits.length, `${path} has device dimension strings`).toBeGreaterThan(0)
      for (const b of hits) expect(b, `${path}: device dimension states its basis`).toMatch(/CAD estimate|estimated/i)
    }
    if (path === '/leaf/shop/saga-leaf/') {
      const rows = await p2.$$eval('tr[data-spec]', els => els.map(e => (e as HTMLElement).innerText.replace(/\s+/g, ' ')))
      for (const r of rows.filter(r => /\d mm\b/.test(r))) expect(r, 'mm figure carries a status').toMatch(/CAD estimate|ESTIMATED|DATASHEET|CONFIRMED/i)
    }
  }
  await ctx.close()
})

for (const vp of [{ width: 1600, height: 900, name: '16:9' }, { width: 1440, height: 900, name: '16:10' }, { width: 390, height: 844, name: '390 × 844' }]) {
  test(`screen push-in ends with the screen quad exactly filling the viewport (${vp.name})`, async ({ page }) => {
    await page.setViewportSize(vp)
    await openScene(page, '/leaf/')
    await scrubTo(page, 0.6) // push-in runs 51.4–55 on the 0–100 timeline; 60 is well after it
    const r = await leaf<any>(page, `return L.screenRect()`)
    const wide = vp.width / vp.height > 0.6
    if (wide) {
      // the quad is narrower than the viewport: its height fills the viewport exactly
      expect(Math.abs(r.top)).toBeLessThanOrEqual(1)
      expect(Math.abs(r.bottom - vp.height)).toBeLessThanOrEqual(1)
      expect(r.left).toBeGreaterThanOrEqual(-1)
      expect(r.right).toBeLessThanOrEqual(vp.width + 1)
    } else {
      // the quad is wider than the viewport: its width fills the viewport exactly, top edge flush
      expect(Math.abs(r.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(r.right - vp.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(r.top)).toBeLessThanOrEqual(1)
    }
    expect(Math.abs(r.width / r.height - 51.84 / 86.4)).toBeLessThan(0.002)
  })
}

for (const path of ['/leaf/', '/leaf/shop/'] as const) {
  test(`8. fallback on ${path}: with leaf.glb blocked the page still renders, no errors, no blank canvas`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('console', m => {
      if (m.type() !== 'error') return
      // Chromium itself logs the request we aborted on purpose; anything else is a real error.
      if (/Failed to load resource/.test(m.text()) && /leaf\.glb/.test(m.location().url)) return
      errors.push(`console.error: ${m.text()}`)
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await openScene(page, path, { abortGlb: true })
    const info = await leaf<any>(page, `return { kind: L.kind, names: L.meshNames() }`)
    expect(info.kind).toBe('procedural')
    expect(info.names).toContain('skin-floor')
    expect(info.names).not.toContain('rear-skin-mesh')
    // the label follows the model actually on screen
    if (path === '/leaf/') await expect(page.locator('[data-badge=render] .badge-fallback')).toBeVisible()
    else await expect(page.getByTestId('preview').locator('.concept-badge')).toContainText('Concept model')
    // not blank: the canvas has many distinct colours and the poster is still underneath
    await page.waitForTimeout(600)
    const shot = await page.locator('canvas').first().screenshot()
    const colours = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
      const c = document.createElement('canvas'); c.width = 160; c.height = 100
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, 160, 100)
      const d = ctx.getImageData(0, 0, 160, 100).data, set = new Set<number>()
      for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3)
      return set.size
    }, shot.toString('base64'))
    expect(colours, 'canvas is not blank').toBeGreaterThan(40)
    await expect(page.locator(path === '/leaf/' ? 'img.stage-poster' : '[data-testid=preview] img')).toBeAttached()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('page stays scrollable and readable before 3D loads', async ({ page }) => {
  await offline(page)
  // hold the model back: the poster must carry the stage and the copy must be there
  await page.route('**/models/leaf.glb', async r => { await new Promise(res => setTimeout(res, 4000)); await r.continue() })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/leaf/')
  await expect(page.getByRole('heading', { level: 1, name: 'SAGA Leaf' })).toBeVisible()
  await expect(page.locator('img.stage-poster')).toBeVisible()
  expect(await page.locator('img.stage-poster').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await page.waitForFunction(() => !!(window as any).__leafStory)
  await page.mouse.wheel(0, 1600)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(800)
  expect(await page.evaluate(() => document.documentElement.classList.contains('stage-ready'))).toBe(false)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.stage-canvas')!).opacity)).toBe('0')
  await page.waitForFunction(() => document.documentElement.classList.contains('stage-ready'), null, { timeout: 60_000 })
})
