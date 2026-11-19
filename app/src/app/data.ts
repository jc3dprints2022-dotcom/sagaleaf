import { store, toast, go } from './state'
import type { Annotation, Book, Collection, Member, Position } from '../core/types'
import { importFiles, importBytes, removeBook, type ImportResult } from '../core/library'
import { hlcTime, uid } from '../core/util'
import { autoAttachPending } from '../core/kindle'

export interface BookView extends Book { progress: number; lastAt: number; lastDevice?: string; position?: Position; positions: Position[] }

export async function loadBooks(): Promise<BookView[]> {
  const [books, positions] = await Promise.all([store.db.books.toArray(), store.db.positions.toArray()])
  const byBook = new Map<string, Position[]>()
  for (const p of positions) if (!p.deleted) (byBook.get(p.bookId) ?? byBook.set(p.bookId, []).get(p.bookId)!).push(p)
  return books.filter(b => !b.deleted).map(b => {
    const ps = (byBook.get(b.id) ?? []).sort((x, y) => (x.at < y.at ? 1 : -1))
    const latest = ps[0]
    return { ...b, positions: ps, position: latest, progress: latest?.fraction ?? 0, lastAt: latest ? hlcTime(latest.at) : 0, lastDevice: latest?.deviceName }
  })
}

export async function loadAnnotations(bookId?: string): Promise<Annotation[]> {
  const list = bookId ? await store.db.annotations.where('bookId').equals(bookId).toArray() : await store.db.annotations.toArray()
  return list.sort((a, b) => a.fraction - b.fraction || a.start - b.start)
}

export async function importWithFeedback(files: File[], onProgress?: (done: number, total: number, r: ImportResult) => void) {
  const results = await importFiles(store, files, onProgress)
  const added = results.filter(r => r.status === 'added' || r.status === 'restored')
  const dup = results.filter(r => r.status === 'duplicate')
  const failed = results.filter(r => r.status === 'failed')
  // Kindle highlights waiting for one of these books attach themselves now.
  const attached = added.length ? await autoAttachPending(store).catch(() => 0) : 0
  if (attached) toast(`${attached} Kindle highlight${attached === 1 ? '' : 's'} added to the new book${added.length === 1 ? '' : 's'}`, { label: 'View', run: () => go('notes') })
  if (results.length === 1) {
    const r = results[0]
    if (r.status === 'failed') toast(`${r.name}: ${r.error}`, undefined, 7000)
    else if (r.status === 'duplicate') toast(`“${r.title}” is already in your library`, { label: 'Open', run: () => go(`book/${r.bookId}`) })
    else toast(`Added “${r.title}”`, { label: 'Read now', run: () => go(`read/${r.bookId}`) })
  } else {
    toast([added.length && `${added.length} added`, dup.length && `${dup.length} already in your library`, failed.length && `${failed.length} couldn’t be read`].filter(Boolean).join(', '), undefined, 6000)
  }
  return results
}

export const SAMPLE_BOOKS = ['pride-and-prejudice.epub', 'frankenstein.epub', 'the-adventures-of-sherlock-holmes.epub', 'moby-dick.epub', 'frankenstein-letters.pdf']
export async function addSamples() {
  let n = 0
  const list: [string, string][] = import.meta.env.VITE_STANDALONE === '1'
    ? (await import('./embeddedSamples')).EMBEDDED_SAMPLES
    : SAMPLE_BOOKS.map(name => [name, `${import.meta.env.BASE_URL}samples/${name}`])
  for (const [name, url] of list) {
    const r = await fetch(url)
    if (!r.ok) continue
    const res = await importBytes(store, name, new Uint8Array(await r.arrayBuffer()))
    if (res.status !== 'failed') n++
  }
  toast(`Added ${n} public-domain books`)
}

export async function setStatus(id: string, status: Book['status']) { await store.put<Book>('book', id, { status }) }
export async function editBook(id: string, fields: Partial<Book>) { await store.put<Book>('book', id, fields) }

export async function deleteBookWithUndo(b: Book) {
  await removeBook(store, b.id)
  toast(`Removed “${b.title}”. Highlights are kept and come back if you re-import it.`, undefined, 6000)
}

// collections
export async function loadCollections() {
  const [cols, mems] = await Promise.all([store.db.collections.toArray(), store.db.members.toArray()])
  return cols.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ ...c, bookIds: mems.filter(m => m.collectionId === c.id && !m.deleted).map(m => m.bookId) }))
}
export async function createCollection(name: string) { const id = 'c' + uid(10); await store.put<Collection>('collection', id, { name: name.trim(), createdAt: Date.now() }); return id }
export async function renameCollection(id: string, name: string) { await store.put<Collection>('collection', id, { name: name.trim() }) }
export async function deleteCollection(id: string) { await store.remove('collection', id) }
export async function setMembership(collectionId: string, bookId: string, member: boolean) {
  const key = `${collectionId}:${bookId}`
  if (member) await store.put<Member>('member', key, { collectionId, bookId, deleted: false })
  else await store.remove('member', key)
}

export function downloadBytes(name: string, data: Uint8Array | string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function pickFiles(accept = '.epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain', multiple = true): Promise<File[]> {
  return new Promise(resolve => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple
    i.onchange = () => resolve([...(i.files ?? [])]); i.click()
  })
}
