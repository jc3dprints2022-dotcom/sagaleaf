// SAGA Author + Publisher demo workflow and the demo catalog, independent of
// transport and storage. server/platform.ts serves it over HTTP with JSON +
// files on disk; the standalone app runs it in the page with IndexedDB.
// Not a production backend: no real accounts, no payments, demo roles only.
import { validateEpub } from '../src/core/epub'

export interface Submission {
  id: string; authorId: string; authorName: string; status: 'draft' | 'submitted' | 'changes-requested' | 'approved' | 'published' | 'withdrawn'
  title: string; subtitle?: string; author: string; description: string; language: string; subjects: string[]
  series?: string; seriesIndex?: number; isbn?: string; publishedDate?: string
  price: number; currency: 'USD'; license: string; territories: string; drm: 'none' | 'watermark'
  fileHash: string; fileSize: number; words: number; issues: { level: string; code: string; message: string }[]
  coverType?: string; hasCover: boolean
  history: { at: number; who: string; action: string; note?: string }[]
  createdAt: number; updatedAt: number; catalogId?: string; reviewNote?: string
}
export interface CatalogItem { id: string; submissionId: string; title: string; author: string; description: string; language: string; subjects: string[]; price: number; license: string; fileHash: string; fileSize: number; words: number; hasCover: boolean; publishedAt: number; series?: string; seriesIndex?: number; demo: boolean }
interface Ev { at: number; catalogId: string; type: 'library-add' | 'sale' | 'refund'; amount?: number; test: true; source: 'reader-action' | 'simulated' }
export interface PlatformDB { submissions: Submission[]; catalog: CatalogItem[]; events: Ev[]; libraries: Record<string, { cursor: number; created: number }> }
export const emptyDB = (): PlatformDB => ({ submissions: [], catalog: [], events: [], libraries: {} })

export interface PlatformStorage {
  db: PlatformDB
  persist(): Promise<void> | void
  readFile(name: string): Promise<Uint8Array | null>
  writeFile(name: string, data: Uint8Array): Promise<void>
  clearFiles(): Promise<void>
}
export interface ApiRequest { method: string; parts: string[]; query: URLSearchParams; headers: (name: string) => string; body: () => Promise<Uint8Array> }
export interface ApiResponse { status: number; body: unknown; type?: string }

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')
async function sha256hex(d: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d as unknown as BufferSource)), b => b.toString(16).padStart(2, '0')).join('') }
const EDITABLE = ['title', 'subtitle', 'author', 'description', 'language', 'subjects', 'series', 'seriesIndex', 'isbn', 'publishedDate', 'price', 'license', 'territories', 'drm'] as const

export function validIsbn(raw: string) {
  const s = raw.replace(/[^0-9X]/gi, '').toUpperCase()
  if (s.length === 10) { let sum = 0; for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i); return sum % 11 === 0 }
  if (s.length === 13) { let sum = 0; for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1); return sum % 10 === 0 }
  return false
}

export function createPlatformApi(st: PlatformStorage, log: (...a: unknown[]) => void = () => {}) {
  const db = () => st.db
  const fileOf = (hash: string) => hash + '.epub'
  const coverOf = (hash: string) => hash + '.cover'
  const touch = (s: Submission, who: string, action: string, note?: string) => { s.history.push({ at: Date.now(), who, action, note }); s.updatedAt = Date.now() }
  const json = async <T>(r: ApiRequest) => JSON.parse(new TextDecoder().decode(await r.body()) || '{}') as T

  function report(authorId: string) {
    const mine = db().catalog.filter(c => db().submissions.find(s => s.id === c.submissionId)?.authorId === authorId)
    return mine.map(c => {
      const ev = db().events.filter(e => e.catalogId === c.id)
      const sales = ev.filter(e => e.type === 'sale'), refunds = ev.filter(e => e.type === 'refund')
      const gross = sales.reduce((n, e) => n + (e.amount ?? 0), 0) - refunds.reduce((n, e) => n + (e.amount ?? 0), 0)
      const fees = sales.length * 0.3 + gross * 0.029
      const days: Record<string, { adds: number; sales: number }> = {}
      for (const e of ev) { const k = new Date(e.at).toISOString().slice(0, 10); days[k] ??= { adds: 0, sales: 0 }; if (e.type === 'library-add') days[k].adds++; if (e.type === 'sale') days[k].sales++ }
      return {
        catalogId: c.id, title: c.title, price: c.price, libraryAdds: ev.filter(e => e.type === 'library-add').length,
        realReaderAdds: ev.filter(e => e.type === 'library-add' && e.source === 'reader-action').length,
        sales: sales.length, refunds: refunds.length, gross: +gross.toFixed(2), processing: +fees.toFixed(2),
        sagaFee: +(gross * 0.15).toFixed(2), authorNet: +(gross - gross * 0.15).toFixed(2), days, test: true,
      }
    })
  }
  async function simulate(catalogId: string, days = 30) {
    const c = db().catalog.find(x => x.id === catalogId); if (!c) return 0
    let seed = 2166136261; for (const ch of catalogId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0   // deterministic per book
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
    let n = 0
    for (let d = days; d >= 0; d--) {
      const base = Date.now() - d * 86400_000
      const adds = Math.floor(rnd() * 6 + (days - d) * 0.15), buys = c.price > 0 ? Math.floor(rnd() * 4) : 0
      for (let i = 0; i < adds; i++) { db().events.push({ at: base + rnd() * 86400_000 * 0.9, catalogId, type: 'library-add', test: true, source: 'simulated' }); n++ }
      for (let i = 0; i < buys; i++) { db().events.push({ at: base + rnd() * 86400_000 * 0.9, catalogId, type: 'sale', amount: c.price, test: true, source: 'simulated' }); n++ }
      if (buys && rnd() < 0.05) db().events.push({ at: base, catalogId, type: 'refund', amount: c.price, test: true, source: 'simulated' })
    }
    await st.persist(); return n
  }

  return async function api(req: ApiRequest): Promise<ApiResponse> {
    const send = (status: number, body: unknown, type?: string): ApiResponse => ({ status, body, type })
    const who = req.headers('x-demo-user') || 'anonymous'
    const role = req.headers('x-demo-role') || 'reader'
    const [a, b, c] = req.parts
    const m = req.method
    if (a === 'health') return send(200, { ok: true, service: 'saga-platform', demo: true })

    // --- author: upload a manuscript EPUB -> validated draft
    if (a === 'submissions' && !b && m === 'POST') {
      if (role !== 'author') return send(403, { error: 'Switch to an author account to upload.' })
      const bytes = await req.body()
      if (bytes.length > 100 * 1024 * 1024) return send(413, { error: 'too large' })
      const v = validateEpub(bytes)
      if (!v.parsed) return send(422, { error: v.issues[0]?.message ?? 'Not a valid EPUB', issues: v.issues })
      const hash = await sha256hex(bytes)
      await st.writeFile(fileOf(hash), bytes)
      if (v.parsed.cover) await st.writeFile(coverOf(hash), new Uint8Array(v.parsed.cover.data))
      const p = v.parsed
      const s: Submission = {
        id: hex(6), authorId: who, authorName: req.headers('x-demo-name') || who, status: 'draft',
        title: p.title, author: p.author, description: p.description ?? '', language: p.language ?? 'en', subjects: p.subjects.slice(0, 6),
        series: p.series, seriesIndex: p.seriesIndex, isbn: p.identifiers.find(i => /^(97[89])?\d{9}[\dX]$/.test(i.replace(/[^0-9X]/gi, '')))?.replace(/[^0-9X]/gi, ''),
        publishedDate: p.published, price: 0, currency: 'USD', license: 'All rights reserved', territories: 'Worldwide', drm: 'none',
        fileHash: hash, fileSize: bytes.length, words: v.words, issues: v.issues, hasCover: !!p.cover, coverType: p.cover?.type,
        history: [], createdAt: Date.now(), updatedAt: Date.now(),
      }
      touch(s, who, 'uploaded', `${v.words.toLocaleString()} words, ${v.issues.filter(i => i.level === 'error').length} errors, ${v.issues.filter(i => i.level === 'warning').length} warnings`)
      db().submissions.push(s); await st.persist(); log('upload', s.title)
      return send(201, s)
    }
    if (a === 'submissions' && !b && m === 'GET') {
      const list = role === 'publisher' ? db().submissions.filter(s => s.status !== 'draft') : db().submissions.filter(s => s.authorId === who)
      return send(200, list.sort((x, y) => y.updatedAt - x.updatedAt))
    }
    if (a === 'submissions' && b) {
      const s = db().submissions.find(x => x.id === b); if (!s) return send(404, { error: 'No such submission' })
      const own = s.authorId === who
      if (!c && m === 'GET') return own || role === 'publisher' ? send(200, s) : send(403, { error: 'forbidden' })
      if (c === 'cover' && m === 'GET') { const f = await st.readFile(coverOf(s.fileHash)); return f ? send(200, f, s.coverType ?? 'image/jpeg') : send(404, { error: 'no cover' }) }
      if (c === 'cover' && m === 'PUT' && own) {
        const buf = await req.body()
        const type = req.headers('content-type')
        if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(type)) return send(415, { error: 'Cover must be JPEG, PNG, WebP or SVG.' })
        if (buf.length > 10 * 1024 * 1024) return send(413, { error: 'Cover must be under 10 MB.' })
        await st.writeFile(coverOf(s.fileHash), buf); s.hasCover = true; s.coverType = type
        s.issues = s.issues.filter(i => i.code !== 'no-cover'); touch(s, who, 'replaced cover'); await st.persist()
        return send(200, s)
      }
      if (!c && m === 'PATCH' && own) {
        if (!['draft', 'changes-requested'].includes(s.status)) return send(409, { error: 'This book is in review. Withdraw it to make changes.' })
        const patch = await json<Partial<Submission>>(req)
        const errors: string[] = []
        for (const k of EDITABLE) if (k in patch) (s as unknown as Record<string, unknown>)[k] = patch[k]
        if (!s.title?.trim()) errors.push('Title is required.')
        if (!(s.price >= 0 && s.price <= 200)) errors.push('Price must be between $0 and $200.')
        if (s.isbn && !validIsbn(s.isbn)) errors.push('That ISBN fails its checksum.')
        if (errors.length) return send(422, { error: errors.join(' ') })
        touch(s, who, 'edited details'); await st.persist()
        return send(200, s)
      }
      if (c === 'submit' && m === 'POST' && own) {
        if (!['draft', 'changes-requested'].includes(s.status)) return send(409, { error: 'Already submitted.' })
        const blocking = s.issues.filter(i => i.level === 'error')
        if (blocking.length) return send(422, { error: 'Fix the errors in your file before submitting.', issues: blocking })
        if (!s.description || s.description.length < 40) return send(422, { error: 'Add a description of at least 40 characters; readers decide from it.' })
        s.status = 'submitted'; touch(s, who, 'submitted for review'); await st.persist()
        return send(200, s)
      }
      if (c === 'withdraw' && m === 'POST' && own) { s.status = 'withdrawn'; touch(s, who, 'withdrew'); await st.persist(); return send(200, s) }
      if (c === 'review' && m === 'POST') {
        if (role !== 'publisher') return send(403, { error: 'Only a publisher or administrator can review.' })
        const r = await json<{ decision: 'approve' | 'changes'; note?: string }>(req)
        if (s.status !== 'submitted') return send(409, { error: `This submission is ${s.status}, not awaiting review.` })
        if (r.decision === 'changes') { s.status = 'changes-requested'; s.reviewNote = r.note; touch(s, who, 'requested changes', r.note); await st.persist(); return send(200, s) }
        s.status = 'published'; s.reviewNote = r.note
        const item: CatalogItem = { id: 'cat-' + hex(6), submissionId: s.id, title: s.title, author: s.author, description: s.description, language: s.language, subjects: s.subjects, price: s.price, license: s.license, fileHash: s.fileHash, fileSize: s.fileSize, words: s.words, hasCover: s.hasCover, publishedAt: Date.now(), series: s.series, seriesIndex: s.seriesIndex, demo: true }
        db().catalog = db().catalog.filter(x => x.submissionId !== s.id); db().catalog.push(item); s.catalogId = item.id
        touch(s, who, 'approved and published to the demo catalog', r.note); await st.persist(); log('published', s.title)
        return send(200, s)
      }
    }
    // --- catalog (reader side)
    if (a === 'catalog' && !b) {
      const q = (req.query.get('q') ?? '').toLowerCase()
      return send(200, db().catalog.filter(x => !q || `${x.title} ${x.author} ${x.subjects.join(' ')}`.toLowerCase().includes(q)).sort((x, y) => y.publishedAt - x.publishedAt))
    }
    if (a === 'catalog' && b) {
      const item = db().catalog.find(x => x.id === b); if (!item) return send(404, { error: 'Not in the catalog' })
      if (!c) return send(200, item)
      if (c === 'cover') { const f = await st.readFile(coverOf(item.fileHash)); return f ? send(200, f, db().submissions.find(s => s.id === item.submissionId)?.coverType ?? 'image/jpeg') : send(404, { error: 'no cover' }) }
      if (c === 'acquire' && m === 'POST') {
        // Demo: no payment is taken. A free book is simply added; a priced book records a TEST sale.
        db().events.push({ at: Date.now(), catalogId: item.id, type: 'library-add', test: true, source: 'reader-action' })
        if (item.price > 0) db().events.push({ at: Date.now(), catalogId: item.id, type: 'sale', amount: item.price, test: true, source: 'reader-action' })
        await st.persist()
        return send(200, { ok: true, entitlement: { catalogId: item.id, license: item.license, drm: 'none', note: 'Demo entitlement. No payment was taken.' } })
      }
      if (c === 'file') { const f = await st.readFile(fileOf(item.fileHash)); return f ? send(200, f, 'application/epub+zip') : send(404, { error: 'file missing' }) }
    }
    if (a === 'reports' && !b && m === 'GET') return send(200, { test: true, label: 'TEST DATA: simulated and demo events, not real sales.', rows: report(who) })
    if (a === 'reports' && b === 'simulate' && m === 'POST') {
      const r = await json<{ catalogId: string }>(req)
      const sub = db().submissions.find(s => s.catalogId === r.catalogId)
      if (!sub || sub.authorId !== who) return send(403, { error: 'forbidden' })
      return send(200, { generated: await simulate(r.catalogId), test: true })
    }
    if (a === 'demo' && b === 'reset' && m === 'POST') {
      st.db.submissions = []; st.db.catalog = []; st.db.events = []; await st.persist(); await st.clearFiles()
      return send(200, { ok: true })
    }
    return send(404, { error: 'not found' })
  }
}
