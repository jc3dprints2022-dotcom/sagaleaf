// SAGA Leaf sync. Reconciles books, transfers, reading positions and
// annotations between the app and one Leaf, using text anchors because the
// Leaf reads a converted plain-text copy whose offsets differ from the app's.
import type { Store } from '../store'
import type { Annotation, Book, Peer, Position, Transfer, LeafState } from '../types'
import type { Fetch, SyncResult } from '../sync/engine'
import { LeafClient, LeafError, type LeafBook } from './client'
import { toLeafText } from './convert'
import { bookTexts } from '../library'
import { findQuote, absoluteFraction, quoteAt } from '../anchor'
import { sha256, uid } from '../util'

const empty = (): SyncResult => ({ pushed: 0, pulled: 0, applied: 0, conflicts: 0, kept: 0, uploaded: 0, downloaded: 0, errors: [] })
export const emptyLeafState = (protocol: 1 | 2): LeafState => ({ protocol, map: {}, seenRev: {}, pushedAt: {}, send: {}, autoSend: true, annRev: {}, annPushedAt: {} })

export interface LeafSyncEvents { onTransfer?: (t: Transfer) => void }

export async function syncLeaf(store: Store, peer: Peer, f?: Fetch, ev: LeafSyncEvents = {}): Promise<SyncResult> {
  const res = empty()
  const L = peer.leaf ?? emptyLeafState(1)
  const c = new LeafClient(peer.url, peer.token, f)
  const save = async () => { peer.leaf = L; await store.db.peers.put(peer); store.emit('peers') }
  try {
    // 1. state
    let books: LeafBook[]
    if (L.protocol === 2) {
      const s = await c.state()
      L.storage = s.storage; L.battery = s.battery; books = s.books
    } else {
      const s = await c.status()
      L.storage = s.storage; L.battery = s.battery; L.firmware = s.firmware
      books = await c.books()
    }
    const byLeafId = new Map(books.map(b => [b.id, b]))
    // forget mappings for books removed on the device; adopt books the device says came from SAGA
    for (const [sid, lid] of Object.entries(L.map)) if (!byLeafId.has(lid)) { delete L.map[sid]; delete L.seenRev[sid]; delete L.annRev[sid] }
    for (const b of books) if (b.sagaId && !L.map[b.sagaId]) L.map[b.sagaId] = b.id
    const lib = (await store.db.books.toArray()).filter(b => !b.deleted)
    if (L.protocol === 1) {
      // firmware 1.0.0 has no ids to match on; pair by title + author
      for (const b of books) {
        if (Object.values(L.map).includes(b.id)) continue
        const m = lib.find(x => x.title === b.title && (x.author === b.author || b.author === 'Unknown'))
        if (m) L.map[m.id] = b.id
      }
    }
    await save()

    // 2. transfers. With auto-send on, books you're in the middle of go to the Leaf
    // unless you switched them off for this device (send[id] === false).
    if (L.autoSend) {
      const pos = await store.db.positions.toArray()
      for (const b of lib) {
        if (L.send[b.id] !== undefined || b.status === 'finished') continue
        if (pos.some(p => p.bookId === b.id && !p.deleted && p.fraction > 0.002 && p.fraction < 0.995)) L.send[b.id] = true
      }
    }
    const wanted = lib.filter(b => L.send[b.id] && !L.map[b.id] && b.fileState === 'local')
    for (const b of wanted) {
      const ok = await transfer(store, peer, c, b, L, ev).catch(e => { res.errors.push(`${b.title}: ${(e as Error).message}`); return false })
      if (ok) res.uploaded++
      await save()
    }
    if (res.uploaded) {
      if (L.protocol === 2) { const s = await c.state(); L.storage = s.storage; books = s.books }
      else { const s = await c.status(); L.storage = s.storage; books = await c.books() }
    }

    // 3. positions and annotations
    if (L.protocol === 2) {
      for (const b of books) {
        const sid = Object.keys(L.map).find(k => L.map[k] === b.id)
        if (!sid) continue
        const book = lib.find(x => x.id === sid)
        if (!book || !book.indexed) continue
        await syncPosition(store, peer, c, book, b, L, res)
        await syncAnnotations(store, peer, c, book, b, L, res)
        await save()
      }
    } else {
      await importV1Notes(store, peer, c, lib, L, res)
    }
    peer.lastSyncAt = Date.now(); peer.lastError = undefined
  } catch (e) {
    res.errors.push((e as Error).message); peer.lastError = (e as Error).message
  }
  await save()
  return res
}

async function transfer(store: Store, peer: Peer, c: LeafClient, b: Book, L: LeafState, ev: LeafSyncEvents) {
  const tid = `${peer.id}:${b.id}`
  const prev = await store.db.transfers.get(tid)
  const t: Transfer = { id: tid, peerId: peer.id, bookId: b.id, title: b.title, state: 'sending', size: 0, sent: prev?.sent ?? 0, attempts: (prev?.attempts ?? 0) + 1, updatedAt: Date.now() }
  const put = async (patch: Partial<Transfer>) => { Object.assign(t, patch, { updatedAt: Date.now() }); await store.db.transfers.put(t); ev.onTransfer?.(t); store.emit('transfers') }
  try {
    const p = await toLeafText(store, b)
    await put({ size: p.data.length })
    if (L.storage && p.data.length > L.storage.capacityBytes - L.storage.usedBytes) throw new LeafError(`Not enough room on the SAGA Leaf (${Math.round((L.storage.capacityBytes - L.storage.usedBytes) / 1024)} KB free).`, 507)
    const id = L.protocol === 2
      ? await c.uploadV2({ filename: p.filename, size: p.data.length, sha256: p.sha256, title: b.title, author: b.author, sagaId: b.id }, p.data, sent => void put({ sent }))
      : await c.uploadV1(p.filename, p.data, b.title, b.author, sent => void put({ sent }))
    L.map[b.id] = id; L.seenRev[b.id] = 0; L.annRev[b.id] = 0
    await put({ state: 'done', sent: p.data.length, error: undefined })
    return true
  } catch (e) {
    await put({ state: (e as LeafError).status === 507 ? 'failed' : 'paused', error: (e as Error).message })
    throw e
  }
}

async function texts(store: Store, id: string) { return (await bookTexts(store, id)).map(t => t.text) }

async function syncPosition(store: Store, peer: Peer, c: LeafClient, book: Book, lb: LeafBook, L: LeafState, res: SyncResult) {
  const seen = L.seenRev[book.id] ?? 0
  const rows = (await store.db.positions.where('bookId').equals(book.id).toArray()).filter(p => !p.deleted)
  const leafRowId = `${book.id}:${peer.id}`
  let deviceMoved = false
  if ((lb.progressRev ?? 0) > seen) {
    const p = await c.getProgress(lb.id)
    const tx = await texts(store, book.id)
    const m = p.snippet ? findQuote(tx, { exact: p.snippet }, { fraction: p.fraction }) : null
    const lens = tx.map(t => t.length)
    const section = m?.section ?? 0, offset = m?.start ?? 0
    await store.put<Position>('position', leafRowId, { bookId: book.id, deviceId: peer.id, deviceName: peer.name, section, offset, fraction: m ? absoluteFraction(lens, section, offset) : p.fraction, snippet: p.snippet, at: store.clock.tick() })
    L.seenRev[book.id] = p.rev
    deviceMoved = true; res.pulled++
  }
  // newest position from any other device (phone, laptop, another Leaf)
  const others = rows.filter(r => r.deviceId !== peer.id).sort((a, b) => (a.at < b.at ? 1 : -1))
  const latest = others[0]
  if (!latest || deviceMoved) return   // device was read since last sync: don't overwrite it; the app offers to jump instead
  if ((L.pushedAt[book.id] ?? '') >= latest.at) return
  try {
    const r = await c.putProgress(lb.id, { snippet: latest.snippet, fraction: latest.fraction, baseRev: L.seenRev[book.id] ?? 0, from: latest.deviceName })
    L.seenRev[book.id] = r.rev; L.pushedAt[book.id] = latest.at; res.pushed++
    await store.put<Position>('position', leafRowId, { bookId: book.id, deviceId: peer.id, deviceName: peer.name, section: latest.section, offset: latest.offset, fraction: latest.fraction, snippet: latest.snippet, at: latest.at })
  } catch (e) {
    if ((e as LeafError).status !== 409) throw e   // someone turned a page on the SAGA Leaf in between; pulled next round
  }
}

async function syncAnnotations(store: Store, peer: Peer, c: LeafClient, book: Book, lb: LeafBook, L: LeafState, res: SyncResult) {
  const since = L.annRev[book.id] ?? 0
  if ((lb.annotationRev ?? 0) > since) {
    const { rev, annotations } = await c.getAnnotations(lb.id, since)
    const tx = await texts(store, book.id)
    const lens = tx.map(t => t.length)
    for (const a of annotations) {
      const id = a.sagaId ?? `leaf-${peer.id}-${a.id}`
      const cur = await store.db.annotations.get(id)
      if (cur) {
        const patch: Partial<Annotation> = {}
        if (a.note !== cur.note) patch.note = a.note
        if (!!a.deleted !== !!cur.deleted) patch.deleted = !!a.deleted
        if (Object.keys(patch).length) { await store.put<Annotation>('annotation', id, { ...patch, updatedAt: Date.now() }); res.applied++ }
        continue
      }
      if (a.deleted) continue
      const m = findQuote(tx, { exact: a.selected })
      const q = m ? quoteAt(tx[m.section], m.start, m.end) : { exact: a.selected, prefix: '', suffix: '' }
      await store.put<Annotation>('annotation', id, {
        bookId: book.id, kind: a.kind === 'note' && !a.note ? 'highlight' : a.kind, section: m?.section ?? -1, start: m?.start ?? 0, end: m?.end ?? 0, ...q,
        note: a.note, color: 'amber', tags: [], label: a.location, fraction: m ? absoluteFraction(lens, m.section, m.start) : 0,
        createdAt: Date.now(), updatedAt: Date.now(), orphaned: !m, origin: peer.name,
      })
      res.applied++
    }
    L.annRev[book.id] = rev
  }
  // push app-side changes made since the last push (excluding ones that came from this Leaf)
  const after = L.annPushedAt[book.id] ?? 0
  const mine = (await store.db.annotations.where('bookId').equals(book.id).toArray())
    .filter(a => a.updatedAt > after && !a.id.startsWith(`leaf-${peer.id}-`) && a.kind !== 'bookmark')
  if (mine.length) {
    const r = await c.postAnnotations(lb.id, mine.map(a => ({ sagaId: a.id, kind: a.kind, exact: a.exact, note: a.note, deleted: !!a.deleted, fraction: a.fraction }))) as { rev: number }
    L.annPushedAt[book.id] = Math.max(...mine.map(a => a.updatedAt))
    // our own push bumped the device revision; don't pull it back as new
    if ((L.annRev[book.id] ?? 0) === since || since === 0) L.annRev[book.id] = Math.max(L.annRev[book.id] ?? 0, r.rev)
    res.pushed += mine.length
  }
}

/** Firmware 1.0.0 exposes notes read-only and without ids: import one way, deduplicated by content. */
async function importV1Notes(store: Store, peer: Peer, c: LeafClient, lib: Book[], L: LeafState, res: SyncResult) {
  const notes = await c.notesV1()
  for (const n of notes) {
    const sid = Object.keys(L.map).find(k => L.map[k] === n.bookId)
    const book = lib.find(b => b.id === sid)
    if (!book || !book.indexed || !n.text) continue
    const id = `leaf1-${(await sha256(new TextEncoder().encode(peer.id + n.bookId + n.text + n.note))).slice(0, 20)}`
    if (await store.db.annotations.get(id)) continue
    const tx = await texts(store, book.id)
    const m = findQuote(tx, { exact: n.text })
    const q = m ? quoteAt(tx[m.section], m.start, m.end) : { exact: n.text, prefix: '', suffix: '' }
    await store.put<Annotation>('annotation', id, { bookId: book.id, kind: n.note ? 'note' : 'highlight', section: m?.section ?? -1, start: m?.start ?? 0, end: m?.end ?? 0, ...q, note: n.note, color: 'amber', tags: [], label: n.location, fraction: m ? absoluteFraction(tx.map(t => t.length), m.section, m.start) : 0, createdAt: Date.now(), updatedAt: Date.now(), orphaned: !m, origin: peer.name })
    res.applied++
  }
}

export async function addLeafPeer(store: Store, hello: { url: string; name: string; protocol: 1 | 2; deviceId?: string; firmware?: string }, token: string): Promise<Peer> {
  const id = 'leaf-' + (hello.deviceId ?? uid(8)).replace(/^leaf-/, '')
  const existing = await store.db.peers.get(id)
  const peer: Peer = existing ?? { id, kind: 'leaf', name: hello.name, url: hello.url, token, pushedSeq: 0, pulledCursor: 0, syncFiles: true, leaf: emptyLeafState(hello.protocol) }
  peer.url = hello.url; peer.token = token
  peer.leaf = { ...(peer.leaf ?? emptyLeafState(hello.protocol)), protocol: hello.protocol, firmware: hello.firmware, deviceId: hello.deviceId }
  await store.db.peers.put(peer); store.emit('peers')
  return peer
}
