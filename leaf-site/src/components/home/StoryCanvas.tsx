'use client'
/**
 * The single pinned R3F canvas for the homepage. It owns no animation of its own: every frame it
 * reads the StoryState that the GSAP master timeline scrubs, so scrolling back replays exactly.
 * Frames are drawn on demand: when the timeline moves, while the idle turntable is running, and
 * when a texture or the model arrives. A still scene costs nothing.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { LAYERS, type LayerId, SCENE_SCALE } from '@/data/geometry'
import { useLeafModel } from '@/three/useLeafModel'
import { createScreenCanvas } from '@/three/screenTexture'
import { EXPLODE, BUTTON_OUT, type LeafModel } from '@/three/leafModel'
import { GROUP_BOX, PIVOT, SCREEN_CENTER, SCREEN_SIZE, centerOf } from '@/three/parts'
import { installLeafDebug } from '@/three/debug'
import type { StoryState } from '@/three/sceneState'
import { Studio, BlobShadow } from '@/components/three/Studio'
import { Phone, applyPhone, usePhoneTextures } from '@/components/three/Phone'

const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Screen centre in the device group's local space (scene units). */
const SCREEN_LOCAL = new THREE.Vector3(...SCREEN_CENTER.map((v, i) => (v - PIVOT[i]) * SCENE_SCALE))
const SCREEN_W = SCREEN_SIZE[0] * SCENE_SCALE, SCREEN_H = SCREEN_SIZE[1] * SCENE_SCALE
const FLOOR_Y = (GROUP_BOX.skin.min[1] - PIVOT[1]) * SCENE_SCALE - 0.1

/**
 * Where each layer's number chip sits: the top-centre of the group's CAD bounding box (the
 * right-hand caps for the buttons), in model millimetres. The explode offset is added per frame.
 */
const CHIP_ANCHOR = Object.fromEntries(LAYERS.map(l => {
  const b = GROUP_BOX[l.id], c = centerOf(b)
  return [l.id, l.id === 'buttons' ? new THREE.Vector3(b.max[0] + BUTTON_OUT, c[1], c[2]) : new THREE.Vector3(c[0], b.max[1], c[2])]
})) as Record<LayerId, THREE.Vector3>

export type StageReady = (kind: LeafModel['kind']) => void

function Scene({ state, lowPower, onReady, shift, active, invalidateRef }: {
  state: MutableRefObject<StoryState>; lowPower: boolean; onReady: StageReady; shift: boolean; active: boolean
  invalidateRef?: MutableRefObject<(() => void) | null>
}) {
  const { camera, size, gl, invalidate } = useThree()
  const screen = useMemo(() => createScreenCanvas(state.current.screen), [state])
  useEffect(() => () => screen.dispose(), [screen])
  const { leaf, load } = useLeafModel({ screenTexture: screen.texture, lowDetail: lowPower })
  const phoneTex = usePhoneTextures(invalidate)
  const device = useRef<THREE.Group>(null)
  const phone = useRef<THREE.Group>(null)
  const floor = useRef<THREE.Group>(null)
  const [studio, setStudio] = useState(false)
  const studioNow = useRef(false)
  const tmp = useMemo(() => ({ look: new THREE.Vector3(), cam: new THREE.Vector3(), sc: new THREE.Vector3(), fillCam: new THREE.Vector3(), p: new THREE.Vector3() }), [])
  const chips = useMemo(() => Object.fromEntries(LAYERS.map(l => [l.id, document.querySelector<HTMLElement>(`[data-chip="${l.id}"]`)])) as Record<LayerId, HTMLElement | null>, [])
  const first = useRef(false)

  useEffect(() => { if (invalidateRef) invalidateRef.current = invalidate; return () => { if (invalidateRef) invalidateRef.current = null } }, [invalidate, invalidateRef])
  // Redraw when something arrives or changes outside the timeline.
  useEffect(() => { invalidate() }, [invalidate, leaf, active, size.width, size.height, studio])
  useEffect(() => { document.fonts?.ready.then(() => setTimeout(invalidate, 60)) }, [invalidate])
  useEffect(() => (leaf ? installLeafDebug(leaf, { camera, canvas: gl.domElement, invalidate, load }) : undefined), [leaf, camera, gl, invalidate, load])

  useFrame(({ clock }) => {
    const s = state.current
    if (!leaf) return
    // Layers settle one after another, in the documented front-to-back order.
    const N = LAYERS.length, span = 0.42
    const e: Partial<Record<LayerId, number>> = {}
    LAYERS.forEach((l, i) => {
      const start = (i * (1 - span)) / (N - 1)
      e[l.id] = 1 - ease(clamp01((s.assemble - start) / span))
    })
    leaf.applyExplode(e)
    leaf.setXray(s.xray)
    if (leaf.materials.skin.userData.hex !== s.skin) { leaf.setSkinColor(s.skin); leaf.materials.skin.userData.hex = s.skin }
    screen.update(s.screen)

    const g = device.current!
    const sway = Math.sin(clock.elapsedTime * 0.35) * 0.08 * s.idle
    g.position.set(s.dev.x, s.dev.y + Math.sin(clock.elapsedTime * 0.6) * 0.012 * s.idle, s.dev.z)
    g.rotation.set(s.dev.rx, s.dev.ry + sway, s.dev.rz)
    g.updateMatrixWorld()

    if (phone.current) {
      if (s.fill > 0.01 || s.phone.screen >= 0) phoneTex.ensure()
      phone.current.position.set(s.phone.x, s.phone.y, s.phone.z)
      phone.current.rotation.set(0, s.phone.ry, 0)
      applyPhone(phone.current, s.phone.show, s.phone.screen)
    }

    // Camera: authored path, blended by s.fill toward the framing where the e-paper's active area
    // exactly fills the viewport (its height on wide screens, its width on narrow ones).
    tmp.cam.set(s.cam.x, s.cam.y, s.cam.z)
    tmp.look.set(s.look.x, s.look.y, s.look.z)
    const cam = camera as THREE.PerspectiveCamera
    const W = size.width, H = size.height, wide = W / H > 1.05
    const f = ease(clamp01(s.fill))
    const fitsHeight = SCREEN_W / SCREEN_H <= W / H
    if (f > 0.0005) {
      const vis = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) // visible height per unit distance
      const d = fitsHeight ? SCREEN_H / vis : SCREEN_W / (vis * (W / H))
      tmp.sc.copy(SCREEN_LOCAL).applyMatrix4(g.matrixWorld)
      tmp.fillCam.set(tmp.sc.x, tmp.sc.y, tmp.sc.z + d)
      tmp.cam.lerp(tmp.fillCam, f)
      tmp.look.lerp(tmp.sc, f)
    }
    // Lens shift instead of moving the subject: wide screens put the device right of the copy,
    // narrow screens put it above the copy panel. At full push-in the page stays inside the
    // viewport: beside the copy on wide screens, flush with the top edge on narrow ones.
    const pageW = fitsHeight ? (H * SCREEN_W) / SCREEN_H : W, pageH = fitsHeight ? H : (W * SCREEN_H) / SCREEN_W
    let ox = 0, oy = 0
    if (shift && wide) ox = -THREE.MathUtils.lerp(0.22 * W, Math.min(0.22 * W, (W - pageW) / 2), f)
    if (shift && !wide) oy = THREE.MathUtils.lerp(0.17 * H, Math.max(0, (H - pageH) / 2), f)
    const v = cam.view
    if (!v || !v.enabled || v.offsetX !== ox || v.offsetY !== oy || v.fullWidth !== W || v.fullHeight !== H) cam.setViewOffset(W, H, ox, oy, W, H)
    camera.position.copy(tmp.cam)
    camera.lookAt(tmp.look)
    camera.updateMatrixWorld()

    // Layer-number chips follow their parts (DOM elements positioned from the projected anchor).
    for (const l of LAYERS) {
      const el = chips[l.id]
      if (!el) continue
      const o = s.chips * clamp01((e[l.id] ?? 0) * 3)
      if (o < 0.02) { if (el.style.opacity !== '0') el.style.opacity = '0'; continue }
      const x = EXPLODE[l.id], t = e[l.id] ?? 0, a = CHIP_ANCHOR[l.id]
      tmp.p.set(a.x + x[0] * t, a.y + x[1] * t, a.z + x[2] * t)
      leaf.model.localToWorld(tmp.p).project(camera)
      el.style.opacity = o.toFixed(2)
      el.style.transform = `translate3d(${((tmp.p.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((1 - (tmp.p.y * 0.5 + 0.5)) * H).toFixed(1)}px, 0)`
    }

    // The floor shadow only exists in the studio.
    const wantStudio = s.warm > 0.03
    if (wantStudio !== studioNow.current) { studioNow.current = wantStudio; setStudio(wantStudio) }
    const shadow = floor.current?.children[0] as THREE.Mesh | undefined
    if (shadow) (shadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * s.warm

    if (s.idle > 0.001) invalidate() // keep the turntable turning
    if (!first.current) { first.current = true; requestAnimationFrame(() => onReady(leaf.kind)) }
  })

  return (
    <>
      <Studio warm={() => state.current.warm} shadows={!lowPower} envResolution={lowPower ? 64 : 128} />
      <group ref={device}>
        {leaf && <primitive object={leaf.root} />}
        <Phone ref={phone} textures={phoneTex} />
      </group>
      {lowPower
        ? <BlobShadow y={FLOOR_Y} opacity={() => 0.6 * state.current.warm} />
        : studio && <ContactShadows ref={floor} position={[0, FLOOR_Y, 0]} opacity={0} scale={2.4} blur={2.6} far={0.9} resolution={256} color="#000000" />}
    </>
  )
}

export default function StoryCanvas({ state, lowPower, active, onReady, shift = true, preserve = false, invalidateRef }: {
  state: MutableRefObject<StoryState>; lowPower: boolean; active: boolean; onReady: StageReady; shift?: boolean; preserve?: boolean
  invalidateRef?: MutableRefObject<(() => void) | null>
}) {
  return (
    <Canvas
      className="!absolute inset-0"
      frameloop={active ? 'demand' : 'never'}
      shadows={lowPower ? false : 'soft'}
      dpr={lowPower ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: !lowPower, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: preserve }}
      camera={{ fov: 30, near: 0.05, far: 40, position: [0.9, 0.35, 3.6] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.42
        gl.setClearColor(0x000000, 0) // off-screen passes (the contact shadow) must clear to transparent
        scene.background = new THREE.Color('#0e0e10')
        scene.fog = new THREE.Fog('#0e0e10', 5.5, 12)
      }}
      aria-hidden="true"
    >
      <Scene state={state} lowPower={lowPower} onReady={onReady} shift={shift} active={active} invalidateRef={invalidateRef} />
    </Canvas>
  )
}
