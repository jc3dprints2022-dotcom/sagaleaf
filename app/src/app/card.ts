// One card type for every Discover source, plus the rules for merging them:
// dedupe by normalized title + author, preferring the cleanest edition, and
// interleave sources so no single catalogue fills the page.
import { norm, sortKey } from '../core/util'

export type SourceId = 'standardebooks' | 'gutenberg' | 'wikisource' | 'internetarchive'
export interface DiscoverCard {
  /** Catalog id, also the route (#/catalog/<id>) and Book.catalogId: pg-1342, se~author~title, ws~Page_title, ia~identifier. */
  id: string
  source: SourceId
  title: string
  author: string
  cover?: string
  year?: number
  summary?: string
  subjects: string[]
  pageUrl: string
  /** OCR scans (Internet Archive): shown last and never next to a clean edition of the same work. */
  scanned?: boolean
}

export const SOURCE_LABEL: Record<SourceId, string> = { standardebooks: 'Standard Ebooks', gutenberg: 'Project Gutenberg', wikisource: 'Wikisource', internetarchive: 'Internet Archive (scanned)' }
/** Lower wins when two sources have the same work. */
export const SOURCE_RANK: Record<SourceId, number> = { standardebooks: 0, gutenberg: 1, wikisource: 2, internetarchive: 3 }

const titleKey = (t: string) => sortKey(t.replace(/\s*\([^)]*\)\s*$/, '').split(/[:;]/)[0])
/** Last name of the first author: "Austen, Jane", "Jane Austen" and "Jane Austen and others" all give "austen". */
export function authorKey(a: string) {
  const first = norm(a).split(/\s+(?:and|&)\s+|;/)[0].trim()
  const last = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop() ?? ''
  const k = last.replace(/[^\p{L}]/gu, '')
  return /^(unknown|anonymous|various|wikisource)/.test(k) ? '' : k
}
const keys = new WeakMap<object, [string, string]>()
const keyPair = (c: Pick<DiscoverCard, 'title' | 'author'>): [string, string] => { let k = keys.get(c); if (!k) { k = [titleKey(c.title), authorKey(c.author)]; keys.set(c, k) } return k }
export const cardKey = (c: Pick<DiscoverCard, 'title' | 'author'>) => keyPair(c).join('|')
/** Same work: same title, and the same author unless one side doesn't name one. */
export function sameWork(a: Pick<DiscoverCard, 'title' | 'author'>, b: Pick<DiscoverCard, 'title' | 'author'>) {
  const [ta, aa] = keyPair(a), [tb, ab] = keyPair(b)
  return !!ta && ta === tb && (!aa || !ab || aa === ab)
}

/** Drops duplicates and anything already in `seen` (shown on an earlier page), keeping the best-ranked edition
 *  within the batch, in the position of its first appearance. Scans (Internet Archive) are dropped whenever a
 *  clean edition of the same work is known or in the batch. Adds what it keeps to `seen`. */
export function dedupe(cards: DiscoverCard[], seen: DiscoverCard[] = []): DiscoverCard[] {
  // candidates are found by title key, so this is linear, not quadratic, in the number of cards
  const byTitle = new Map<string, DiscoverCard[]>()
  for (const k of seen) { const t = keyPair(k)[0]; (byTitle.get(t) ?? byTitle.set(t, []).get(t)!).push(k) }
  const out: DiscoverCard[] = [], inBatch = new Map<string, DiscoverCard[]>()
  for (const c of cards) {
    const t = keyPair(c)[0]
    if ((byTitle.get(t) ?? []).some(k => sameWork(k, c))) continue
    const mates = inBatch.get(t) ?? inBatch.set(t, []).get(t)!
    const a = mates.find(o => sameWork(o, c))
    if (!a) { out.push(c); mates.push(c); continue }
    if ((a.scanned ? 1 : 0) > (c.scanned ? 1 : 0) || (!!a.scanned === !!c.scanned && SOURCE_RANK[c.source] < SOURCE_RANK[a.source])) { out[out.indexOf(a)] = c; mates[mates.indexOf(a)] = c }
  }
  seen.push(...out)
  return out
}

/** a1 b1 c1 a2 b2 c2 … (lists may differ in length). */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}
