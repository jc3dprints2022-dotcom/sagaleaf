// Local database. IndexedDB via Dexie: survives restarts, works offline, and
// every write that matters happens inside one transaction so a crash mid-import
// or mid-sync never leaves half a book or half an annotation behind.
import Dexie, { type Table } from 'dexie'
import type { Annotation, Book, Collection, Member, Op, Peer, Position, Transfer } from './types'

export type Clocked<T> = T & { _c?: Record<string, string>; deleted?: boolean }
export interface FileRow { hash: string; data: Uint8Array; type: string; size: number }
export interface CoverRow { bookId: string; data: Uint8Array; type: string }
export interface TextRow { bookId: string; section: number; title: string; text: string }
export interface OpRow extends Op { seq?: number }
/** Per-book parse results, kept so reopening a book (and the first page) doesn't re-read every section. */
export interface ParsedRow { bookId: string; lengths: number[]; titles: string[]; toc?: unknown }
export interface MetaRow { key: string; value: unknown }

export class SagaDB extends Dexie {
  books!: Table<Clocked<Book>, string>
  files!: Table<FileRow, string>
  covers!: Table<CoverRow, string>
  texts!: Table<TextRow, [string, number]>
  positions!: Table<Clocked<Position>, string>
  annotations!: Table<Clocked<Annotation>, string>
  collections!: Table<Clocked<Collection>, string>
  members!: Table<Clocked<Member>, string>
  ops!: Table<OpRow, number>
  peers!: Table<Peer, string>
  transfers!: Table<Transfer, string>
  meta!: Table<MetaRow, string>
  parsed!: Table<ParsedRow, string>

  constructor(name = 'saga-reader') {
    super(name)
    this.version(1).stores({
      books: 'id, hash, addedAt, sortTitle, author, status, catalogId',
      files: 'hash',
      covers: 'bookId',
      texts: '[bookId+section], bookId',
      positions: 'id, bookId, at',
      annotations: 'id, bookId, updatedAt, kind',
      collections: 'id, name',
      members: 'id, collectionId, bookId',
      ops: '++seq, &id, hlc',
      peers: 'id, kind',
      transfers: 'id, peerId, bookId, state',
      meta: 'key',
    })
    this.version(2).stores({ parsed: 'bookId' })
  }
}

export const TABLE_OF = {
  book: 'books', annotation: 'annotations', position: 'positions', collection: 'collections', member: 'members',
} as const
