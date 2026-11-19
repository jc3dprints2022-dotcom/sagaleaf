// Kindle highlights import. Reads the three plain exports Kindle gives you:
//   - "My Clippings.txt" from the documents folder of a Kindle e-reader,
//   - the notebook HTML that the Kindle apps email you ("Export notebook"),
//   - the CSV export from the Kindle phone apps.
// This is notes only. Nothing here fetches, opens, decrypts or converts a
// Kindle book file; it only parses text files the reader exported themselves.
import type { Store } from './store'
import type { Annotation, Book } from './types'
import { findQuote, quoteAt, absoluteFraction } from './anchor'
import { norm, sortKey } from './util'

export type ClippingKind = 'highlight' | 'note' | 'bookmark'
export interface Clipping {
  id: string                // stable: same clipping in a re-export gets the same id
  title: string
  author: string
  kind: ClippingKind
  location?: string         // as Kindle wrote it: "170-172" or "172"
  locStart?: number
  locEnd?: number
  page?: string
  added?: string            // Kindle's own date text, kept as written
  text: string              // highlighted passage, or the note's text
  note?: string             // a note Kindle stored next to this highlight
  color?: string            // SAGA highlight colour id
  chapter?: string
}

// ------------------------------------------------------------ helpers
/** Small, synchronous string hash (cyrb53) for stable ids. */
function hash(s: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
const clean = (s: string) => s.replace(/^﻿/, '').replace(/​/g, '').replace(/\s+/g, ' ').trim()
const idOf = (c: Pick<Clipping, 'title' | 'kind' | 'location' | 'text'>) => hash([sortKey(c.title), c.kind, c.location ?? '', clean(c.text)].join('\u0001'))

/** "Austen, Jane" → "Jane Austen"; "Austen, Jane; Brontë, Charlotte" → "Jane Austen and Charlotte Brontë". */
export function kindleAuthor(raw: string) {
  const people = raw.split(';').map(s => s.trim()).filter(Boolean).map(p => {
    const parts = p.split(',').map(s => s.trim())
    return parts.length === 2 && parts[1] && !/\b(jr|sr|ii|iii)\.?$/i.test(parts[1]) ? `${parts[1]} ${parts[0]}` : p
  })
  return people.join(' and ')
}

function parseLocation(s: string): Pick<Clipping, 'location' | 'locStart' | 'locEnd'> {
  const m = s.match(/(\d+)(?:\s*-\s*(\d+))?/)
  if (!m) return {}
  const a = Number(m[1])
  let b = m[2] ? Number(m[2]) : a
  // Old firmware abbreviates the end: "1405-07" means 1405-1407.
  if (m[2] && b < a) b = Number(m[1].slice(0, m[1].length - m[2].length) + m[2])
  return { location: m[2] ? `${a}-${b}` : String(a), locStart: a, locEnd: b }
}

const COLOR: Record<string, string> = { yellow: 'amber', orange: 'amber', blue: 'sky', pink: 'rose', red: 'rose', green: 'sage', purple: 'sky' }
const colorOf = (s?: string) => (s ? COLOR[s.toLowerCase().trim()] : undefined)

// ------------------------------------------------------------ My Clippings.txt
const KIND_WORDS: [ClippingKind, RegExp][] = [
  ['bookmark', /bookmark|marcador|lesezeichen|signet|segnalibro|bladwijzer|ブックマーク/i],
  ['note', /\bnote\b|\bnota\b|notiz|notitie|メモ/i],
  ['highlight', /highlight|subrayado|resaltado|markierung|surlignement|evidenziazione|markering|destaque|ハイライト/i],
]
const LOC_RE = /(?:location|loc\.|posición|position|emplacement|posizione|posição|locatie|位置No\.)\s*([\d]+(?:\s*-\s*\d+)?)/i
const PAGE_RE = /(?:page|página|seite|pagina|ページ)\s*([\divxlc]+(?:\s*-\s*[\divxlc]+)?)/i
const ADDED_RE = /\|\s*(?:added on|añadido el|hinzugefügt am|ajouté le|aggiunto il|adicionado|toegevoegd op)\s*(.+)$/i

/** Title line: "Title (Author)". The author is the last balanced (...) group. */
function splitTitleLine(line: string): { title: string; author: string } {
  const s = clean(line)
  if (s.endsWith(')')) {
    let depth = 0
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ')') depth++
      else if (s[i] === '(' && --depth === 0) {
        const title = s.slice(0, i).trim(), author = s.slice(i + 1, -1).trim()
        if (title) return { title, author: kindleAuthor(author) }
        break
      }
    }
  }
  return { title: s, author: '' }
}

export function parseMyClippings(input: string): Clipping[] {
  const out: Clipping[] = []
  const entries = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n?={8,}\s*\n?/)
  for (const raw of entries) {
    const lines = raw.split('\n')
    while (lines.length && !lines[0].trim()) lines.shift()
    if (lines.length < 2) continue
    const { title, author } = splitTitleLine(lines[0])
    const metaLine = lines[1].trim()
    if (!metaLine.startsWith('-')) continue
    const kind = KIND_WORDS.find(([, re]) => re.test(metaLine.split('|')[0]))?.[0]
    if (!kind) continue
    const loc = metaLine.match(LOC_RE)?.[1]
    const page = metaLine.match(PAGE_RE)?.[1]
    const added = metaLine.match(ADDED_RE)?.[1]?.trim()
    const text = lines.slice(2).join('\n').trim()
    if (kind !== 'bookmark' && !text) continue
    const c: Clipping = { id: '', title, author, kind, ...(loc ? parseLocation(loc) : {}), page, added, text }
    c.id = idOf(c)
    out.push(c)
  }
  return dedupeEdits(out)
}

/** Editing a highlight on a Kindle appends a new clipping instead of replacing
 *  the old one. Keep only the last version of overlapping highlights that
 *  start at the same place. */
function dedupeEdits(list: Clipping[]) {
  const keep: Clipping[] = []
  const seen = new Set<string>()
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    if (seen.has(c.id)) continue
    seen.add(c.id)
    if (c.kind === 'highlight' && c.locStart != null) {
      const later = keep.find(k => k.kind === 'highlight' && k.title === c.title && k.locStart === c.locStart && (clean(k.text).includes(clean(c.text)) || clean(c.text).includes(clean(k.text))))
      if (later) continue
    }
    keep.push(c)
  }
  return keep.reverse()
}

// ------------------------------------------------------------ notebook HTML
export function parseNotebookHtml(html: string): Clipping[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = clean(doc.querySelector('.bookTitle')?.textContent ?? '')
  const author = kindleAuthor(clean(doc.querySelector('.authors')?.textContent ?? ''))
  if (!title) return []
  const out: Clipping[] = []
  let chapter = ''
  let pending: { kind: ClippingKind; heading: string; color?: string } | null = null
  for (const el of Array.from(doc.querySelectorAll('.sectionHeading, .noteHeading, .noteText'))) {
    const cls = el.className
    if (/sectionHeading/.test(cls)) { chapter = clean(el.textContent ?? ''); continue }
    if (/noteHeading/.test(cls)) {
      const heading = clean(el.textContent ?? '')
      const kind: ClippingKind = /^(note|nota|notiz|メモ)/i.test(heading) ? 'note' : /^(bookmark|marcador|lesezeichen)/i.test(heading) ? 'bookmark' : 'highlight'
      const color = colorOf(el.querySelector('[class^="highlight_"]')?.className.replace(/^highlight_/, '') ?? heading.match(/\((\w+)\)/)?.[1])
      pending = { kind, heading, color }
      continue
    }
    if (!pending) continue
    // The notebook puts the text of a note or highlight in the heading's own
    // element in some versions; noteText is what follows the heading.
    const text = (el.textContent ?? '').trim()
    const loc = pending.heading.match(LOC_RE)?.[1]
    const page = pending.heading.match(PAGE_RE)?.[1]
    const c: Clipping = { id: '', title, author, kind: pending.kind, ...(loc ? parseLocation(loc) : {}), page, text, color: pending.color, chapter: chapter || undefined }
    c.id = idOf(c)
    if (c.text || c.kind === 'bookmark') out.push(c)
    pending = null
  }
  return out
}

// ------------------------------------------------------------ CSV (Kindle phone apps)
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const s = input.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export function parseKindleCsv(input: string): Clipping[] {
  const rows = parseCsvRows(input)
  let title = '', author = ''
  const hi = rows.findIndex(r => /annotation type/i.test(r[0] ?? ''))
  if (hi < 0) return []
  for (let i = 0; i < hi; i++) {
    const v = clean(rows[i][0] ?? '')
    if (/^your kindle notes for:?$/i.test(v)) { title = clean(rows[i + 1]?.[0] ?? ''); continue }
    if (/^by\s+/i.test(v) && !author) author = kindleAuthor(v.replace(/^by\s+/i, ''))
  }
  if (!title) return []
  const head = rows[hi].map(h => h.toLowerCase().trim())
  const col = (name: string) => head.findIndex(h => h.startsWith(name))
  const cType = col('annotation type'), cLoc = col('location'), cText = head.findIndex(h => h === 'annotation')
  const out: Clipping[] = []
  for (const r of rows.slice(hi + 1)) {
    const type = clean(r[cType] ?? '')
    if (!type) continue
    const kind: ClippingKind = /^note/i.test(type) ? 'note' : /^bookmark/i.test(type) ? 'bookmark' : 'highlight'
    const locText = r[cLoc] ?? ''
    const loc = locText.match(/(\d+(?:\s*-\s*\d+)?)/)?.[1]
    const page = locText.match(PAGE_RE)?.[1]
    const c: Clipping = { id: '', title, author, kind, ...(loc ? parseLocation(loc) : {}), page, text: (r[cText] ?? '').trim(), color: colorOf(type.match(/\((\w+)\)/)?.[1]) }
    c.id = idOf(c)
    if (c.text || c.kind === 'bookmark') out.push(c)
  }
  return out
}

/** Picks the parser from the file name and contents. */
export function parseKindleExport(name: string, text: string): Clipping[] {
  if (/\.html?$/i.test(name) || /class\s*=\s*["']?bookTitle/.test(text)) return parseNotebookHtml(text)
  if (/\.csv$/i.test(name) || /^﻿?"?Your Kindle Notes For/i.test(text)) return parseKindleCsv(text)
  return parseMyClippings(text)
}

/** Kindle stores a note as its own clipping at the end location of the
 *  highlight it belongs to. Fold each such note into its highlight; notes
 *  with no highlight stay as notes. Bookmarks are dropped. */
export function pairNotes(list: Clipping[]): Clipping[] {
  const copies = new Map(list.map(c => [c, { ...c }]))
  const used = new Set<Clipping>()
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    if (n.kind !== 'note') continue
    const free = list.filter(h => h.kind === 'highlight' && h.title === n.title && !copies.get(h)!.note)
    let h: Clipping | undefined
    if (n.locStart != null) h = free.find(x => x.locEnd === n.locStart) ?? free.find(x => x.locStart != null && x.locStart <= n.locStart! && n.locStart! <= x.locEnd!)
    // Notebook HTML and CSV list a note right after its highlight.
    if (!h && free.includes(list[i - 1]) && list[i - 1].location === n.location) h = list[i - 1]
    if (!h) continue
    const c = copies.get(h)!
    c.note = n.text; c.id = hash(h.id + '\u0001' + n.id)
    used.add(n)
  }
  return list.filter(c => c.kind !== 'bookmark' && !used.has(c)).map(c => copies.get(c)!)
}

// ------------------------------------------------------------ matching
const shortKey = (t: string) => sortKey(t.split(/\s*[:;([]\s*|\s+-\s+|,\s+or,?\s+/i)[0])
const nameTokens = (a: string) => new Set(norm(a).replace(/[^\p{L} ]/gu, ' ').split(/\s+/).filter(w => w.length > 1 && !['and', 'the', 'unknown', 'author', 'by'].includes(w)))

/** The library book a Kindle title obviously refers to, or null. "Obvious" means
 *  the titles are the same (ignoring case, punctuation, leading articles and
 *  subtitles) and, when Kindle gives an author, at least one name agrees.
 *  If several different books qualify, it is not obvious, so nothing matches. */
export function matchBook(title: string, author: string, books: Book[]): Book | null {
  const full = sortKey(title), short = shortKey(title)
  if (!short) return null
  const live = books.filter(b => !(b as Book & { deleted?: boolean }).deleted)
  let cands = live.filter(b => sortKey(b.title) === full)
  if (!cands.length) cands = live.filter(b => shortKey(b.title) === short)
  if (!cands.length) return null
  const want = nameTokens(author)
  if (want.size) {
    cands = cands.filter(b => { const have = nameTokens(b.author); return !have.size || [...want].some(w => have.has(w)) })
    if (!cands.length) return null
  }
  // Several files of the same work (EPUB and PDF of one book) are fine: prefer
  // the EPUB, then the newest. Different works with one title are ambiguous.
  const works = new Set(cands.map(b => nameTokens(b.author).size ? [...nameTokens(b.author)].sort().join(' ') : ''))
  if (works.size > 1 && !want.size) return null
  return cands.sort((a, b) => (a.format === 'epub' ? 0 : 1) - (b.format === 'epub' ? 0 : 1) || b.addedAt - a.addedAt)[0]
}

// ------------------------------------------------------------ storing
const PENDING_KEY = 'kindle.pending'
export const annotationIdOf = (c: Clipping) => `kindle-${c.id}`

export async function loadPending(store: Store): Promise<Clipping[]> { return store.getMeta<Clipping[]>(PENDING_KEY, []) }
async function savePending(store: Store, list: Clipping[]) { await store.setMeta(PENDING_KEY, list) }

const labelOf = (c: Clipping) => ['Kindle', c.chapter, c.page && `page ${c.page}`, c.location && `location ${c.location}`].filter(Boolean).join(', ')

/** Adds one clipping to a book as a SAGA annotation, anchored by its quoted
 *  text. Returns false if it was already there (including deleted ones). */
export async function attachClipping(store: Store, book: Book, c: Clipping): Promise<boolean> {
  const id = annotationIdOf(c)
  if (await store.db.annotations.get(id)) return false
  const texts = (await store.db.texts.where('bookId').equals(book.id).sortBy('section')).map(t => t.text)
  const isNote = c.kind === 'note'
  const exact = isNote ? '' : c.text
  const m = exact && texts.length ? findQuote(texts, { exact }) : null
  const q = m ? quoteAt(texts[m.section], m.start, m.end) : { exact, prefix: '', suffix: '' }
  const now = Date.now()
  await store.put<Annotation>('annotation', id, {
    bookId: book.id, kind: isNote ? 'note' : c.note ? 'note' : 'highlight',
    section: m?.section ?? -1, start: m?.start ?? 0, end: m?.end ?? 0, ...q,
    note: isNote ? c.text : c.note ?? '', color: c.color ?? 'amber', tags: ['kindle'], label: labelOf(c),
    fraction: m ? absoluteFraction(texts.map(t => t.length), m.section, m.start) : 0,
    createdAt: now, updatedAt: now,
    // Unplaced highlights are re-tried against the text when the book opens. A
    // note on its own has no passage to place.
    orphaned: isNote || (!m && texts.length > 0), origin: 'Kindle',
  })
  return true
}

export interface ClippingImportResult { attached: number; already: number; pending: number; bookmarks: number; books: { id: string; title: string; count: number }[]; unmatchedTitles: string[] }

/** Attaches clippings whose book is obviously in the library; the rest wait in
 *  the review list (local to this device) until the reader picks a book. */
export async function importClippings(store: Store, raw: Clipping[]): Promise<ClippingImportResult> {
  const bookmarks = raw.filter(c => c.kind === 'bookmark').length
  const list = pairNotes(raw)
  const books = (await store.db.books.toArray()).filter(b => !b.deleted)
  const pending = await loadPending(store)
  const pendingIds = new Set(pending.map(p => p.id))
  const res: ClippingImportResult = { attached: 0, already: 0, pending: 0, bookmarks, books: [], unmatchedTitles: [] }
  const perBook = new Map<string, { id: string; title: string; count: number }>()
  const byTitle = new Map<string, Book | null>()
  for (const c of list) {
    const key = c.title + '\u0001' + c.author
    if (!byTitle.has(key)) byTitle.set(key, matchBook(c.title, c.author, books))
    const book = byTitle.get(key)
    if (book) {
      if (await attachClipping(store, book, c)) {
        res.attached++
        const e = perBook.get(book.id) ?? perBook.set(book.id, { id: book.id, title: book.title, count: 0 }).get(book.id)!
        e.count++
      } else res.already++
      continue
    }
    if (pendingIds.has(c.id) || await store.db.annotations.get(annotationIdOf(c))) { res.already++; continue }
    pending.push(c); pendingIds.add(c.id); res.pending++
    if (!res.unmatchedTitles.includes(c.title)) res.unmatchedTitles.push(c.title)
  }
  await savePending(store, pending)
  res.books = [...perBook.values()]
  return res
}

/** Attach waiting clippings to a book the reader chose. */
export async function attachPending(store: Store, ids: string[], bookId: string) {
  const book = await store.db.books.get(bookId)
  if (!book || book.deleted) throw new Error('That book isn’t in your library.')
  const want = new Set(ids)
  const pending = await loadPending(store)
  let n = 0
  for (const c of pending) if (want.has(c.id) && await attachClipping(store, book, c)) n++
  await savePending(store, pending.filter(c => !want.has(c.id)))
  return n
}

export async function discardPending(store: Store, ids: string[]) {
  const drop = new Set(ids)
  await savePending(store, (await loadPending(store)).filter(c => !drop.has(c.id)))
}

/** After books are added: attach any waiting clippings that now obviously match. */
export async function autoAttachPending(store: Store) {
  const pending = await loadPending(store)
  if (!pending.length) return 0
  const books = (await store.db.books.toArray()).filter(b => !b.deleted)
  const left: Clipping[] = []
  let n = 0
  for (const c of pending) {
    const b = matchBook(c.title, c.author, books)
    if (b) { if (await attachClipping(store, b, c)) n++ }
    else left.push(c)
  }
  if (left.length !== pending.length) await savePending(store, left)
  return n
}
