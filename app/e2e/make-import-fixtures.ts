// Regenerates e2e/fixtures/import/* (a small EPUB, a Calibre library zip, My Clippings.txt, a SAGA backup zip).
// Usage: npx tsx e2e/make-import-fixtures.ts
import 'fake-indexeddb/auto'
import '../tests/node-dom'
import { writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { Store } from '../src/core/store'
import { importBytes, exportLibrary } from '../src/core/library'
import { asEpub } from '../bench/gen'

const out = (n: string) => fileURLToPath(new URL(`./fixtures/import/${n}`, import.meta.url))
const book = (title: string, author: string) => ({ title, author, chapters: [`${title} opens quietly. It was a truth acknowledged by all who read it that the second sentence follows the first. `.repeat(40), `Second chapter of ${title}. `.repeat(60)] })

const epub = asEpub(book('Fixture Tale', 'Ada Marsh'))
writeFileSync(out('book.epub'), epub)

const opf = (t: string) => `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${t}</dc:title><dc:creator>Calibre Author</dc:creator></metadata></package>`
writeFileSync(out('calibre-library.zip'), zipSync({
  'Calibre Library/Calibre Author/Shelf Book (1)/book.epub': asEpub(book('Shelf Book', 'Calibre Author')),
  'Calibre Library/Calibre Author/Shelf Book (1)/metadata.opf': strToU8(opf('Shelf Book')),
} as never))

copyFileSync(fileURLToPath(new URL('../tests/fixtures/kindle/My Clippings.txt', import.meta.url)), out('My Clippings.txt'))

const s = new Store('fixture-backup'); await s.init('Fixture device')
const r = await importBytes(s, 'backup-tale.epub', asEpub(book('Backup Tale', 'Bea Backup')))
await s.put('annotation', 'fx1', { bookId: r.bookId, kind: 'highlight', color: 'amber', exact: 'opens quietly', prefix: '', suffix: '', start: 0, end: 13, section: 0, note: 'from the backup', tags: [], createdAt: 1, updatedAt: 1, fraction: 0.01, label: 'Ch 1' } as never)
writeFileSync(out('saga-backup.zip'), await exportLibrary(s))
console.log('fixtures written')
process.exit(0)
