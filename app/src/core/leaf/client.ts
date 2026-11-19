// HTTP client for SAGA Leaf firmware. Protocol 1 = firmware 1.0.0 as shipped;
// protocol 2 = the proposed extension implemented by the simulator.
import type { Fetch } from '../sync/engine'

export interface LeafHello { protocol: 1 | 2; deviceId?: string; name: string; firmware: string; product: string; capabilities: string[]; url: string }
export interface LeafBook { id: string; title: string; author: string; sizeBytes: number; sha256?: string; sagaId?: string; progress?: number; progressRev?: number; annotationRev?: number }
export interface LeafStatus { storage: { capacityBytes: number; usedBytes: number; bookCount: number }; battery: { available: boolean; percent: number | null; state: string }; firmware?: string }
export interface LeafProgress { chapter: number; offset: number; progress: number; fraction: number; rev: number; snippet: string }
export interface LeafAnnotation { id: string; sagaId?: string; kind: 'bookmark' | 'highlight' | 'note'; chapter: number; start: number; end: number; selected: string; note: string; location: string; rev?: number; deleted?: boolean }

/** Devices that live inside the page (the standalone build's simulated Leaf).
 *  Requests to their base URL are answered in-process instead of over the network. */
const localDevices = new Map<string, Fetch>()
export function registerLocalDevice(baseUrl: string, f: Fetch) { localDevices.set(baseUrl.replace(/\/$/, ''), f) }
export const isLocalDevice = (url: string) => [...localDevices.keys()].some(k => url.startsWith(k))
export const localDeviceUrls = () => [...localDevices.keys()]
const routedFetch: Fetch = (input, init) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  for (const [k, f] of localDevices) if (u.startsWith(k)) return f(input, init)
  return fetch(input, init)
}

/** Devices may report older capitalizations ("Saga Leaf"); show the product name consistently. */
export const productName = (n: string) => n.replace(/\bsaga\s*leaf\b/gi, 'SAGA Leaf')

export class LeafError extends Error { constructor(msg: string, public status = 0, public body?: unknown) { super(msg) } }

export class LeafClient {
  constructor(public url: string, public token = '', private f: Fetch = routedFetch, private timeoutMs = 8000) { this.url = url.replace(/\/$/, '') }
  private async req(path: string, init: RequestInit = {}, timeout = this.timeoutMs) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout)
    try {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
      if (this.token) headers.authorization = `Bearer ${this.token}`
      const r = await this.f(this.url + path, { ...init, headers, signal: ctl.signal })
      const ct = r.headers.get('content-type') ?? ''
      const body = ct.includes('json') ? await r.json() : await r.text()
      if (!r.ok) throw new LeafError((body as { error?: string })?.error ?? `HTTP ${r.status}`, r.status, body)
      return body
    } catch (e) {
      if (e instanceof LeafError) throw e
      throw new LeafError((e as Error).name === 'AbortError' ? 'The SAGA Leaf didn’t answer in time.' : 'Couldn’t reach the SAGA Leaf.', 0)
    } finally { clearTimeout(t) }
  }

  async hello(): Promise<LeafHello> {
    try {
      const h = await this.req('/api/v2/hello', {}, 2500)
      return { ...h, name: productName(String(h.name ?? 'SAGA Leaf')), url: this.url }
    } catch (e) {
      if ((e as LeafError).status !== 404 && (e as LeafError).status !== 0) throw e
      if ((e as LeafError).status === 0) throw e
      const s = await this.req('/api/status', {}, 2500)
      return { protocol: 1, name: 'SAGA Leaf', firmware: s.firmware ?? '1.0.0', product: s.product ?? 'Saga Leaf', capabilities: ['upload', 'notes-read'], url: this.url }
    }
  }
  // pairing
  async pairStart(clientId: string, clientName: string) { return this.req('/api/v2/pair/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientName }) }) as Promise<{ pairingId: string; expiresIn: number }> }
  async pairConfirm(pairingId: string, code: string) { return this.req('/api/v2/pair/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingId, code }) }) as Promise<{ token: string; deviceId: string; name: string }> }
  async checkPassword() { await this.req('/api/auth/check'); return true }
  async unpair(clientId: string) { return this.req(`/api/v2/pair/${encodeURIComponent(clientId)}`, { method: 'DELETE' }) }

  // shared
  async status(): Promise<LeafStatus> { return this.req('/api/status') }
  async books(): Promise<LeafBook[]> { return (await this.req('/api/books')).books.map((b: LeafBook & { sizeBytes: number }) => b) }
  async state(): Promise<LeafStatus & { books: LeafBook[]; counter: number }> { return this.req('/api/v2/state') }
  async notesV1(): Promise<{ bookId: string; text: string; note: string; location: string }[]> { return (await this.req('/api/notes')).notes }
  async deleteBook(id: string) { return this.req(`/api/books/${id}`, { method: 'DELETE' }) }

  async uploadV1(filename: string, data: Uint8Array, title: string, author: string, onProgress?: (sent: number) => void) {
    const qs = new URLSearchParams({ filename, title, author })
    const fd = new FormData(); fd.append('file', new Blob([data as BlobPart], { type: 'text/plain' }), filename)
    onProgress?.(0)
    const r = await this.req(`/api/upload?${qs}`, { method: 'POST', body: fd }, 120_000) as { id: string }
    onProgress?.(data.length)
    return r.id
  }
  async uploadV2(meta: { filename: string; size: number; sha256: string; title: string; author: string; sagaId: string }, data: Uint8Array, onProgress?: (sent: number) => void, chunk = 64 * 1024) {
    const start = await this.req('/api/v2/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(meta) }) as { uploadId: string | null; existing?: string; received: number }
    if (start.existing) { onProgress?.(meta.size); return start.existing }
    let off = start.received
    onProgress?.(off)
    while (off < data.length) {
      const part = data.subarray(off, off + chunk)
      try {
        const r = await this.req(`/api/v2/uploads/${start.uploadId}?offset=${off}`, { method: 'PUT', body: part as BodyInit, headers: { 'content-type': 'application/octet-stream' } }, 60_000) as { received: number }
        off = r.received
      } catch (e) {
        if ((e as LeafError).status === 409) { off = ((e as LeafError).body as { received: number }).received; continue }
        throw e
      }
      onProgress?.(off)
    }
    const done = await this.req(`/api/v2/uploads/${start.uploadId}/commit`, { method: 'POST' }, 60_000) as { id: string }
    return done.id
  }
  async getProgress(id: string): Promise<LeafProgress> { return this.req(`/api/books/${id}/progress`) }
  async putProgress(id: string, p: { snippet: string; fraction: number; baseRev: number; from: string }): Promise<LeafProgress> { return this.req(`/api/books/${id}/progress`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) }) }
  async getAnnotations(id: string, since: number): Promise<{ rev: number; annotations: LeafAnnotation[] }> { return this.req(`/api/books/${id}/annotations?since=${since}`) }
  async postAnnotations(id: string, list: { sagaId: string; kind: string; exact: string; note: string; deleted?: boolean; fraction?: number }[]) { return this.req(`/api/books/${id}/annotations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ annotations: list }) }) }
}

/** Probe candidate addresses in parallel. Browsers cannot do mDNS or LAN scans,
 *  so discovery tries known addresses: saved devices, the Leaf hotspot address,
 *  sagaleaf.local, and the local simulators in development builds. */
export async function discover(candidates: string[], f?: Fetch): Promise<LeafHello[]> {
  const uniq = [...new Set(candidates.map(c => c.replace(/\/$/, '')))]
  const results = await Promise.allSettled(uniq.map(u => new LeafClient(u, '', f, 2500).hello()))
  return results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
}
export const DEFAULT_CANDIDATES = ['http://sagaleaf.local', 'http://192.168.4.1']
export const SIM_CANDIDATES = ['http://127.0.0.1:8790', 'http://127.0.0.1:8792']
