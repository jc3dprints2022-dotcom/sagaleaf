import { describe, it, expect, vi, afterEach } from 'vitest'
import { PROXY, viaProxy, fetchPage, fetchBook, listUrl } from '../src/app/gutendex'

describe('Discover proxy', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('wraps Gutendex and Gutenberg URLs and leaves others alone', () => {
    for (const u of ['https://gutendex.com/books/?sort=popular', 'https://www.gutenberg.org/ebooks/84.epub3.images', 'http://gutenberg.org/x', 'https://gutenberg.pglaf.org/1/2/3', 'https://aleph.gutenberg.org/cache/epub/84/pg84.txt'])
      expect(viaProxy(u)).toBe(PROXY + encodeURIComponent(u))
    for (const u of ['https://example.com/gutendex.com/', 'https://uxlvtbqmhcheklazboxr.supabase.co/auth/v1/user', 'https://notgutenberg.org/x'])
      expect(viaProxy(u)).toBe(u)
  })

  it('list and detail requests go through the proxy with a 60 s timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => { calls.push(u); return new Response(JSON.stringify(u.includes('%2Fbooks%2F84') ? { id: 84, title: 'F', authors: [], subjects: [], bookshelves: [], languages: [], copyright: false, media_type: 'Text', formats: {}, download_count: 0 } : { count: 0, next: null, previous: null, results: [] })) })
    await fetchPage(listUrl({}))
    await fetchBook(84)
    expect(calls).toEqual([PROXY + encodeURIComponent(listUrl({})), PROXY + encodeURIComponent('https://gutendex.com/books/84')])
    expect(timeout).toHaveBeenCalledWith(60_000)
    expect(timeout).not.toHaveBeenCalledWith(20_000)
  })

  it('a list request that times out or gets a 5xx is retried as often as asked, and no more', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const page = { count: 0, next: null, previous: null, results: [] }
    let n = 0
    vi.stubGlobal('fetch', async () => { if (++n === 1) throw new DOMException('timed out', 'TimeoutError'); return new Response(JSON.stringify(page)) })
    expect(await fetchPage(listUrl({}), { timeoutMs: 8000, retries: 1 })).toEqual(page)
    expect(n).toBe(2)
    expect(timeout).toHaveBeenCalledWith(8000)
    n = 0
    vi.stubGlobal('fetch', async () => { n++; return new Response('busy', { status: 503 }) })
    await expect(fetchPage(listUrl({}), { retries: 1 })).rejects.toThrow('503')
    expect(n).toBe(2)
    n = 0
    vi.stubGlobal('fetch', async () => { n++; throw new DOMException('timed out', 'TimeoutError') })
    await expect(fetchPage(listUrl({}))).rejects.toThrow('timed out')      // no retry unless asked for
    expect(n).toBe(1)
    n = 0
    vi.stubGlobal('fetch', async () => { n++; return new Response('no', { status: 404 }) })
    await expect(fetchPage(listUrl({}), { retries: 1 })).rejects.toThrow('404')   // a 4xx is an answer, not a blip
    expect(n).toBe(1)
  })
})
