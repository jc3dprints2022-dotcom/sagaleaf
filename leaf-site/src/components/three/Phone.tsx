'use client'
import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { asset } from '@/lib/paths'
import { PHONE_SCREENS, PHONE_THICKNESS } from '@/three/timeline'

/**
 * A plain phone silhouette (generic, no brand; illustrative, not a product render). Used to show
 * the magnetic ring snapping to the back of a phone, and to show real SAGA Reader screenshots
 * (public/app/real/) in the ecosystem beat.
 */
export interface PhoneTextures { list: (THREE.Texture | undefined)[]; ensure(): void }

/** The screenshots load on demand (`ensure()`), shortly before the phone first shows its screen. */
export function usePhoneTextures(onLoad: () => void): PhoneTextures {
  const tex = useMemo<PhoneTextures>(() => {
    const list: (THREE.Texture | undefined)[] = []
    let started = false
    return {
      list,
      ensure() {
        if (started) return
        started = true
        const loader = new THREE.TextureLoader()
        PHONE_SCREENS.forEach((s, i) => {
          const t = loader.load(asset(s.file), onLoad)
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = 4
          list[i] = t
        })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => tex.list.forEach(t => t?.dispose()), [tex])
  return tex
}

export const Phone = forwardRef<THREE.Group, { textures: PhoneTextures }>(function Phone({ textures }, ref) {
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#050506', toneMapped: false, transparent: true }), [])
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.42, metalness: 0.65, transparent: true }), [])
  useEffect(() => () => { screenMat.dispose(); bodyMat.dispose() }, [screenMat, bodyMat])
  // 390 × 844 screenshots → keep that aspect for the glass.
  const W = 0.72, H = W * (844 / 390)
  return (
    <group ref={ref} userData={{ screenMat, bodyMat, textures }} visible={false}>
      <RoundedBox args={[W + 0.05, H + 0.06, PHONE_THICKNESS]} radius={0.035} smoothness={4} material={bodyMat} />
      <mesh position={[0, 0, PHONE_THICKNESS / 2 + 0.001]} material={screenMat}>
        <planeGeometry args={[W, H]} />
      </mesh>
    </group>
  )
})

export function applyPhone(g: THREE.Group | null, show: number, screen: number) {
  if (!g) return
  g.visible = show > 0.01
  const { screenMat, bodyMat, textures } = g.userData as { screenMat: THREE.MeshBasicMaterial; bodyMat: THREE.MeshStandardMaterial; textures: PhoneTextures }
  // screen < 0: the phone is seen from behind / switched off. A screenshot shows once it has loaded.
  const want = screen < 0 ? undefined : textures.list[Math.min(textures.list.length - 1, Math.round(screen))]
  const t = want?.image ? want : null
  if (screenMat.map !== t) { screenMat.map = t; screenMat.color.set(t ? '#ffffff' : '#050506'); screenMat.needsUpdate = true }
  screenMat.opacity = show
  bodyMat.opacity = show
  bodyMat.depthWrite = show > 0.6
}
