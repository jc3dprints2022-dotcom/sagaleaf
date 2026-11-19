// Node benchmarks (fake-indexeddb, in-memory). Real browser IndexedDB numbers
// come from bench/browser.ts. Results are written to bench/results.json.
import 'fake-indexeddb/auto'
import { Window } from 'happy-dom'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import MiniSearch from 'minisearch'
const g = globalThis as Record<string, unknown>
g.DOMParser = new Window().DOMParser
const { Store } = await import('../src/core/store')
const { importBytes, searchText } = await import('../src/core/library')
const { SyncEngine, addRelayPeer } = await import('../src/core/sync/engine')
const { newLibrarySecret } = await import('../src/core/sync/crypto')
const { startPlatform } = await import('../server/platform')
const { makeBook, asTxt, asEpub, rnd } = await import('./gen')
const { LeafDevice } = await import('../sim/leaf-sim')
const { syncLeaf, addLeafPeer } = await import('../src/core/leaf/sync')
const { LeafClient } = await import('../src/core/leaf/client')
import type { Annotation } from '../src/core/types'

const out: Record<string, unknown> = { at: new Date().toISOString(), env: `node ${process.version}, fake-indexeddb (in-memory), ${(await import('node:os')).cpus().length} CPU` }
const t = () => performance.now()
const pctl = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) }

// ---------- 1. bulk import: 1,000 books (half EPUB, half TXT, 2% exact duplicates, 1% broken)
{
  const s = new Store('bench-import'); await s.init('Bench')
  const N = Number(process.env.N ?? 1000)
  const times: number[] = []; let added = 0, dup = 0, failed = 0, badExpected = 0
  const t0 = t()
  const kept: Uint8Array[] = []
  for (let i = 0; i < N; i++) {
    let bytes: Uint8Array, name: string
    if (i % 100 === 37) { bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]); name = `broken-${i}.epub`; badExpected++ }
    else if (i % 50 === 13 && kept.length) { bytes = kept[Math.floor(rnd() * kept.length)]; name = `copy-${i}.epub` }
    else { const b = makeBook(i, 15_000 + Math.floor(rnd() * 30_000)); bytes = i % 2 ? asEpub(b) : asTxt(b); name = `${b.title}.${i % 2 ? 'epub' : 'txt'}`; if (kept.length < 50) kept.push(bytes) }
    const a = t(); const r = await importBytes(s, name, bytes); times.push(t() - a)
    if (r.status === 'added') added++; else if (r.status === 'duplicate') dup++; else failed++
  }
  const total = t() - t0
  out.bulkImport = { books: N, added, duplicatesDetected: dup, failed, expectedFailures: badExpected, unexpectedFailures: failed - badExpected, totalSeconds: +(total / 1000).toFixed(1), perBookMs: { p50: pctl(times, 0.5), p95: pctl(times, 0.95), max: pctl(times, 1) }, booksPerSecond: +(N / (total / 1000)).toFixed(1) }
  // full-text passage search across the whole imported library
  const st: number[] = []
  for (const q of ['Baker Street', 'hansom', 'the photograph', 'a singular case', 'zzzz-no-match']) { const a = t(); await searchText(s, q, { limit: 200 }); st.push(t() - a) }
  out.fullTextSearchAcrossLibrary = { books: added, queries: 5, ms: { p50: pctl(st, 0.5), max: pctl(st, 1) }, note: 'Scans the local text index; includes a no-match query, which reads every book.' }
  console.log('bulk import', out.bulkImport, out.fullTextSearchAcrossLibrary)
}

// ---------- 2. 10,000-book library: open, sort, filter, metadata search
{
  const s = new Store('bench-10k'); await s.init('Bench')
  const N = 10_000
  const rows = Array.from({ length: N }, (_, i) => { const b = makeBook(i, 10); return { id: 'b' + i.toString(16).padStart(15, '0'), hash: 'h' + i, format: 'epub', title: b.title, author: b.author, sortTitle: b.title.toLowerCase(), subjects: ['fiction'], identifiers: [], size: 500_000, addedAt: Date.now() - i * 1000, source: 'import', hasCover: false, tint: i % 360, fileState: 'local', status: 'new', indexed: true, sections: 20, chars: 400_000 } })
  await s.db.books.bulkPut(rows as never)
  await s.db.positions.bulkPut(rows.slice(0, 3000).map((b, i) => ({ id: `${b.id}:d`, bookId: b.id, deviceId: 'd', deviceName: 'x', section: 1, offset: 0, fraction: (i % 100) / 100, snippet: '', at: String(i).padStart(15, '0') + ':00000:d' })) as never)
  const reps: number[] = []
  for (let k = 0; k < 5; k++) {
    const a = t()
    const [books, pos] = await Promise.all([s.db.books.toArray(), s.db.positions.toArray()])
    const by = new Map<string, number>(); for (const p of pos) by.set(p.bookId, p.fraction)
    const view = books.map(b => ({ ...b, progress: by.get(b.id) ?? 0 })).sort((x, y) => x.sortTitle.localeCompare(y.sortTitle))
    void view.filter(b => b.progress > 0); reps.push(t() - a)
  }
  const books = await s.db.books.toArray()
  const a = t(); const ms = new MiniSearch({ fields: ['title', 'author'], storeFields: ['id'], searchOptions: { prefix: true, fuzzy: 0.2 } }); ms.addAll(books); const build = t() - a
  const qs: number[] = []; for (const q of ['lantern', 'marsh', 'copper hol', 'meridan', 'tanaka winter']) { const b = t(); ms.search(q); qs.push(t() - b) }
  out.library10k = { books: N, loadSortFilterMs: { p50: pctl(reps, 0.5), max: pctl(reps, 1) }, searchIndexBuildMs: +build.toFixed(0), metadataSearchMs: { p50: pctl(qs, 0.5), max: pctl(qs, 1) }, note: 'Metadata-only rows; covers load lazily per visible tile.' }
  console.log('10k library', out.library10k)
}

// ---------- 3. sync data-loss stress with random network failures
{
  const dir = mkdtempSync(join(tmpdir(), 'saga-bench-')); const srv = await startPlatform({ port: 0, dir, quiet: true })
  const url = `http://127.0.0.1:${srv.port}`, secret = newLibrarySecret()
  const flaky = (p: number): typeof fetch => async (u, i) => { if (rnd() < p) throw new Error('injected network failure'); return fetch(u, i) }
  const devs = await Promise.all(['Phone', 'Laptop', 'Tablet'].map(async n => { const s = new Store('bench-sync-' + n); await s.init(n); await addRelayPeer(s, url, secret, false); return { s, e: new SyncEngine(s, flaky(0.3)) } }))
  const written = new Map<string, Set<string>>()   // annotation id -> every note text ever written
  const created = new Set<string>()
  const ROUNDS = 60
  let failures = 0
  for (let r = 0; r < ROUNDS; r++) {
    for (const { s } of devs) {
      for (let k = 0; k < 4; k++) {
        const roll = rnd()
        const existing = [...created]
        if (roll < 0.45 || !existing.length) {
          const id = 'a' + Math.floor(rnd() * 1e12).toString(36)
          created.add(id); written.set(id, new Set(['']))
          await s.put<Annotation>('annotation', id, { bookId: 'bk', kind: 'highlight', section: 1, start: 0, end: 5, exact: 'x' + id, prefix: '', suffix: '', note: '', color: 'amber', tags: [], label: '', fraction: 0, createdAt: 1, updatedAt: 1 })
        } else if (roll < 0.9) {
          const id = existing[Math.floor(rnd() * existing.length)]
          const note = `${s.deviceName} r${r} k${k}`
          written.get(id)!.add(note)
          await s.put<Annotation>('annotation', id, { note, updatedAt: Date.now() })
        } else {
          await s.remove('annotation', existing[Math.floor(rnd() * existing.length)])
        }
      }
    }
    for (const { e } of devs) { const res = await e.syncRelay((await e.store.db.peers.toArray())[0]); failures += res.errors.length }
  }
  // network heals: sync until quiet
  for (const d of devs) d.e = new SyncEngine(d.s)
  for (let k = 0; k < 3; k++) for (const { e } of devs) await e.syncAll()
  let missing = 0, diverged = 0, lostNotes = 0, checkedNotes = 0
  const snap = async (s: InstanceType<typeof Store>) => new Map((await s.db.annotations.toArray()).map(a => [a.id, a]))
  const maps = await Promise.all(devs.map(d => snap(d.s)))
  for (const id of created) {
    const vs = maps.map(m => m.get(id))
    if (vs.some(v => !v)) { missing++; continue }
    if (new Set(vs.map(v => JSON.stringify([v!.note, v!.deleted, (v!.conflicts ?? []).map(c => c.note).sort()]))).size > 1) { diverged++; if (diverged <= 2 && process.env.DEBUG) console.log('DIVERGED', id, vs.map(v => JSON.stringify({ note: v!.note, del: v!.deleted, conf: (v!.conflicts ?? []).map(c => c.note), c: v!._c }))) }
    // every note ever written must be the final note, a preserved conflict, or superseded by a later edit made on top of it
  }
  // Exact loss check from causality: collect every note write from every device's
  // op log. A version is superseded if a later edit was made on top of it
  // (its clock appears as that edit's base). Lost = not superseded, and neither
  // the final note nor a kept conflict on the converged record.
  const allOps = (await Promise.all(devs.map(d => d.s.db.ops.toArray()))).flat().filter(o => o.entity === 'annotation')
  for (const id of created) {
    const v = maps[0].get(id); if (!v) continue
    const kept = new Set([v.note, ...(v.conflicts ?? []).map(c => c.note)])
    const writes = allOps.filter(o => o.key === id && o.fields && 'note' in o.fields && o.fields.note)
    const superseded = new Set(allOps.filter(o => o.key === id && o.base && 'note' in (o.fields ?? {})).map(o => o.base!.note))
    for (const w of writes) { checkedNotes++; if (!superseded.has(w.hlc) && !kept.has(w.fields!.note as string)) lostNotes++ }
  }
  out.syncStress = {
    devices: 3, rounds: ROUNDS, annotationsCreated: created.size, injectedFailureRate: 0.3, syncRoundsThatHitAFailure: failures,
    annotationsMissingOnAnyDevice: missing, devicesDisagreeingAfterConvergence: diverged,
    noteVersionsWritten: checkedNotes, noteVersionsLost: lostNotes,
    note: 'A note version counts as lost only if no later edit was made on top of it and it is neither the final note nor a kept conflict.',
  }
  console.log('sync stress', out.syncStress)
  await srv.close()
}

// ---------- 4. Leaf transfer interruption stress
{
  const dev = new LeafDevice({ dir: mkdtempSync(join(tmpdir(), 'leaf-bench-')), port: 0, protocol: 2, quiet: true })
  const srv = await dev.listen(); const url = `http://127.0.0.1:${srv.port}`
  const s = new Store('bench-leaf'); await s.init('Phone')
  const { readFileSync } = await import('node:fs')
  const sample = (n: string) => new Uint8Array(readFileSync(new URL(`../public/samples/${n}`, import.meta.url)))
  const r = await importBytes(s, 'moby.epub', sample('moby-dick.epub'))
  const c = new LeafClient(url); const h = await c.hello(); const { pairingId } = await c.pairStart(s.deviceId, 'bench')
  const code = (await (await fetch(url + '/sim/state')).json()).pairing.code
  const peer = await addLeafPeer(s, h, (await c.pairConfirm(pairingId, code)).token)
  peer.leaf!.send[r.bookId!] = true
  let drops = 0, attempts = 0
  const a = t()
  for (;;) {
    attempts++
    if (attempts <= 12) { await fetch(url + '/sim/faults', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dropUploadAfterBytes: Math.floor(attempts * 90_000 + rnd() * 60_000) }) }); drops++ }
    const res = await syncLeaf(s, peer)
    if (!res.errors.length && peer.leaf!.map[r.bookId!]) break
    if (attempts > 40) break
  }
  const st = await (await fetch(url + '/sim/state')).json()
  const leafBook = st.books[0]
  const { toLeafText } = await import('../src/core/leaf/convert')
  const payload = await toLeafText(s, (await s.db.books.get(r.bookId!))!)
  out.leafTransferStress = { bookBytes: payload.data.length, injectedDrops: drops, syncAttempts: attempts, completed: !!leafBook, checksumMatches: leafBook?.sha256 === payload.sha256, totalMs: Math.round(t() - a) }
  console.log('leaf transfer stress', out.leafTransferStress)
  await srv.close()
}

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('written bench/results.json')
process.exit(0)
