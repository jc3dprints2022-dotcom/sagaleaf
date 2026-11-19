import { describe, it, expect } from 'vitest'
import { findQuote, quoteAt, collapse, absoluteFraction, fromFraction, snippetAt, rangeToOffsets, offsetsToRange } from '../src/core/anchor'

const book = [
  'Chapter One. It was a bright cold day in April, and the clocks were striking thirteen.',
  'Chapter Two. The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster had been tacked to the wall.',
  'Chapter Three. It was a bright cold day in April again, but nobody noticed.',
]

describe('annotation anchors', () => {
  it('finds a quote at its original place', () => {
    const start = book[1].indexOf('boiled cabbage'), end = start + 'boiled cabbage'.length
    const m = findQuote(book, quoteAt(book[1], start, end), { section: 1, start })!
    expect(m).toMatchObject({ section: 1, start, end })
  })
  it('uses context to pick the right one of two identical passages', () => {
    const s = book[2].indexOf('It was a bright'), e = s + 'It was a bright cold day in April'.length
    const q = quoteAt(book[2], s, e)
    expect(findQuote(book, q)!.section).toBe(2)
    const s0 = book[0].indexOf('It was'); expect(findQuote(book, quoteAt(book[0], s0, s0 + 33))!.section).toBe(0)
  })
  it('re-anchors after whitespace, quotes and offsets change (new layout or edition)', () => {
    const start = book[1].indexOf('At one end'), end = book[1].indexOf('poster') + 6
    const q = quoteAt(book[1], start, end)
    const edited = [...book]
    edited[1] = 'PREFACE ADDED. ' + book[1].replace('At one end of it', 'At  one\nend   of it')
    const m = findQuote(edited, q, { section: 1, start })!
    expect(m.section).toBe(1)
    expect(edited[1].slice(m.start, m.end).replace(/\s+/g, ' ')).toBe('At one end of it a coloured poster')
  })
  it('falls back to head and tail when the middle of a passage was edited', () => {
    const start = book[1].indexOf('The hallway'), end = book[1].indexOf('rag mats') + 8
    const q = quoteAt(book[1], start, end)
    const edited = [...book]; edited[1] = book[1].replace('boiled cabbage', 'stewed turnip')
    const m = findQuote(edited, q)!
    expect(m.section).toBe(1)
    expect(edited[1].slice(m.start, m.end)).toContain('stewed turnip')
  })
  it('returns null rather than a wrong place when the text is gone', () => {
    expect(findQuote(book, { exact: 'a passage that is not in this book at all' })).toBeNull()
  })
  it('collapse keeps a map back to original offsets', () => {
    const c = collapse('A  “B”\n c')
    expect(c.text).toBe('a "b" c')
    expect(c.map[2]).toBe(3)
  })
  it('converts between section offsets and whole-book fractions', () => {
    const lens = [100, 300, 100]
    expect(absoluteFraction(lens, 1, 150)).toBeCloseTo(0.5)
    expect(fromFraction(lens, 0.5)).toEqual({ section: 1, offset: 150 })
    expect(fromFraction(lens, 1)).toEqual({ section: 2, offset: 100 })
  })
  it('snippets start on a word boundary', () => {
    expect(snippetAt('the quick brown fox jumps', 6, 2)).toBe('quick brown')
  })
  it('maps DOM ranges to text offsets and back', () => {
    document.body.innerHTML = '<p>Hello <b>bright</b> world</p><p>Second para</p>'
    const r = offsetsToRange(document.body, 6, 18)!
    expect(r.toString()).toBe('bright world')
    expect(rangeToOffsets(document.body, r)).toEqual({ start: 6, end: 18 })
  })
})
