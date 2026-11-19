// @vitest-environment node
// Randomised convergence test: 3 devices edit, delete and annotate concurrently
// while 30% of sync requests fail. After the network heals every device must
// hold the same state, nothing may be missing, and no note version may be lost.
import './node-dom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startPlatform } from '../server/platform'
import { SyncEngine, addRelayPeer } from '../src/core/sync/engine'
import { newLibrarySecret } from '../src/core/sync/crypto'
import { freshStore } from './helpers'
import type { Annotation } from '../src/core/types'
import type { Store } from '../src/core/store'

let srv: { port: number; close: () => Promise<void> }
beforeAll(async () => { srv = await startPlatform({ port: 0, dir: mkdtempSync(join(tmpdir(), 'saga-st-')), quiet: true }) })
afterAll(async () => { await srv.close() })

async function run(seed: number) {
  let s0 = seed
  const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const url = `http://127.0.0.1:${srv.port}`, secret = newLibrarySecret()
  const flaky: typeof fetch = async (u, i) => { if (rnd() < 0.3) throw new Error('injected'); return fetch(u, i) }
  const devs: { s: Store; e: SyncEngine }[] = []
  for (const n of ['Phone', 'Laptop', 'Tablet']) { const s = await freshStore(undefined, n); await addRelayPeer(s, url, secret, false); devs.push({ s, e: new SyncEngine(s, flaky) }) }
  const ids: string[] = []
  for (let r = 0; r < 25; r++) {
    for (const { s } of devs) for (let k = 0; k < 3; k++) {
      const roll = rnd()
      if (roll < 0.4 || !ids.length) { const id = `a${seed}-${r}-${k}-${s.deviceName}`; ids.push(id); await s.put<Annotation>('annotation', id, { bookId: 'b', kind: 'highlight', section: 0, start: 0, end: 1, exact: id, prefix: '', suffix: '', note: '', color: 'amber', tags: [], label: '', fraction: 0, createdAt: 1, updatedAt: 1 }) }
      else if (roll < 0.85) await s.put<Annotation>('annotation', ids[Math.floor(rnd() * ids.length)], { note: `${s.deviceName} ${r}.${k}`, color: rnd() < 0.5 ? 'sage' : 'rose' })
      else await s.remove('annotation', ids[Math.floor(rnd() * ids.length)])
    }
    for (const { e } of devs) await e.syncRelay((await e.store.db.peers.toArray())[0])
  }
  for (const d of devs) d.e = new SyncEngine(d.s)
  for (let k = 0; k < 3; k++) for (const { e } of devs) await e.syncAll()
  const maps = await Promise.all(devs.map(async d => new Map((await d.s.db.annotations.toArray()).map(a => [a.id, a]))))
  const ops = (await Promise.all(devs.map(d => d.s.db.ops.toArray()))).flat()
  let missing = 0, diverged = 0, lost = 0
  for (const id of new Set(ids)) {
    const vs = maps.map(m => m.get(id))
    if (vs.some(v => !v)) { missing++; continue }
    if (new Set(vs.map(v => JSON.stringify([v!.note, v!.color, !!v!.deleted, (v!.conflicts ?? []).map(c => c.note)]))).size > 1) diverged++
    const kept = new Set([vs[0]!.note, ...(vs[0]!.conflicts ?? []).map(c => c.note)])
    const sup = new Set(ops.filter(o => o.key === id && o.fields && 'note' in o.fields).map(o => o.base?.note))
    for (const o of ops.filter(o => o.key === id && o.fields?.note)) if (!sup.has(o.hlc) && !kept.has(o.fields!.note as string)) lost++
  }
  return { missing, diverged, lost, n: new Set(ids).size }
}

describe('sync under random failures', () => {
  for (const seed of [11, 2024, 777]) {
    it(`converges with no loss (seed ${seed})`, async () => {
      const r = await run(seed)
      expect(r.n).toBeGreaterThan(30)
      expect(r).toMatchObject({ missing: 0, diverged: 0, lost: 0 })
    }, 120_000)
  }

  it('a conflict resolved on one device is resolved on all', async () => {
    const url = `http://127.0.0.1:${srv.port}`, secret = newLibrarySecret()
    const a = await freshStore(undefined, 'A'), b = await freshStore(undefined, 'B')
    await addRelayPeer(a, url, secret, false); await addRelayPeer(b, url, secret, false)
    const ea = new SyncEngine(a), eb = new SyncEngine(b)
    await a.put<Annotation>('annotation', 'x', { bookId: 'b', kind: 'note', section: 0, start: 0, end: 1, exact: 'q', prefix: '', suffix: '', note: '', color: 'amber', tags: [], label: '', fraction: 0, createdAt: 1, updatedAt: 1 })
    await ea.syncAll(); await eb.syncAll()
    await a.put<Annotation>('annotation', 'x', { note: 'from A' }); await b.put<Annotation>('annotation', 'x', { note: 'from B' })
    await ea.syncAll(); await eb.syncAll(); await ea.syncAll()
    const x = (await a.db.annotations.get('x'))!
    expect(x.conflicts).toHaveLength(1)
    expect((await b.db.annotations.get('x'))!.conflicts).toHaveLength(1)
    await a.put<Annotation>('annotation', 'x', { note: `${x.note}\n\n${x.conflicts![0].note}`, noteResolved: [x.conflicts![0].at] })
    await ea.syncAll(); await eb.syncAll()
    const bx = (await b.db.annotations.get('x'))!
    expect(bx.conflicts ?? []).toHaveLength(0)
    expect(bx.note).toContain('from A'); expect(bx.note).toContain('from B')
  })
})
