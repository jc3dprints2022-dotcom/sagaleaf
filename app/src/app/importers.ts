// App-side glue for library import: folder picking, Kindle highlight files and
// routing dropped files to the right importer. Everything runs in the page and
// writes to IndexedDB; there is no server-side book store.
import { store, toast, go } from './state'
import { importWithFeedback } from './data'
import { importCalibre, filesFromZip, zipLooksLikeCalibre, type TreeFile, type CalibreResult } from '../core/calibre'
import { parseKindleExport, importClippings, autoAttachPending, type ClippingImportResult } from '../core/kindle'
import { isZip } from '../core/epub'

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
  if (!clippings.length) throw new Error(`${f.name} has no Kindle highlights or notes SAGA recognises. Use “My Clippings.txt” from your Kindle, or the notebook export (HTML or CSV) from a Kindle app.`)
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

/** Drop and file-picker import: books go to the library as before; Kindle
 *  exports go to highlights; a zipped Calibre library goes to the Calibre importer. */
export async function importDropped(files: File[]) {
  const books: File[] = []
  for (const f of files) {
    try {
      if (await isKindleExport(f)) {
        const r = await importKindleFile(f)
        toast(`Kindle: ${kindleSummary(r)}`, r.pending ? { label: 'Review', run: () => go('notes') } : undefined, 7000)
        continue
      }
      if (/\.zip$/i.test(f.name)) {
        const bytes = new Uint8Array(await f.arrayBuffer())
        if (isZip(bytes) && zipLooksLikeCalibre(bytes)) {
          const res = await runCalibreImport(filesFromZip(bytes))
          toast(calibreSummary(res), undefined, 7000)
          continue
        }
      }
    } catch (e) { toast(`${f.name}: ${(e as Error).message}`, undefined, 7000); continue }
    books.push(f)
  }
  if (books.length) await importWithFeedback(books)
}

export function calibreSummary(res: CalibreResult[]) {
  const added = res.filter(r => r.status === 'added').length, dup = res.filter(r => r.status === 'duplicate').length, skipped = res.filter(r => r.status === 'skipped').length
  return `Calibre: ${[`${added} book${added === 1 ? '' : 's'} added`, dup && `${dup} already in your library`, skipped && `${skipped} skipped`].filter(Boolean).join(', ')}`
}
