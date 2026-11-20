// App-side glue for library import: folder picking, Kindle highlight files and
// routing dropped files to the right importer. Everything runs in the page and
// writes to IndexedDB; there is no server-side book store.
import { store, toast } from './state'
import { importCalibre, filesFromZip, zipLooksLikeCalibre, type TreeFile, type CalibreResult } from '../core/calibre'
import { parseKindleExport, importClippings, autoAttachPending, type ClippingImportResult } from '../core/kindle'
import { isZip } from '../core/epub'
import { importFiles, importBackup } from '../core/library'
import { unzipSync, strFromU8 } from 'fflate'
import { PRODUCT } from './product'

// ---------------------------------------------------------------- folders
type DirHandle = { kind: 'directory'; name: string; values(): AsyncIterable<DirHandle | FileHandle> }
type FileHandle = { kind: 'file'; name: string; getFile(): Promise<File> }
const WANTED = /(\.(epub|pdf|txt|mobi|azw3?|kfx|prc|lit|fb2|djvu|cbz|cbr|docx|rtf)|(^|\/)metadata\.opf)$/i

async function walk(dir: DirHandle, prefix: string, out: TreeFile[]) {
  for await (const h of dir.values()) {
    const path = prefix ? `${prefix}/${h.name}` : h.name
    if (h.kind === 'directory') { if (!h.name.startsWith('.')) await walk(h, path, out) }
    else if (WANTED.test(path)) out.push({ path, read: async () => new Uint8Array(await (await h.getFile()).arrayBuffer()) })
  }
}

/** Lets the reader choose a folder. Uses the File System Access picker where
 *  the browser has it (Chrome, Edge, installed PWAs) and a webkitdirectory input
 *  elsewhere. Files are read one at a time, only when imported. */
export async function pickFolder(): Promise<TreeFile[] | null> {
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> }
  if (w.showDirectoryPicker) {
    try {
      const dir = await w.showDirectoryPicker({ id: 'saga-calibre', mode: 'read' })
      const out: TreeFile[] = []
      await walk(dir, '', out)
      return out
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null
      // SecurityError (e.g. inside a cross-origin frame): fall back to the input.
    }
  }
  return new Promise(resolve => {
    const i = document.createElement('input')
    i.type = 'file'; i.multiple = true
    i.setAttribute('webkitdirectory', ''); i.setAttribute('directory', '')
    i.onchange = () => resolve(filesFromInput([...(i.files ?? [])]))
    i.addEventListener('cancel', () => resolve(null))
    i.click()
  })
}

export function filesFromInput(files: File[]): TreeFile[] {
  return files
    .map(f => ({ f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }))
    .filter(x => WANTED.test(x.path))
    .map(({ f, path }) => ({ path, read: async () => new Uint8Array(await f.arrayBuffer()) }))
}

export async function runCalibreImport(files: TreeFile[], onProgress?: (done: number, total: number, last: CalibreResult) => void) {
  const results = await importCalibre(store, files, onProgress)
  if (results.some(r => r.status === 'added')) await autoAttachPending(store)
  return results
}

export async function calibreFromZipFile(f: File) {
  return filesFromZip(new Uint8Array(await f.arrayBuffer()))
}

// ---------------------------------------------------------------- Kindle
export async function importKindleFile(f: File): Promise<ClippingImportResult> {
  const text = new TextDecoder().decode(await f.arrayBuffer())
  const clippings = parseKindleExport(f.name, text)
  if (!clippings.length) throw new Error(`${f.name} has no Kindle highlights or notes ${PRODUCT.shortName} recognises. Use “My Clippings.txt” from your Kindle, or the notebook export (HTML or CSV) from a Kindle app.`)
  return importClippings(store, clippings)
}

export function kindleSummary(r: ClippingImportResult) {
  const parts = [
    r.attached && `${r.attached} highlight${r.attached === 1 ? '' : 's'} added to ${r.books.length} book${r.books.length === 1 ? '' : 's'}`,
    r.pending && `${r.pending} waiting for you to choose a book`,
    r.already && `${r.already} already imported`,
  ].filter(Boolean)
  return parts.join(', ') || 'Nothing new to import'
}

/** A dropped .txt/.html/.csv that is a Kindle export, not a book. */
export async function isKindleExport(f: File) {
  if (!/\.(txt|html?|csv)$/i.test(f.name) || f.size > 50_000_000) return false
  const head = new TextDecoder().decode(await f.slice(0, 4096).arrayBuffer())
  if (/\.txt$/i.test(f.name)) return /^﻿?[^\n]*\r?\n- [^\n]*\|[^\n]*\r?\n/.test(head) && /={10}/.test(head)
  if (/\.csv$/i.test(f.name)) return /Your Kindle Notes For/i.test(head)
  return /class\s*=\s*["']?(bookTitle|notebookFor)/.test(head)
}

export type ImportKind = 'book' | 'calibre' | 'kindle' | 'backup'
/** What a chosen file is, by looking inside it: a SAGA backup (library.json), a zipped Calibre library (metadata.opf),
 *  Kindle My Clippings.txt or a notebook export, or otherwise a book. */
export async function detectImport(f: File): Promise<ImportKind> {
  if (await isKindleExport(f)) return 'kindle'
  if (/\.zip$/i.test(f.name)) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    if (isZip(bytes)) {
      if (isSagaBackup(bytes)) return 'backup'
      if (zipLooksLikeCalibre(bytes)) return 'calibre'
    }
  }
  return 'book'
}
function isSagaBackup(zip: Uint8Array) {
  try { const m = JSON.parse(strFromU8(unzipSync(zip, { filter: e => e.name === 'library.json' })['library.json'] ?? new Uint8Array())); return m?.format === 'saga-library' } catch { return false }
}

export interface ImportOutcome { line: string; action?: { label: string; href: string } }
/** Routes each file to the importer for what it is, and answers with one line (plus a link when there is somewhere to go). */
export async function importAny(files: File[], onProgress?: (done: number, total: number) => void): Promise<ImportOutcome> {
  const books: File[] = [], lines: string[] = []
  let action: ImportOutcome['action']
  let done = 0
  for (const f of files) {
    try {
      const kind = await detectImport(f)
      if (kind === 'kindle') { const r = await importKindleFile(f); lines.push(`Kindle: ${kindleSummary(r)}`); action = { label: r.pending ? 'Review' : 'View highlights', href: '#/library?seg=highlights' } }
      else if (kind === 'backup') { const r = await importBackup(store, new Uint8Array(await f.arrayBuffer())); lines.push(`Restored ${r.books} book${r.books === 1 ? '' : 's'} and ${r.annotations} highlight${r.annotations === 1 ? '' : 's'}`); action = { label: 'Open Library', href: '#/library' } }
      else if (kind === 'calibre') { const res = await runCalibreImport(filesFromZip(new Uint8Array(await f.arrayBuffer()))); lines.push(calibreSummary(res)); action = { label: 'Open Library', href: '#/library' } }
      else books.push(f)
    } catch (e) { lines.push(`${f.name}: ${(e as Error).message}`) }
    onProgress?.(++done, files.length)
  }
  if (books.length) {
    const results = await importFiles(store, books)
    const added = results.filter(r => r.status === 'added' || r.status === 'restored'), dup = results.filter(r => r.status === 'duplicate'), failed = results.filter(r => r.status === 'failed')
    const attached = added.length ? await autoAttachPending(store).catch(() => 0) : 0
    if (results.length === 1) {
      const r = results[0]
      if (r.status === 'failed') lines.push(`${r.name}: ${r.error}`)
      else if (r.status === 'duplicate') { lines.push(`“${r.title}” is already in your library`); action = { label: 'Open', href: `#/book/${r.bookId}` } }
      else { lines.push(`Added “${r.title}”`); action = { label: 'Read now', href: `#/read/${r.bookId}` } }
    } else lines.push([added.length && `${added.length} added`, dup.length && `${dup.length} already in your library`, failed.length && `${failed.length} couldn’t be read`].filter(Boolean).join(', '))
    if (attached) lines.push(`${attached} Kindle highlight${attached === 1 ? '' : 's'} added to the new book${added.length === 1 ? '' : 's'}`)
  }
  return { line: lines.join('. '), action }
}

/** A chosen folder: a Calibre library when it has metadata.opf files, otherwise just the books in it. */
export async function importTree(files: TreeFile[], onProgress?: (done: number, total: number) => void): Promise<ImportOutcome> {
  if (files.some(f => /(^|\/)metadata\.opf$/i.test(f.path))) {
    const res = await runCalibreImport(files, (d, t) => onProgress?.(d, t))
    return { line: calibreSummary(res), action: { label: 'Open Library', href: '#/library' } }
  }
  const list = files.filter(f => /\.(epub|pdf|txt)$/i.test(f.path))
  if (!list.length) return { line: 'No books found in that folder.' }
  const file = await Promise.all(list.map(async f => new File([await f.read() as BlobPart], f.path.split('/').pop()!)))
  return importAny(file, onProgress)
}

/** Drop and file-picker import: one toast with the result. */
export async function importDropped(files: File[]) {
  const r = await importAny(files)
  toast(r.line || 'Nothing to import', r.action ? { label: r.action.label, run: () => { location.hash = r.action!.href } } : undefined, 7000)
  return r
}
export function calibreSummary(res: CalibreResult[]) {
  const added = res.filter(r => r.status === 'added').length, dup = res.filter(r => r.status === 'duplicate').length, skipped = res.filter(r => r.status === 'skipped').length
  return `Calibre: ${[`${added} book${added === 1 ? '' : 's'} added`, dup && `${dup} already in your library`, skipped && `${skipped} skipped`].filter(Boolean).join(', ')}`
}
