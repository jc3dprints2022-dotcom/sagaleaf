// The SAGA Author / Publisher demo running inside the page (standalone build).
// Same request handling as the Node platform server (server/platform-core.ts),
// with its JSON database and files kept in this browser's IndexedDB. Nothing
// leaves the device: the catalog is a local demo, not a shared store.
import Dexie, { type Table } from 'dexie'
import { createPlatformApi, emptyDB, type PlatformDB } from '../../server/platform-core'

class LocalPlatformDB extends Dexie {
  kv!: Table<{ key: string; value: PlatformDB }, string>
  files!: Table<{ name: string; data: Uint8Array }, string>
  constructor() { super('saga-platform-local'); this.version(1).stores({ kv: 'key', files: 'name' }) }
}

let handler: Promise<ReturnType<typeof createPlatformApi>> | null = null
function getHandler() {
  return (handler ??= (async () => {
    const idb = new LocalPlatformDB()
    const db = (await idb.kv.get('db'))?.value ?? emptyDB()
    return createPlatformApi({
      db,
      persist: async () => { await idb.kv.put({ key: 'db', value: db }) },
      readFile: async n => (await idb.files.get(n))?.data ?? null,
      writeFile: async (n, d) => { await idb.files.put({ name: n, data: d }) },
      clearFiles: async () => { await idb.files.clear() },
    })
  })())
}

async function toBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body == null) return new Uint8Array(0)
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  return new Uint8Array(await new Response(body).arrayBuffer())
}

/** Answers a platform request (path like "/api/catalog?q=x") from the in-page demo. */
export async function localPlatform(path: string, init: RequestInit = {}): Promise<Response> {
  const api = await getHandler()
  const url = new URL(path, 'http://saga-platform.local')
  const h = new Headers(init.headers)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api') return new Response(JSON.stringify({ error: 'Sync between devices needs a sync server; see Devices.' }), { status: 404, headers: { 'content-type': 'application/json' } })
  const r = await api({ method: (init.method ?? 'GET').toUpperCase(), parts: parts.slice(1), query: url.searchParams, headers: n => h.get(n) ?? '', body: () => toBytes(init.body) })
  const type = r.type ?? 'application/json'
  return new Response(type === 'application/json' ? JSON.stringify(r.body) : (r.body as Uint8Array as BodyInit), { status: r.status, headers: { 'content-type': type } })
}

/** An object URL for a platform image (covers), for <img> in the standalone build. */
const imgCache = new Map<string, Promise<string>>()
export function localPlatformImage(path: string) {
  const key = path.replace(/[?&]b=\d+/, '') + '|' + (path.match(/b=(\d+)/)?.[1] ?? '')
  if (!imgCache.has(key)) imgCache.set(key, localPlatform(path).then(async r => (r.ok ? URL.createObjectURL(await r.blob()) : '')))
  return imgCache.get(key)!
}
