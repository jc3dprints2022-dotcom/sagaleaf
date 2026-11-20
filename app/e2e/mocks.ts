// Stand-ins for the outside services the app talks to, for browser tests that
// run without internet: Gutendex, Project Gutenberg downloads, the supabase-js
// CDN, and Supabase (Auth with PKCE + the saga_sync table under RLS).
import type { BrowserContext, Route } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FIX = join(here, 'fixtures')
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range,content-profile' }
const json = (route: Route, body: unknown, status = 200, extra: Record<string, string> = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, ...extra }, body: JSON.stringify(body) })

// ---------------------------------------------------------------- Gutendex + Gutenberg
interface GBook { id: number; title: string; authors: { name: string }[]; subjects: string[]; bookshelves: string[]; download_count: number; formats: Record<string, string>; languages?: string[]; summaries?: string[]; translators?: unknown[]; copyright?: boolean; media_type?: string }
const FIXTURE_BOOKS: GBook[] = JSON.parse(readFileSync(join(FIX, 'gutendex-books.json'), 'utf8'))
export const GBOOKS: GBook[] = FIXTURE_BOOKS
export const gutendexLog: string[] = []
export const PROXY_URL = 'https://uxlvtbqmhcheklazboxr.supabase.co/functions/v1/gutenberg-proxy'

/** The 8 fixture books plus `extra` generated ones (unique ids and titles), most downloaded first. */
export function gutendexBooks(extra = 0): GBook[] {
  const out = [...FIXTURE_BOOKS]
  const topics = ['Fiction', 'Mystery', 'Adventure', 'Philosophy', 'History']
  for (let i = 0; i < extra; i++) {
    const id = 10_000 + i
    out.push({ id, title: `Generated Tale ${i + 1}`, authors: [{ name: `Writer${i % 13}, Test` }], subjects: [`${topics[i % 5]} -- Test`], bookshelves: [`Category: ${topics[i % 5]}`], download_count: 20_000 - i * 10, languages: ['en'], summaries: [], translators: [], copyright: false, media_type: 'Text',
      formats: { 'application/epub+zip': `https://www.gutenberg.org/ebooks/${id}.epub3.images`, 'image/jpeg': `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg` } })
  }
  return out
}

type Reply = { status: number; contentType?: string; headers?: Record<string, string>; body?: string | Buffer; abort?: boolean }
const ok = (body: unknown): Reply => ({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })
const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms))

function gutendexReply(u: URL, size: number, books: GBook[]): Reply {
  gutendexLog.push(u.pathname + u.search)
  const one = u.pathname.match(/^\/books\/(\d+)\/?$/)
  if (one) { const b = books.find(x => x.id === Number(one[1])); return b ? ok(b) : { ...ok({ detail: 'Not found.' }), status: 404 } }
  const words = (u.searchParams.get('search') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const topic = (u.searchParams.get('topic') ?? '').toLowerCase()
  let list = books.filter(b => words.every(w => `${b.title} ${b.authors.map(a => a.name).join(' ')}`.toLowerCase().includes(w)))
  if (topic) list = list.filter(b => [...b.subjects, ...b.bookshelves].some(s => s.toLowerCase().includes(topic)))
  list = list.sort((a, b) => u.searchParams.get('sort') === 'descending' ? b.id - a.id : b.download_count - a.download_count)
  const page = Number(u.searchParams.get('page') ?? 1)
  const next = page * size < list.length ? (() => { const n = new URL(u); n.searchParams.set('page', String(page + 1)); return n.toString() })() : null
  return ok({ count: list.length, next, previous: null, results: list.slice((page - 1) * size, page * size) })
}
function gutenbergReply(u: URL, isFetch: boolean): Reply {
  const epub = readFileSync(join(here, '..', 'public', 'samples', 'pride-and-prejudice.epub'))
  const txt = readFileSync(join(here, '..', 'public', 'samples', 'sherlock-holmes-sample.txt'))
  const cover = u.pathname.match(/\/cache\/epub\/(\d+)\/pg\d+\.cover\.medium\.jpg$/)
  if (cover) { try { return { status: 200, contentType: 'image/jpeg', headers: CORS, body: readFileSync(join(FIX, 'covers', `${cover[1]}.jpg`)) } } catch { return { status: 404, headers: CORS } } }
  // 1661: no EPUB, plain text works. 84: the browser refuses the download (CORS). Any other id: the sample EPUB.
  if (u.pathname.startsWith('/ebooks/1661.epub')) return { status: 404, headers: CORS, body: 'not found' }
  if (u.pathname === '/ebooks/1661.txt.utf-8') return { status: 200, contentType: 'text/plain; charset=utf-8', headers: CORS, body: txt }
  // A real browser refuses Gutenberg's files without CORS headers; fetch() then rejects. Playwright's
  // fulfilled responses skip that check, so the refusal is reproduced as a failed request.
  if (u.pathname.startsWith('/ebooks/84.')) return isFetch ? { status: 0, abort: true } : { status: 200, contentType: 'text/html', body: '<!doctype html><title>Project Gutenberg</title><p>Frankenstein</p>' }
  // generated books (id >= 10000) get their own small EPUB, so they never collide with the sample books
  if (/^\/ebooks\/1\d{4}\.epub3\.images$/.test(u.pathname)) return { status: 200, contentType: 'application/epub+zip', headers: CORS, body: readFileSync(join(FIX, 'import', 'book.epub')) }
  if (/^\/ebooks\/\d+\.epub3\.images$/.test(u.pathname)) return { status: 200, contentType: 'application/epub+zip', headers: CORS, body: epub }
  return { status: 200, contentType: 'text/html', body: `<!doctype html><title>Project Gutenberg</title><p>Project Gutenberg page for ${u.pathname}</p>` }
}
const fulfil = (route: Route, r: Reply) => r.abort ? route.abort('failed') : route.fulfill({ status: r.status, contentType: r.contentType, headers: r.headers, body: r.body })

/** Gutendex and Project Gutenberg, called directly (the app wraps them in the proxy; see mockProxy). */
export async function mockGutendex(ctx: BrowserContext, opts: { pageSize?: number; extra?: number; latency?: number; handlers?: ProxyHandler[] } = {}) {
  const size = opts.pageSize ?? 6, books = gutendexBooks(opts.extra)
  await ctx.route('https://gutendex.com/**', async route => { if (opts.latency) await sleepMs(opts.latency); return fulfil(route, gutendexReply(new URL(route.request().url()), size, books)) })
  await ctx.route('https://www.gutenberg.org/**', async route => { if (opts.latency) await sleepMs(opts.latency); return fulfil(route, gutenbergReply(new URL(route.request().url()), route.request().resourceType() === 'fetch')) })
  // images and the like come straight from the host; fetches the app makes for Gutendex/Gutenberg go through the proxy
  await mockProxy(ctx, { pageSize: size, extra: opts.extra, latency: opts.latency, handlers: opts.handlers })
}

/** SAGA's read-only proxy: unwraps ?url= and answers as the target host would (Gutendex, Gutenberg, plus whatever `extra` handles). */
export const proxyLog: string[] = []
export type ProxyHandler = (target: URL) => Reply | null | Promise<Reply | null>
export async function mockProxy(ctx: BrowserContext, opts: { pageSize?: number; extra?: number; latency?: number; handlers?: ProxyHandler[] } = {}) {
  const size = opts.pageSize ?? 6, books = gutendexBooks(opts.extra)
  await ctx.route(PROXY_URL + '**', async route => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const target = new URL(new URL(req.url()).searchParams.get('url') ?? 'about:blank')
    proxyLog.push(target.href)
    if (opts.latency) await sleepMs(opts.latency)
    for (const h of opts.handlers ?? []) { const r = await h(target); if (r) return fulfil(route, r) }
    if (target.hostname === 'gutendex.com') return fulfil(route, gutendexReply(target, size, books))
    if (/(^|\.)gutenberg\.org$/.test(target.hostname)) { const r = gutenbergReply(target, true); return fulfil(route, r) }
    return route.fulfill({ status: 403, headers: CORS, body: 'host not allowed' })
  })
}

// ---------------------------------------------------------------- Standard Ebooks, Wikisource, Open Library, Internet Archive
export const sourceLog: string[] = []
const SE_BOOKS = Array.from({ length: 12 }, (_, i) => ({ author: `se-author-${i}`, authorName: `SE Author ${i}`, slug: `se-book-${i}`, title: `SE Book ${i}` }))
export function seFeed() {
  const entries = SE_BOOKS.map(b => `<entry><id>https://standardebooks.org/ebooks/${b.author}/${b.slug}</id><title>${b.title}</title><updated>2026-01-01T00:00:00Z</updated><author><name>${b.authorName}</name></author><summary>A clean edition.</summary><link rel="alternate" href="/ebooks/${b.author}/${b.slug}"/><link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/ebooks/${b.author}/${b.slug}/downloads/${b.author}_${b.slug}.epub"/></entry>`).join('')
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`
}
export const WS_TITLES = Array.from({ length: 45 }, (_, i) => `Wiki Work ${i + 1}`)
export function wikisourceReply(u: URL): Reply {
  sourceLog.push('ws ' + u.search)
  const gen = u.searchParams.get('generator')
  let titles: string[]
  if (gen === 'search') { const words = (u.searchParams.get('gsrsearch') ?? '').replace(/incategory:.*$/, '').toLowerCase().split(/\s+/).filter(Boolean); titles = WS_TITLES.filter(t => words.every(w => t.toLowerCase().includes(w))) }
  else titles = u.searchParams.get('gcmtitle') === 'Category:Proofread_texts' ? Array.from({ length: 10 }, (_, i) => `Proofread Work ${i + 1}`) : WS_TITLES
  const key = gen === 'search' ? 'gsroffset' : 'gcmcontinue'
  const from = Number(u.searchParams.get(key) ?? 0), size = 20
  const slice = titles.slice(from, from + size)
  const body: Record<string, unknown> = { batchcomplete: true, query: { pages: slice.map((title, i) => ({ pageid: from + i + 1, title, index: i + 1, extract: `${title} is a proofread text.` })) } }
  if (from + size < titles.length) body.continue = { [key]: String(from + size), continue: `${key}||` }
  return ok(body)
}
export const IA_DOCS = Array.from({ length: 30 }, (_, i) => ({ key: `/works/OL${i}W`, title: `Scanned Volume ${i + 1}`, author_name: [`Scan Author ${i % 5}`], first_publish_year: 1880 + i, cover_i: 1000 + i, ia: [`scanned-volume-${i + 1}`], subject: ['Fiction'] }))
export function openLibraryReply(u: URL): Reply {
  sourceLog.push('ol ' + u.search)
  const words = (u.searchParams.get('q') ?? '').toLowerCase().replace(/subject:"[^"]*"/g, '').split(/\s+/).filter(Boolean)
  const list = IA_DOCS.filter(d => words.every(w => `${d.title} ${d.author_name.join(' ')}`.toLowerCase().includes(w)))
  const page = Number(u.searchParams.get('page') ?? 1), limit = Number(u.searchParams.get('limit') ?? 20)
  return ok({ numFound: list.length, docs: list.slice((page - 1) * limit, page * limit) })
}
/** The new sources, called directly (their APIs allow CORS) except ws-export and archive.org downloads, which the app sends through the proxy. */
export async function mockSources(ctx: BrowserContext, opts: { latency?: number; proxyAllows?: string[] } = {}) {
  const epub = readFileSync(join(here, '..', 'public', 'samples', 'pride-and-prejudice.epub'))
  await ctx.route('https://en.wikisource.org/w/api.php**', async route => { if (opts.latency) await sleepMs(opts.latency); return fulfil(route, wikisourceReply(new URL(route.request().url()))) })
  await ctx.route('https://openlibrary.org/search.json**', async route => { if (opts.latency) await sleepMs(opts.latency); return fulfil(route, openLibraryReply(new URL(route.request().url()))) })
  await ctx.route('https://archive.org/metadata/**', route => { const id = route.request().url().split('/metadata/')[1]; sourceLog.push('ia-meta ' + id); return fulfil(route, ok({ metadata: { identifier: id }, files: [{ name: `${id}.epub`, format: 'EPUB' }] })) })
  await ctx.route(/https:\/\/(covers\.openlibrary\.org|upload\.wikimedia\.org|standardebooks\.org\/images)\/.*/, route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(join(FIX, 'covers', '1342.jpg')) }))
  await ctx.route('https://standardebooks.org/ebooks/**', route => route.fulfill({ status: 200, contentType: 'application/epub+zip', headers: CORS, body: epub }))
  const handlers: ProxyHandler[] = [t => {
    if (t.hostname === 'standardebooks.org' && t.pathname === '/feeds/atom/new-releases') return { status: 200, contentType: 'application/atom+xml', headers: CORS, body: seFeed() }
    if (t.hostname === 'ws-export.wmcloud.org' || t.hostname === 'archive.org') {
      sourceLog.push('proxy ' + t.hostname)
      if (!(opts.proxyAllows ?? ['ws-export.wmcloud.org', 'archive.org']).includes(t.hostname)) return { status: 403, headers: CORS, body: 'host not allowed' }
      return { status: 200, contentType: 'application/epub+zip', headers: CORS, body: epub }
    }
    return null
  }]
  return handlers
}

// ---------------------------------------------------------------- supabase-js from the CDN
export async function mockSupabaseCdn(ctx: BrowserContext, mode: 'serve' | 'down' = 'serve') {
  const bundle = readFileSync(join(FIX, 'supabase-js.mjs'))
  for (const host of ['https://cdn.jsdelivr.net/**', 'https://esm.sh/**']) {
    await ctx.route(host, route => mode === 'down' ? route.abort('internetdisconnected')
      : route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', headers: CORS, body: bundle }))
  }
}

// ---------------------------------------------------------------- Supabase (Auth + PostgREST)
export interface FakeRow { user_id: string; book_id: string; data: { v: number; box: string; lib: string }; updated_at: string }
export class FakeSupabase {
  rows = new Map<string, FakeRow>()           // `${user_id}|${book_id}`
  users = new Map<string, { id: string; email: string }>()
  codes = new Map<string, { email: string; verifierSeen?: boolean }>()
  tokens = new Map<string, string>()          // access token -> user id
  log: { method: string; path: string; body?: unknown }[] = []
  otpRedirects: string[] = []
  deletedAccounts: string[] = []
  googleEmail = 'reader.google@example.com'
  constructor(public url: string) {}

  issueCode(email: string) { const code = 'code-' + Math.random().toString(36).slice(2); this.codes.set(code, { email }); return code }
  private user(email: string) {
    let u = [...this.users.values()].find(x => x.email === email)
    if (!u) { u = { id: crypto.randomUUID(), email }; this.users.set(u.id, u) }
    return u
  }
  private session(u: { id: string; email: string }) {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600, session_id: crypto.randomUUID() })}.sig`
    this.tokens.set(access, u.id)
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + crypto.randomUUID(), user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() } }
  }

  async install(ctx: BrowserContext) {
    await ctx.route(this.url + '/**', async route => {
      const req = route.request(), u = new URL(req.url()), m = req.method()
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      let body: unknown; try { body = req.postDataJSON() } catch { body = req.postData() }
      this.log.push({ method: m, path: u.pathname + u.search, body })
      // ---- auth
      if (u.pathname === '/auth/v1/otp' && m === 'POST') { this.otpRedirects.push(u.searchParams.get('redirect_to') ?? ''); return json(route, {}) }
      if (u.pathname === '/auth/v1/authorize') {
        const to = u.searchParams.get('redirect_to')!
        const code = this.issueCode(this.googleEmail)
        return route.fulfill({ status: 302, headers: { location: `${to}${to.includes('?') ? '&' : '?'}code=${code}` } })
      }
      if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'pkce') {
        const b = body as { auth_code?: string; code_verifier?: string }
        const c = b?.auth_code ? this.codes.get(b.auth_code) : undefined
        if (!c || !b.code_verifier) return json(route, { error: 'invalid_grant', error_description: 'bad code' }, 400)
        this.codes.delete(b.auth_code!)
        return json(route, this.session(this.user(c.email)))
      }
      if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS })
      const uid = this.tokens.get((req.headers()['authorization'] ?? '').replace(/^Bearer /, ''))
      if (u.pathname === '/auth/v1/user') return uid ? json(route, { id: uid, email: this.users.get(uid)!.email, aud: 'authenticated' }) : json(route, { msg: 'no' }, 401)
      if (u.pathname === '/functions/v1/delete-account') {
        if (!uid) return json(route, { error: 'Sign in first' }, 401)
        for (const k of [...this.rows.keys()]) if (k.startsWith(uid + '|')) this.rows.delete(k)
        this.users.delete(uid); this.tokens.delete((req.headers()['authorization'] ?? '').replace(/^Bearer /, ''))
        this.deletedAccounts.push(uid)
        return json(route, { deleted: true })
      }
      // ---- PostgREST: public.saga_sync with RLS (user_id = auth.uid())
      if (u.pathname === '/rest/v1/saga_sync') {
        if (!uid) return json(route, { message: 'JWT required' }, 401)
        if (m === 'GET') {
          let list = [...this.rows.values()].filter(r => r.user_id === uid)
          for (const [k, v] of u.searchParams) {
            if (['select', 'order', 'offset', 'limit'].includes(k)) continue
            const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)]
            list = list.filter(r => { const x = String((r as unknown as Record<string, unknown>)[k]); return op === 'eq' ? x === val : op === 'gt' ? x > val : true })
          }
          list.sort((a, b) => a.updated_at < b.updated_at ? -1 : 1)
          const off = Number(u.searchParams.get('offset') ?? 0), lim = Number(u.searchParams.get('limit') ?? 1000)
          const out = list.slice(off, off + lim).map(({ book_id, data, updated_at }) => ({ book_id, data, updated_at }))
          if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return out.length === 1 ? json(route, out[0]) : json(route, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows` }, 406)
          return json(route, out)
        }
        if (m === 'DELETE') {
          for (const [k, r] of [...this.rows]) if (r.user_id === uid) this.rows.delete(k)
          return route.fulfill({ status: 204, headers: CORS, body: '' })
        }
        if (m === 'POST') {
          for (const r of ([] as FakeRow[]).concat(body as FakeRow[])) {
            if (r.user_id && r.user_id !== uid) return json(route, { message: 'new row violates row-level security policy' }, 403)
            this.rows.set(`${uid}|${r.book_id}`, { ...r, user_id: uid })
          }
          return route.fulfill({ status: 201, headers: CORS, body: '' })
        }
      }
      return json(route, { message: `unhandled ${m} ${u.pathname}` }, 404)
    })
  }
}

/** Every Discover source at once: Gutendex/Gutenberg, Standard Ebooks, Wikisource, Open Library, Internet Archive. */
export async function mockAllSources(ctx: BrowserContext, opts: { pageSize?: number; extra?: number; latency?: number; proxyAllows?: string[] } = {}) {
  const handlers = await mockSources(ctx, opts)
  await mockGutendex(ctx, { ...opts, handlers })
}
