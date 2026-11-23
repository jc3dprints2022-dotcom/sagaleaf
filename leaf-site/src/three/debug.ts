'use client'
/**
 * Test-only handle: `window.__leaf`. It is installed only for automated browsers
 * (navigator.webdriver) or with `?leafdebug` in the URL, and lets the Playwright tests ask the
 * live scene what it is actually drawing. Nothing in the site reads it.
 */
import * as THREE from 'three'
import type { LayerId } from '@/data/geometry'
import type { LeafModel } from './leafModel'
import { fetchLeafGlb } from './leafGlb'
import { LAYER_IDS, SCREEN_BOX } from './parts'

type V3 = [number, number, number]
export interface LeafDebug {
  kind: LeafModel['kind']
  /** Fetch + parse time and file size of leaf.glb for this canvas (null on the fallback). */
  load: { ms: number; bytes: number } | null
  meshNames(): string[]
  /** Bounding box of everything drawn, in model millimetres. */
  bboxMm(): { min: V3; max: V3 }
  /** Per group: its offset from the CAD position and the z of its bounding-box centre (mm). */
  groups(): Record<string, { offset: V3; rotation: V3; centerZ: number }>
  /** Per button cap: x-range in model millimetres. */
  buttonsX(): Record<string, [number, number]>
  /** Per mesh: material colour as #rrggbb. */
  colors(): Record<string, string>
  screenUv(): { count: number; min: [number, number]; max: [number, number] } | null
  /** The screen quad projected to CSS pixels inside the canvas. */
  screenRect(): { left: number; right: number; top: number; bottom: number; width: number; height: number }
  /** Explodes every layer by t (0 = CAD positions, 1 = fully exploded) and redraws. */
  explode(t: number): void
  /** Loads the GLB again with the site's loader and reports what the file contains. */
  inspectGlb(url?: string): Promise<{ nodes: string[]; bbox: { min: V3; max: V3 }; screenUv: { count: number; min: [number, number]; max: [number, number] } | null; bytes: number; ms: number }>
}
declare global { interface Window { __leaf?: LeafDebug } }

export const debugEnabled = () => typeof window !== 'undefined' && (navigator.webdriver || /[?&]leafdebug\b/.test(location.search))

const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]

/** Bounding box of all meshes under `root`, expressed in `space`'s local frame. */
function boxIn(root: THREE.Object3D, space: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert()
  const out = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4()
  root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    b.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld))
    out.union(b)
  })
  return out
}
function uvInfo(mesh: THREE.Mesh | undefined) {
  const uv = mesh?.geometry.attributes.uv
  if (!uv) return null
  const min: [number, number] = [Infinity, Infinity], max: [number, number] = [-Infinity, -Infinity]
  for (let i = 0; i < uv.count; i++) {
    min[0] = Math.min(min[0], uv.getX(i)); max[0] = Math.max(max[0], uv.getX(i))
    min[1] = Math.min(min[1], uv.getY(i)); max[1] = Math.max(max[1], uv.getY(i))
  }
  return { count: uv.count, min, max }
}

export function installLeafDebug(leaf: LeafModel, ctx: { camera: THREE.Camera; canvas: HTMLCanvasElement; invalidate: () => void; load: { ms: number; bytes: number } | null }) {
  if (!debugEnabled()) return () => {}
  const handle: LeafDebug = {
    kind: leaf.kind,
    load: ctx.load,
    meshNames() { const n: string[] = []; leaf.model.traverse(o => { if ((o as THREE.Mesh).isMesh) n.push(o.name) }); return n },
    bboxMm() { const b = boxIn(leaf.model, leaf.model); return { min: arr(b.min), max: arr(b.max) } },
    groups() {
      const out: Record<string, { offset: V3; rotation: V3; centerZ: number }> = {}
      for (const id of LAYER_IDS) {
        const g = leaf.nodes[id as LayerId]
        const c = boxIn(g, leaf.model).getCenter(new THREE.Vector3())
        out[id] = { offset: arr(g.position), rotation: [g.rotation.x, g.rotation.y, g.rotation.z], centerZ: c.z }
      }
      return out
    },
    buttonsX() {
      const out: Record<string, [number, number]> = {}
      for (const b of leaf.buttons) { const bx = boxIn(b, leaf.model); out[b.name] = [bx.min.x, bx.max.x] }
      return out
    },
    colors() {
      const out: Record<string, string> = {}
      leaf.model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) out[m.name] = '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString() })
      return out
    },
    screenUv: () => uvInfo(leaf.screen),
    screenRect() {
      leaf.root.updateWorldMatrix(true, true)
      ctx.camera.updateMatrixWorld()
      const r = ctx.canvas.getBoundingClientRect()
      const xs: number[] = [], ys: number[] = []
      for (const x of [SCREEN_BOX.min[0], SCREEN_BOX.max[0]]) for (const y of [SCREEN_BOX.min[1], SCREEN_BOX.max[1]]) {
        // the quad's corners in model millimetres, carried by the panel group (so explode offsets count)
        const p = new THREE.Vector3(x, y, SCREEN_BOX.max[2]).applyMatrix4(leaf.nodes.panel.matrixWorld).project(ctx.camera)
        xs.push((p.x * 0.5 + 0.5) * r.width); ys.push((1 - (p.y * 0.5 + 0.5)) * r.height)
      }
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
      return { left, right, top, bottom, width: right - left, height: bottom - top }
    },
    explode(t) { leaf.applyExplode(Object.fromEntries(LAYER_IDS.map(id => [id, t]))); ctx.invalidate() },
    async inspectGlb(url) {
      const g = await fetchLeafGlb(url)
      const nodes: string[] = []
      g.scene.traverse(o => { if (o.name) nodes.push(o.name) })
      const leafNode = g.scene.getObjectByName('leaf')!
      const b = boxIn(leafNode, leafNode)
      const res = { nodes, bbox: { min: arr(b.min), max: arr(b.max) }, screenUv: uvInfo(g.scene.getObjectByName('screen-mesh') as THREE.Mesh), bytes: g.bytes, ms: g.ms }
      g.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
      return res
    },
  }
  window.__leaf = handle
  return () => { if (window.__leaf === handle) delete window.__leaf }
}
