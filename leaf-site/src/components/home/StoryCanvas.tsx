'use client'
/**
 * The single pinned R3F canvas for the homepage. It owns no animation of its own: every frame it
 * reads the StoryState that the GSAP master timeline scrubs, so scrolling back replays exactly.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LAYERS, type LayerId, GEO } from '@/data/geometry'
import { useLeafModel } from '@/three/useLeafModel'
import { createScreenCanvas } from '@/three/screenTexture'
import { LAYOUT } from '@/three/leafModel'
import type { StoryState } from '@/three/sceneState'
import { Studio } from '@/components/three/Studio'
import { Phone, applyPhone, usePhoneTextures } from '@/components/three/Phone'

const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Screen centre in the device group's local space (scene units). */
const SCREEN_LOCAL = new THREE.Vector3(
  (LAYOUT.activeCx - LAYOUT.center.x) * 0.01,
  (LAYOUT.activeCy - LAYOUT.center.y) * 0.01,
  (GEO.panel.z1.v - LAYOUT.center.z) * 0.01,
)
const ACTIVE_H = GEO.panel.activeH.v * 0.01

function Scene({ state, lowPower, onFirstFrame, shift }: { state: MutableRefObject<StoryState>; lowPower: boolean; onFirstFrame: () => void; shift: boolean }) {
  const screen = useMemo(() => createScreenCanvas(state.current.screen), [state])
  useEffect(() => () => screen.dispose(), [screen])
  const leaf = useLeafModel({ screenTexture: screen.texture, lowDetail: lowPower })
  const phoneTex = usePhoneTextures()
  const device = useRef<THREE.Group>(null)
  const phone = useRef<THREE.Group>(null)
  const { camera, size } = useThree()
  const tmp = useMemo(() => ({ look: new THREE.Vector3(), cam: new THREE.Vector3(), sc: new THREE.Vector3(), fillCam: new THREE.Vector3() }), [])
  const first = useRef(false)

  useFrame(({ clock }) => {
    const s = state.current
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
      phone.current.position.set(s.phone.x, s.phone.y, s.phone.z)
      phone.current.rotation.set(0, s.phone.ry, 0)
      applyPhone(phone.current, s.phone.show, s.phone.screen)
    }

    // Camera: authored path, blended toward a "screen fills the viewport" framing by s.fill.
    tmp.cam.set(s.cam.x, s.cam.y, s.cam.z)
    tmp.look.set(s.look.x, s.look.y, s.look.z)
    const cam = camera as THREE.PerspectiveCamera
    const W = size.width, H = size.height, wide = W / H > 1.05
    const f = ease(clamp01(s.fill))
    if (f > 0.0005) {
      const vis = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
      // Wide: the page fills the height. Narrow: the whole page fills the upper part, above the copy.
      const d = (ACTIVE_H * (wide ? 1.16 : 1.62)) / vis
      tmp.sc.copy(SCREEN_LOCAL).applyMatrix4(g.matrixWorld)
      tmp.fillCam.set(tmp.sc.x, tmp.sc.y, tmp.sc.z + d)
      tmp.cam.lerp(tmp.fillCam, f)
      tmp.look.lerp(tmp.sc, f)
    }
    // Lens shift instead of moving the subject: wide screens put the device right of the copy,
    // narrow screens put it above the copy panel.
    const ox = shift && wide ? -0.22 * W : 0
    const oy = shift && !wide ? 0.17 * H : 0
    const v = cam.view
    if (!v || !v.enabled || v.offsetX !== ox || v.offsetY !== oy || v.fullWidth !== W || v.fullHeight !== H) cam.setViewOffset(W, H, ox, oy, W, H)
    camera.position.copy(tmp.cam)
    camera.lookAt(tmp.look)

    if (!first.current) { first.current = true; requestAnimationFrame(onFirstFrame) }
  })

  return (
    <>
      <Studio warm={() => state.current.warm} />
      <group ref={device}>
        <primitive object={leaf.root} />
        <Phone ref={phone} textures={phoneTex} />
      </group>
    </>
  )
}

export default function StoryCanvas({ state, lowPower, active, onReady, shift = true, preserve = false }: { state: MutableRefObject<StoryState>; lowPower: boolean; active: boolean; onReady: () => void; shift?: boolean; preserve?: boolean }) {
  return (
    <Canvas
      className="!absolute inset-0"
      frameloop={active ? 'always' : 'never'}
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !lowPower, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: preserve }}
      camera={{ fov: 30, near: 0.05, far: 40, position: [0.9, 0.35, 3.1] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.3
        scene.background = new THREE.Color('#0e0e10')
        scene.fog = new THREE.Fog('#0e0e10', 4.5, 11)
      }}
      aria-hidden="true"
    >
      <Scene state={state} lowPower={lowPower} onFirstFrame={onReady} shift={shift} />
    </Canvas>
  )
}
