// EPUB inspection: metadata, cover, section text and validation.
// Rendering is done by foliate-js; this module only reads the package so that
// import, search, sync and the publishing validator work without a renderer.
import { unzipSync, strFromU8 } from 'fflate'
import { PRODUCT } from '../app/product'

export interface Issue { level: 'error' | 'warning' | 'info'; code: string; message: string }
export interface SectionRef { href: string; path: string; title: string; linear: boolean; size: number }
export interface ParsedEpub {
  title: string; author: string; language?: string; publisher?: string; description?: string
  published?: string; series?: string; seriesIndex?: number
  subjects: string[]; identifiers: string[]
  cover?: { data: Uint8Array; type: string }
  sections: SectionRef[]
  issues: Issue[]
  drm: boolean
  version: string
  accessibility: string[]
}
export interface SectionText { section: number; title: string; text: string }

const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
export function resolvePath(base: string, href: string) {
  const out: string[] = []
  for (const part of (base + decodeURIComponent(href.split('#')[0])).split('/')) {
    if (part === '..') out.pop(); else if (part !== '.' && part !== '') out.push(part)
  }
  return out.join('/')
}
const xml = (s: string, type: DOMParserSupportedType = 'application/xml') => new DOMParser().parseFromString(s, type)
const all = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagName('*')).filter(e => (e.localName || e.tagName.split(':').pop()) === name)
const text = (e?: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim()

export function isZip(b: Uint8Array) { return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) }

export function parseEpub(bytes: Uint8Array): ParsedEpub {
  const issues: Issue[] = []
  const add = (level: Issue['level'], code: string, message: string) => issues.push({ level, code, message })
  if (!isZip(bytes)) throw new Error('This file is not a valid EPUB (it is not a zip archive).')
  let meta: Record<string, Uint8Array>
  try {
    meta = unzipSync(bytes, { filter: f => f.name === 'mimetype' || f.name.startsWith('META-INF/') || /\.(opf|ncx)$/i.test(f.name) })
  } catch { throw new Error('This EPUB is damaged and could not be opened.') }

  if (!meta['mimetype']) add('warning', 'mimetype-missing', 'The archive has no mimetype entry; some readers will reject it.')
  else if (strFromU8(meta['mimetype']).trim() !== 'application/epub+zip') add('warning', 'mimetype-wrong', 'The mimetype entry is not application/epub+zip.')
  else if (!(bytes[30] === 0x6d && strFromU8(bytes.slice(30, 38)) === 'mimetype')) add('info', 'mimetype-order', 'mimetype should be the first, uncompressed entry in the archive.')

  let drm = false
  if (meta['META-INF/rights.xml']) drm = true
  if (meta['META-INF/encryption.xml']) {
    const enc = strFromU8(meta['META-INF/encryption.xml'])
    for (const m of enc.matchAll(/EncryptionMethod[^>]*Algorithm\s*=\s*"([^"]+)"/g)) if (!FONT_OBFUSCATION.includes(m[1])) drm = true
  }
  if (drm) add('error', 'drm', `This file is protected by DRM. ${PRODUCT.shortName} does not remove DRM and cannot open it.`)

  const container = meta['META-INF/container.xml']
  if (!container) throw new Error('This file is not a valid EPUB (META-INF/container.xml is missing).')
  const opfPath = strFromU8(container).match(/full-path\s*=\s*"([^"]+)"/)?.[1]
  if (!opfPath || !meta[opfPath]) throw new Error('This file is not a valid EPUB (the package document is missing).')
  const opf = xml(strFromU8(meta[opfPath]))
  const base = dirOf(opfPath)
  const pkg = all(opf, 'package')[0]
  const version = pkg?.getAttribute('version') ?? '?'

  const metas = all(opf, 'meta')
  const metaProp = (p: string) => text(metas.find(m => m.getAttribute('property') === p))
  const metaName = (n: string) => metas.find(m => m.getAttribute('name') === n)?.getAttribute('content') ?? ''
  const dc = (n: string) => all(opf, n).filter(e => e.namespaceURI?.includes('purl.org/dc') || e.tagName.startsWith('dc:')).map(text).filter(Boolean)

  const title = dc('title')[0] ?? ''
  const creators = dc('creator')
  if (!title) add('error', 'no-title', 'No title in the package metadata.')
  if (!creators.length) add('warning', 'no-author', 'No author (dc:creator) in the package metadata.')
  const language = dc('language')[0]
  if (!language) add('warning', 'no-language', 'No language declared; hyphenation, text-to-speech and screen readers depend on it.')
  const identifiers = dc('identifier')
  if (!identifiers.length) add('warning', 'no-identifier', 'No unique identifier (ISBN or UUID).')

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const it of all(opf, 'item')) {
    const id = it.getAttribute('id'), href = it.getAttribute('href')
    if (id && href) manifest.set(id, { href, type: it.getAttribute('media-type') ?? '', props: it.getAttribute('properties') ?? '' })
  }
  const items = [...manifest.values()]
  const navItem = items.find(i => /\bnav\b/.test(i.props))
  const ncxItem = items.find(i => i.type === 'application/x-dtbncx+xml')
  if (!navItem && !ncxItem) add('warning', 'no-toc', 'No table of contents (nav document or NCX).')

  // Titles for spine items, from the nav document or NCX.
  const titles = new Map<string, string>()
  try {
    const wanted = [navItem, ncxItem].filter(Boolean).map(i => resolvePath(base, i!.href))
    const nav = unzipSync(bytes, { filter: f => wanted.includes(f.name) })
    const navPath = navItem && resolvePath(base, navItem.href)
    if (navPath && nav[navPath]) {
      const src = strFromU8(nav[navPath])
      for (const m of src.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const p = resolvePath(dirOf(navPath), m[1])
        if (!titles.has(p)) titles.set(p, stripTags(m[2]))
      }
    } else if (ncxItem) {
      const ncxPath = resolvePath(base, ncxItem.href)
      const src = nav[ncxPath] ? strFromU8(nav[ncxPath]) : ''
      for (const m of src.matchAll(/<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*<content\s+src\s*=\s*"([^"]+)"/g)) {
        const p = resolvePath(dirOf(ncxPath), m[2])
        if (!titles.has(p)) titles.set(p, stripTags(m[1]))
      }
    }
  } catch { /* titles are a nicety */ }

  const sections: SectionRef[] = []
  for (const ref of all(opf, 'itemref')) {
    const it = manifest.get(ref.getAttribute('idref') ?? '')
    if (!it) continue
    const path = resolvePath(base, it.href)
    sections.push({ href: it.href, path, title: titles.get(path) ?? '', linear: ref.getAttribute('linear') !== 'no', size: 0 })
  }
  if (!sections.length) add('error', 'no-spine', 'The book has no readable content (empty spine).')

  // Cover: EPUB 3 property, then EPUB 2 meta, then a guess by name.
  let coverItem = items.find(i => /\bcover-image\b/.test(i.props))
  if (!coverItem) { const id = metaName('cover'); if (id) coverItem = manifest.get(id) }
  if (!coverItem) coverItem = items.find(i => i.type.startsWith('image/') && /cover/i.test(i.href))
  let cover: ParsedEpub['cover']
  if (coverItem) {
    const p = resolvePath(base, coverItem.href)
    try { const c = unzipSync(bytes, { filter: f => f.name === p }); if (c[p]) cover = { data: c[p], type: coverItem.type || 'image/jpeg' } } catch { /* no cover */ }
  }
  if (!cover) add('warning', 'no-cover', 'No cover image found.')

  const accessibility = metas.filter(m => (m.getAttribute('property') ?? '').startsWith('schema:access')).map(m => `${m.getAttribute('property')}: ${text(m)}`)
  if (!accessibility.length) add('info', 'no-a11y-metadata', 'No accessibility metadata (schema:accessMode, accessibilityFeature, accessibilitySummary). Retailers selling into the EU increasingly expect it.')

  // EPUB 3 collections: only those refined as collection-type "series" are series
  // (Standard Ebooks also uses "set" for reading lists).
  let series: string | undefined, idx: string | undefined
  for (const c of metas.filter(m => m.getAttribute('property') === 'belongs-to-collection')) {
    const cid = c.getAttribute('id')
    const refined = (p: string) => text(metas.find(m => m.getAttribute('refines') === `#${cid}` && m.getAttribute('property') === p))
    const type = cid ? refined('collection-type') : ''
    if (type && type !== 'series') continue
    series = text(c); idx = cid ? refined('group-position') : undefined; break
  }
  series ||= metaName('calibre:series') || undefined
  idx ||= metaName('calibre:series_index') || undefined
  return {
    title: title || 'Untitled', author: creators.join(', ') || 'Unknown author', language, publisher: dc('publisher')[0],
    description: dc('description')[0] ? stripTags(dc('description')[0]) : undefined, published: dc('date')[0],
    series, seriesIndex: idx ? Number(idx) : undefined, subjects: dc('subject'), identifiers,
    cover, sections, issues, drm, version, accessibility,
  }
}

/** The text of one section exactly as a renderer's DOM exposes it (body.textContent).
 *  Annotation and position offsets are defined against this string. */
export function sectionTextOf(src: string): string {
  try {
    const doc = xml(src, 'application/xhtml+xml')
    const body = doc.getElementsByTagName('body')[0] ?? all(doc, 'body')[0]
    if (body && !doc.getElementsByTagName('parsererror').length) {
      for (const e of [...all(body, 'script'), ...all(body, 'style')]) e.remove()
      return body.textContent ?? ''
    }
  } catch { /* fall through */ }
  const b = src.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? src
  return b.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export function extractEpubText(bytes: Uint8Array, parsed: ParsedEpub, extraIssues?: Issue[]): SectionText[] {
  const paths = new Set(parsed.sections.map(s => s.path))
  const files = unzipSync(bytes, { filter: f => paths.has(f.name) })
  let noAlt = 0
  const out = parsed.sections.map((s, i) => {
    const raw = files[s.path]
    if (!raw) { extraIssues?.push({ level: 'error', code: 'missing-file', message: `Spine item ${s.href} is missing from the archive.` }); return { section: i, title: s.title, text: '' } }
    const src = strFromU8(raw)
    s.size = raw.length
    if (extraIssues) {
      for (const m of src.matchAll(/<img\b[^>]*>/gi)) if (!/\balt\s*=\s*"[^"]+"/i.test(m[0])) noAlt++
      if (raw.length > 300_000) extraIssues.push({ level: 'warning', code: 'large-section', message: `${s.href} is ${Math.round(raw.length / 1024)} KB in one file; small devices such as the SAGA Leaf need it converted to text.` })
    }
    return { section: i, title: s.title, text: sectionTextOf(src) }
  })
  if (extraIssues && noAlt) extraIssues.push({ level: 'warning', code: 'img-alt', message: `${noAlt} image${noAlt > 1 ? 's have' : ' has'} no alt text.` })
  return out
}

/** Full validation used by the author portal: structure + content checks. */
export function validateEpub(bytes: Uint8Array): { parsed?: ParsedEpub; issues: Issue[]; words: number } {
  try {
    const parsed = parseEpub(bytes)
    const issues = [...parsed.issues]
    const texts = parsed.drm ? [] : extractEpubText(bytes, parsed, issues)
    const words = texts.reduce((n, t) => n + (t.text.match(/\S+/g)?.length ?? 0), 0)
    if (!parsed.drm && words < 50) issues.push({ level: 'error', code: 'no-text', message: 'The book contains almost no readable text.' })
    return { parsed, issues, words }
  } catch (e) {
    return { issues: [{ level: 'error', code: 'invalid', message: (e as Error).message }], words: 0 }
  }
}
