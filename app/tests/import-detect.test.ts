// The Add pop-up looks inside each file: a book, a Calibre library zip, Kindle clippings or a SAGA backup.
import './node-dom'
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boot, store } from '../src/app/state'
import { detectImport, importAny } from '../src/app/importers'

const fxFile = (n: string, type = '') => new File([readFileSync(join(__dirname, '..', 'e2e', 'fixtures', 'import', n))], n, { type })
beforeAll(async () => { await boot() })

describe('import auto-detect', () => {
  it('tells the four kinds apart', async () => {
    expect(await detectImport(fxFile('book.epub'))).toBe('book')
    expect(await detectImport(fxFile('calibre-library.zip'))).toBe('calibre')
    expect(await detectImport(fxFile('My Clippings.txt'))).toBe('kindle')
    expect(await detectImport(fxFile('saga-backup.zip'))).toBe('backup')
    expect(await detectImport(new File(['just some plain text, a story.\n\nSecond paragraph.'], 'story.txt'))).toBe('book')
  })
  it('routes each to its importer and answers with one line', async () => {
    const book = await importAny([fxFile('book.epub')])
    expect(book.line).toBe('Added “Fixture Tale”'); expect(book.action?.label).toBe('Read now')
    expect((await importAny([fxFile('book.epub')])).line).toBe('“Fixture Tale” is already in your library')
    expect((await importAny([fxFile('calibre-library.zip')])).line).toBe('Calibre: 1 book added')
    const backup = await importAny([fxFile('saga-backup.zip')])
    expect(backup.line).toBe('Restored 1 book and 1 highlight')
    const kindle = await importAny([fxFile('My Clippings.txt')])
    expect(kindle.line).toMatch(/^Kindle: /)
    const titles = (await store.db.books.toArray()).filter(b => !b.deleted).map(b => b.title).sort()
    expect(titles).toEqual(['Backup Tale', 'Fixture Tale', 'Shelf Book'])
  })
})
