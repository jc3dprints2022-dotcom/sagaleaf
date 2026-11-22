'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CATALOG, findItem, formatPrice, type Selection, DEFAULT_SELECTION } from '@/data/catalog'
import { loadSelection, saveSelection } from '@/commerce/selection'
import { hasWebGL, isLowPower } from '@/lib/env'
import { asset } from '@/lib/paths'
import type { ShopCanvasHandle } from './ShopCanvas'

const ShopCanvas = dynamic(() => import('./ShopCanvas'), { ssr: false, loading: () => null })

export default function Configurator() {
  const [sel, setSel] = useState<Selection>(DEFAULT_SELECTION)
  const [gl, setGl] = useState<boolean | null>(null)
  const [low, setLow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const canvas = useRef<ShopCanvasHandle>(null)
  useEffect(() => { setSel(loadSelection()); setGl(hasWebGL()); setLow(isLowPower()) }, [])
  // The static render of the chosen finish shows first; the 3D preview loads on first intent
  // (or after a short idle on capable desktops) so it never blocks the page from becoming usable.
  useEffect(() => {
    if (!gl) return
    let id = 0
    const intents = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel', 'scroll'] as const
    const go = () => { setLive(true); intents.forEach(e => window.removeEventListener(e, go)); clearTimeout(id) }
    intents.forEach(e => window.addEventListener(e, go, { passive: true }))
    if (!isLowPower()) id = window.setTimeout(go, 3500)
    return () => { intents.forEach(e => window.removeEventListener(e, go)); clearTimeout(id) }
  }, [gl])
  const choose = (group: keyof Selection, id: string) => setSel(s => { const n = { ...s, [group]: id }; saveSelection(n); return n })
  const onSwap = useCallback((b: boolean) => setBusy(b), [])
  const skin = findItem('skin', sel.skin)!
  const fallback = sel.skin === 'skin-slate' ? 'renders/leaf-slate.webp' : 'renders/leaf-assembled.webp'

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel relative aspect-[4/3] overflow-hidden lg:sticky lg:top-24 lg:self-start" data-testid="preview">
        {!gl || !live ? (
          <img src={asset(fallback)} alt={`Concept render of SAGA Leaf with the ${skin.label} rear skin`} className="h-full w-full object-cover" />
        ) : (
          <ShopCanvas ref={canvas} color={skin.swatch ?? '#B8663A'} lowPower={low} onSwap={onSwap} />
        )}
        <p className="concept-badge !block">Concept render</p>
        {gl && live && (
          <button type="button" className="btn btn--ghost absolute left-4 bottom-4 !min-h-[36px] !px-4 text-sm bg-night/60" onClick={() => canvas.current?.reset()}>
            Reset view
          </button>
        )}
        <p className="sr-only" aria-live="polite">{busy ? `Changing the rear skin to ${skin.label}` : `Showing the ${skin.label} rear skin`}</p>
      </div>

      <div>
        {CATALOG.groups.map(g => (
          <fieldset key={g.id} className="mb-7">
            <legend className="mb-3 text-sm uppercase tracking-[0.18em] text-amber">{g.label}</legend>
            <div className="grid gap-2">
              {g.items.map(item => {
                const checked = sel[g.id] === item.id
                return (
                  <label key={item.id} data-source={item.source}
                    className={`panel flex cursor-pointer items-start gap-3 p-4 transition ${checked ? '!border-amber' : ''} ${item.available ? 'hover:border-ivory/40' : 'cursor-not-allowed opacity-50'}`}>
                    <input type="radio" name={g.id} value={item.id} checked={checked} disabled={!item.available}
                      onChange={() => choose(g.id, item.id)} className="mt-1 accent-[#d39a4e]" />
                    {item.swatch && <span aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none rounded-full border border-ivory/30" style={{ background: item.swatch }} />}
                    <span className="flex-1">
                      <span className="block font-medium">{item.label}</span>
                      <span className="block text-sm text-dim">{item.description}</span>
                    </span>
                    <span className="text-xs text-dim">{item.available ? 'Concept' : 'Not available'}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
        <div className="panel p-5">
          <p className="flex items-baseline justify-between"><span className="text-dim">Price</span><span data-testid="price" className="text-lg">{formatPrice(findItem('model', sel.model)!.price)}</span></p>
          <p className="mt-2 text-sm text-dim">No payment is taken and nothing is reserved. You can join a list to hear when there is something to order.</p>
          <Link href="/cart/" className="btn btn--primary mt-5 w-full" data-testid="to-cart">Continue to preorder list</Link>
        </div>
      </div>
    </div>
  )
}
