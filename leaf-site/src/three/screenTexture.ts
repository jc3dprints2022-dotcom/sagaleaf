/**
 * Concept e-paper screen: a grayscale 480 × 800 reading page drawn to a canvas.
 * This is NOT the device UI (firmware UI is in development); it is labelled as a concept screen.
 * Text: Jane Austen, Pride and Prejudice (1813), public domain.
 */
import * as THREE from 'three'

export interface ScreenState {
  /** 0 = first page, 1 = next page */
  page: number
  /** e-paper refresh flash, 0..1 (inverted frame while > 0.5) */
  flash: number
  /** 0 = default type, 1 = larger type */
  font: number
  /** 0..1 type menu visibility */
  menu: number
  /** 0..1 highlight sweep */
  highlight: number
  /** 0..1 note card */
  note: number
}

const PAGES = [
  [
    'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
    '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
    'Mr. Bennet replied that he had not.',
    '“But it is,” returned she; “for Mrs. Long has just been here, and she told me all about it.”',
  ],
  [
    'Mr. Bennet made no answer.',
    '“Do you not want to know who has taken it?” cried his wife impatiently.',
    '“You want to tell me, and I have no objection to hearing it.”',
    'This was invitation enough.',
    '“Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately.”',
  ],
]
/** The sentence that gets highlighted on page 2 (paragraph index, start, end in characters). */
const HL = { para: 4, from: 0, to: 140 }

export const SCREEN_PX = { w: 480, h: 800 }
const SCALE = 2 // drawn at 2× for a crisp close-up; the panel itself is 480 × 800

export function quantize(s: ScreenState) {
  return [
    s.page > 0.5 ? 1 : 0,
    s.flash > 0.5 ? 1 : 0,
    s.font > 0.5 ? 1 : 0,
    Math.round(s.menu * 4),
    Math.round(s.highlight * 12),
    Math.round(s.note * 4),
  ].join(',')
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' ')
  const lines: { text: string; start: number }[] = []
  let line = '', start = 0, cursor = 0
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push({ text: line, start })
      start = cursor
      line = w
    } else line = test
    cursor += w.length + 1
  }
  if (line) lines.push({ text: line, start })
  return lines
}

export function drawScreen(ctx: CanvasRenderingContext2D, s: ScreenState, serif: string, sans: string) {
  const W = SCREEN_PX.w * SCALE, H = SCREEN_PX.h * SCALE
  const inverted = s.flash > 0.5
  const ink = inverted ? '#f4f4f4' : '#141414'
  const bg = inverted ? '#111111' : '#ffffff'
  const grey = inverted ? '#9a9a9a' : '#6a6a6a'
  ctx.save()
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const page = s.page > 0.5 ? 1 : 0
  const big = s.font > 0.5
  const margin = (big ? 34 : 40) * SCALE
  const size = (big ? 23 : 19) * SCALE
  const lead = size * 1.5

  // header
  ctx.fillStyle = grey
  ctx.font = `500 ${11 * SCALE}px ${sans}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('PRIDE AND PREJUDICE', margin, 34 * SCALE)
  const ch = 'Chapter 1'
  ctx.fillText(ch, W - margin - ctx.measureText(ch).width, 34 * SCALE)
  ctx.fillRect(margin, 44 * SCALE, W - margin * 2, 1 * SCALE)

  // body
  ctx.font = `400 ${size}px ${serif}`
  let y = 80 * SCALE + size
  const maxW = W - margin * 2
  PAGES[page].forEach((para, pi) => {
    const lines = wrap(ctx, para, maxW - (pi === 0 ? 0 : 0))
    lines.forEach((ln, li) => {
      if (y > H - 70 * SCALE) return
      const indent = li === 0 && pi > 0 ? 18 * SCALE : 0
      // highlight underlay (grayscale, as e-paper would show it)
      if (page === 1 && pi === HL.para && s.highlight > 0.01) {
        const total = HL.to - HL.from
        const reveal = HL.from + total * Math.min(1, s.highlight)
        const a = Math.max(ln.start, HL.from), b = Math.min(ln.start + ln.text.length, reveal)
        if (b > a) {
          const x0 = margin + indent + ctx.measureText(ln.text.slice(0, a - ln.start)).width
          const x1 = margin + indent + ctx.measureText(ln.text.slice(0, b - ln.start)).width
          ctx.fillStyle = inverted ? '#555' : '#c8c8c8'
          ctx.fillRect(x0 - 2 * SCALE, y - size * 0.95, x1 - x0 + 4 * SCALE, size * 1.28)
        }
      }
      ctx.fillStyle = ink
      ctx.fillText(ln.text, margin + indent, y)
      y += lead
    })
    y += size * 0.35
  })

  // footer
  ctx.fillStyle = grey
  ctx.font = `500 ${11 * SCALE}px ${sans}`
  const foot = page ? '2 / 312' : '1 / 312'
  ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, H - 26 * SCALE)

  // note card
  if (s.note > 0.01) {
    const a = Math.min(1, s.note)
    const ch2 = 150 * SCALE
    const top = H - 60 * SCALE - ch2 * a
    ctx.fillStyle = bg
    ctx.fillRect(0, top - 6 * SCALE, W, H - top)
    ctx.fillStyle = ink
    ctx.fillRect(margin * 0.6, top, W - margin * 1.2, 2 * SCALE)
    ctx.font = `600 ${12 * SCALE}px ${sans}`
    ctx.fillText('NOTE', margin * 0.6, top + 30 * SCALE)
    ctx.font = `italic 400 ${17 * SCALE}px ${serif}`
    const lines = wrap(ctx, 'Mrs. Bennet’s news arrives before the man does. The whole novel in one breath.', W - margin * 1.2)
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l.text, margin * 0.6, top + (60 + i * 26) * SCALE))
  }

  // type menu (concept)
  if (s.menu > 0.01) {
    const a = Math.min(1, s.menu)
    const mh = 120 * SCALE
    const top = H - mh * a
    ctx.fillStyle = bg
    ctx.fillRect(0, top, W, mh)
    ctx.fillStyle = ink
    ctx.fillRect(0, top, W, 2 * SCALE)
    ctx.font = `600 ${12 * SCALE}px ${sans}`
    ctx.fillText('TYPE', margin * 0.6, top + 30 * SCALE)
    const opts = ['Aa  Size', big ? '4' : '3']
    ctx.font = `400 ${22 * SCALE}px ${serif}`
    ctx.fillText(opts[0], margin * 0.6, top + 74 * SCALE)
    ctx.font = `600 ${22 * SCALE}px ${sans}`
    const label = `‹  ${opts[1]}  ›`
    ctx.fillText(label, W - margin * 0.6 - ctx.measureText(label).width, top + 74 * SCALE)
    ctx.font = `400 ${12 * SCALE}px ${sans}`
    ctx.fillStyle = grey
    ctx.fillText('PREV / NEXT to change · SELECT to close', margin * 0.6, top + 104 * SCALE)
  }
  ctx.restore()
}

export interface ScreenCanvas {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  update(s: ScreenState): boolean
  dispose(): void
}

export function readFonts() {
  const cs = getComputedStyle(document.documentElement)
  const serif = cs.getPropertyValue('--font-literata').trim() || 'Georgia, serif'
  const sans = cs.getPropertyValue('--font-hanken').trim() || 'system-ui, sans-serif'
  return { serif, sans }
}

export function createScreenCanvas(initial: ScreenState): ScreenCanvas {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_PX.w * SCALE
  canvas.height = SCREEN_PX.h * SCALE
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let key = ''
  let fonts = readFonts()
  let last = { ...initial }
  const update = (s: ScreenState) => {
    last = { ...s }
    const k = quantize(s)
    if (k === key) return false
    key = k
    drawScreen(ctx, s, fonts.serif, fonts.sans)
    texture.needsUpdate = true
    return true
  }
  update(initial)
  // Redraw once the web fonts are ready so the page isn't stuck in a fallback face.
  document.fonts?.ready.then(() => { fonts = readFonts(); key = ''; update(last) })
  return { canvas, texture, update, dispose: () => texture.dispose() }
}
