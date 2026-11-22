'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'

const COOL_KEY = new THREE.Color('#e9e4da')
const WARM_KEY = new THREE.Color('#ffc58a')
const COOL_RIM = new THREE.Color('#8d97a6')
const WARM_RIM = new THREE.Color('#d39a4e')

/**
 * Calm, literary lighting: one soft key, an amber rim, a low fill. `warm` (0..1) moves it from a
 * cool night scene toward a warm product studio. The environment is built from local
 * Lightformers, so no HDR files are downloaded.
 */
export function Studio({ warm }: { warm: () => number }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.PointLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  useFrame(() => {
    const w = warm()
    key.current?.color.copy(COOL_KEY).lerp(WARM_KEY, w * 0.6)
    if (key.current) key.current.intensity = 2.1 + w * 0.6
    rim.current?.color.copy(COOL_RIM).lerp(WARM_RIM, 0.35 + w * 0.65)
    if (rim.current) rim.current.intensity = 2.2 + w * 2.5
    if (amb.current) amb.current.intensity = 0.18 + w * 0.12
  })
  return (
    <>
      <ambientLight ref={amb} intensity={0.2} />
      <directionalLight ref={key} position={[2.5, 3.5, 3]} intensity={2.2} />
      <pointLight ref={rim} position={[-2.2, 1.2, -1.8]} intensity={2.5} distance={9} decay={1.4} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.6} color="#f3ede2" position={[0, 3, 2]} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#d39a4e" position={[-4, 0.5, -1]} rotation-y={Math.PI / 2} scale={[4, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#9aa3b0" position={[4, 0, 1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
      </Environment>
    </>
  )
}
