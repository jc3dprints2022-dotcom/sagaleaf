import { inlineSubresources, installBlobRegistry } from './fileUrls'
// Rendering engines behind one interface. The Reader UI never talks to
// foliate-js or pdf.js directly, so a native client can swap engines later.
import type { ReaderPrefs } from '../../core/types'
import { rangeToOffsets, offsetsToRange, snippetAt, findQuote, collapse } from '../../core/anchor'

export interface Loc { section: number; offset: number; fraction: number; cfi?: string; snippet: string; label: string; sectionFraction?: number }
export interface Sel { section: number; start: number; end: number; text: string; cfi?: string; rect: DOMRect }
export interface TocItem { label: string; target: string | number; depth: number; section?: number }
export interface Mark { id: string; section: number; start: number; end: number; exact: string; prefix: string; suffix: string; cfi?: string; color: string; kind: string }
export interface EngineEvents {
  relocate: (l: Loc) => void
  select: (s: Sel | null) => void
  tap: (zone: 'prev' | 'next' | 'center') => void
  markClick: (id: string) => void
  key: (e: KeyboardEvent) => void
  resolved: (id: string, patch: { section: number; start: number; end: number; cfi?: string; orphaned?: boolean }) => void
}
export interface Engine {
  toc: TocItem[]
  next(): Promise<void>
  prev(): Promise<void>
  goToFraction(f: number): Promise<void>
  goToTarget(t: string | number): Promise<void>
  goToOffset(section: number, start: number, end?: number, select?: boolean): Promise<void>
  setMarks(marks: Mark[]): void
  applyPrefs(p: ReaderPrefs, theme: ReaderTheme): void
  location(): Loc | null
  clearSelection(): void
  destroy(): void
}

export interface ReaderTheme { id: string; bg: string; fg: string; muted: string; accent: string; dark: boolean }
export const THEMES: Record<string, ReaderTheme> = {
  day: { id: 'day', bg: '#fbfbf8', fg: '#1d2326', muted: '#5d686c', accent: '#24695c', dark: false },
  warm: { id: 'warm', bg: '#f4e9d3', fg: '#3b2f22', muted: '#6e5d47', accent: '#7a4e24', dark: false },
  mist: { id: 'mist', bg: '#e6e8e3', fg: '#222826', muted: '#575e5b', accent: '#235b51', dark: false },
  night: { id: 'night', bg: '#121517', fg: '#c8cfcb', muted: '#8f9a96', accent: '#6fbcab', dark: true },
}
export const FONTS: Record<string, string> = {
  Literata: "'Literata Variable', Georgia, serif",
  Newsreader: "'Newsreader Variable', Georgia, serif",
  Georgia: 'Georgia, "Times New Roman", serif',
  'Atkinson Hyperlegible': "'Atkinson Hyperlegible', system-ui, sans-serif",
  OpenDyslexic: "'OpenDyslexic', sans-serif",
  System: 'system-ui, -apple-system, "Segoe UI", sans-serif',
}

function fontFaces() {
  // The book iframe doesn't inherit our @font-face rules; re-declare the ones the reader offers.
  const rules: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try { for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSFontFaceRule && /Literata|Newsreader|Atkinson|OpenDyslexic/.test(r.cssText)) rules.push(r.cssText.replace(/url\("?(\/[^")]+)"?\)/g, (_m, u) => `url("${location.origin}${u}")`)) } catch { /* cross-origin sheet */ }
  }
  return rules.join('\n')
}

export function bookCss(p: ReaderPrefs, t: ReaderTheme) {
  const font = FONTS[p.font] ?? FONTS.Literata
  const force = !p.publisherStyles
  return `
${fontFaces()}
@namespace epub "http://www.idpf.org/2007/ops";
html { color-scheme: ${t.dark ? 'dark' : 'light'}; font-size: ${p.size}px !important; }
html, body { background: transparent !important; color: ${t.fg} !important; }
body { ${force ? `font-family: ${font} !important;` : ''} -webkit-font-smoothing: antialiased; font-kerning: normal; font-variant-ligatures: common-ligatures; }
${force ? `body *:not(code):not(pre):not(kbd):not(samp) { font-family: inherit !important; }` : ''}
p, li, blockquote, dd, div { line-height: ${p.lineHeight} !important; }
p { text-align: ${p.justify ? 'justify' : 'start'} !important; hyphens: ${p.hyphenate ? 'auto' : 'manual'} !important; -webkit-hyphens: ${p.hyphenate ? 'auto' : 'manual'} !important; widows: 2; orphans: 2; }
${force ? `h1, h2, h3, h4 { line-height: 1.25 !important; color: ${t.fg} !important; }` : ''}
a, a:visited { color: ${t.accent} !important; }
img, svg, video { max-width: 100% !important; height: auto; ${t.dark ? 'filter: brightness(.9);' : ''} }
${t.dark ? 'img[src$=".svg"], svg { filter: invert(.88) hue-rotate(180deg); }' : ''}
aside[epub|type~="footnote"], aside[epub|type~="endnote"] { display: none; }
::selection { background: ${t.dark ? 'rgba(111,188,171,.35)' : 'rgba(44,122,107,.24)'}; }
pre, code { white-space: pre-wrap; font-size: .88em; }
table { max-width: 100%; }
`
}

// ------------------------------------------------------------------ EPUB (foliate-js)
type FView = HTMLElement & {
  book: { toc?: { label: string; href: string; subitems?: unknown[] }[]; sections: unknown[] }
  renderer: HTMLElement & { setStyles(css: string): void; goTo(t: { index: number; anchor?: (d: Document) => Range | number }): Promise<void>; getContents(): { doc: Document; index: number }[]; next(): Promise<void>; prev(): Promise<void> }
  open(file: File): Promise<void>; init(o: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  next(): Promise<void>; prev(): Promise<void>; goTo(t: string | number): Promise<unknown>; goToFraction(f: number): Promise<void>
  getCFI(index: number, range: Range): string; addAnnotation(a: { value: string }, remove?: boolean): Promise<unknown>; deleteAnnotation(a: { value: string }): Promise<unknown>
  deselect(): void; close(): void; lastLocation?: unknown
}

export async function createEpubEngine(host: HTMLElement, file: File, ev: EngineEvents, start: { cfi?: string; section?: number; offset?: number } | null): Promise<Engine> {
  const { makeBook } = await import('foliate-js/view.js') as unknown as { makeBook: (f: File) => Promise<{ transformTarget?: EventTarget }> }
  const { Overlayer } = await import('foliate-js/overlayer.js')
  installBlobRegistry()
  const view = document.createElement('foliate-view') as FView
  view.style.cssText = 'display:block;width:100%;height:100%'
  host.append(view)
  const book = await makeBook(file)
  inlineSubresources(book)
  await view.open(book as unknown as File)
  let loc: Loc | null = null
  let marks: Mark[] = []
  const byCfi = new Map<string, Mark>()
  const drawn = new Set<string>()
  let flow: 'paginated' | 'scrolled' = 'paginated'

  const docOf = (index: number) => view.renderer.getContents().find(c => c.index === index)?.doc

  view.addEventListener('relocate', (e: Event) => {
    const d = (e as CustomEvent).detail
    const range: Range | undefined = d.range
    let section = d.section?.current ?? 0, offset = 0, snippet = ''
    if (range) {
      const content = view.renderer.getContents().find(c => c.doc === range.startContainer.ownerDocument)
      if (content) {
        section = content.index
        try { offset = rangeToOffsets(content.doc.body, range).start; snippet = snippetAt(content.doc.body.textContent ?? '', offset) } catch { /* range outside body */ }
      }
    }
    loc = { section, offset, fraction: d.fraction ?? 0, cfi: d.cfi, snippet, label: d.tocItem?.label?.trim() ?? '', sectionFraction: d.section ? undefined : undefined }
    ev.relocate(loc)
  })

  view.addEventListener('load', (e: Event) => {
    const { doc, index } = (e as CustomEvent).detail as { doc: Document; index: number }
    let selTimer: ReturnType<typeof setTimeout>
    const report = () => {
      clearTimeout(selTimer)
      selTimer = setTimeout(() => {
        const s = doc.getSelection()
        if (!s || s.isCollapsed || !s.toString().trim()) return ev.select(null)
        const range = s.getRangeAt(0)
        if (!doc.body.contains(range.commonAncestorContainer)) return
        const { start, end } = rangeToOffsets(doc.body, range)
        const r = range.getBoundingClientRect()
        const f = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
        const rect = new DOMRect((f?.left ?? 0) + r.left, (f?.top ?? 0) + r.top, r.width, r.height)
        ev.select({ section: index, start, end, text: range.toString(), cfi: view.getCFI(index, range), rect })
      }, 180)
    }
    doc.addEventListener('selectionchange', report)
    doc.addEventListener('keydown', k => ev.key(k))
    doc.addEventListener('click', ce => {
      const t = ce.target as Element
      if (t.closest?.('a[href]')) return
      if (doc.getSelection()?.toString().trim()) return
      const f = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
      const x = (f?.left ?? 0) + ce.clientX
      const w = host.getBoundingClientRect()
      const rel = (x - w.left) / w.width
      ev.tap(flow === 'scrolled' ? 'center' : rel < 0.28 ? 'prev' : rel > 0.72 ? 'next' : 'center')
    })
  })

  // Place marks in a section. Uses the CFI if present and still valid, else
  // offsets, else the quote. Anything placed differently is reported back.
  const place = (m: Mark, index: number): string | null => {
    const doc = docOf(index)
    if (!doc) return m.cfi ?? null
    const body = doc.body
    const text = body.textContent ?? ''
    const ok = (s: number, e: number) => collapse(text.slice(s, e)).text.trim() === collapse(m.exact).text.trim()
    let s = m.start, e = m.end
    if (m.section !== index || !ok(s, e)) {
      const hit = findQuote([text], m, { section: 0, start: m.start })
      if (!hit) { ev.resolved(m.id, { section: m.section, start: m.start, end: m.end, orphaned: true }); return null }
      s = hit.start; e = hit.end
    }
    const range = offsetsToRange(body, s, e)
    if (!range) return null
    const cfi = view.getCFI(index, range)
    if (cfi !== m.cfi || s !== m.start || e !== m.end || m.section !== index) ev.resolved(m.id, { section: index, start: s, end: e, cfi, orphaned: false })
    return cfi
  }

  view.addEventListener('create-overlay', (e: Event) => {
    const { index } = (e as CustomEvent).detail
    for (const m of marks) if (m.section === index && m.kind !== 'bookmark') {
      const cfi = place(m, index)
      if (!cfi) continue
      byCfi.set(cfi, m); drawn.add(m.id)
      view.addAnnotation({ value: cfi })
    }
  })
  view.addEventListener('draw-annotation', (e: Event) => {
    const { draw, annotation } = (e as CustomEvent).detail
    const m = byCfi.get(annotation.value)
    if (!m) return
    draw(Overlayer.highlight, { color: HEX[m.color] ?? HEX.amber })
  })
  view.addEventListener('show-annotation', (e: Event) => {
    const m = byCfi.get((e as CustomEvent).detail.value)
    if (m) ev.markClick(m.id)
  })
  view.addEventListener('external-link', (e: Event) => { e.preventDefault(); const href = (e as CustomEvent).detail.href; if (confirm(`Open ${href} in your browser?`)) window.open(href, '_blank', 'noopener') })

  const toc: TocItem[] = []
  const walk = (items: { label: string; href: string; subitems?: unknown[] }[] | undefined, depth: number) => { for (const it of items ?? []) { toc.push({ label: it.label?.trim() || 'Untitled', target: it.href, depth }); walk(it.subitems as typeof items, depth + 1) } }
  walk(view.book.toc, 0)

  const goToOffset = async (section: number, start: number, end?: number, select?: boolean) => {
    await view.renderer.goTo({ index: section, anchor: (doc: Document) => offsetsToRange(doc.body, start, end ?? start + 1) ?? 0 })
    if (select && end != null) {
      const doc = docOf(section)
      const r = doc && offsetsToRange(doc.body, start, end)
      if (doc && r) { const s = doc.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
    }
  }

  if (start?.cfi) await view.init({ lastLocation: start.cfi })
  else if (start?.section != null) { await view.init({ showTextStart: false }); await goToOffset(start.section, start.offset ?? 0) }
  else await view.init({ showTextStart: true })

  // foliate ignores turns for ~100 ms after each one; queue them instead of
  // dropping a quick second tap (capped so a held key can't run away).
  let queue: number[] = [], turning: Promise<void> | null = null
  const idle = async () => { while (turning) await turning }
  const turn = async (dir: number) => {
    if (queue.length < 2) queue.push(dir)
    if (turning) return
    turning = (async () => { try { while (queue.length) { const d = queue.shift()!; await (d > 0 ? view.next() : view.prev()) } } finally { turning = null } })()
    await turning
  }
  return {
    toc,
    next: () => turn(1), prev: () => turn(-1),
    goToFraction: async f => { queue = []; await idle(); await view.goToFraction(f) },
    goToTarget: async t => { queue = []; await idle(); await view.goTo(t as string) },
    goToOffset: async (section, start, end, select) => { queue = []; await idle(); await goToOffset(section, start, end, select) },
    setMarks(next) {
      // remove stale
      for (const [cfi, m] of [...byCfi]) if (!next.find(n => n.id === m.id && n.color === m.color && n.start === m.start)) { view.deleteAnnotation({ value: cfi }); byCfi.delete(cfi); drawn.delete(m.id) }
      marks = next
      for (const c of view.renderer.getContents()) for (const m of marks) if (m.section === c.index && m.kind !== 'bookmark' && !drawn.has(m.id)) {
        const cfi = place(m, c.index)
        if (!cfi) continue
        byCfi.set(cfi, m); drawn.add(m.id); view.addAnnotation({ value: cfi })
      }
    },
    applyPrefs(p, t) {
      flow = p.flow
      const r = view.renderer
      r.setAttribute('flow', p.flow)
      r.setAttribute('gap', `${p.margin}%`)
      r.setAttribute('margin', '48px')
      r.setAttribute('max-inline-size', `${p.maxWidth}px`)
      r.setAttribute('max-column-count', p.maxWidth > 760 ? '2' : '1')
      r.setStyles(bookCss(p, t))
    },
    location: () => loc,
    clearSelection() { for (const c of view.renderer.getContents()) c.doc.getSelection()?.removeAllRanges(); ev.select(null) },
    destroy() { try { view.close() } catch { /* already closed */ } view.remove() },
  }
}
const HEX: Record<string, string> = { amber: '#f2d27a', sage: '#a9d39c', sky: '#a6cbe8', rose: '#efb3ba' }

// ------------------------------------------------------------------ PDF (pdf.js)
export async function createPdfEngine(host: HTMLElement, bytes: Uint8Array, ev: EngineEvents, start: { section?: number } | null): Promise<Engine> {
  const { openPdf, pdfjs } = await import('../../core/pdf')
  await import('pdfjs-dist/web/pdf_viewer.css')
  const lib = await pdfjs()
  const doc = await openPdf(bytes)
  const n = doc.numPages
  let page = Math.min(n - 1, Math.max(0, start?.section ?? 0))
  let zoom = 1
  let marks: Mark[] = []
  let theme: ReaderTheme = THEMES.day
  const wrap = document.createElement('div')
  wrap.className = 'pdf-wrap'
  wrap.style.cssText = 'position:absolute;inset:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:56px 16px 72px'
  host.append(wrap)
  const stage = document.createElement('div')
  stage.style.cssText = 'position:relative;box-shadow:0 4px 30px -10px rgba(0,0,0,.35);background:#fff'
  wrap.append(stage)
  let textDiv: HTMLDivElement | null = null
  let renderSeq = 0
  const pageTexts = new Map<number, string>()

  const toc: TocItem[] = []
  try {
    const outline = await doc.getOutline()
    const walk = async (items: typeof outline, depth: number) => {
      for (const it of items ?? []) {
        let idx: number | undefined
        try { const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest; if (dest?.[0]) idx = await doc.getPageIndex(dest[0]) } catch { /* unresolvable */ }
        if (idx != null) toc.push({ label: it.title, target: idx, depth, section: idx })
        await walk(it.items, depth + 1)
      }
    }
    await walk(outline, 0)
  } catch { /* no outline */ }
  if (!toc.length) for (let i = 0; i < n; i += Math.max(1, Math.round(n / 40))) toc.push({ label: `Page ${i + 1}`, target: i, depth: 0, section: i })

  // text walk that matches pageText(): text nodes + one '\n' per <br>
  const walkNodes = (root: Node, cb: (node: Node, len: number) => boolean) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    for (let nd = it.nextNode(); nd; nd = it.nextNode()) {
      if (nd.nodeType === 3) { if (cb(nd, (nd as Text).data.length)) return }
      else if ((nd as Element).tagName === 'BR') { if (cb(nd, 1)) return }
    }
  }
  const offsetOf = (root: Node, node: Node, off: number) => {
    let pos = 0, found = -1
    walkNodes(root, (nd, len) => { if (nd === node) { found = pos + (nd.nodeType === 3 ? off : 0); return true } pos += len; return false })
    if (found < 0 && node.nodeType === 1) { // container boundary
      const child = node.childNodes[off]; if (child) { let p2 = 0; walkNodes(root, (nd, len) => { if (child.contains(nd) || child === nd) { found = p2; return true } p2 += len; return false }) }
    }
    return Math.max(0, found)
  }
  const rangeFor = (root: Node, s: number, e: number) => {
    let pos = 0; const r = document.createRange(); let started = false
    walkNodes(root, (nd, len) => {
      if (nd.nodeType !== 3) { pos += len; return false }
      if (!started && s <= pos + len) { r.setStart(nd, Math.max(0, s - pos)); started = true }
      if (started && e <= pos + len) { r.setEnd(nd, Math.max(0, e - pos)); return true }
      pos += len; return false
    })
    return started ? r : null
  }

  async function render() {
    const seq = ++renderSeq
    const p = await doc.getPage(page + 1)
    if (seq !== renderSeq) return
    const base = p.getViewport({ scale: 1 })
    const avail = { w: wrap.clientWidth - 32, h: wrap.clientHeight - 128 }
    const fit = Math.min(avail.w / base.width, avail.h / base.height)
    const scale = Math.max(0.3, fit * zoom)
    const vp = p.getViewport({ scale })
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr)
    canvas.style.cssText = `width:${vp.width}px;height:${vp.height}px;display:block;${theme.dark ? 'filter:invert(.9) hue-rotate(180deg)' : theme.id === 'warm' ? 'filter:sepia(.25)' : ''}`
    await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined } as never).promise
    if (seq !== renderSeq) return
    const tc = await p.getTextContent()
    pageTexts.set(page, (tc.items as { str: string; hasEOL?: boolean }[]).map(i => i.str + (i.hasEOL ? '\n' : '')).join(''))
    stage.replaceChildren(canvas)
    stage.style.width = `${vp.width}px`; stage.style.height = `${vp.height}px`
    const hl = document.createElement('div'); hl.className = 'pdf-hl'; hl.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;z-index:1'
    stage.append(hl)
    textDiv = document.createElement('div'); textDiv.className = 'textLayer'
    stage.append(textDiv)
    stage.style.setProperty('--scale-factor', String(scale))
    stage.style.setProperty('--total-scale-factor', String(scale))
    const tl = new lib.TextLayer({ textContentSource: tc, container: textDiv, viewport: vp })
    await tl.render()
    drawMarks()
    const text = pageTexts.get(page) ?? ''
    const l: Loc = { section: page, offset: 0, fraction: n > 1 ? page / (n - 1) : 1, snippet: snippetAt(text, 0), label: `Page ${page + 1} of ${n}` }
    loc = l; ev.relocate(l)
  }
  let loc: Loc | null = null

  function drawMarks() {
    const hl = stage.querySelector('.pdf-hl') as HTMLDivElement | null
    if (!hl || !textDiv) return
    hl.replaceChildren()
    const origin = stage.getBoundingClientRect()
    for (const m of marks) {
      if (m.section !== page || m.kind === 'bookmark') continue
      const text = pageTexts.get(page) ?? ''
      let s = m.start, e = m.end
      if (collapse(text.slice(s, e)).text.trim() !== collapse(m.exact).text.trim()) { const hit = findQuote([text], m); if (!hit) { ev.resolved(m.id, { section: m.section, start: s, end: e, orphaned: true }); continue } s = hit.start; e = hit.end; ev.resolved(m.id, { section: page, start: s, end: e, orphaned: false }) }
      const r = rangeFor(textDiv, s, e)
      if (!r) continue
      for (const rc of Array.from(r.getClientRects())) {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;left:${rc.left - origin.left}px;top:${rc.top - origin.top}px;width:${rc.width}px;height:${rc.height}px;background:${HEX[m.color] ?? HEX.amber};border-radius:2px;pointer-events:auto;cursor:pointer`
        d.onclick = () => ev.markClick(m.id)
        hl.append(d)
      }
    }
  }

  let selTimer: ReturnType<typeof setTimeout>
  const onSel = () => {
    clearTimeout(selTimer)
    selTimer = setTimeout(() => {
      const s = document.getSelection()
      if (!s || s.isCollapsed || !textDiv || !textDiv.contains(s.anchorNode)) return
      const r = s.getRangeAt(0)
      const start = offsetOf(textDiv, r.startContainer, r.startOffset), end = offsetOf(textDiv, r.endContainer, r.endOffset)
      const text = (pageTexts.get(page) ?? '').slice(start, end)
      if (!text.trim()) return
      ev.select({ section: page, start, end, text, rect: r.getBoundingClientRect() })
    }, 200)
  }
  document.addEventListener('selectionchange', onSel)
  const onResize = () => void render()
  window.addEventListener('resize', onResize)
  wrap.addEventListener('click', e => {
    if (document.getSelection()?.toString().trim()) return
    if ((e.target as HTMLElement).closest('.pdf-hl > div')) return
    const w = host.getBoundingClientRect(); const rel = (e.clientX - w.left) / w.width
    ev.tap(rel < 0.22 ? 'prev' : rel > 0.78 ? 'next' : 'center')
  })
  await render()

  return {
    toc,
    next: async () => { if (page < n - 1) { page++; wrap.scrollTop = 0; await render() } },
    prev: async () => { if (page > 0) { page--; wrap.scrollTop = 0; await render() } },
    goToFraction: async f => { page = Math.round(f * (n - 1)); await render() },
    goToTarget: async t => { page = Number(t); await render() },
    goToOffset: async (section, s, e, select) => {
      page = section; await render()
      if (select && e != null && textDiv) { const r = rangeFor(textDiv, s, e); if (r) { const sl = document.getSelection(); sl?.removeAllRanges(); sl?.addRange(r) } }
    },
    setMarks(m) { marks = m; drawMarks() },
    applyPrefs(p, t) {
      const z = p.size / 18
      const changed = theme.id !== t.id || Math.abs(z - zoom) > 0.01
      theme = t; zoom = z
      wrap.style.background = 'transparent'
      if (changed) void render()
    },
    location: () => loc,
    clearSelection() { document.getSelection()?.removeAllRanges(); ev.select(null) },
    destroy() { document.removeEventListener('selectionchange', onSel); window.removeEventListener('resize', onResize); wrap.remove(); void doc.close() },
  }
}
