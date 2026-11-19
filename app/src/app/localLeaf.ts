// A simulated SAGA Leaf that runs inside the page (standalone build, and dev).
// Same device firmware model as the Node simulator (sim/leaf-core.ts), with its
// "SD card" in this browser's IndexedDB. The app talks to it through the normal
// Leaf client at a reserved address, so pairing, transfer and sync run the same
// code paths a real device would.
import Dexie, { type Table } from 'dexie'
import { LeafCore, coreFetch, type LeafStorage } from '../../sim/leaf-core'
import { registerLocalDevice } from '../core/leaf/client'

export const LOCAL_LEAF_URL = 'http://saga-leaf.simulated'

class SdCard extends Dexie {
  files!: Table<{ path: string; data: Uint8Array }, string>
  constructor() { super('saga-leaf-sim'); this.version(1).stores({ files: 'path' }) }
}

class IdbStorage implements LeafStorage {
  constructor(private sd: SdCard) {}
  async read(path: string) { return (await this.sd.files.get(path))?.data ?? null }
  async write(path: string, data: Uint8Array) { await this.sd.files.put({ path, data: data.slice() }) }
  async append(path: string, data: Uint8Array) {
    const cur = await this.read(path)
    const out = new Uint8Array((cur?.length ?? 0) + data.length); if (cur) out.set(cur); out.set(data, cur?.length ?? 0)
    await this.sd.files.put({ path, data: out })
  }
  async remove(path: string) { await this.sd.files.where('path').equals(path).or('path').startsWith(path + '/').delete() }
  async list(dir: string) {
    const pre = dir.replace(/\/$/, '') + '/'
    const names = new Set<string>()
    await this.sd.files.where('path').startsWith(pre).eachPrimaryKey(k => { names.add(String(k).slice(pre.length).split('/')[0]) })
    return [...names]
  }
  async usedBytes() { let n = 0; await this.sd.files.each(f => { n += f.data.length }); return n }
}

let core: Promise<LeafCore> | null = null
export function localLeaf() {
  return (core ??= new LeafCore(new IdbStorage(new SdCard()), {
    name: 'SAGA Leaf (simulated in this page)', protocol: 2, password: 'sagaleaf1',
    capacityBytes: 4 * 1024 ** 3, charsPerPage: 620, battery: 82, quiet: true,
  }).init())
}

/** Make the in-page Leaf answer at LOCAL_LEAF_URL. */
export function installLocalLeaf() {
  const f = async (input: RequestInfo | URL, init?: RequestInit) => coreFetch(await localLeaf())(input, init)
  registerLocalDevice(LOCAL_LEAF_URL, f as typeof fetch)
}
