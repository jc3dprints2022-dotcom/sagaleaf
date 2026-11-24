'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { useLeafModel } from '@/three/useLeafModel'
import { createScreenCanvas } from '@/three/screenTexture'
import { installLeafDebug } from '@/three/debug'
import { GROUP_BOX, PIVOT } from '@/three/parts'
import { SCENE_SCALE } from '@/data/geometry'
import type { LeafModel } from '@/three/leafModel'
import { Studio, BlobShadow } from '@/components/three/Studio'

export interface ShopCanvasHandle { reset(): void }
interface Props { color: string; lowPower: boolean; onSwap: (busy: boolean) => void; onReady: (kind: LeafModel['kind']) => void }

const FLOOR_Y = (GROUP_BOX.skin.min[1] - PIVOT[1]) * SCENE_SCALE - 0.06

function Leaf({ color, lowPower, onSwap, onReady }: Props) {
  const screen = useMemo(() => createScreenCanvas({ page: 0, flash: 0, font: 0, menu: 0, highlight: 0, note: 0 }), [])
  useEffect(() => () => screen.dispose(), [screen])
  const { leaf, load } = useLeafModel({ screenTexture: screen.texture, lowDetail: lowPower, skinColor: color })
  const anim = useRef({ detach: 0 })
  const { invalidate, camera, gl } = useThree()
  const shown = useRef(color)
  const announced = useRef(false)
  useEffect(() => {
    if (!leaf) return
    if (shown.current === color) { leaf.setSkinColor(color); return }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { leaf.setSkinColor(color); shown.current = color; invalidate(); return }
    onSwap(true)
    // The skin pulls straight off the back, swings away on its bottom edge, changes finish, then clicks back on.
    const tl = gsap.timeline({ onComplete: () => { onSwap(false); invalidate() }, onUpdate: invalidate })
    tl.to(anim.current, { detach: 1, duration: 0.8, ease: 'power2.inOut' })
      .call(() => { leaf.setSkinColor(color); shown.current = color })
      .to(anim.current, { detach: 0, duration: 0.9, ease: 'power2.inOut' })
    return () => { tl.kill(); leaf.setSkinColor(color); shown.current = color; anim.current.detach = 0; onSwap(false) }
  }, [color, leaf, onSwap, invalidate])
  useEffect(() => { invalidate() }, [leaf, invalidate])
  useEffect(() => { document.fonts?.ready.then(() => setTimeout(invalidate, 50)) }, [invalidate])
  useEffect(() => (leaf ? installLeafDebug(leaf, { camera, canvas: gl.domElement, invalidate, load }) : undefined), [leaf, camera, gl, invalidate, load])
  useFrame(() => {
    if (!leaf) return
    leaf.setSkinDetach(anim.current.detach)
    if (!announced.current) { announced.current = true; requestAnimationFrame(() => onReady(leaf.kind)) }
  })
  return leaf ? <primitive object={leaf.root} /> : null
}

const ShopCanvas = forwardRef<ShopCanvasHandle, Props>(function ShopCanvas(props, ref) {
  const { lowPower } = props
  const controls = useRef<OrbitImpl>(null)
  useImperativeHandle(ref, () => ({ reset: () => controls.current?.reset() }), [])
  return (
    <Canvas
      frameloop="demand"
      shadows={lowPower ? false : 'soft'}
      dpr={lowPower ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: !lowPower, preserveDrawingBuffer: true }}
      camera={{ fov: 30, near: 0.05, far: 30, position: [-2.45, 0.63, -1.85] }}
      onCreated={({ gl, scene }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.4; gl.setClearColor(0x000000, 0); scene.background = new THREE.Color('#141416') }}
      aria-label="3D preview of SAGA Leaf, rendered from the rev 4 CAD model with a concept finish. Drag to orbit, scroll or pinch to zoom."
      role="img"
    >
      <Studio warm={() => 0.7} shadows={!lowPower} envResolution={lowPower ? 64 : 128} />
      {/* rear key so the skin finish reads from the default rear three-quarter view */}
      <directionalLight position={[-2.5, 2, -3]} intensity={3.0} color="#f3e6d2" />
      <pointLight position={[2, -0.5, -2]} intensity={1.2} color="#9aa3b0" />
      <Leaf {...props} />
      {lowPower
        ? <BlobShadow y={FLOOR_Y} size={[1.2, 0.7]} opacity={() => 0.55} />
        : <ContactShadows position={[0, FLOOR_Y, 0]} opacity={0.5} scale={2} blur={2.6} far={0.8} resolution={256} />}
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={1.2} maxDistance={4} enableDamping dampingFactor={0.08} target={[0, 0, 0]} />
    </Canvas>
  )
})
export default ShopCanvas
