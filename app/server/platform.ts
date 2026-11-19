// SAGA platform server (development / demo).
//  /sync/*      End-to-end encrypted sync relay. Stores ciphertext only.
//  /api/*       SAGA Author + SAGA Publisher demo workflow and the demo catalog.
// Single process, JSON + files on disk. Not a production backend: no real
// accounts, no payments, demo roles are chosen in the UI and labelled as such.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

const g = globalThis as Record<string, unknown>
if (!g.DOMParser) g.DOMParser = new Window().DOMParser
const { createPlatformApi, emptyDB } = await import('./platform-core')
type PlatformDB = import('./platform-core').PlatformDB

export type { Submission, CatalogItem } from './platform-core'
export { validIsbn } from './platform-core'

export function startPlatform(opts: { port?: number; dir?: string; quiet?: boolean } = {}) {
  const dir = opts.dir ?? join(dirname(fileURLToPath(import.meta.url)), '.data')
  mkdirSync(join(dir, 'files'), { recursive: true }); mkdirSync(join(dir, 'relay'), { recursive: true })
  const dbPath = join(dir, 'platform.json')
  const db: PlatformDB = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, 'utf8')) : emptyDB()
  const persist = () => { writeFileSync(dbPath + '.tmp', JSON.stringify(db)); renameSync(dbPath + '.tmp', dbPath) }
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log('[platform]', ...a) }

  const send = (res: ServerResponse, code: number, body: unknown, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, ...cors })
    res.end(type === 'application/json' ? JSON.stringify(body) : body as Buffer)
  }
  const body = (req: IncomingMessage, limit = 200 * 1024 * 1024) => new Promise<Buffer>((ok, fail) => {
    const parts: Buffer[] = []; let n = 0
    req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { fail(new Error('too large')); req.destroy() } else parts.push(c) })
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail)
  })
  const json = async <T>(req: IncomingMessage) => JSON.parse((await body(req, 5_000_000)).toString() || '{}') as T

  // ------------------------------------------------------------ relay
  const libDir = (lib: string) => { if (!/^[a-f0-9]{32}$/.test(lib)) throw Object.assign(new Error('bad library id'), { code: 400 }); return join(dir, 'relay', lib) }
  const ensureLib = (lib: string) => {
    const d = libDir(lib)
    if (!db.libraries[lib]) { db.libraries[lib] = { cursor: 0, created: Date.now() }; mkdirSync(join(d, 'ops'), { recursive: true }); mkdirSync(join(d, 'blobs'), { recursive: true }); persist() }
    return d
  }
  async function relay(req: IncomingMessage, res: ServerResponse, parts: string[], url: URL) {
    const [lib, kind, name, chunk] = parts
    const d = ensureLib(lib)
    if (kind === 'ops' && req.method === 'POST') {
      const b = await json<{ device: string; count: number; payload: string }>(req)
      if (typeof b.payload !== 'string') return send(res, 400, { error: 'payload required' })
      const cursor = ++db.libraries[lib].cursor
      writeFileSync(join(d, 'ops', String(cursor).padStart(10, '0') + '.json'), JSON.stringify({ cursor, device: b.device, payload: b.payload, at: Date.now() }))
      persist()
      return send(res, 200, { cursor })
    }
    if (kind === 'ops' && req.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0)
      const files = readdirSync(join(d, 'ops')).filter(f => Number(f.slice(0, 10)) > after).sort()
      const page = files.slice(0, 50)
      const batches = page.map(f => JSON.parse(readFileSync(join(d, 'ops', f), 'utf8')))
      return send(res, 200, { batches, cursor: batches.length ? batches[batches.length - 1].cursor : after, more: files.length > page.length })
    }
    if (kind === 'blobs' && name && /^[a-f0-9]{32}$/.test(name)) {
      const bd = join(d, 'blobs', name)
      if (req.method === 'GET' && chunk === undefined) {
        if (!existsSync(join(bd, 'meta.json'))) return send(res, 404, { error: 'no such blob' })
        const meta = JSON.parse(readFileSync(join(bd, 'meta.json'), 'utf8'))
        const chunks = readdirSync(bd).filter(f => /^\d+\.bin$/.test(f)).map(f => Number(f.slice(0, -4))).sort((a, b) => a - b)
        return send(res, 200, { chunks, total: meta.total, complete: chunks.length === meta.total })
      }
      if (req.method === 'PUT' && chunk !== undefined && /^\d+$/.test(chunk)) {
        const total = Number(url.searchParams.get('total'))
        if (!(total > 0) || Number(chunk) >= total) return send(res, 400, { error: 'bad chunk index' })
        mkdirSync(bd, { recursive: true })
        const data = await body(req, 2 * 1024 * 1024)
        // write-then-rename: a dropped connection never leaves a partial chunk behind
        writeFileSync(join(bd, chunk + '.part'), data); renameSync(join(bd, chunk + '.part'), join(bd, chunk + '.bin'))
        writeFileSync(join(bd, 'meta.json'), JSON.stringify({ total }))
        return send(res, 200, { ok: true })
      }
      if (req.method === 'GET' && chunk !== undefined && existsSync(join(bd, chunk + '.bin'))) return send(res, 200, readFileSync(join(bd, chunk + '.bin')), 'application/octet-stream')
      return send(res, 404, { error: 'no such chunk' })
    }
    send(res, 404, { error: 'not found' })
  }

  // ------------------------------------------------------------ publishing demo (platform-core.ts)
  const files = join(dir, 'files')
  const api = createPlatformApi({
    db, persist,
    readFile: async n => (existsSync(join(files, n)) ? new Uint8Array(readFileSync(join(files, n))) : null),
    writeFile: async (n, d) => writeFileSync(join(files, n), d),
    clearFiles: async () => { rmSync(files, { recursive: true, force: true }); mkdirSync(files) },
  }, log)
  async function apiHttp(req: IncomingMessage, res: ServerResponse, parts: string[], url: URL) {
    const r = await api({ method: req.method ?? 'GET', parts, query: url.searchParams, headers: n => String(req.headers[n] ?? ''), body: async () => new Uint8Array(await body(req)) })
    const t = r.type ?? 'application/json'
    send(res, r.status, t === 'application/json' ? r.body : Buffer.from(r.body as Uint8Array), t)
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
    const url = new URL(req.url ?? '/', 'http://x')
    const parts = url.pathname.split('/').filter(Boolean)
    try {
      if (parts[0] === 'sync') return await relay(req, res, parts.slice(1), url)
      if (parts[0] === 'api') return await apiHttp(req, res, parts.slice(1), url)
      send(res, 404, { error: 'not found' })
    } catch (e) {
      const err = e as Error & { code?: number }
      send(res, typeof err.code === 'number' ? err.code : 500, { error: err.message })
    }
  })
  return new Promise<{ port: number; close: () => Promise<void> }>(ok => {
    server.listen(opts.port ?? 8791, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      log(`listening on http://127.0.0.1:${port}`)
      ok({ port, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()) }) })
    })
  })
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,x-demo-user,x-demo-role,x-demo-name,authorization', 'access-control-allow-private-network': 'true' }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startPlatform({ port: Number(process.env.PORT ?? 8791) })
