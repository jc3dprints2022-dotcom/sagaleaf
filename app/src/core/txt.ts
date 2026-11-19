// Plain-text books: decode, tidy, split into chapters.
import { cleanPlainText } from '../vendor/leaf-epub-convert.js'

export interface TxtBook { title?: string; author?: string; chapters: { title: string; text: string }[] }

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1252').decode(bytes) }
}

const HEADING = /^(?:chapter|book|part|letter|act|scene|canto|prologue|epilogue|preface|introduction)\b[^\n]{0,60}$|^[IVXLC]{1,7}\.?$|^\d{1,3}\.?$/i

export function parseTxt(bytes: Uint8Array, filename = ''): TxtBook {
  const raw = decodeText(bytes)
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
  const author = raw.match(/^Author:\s*(.+)$/m)?.[1]?.trim()
  const body: string = cleanPlainText(raw)
  const paras = body.split(/\n{2,}/)
  const chapters: TxtBook['chapters'] = []
  let cur = { title: '', text: '' }
  const push = () => { if (cur.text.trim()) chapters.push(cur) }
  for (const p of paras) {
    const line = p.trim()
    const isHead = line.length < 70 && !line.includes('\n') && HEADING.test(line)
    if (isHead && cur.text.length > 400) { push(); cur = { title: line, text: '' }; continue }
    if (isHead && !cur.title && !cur.text) { cur.title = line; continue }
    if (!isHead && cur.text.length > 40_000) { push(); cur = { title: '', text: '' } }
    cur.text += (cur.text ? '\n\n' : '') + line
  }
  push()
  chapters.forEach((c, i) => { if (!c.title) c.title = chapters.length > 1 ? `Part ${i + 1}` : (title ?? 'Text') })
  return { title: title ?? (filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || undefined), author, chapters }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** XHTML for one chapter. The renderer and the text index both read this, so offsets agree. */
export function chapterXhtml(c: { title: string; text: string }) {
  const paras = c.text.split(/\n{2,}/).map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(c.title)}</title></head><body>${paras}</body></html>`
}

/** Package a plain-text book as a minimal EPUB so the same renderer handles it. */
export async function txtToEpub(chapters: { title: string; text: string }[], meta: { title: string; author: string; language?: string }) {
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  }
  const items = chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')
  const nav = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${chapters.map((c, i) => `<li><a href="c${i}.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:saga:txt</dc:identifier><dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.author)}</dc:creator><dc:language>${meta.language ?? 'en'}</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`)
  files['OEBPS/nav.xhtml'] = strToU8(nav)
  chapters.forEach((c, i) => { files[`OEBPS/c${i}.xhtml`] = strToU8(chapterXhtml(c)) })
  return zipSync(files as never)
}
