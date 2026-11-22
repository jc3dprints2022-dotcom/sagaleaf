'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { initialState, type StoryState } from '@/three/sceneState'
import { LAYERS } from '@/data/geometry'
import { isLowPower } from '@/lib/env'

const StoryCanvas = dynamic(() => import('./StoryCanvas'), { ssr: false })

/** Total timeline length in arbitrary units; beats are authored on a 0–100 scale. */
const T = 100
const PHONE_GAP0 = -0.088 // phone back touching the Leaf's rear skin (device group local z)

declare global {
  interface Window { __leafStory?: { progress: () => number; state: StoryState; time: () => number } }
}

export default function StoryController() {
  const state = useRef<StoryState>(initialState())
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [load, setLoad] = useState(false)
  const [active, setActive] = useState(true)
  const [low, setLow] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains('cinematic')) return
    setLow(isLowPower())
    setMount(document.getElementById('stage-canvas'))
    // Lazy-load the 3D scene after the page is interactive; the poster shows until then.
    // Lazy-load the 3D scene. The poster is rendered from the same camera, so nothing changes
    // visually until the user acts: load on first intent (scroll, touch, key, pointer), or after a
    // few idle seconds on capable desktops. Low-power devices wait for intent only.
    let id = 0
    const intents = ['wheel', 'touchstart', 'keydown', 'pointermove', 'scroll'] as const
    const kick = () => { setLoad(true); intents.forEach(e => window.removeEventListener(e, kick)); clearTimeout(id) }
    intents.forEach(e => window.addEventListener(e, kick, { once: true, passive: true }))
    if (!isLowPower()) {
      const later = () => { id = window.setTimeout(kick, 3500) }
      if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true })
    }
    gsap.registerPlugin(ScrollTrigger)
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    const story = document.getElementById('story')!
    const q = <E extends Element = HTMLElement>(sel: string) => story.querySelector(sel) as E
    const qa = (sel: string) => Array.from(story.querySelectorAll<HTMLElement>(sel))
    const S = state.current
    const wide = () => window.innerWidth / window.innerHeight > 1.05
    // Framing is done with a lens shift in StoryCanvas, so the device stays at the origin.
    const X = () => 0
    const Y = () => 0
    const Z = (w: number, n: number) => () => (wide() ? w : n)

    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut', duration: 2 },
      scrollTrigger: { trigger: story, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true },
    })
    const show = (el: Element | null, at: number, d = 1.2) => el && tl.fromTo(el, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: d, ease: 'power2.out' }, at)
    const hide = (el: Element | null, at: number, d = 1) => el && tl.to(el, { autoAlpha: 0, y: -28, duration: d, ease: 'power2.in' }, at)
    tl.set({}, {}, T) // fix the length

    // ---------------- Hero (0–5): the exploded stack floats, copy on the left
    tl.fromTo(S.dev, { x: X, y: Y }, { x: X, y: Y, duration: 0.01 }, 0)
    tl.fromTo(S.cam, { x: 0.9, y: 0.35, z: Z(3.6, 5.4) }, { x: 0.9, y: 0.35, z: Z(3.6, 5.4), duration: 0.01 }, 0)
    hide(q('[data-beat=hero]'), 3.5, 1.5)
    hide(q('.scroll-hint'), 1, 1)

    // ---------------- Scene 1, assembly (5–25)
    show(q('[data-beat=assembly]'), 5)
    tl.to(S, { assemble: 1, duration: 18, ease: 'none' }, 6)
    tl.to(S, { idle: 0.25, duration: 3 }, 5)
    tl.to(S.dev, { ry: -0.62, rx: -0.14, duration: 18 }, 6)
    tl.to(S.cam, { x: () => X() * 0.6 + 0.5, y: 0.32, z: Z(2.45, 3.7), duration: 18 }, 6)
    tl.to(S.look, { x: () => X() * 0.55, y: () => Y() * 0.5, duration: 18 }, 6)
    const span = 0.42
    LAYERS.forEach((l, i) => {
      const start = 6 + 18 * ((i * (1 - span)) / (LAYERS.length - 1))
      const li = q(`[data-layer=${l.id}]`)
      tl.fromTo(li, { opacity: 0.22, x: -6 }, { opacity: 1, x: 0, duration: 1.4 }, start + 0.6)
    })
    hide(q('[data-beat=assembly]'), 24)

    // ---------------- Scene 2, hardware orbit (25–50)
    show(q('[data-beat=hardware] .eyebrow'), 25)
    show(q('[data-beat=hardware] .beat-title'), 25.2)
    tl.set(q('[data-beat=hardware]'), { autoAlpha: 1 }, 24.9)
    const c = (k: string) => q(`[data-callout=${k}]`)
    // display
    show(c('display'), 25.6)
    tl.to(S.dev, { ry: -0.22, rx: -0.06, duration: 4 }, 25)
    tl.to(S.cam, { x: () => X() * 0.8 + 0.1, y: 0.1, z: Z(2.1, 3.2), duration: 4 }, 25)
    tl.to(S.look, { x: () => X() * 0.8, y: () => Y() * 0.6, duration: 4 }, 25)
    hide(c('display'), 29.6, 0.8)
    // buttons: left edge toward the camera, close on the upper side
    show(c('buttons'), 30.6)
    tl.to(S.dev, { ry: 1.18, rx: -0.1, duration: 4 }, 29.6)
    tl.to(S.cam, { x: () => X() + 0.15, y: 0.5, z: Z(1.55, 2.4), duration: 4 }, 29.6)
    tl.to(S.look, { x: () => X(), y: () => Y() + 0.28, duration: 4 }, 29.6)
    hide(c('buttons'), 34.6, 0.8)
    // ports: bottom edge toward the camera
    show(c('ports'), 35.6)
    tl.to(S.dev, { ry: 0.32, rx: -1.12, duration: 4 }, 34.6)
    tl.to(S.cam, { x: () => X() + 0.1, y: -0.05, z: Z(1.6, 2.5), duration: 4 }, 34.6)
    tl.to(S.look, { x: () => X(), y: () => Y() - 0.12, duration: 4 }, 34.6)
    hide(c('ports'), 39.6, 0.8)
    // ring: rear toward the camera, shell see-through; then a side view as a phone snaps on
    show(c('ring'), 40.6)
    tl.to(S.dev, { ry: 2.55, rx: -0.08, duration: 2.4 }, 39.6)
    tl.to(S.cam, { x: () => X() * 0.8, y: 0.25, z: Z(2.3, 3.4), duration: 2.4 }, 39.6)
    tl.to(S.look, { x: () => X() * 0.85, y: () => Y() + 0.05, duration: 2.4 }, 39.6)
    tl.to(S, { xray: 1, duration: 1.2 }, 40.4)
    tl.set(S.phone, { x: 0, y: 0.217, ry: Math.PI, z: PHONE_GAP0 - 0.9, screen: -1 }, 41.5)
    tl.to(S.dev, { ry: 1.15, rx: -0.12, duration: 2 }, 41.9)
    tl.to(S, { xray: 0, duration: 1 }, 42.2)
    tl.to(S.phone, { show: 1, duration: 1 }, 42.2)
    tl.to(S.phone, { z: PHONE_GAP0 - 0.16, duration: 1.2, ease: 'power2.out' }, 42.6)
    tl.to(S.phone, { z: PHONE_GAP0, duration: 0.45, ease: 'expo.in' }, 43.9)
    tl.to(S.cam, { x: 0.25, y: 0.3, z: Z(3.0, 4.4), duration: 2 }, 42)
    tl.to(S.look, { x: -0.2, y: 0.08, duration: 2 }, 42)
    hide(c('ring'), 45.4, 0.8)
    // thin: phone lets go; pure side profile
    show(c('thin'), 46.4)
    tl.to(S.phone, { z: PHONE_GAP0 - 1.1, show: 0, duration: 1.6, ease: 'power2.in' }, 45.6)
    tl.to(S.dev, { ry: 1.32, rx: -0.06, duration: 2.6 }, 45.8)
    tl.to(S.cam, { x: () => X(), y: 0.12, z: Z(2.8, 3.6), duration: 2.6 }, 45.8)
    tl.to(S.look, { x: () => X(), y: () => Y(), duration: 2.6 }, 45.8)
    hide(q('[data-beat=hardware]'), 49.2)

    // ---------------- Scene 3, enter the screen (50–70)
    tl.to(S, { idle: 0, duration: 1 }, 49.5)
    tl.to(S.dev, { ry: 0, rx: 0, x: 0, y: 0, duration: 3.2 }, 49.8)
    tl.to(S.cam, { x: 0, y: 0, z: Z(2.0, 3.0), duration: 3.2 }, 49.8)
    tl.to(S.look, { x: 0, y: 0, duration: 3.2 }, 49.8)
    tl.to(S, { fill: 1, duration: 3.4, ease: 'power3.inOut' }, 51.6)
    tl.to(q('[data-badge=render]'), { autoAlpha: 0, duration: 0.6 }, 53)
    tl.fromTo(q('[data-badge=screen]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 53.2)
    show(q('[data-beat=screen]'), 54)
    const step = (k: string, at: number) => tl.fromTo(q(`[data-step=${k}]`), { opacity: 0.25 }, { opacity: 1, duration: 0.8 }, at)
    step('page', 55.5)
    tl.to(S.screen, { flash: 1, duration: 0.35, ease: 'none' }, 56.6)
    tl.set(S.screen, { page: 1 }, 57)
    tl.to(S.screen, { flash: 0, duration: 0.35, ease: 'none' }, 57.05)
    step('type', 59)
    tl.to(S.screen, { menu: 1, duration: 1, ease: 'power2.out' }, 59.4)
    tl.set(S.screen, { font: 1 }, 60.8)
    tl.to(S.screen, { menu: 0, duration: 1, ease: 'power2.in' }, 62)
    step('highlight', 63.4)
    tl.to(S.screen, { highlight: 1, duration: 2.2, ease: 'none' }, 63.8)
    tl.to(S.screen, { note: 1, duration: 1.4, ease: 'power2.out' }, 66.2)
    hide(q('[data-beat=screen]'), 69.2)

    // ---------------- Scene 4, ecosystem (70–84)
    tl.to(S, { fill: 0, duration: 3, ease: 'power3.inOut' }, 70)
    tl.to(q('[data-badge=screen]'), { autoAlpha: 0, duration: 0.6 }, 70.4)
    tl.to(q('[data-badge=render]'), { autoAlpha: 1, duration: 0.6 }, 71)
    tl.set(S.phone, { x: 1.5, y: 0, z: 0.02, ry: 0, screen: 0 }, 70.5)
    tl.to(S.dev, { x: -0.45, y: 0, ry: 0.2, duration: 3 }, 70.5)
    tl.to(S.cam, { x: 0.15, y: 0.1, z: Z(3.4, 6.4), duration: 3 }, 70.5)
    tl.to(S.look, { x: 0, y: 0, duration: 3 }, 70.5)
    tl.to(S.phone, { x: 0.95, show: 1, duration: 2.4, ease: 'power2.out' }, 72)
    show(q('[data-beat=ecosystem]'), 72.4)
    tl.set(S.phone, { screen: 1 }, 76.5)
    tl.set(S.phone, { screen: 2 }, 80)
    hide(q('[data-beat=ecosystem]'), 83.4)

    // ---------------- Scene 5, pull back to the studio (84–100)
    tl.to(S.phone, { x: 1.7, show: 0, duration: 2, ease: 'power2.in' }, 84)
    tl.to(S.dev, { x: X, y: Y, ry: -0.6, rx: -0.12, duration: 5 }, 84.5)
    tl.to(S.cam, { x: () => X() * 0.6 + 0.55, y: 0.34, z: Z(2.6, 3.9), duration: 5 }, 84.5)
    tl.to(S.look, { x: () => X() * 0.6, y: () => Y() * 0.5, duration: 5 }, 84.5)
    tl.to(S, { warm: 1, duration: 7 }, 85)
    tl.to(S, { idle: 1, duration: 3 }, 89)
    show(q('[data-beat=studio]'), 88.5)

    window.__leafStory = { progress: () => tl.progress(), time: () => tl.time(), state: S }

    // "Explore" jumps to the start of the assembly instead of the hash anchor.
    const explore = q<HTMLAnchorElement>('[data-explore]')
    const onExplore = (e: Event) => {
      e.preventDefault()
      const st = tl.scrollTrigger!
      lenis.scrollTo(st.start + (st.end - st.start) * (9 / T), { duration: 2.2 })
      ;(qa('[data-beat=assembly]')[0] as HTMLElement)?.setAttribute('tabindex', '-1')
    }
    explore?.addEventListener('click', onExplore)

    // Stop rendering when the stage is off-screen.
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '100px' })
    io.observe(story)

    return () => {
      explore?.removeEventListener('click', onExplore)
      io.disconnect()
      tl.scrollTrigger?.kill()
      tl.kill()
      gsap.ticker.remove(raf)
      lenis.destroy()
      intents.forEach(e => window.removeEventListener(e, kick))
      clearTimeout(id)
      delete window.__leafStory
    }
  }, [])

  if (!mount || !load) return null
  return createPortal(
    <StoryCanvas state={state} lowPower={low} active={active} onReady={() => document.documentElement.classList.add('stage-ready')} />,
    mount,
  )
}
