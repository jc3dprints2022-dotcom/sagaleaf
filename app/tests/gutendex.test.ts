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
})
