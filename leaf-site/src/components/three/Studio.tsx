'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'

const COOL_KEY = new THREE.Color('#ece7de')
const WARM_KEY = new THREE.Color('#ffcf9c')
const COOL_RIM = new THREE.Color('#8d97a6')
const WARM_RIM = new THREE.Color('#d39a4e')

/**
 * Calm, literary lighting: one soft key, an amber rim, a low cool fill, and a small environment
 * built from local Lightformers (no HDR file is downloaded). `warm` (0..1) moves it from a cool
 * night scene toward a warm product studio. With `shadows`, the key casts soft shadows so the
 * exploded layers shade each other (desktop only; phones skip the shadow pass).
 */
export function Studio({ warm, shadows = false, envResolution = 64 }: { warm: () => number; shadows?: boolean; envResolution?: number }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.PointLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  useFrame(() => {
    const w = warm()
    key.current?.color.copy(COOL_KEY).lerp(WARM_KEY, w * 0.55)
    if (key.current) key.current.intensity = 2.5 + w * 0.5
    rim.current?.color.copy(COOL_RIM).lerp(WARM_RIM, 0.35 + w * 0.65)
    if (rim.current) rim.current.intensity = 2.4 + w * 2.4
    if (fill.current) fill.current.intensity = 0.7 - w * 0.15
    if (amb.current) amb.current.intensity = 0.3 + w * 0.1
  })
  return (
    <>
      <ambientLight ref={amb} intensity={0.18} />
      <directionalLight
        ref={key} position={[2.4, 3.4, 3.2]} intensity={2.1}
        castShadow={shadows} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} shadow-normalBias={0.012} shadow-radius={5}
        shadow-camera-left={-1.3} shadow-camera-right={1.3} shadow-camera-top={1.3} shadow-camera-bottom={-1.3} shadow-camera-near={1} shadow-camera-far={10}
      />
      <directionalLight ref={fill} position={[-3, 0.5, 2.5]} intensity={0.35} color="#9aa7ba" />
      <pointLight ref={rim} position={[-2.2, 1.3, -1.9]} intensity={2.5} distance={9} decay={1.4} />
      <Environment resolution={envResolution} frames={1}>
        {/* big soft key box overhead, warm strip behind-left (rim), cool card on the right (fill) */}
        <Lightformer form="rect" intensity={1.7} color="#f3ede2" position={[0.5, 3, 2]} scale={[6, 2.4, 1]} />
        <Lightformer form="rect" intensity={1.0} color="#d39a4e" position={[-4, 0.6, -1.2]} rotation-y={Math.PI / 2} scale={[4, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#9aa3b0" position={[4, 0, 1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.25} color="#e9e4da" position={[0, -3, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
      </Environment>
    </>
  )
}

/**
 * The cheap contact shadow used on phones (and anywhere a blurred depth pass is too costly):
 * one soft, dark ellipse on the floor under the device. `opacity` is read every frame.
 */
export function BlobShadow({ y, size = [1.1, 0.5], opacity }: { y: number; size?: [number, number]; opacity: () => number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const o = opacity()
    if (mat.current) mat.current.opacity = o
    if (mesh.current) mesh.current.visible = o > 0.01
  })
  return (
    <mesh ref={mesh} position={[0, y, 0]} rotation-x={-Math.PI / 2} scale={[size[0], size[1], 1]} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
