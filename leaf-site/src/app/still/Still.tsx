'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { presetState } from '@/three/presets'
import { drawScreen, readFonts, SCREEN_PX } from '@/three/screenTexture'
import type { StoryState } from '@/three/sceneState'

const StoryCanvas = dynamic(() => import('@/components/home/StoryCanvas'), { ssr: false })

export default function Still() {
  const [v, setV] = useState<string | null>(null)
  const state = useRef<StoryState | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const name = p.get('v') ?? 'hero'
    state.current = presetState(name, innerWidth / innerHeight > 1.05)
    if (p.get('skin') === 'slate') state.current.skin = '#45484E'
    setV(name)
  }, [])
  useEffect(() => {
    if (v !== 'screen' || !cv.current) return
    document.fonts.ready.then(() => {
      const f = readFonts()
      drawScreen(cv.current!.getContext('2d')!, { page: 1, flash: 0, font: 0, menu: 0, highlight: 1, note: 1 }, f.serif, f.sans)
      document.body.dataset.ready = '1'
    })
  }, [v])
  if (!v) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0e0e10' }}>
      {v === 'screen'
        ? <canvas ref={cv} width={SCREEN_PX.w * 2} height={SCREEN_PX.h * 2} style={{ width: SCREEN_PX.w, height: SCREEN_PX.h, filter: 'none' }} />
        : <StoryCanvas state={state as React.MutableRefObject<StoryState>} lowPower={false} active preserve shift={v === 'hero'}
            onReady={kind => document.fonts.ready.then(() => setTimeout(() => { document.body.dataset.model = kind; document.body.dataset.ready = '1' }, 1200))} />}
    </div>
  )
}
