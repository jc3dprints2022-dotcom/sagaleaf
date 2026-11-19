// Synthetic DRM-free books for scale tests: varied titles/authors, real-ish prose
// (shuffled public-domain sentences), some with identical files to test dedupe.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const src = readFileSync(new URL('../public/samples/sherlock-holmes-sample.txt', import.meta.url), 'utf8')
const sentences = src.split(/(?<=[.!?])\s+/).filter(s => s.length > 30 && s.length < 400)
const first = ['Ada', 'Bram', 'Clara', 'Dmitri', 'Elif', 'Farah', 'Gus', 'Hiro', 'Ines', 'Jun', 'Kwame', 'Lena', 'Mateo', 'Nia', 'Omar', 'Priya']
const last = ['Marsh', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Haddad', 'Kowalski', 'Reyes', 'Byrne', 'Achterberg', 'Sato', 'Novak']
const words = ['River', 'Lantern', 'Orchard', 'Signal', 'Harbor', 'Ember', 'Atlas', 'Winter', 'Glass', 'Meridian', 'Copper', 'Silent', 'Northern', 'Hollow', 'Paper', 'Iron']
let seed = 7
export const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]

export function makeBook(i: number, chars = 20_000) {
  const title = `The ${pick(words)} ${pick(words)}${rnd() < 0.3 ? ` of ${pick(words)}` : ''} ${i}`
  const author = `${pick(first)} ${pick(last)}`
  const chapters: string[] = []
  let n = 0
  while (n < chars) { let c = ''; while (c.length < 4000) c += pick(sentences) + (rnd() < 0.2 ? '\n\n' : ' '); chapters.push(c); n += c.length }
  return { title, author, chapters }
}
export function asTxt(b: ReturnType<typeof makeBook>) {
  return strToU8(`Title: ${b.title}\nAuthor: ${b.author}\n\n` + b.chapters.map((c, i) => `Chapter ${i + 1}\n\n${c}`).join('\n\n\n'))
}
export function asEpub(b: ReturnType<typeof makeBook>) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const files: Record<string, unknown> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="o.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'o.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="i"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="i">urn:bench:${esc(b.title)}</dc:identifier><dc:title>${esc(b.title)}</dc:title><dc:creator>${esc(b.author)}</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>${b.chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${b.chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`),
    'nav.xhtml': strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${b.chapters.map((_, i) => `<li><a href="c${i}.xhtml">Chapter ${i + 1}</a></li>`).join('')}</ol></nav></body></html>`),
  }
  b.chapters.forEach((c, i) => { files[`c${i}.xhtml`] = strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${i + 1}</title></head><body><h2>Chapter ${i + 1}</h2>${c.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n')}</body></html>`) })
  return zipSync(files as never)
}
