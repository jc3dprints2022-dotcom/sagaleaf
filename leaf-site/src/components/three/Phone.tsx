'use client'
import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { asset } from '@/lib/paths'

export const PHONE_SCREENS = ['app/library.webp', 'app/discover.webp', 'app/settings.webp'] as const

/**
 * A plain phone silhouette (generic, no brand). Used to show the magnetic ring snapping to the
 * back of a phone, and to show real SAGA Reader app screenshots in the ecosystem beat.
 */
export interface PhoneHandle { group: THREE.Group; setScreen(i: number): void; setOpacity(o: number): void }

export function usePhoneTextures() {
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader()
    return PHONE_SCREENS.map(p => { const t = loader.load(asset(p)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t })
  }, [])
  useEffect(() => () => textures.forEach(t => t.dispose()), [textures])
  return textures
}

export const Phone = forwardRef<THREE.Group, { textures: THREE.Texture[] }>(function Phone({ textures }, ref) {
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: textures[0], toneMapped: false, transparent: true }), [textures])
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.45, metalness: 0.6, transparent: true }), [])
  useEffect(() => () => { screenMat.dispose(); bodyMat.dispose() }, [screenMat, bodyMat])
  // 390 × 844 screenshots → keep that aspect for the glass.
  const W = 0.72, H = W * (844 / 390) * 0.98
  return (
    <group ref={ref} userData={{ screenMat, bodyMat, textures }} visible={false}>
      <RoundedBox args={[W + 0.05, H + 0.07, 0.075]} radius={0.06} smoothness={4} material={bodyMat} />
      <mesh position={[0, 0, 0.0385]} material={screenMat}>
        <planeGeometry args={[W, H]} />
      </mesh>
    </group>
  )
})

export function applyPhone(g: THREE.Group | null, show: number, screen: number) {
  if (!g) return
  g.visible = show > 0.01
  const { screenMat, bodyMat, textures } = g.userData as { screenMat: THREE.MeshBasicMaterial; bodyMat: THREE.MeshStandardMaterial; textures: THREE.Texture[] }
  // screen < 0: phone is seen from behind / switched off
  const t = screen < -0.5 ? null : textures[Math.max(0, Math.min(textures.length - 1, Math.round(screen)))]
  if (screenMat.map !== t) { screenMat.map = t; screenMat.color.set(t ? '#ffffff' : '#050506'); screenMat.needsUpdate = true }
  screenMat.opacity = show
  bodyMat.opacity = show
  bodyMat.depthWrite = show > 0.6
}
