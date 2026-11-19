import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { store, useLive, go, href, toast, engine as syncEngine } from '../../app/state'
import { loadAnnotations } from '../../app/data'
import type { Annotation, Book, Position, ReaderPrefs } from '../../core/types'
import { defaultPrefs } from '../../core/types'
import { bookTexts, searchText, type Hit } from '../../core/library'
import { findQuote, quoteAt, absoluteFraction, fromFraction } from '../../core/anchor'
import { txtToEpub } from '../../core/txt'
import { hlcTime, ago, uid } from '../../core/util'
import { createEpubEngine, createPdfEngine, EngineAborted, THEMES, FONTS, type Engine, type Loc, type Sel, type TocItem } from './engine'
import { Icon } from '../icons'
import { HL_COLORS, hlCss, Toggle, chapterLabel } from '../components'
import './reader.css'

type Panel = null | 'toc' | 'search' | 'notes' | 'type'

export default function Reader({ id }: { id: string }) {
  const book = useLive(() => store.db.books.get(id), [id], ['books'])
  if (book === undefined) return <div className="reader-loading">Opening…</div>
  if (!book || book.deleted) return <ReaderMissing text="This book isn’t in your library anymore." />
  if (book.fileState !== 'local') return <ReaderMissing text="This book’s file is on your other devices. Download it from the book page to read offline." action={<a className="btn primary" href={href(`book/${id}`)}>Go to book</a>} />
  return <ReaderInner book={book} />
}

function ReaderMissing({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="reader-loading"><p>{text}</p>{action ?? <a className="btn" href={href('library')}>Back to library</a>}</div>
}

function ReaderInner({ book }: { book: Book }) {
  const host = useRef<HTMLDivElement>(null)
  const eng = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loc, setLoc] = useState<Loc | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [jump, setJump] = useState<Position | null>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const prefsRaw = useLive(() => store.prefs(), [], ['meta'])
  const prefs: ReaderPrefs = prefsRaw ?? defaultPrefs
  const anns = useLive(() => loadAnnotations(book.id), [book.id], ['annotations'])
  const live = useMemo(() => (anns ?? []).filter(a => !a.deleted), [anns])
  const lengths = useRef<number[]>([])
  const titles = useRef<string[]>([])
  const sysDark = useMedia('(prefers-color-scheme: dark)')
  const theme = THEMES[prefs.theme === 'auto' ? (sysDark ? 'night' : 'day') : prefs.theme] ?? THEMES.day

  // Progress is measured in characters of text, so every device (and the Leaf,
  // which reads a converted copy) computes the same number for the same place.
  const bookFraction = (l: Loc) => (book.format !== 'pdf' && lengths.current.length && l.section >= 0 ? absoluteFraction(lengths.current, l.section, l.offset) : l.fraction)

  // ---- save position (debounced) and on hide
  const pending = useRef<Loc | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = useCallback(async () => {
    const l = pending.current; pending.current = null
    if (!l) return
    const fraction = bookFraction(l)
    await store.put<Position>('position', `${book.id}:${store.deviceId}`, { bookId: book.id, deviceId: store.deviceId, deviceName: store.deviceName, cfi: l.cfi, section: l.section, offset: l.offset, fraction, snippet: l.snippet, at: store.clock.tick() })
    if (book.status === 'new') await store.put<Book>('book', book.id, { status: 'reading' })
    if (fraction > 0.995 && book.status !== 'finished') await store.put<Book>('book', book.id, { status: 'finished' })
  }, [book.id, book.status])
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void flush() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', flush)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flush); void flush() }
  }, [flush])

  useEffect(() => { document.documentElement.classList.add('reading'); return () => document.documentElement.classList.remove('reading') }, [])

  // ---- open
  useEffect(() => {
    let dead = false
    const abort = new AbortController()   // stops an EPUB that is still opening when the reader closes
    ;(async () => {
      try {
        const [file, texts, positions] = await Promise.all([store.db.files.get(book.hash), bookTexts(store, book.id), store.db.positions.where('bookId').equals(book.id).toArray()])
        if (!file) throw new Error('The book file is missing on this device. Re-import it to read.')
        lengths.current = texts.map(t => t.text.length); titles.current = texts.map(t => t.title)
        // annotations that arrived from elsewhere without a location (Leaf, merged edition): place them now
        const all = await loadAnnotations(book.id)
        for (const a of all) if (!a.deleted && a.exact && (a.section < 0 || a.orphaned)) {
          const m = findQuote(texts.map(t => t.text), a, { fraction: a.fraction })
          await store.put<Annotation>('annotation', a.id, m ? { section: m.section, start: m.start, end: m.end, cfi: undefined, orphaned: false, fraction: absoluteFraction(lengths.current, m.section, m.start) } : { orphaned: true })
        }
        const mine = positions.find(p => p.deviceId === store.deviceId && !p.deleted)
        const others = positions.filter(p => p.deviceId !== store.deviceId && !p.deleted).sort((a, b) => (a.at < b.at ? 1 : -1))
        const q = new URLSearchParams(location.hash.split('?')[1] ?? '')
        const annId = q.get('ann'), sec = q.get('s'), off = q.get('o')
        const target = annId ? all.find(a => a.id === annId) : null
        let start: { cfi?: string; section?: number; offset?: number } | null = null
        if (target && target.section >= 0) start = { section: target.section, offset: target.start }
        else if (sec != null) start = { section: Number(sec), offset: Number(off ?? 0) }
        else if (mine) start = mine.cfi && book.format !== 'pdf' ? { cfi: mine.cfi } : { section: mine.section, offset: mine.offset }
        else if (others[0]) { start = { section: others[0].section, offset: others[0].offset }; toast(`Picked up where you left off on ${others[0].deviceName}`) }
        if (mine && others[0] && others[0].at > mine.at && Math.abs(others[0].fraction - mine.fraction) > 0.003 && !target && sec == null) setJump(others[0])

        const events = {
          relocate: (l: Loc) => { setLoc(l); pending.current = l; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(flush, 900) },
          select: (s: Sel | null) => setSel(s),
          tap: (z: 'prev' | 'next' | 'center') => { if (z === 'center') setChrome(c => !c); else { setChrome(false); void (z === 'next' ? eng.current?.next() : eng.current?.prev()) } },
          markClick: (aid: string) => setEditing(aid),
          key: (e: KeyboardEvent) => onKey(e),
          resolved: (aid: string, patch: Partial<Annotation>) => { void store.put<Annotation>('annotation', aid, patch) },
        }
        let e: Engine
        if (book.format === 'pdf') e = await createPdfEngine(host.current!, file.data, events, start)
        else {
          let f = new File([file.data as BlobPart], book.filename ?? 'book.epub', { type: 'application/epub+zip' })
          if (book.format === 'txt') f = new File([await txtToEpub(texts.map(t => ({ title: t.title, text: t.text.split('\n').join('\n\n') })), { title: book.title, author: book.author, language: book.language })], 'book.epub')
          e = await createEpubEngine(host.current!, f, events, start, abort.signal)
        }
        if (dead) { e.destroy(); return }
        eng.current = e; setToc(e.toc); setReady(true)
        if (target?.section != null && target.section >= 0) void e.goToOffset(target.section, target.start, target.end, true)
      } catch (err) { if (dead || err instanceof EngineAborted) return; console.error(err); setError((err as Error).message || 'This book couldn’t be opened.') }
    })()
    return () => { dead = true; abort.abort(); eng.current?.destroy(); eng.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  useEffect(() => { if (ready) eng.current?.applyPrefs(prefs, theme) }, [ready, prefs, theme])
  useEffect(() => { if (ready) eng.current?.setMarks(live.filter(a => a.section >= 0 && !a.orphaned)) }, [ready, live])

  // ---- keyboard
  const onKey = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); void eng.current?.next(); setChrome(false) }
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); void eng.current?.prev(); setChrome(false) }
    else if (k === 'Escape') { if (editing) setEditing(null); else if (panel) setPanel(null); else if (sel) eng.current?.clearSelection(); else go(`book/${book.id}`) }
    else if (k === 't') setPanel(p => (p === 'toc' ? null : 'toc'))
    else if (k === '/' || k === 'f') { e.preventDefault(); setPanel('search') }
    else if (k === 'n') setPanel(p => (p === 'notes' ? null : 'notes'))
    else if (k === 'a') setPanel(p => (p === 'type' ? null : 'type'))
    else if (k === 'b') void toggleBookmark()
    else if (k === 'm') setChrome(c => !c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, panel, sel, book.id])
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onKey])

  // ---- annotations
  async function texts() { return (await bookTexts(store, book.id)).map(t => t.text) }
  async function createAnn(kind: Annotation['kind'], color = 'amber', openEditor = false) {
    if (!sel) return
    const tx = await texts()
    const sectionText = tx[sel.section] ?? ''
    const q = quoteAt(sectionText, sel.start, sel.end)
    const exact = q.exact.trim() ? q.exact : sel.text
    const aid = 'a' + uid(12)
    await store.put<Annotation>('annotation', aid, {
      bookId: book.id, kind, section: sel.section, start: sel.start, end: sel.end, exact, prefix: q.prefix, suffix: q.suffix, cfi: sel.cfi,
      note: '', color, tags: [], label: titles.current[sel.section] || loc?.label || '', fraction: absoluteFraction(lengths.current, sel.section, sel.start),
      createdAt: Date.now(), updatedAt: Date.now(), origin: store.deviceName,
    })
    eng.current?.clearSelection()
    if (openEditor) setEditing(aid)
    else toast('Highlighted', { label: 'Undo', run: () => void store.remove('annotation', aid) }, 3000)
  }
  const currentBookmark = useMemo(() => loc && live.find(a => a.kind === 'bookmark' && a.section === loc.section && Math.abs(a.start - loc.offset) < 400), [loc, live])
  async function toggleBookmark() {
    const l = eng.current?.location(); if (!l) return
    if (currentBookmark) { await store.remove('annotation', currentBookmark.id); toast('Bookmark removed'); return }
    const tx = await texts()
    const q = quoteAt(tx[l.section] ?? '', l.offset, Math.min((tx[l.section] ?? '').length, l.offset + 80))
    await store.put<Annotation>('annotation', 'b' + uid(12), { bookId: book.id, kind: 'bookmark', section: l.section, start: l.offset, end: l.offset, ...q, cfi: l.cfi, note: '', color: 'amber', tags: [], label: titles.current[l.section] || l.label, fraction: absoluteFraction(lengths.current, l.section, l.offset), createdAt: Date.now(), updatedAt: Date.now(), origin: store.deviceName })
    toast('Bookmarked')
  }
  const goToAnn = (a: Annotation) => { setPanel(null); void eng.current?.goToOffset(a.section, a.start, a.kind === 'bookmark' ? undefined : a.end, a.kind !== 'bookmark') }

  const shown = loc ? bookFraction(loc) : NaN
  const pctText = Number.isFinite(shown) ? `${Math.round(shown * 100)}%` : ''
  const chapter = chapterLabel(loc?.label || (loc ? titles.current[loc.section] : '') || '')

  return (
    <div className={`reader theme-${theme.id}${chrome ? ' chrome' : ''}`} style={{ '--r-bg': theme.bg, '--r-fg': theme.fg, '--r-muted': theme.muted, '--r-accent': theme.accent } as React.CSSProperties}>
      <header className="r-top" aria-hidden={!chrome}>
        <a className="icon-btn" href={href(`book/${book.id}`)} onClick={() => void flush()} aria-label="Close book"><Icon.back /></a>
        <div className="r-title"><b>{book.title}</b><span>{chapter}</span></div>
        <button className="icon-btn" aria-label="Contents (T)" aria-pressed={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? null : 'toc')}><Icon.toc /></button>
        <button className="icon-btn" aria-label="Search in book (/)" aria-pressed={panel === 'search'} onClick={() => setPanel(panel === 'search' ? null : 'search')}><Icon.search /></button>
        <button className="icon-btn" aria-label="Highlights and notes (N)" aria-pressed={panel === 'notes'} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}><Icon.notes /></button>
        <button className="icon-btn" aria-label={currentBookmark ? 'Remove bookmark (B)' : 'Bookmark this page (B)'} aria-pressed={!!currentBookmark} onClick={toggleBookmark}><Icon.bookmark fill={currentBookmark ? 'currentColor' : 'none'} /></button>
        <button className="icon-btn" aria-label="Text and layout (A)" aria-pressed={panel === 'type'} onClick={() => setPanel(panel === 'type' ? null : 'type')}><Icon.type /></button>
      </header>

      <div className="r-stage" ref={host} role="region" aria-label={`${book.title}, reading view`} data-cfi={loc?.cfi ?? `${loc?.section}:${loc?.offset}`} />
      {!ready && !error && <div className="reader-loading overlay">Opening {book.title}…</div>}
      {error && <div className="reader-loading overlay"><p>{error}</p><a className="btn" href={href(`book/${book.id}`)}>Back</a></div>}

      {ready && book.format !== 'pdf' && prefs.flow === 'paginated' && (
        <>
          <button className="r-edge left" aria-label="Previous page" onClick={() => void eng.current?.prev()} />
          <button className="r-edge right" aria-label="Next page" onClick={() => void eng.current?.next()} />
        </>
      )}

      <footer className="r-bottom" aria-hidden={!chrome}>
        <span className="r-chapter">{chapter}</span>
        <input type="range" className="r-slider" min={0} max={1000} value={Number.isFinite(shown) ? Math.round(shown * 1000) : 0} aria-label="Position in book" aria-valuetext={pctText} onChange={e => { const f = Number(e.target.value) / 1000; if (book.format === 'pdf' || !lengths.current.length) void eng.current?.goToFraction(f); else { const t = fromFraction(lengths.current, f); void eng.current?.goToOffset(t.section, t.offset) } }} />
        <span className="r-pct num">{pctText}</span>
      </footer>
      <div className="r-mini num" aria-hidden="true">{pctText}</div>

      {jump && (
        <div className="r-jump" role="status">
          <span><b>{jump.deviceName}</b> is further along: {Math.round(jump.fraction * 100)}%{jump.snippet ? <>, at <i>“{jump.snippet.slice(0, 60)}…”</i></> : null} ({ago(hlcTime(jump.at))})</span>
          <button className="btn small primary" onClick={() => { void (jump.cfi && book.format !== 'pdf' && !jump.deviceId.startsWith('leaf-') ? eng.current?.goToTarget(jump.cfi) : eng.current?.goToOffset(jump.section, jump.offset)); setJump(null) }}>Go there</button>
          <button className="btn small quiet" onClick={() => setJump(null)}>Stay here</button>
        </div>
      )}

      {sel && !editing && <SelectionMenu sel={sel} onHighlight={c => createAnn('highlight', c)} onNote={() => createAnn('note', 'amber', true)} onCopy={() => { void navigator.clipboard?.writeText(sel.text.trim()); eng.current?.clearSelection(); toast('Copied') }} onSearch={() => { setPanel('search'); setSearchSeed(sel.text.trim().slice(0, 80)); eng.current?.clearSelection() }} />}

      {panel && (
        <aside className="r-panel" aria-label={panel === 'toc' ? 'Contents' : panel === 'search' ? 'Search' : panel === 'notes' ? 'Highlights and notes' : 'Text and layout'}>
          <div className="r-panel-head"><h2>{panel === 'toc' ? 'Contents' : panel === 'search' ? 'Search this book' : panel === 'notes' ? 'Highlights and notes' : 'Text and layout'}</h2><button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close panel"><Icon.close /></button></div>
          {panel === 'toc' && <TocPanel toc={toc} current={chapter} onGo={t => { setPanel(null); void eng.current?.goToTarget(t) }} />}
          {panel === 'search' && <SearchPanel bookId={book.id} seed={searchSeed} titles={titles.current} onGo={h => { void eng.current?.goToOffset(h.section, h.start, h.end, true); if (innerWidth < 860) setPanel(null) }} />}
          {panel === 'notes' && <NotesPanel anns={live} onGo={goToAnn} onEdit={a => setEditing(a.id)} />}
          {panel === 'type' && <TypePanel prefs={prefs} isPdf={book.format === 'pdf'} />}
        </aside>
      )}

      {editing && <NoteEditor id={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
let searchSeed = ''
function setSearchSeed(s: string) { searchSeed = s }

function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q])
  return m
}

function SelectionMenu({ sel, onHighlight, onNote, onCopy, onSearch }: { sel: Sel; onHighlight: (c: string) => void; onNote: () => void; onCopy: () => void; onSearch: () => void }) {
  const top = sel.rect.top > 90 ? sel.rect.top - 58 : sel.rect.bottom + 12
  const left = Math.min(Math.max(12, sel.rect.left + sel.rect.width / 2 - 170), innerWidth - 352)
  return (
    <div className="sel-menu" style={{ top, left }} role="toolbar" aria-label="Selection">
      {HL_COLORS.map(c => <button key={c.id} className="swatch" style={{ background: c.css }} aria-label={`Highlight ${c.label}`} onMouseDown={e => e.preventDefault()} onClick={() => onHighlight(c.id)} />)}
      <span className="sep" />
      <button onMouseDown={e => e.preventDefault()} onClick={onNote}><Icon.note />Note</button>
      <button onMouseDown={e => e.preventDefault()} onClick={onCopy}><Icon.copy />Copy</button>
      <button onMouseDown={e => e.preventDefault()} onClick={onSearch}><Icon.search />Find</button>
    </div>
  )
}

function TocPanel({ toc: raw, current, onGo }: { toc: TocItem[]; current: string; onGo: (t: string | number) => void }) {
  const toc = raw.map(t => ({ ...t, label: chapterLabel(t.label) }))
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'center' }) }, [])
  if (!toc.length) return <p className="muted r-pad">This book has no table of contents.</p>
  return <nav className="r-toc">{toc.map((t, i) => { const cur = t.label === current; return <button key={i} ref={cur ? ref : undefined} aria-current={cur ? 'true' : undefined} style={{ paddingLeft: 18 + t.depth * 16 }} onClick={() => onGo(t.target)}>{t.label}</button> })}</nav>
}

function SearchPanel({ bookId, seed, titles, onGo }: { bookId: string; seed: string; titles: string[]; onGo: (h: Hit) => void }) {
  const [q, setQ] = useState(seed)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return }
    const sig = { aborted: false }
    const t = setTimeout(async () => { const t0 = performance.now(); const r = await searchText(store, q, { bookId, limit: 300, signal: sig }); if (!sig.aborted) { setHits(r); setMs(Math.round(performance.now() - t0)) } }, 160)
    return () => { sig.aborted = true; clearTimeout(t) }
  }, [q, bookId])
  return (
    <div className="r-pad">
      <label className="search-input"><span className="sr-only">Search this book</span><Icon.search /><input autoFocus className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Words or a phrase" /></label>
      {hits && <p className="small muted" style={{ margin: '10px 2px' }}>{hits.length ? `${hits.length}${hits.length >= 300 ? '+' : ''} matches in ${ms} ms` : 'No matches.'}</p>}
      <div className="r-hits">{hits?.map((h, i) => (
        <button key={i} onClick={() => onGo(h)}><span className="small muted">{titles[h.section] || `Section ${h.section + 1}`}</span><span>…{h.before.slice(-50)}<mark>{h.match}</mark>{h.after.slice(0, 70)}…</span></button>
      ))}</div>
    </div>
  )
}

function NotesPanel({ anns, onGo, onEdit }: { anns: Annotation[]; onGo: (a: Annotation) => void; onEdit: (a: Annotation) => void }) {
  const [kind, setKind] = useState<'all' | 'notes' | 'bookmark'>('all')
  const list = anns.filter(a => kind === 'all' || (kind === 'notes' ? !!a.note : a.kind === 'bookmark'))
  return (
    <div className="r-pad">
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>{(['all', 'notes', 'bookmark'] as const).map(k => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'notes' ? 'With notes' : 'Bookmarks'}</button>)}</div>
      {!list.length && <p className="muted small">Select text to highlight it. Press B to bookmark a page.</p>}
      <div className="r-notes">{list.map(a => (
        <div key={a.id} className="r-note" style={{ '--hl': hlCss(a.color) } as React.CSSProperties}>
          <button className="r-note-main" onClick={() => onGo(a)}>
            {a.kind === 'bookmark' ? <span className="small"><Icon.bookmark width={14} /> {a.label || 'Bookmark'}, {Math.round(a.fraction * 100)}%</span> : a.exact ? <blockquote>{a.exact.length > 220 ? a.exact.slice(0, 220) + '…' : a.exact}</blockquote> : null}
            {a.note && <p>{a.note}</p>}
            {a.orphaned && a.exact && <span className="pill warn">Not found in this edition</span>}
            {!!a.conflicts?.length && <span className="pill warn">Edited on two devices</span>}
          </button>
          {a.kind !== 'bookmark' && <button className="btn quiet small" onClick={() => onEdit(a)}>Edit</button>}
        </div>
      ))}</div>
    </div>
  )
}

function TypePanel({ prefs, isPdf }: { prefs: ReaderPrefs; isPdf: boolean }) {
  const set = (p: Partial<ReaderPrefs>) => void store.setMeta('prefs', { ...prefs, ...p })
  return (
    <div className="r-pad r-type">
      <div className="field"><span>Theme</span>
        <div className="r-themes">{(['day', 'warm', 'mist', 'night', 'auto'] as const).map(t => (
          <button key={t} aria-pressed={prefs.theme === t} onClick={() => set({ theme: t })} style={t !== 'auto' ? { background: THEMES[t].bg, color: THEMES[t].fg } : undefined} className={t === 'auto' ? 'auto' : ''}>{t === 'day' ? 'Day' : t === 'warm' ? 'Warm' : t === 'mist' ? 'E-ink' : t === 'night' ? 'Night' : 'Match system'}</button>
        ))}</div>
      </div>
      {!isPdf && <div className="field"><span>Typeface</span>
        <div className="r-fonts">{Object.entries(FONTS).map(([name, stack]) => <button key={name} aria-pressed={prefs.font === name} onClick={() => set({ font: name })} style={{ fontFamily: stack }}>{name === 'System' ? 'System sans' : name}</button>)}</div>
      </div>}
      <div className="field"><label htmlFor="t-size">{isPdf ? 'Zoom' : 'Size'} <span className="muted num">{isPdf ? `${Math.round(prefs.size / 18 * 100)}%` : `${prefs.size}px`}</span></label>
        <div className="row"><button className="icon-btn" aria-label="Smaller" onClick={() => set({ size: Math.max(12, prefs.size - 1) })}>A−</button><input id="t-size" type="range" min={12} max={36} value={prefs.size} onChange={e => set({ size: Number(e.target.value) })} style={{ flex: 1 }} /><button className="icon-btn" aria-label="Larger" onClick={() => set({ size: Math.min(36, prefs.size + 1) })}>A+</button></div>
      </div>
      {!isPdf && <>
        <div className="field"><label htmlFor="t-lh">Line spacing <span className="muted num">{prefs.lineHeight.toFixed(2)}</span></label><input id="t-lh" type="range" min={1.2} max={2.1} step={0.05} value={prefs.lineHeight} onChange={e => set({ lineHeight: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="t-m">Margins <span className="muted num">{prefs.margin}%</span></label><input id="t-m" type="range" min={0} max={16} value={prefs.margin} onChange={e => set({ margin: Number(e.target.value) })} /></div>
        <div className="field"><span>Line length</span><div className="seg">{([[560, 'Short'], [680, 'Medium'], [880, 'Long']] as const).map(([w, l]) => <button key={w} aria-pressed={prefs.maxWidth === w} onClick={() => set({ maxWidth: w })}>{l}</button>)}</div></div>
        <div className="field"><span>Layout</span><div className="seg"><button aria-pressed={prefs.flow === 'paginated'} onClick={() => set({ flow: 'paginated' })}>Pages</button><button aria-pressed={prefs.flow === 'scrolled'} onClick={() => set({ flow: 'scrolled' })}>Scroll</button></div></div>
        <label className="row r-switch"><span style={{ flex: 1 }}>Justify text</span><Toggle label="Justify text" checked={prefs.justify} onChange={v => set({ justify: v })} /></label>
        <label className="row r-switch"><span style={{ flex: 1 }}>Hyphenate</span><Toggle label="Hyphenate" checked={prefs.hyphenate} onChange={v => set({ hyphenate: v })} /></label>
        <label className="row r-switch"><span style={{ flex: 1 }}>Use the publisher’s fonts</span><Toggle label="Use the publisher’s fonts" checked={prefs.publisherStyles} onChange={v => set({ publisherStyles: v })} /></label>
      </>}
      <p className="small muted" style={{ marginTop: 18 }}>Keys: ← → turn pages, T contents, / search, N notes, B bookmark, M menu, Esc close.</p>
    </div>
  )
}

function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useLive(() => store.db.annotations.get(id), [id], ['annotations'])
  const [note, setNote] = useState<string | null>(null)
  const [tags, setTags] = useState<string | null>(null)
  if (!a) return null
  const save = async (extra: Partial<Annotation> = {}) => {
    await store.put<Annotation>('annotation', id, { note: (note ?? a.note).trim(), tags: (tags ?? a.tags.join(', ')).split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean), updatedAt: Date.now(), ...extra })
  }
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) { void save(); onClose() } }}>
      <div className="modal r-editor" role="dialog" aria-modal="true" aria-label="Edit highlight">
        <blockquote style={{ '--hl': hlCss(a.color) } as React.CSSProperties}>{a.exact}</blockquote>
        <div className="row" style={{ gap: 8, margin: '14px 0' }}>{HL_COLORS.map(c => <button key={c.id} className="swatch" style={{ background: c.css }} aria-label={c.label} aria-pressed={a.color === c.id} onClick={() => save({ color: c.id })} />)}</div>
        <div className="field"><label htmlFor="n-note">Note</label><textarea id="n-note" autoFocus className="input" value={note ?? a.note} onChange={e => setNote(e.target.value)} placeholder="Your thoughts on this passage" /></div>
        <div className="field"><label htmlFor="n-tags">Tags</label><input id="n-tags" className="input" value={tags ?? a.tags.join(', ')} onChange={e => setTags(e.target.value)} placeholder="theme, quote, question" /></div>
        {a.conflicts?.map((c, i) => (
          <div key={i} className="conflict">
            <b>Also written on another device</b> ({ago(hlcTime(c.at))}): {c.note}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={async () => { await save({ note: c.note, noteResolved: a.conflicts!.map(x => x.at) } as Partial<Annotation>); setNote(c.note) }}>Use this version</button>
              <button className="btn small" onClick={async () => { const merged = `${(note ?? a.note).trim()}\n\n${c.note}`; await save({ note: merged, noteResolved: [c.at] } as Partial<Annotation>); setNote(merged) }}>Keep both</button>
              <button className="btn small quiet" onClick={() => save({ noteResolved: [c.at] } as Partial<Annotation>)}>Discard it</button>
            </div>
          </div>
        ))}
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn quiet danger" onClick={async () => { await store.remove('annotation', id); onClose(); toast('Highlight deleted', { label: 'Undo', run: () => void store.put<Annotation>('annotation', id, { deleted: false }) }) }}><Icon.trash />Delete</button>
          <div className="row"><button className="btn quiet" onClick={onClose}>Cancel</button><button className="btn primary" onClick={async () => { await save(); onClose(); void syncEngine.schedule(800) }}>Save</button></div>
        </div>
      </div>
    </div>
  )
}
