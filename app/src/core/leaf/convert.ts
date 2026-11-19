// Conversion to what the Leaf reads best. Firmware 1.0.0 opens EPUB, but any
// chapter larger than its ~18 KB of contiguous heap fails to load, so — exactly
// like the firmware's own phone web interface — books are sent as cleaned plain
// text, which the device streams and splits into bounded chapters itself.
// The EPUB path reuses the firmware project's converter verbatim.
import { convertEpubToText, cleanPlainText } from '../../vendor/leaf-epub-convert.js'
import { decodeText } from '../txt'
import type { Store } from '../store'
import type { Book } from '../types'
import { bookTexts } from '../library'
import { sha256 } from '../util'

export interface LeafPayload { filename: string; data: Uint8Array; sha256: string; chars: number }
const cache = new Map<string, LeafPayload>()

export async function toLeafText(store: Store, book: Book): Promise<LeafPayload> {
  if (cache.has(book.hash)) return cache.get(book.hash)!
  let text: string
  if (book.format === 'epub') {
    const f = await store.db.files.get(book.hash)
    if (!f) throw new Error('The book file isn’t on this device yet.')
    text = (await convertEpubToText(f.data.slice().buffer)).text
  } else if (book.format === 'txt') {
    const f = await store.db.files.get(book.hash)
    if (!f) throw new Error('The book file isn’t on this device yet.')
    text = cleanPlainText(decodeText(f.data))
  } else {
    text = (await bookTexts(store, book.id)).map(t => t.text.replace(/-\n(?=\p{Ll})/gu, '').replace(/([^\n])\n(?!\n)/g, '$1 ')).join('\n\n\n') + '\n'
  }
  const data = new TextEncoder().encode(text)
  const safe = book.title.replace(/[^\w .()'-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'book'
  const p = { filename: `${safe}.txt`, data, sha256: await sha256(data), chars: text.length }
  cache.set(book.hash, p)
  return p
}
