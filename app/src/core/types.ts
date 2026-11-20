// Shared data model. Everything here is plain JSON so it can cross the sync
// boundary, be exported, and be reused by future native clients.

export type Format = 'epub' | 'pdf' | 'txt'
export type Hlc = string

export interface Book {
  id: string
  hash: string            // sha-256 of the original file: identity for dedupe + blob sync
  format: Format
  title: string
  author: string
  sortTitle: string
  language?: string
  publisher?: string
  description?: string
  published?: string
  series?: string
  seriesIndex?: number
  subjects: string[]
  identifiers: string[]
  size: number
  addedAt: number
  source: 'import' | 'catalog'
  catalogId?: string
  sourceUrl?: string       // where the file came from (a pasted link), so another device can fetch it again
  license?: string         // catalog items only: the licence the entitlement was granted under
  hasCover: boolean
  tint: number             // hue for generated covers
  fileState: 'local' | 'remote'   // 'remote' = metadata arrived by sync, file not on this device yet
  status: 'new' | 'reading' | 'finished'
  indexed: boolean
  sections: number
  chars: number
  filename?: string
}

export interface Position {
  id: string               // `${bookId}:${deviceId}`; each device only ever writes its own row
  bookId: string
  deviceId: string
  deviceName: string
  cfi?: string
  section: number
  offset: number           // character offset inside the section's text
  fraction: number         // 0..1 through the whole book
  snippet: string          // the first words on screen, for cross-format relocation
  at: Hlc
}

export type AnnotationKind = 'highlight' | 'note' | 'bookmark'
export interface NoteConflict { note: string; device: string; at: Hlc }
export interface Annotation {
  id: string
  bookId: string
  kind: AnnotationKind
  section: number
  start: number
  end: number
  exact: string            // quoted text; with prefix/suffix this re-anchors after layout or edition changes
  prefix: string
  suffix: string
  cfi?: string
  note: string
  color: string
  tags: string[]
  label: string            // chapter title at creation
  fraction: number
  createdAt: number
  updatedAt: number
  deleted?: boolean        // soft delete: content is kept and restorable
  orphaned?: boolean       // could not be placed in the current text; kept, never dropped
  conflicts?: NoteConflict[]   // computed locally from note versions; never replicated
  noteResolved?: string[]      // clocks of conflicting versions the user dismissed (replicated as a union)
  origin?: string          // device that created it
}

export interface Collection { id: string; name: string; createdAt: number; deleted?: boolean }
export interface Member { id: string; collectionId: string; bookId: string; deleted?: boolean }

export type Entity = 'book' | 'annotation' | 'position' | 'collection' | 'member'

/** One replicated change. `base` records the clock of each field the editor
 *  had seen, which lets a receiver tell a clean overwrite from a concurrent edit. */
export interface Op {
  id: string
  hlc: Hlc
  device: string
  entity: Entity
  key: string
  kind: 'put' | 'del'
  fields?: Record<string, unknown>
  base?: Record<string, Hlc | undefined>
}

export interface Peer {
  id: string
  kind: 'relay' | 'leaf'
  name: string
  url: string
  token?: string
  secret?: string          // relay: library secret (never sent to the server)
  pushedSeq: number
  pulledCursor: number
  lastSyncAt?: number
  lastError?: string
  syncFiles: boolean       // user authorisation to move book files through this peer
  leaf?: LeafState
}

export interface LeafState {
  protocol: 1 | 2
  firmware?: string
  product?: string
  map: Record<string, string>          // saga book id -> leaf book id
  seenRev: Record<string, number>      // leaf progress revision last pulled, per book
  pushedAt: Record<string, Hlc>        // app position last pushed, per book
  send: Record<string, boolean>        // books the user wants on the Leaf
  annRev: Record<string, number>       // device annotation revision last pulled, per book
  annPushedAt: Record<string, number>  // app annotation updatedAt last pushed, per book
  deviceId?: string
  autoSend: boolean
  storage?: { capacityBytes: number; usedBytes: number; bookCount: number }
  battery?: { available: boolean; percent: number | null; state: string }
}

export interface Transfer {
  id: string
  peerId: string
  bookId: string
  title: string
  state: 'queued' | 'sending' | 'paused' | 'done' | 'failed'
  size: number
  sent: number
  uploadId?: string
  error?: string
  attempts: number
  updatedAt: number
}

export interface ReaderPrefs {
  theme: 'auto' | 'day' | 'warm' | 'mist' | 'night'
  font: string
  size: number
  lineHeight: number
  margin: number
  justify: boolean
  hyphenate: boolean
  flow: 'paginated' | 'scrolled'
  maxWidth: number
  publisherStyles: boolean
}

export const defaultPrefs: ReaderPrefs = {
  theme: 'auto', font: 'Literata', size: 18, lineHeight: 1.55, margin: 6,
  justify: false, hyphenate: true, flow: 'paginated', maxWidth: 680, publisherStyles: false,
}
