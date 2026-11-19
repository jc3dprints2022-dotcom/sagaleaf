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
interface GBook { id: number; title: string; authors: { name: string }[]; subjects: string[]; bookshelves: string[]; download_count: number; formats: Record<string, string> }
export const GBOOKS: GBook[] = JSON.parse(readFileSync(join(FIX, 'gutendex-books.json'), 'utf8'))
export const gutendexLog: string[] = []

export async function mockGutendex(ctx: BrowserContext, opts: { pageSize?: number } = {}) {
  const size = opts.pageSize ?? 6
  await ctx.route('https://gutendex.com/**', route => {
    const u = new URL(route.request().url())
    gutendexLog.push(u.pathname + u.search)
    const one = u.pathname.match(/^\/books\/(\d+)\/?$/)
    if (one) { const b = GBOOKS.find(x => x.id === Number(one[1])); return b ? json(route, b) : json(route, { detail: 'Not found.' }, 404) }
    const words = (u.searchParams.get('search') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const topic = (u.searchParams.get('topic') ?? '').toLowerCase()
    let list = GBOOKS.filter(b => words.every(w => `${b.title} ${b.authors.map(a => a.name).join(' ')}`.toLowerCase().includes(w)))
    if (topic) list = list.filter(b => [...b.subjects, ...b.bookshelves].some(s => s.toLowerCase().includes(topic)))
    list = list.sort((a, b) => b.download_count - a.download_count)
    const page = Number(u.searchParams.get('page') ?? 1)
    const next = page * size < list.length ? (() => { const n = new URL(u); n.searchParams.set('page', String(page + 1)); return n.toString() })() : null
    return json(route, { count: list.length, next, previous: null, results: list.slice((page - 1) * size, page * size) })
  })
  const epub = readFileSync(join(here, '..', 'public', 'samples', 'pride-and-prejudice.epub'))
  const txt = readFileSync(join(here, '..', 'public', 'samples', 'sherlock-holmes-sample.txt'))
  await ctx.route('https://www.gutenberg.org/**', route => {
    const u = new URL(route.request().url())
    const cover = u.pathname.match(/\/cache\/epub\/(\d+)\/pg\d+\.cover\.medium\.jpg$/)
    if (cover) { try { return route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(join(FIX, 'covers', `${cover[1]}.jpg`)) }) } catch { return route.fulfill({ status: 404 }) } }
    // 1342: downloads normally. 1661: no EPUB, plain text works. 84: the browser refuses the download (CORS).
    if (u.pathname === '/ebooks/1342.epub3.images') return route.fulfill({ status: 200, contentType: 'application/epub+zip', headers: CORS, body: epub })
    if (u.pathname.startsWith('/ebooks/1661.epub')) return route.fulfill({ status: 404, headers: CORS, body: 'not found' })
    if (u.pathname === '/ebooks/1661.txt.utf-8') return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: CORS, body: txt })
    // A real browser refuses Gutenberg's files without CORS headers; fetch() then rejects. Playwright's
    // fulfilled responses skip that check, so the refusal is reproduced as a failed request.
    if (u.pathname.startsWith('/ebooks/84.') && route.request().resourceType() === 'fetch') return route.abort('failed')
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Project Gutenberg</title><p>Project Gutenberg page for ${u.pathname}</p>` })
  })
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
