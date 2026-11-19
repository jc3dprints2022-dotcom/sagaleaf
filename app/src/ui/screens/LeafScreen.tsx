// The screen and buttons of the in-page simulated Leaf (standalone build).
// Stands in for the device's 240×320 display and its four top-edge buttons.
// Reading here moves the device's own position; SAGA Reader picks it up on sync.
import { useCallback, useEffect, useState } from 'react'
import { localLeaf } from '../../app/localLeaf'
import { PRODUCT } from '../../app/product'

type Screen = Awaited<ReturnType<Awaited<ReturnType<typeof localLeaf>>['screenState']>> & Record<string, unknown>

export function LeafScreen({ showLog = true }: { showLog?: boolean }) {
  const [st, setSt] = useState<Screen | null>(null)
  const draw = useCallback(async () => setSt(await (await localLeaf()).screenState() as Screen), [])
  useEffect(() => { void draw(); const t = setInterval(draw, 1000); return () => clearInterval(t) }, [draw])
  const act = useCallback(async (a: 'back' | 'prev' | 'next' | 'hl' | 'open', bookId?: string) => {
    const core = await localLeaf()
    if (a === 'back') core.back()
    else if (a === 'open' && bookId) core.open(bookId)
    else if (core.screen.view === 'reading' && core.screen.bookId) {
      if (a === 'next') await core.turn(core.screen.bookId, 1)
      if (a === 'prev') await core.turn(core.screen.bookId, -1)
      if (a === 'hl') await core.highlightOnPage(core.screen.bookId)
    }
    await draw()
  }, [draw])
  const onKey = (e: React.KeyboardEvent) => {
    const k = ({ ArrowRight: 'next', ArrowLeft: 'prev', h: 'hl', Backspace: 'back' } as const)[e.key as 'ArrowRight']
    if (k) { e.preventDefault(); void act(k) }
  }

  let body: React.ReactNode = '…'
  if (st?.view === 'pairing') body = <>
    <h4 className="lsim-h">Pair a device</h4>
    <p className="lsim-ui">{String(st.client)} wants to connect. Enter this code in the app:</p>
    <div className="lsim-code" data-testid="leaf-code">{String(st.code)}</div>
    <p className="lsim-ui lsim-dim" style={{ textAlign: 'center' }}>Code expires in 2 minutes</p>
  </>
  else if (st?.view === 'reading') {
    const text = String(st.text), hl = (st.highlights as string[]).find(h => h.length > 8 && text.includes(h))
    const parts = hl ? text.split(hl) : [text]
    body = <>
      <div className="lsim-text">{hl ? <>{parts[0]}<mark>{hl}</mark>{parts.slice(1).join(hl)}</> : text}</div>
      <div className="lsim-foot"><span>{String(st.title).slice(0, 22)}</span><span>{Math.round(Number(st.progress) * 100)}%</span></div>
      <div className="lsim-bar"><i style={{ width: `${Number(st.progress) * 100}%` }} /></div>
    </>
  } else if (st) {
    const books = st.books as { id: string; title: string; author: string; progress: number }[]
    body = <>
      <h4 className="lsim-h"><span>Library</span><span>{st.battery != null ? `${st.battery}%` : ''}</span></h4>
      {books.length ? books.map(b => <button key={b.id} className="lsim-book" onClick={() => act('open', b.id)}><b>{b.title}</b><small>{b.author}, {Math.round((b.progress || 0) * 100)}%</small></button>)
        : <p className="lsim-ui lsim-dim">No books yet. Send one from {PRODUCT.name}.</p>}
    </>
  }

  return (
    <div className="lsim">
      <div className="lsim-shell" tabIndex={0} onKeyDown={onKey} aria-label="Simulated SAGA Leaf. Arrow keys turn pages, H highlights, Backspace goes back.">
        <div className="lsim-screen" role="region" aria-live="polite">{body}</div>
        <div className="lsim-btns">
          <button onClick={() => act('back')}>Back</button>
          <button onClick={() => act('prev')} aria-label="Previous page">Prev</button>
          <button onClick={() => act('next')} aria-label="Next page">Next</button>
          <button onClick={() => act('hl')}>Highlight</button>
        </div>
      </div>
      {showLog && <div className="lsim-side">
        <span className="pill">Simulator, not hardware</span>
        <p className="small muted">This SAGA Leaf runs inside this page, using the same device model as the protocol tests. Read and highlight here, then press Sync now in {PRODUCT.name}.</p>
        {!!st?.log?.length && <pre className="lsim-log">{(st.log as string[]).join('\n')}</pre>}
      </div>}
    </div>
  )
}
