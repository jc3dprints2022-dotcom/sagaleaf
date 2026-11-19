// Text anchors. A highlight is stored as section + character offsets AND the
// quoted text with a little context either side (the W3C Web Annotation
// TextQuote + TextPosition pair). Offsets are fast; the quote is what lets an
// annotation survive a different layout, font, device, or even a re-edited
// file. If nothing matches, the annotation is marked orphaned — never dropped.

export interface Quote { exact: string; prefix?: string; suffix?: string }
export interface Hint { section?: number; start?: number; fraction?: number }
export interface Match { section: number; start: number; end: number; score: number }

const CONTEXT = 32

/** Whitespace-collapsed copy of `s` with a map from each output index back to `s`. */
export function collapse(s: string): { text: string; map: number[] } {
  const out: string[] = []; const map: number[] = []
  let space = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (/\s/.test(ch)) { if (!space && out.length) { out.push(' '); map.push(i); space = true } continue }
    space = false
    out.push(ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : ch.toLowerCase()); map.push(i)
  }
  map.push(s.length)
  return { text: out.join(''), map }
}
const squashQ = (s: string) => collapse(s).text.trim()

export function quoteAt(text: string, start: number, end: number): Required<Quote> {
  return { exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end, end + CONTEXT) }
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0
  let n = 0; const m = Math.min(a.length, b.length)
  while (n < m && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n / Math.max(1, m)
}
function simStart(a: string, b: string) {
  let n = 0; const m = Math.min(a.length, b.length)
  while (n < m && a[n] === b[n]) n++
  return n / Math.max(1, m)
}

/** Find a quote in a list of section texts. Uses the hint to break ties and
 *  falls back to matching the quote's head and tail if the middle changed. */
export function findQuote(texts: string[], q: Quote, hint: Hint = {}): Match | null {
  const exact = squashQ(q.exact)
  if (!exact) return null
  const pre = squashQ(q.prefix ?? ''), suf = squashQ(q.suffix ?? '')
  const total = texts.reduce((n, t) => n + t.length, 0) || 1
  const order = texts.map((_, i) => i)
  if (hint.section != null) order.sort((a, b) => Math.abs(a - hint.section!) - Math.abs(b - hint.section!))
  let best: Match | null = null
  let before = 0
  const offsets = texts.map(t => { const o = before; before += t.length; return o })

  const consider = (sec: number, cs: { text: string; map: number[] }, i: number, len: number, quality: number) => {
    const start = cs.map[i], end = cs.map[i + len - 1] + 1
    let score = quality * 10
    score += 3 * similarity(cs.text.slice(Math.max(0, i - pre.length), i).trim(), pre)
    score += 3 * simStart(cs.text.slice(i + len, i + len + suf.length + 1).trim(), suf)
    if (hint.section != null) score += sec === hint.section ? 2 : -Math.min(2, Math.abs(sec - hint.section) * 0.1)
    if (hint.section === sec && hint.start != null) score += 2 * (1 - Math.min(1, Math.abs(start - hint.start) / 5000))
    if (hint.fraction != null) score += 2 * (1 - Math.min(1, Math.abs((offsets[sec] + start) / total - hint.fraction) * 20))
    if (!best || score > best.score) best = { section: sec, start, end, score }
  }

  for (const sec of order) {
    const cs = collapse(texts[sec])
    let i = cs.text.indexOf(exact)
    while (i >= 0) { consider(sec, cs, i, exact.length, 1); i = cs.text.indexOf(exact, i + 1) }
  }
  if (best) return best
  // Fuzzy: the passage was edited. Anchor on head and tail fragments.
  if (exact.length >= 24) {
    const head = exact.slice(0, 16), tail = exact.slice(-16)
    for (const sec of order) {
      const cs = collapse(texts[sec])
      let i = cs.text.indexOf(head)
      while (i >= 0) {
        const j = cs.text.indexOf(tail, i + head.length)
        if (j > i && j - i < exact.length * 1.6) consider(sec, cs, i, j + tail.length - i, 0.5)
        i = cs.text.indexOf(head, i + 1)
      }
    }
  }
  return best
}

/** Character offsets of a DOM Range inside `root.textContent`. */
export function rangeToOffsets(root: Node, range: Range): { start: number; end: number } {
  const pre = root.ownerDocument!.createRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  return { start, end: start + range.toString().length }
}

/** Inverse of rangeToOffsets. */
export function offsetsToRange(root: Node, start: number, end: number): Range | null {
  const doc = root.ownerDocument!
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */)
  let pos = 0, sNode: Text | null = null, sOff = 0, eNode: Text | null = null, eOff = 0
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.data.length
    if (!sNode && start <= pos + len) { sNode = n; sOff = Math.max(0, start - pos) }
    if (sNode && end <= pos + len) { eNode = n; eOff = Math.max(0, end - pos); break }
    pos += len
  }
  if (!sNode) return null
  const r = doc.createRange()
  r.setStart(sNode, Math.min(sOff, sNode.data.length))
  if (eNode) r.setEnd(eNode, Math.min(eOff, eNode.data.length)); else r.setEndAfter(root.lastChild ?? root)
  return r
}

/** Location helpers over a book made of sections. */
export function absoluteFraction(lengths: number[], section: number, offset: number) {
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  const before = lengths.slice(0, section).reduce((a, b) => a + b, 0)
  return Math.min(1, Math.max(0, (before + offset) / total))
}
export function fromFraction(lengths: number[], fraction: number): { section: number; offset: number } {
  const total = lengths.reduce((a, b) => a + b, 0)
  let target = fraction * total
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) return { section: i, offset: Math.max(0, Math.min(lengths[i], Math.round(target))) }
    target -= lengths[i]
  }
  return { section: 0, offset: 0 }
}

/** Words at a position, used as the cross-device "snippet" for positions. */
export function snippetAt(text: string, offset: number, words = 12) {
  let s = offset
  while (s > 0 && !/\s/.test(text[s - 1])) s--
  const rest = text.slice(s).replace(/\s+/g, ' ').trim()
  return rest.split(' ').slice(0, words).join(' ')
}
