// Library import: Kindle highlights, Calibre libraries, Gutenberg / Standard Ebooks links.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync, unzipSync } from 'fflate'
import { freshStore, sample } from './helpers'
import { parseMyClippings, parseNotebookHtml, parseKindleCsv, parseKindleExport, pairNotes, matchBook, importClippings, loadPending, attachPending, autoAttachPending, discardPending, kindleAuthor } from '../src/core/kindle'
import { importCalibre, groupCalibreBooks, parseCalibreOpf, metaFromFolders, filesFromZip, zipLooksLikeCalibre, type TreeFile } from '../src/core/calibre'
import { importBytes, DRM_MESSAGE, isDrmPdf } from '../src/core/library'
import type { Book } from '../src/core/types'

const fx = (p: string) => readFileSync(join(__dirname, 'fixtures', p), 'utf8')
const CLIPPINGS = fx('kindle/My Clippings.txt')

describe('Kindle: My Clippings.txt', () => {
  const list = parseMyClippings(CLIPPINGS)

  it('parses title, author, type, location and text', () => {
    const first = list[0]
    expect(first.title).toBe('Pride and Prejudice')
    expect(first.author).toBe('Jane Austen')                 // "Austen, Jane" turned round
    expect(first.kind).toBe('highlight')
    expect(first.location).toBe('7-8')
    expect(first.locStart).toBe(7); expect(first.locEnd).toBe(8)
    expect(first.page).toBe('1')
    expect(first.text).toBe('It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.')
    const note = list.find(c => c.kind === 'note' && c.title === 'Pride and Prejudice')!
    expect(note.text).toBe('The most famous opening line in English.')
    expect(note.location).toBe('8')
    expect(list.find(c => c.kind === 'bookmark')!.location).toBe('52')
    expect(list.find(c => c.title.startsWith('Frankenstein'))!.author).toBe('Mary Wollstonecraft Shelley')
  })

  it('keeps only the last version of a highlight edited on the Kindle', () => {
    const fr = list.filter(c => c.title.startsWith('Frankenstein'))
    expect(fr).toHaveLength(1)
    expect(fr[0].text).toMatch(/evil forebodings\.$/)
    expect(fr[0].location).toBe('112-115')
  })

  it('handles CRLF, BOM, abbreviated locations and old-firmware headers', () => {
    const old = '﻿Dune (Herbert, Frank)\r\n- Highlight Loc. 1405-07  | Added on Sunday, May 1, 2011, 09:00 PM\r\n\r\nFear is the mind-killer.\r\n==========\r\n'
    const [c] = parseMyClippings(old)
    expect(c).toMatchObject({ title: 'Dune', author: 'Frank Herbert', kind: 'highlight', location: '1405-1407', text: 'Fear is the mind-killer.' })
  })

  it('folds a note into the highlight it was written on', () => {
    const paired = pairNotes(list)
    const pp = paired.filter(c => c.title === 'Pride and Prejudice')
    expect(pp).toHaveLength(1)                             // highlight + note → one item; bookmark dropped
    expect(pp[0].note).toBe('The most famous opening line in English.')
    const war = paired.filter(c => c.title === 'The Art of War')
    expect(war.map(c => c.kind)).toEqual(['highlight', 'note'])   // a note far from any highlight stays a note
  })

  it('gives the same ids on a re-parse', () => {
    expect(parseMyClippings(CLIPPINGS).map(c => c.id)).toEqual(list.map(c => c.id))
    expect(new Set(list.map(c => c.id)).size).toBe(list.length)
  })

  it('author names: Last, First and several authors', () => {
    expect(kindleAuthor('Austen, Jane')).toBe('Jane Austen')
    expect(kindleAuthor('Austen, Jane; Brontë, Charlotte')).toBe('Jane Austen and Charlotte Brontë')
    expect(kindleAuthor('Sun Tzu')).toBe('Sun Tzu')
  })
})

describe('Kindle: notebook HTML and CSV exports', () => {
  it('parses the notebook HTML the Kindle apps email', () => {
    const list = parseNotebookHtml(fx('kindle/notebook.html'))
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({ title: 'Pride and Prejudice', author: 'Jane Austen', kind: 'highlight', location: '7', page: '1', color: 'sky', chapter: 'Chapter 1' })
    expect(list[1]).toMatchObject({ kind: 'note', text: 'Irony from the first sentence.' })
    expect(list[2]).toMatchObject({ color: 'rose', text: 'My dear Mr. Bennet,' })
    const paired = pairNotes(list)
    expect(paired).toHaveLength(2)
    expect(paired[0].note).toBe('Irony from the first sentence.')
  })

  it('parses the CSV export from the Kindle phone apps', () => {
    const list = parseKindleCsv(fx('kindle/notebook.csv'))
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({ title: 'Frankenstein', author: 'Mary Shelley', kind: 'highlight', location: '112', color: 'amber' })
    expect(list[1]).toMatchObject({ kind: 'note', text: 'Walton writing to his sister, "Mrs. Saville".' })
  })

  it('picks the parser from the file', () => {
    expect(parseKindleExport('My Clippings.txt', CLIPPINGS).length).toBeGreaterThan(3)
    expect(parseKindleExport('Pride.html', fx('kindle/notebook.html'))[0].title).toBe('Pride and Prejudice')
    expect(parseKindleExport('notes.csv', fx('kindle/notebook.csv'))[0].title).toBe('Frankenstein')
    expect(parseKindleExport('random.txt', 'just some text\nwith lines')).toEqual([])
  })
})

describe('Kindle: matching books', () => {
  const b = (title: string, author: string, extra: Partial<Book> = {}) => ({ id: title + author + (extra.format ?? ''), title, author, format: 'epub', addedAt: 1, ...extra }) as Book
  const lib = [b('Pride and Prejudice', 'Jane Austen'), b('Frankenstein', 'Mary Shelley'), b('Emma', 'Jane Austen')]
  it('matches the same title ignoring case, punctuation, articles and subtitles', () => {
    expect(matchBook('Pride and Prejudice', 'Jane Austen', lib)?.title).toBe('Pride and Prejudice')
    expect(matchBook('PRIDE AND PREJUDICE', '', lib)?.title).toBe('Pride and Prejudice')
    expect(matchBook('Frankenstein; Or, The Modern Prometheus', 'Mary Wollstonecraft Shelley', lib)?.title).toBe('Frankenstein')
  })
  it('does not match a different author or an unknown title', () => {
    expect(matchBook('Emma', 'Someone Else', lib)).toBeNull()
    expect(matchBook('The Art of War', 'Sun Tzu', lib)).toBeNull()
  })
  it('is not "obvious" when two different books share a title and Kindle gives no author', () => {
    const two = [...lib, b('Emma', 'A. Nother')]
    expect(matchBook('Emma', '', two)).toBeNull()
    expect(matchBook('Emma', 'Jane Austen', two)?.author).toBe('Jane Austen')
  })
  it('prefers the EPUB when the library has the same work in two formats', () => {
    const two = [b('Frankenstein', 'Mary Shelley', { format: 'pdf', addedAt: 9 }), b('Frankenstein', 'Mary Shelley')]
    expect(matchBook('Frankenstein', 'Mary Shelley', two)?.format).toBe('epub')
  })
})

describe('Kindle: attaching clippings to library books', () => {
  it('attaches to a matching local EPUB, anchored in the text, and parks the rest for review', async () => {
    const s = await freshStore()
    const pp = await importBytes(s, 'pride-and-prejudice.epub', sample('pride-and-prejudice.epub'))
    const res = await importClippings(s, parseMyClippings(CLIPPINGS))
    expect(res.attached).toBe(1)
    expect(res.books).toEqual([{ id: pp.bookId, title: 'Pride and Prejudice', count: 1 }])
    expect(res.bookmarks).toBe(1)
    expect(res.pending).toBe(3)                           // Frankenstein (not in library) + The Art of War (highlight + note)
    expect(res.unmatchedTitles.sort()).toEqual(['Frankenstein; Or, The Modern Prometheus', 'The Art of War'])

    const anns = await s.db.annotations.where('bookId').equals(pp.bookId!).toArray()
    expect(anns).toHaveLength(1)
    const a = anns[0]
    expect(a.orphaned).toBe(false)
    expect(a.section).toBeGreaterThanOrEqual(0)
    expect(a.exact).toMatch(/^It is a truth universally acknowledged/)
    expect(a.note).toBe('The most famous opening line in English.')
    expect(a.kind).toBe('note')
    expect(a.label).toBe('Kindle, page 1, location 7-8')
    expect(a.tags).toEqual(['kindle'])
    const text = (await s.db.texts.get([pp.bookId!, a.section]))!.text
    expect(text.slice(a.start, a.end)).toBe(a.exact)
    expect(a.prefix.length + a.suffix.length).toBeGreaterThan(0)
  })

  it('importing the same file again adds nothing', async () => {
    const s = await freshStore()
    await importBytes(s, 'p.epub', sample('pride-and-prejudice.epub'))
    await importClippings(s, parseMyClippings(CLIPPINGS))
    const again = await importClippings(s, parseMyClippings(CLIPPINGS))
    expect(again).toMatchObject({ attached: 0, pending: 0, already: 4 })
    expect(await s.db.annotations.count()).toBe(1)
    expect(await loadPending(s)).toHaveLength(3)
  })

  it('sits unmatched without crashing when the library is empty', async () => {
    const s = await freshStore()
    const res = await importClippings(s, parseMyClippings(CLIPPINGS))
    expect(res).toMatchObject({ attached: 0, pending: 4 })
    expect(await s.db.annotations.count()).toBe(0)
  })

  it('attaches waiting clippings once the book is added, or to a book the reader picks', async () => {
    const s = await freshStore()
    await importClippings(s, parseMyClippings(CLIPPINGS))
    const fr = await importBytes(s, 'frankenstein.epub', sample('frankenstein.epub'))
    expect(await autoAttachPending(s)).toBe(1)
    const fa = (await s.db.annotations.where('bookId').equals(fr.bookId!).toArray())[0]
    expect(fa.orphaned).toBe(false)
    expect(fa.exact).toMatch(/evil forebodings/)

    // The Art of War isn't in the library: the reader chooses a book by hand.
    const left = (await loadPending(s)).filter(c => c.title === 'The Art of War')
    expect(left).toHaveLength(2)
    const n = await attachPending(s, left.map(c => c.id), fr.bookId!)
    expect(n).toBe(2)
    const anns = await s.db.annotations.where('bookId').equals(fr.bookId!).toArray()
    const war = anns.filter(a => a.label.includes('location 41-42') || a.label.includes('location 300'))
    expect(war).toHaveLength(2)
    expect(war.find(a => a.kind === 'highlight')!.orphaned).toBe(true)     // the passage isn't in Frankenstein: kept, flagged
    expect(war.find(a => a.kind === 'note')).toMatchObject({ exact: '', note: 'Reread chapter on terrain.' })
    expect((await loadPending(s)).map(c => c.title)).toEqual(['Pride and Prejudice'])   // not in this library: still waiting
  })

  it('discarding removes items from the review list', async () => {
    const s = await freshStore()
    await importClippings(s, parseMyClippings(CLIPPINGS))
    const p = await loadPending(s)
    await discardPending(s, [p[0].id])
    expect(await loadPending(s)).toHaveLength(p.length - 1)
  })

  it('matches the CSV export (short title) to the library EPUB', async () => {
    const s = await freshStore()
    const fr = await importBytes(s, 'frankenstein.epub', sample('frankenstein.epub'))
    const res = await importClippings(s, parseKindleCsv(fx('kindle/notebook.csv')))
    expect(res).toMatchObject({ attached: 2, pending: 0 })
    const anns = await s.db.annotations.where('bookId').equals(fr.bookId!).toArray()
    expect(anns.find(a => a.note)!.note).toBe('Walton writing to his sister, "Mrs. Saville".')
  })
})

// ---------------------------------------------------------------- Calibre
const OPF = fx('calibre/metadata.opf')
const tf = (path: string, data: Uint8Array | string): TreeFile => ({ path, read: async () => (typeof data === 'string' ? strToU8(data) : data) })
/** An EPUB carrying Adobe ADEPT markers (rights.xml + encrypted content). */
function drmEpub() {
  const files = unzipSync(sample('frankenstein.epub'))
  files['META-INF/rights.xml'] = strToU8('<rights xmlns="http://ns.adobe.com/adept"><licenseToken/></rights>')
  files['META-INF/encryption.xml'] = strToU8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>')
  return zipSync(files)
}

describe('Calibre library import', () => {
  it('reads Calibre’s metadata.opf', () => {
    const m = parseCalibreOpf(OPF)
    expect(m).toMatchObject({ title: 'Pride and Prejudice (Calibre edition)', author: 'Jane Austen', series: 'Austen Novels', seriesIndex: 2, publisher: 'Standard Ebooks', language: 'eng' })
    expect(m.subjects).toEqual(['Fiction', 'Romance'])
    expect(m.identifiers).toContain('isbn:9780000000001')
    expect(m.identifiers!.some(i => i === '7')).toBe(false)   // calibre's internal id is dropped
  })

  it('falls back to Calibre’s folder names', () => {
    expect(metaFromFolders('Calibre Library/Jane Austen/Emma (12)')).toEqual({ title: 'Emma', author: 'Jane Austen' })
    expect(metaFromFolders('Unknown/Untitled (3)')).toEqual({ title: 'Untitled', author: undefined })
  })

  it('imports a mock tree: one folder, metadata.opf and an EPUB, with title and author', async () => {
    const s = await freshStore()
    const tree = [
      tf('Calibre Library/metadata.db', 'SQLite format 3'),
      tf('Calibre Library/Jane Austen/Pride and Prejudice (7)/metadata.opf', OPF),
      tf('Calibre Library/Jane Austen/Pride and Prejudice (7)/cover.jpg', new Uint8Array([0xff, 0xd8])),
      tf('Calibre Library/Jane Austen/Pride and Prejudice (7)/Pride and Prejudice - Jane Austen.epub', sample('pride-and-prejudice.epub')),
    ]
    expect(groupCalibreBooks(tree)).toHaveLength(1)
    const [r] = await importCalibre(s, tree)
    expect(r).toMatchObject({ status: 'added', title: 'Pride and Prejudice (Calibre edition)', author: 'Jane Austen', file: 'Pride and Prejudice - Jane Austen.epub', reasons: [] })
    const b = (await s.db.books.get(r.bookId!))!
    expect(b.title).toBe('Pride and Prejudice (Calibre edition)')       // from metadata.opf, not the EPUB
    expect(b.author).toBe('Jane Austen')
    expect(b.series).toBe('Austen Novels'); expect(b.seriesIndex).toBe(2)
    expect(b.format).toBe('epub')
    expect(await s.db.texts.where('bookId').equals(b.id).count()).toBeGreaterThan(10)
  })

  it('refuses a DRM-marked file with the existing message and says why for each book', async () => {
    const s = await freshStore()
    const tree = [
      tf('Mary Shelley/Frankenstein (3)/Frankenstein - Mary Shelley.epub', drmEpub()),
      tf('Mary Shelley/Frankenstein (3)/Frankenstein - Mary Shelley.azw3', new Uint8Array(10)),
      tf('Arthur Conan Doyle/The Adventures of Sherlock Holmes (4)/Sherlock.txt', sample('sherlock-holmes-sample.txt')),
      tf('Someone/Kindle Only (5)/Kindle Only - Someone.azw3', new Uint8Array(10)),
    ]
    const res = await importCalibre(s, tree)
    const fr = res.find(r => r.title === 'Frankenstein')!
    expect(fr.status).toBe('skipped')
    expect(fr.author).toBe('Mary Shelley')                  // no opf: from the folder names
    expect(fr.reasons).toEqual([`Frankenstein - Mary Shelley.epub: ${DRM_MESSAGE}`])
    expect(DRM_MESSAGE).toBe('This book is DRM-protected. SAGA doesn’t remove DRM, so it can’t be opened.')
    const sh = res.find(r => r.title === 'The Adventures of Sherlock Holmes')!
    expect(sh).toMatchObject({ status: 'added', author: 'Arthur Conan Doyle' })
    const ko = res.find(r => r.title === 'Kindle Only')!
    expect(ko.status).toBe('skipped'); expect(ko.reasons[0]).toMatch(/Only AZW3 here/)
    expect((await s.db.books.toArray()).map(b => b.title)).toEqual(['The Adventures of Sherlock Holmes'])
    expect(await s.db.files.count()).toBe(1)                  // nothing of the DRM file was stored
  })

  it('falls back to the next DRM-free format and reports the skipped one', async () => {
    const s = await freshStore()
    const res = await importCalibre(s, [
      tf('Mary Shelley/Frankenstein (3)/a.epub', drmEpub()),
      tf('Mary Shelley/Frankenstein (3)/a.pdf', sample('frankenstein-letters.pdf')),
    ])
    expect(res[0]).toMatchObject({ status: 'added', file: 'a.pdf', title: 'Frankenstein' })
    expect(res[0].reasons).toEqual([`a.epub: ${DRM_MESSAGE}`])
  })

  it('refuses Adobe-DRM PDFs without opening them', async () => {
    const pdf = strToU8('%PDF-1.6\n1 0 obj << /Filter /EBX_HANDLER /V 4 >> endobj\ntrailer << /Encrypt 1 0 R >>\n%%EOF')
    expect(isDrmPdf(pdf)).toBe(true)
    expect(isDrmPdf(sample('frankenstein-letters.pdf'))).toBe(false)
    const s = await freshStore()
    expect(await importBytes(s, 'x.pdf', pdf)).toMatchObject({ status: 'failed', error: DRM_MESSAGE })
  })

  it('imports a zip of a Calibre library', async () => {
    const zip = zipSync({
      'Calibre Library/metadata.db': strToU8('x'),
      'Calibre Library/Jane Austen/Pride and Prejudice (7)/metadata.opf': strToU8(OPF),
      'Calibre Library/Jane Austen/Pride and Prejudice (7)/book.epub': sample('pride-and-prejudice.epub'),
    })
    expect(zipLooksLikeCalibre(zip)).toBe(true)
    expect(zipLooksLikeCalibre(sample('frankenstein.epub'))).toBe(false)
    const files = filesFromZip(zip)
    expect(files.map(f => f.path).sort()).toEqual(['Calibre Library/Jane Austen/Pride and Prejudice (7)/book.epub', 'Calibre Library/Jane Austen/Pride and Prejudice (7)/metadata.opf'])
    const s = await freshStore()
    const [r] = await importCalibre(s, files)
    expect(r).toMatchObject({ status: 'added', title: 'Pride and Prejudice (Calibre edition)' })
  })
})

// ---------------------------------------------------------------- links
describe('Gutenberg and Standard Ebooks links', async () => {
  // standardebooks.ts imports the app store; give it a DOM-free localStorage-safe environment.
  const se = await import('../src/app/standardebooks')
  const gx = await import('../src/app/gutendex')
  const { store } = await import('../src/app/state')
  await store.init('Test')
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('recognises Gutenberg links', () => {
    for (const u of ['https://www.gutenberg.org/ebooks/1342', 'gutenberg.org/ebooks/1342', 'https://www.gutenberg.org/ebooks/1342.epub3.images', 'https://www.gutenberg.org/cache/epub/1342/pg1342-images-3.epub', 'https://www.gutenberg.org/files/1342/1342-0.txt', 'https://gutenberg.pglaf.org/1/3/4/1342/1342-0.txt'])
      expect(se.parseBookUrl(u), u).toEqual({ kind: 'gutenberg', id: 1342 })
  })

  it('recognises Standard Ebooks links and builds the direct EPUB URL', () => {
    const want = { kind: 'standardebooks', segments: ['jane-austen', 'pride-and-prejudice'], pageUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice', epubUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download' }
    for (const u of ['https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice', 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/', 'standardebooks.org/ebooks/jane-austen/pride-and-prejudice/text/chapter-1', 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.azw3', 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download'])
      expect(se.parseBookUrl(u), u).toEqual(want)
    expect(se.parseBookUrl('https://standardebooks.org/ebooks/leo-tolstoy/war-and-peace/louise-maude_aylmer-maude')!).toMatchObject({ epubUrl: 'https://standardebooks.org/ebooks/leo-tolstoy/war-and-peace/louise-maude_aylmer-maude/downloads/leo-tolstoy_war-and-peace_louise-maude_aylmer-maude.epub?source=download' })
    expect(se.parseBookUrl('https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma_advanced.epub')!).toMatchObject({ epubUrl: 'https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma_advanced.epub?source=download' })
    for (const u of ['https://standardebooks.org/ebooks/jane-austen', 'https://standardebooks.org/about', 'https://example.com/ebooks/a/b', 'not a url', 'https://evil.example/standardebooks.org/ebooks/a/b'])
      expect(se.parseBookUrl(u), u).toBeNull()
  })

  it('downloads Standard Ebooks EPUBs directly, never through the Gutenberg proxy', async () => {
    const calls: string[] = []
    // Like the real server: the EPUB only comes with ?source=download; without it, an HTML "download started" page.
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      calls.push(u); expect(init?.mode).toBe('cors')
      return new URL(u).searchParams.get('source') === 'download'
        ? new Response(sample('pride-and-prejudice.epub') as BodyInit, { headers: { 'content-type': 'application/epub+zip', 'access-control-allow-origin': '*' } })
        : new Response('<html><h1>Your Download Has Started!</h1></html>', { headers: { 'content-type': 'text/html' } })
    })
    const r = await se.importFromUrl('https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice')
    expect(calls).toEqual(['https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download'])
    expect(calls.some(c => c.startsWith(gx.PROXY))).toBe(false)
    expect(r.title).toBe('Pride and Prejudice')
    const b = (await store.db.books.get(r.bookId))!
    expect(b).toMatchObject({ source: 'catalog', catalogId: 'se~jane-austen~pride-and-prejudice', fileState: 'local' })
    expect((await store.db.files.get(b.hash))!.data.length).toBe(sample('pride-and-prejudice.epub').length)   // stored locally: readable offline
  })

  it('adds ?source=download to any Standard Ebooks EPUB URL, including old cached ones', async () => {
    expect(se.seDownload('https://standardebooks.org/ebooks/a/b/downloads/a_b.epub')).toBe('https://standardebooks.org/ebooks/a/b/downloads/a_b.epub?source=download')
    expect(se.seDownload('https://standardebooks.org/ebooks/a/b/downloads/a_b.epub?source=download')).toBe('https://standardebooks.org/ebooks/a/b/downloads/a_b.epub?source=download')
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return new Response(sample('frankenstein.epub') as BodyInit) })
    await se.getStandardEbook({ segments: ['mary-shelley', 'frankenstein'], pageUrl: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein', epubUrl: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub' })
    expect(calls).toEqual(['https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub?source=download'])
  })

  it('fetches the new-releases feed through the proxy (it has no CORS header)', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://standardebooks.org/ebooks/jane-austen/emma</id><title>Emma</title><link href="https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma.epub" rel="enclosure" type="application/epub+zip"/></entry></feed>') })
    const books = await se.fetchSENewReleases()
    expect(calls).toEqual([gx.PROXY + encodeURIComponent('https://standardebooks.org/feeds/atom/new-releases')])
    expect(books[0].epubUrl).toBe('https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma.epub?source=download')   // the download itself stays direct
    expect(books[0].epubUrl.startsWith(gx.PROXY)).toBe(false)
  })

  it('a failing feed throws, so Discover shows its fallback banner', async () => {
    vi.stubGlobal('fetch', async () => new Response('bad gateway', { status: 502 }))
    await expect(se.fetchSENewReleases()).rejects.toThrow(/feed didn’t answer \(502\)/)
  })

  it('reports an HTML page instead of an EPUB honestly', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Thanks for downloading</html>'))
    await expect(se.importFromUrl('https://standardebooks.org/ebooks/jane-austen/emma')).rejects.toThrow(/sent a page instead of the EPUB/)
  })

  it('a blocked download offers the file to download by hand', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch') })
    await expect(se.importFromUrl('https://standardebooks.org/ebooks/jane-austen/emma')).rejects.toBeInstanceOf(gx.DownloadBlocked)
  })

  it('Gutenberg links use Gutendex and the Gutenberg proxy', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(u)
      if (u.includes(encodeURIComponent('gutendex.com/books/84'))) return new Response(JSON.stringify({ id: 84, title: 'Frankenstein; Or, The Modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft', birth_year: 1797, death_year: 1851 }], subjects: [], bookshelves: [], languages: ['en'], copyright: false, media_type: 'Text', formats: { 'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images' }, download_count: 1 }))
      return new Response(sample('frankenstein.epub') as BodyInit)
    })
    const r = await se.importFromUrl('https://www.gutenberg.org/ebooks/84')
    expect(calls).toEqual([gx.PROXY + encodeURIComponent('https://gutendex.com/books/84'), gx.PROXY + encodeURIComponent('https://www.gutenberg.org/ebooks/84.epub3.images')])
    expect(r.title).toBe('Frankenstein')
  })

  it('refuses links from other sites', async () => {
    await expect(se.importFromUrl('https://example.com/book.epub')).rejects.toThrow(/Project Gutenberg .* or Standard Ebooks/)
  })

  it('parses the Standard Ebooks Atom feed, trusting only standardebooks.org links', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Standard Ebooks - New Releases</title>
  <entry>
    <id>https://standardebooks.org/ebooks/jane-austen/emma</id>
    <title>Emma</title>
    <author><name>Jane Austen</name></author>
    <summary type="text">A young woman meddles in the love lives of her friends.</summary>
    <link href="https://standardebooks.org/ebooks/jane-austen/emma" rel="alternate" type="application/xhtml+xml"/>
    <link href="https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma.epub" rel="enclosure" type="application/epub+zip" title="Recommended compatible epub"/>
    <link href="https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma_advanced.epub" rel="enclosure" type="application/epub+zip"/>
    <link href="https://standardebooks.org/images/covers/jane-austen_emma-cover-thumbnail.jpg" rel="http://opds-spec.org/image/thumbnail" type="image/jpeg"/>
  </entry>
  <entry>
    <id>https://evil.example/ebooks/a/b</id>
    <title>Not from SE</title>
  </entry>
  <entry>
    <id>urn:uuid:x</id>
    <title>The Odyssey</title>
    <link href="https://standardebooks.org/ebooks/homer/the-odyssey/william-cullen-bryant" rel="alternate"/>
    <link href="https://evil.example/odyssey.epub" rel="enclosure" type="application/epub+zip"/>
  </entry>
</feed>`
    const books = se.parseSEFeed(feed)
    expect(books).toHaveLength(2)
    expect(books[0]).toMatchObject({ title: 'Emma', author: 'Jane Austen', epubUrl: 'https://standardebooks.org/ebooks/jane-austen/emma/downloads/jane-austen_emma.epub?source=download', cover: 'https://standardebooks.org/images/covers/jane-austen_emma-cover-thumbnail.jpg' })
    expect(books[1]).toMatchObject({ title: 'The Odyssey', author: 'Homer', epubUrl: 'https://standardebooks.org/ebooks/homer/the-odyssey/william-cullen-bryant/downloads/homer_the-odyssey_william-cullen-bryant.epub?source=download' })
  })
})

// ---------------------------------------------------------------- no DRM circumvention
describe('no DRM circumvention', () => {
  it('no source file decrypts, strips or hooks Kindle or Adobe DRM', () => {
    const src = join(__dirname, '..', 'src')
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js)$/.test(f) && !f.endsWith('.d.ts')) files.push(p) } }
    walk(src)
    // Names of DRM-removal tools and the routines they are built from.
    const banned = [/\bdedrm\b/i, /\bineptepub\b/i, /\bineptpdf\b/i, /\bkindlekey\b/i, /\badobekey\b/i, /\bmobidedrm\b/i, /\bk4mobidedrm\b/i, /\bkfxdedrm\b/i, /\bdecryptBook\b/i, /\bremoveDrm\b/i, /\bstripDrm\b/i, /\bkindle\.serial\b/i, /\bPID\s*=/, /\bvoucher\b/i]
    // Code that recognises DRM markers may only refuse: it must not decrypt anything.
    const drmAware = /rights\.xml|EBX_HANDLER|Adobe\.APS|\badept\b|\.azw|\bkfx\b/i
    const decrypts = /\.decrypt\s*\(|createDecipheriv|unwrapKey|importKey/
    let checked = 0
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      for (const re of banned) expect(re.test(code), `${f} matches ${re}`).toBe(false)
      if (drmAware.test(code)) { checked++; expect(decrypts.test(code), `${f} recognises DRM and also decrypts`).toBe(false) }
    }
    expect(checked).toBeGreaterThanOrEqual(3)     // epub.ts, library.ts, calibre.ts at least
  })
})
