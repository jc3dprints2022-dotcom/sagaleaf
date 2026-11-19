// SAGA Leaf device simulator for Node: serves LeafCore (leaf-core.ts) over HTTP
// with the firmware's SD-card layout on disk, plus a simulated screen at /device
// and a control API at /sim/* for tests.
//
// Two firmware-1.0.0 behaviours are kept in protocol-1 mode because the real
// device does them: GET endpoints are unauthenticated, and there are no CORS
// headers (a browser app on another origin is blocked; cors:true models the fix).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, rmSync, statSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import busboy from 'busboy'
import { LeafCore, type LeafStorage, type CoreRequest, type DevAnn, type Progress } from './leaf-core'

export interface SimOptions {
  port?: number; dir: string; name?: string; protocol?: 1 | 2; password?: string
  capacityBytes?: number; cors?: boolean; quiet?: boolean; charsPerPage?: number; battery?: number | null
}

class FsStorage implements LeafStorage {
  constructor(private base: string) {}
  private p(path: string) { return join(this.base, path) }
  async read(path: string) { const f = this.p(path); return existsSync(f) && statSync(f).isFile() ? new Uint8Array(readFileSync(f)) : null }
  async write(path: string, data: Uint8Array) { const f = this.p(path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + '.tmp', data); renameSync(f + '.tmp', f) }
  async append(path: string, data: Uint8Array) { const f = this.p(path); mkdirSync(dirname(f), { recursive: true }); appendFileSync(f, data) }
  async remove(path: string) { rmSync(this.p(path), { recursive: true, force: true }) }
  async list(dir: string) { const d = this.p(dir); return existsSync(d) ? readdirSync(d) : [] }
  async usedBytes() {
    let n = 0
    const walk = (d: string) => { if (!existsSync(d)) return; for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else n += s.size } }
    walk(this.p('saga')); return n
  }
}

export class LeafDevice {
  core: LeafCore
  root: string
  cors: boolean
  private ready: Promise<LeafCore>

  constructor(public opts: SimOptions) {
    const protocol = opts.protocol ?? 2
    this.cors = opts.cors ?? protocol !== 1
    this.root = join(opts.dir, 'saga')
    for (const d of ['books', 'progress', 'annotations', 'imports', 'settings']) mkdirSync(join(this.root, d), { recursive: true })
    this.core = new LeafCore(new FsStorage(opts.dir), {
      name: opts.name ?? 'SAGA Leaf (simulated)', protocol, password: opts.password ?? 'sagaleaf1',
      capacityBytes: opts.capacityBytes ?? 30 * 1024 ** 3, charsPerPage: opts.charsPerPage ?? 620,
      battery: opts.battery === undefined ? 82 : opts.battery, quiet: opts.quiet ?? false,
    })
    this.ready = this.core.init()
  }
  get faults() { return this.core.faults }

  // synchronous helpers for tests (read the SD layout directly)
  private rj<T>(p: string): T | null { const f = join(this.root, p); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null }
  bookIds() { return readdirSync(join(this.root, 'books')).filter(d => existsSync(join(this.root, 'books', d, 'metadata.json'))) }
  meta(id: string) { return this.rj<Record<string, unknown> & { title: string; sha256?: string; sagaId?: string }>(`books/${id}/metadata.json`)! }
  progress(id: string) { return this.rj<Progress>(`progress/${id}.json`) }
  annotations(id: string) { return this.rj<DevAnn[]>(`annotations/${id}.json`) ?? [] }
  async turn(id: string, pages: number) { await this.ready; return this.core.turn(id, pages) }
  async highlightOnPage(id: string, note = '') { await this.ready; return this.core.highlightOnPage(id, note) }

  handler() {
    return async (req: IncomingMessage, res: ServerResponse) => {
      await this.ready
      const core = this.core
      const url = new URL(req.url ?? '/', 'http://x')
      const path = url.pathname
      const isSim = path.startsWith('/sim') || path === '/device'
      const headers: Record<string, string> = this.cors || isSim ? { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-private-network': 'true' } : {}
      const send = (code: number, body: unknown, type = 'application/json; charset=utf-8') => {
        if (res.headersSent) return
        res.writeHead(code, { 'content-type': type, connection: 'close', ...headers })
        res.end(typeof body === 'string' || body instanceof Buffer ? body : JSON.stringify(body))
      }
      if (!isSim) {
        if (core.faults.offline) { req.socket.destroy(); return }
        if (core.faults.failNextRequests) { core.faults.failNextRequests--; req.socket.destroy(); return }
        if (core.faults.latencyMs) await new Promise(r => setTimeout(r, core.faults.latencyMs))
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end() }
      try {
        if (isSim) return await this.simRoutes(req, url, send)
        const cr: CoreRequest = { method: req.method ?? 'GET', path, query: url.searchParams, auth: String(req.headers.authorization ?? '') }
        const ct = String(req.headers['content-type'] ?? '')
        if (ct.includes('multipart/form-data')) {
          const got = await this.readMultipart(req)
          if (got === 'dropped') return
          cr.file = got ?? undefined
        } else if (req.method !== 'GET') {
          const body = await readBody(req)
          if (ct.includes('json')) cr.json = JSON.parse(body.toString() || '{}')
          else cr.bytes = new Uint8Array(body)
        }
        const r = await core.handle(cr)
        if (r.drop) { req.socket.destroy(); return }
        send(r.status, r.body as string, r.type)
      } catch (e) { send(500, { error: (e as Error).message }) }
    }
  }

  /** Multipart (protocol 1 upload). Honours dropUploadAfterBytes like a lost connection: protocol 1 cannot resume. */
  private readMultipart(req: IncomingMessage) {
    return new Promise<{ name: string; data: Uint8Array } | null | 'dropped'>(ok => {
      const bb = busboy({ headers: req.headers })
      const parts: Buffer[] = []; let name = '', n = 0, dropped = false
      bb.on('file', (_f, stream, info) => { name = info.filename ?? ''; stream.on('data', (c: Buffer) => {
        const drop = this.core.faults.dropUploadAfterBytes
        if (drop != null && n + c.length > drop) { this.core.faults.dropUploadAfterBytes = undefined; dropped = true; this.core.note('connection dropped mid-upload (protocol 1 cannot resume)'); req.socket.destroy(); ok('dropped'); return }
        n += c.length; parts.push(c)
      }) })
      bb.on('close', () => { if (!dropped) ok(name ? { name, data: new Uint8Array(Buffer.concat(parts)) } : null) })
      bb.on('error', () => ok(null))
      req.pipe(bb)
    })
  }

  private async simRoutes(req: IncomingMessage, url: URL, send: (c: number, b: unknown, t?: string) => void) {
    const core = this.core, p = url.pathname
    const body = async () => JSON.parse((await readBody(req)).toString() || '{}')
    if (p === '/device') return send(200, DEVICE_PAGE, 'text/html; charset=utf-8')
    if (p === '/sim/screen') return send(200, await core.screenState())
    if (p === '/sim/open') { core.open((await body()).bookId); return send(200, { ok: true }) }
    if (p === '/sim/back') { core.back(); return send(200, { ok: true }) }
    if (p === '/sim/turn') { const b = await body(); return send(200, await core.turn(b.bookId ?? core.screen.bookId!, b.pages ?? 1)) }
    if (p === '/sim/highlight') { const b = await body(); return send(200, await core.highlightOnPage(b.bookId ?? core.screen.bookId!, b.note ?? '')) }
    if (p === '/sim/faults') { Object.assign(core.faults, await body()); core.note(`faults: ${JSON.stringify(core.faults)}`); return send(200, core.faults) }
    if (p === '/sim/state') return send(200, await core.state())
    if (p === '/sim/battery') { core.o.battery = (await body()).percent; return send(200, { ok: true }) }
    send(404, { error: 'not found' })
  }

  async listen() {
    await this.ready
    const server = createServer(this.handler())
    return new Promise<{ port: number; close: () => Promise<void> }>(ok => server.listen(this.opts.port ?? 8790, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      this.core.note(`${this.core.o.name} listening on http://127.0.0.1:${port} (protocol ${this.core.o.protocol}${this.cors ? ', CORS on' : ', no CORS like firmware 1.0.0'}) · screen: http://127.0.0.1:${port}/device`)
      ok({ port, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()) }) })
    }))
  }
}

const readBody = (req: IncomingMessage) => new Promise<Buffer>((ok, fail) => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', fail) })
const DEVICE_PAGE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'device.html'), 'utf8')

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = join(dirname(fileURLToPath(import.meta.url)), '.leaf-data')
  await new LeafDevice({ dir: join(base, 'leaf-a'), port: Number(process.env.LEAF_PORT ?? 8790), name: 'SAGA Leaf (simulated)', protocol: 2 }).listen()
  if (process.env.LEAF_V1 !== '0') await new LeafDevice({ dir: join(base, 'leaf-v1'), port: Number(process.env.LEAF_V1_PORT ?? 8792), name: 'Saga Leaf · firmware 1.0.0 (simulated)', protocol: 1, cors: true }).listen()
}
