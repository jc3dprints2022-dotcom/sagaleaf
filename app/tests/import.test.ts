import { describe, it, expect } from 'vitest'
import { freshStore, sample } from './helpers'
import { importBytes, bookTexts, removeBook, sweepOrphans, detectFormat, searchText } from '../src/core/library'
import { parseEpub, validateEpub } from '../src/core/epub'
import { Store } from '../src/core/store'
import { strToU8, zipSync } from 'fflate'

describe('book import and parsing', () => {
  it('imports an EPUB with metadata, cover, sections and text', async () => {
    const s = await freshStore()
    const r = await importBytes(s, 'pride-and-prejudice.epub', sample('pride-and-prejudice.epub'))
    expect(r.status).toBe('added')
    const b = (await s.db.books.get(r.bookId!))!
    expect(b.title).toBe('Pride and Prejudice')
    expect(b.author).toBe('Jane Austen')
    expect(b.language).toBe('en-GB')
    expect(b.format).toBe('epub')
    expect(b.hasCover).toBe(true)
    expect(b.sections).toBeGreaterThan(60)
    const texts = await bookTexts(s, b.id)
    const all = texts.map(t => t.text).join('\n')
    expect(all).toContain('It is a truth universally acknowledged')
    expect(texts.filter(t => t.title).length).toBeGreaterThan(60)
  })

  it('extracts EPUB metadata fields', () => {
    const p = parseEpub(sample('frankenstein.epub'))
    expect(p.title).toMatch(/Frankenstein/)
    expect(p.author).toBe('Mary Shelley')
    expect(p.identifiers.length).toBeGreaterThan(0)
    expect(p.subjects.length).toBeGreaterThan(0)
    expect(p.description).toBeTruthy()
    expect(p.cover?.type).toMatch(/^image\//)
    expect(p.drm).toBe(false)
    expect(p.sections[0].path).toMatch(/^epub\//)
  })

  it('imports a PDF with its text layer, one section per page', async () => {
    const s = await freshStore()
    const r = await importBytes(s, 'frankenstein-letters.pdf', sample('frankenstein-letters.pdf'))
    expect(r.status, r.error).toBe('added')
    const b = (await s.db.books.get(r.bookId!))!
    expect(b.format).toBe('pdf')
    expect(b.title).toBe('Frankenstein (Letters)')
    expect(b.author).toBe('Mary Shelley')
    expect(b.sections).toBe(13)
    const t = await bookTexts(s, b.id)
    expect(t.map(x => x.text).join(' ')).toMatch(/St\.\s*Petersburgh/)
  })

  it('imports a Gutenberg TXT, strips the licence and finds chapters', async () => {
    const s = await freshStore()
    const r = await importBytes(s, 'sherlock-holmes-sample.txt', sample('sherlock-holmes-sample.txt'))
    expect(r.status).toBe('added')
    const b = (await s.db.books.get(r.bookId!))!
    expect(b.title).toBe('The Adventures of Sherlock Holmes')
    expect(b.author).toBe('Arthur Conan Doyle')
    const t = await bookTexts(s, b.id)
    expect(t.length).toBeGreaterThanOrEqual(4)
    expect(t[0].text).toMatch(/^To Sherlock Holmes she is always the woman/)
    expect(t.map(x => x.text).join('')).not.toContain('licence text')
  })

  it('rejects DRM, Kindle formats and junk with readable messages', async () => {
    const s = await freshStore()
    const drm = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>'),
      'META-INF/encryption.xml': strToU8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>'),
      'c.opf': strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>X</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'),
      'a.xhtml': strToU8('<html><body><p>secret</p></body></html>'),
    })
    expect((await importBytes(s, 'locked.epub', drm)).error).toMatch(/DRM/)
    expect((await importBytes(s, 'book.azw3', new Uint8Array([1, 2, 0, 4]))).error).toMatch(/Kindle formats/)
    expect((await importBytes(s, 'book.acsm', strToU8('<fulfillmentToken/>'))).error).toMatch(/DRM/)
    expect((await importBytes(s, 'broken.epub', zipSync({ 'x.txt': strToU8('hi') }))).error).toMatch(/not a valid EPUB/)
    expect(detectFormat('photo.jpg', new Uint8Array([0xff, 0xd8, 0, 0, 1]))).toHaveProperty('error')
    expect(await s.db.books.count()).toBe(0)
  })

  it('validates an EPUB for the author portal', () => {
    const v = validateEpub(sample('moby-dick.epub'))
    expect(v.parsed?.title).toBe('Moby Dick')
    expect(v.words).toBeGreaterThan(200_000)
    expect(v.issues.filter(i => i.level === 'error')).toHaveLength(0)
    const bad = validateEpub(new Uint8Array([1, 2, 3]))
    expect(bad.issues[0].level).toBe('error')
  })
})

describe('duplicate detection', () => {
  it('detects the exact same file by content hash, whatever its name', async () => {
    const s = await freshStore()
    const a = await importBytes(s, 'frankenstein.epub', sample('frankenstein.epub'))
    const b = await importBytes(s, 'copy (1).epub', sample('frankenstein.epub'))
    expect(b.status).toBe('duplicate')
    expect(b.bookId).toBe(a.bookId)
    expect(await s.db.books.count()).toBe(1)
  })
  it('flags a different file of the same work as a possible duplicate', async () => {
    const s = await freshStore()
    const a = await importBytes(s, 'sherlock.epub', sample('the-adventures-of-sherlock-holmes.epub'))
    const b = await importBytes(s, 'sherlock.txt', sample('sherlock-holmes-sample.txt'))
    expect(b.status).toBe('added')
    expect(b.possibleDuplicateOf).toEqual([a.bookId])
  })
  it('restores a deleted book when it is imported again, keeping its id', async () => {
    const s = await freshStore()
    const a = await importBytes(s, 'f.epub', sample('frankenstein.epub'))
    await removeBook(s, a.bookId!)
    expect((await s.db.books.get(a.bookId!))!.deleted).toBe(true)
    const b = await importBytes(s, 'f.epub', sample('frankenstein.epub'))
    expect(b.status).toBe('restored')
    expect((await s.db.books.get(a.bookId!))!.deleted).toBe(false)
  })
})

describe('library persistence', () => {
  it('keeps books, text and settings across a restart', async () => {
    const name = 'persist-' + Math.random()
    const s1 = new Store(name); await s1.init('Laptop')
    const r = await importBytes(s1, 'p.epub', sample('pride-and-prejudice.epub'))
    await s1.setMeta('prefs', { size: 22 })
    s1.db.close()
    const s2 = new Store(name); await s2.init('Laptop')
    expect(s2.deviceId).toBe(s1.deviceId)
    expect((await s2.db.books.get(r.bookId!))!.title).toBe('Pride and Prejudice')
    expect((await s2.prefs()).size).toBe(22)
    expect((await s2.db.files.get((await s2.db.books.get(r.bookId!))!.hash))!.data.length).toBe(sample('pride-and-prejudice.epub').length)
  })
  it('sweeps rows left by an import that crashed before the book was saved', async () => {
    const s = await freshStore()
    await s.db.files.put({ hash: 'dead', data: new Uint8Array(3), type: 'x', size: 3 })
    await s.db.texts.put({ bookId: 'ghost', section: 0, title: '', text: 'x' })
    await importBytes(s, 'f.epub', sample('frankenstein.epub'))
    expect(await sweepOrphans(s)).toBe(2)
    expect(await s.db.books.count()).toBe(1)
  })
})

describe('search', () => {
  it('finds passages in one book and across the library', async () => {
    const s = await freshStore()
    const p = await importBytes(s, 'p.epub', sample('pride-and-prejudice.epub'))
    await importBytes(s, 'f.epub', sample('frankenstein.epub'))
    const inBook = await searchText(s, 'universally acknowledged', { bookId: p.bookId })
    expect(inBook.length).toBeGreaterThanOrEqual(1)
    expect(inBook[0].match.toLowerCase()).toBe('universally acknowledged')
    const t = (await bookTexts(s, p.bookId!))[inBook[0].section].text
    expect(t.slice(inBook[0].start, inBook[0].end).toLowerCase()).toBe('universally acknowledged')
    const lib = await searchText(s, 'Geneva')
    expect(new Set(lib.map(h => h.bookId)).size).toBe(1)
    expect(await searchText(s, 'x')).toEqual([])
  })
})

describe('series metadata', () => {
  it('does not mistake a reading-list collection for a series', () => {
    expect(parseEpub(sample('pride-and-prejudice.epub')).series).toBeUndefined()
  })
})
