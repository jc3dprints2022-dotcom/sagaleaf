import type { Hlc } from './types'

export const uid = (n = 16) => {
  const b = new Uint8Array(n / 2)
  crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('')
}

/** Hybrid logical clock: wall time + counter + device, ordered as a plain string.
 *  Survives clock skew between devices and never goes backwards on one device. */
export class Clock {
  private ms = 0
  private n = 0
  constructor(public device: string, private now: () => number = Date.now) {}
  tick(): Hlc {
    const t = this.now()
    if (t > this.ms) { this.ms = t; this.n = 0 } else this.n++
    return fmt(this.ms, this.n, this.device)
  }
  observe(h: Hlc) {
    const [ms, n] = parseHlc(h)
    if (ms > this.ms || (ms === this.ms && n > this.n)) { this.ms = ms; this.n = n }
  }
}
const fmt = (ms: number, n: number, d: string) => `${String(ms).padStart(15, '0')}:${String(n).padStart(5, '0')}:${d}`
export const parseHlc = (h: Hlc): [number, number, string] => {
  const [a, b, ...c] = h.split(':')
  return [Number(a), Number(b), c.join(':')]
}
export const hlcTime = (h?: Hlc) => (h ? parseHlc(h)[0] : 0)

export const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

const ARTICLES = /^(the|a|an|le|la|les|der|die|das|el|los|las)\s+/i
export const sortKey = (title: string) => norm(title).replace(ARTICLES, '').replace(/[^\p{L}\p{N} ]/gu, '').trim()

/** Key used for "probably the same book" detection (different files, same work). */
export const workKey = (title: string, author: string) =>
  sortKey(title.split(/[:(\[]/)[0]) + '|' + norm(author).replace(/[^\p{L} ]/gu, '').split(/\s+/).filter(Boolean).sort().join(' ')

export const tintOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360 }

export const fmtBytes = (n?: number | null) => {
  if (n == null) return '—'
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0))

export function ago(t?: number, now = Date.now()) {
  if (!t) return 'never'
  const s = Math.max(0, (now - t) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`
  return new Date(t).toLocaleDateString()
}
