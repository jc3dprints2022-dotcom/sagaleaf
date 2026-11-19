// The single write path for user data. Each local edit:
//   1. updates the record, stamping every changed field with a hybrid logical clock,
//   2. appends an Op to the replication log,
// in one IndexedDB transaction. Remote ops are merged field by field. Concurrent
// note edits keep both texts; a deletion never beats an edit it had not seen.
import { SagaDB, TABLE_OF, type Clocked } from './db'
import type { Entity, Op, ReaderPrefs } from './types'
import { defaultPrefs } from './types'
import { Clock, uid } from './util'

type Listener = (tables: Set<string>) => void

/** Fields that describe this device, not the shared library. Never replicated. */
export const LOCAL_FIELDS: Partial<Record<Entity, string[]>> = { book: ['fileState', 'indexed', 'hasCover'], annotation: ['conflicts', '_heads', '_sup'] }

// ---- note versions
// Every note write is (clock, text, base clock). A version is a "head" until a
// later write is made on top of it. The note shown is the newest head; the other
// non-empty heads are the conflicting versions, kept until the user resolves
// them. Heads depend only on the set of writes, so all devices agree.
type NoteState = { _heads?: Record<string, string>; _sup?: string[]; noteResolved?: string[]; conflicts?: { note: string; device: string; at: string }[]; note?: string }
function addNoteWrite(r: NoteState, at: string, text: string, base: string | undefined) {
  const heads = { ...(r._heads ?? {}) }, sup = new Set(r._sup ?? [])
  if (base) { sup.add(base); delete heads[base] }
  if (!sup.has(at) && !(r.noteResolved ?? []).includes(at)) heads[at] = text
  r._heads = heads; r._sup = [...sup]
}
function resolveNotes(r: NoteState, clocks: string[]) {
  const all = new Set([...(r.noteResolved ?? []), ...clocks])
  r.noteResolved = [...all].sort()
  const heads = { ...(r._heads ?? {}) }, sup = new Set(r._sup ?? [])
  for (const h of all) { delete heads[h]; sup.add(h) }
  r._heads = heads; r._sup = [...sup]
}
function recomputeConflicts(r: NoteState, winnerAt: string | undefined) {
  r.conflicts = Object.entries(r._heads ?? {}).filter(([h, t]) => h !== winnerAt && t && t !== r.note).sort(([a], [b]) => (a < b ? -1 : 1)).map(([h, t]) => ({ note: t, device: h.split(':').slice(2).join(':'), at: h }))
}

export class Store {
  db: SagaDB
  clock!: Clock
  deviceId = ''
  deviceName = ''
  private listeners = new Set<Listener>()

  constructor(name?: string) { this.db = new SagaDB(name) }

  async init(defaultName = guessDeviceName()) {
    await this.db.open()
    let id = (await this.db.meta.get('deviceId'))?.value as string | undefined
    if (!id) { id = 'd' + uid(10); await this.db.meta.put({ key: 'deviceId', value: id }) }
    this.deviceId = id
    this.deviceName = ((await this.db.meta.get('deviceName'))?.value as string) ?? defaultName
    this.clock = new Clock(id)
    const last = await this.db.ops.orderBy('hlc').last()
    if (last) this.clock.observe(last.hlc)
    const lastSeen = (await this.db.meta.get('maxHlc'))?.value as string | undefined
    if (lastSeen) this.clock.observe(lastSeen)
    return this
  }

  on(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  emit(...tables: string[]) { const s = new Set(tables); for (const l of this.listeners) l(s) }

  async getMeta<T>(key: string, fallback: T): Promise<T> { return ((await this.db.meta.get(key))?.value as T) ?? fallback }
  async setMeta(key: string, value: unknown) { await this.db.meta.put({ key, value }); this.emit('meta') }
  async prefs(): Promise<ReaderPrefs> { return { ...defaultPrefs, ...(await this.getMeta<Partial<ReaderPrefs>>('prefs', {})) } }
  async setDeviceName(n: string) { this.deviceName = n; await this.setMeta('deviceName', n) }

  table(entity: Entity) { return this.db.table(TABLE_OF[entity]) }

  /** Local edit. Returns the merged record. */
  async put<T extends object>(entity: Entity, key: string, fields: Partial<T>, extraTables: string[] = []): Promise<Clocked<T>> {
    const t = this.table(entity)
    let result!: Clocked<T>
    await this.db.transaction('rw', [t, this.db.ops, ...extraTables.map(n => this.db.table(n))], async () => {
      const cur = ((await t.get(key)) ?? {}) as Clocked<T>
      const hlc = this.clock.tick()
      const c = { ...(cur._c ?? {}) }
      const base: Record<string, string | undefined> = {}
      const changed: Record<string, unknown> = {}
      let localChanged = false
      for (const [f, v] of Object.entries(fields)) {
        if (f === '_c' || f === 'id') continue
        const same = JSON.stringify((cur as Record<string, unknown>)[f]) === JSON.stringify(v)
        if (LOCAL_FIELDS[entity]?.includes(f)) { if (!same) localChanged = true; continue }
        if (same && c[f]) continue
        base[f] = c[f]; c[f] = hlc; changed[f] = v
      }
      // An annotation edit also asserts "not deleted" with its own clock, so an
      // edit and a delete made concurrently resolve the same way on every device
      // (newest wins) instead of depending on the order ops arrive in.
      if (entity === 'annotation' && Object.keys(changed).length && !('deleted' in fields) && !(cur as { deleted?: boolean }).deleted) {
        base.deleted = c.deleted; c.deleted = hlc; changed.deleted = false
      }
      if (entity === 'annotation' && 'noteResolved' in changed) changed.noteResolved = [...new Set([...((cur as NoteState).noteResolved ?? []), ...((changed.noteResolved as string[]) ?? [])])].sort()
      result = { ...cur, ...fields, ...(changed.deleted === false ? { deleted: false } : {}), ...('noteResolved' in changed ? { noteResolved: changed.noteResolved } : {}), id: key, _c: c } as Clocked<T>
      if (entity === 'annotation') {
        const r = result as unknown as NoteState
        if (!cur._c && !('note' in changed)) addNoteWrite(r, hlc, String(r.note ?? ''), undefined)
        if ('note' in changed) addNoteWrite(r, hlc, String(changed.note ?? ''), base.note)
        if ('noteResolved' in changed) resolveNotes(r, changed.noteResolved as string[])
        recomputeConflicts(r, c.note)
        if (!Object.keys(changed).length && JSON.stringify(r.conflicts) !== JSON.stringify((cur as NoteState).conflicts)) localChanged = true
      }
      if (!Object.keys(changed).length) { if (localChanged) await t.put(result); return }
      await t.put(result)
      await this.db.ops.add({ id: uid(), hlc, device: this.deviceId, entity, key, kind: 'put', fields: changed, base })
    })
    this.emit(TABLE_OF[entity])
    return result
  }

  /** Soft delete: the record stays (with its content) as a tombstone so it can
   *  replicate, and so annotations can be restored. */
  async remove(entity: Entity, key: string) {
    const t = this.table(entity)
    await this.db.transaction('rw', [t, this.db.ops], async () => {
      const cur = (await t.get(key)) as Clocked<Record<string, unknown>> | undefined
      if (!cur || cur.deleted) return
      const hlc = this.clock.tick()
      const base = { ...(cur._c ?? {}) }
      const c = { ...base, deleted: hlc }
      await t.put({ ...cur, deleted: true, _c: c })
      await this.db.ops.add({ id: uid(), hlc, device: this.deviceId, entity, key, kind: 'del', fields: { deleted: true }, base })
    })
    this.emit(TABLE_OF[entity])
  }

  /** Merge ops that came from another device. Idempotent and order-independent. */
  async apply(ops: Op[]): Promise<{ applied: number; conflicts: number; kept: number }> {
    let applied = 0, conflicts = 0, kept = 0
    const touched = new Set<string>()
    const tables = [...new Set(ops.map(o => TABLE_OF[o.entity]))].map(n => this.db.table(n))
    await this.db.transaction('rw', [...tables, this.db.meta], async () => {
      let max = ''
      for (const op of ops) {
        if (op.device === this.deviceId) continue
        this.clock.observe(op.hlc)
        if (op.hlc > max) max = op.hlc
        const t = this.table(op.entity)
        const cur = ((await t.get(op.key)) ?? { id: op.key }) as Clocked<Record<string, unknown>>
        const c = { ...(cur._c ?? {}) }
        const next: Record<string, unknown> = { ...cur }
        let changed = false
        if (op.entity === 'book' && !cur._c) { next.fileState = 'remote'; next.indexed = false; next.hasCover = false }
        const localOnly = LOCAL_FIELDS[op.entity] ?? []

        {
          // Deletes are an ordinary last-writer-wins field. Deleted records keep
          // their content (soft delete), so nothing is destroyed either way.
          for (const [f, v] of Object.entries(op.fields ?? {})) {
            if (localOnly.includes(f)) continue
            const local = c[f]
            const remoteWins = !local || op.hlc > local
            if (op.entity === 'annotation' && (f === 'note' || f === 'noteResolved')) {
              const n = next as NoteState, before = JSON.stringify([n._heads, n._sup, n.noteResolved])
              if (f === 'note') addNoteWrite(n, op.hlc, String(v ?? ''), op.base?.note)
              else resolveNotes(n, (v as string[]) ?? [])
              if (JSON.stringify([n._heads, n._sup, n.noteResolved]) !== before) changed = true
              if (f === 'noteResolved') { if (op.hlc > (local ?? '')) c[f] = op.hlc; continue }
            }
            if (remoteWins) { next[f] = v; c[f] = op.hlc; changed = true }
          }
        }
        if (op.entity === 'annotation' && changed) {
          const before = ((cur as NoteState).conflicts ?? []).length
          if (!cur._c && !(op.fields && 'note' in op.fields)) addNoteWrite(next as NoteState, op.hlc, String(next.note ?? ''), undefined)
          recomputeConflicts(next as NoteState, c.note)
          if (((next as NoteState).conflicts ?? []).length > before) conflicts++
        }
        if (changed) { next._c = c; await t.put(next); applied++; touched.add(t.name) }
      }
      if (max) await this.db.meta.put({ key: 'maxHlc', value: max })
    })
    if (touched.size) this.emit(...touched)
    return { applied, conflicts, kept }
  }

  /** Merge whole records from another copy of the library (account sync). Each
   *  field keeps the newer of the two clocks; note versions merge as sets, so
   *  concurrent note edits stay visible as conflicts, as with op-based sync.
   *  Idempotent and order-independent. Not added to the op log. */
  async mergeSnapshot(entity: 'annotation' | 'position', recs: Clocked<Record<string, unknown>>[]): Promise<number> {
    if (!recs.length) return 0
    const t = this.table(entity)
    const localOnly = LOCAL_FIELDS[entity] ?? []
    let applied = 0, max = ''
    await this.db.transaction('rw', [t, this.db.meta], async () => {
      for (const r of recs) {
        if (!r || typeof r.id !== 'string' || !r._c) continue
        const cur = (await t.get(r.id)) as Clocked<Record<string, unknown>> | undefined
        const next: Record<string, unknown> = cur ? { ...cur } : { id: r.id }
        const c: Record<string, string> = { ...(cur?._c ?? {}) }
        let changed = false
        for (const [f, at] of Object.entries(r._c as Record<string, string>)) {
          if (typeof at !== 'string') continue
          if (at > max) max = at
          if (localOnly.includes(f)) continue
          if (!c[f] || at > c[f]) { next[f] = r[f]; c[f] = at; changed = true }
        }
        if (entity === 'annotation') {
          const n = next as NoteState, rn = r as NoteState
          const before = JSON.stringify([n._heads, n._sup, n.noteResolved])
          const sup = new Set([...(n._sup ?? []), ...(rn._sup ?? [])])
          const resolved = new Set([...(n.noteResolved ?? []), ...(rn.noteResolved ?? [])])
          const heads: Record<string, string> = { ...(n._heads ?? {}), ...(rn._heads ?? {}) }
          for (const h of [...sup, ...resolved]) delete heads[h]
          n._heads = heads; n._sup = [...sup].sort(); n.noteResolved = [...resolved].sort()
          if (JSON.stringify([n._heads, n._sup, n.noteResolved]) !== before) changed = true
          if (changed) recomputeConflicts(n, c.note)
        }
        if (changed) { next._c = c; await t.put(next); applied++ }
      }
      if (max) {
        this.clock.observe(max)
        const prev = (await this.db.meta.get('maxHlc'))?.value as string | undefined
        if (!prev || max > prev) await this.db.meta.put({ key: 'maxHlc', value: max })
      }
    })
    if (applied) this.emit(TABLE_OF[entity])
    return applied
  }

  async opsAfter(seq: number, limit = 500) { return this.db.ops.where('seq').above(seq).limit(limit).toArray() }
  async lastSeq() { return (await this.db.ops.orderBy('seq').last())?.seq ?? 0 }
}

function guessDeviceName() {
  if (typeof navigator === 'undefined') return 'This device'
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /Linux/.test(ua) ? 'Linux' : 'Device'
  return `${os} browser`
}
