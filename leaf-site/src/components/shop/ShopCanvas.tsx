'use client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { useLeafModel } from '@/three/useLeafModel'
import { createScreenCanvas } from '@/three/screenTexture'
import { Studio } from '@/components/three/Studio'

export interface ShopCanvasHandle { reset(): void }

function Leaf({ color, lowPower, onSwap }: { color: string; lowPower: boolean; onSwap: (busy: boolean) => void }) {
  const screen = useMemo(() => createScreenCanvas({ page: 0, flash: 0, font: 0, menu: 0, highlight: 0, note: 0 }), [])
  useEffect(() => () => screen.dispose(), [screen])
  const leaf = useLeafModel({ screenTexture: screen.texture, lowDetail: lowPower, skinColor: color })
  const anim = useRef({ detach: 0 })
  const invalidate = useThree(st => st.invalidate)
  const shown = useRef(color)
  useEffect(() => {
    if (shown.current === color) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { leaf.setSkinColor(color); shown.current = color; invalidate(); return }
    onSwap(true)
    // Skin releases from the open top end, comes away, changes finish, then clicks back on.
    const tl = gsap.timeline({ onComplete: () => { onSwap(false); invalidate() }, onUpdate: invalidate })
    tl.to(anim.current, { detach: 1, duration: 0.7, ease: 'power2.inOut' })
      .call(() => { leaf.setSkinColor(color); shown.current = color })
      .to(anim.current, { detach: 0, duration: 0.8, ease: 'power3.inOut' })
    return () => { tl.kill() }
  }, [color, leaf, onSwap, invalidate])
  useEffect(() => { document.fonts?.ready.then(() => setTimeout(invalidate, 50)) }, [invalidate])
  useFrame(() => leaf.setSkinDetach(anim.current.detach))
  return <primitive object={leaf.root} />
}

const ShopCanvas = forwardRef<ShopCanvasHandle, { color: string; lowPower: boolean; onSwap: (busy: boolean) => void }>(function ShopCanvas({ color, lowPower, onSwap }, ref) {
  const controls = useRef<OrbitImpl>(null)
  useImperativeHandle(ref, () => ({ reset: () => controls.current?.reset() }), [])
  return (
    <Canvas
      frameloop="demand"
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !lowPower, preserveDrawingBuffer: true }}
      camera={{ fov: 30, near: 0.05, far: 30, position: [-1.8, 0.5, -1.35] }}
      onCreated={({ gl, scene }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.3; scene.background = new THREE.Color('#141416') }}
      aria-label="3D preview of SAGA Leaf (concept render). Drag to orbit, scroll or pinch to zoom."
      role="img"
    >
      <Studio warm={() => 0.7} />
      {/* rear key so the skin finish reads from the default rear three-quarter view */}
      <directionalLight position={[-2.5, 2, -3]} intensity={2.2} color="#f3e6d2" />
      <pointLight position={[2, -0.5, -2]} intensity={1.2} color="#9aa3b0" />
      <Leaf color={color} lowPower={lowPower} onSwap={onSwap} />
      {!lowPower && <ContactShadows position={[0, -0.6, 0]} opacity={0.45} scale={1.6} blur={2.8} far={0.5} resolution={256} />}
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={1.2} maxDistance={4} enableDamping dampingFactor={0.08} target={[0, 0, 0]} />
    </Canvas>
  )
})
export default ShopCanvas
