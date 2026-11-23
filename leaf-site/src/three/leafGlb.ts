/**
 * Loads public/models/leaf.glb: the rev 4 CAD model converted to glTF with
 * EXT_meshopt_compression + KHR_mesh_quantization (no Draco).
 *
 * The parsed file is cached once per page and reference-counted. Every canvas gets its own clone
 * of the node tree and its own materials, so the story and the shop never share mutable state;
 * only the (immutable) geometry buffers are shared, and they are freed when the last user leaves.
 *
 * Each named part node wraps one `<name>-mesh` child that carries the meshopt dequantization
 * transform. Nothing here, or anywhere else, writes position/scale/rotation on a `-mesh` node.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { LayerId } from '@/data/geometry'
import { asset } from '@/lib/paths'
import { BUTTON_IDS, LAYER_IDS, PARTS } from './parts'
import { createLeafMaterials, makeLeafHandle, MATERIAL_KEYS, type LeafMaterials, type LeafModel, type LeafModelOptions } from './leafModel'

export const LEAF_GLB_URL = asset('models/leaf.glb')

export interface LeafGlb {
  /** The glTF scene. Treat as read-only: clone it. */
  scene: THREE.Group
  /** Size of the .glb file in bytes (decoded body). */
  bytes: number
  /** Fetch + parse time in milliseconds. */
  ms: number
}

/** Planar UVs in millimetres, so tiling material detail (layer lines, the pouch fold) has something to map to. */
function addDetailUvs(scene: THREE.Object3D) {
  const v = new THREE.Vector3()
  scene.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.geometry.attributes.uv) return
    const pos = m.geometry.attributes.position
    const part = PARTS[m.name.replace(/-mesh$/, '')]
    const uv = new Float32Array(pos.count * 2)
    m.updateMatrix()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix) // -> absolute CAD millimetres
      if (part?.material === 'pouch') {
        uv[i * 2] = (v.x - part.box.min[0]) / (part.box.max[0] - part.box.min[0])
        uv[i * 2 + 1] = (v.y - part.box.min[1]) / (part.box.max[1] - part.box.min[1])
      } else {
        // print layers stack along z: 64 texture lines per repeat = one line every 0.2 mm
        uv[i * 2] = (v.x + v.y) / 10
        uv[i * 2 + 1] = v.z / 12.8
      }
    }
    m.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  })
}

/**
 * The screen texture is a canvas (three's convention: v = 1 is the top row of the image), while
 * the file's quad follows glTF's (v = 0 is the top row). Rewrite the quad's UVs once, from its
 * own corner positions, so that the top of the page is at +y and its left edge at -x whichever
 * way the exporter wrote them.
 */
function orientScreenUvs(scene: THREE.Object3D) {
  const g = (scene.getObjectByName('screen-mesh') as THREE.Mesh).geometry
  const pos = g.attributes.position
  g.computeBoundingBox()
  const { min, max } = g.boundingBox!
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - min.x) / (max.x - min.x)
    uv[i * 2 + 1] = (pos.getY(i) - min.y) / (max.y - min.y)
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Throws if the file does not honour the node contract the scenes rely on. */
function assertContract(scene: THREE.Object3D) {
  const missing = ['leaf', ...LAYER_IDS, ...BUTTON_IDS, 'screen', 'screen-mesh', 'rear-skin-mesh'].filter(nm => !scene.getObjectByName(nm))
  if (missing.length) throw new Error(`leaf.glb is missing nodes: ${missing.join(', ')}`)
  const screen = scene.getObjectByName('screen-mesh') as THREE.Mesh
  if (!screen.isMesh || !screen.geometry.attributes.uv) throw new Error('leaf.glb: screen quad has no UVs')
}

export async function fetchLeafGlb(url = LEAF_GLB_URL, timeoutMs = 15000): Promise<LeafGlb> {
  const t0 = performance.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`leaf.glb: HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.parseAsync(buf, '')
    assertContract(gltf.scene)
    orientScreenUvs(gltf.scene)
    addDetailUvs(gltf.scene)
    return { scene: gltf.scene, bytes: buf.byteLength, ms: performance.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

let cached: Promise<LeafGlb> | null = null
let users = 0

/** Shared, reference-counted load. Call `release()` when the canvas that used it unmounts. */
export async function acquireLeafGlb(): Promise<{ glb: LeafGlb; release: () => void }> {
  const mine = (cached ??= fetchLeafGlb())
  users++
  let released = false
  const release = () => {
    if (released) return
    released = true
    if (--users > 0 || cached !== mine) return
    cached = null
    mine.then(g => g.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() }), () => {})
  }
  try {
    return { glb: await mine, release }
  } catch (err) {
    users--
    released = true
    if (cached === mine) cached = null
    throw err
  }
}

/** Builds the shared `LeafModel` handle around a private clone of the CAD node tree. */
export function buildLeafFromGltf(glb: LeafGlb, opts: LeafModelOptions = {}): LeafModel {
  const mats = createLeafMaterials(opts)
  const M = mats.M
  const model = glb.scene.getObjectByName('leaf')!.clone(true) as THREE.Group
  const nodes = {} as Record<LayerId, THREE.Group>
  for (const id of LAYER_IDS) nodes[id] = model.getObjectByName(id) as THREE.Group
  const buttons = BUTTON_IDS.map(nm => model.getObjectByName(nm)!)
  const screen = model.getObjectByName('screen-mesh') as THREE.Mesh
  // Swap the GLB's flat PBR colours for the tuned materials, matched by material name.
  model.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const key = (m.material as THREE.Material).name as keyof LeafMaterials
    m.material = (MATERIAL_KEYS as readonly string[]).includes(key) ? M[key] : M.chip
    m.castShadow = m.receiveShadow = m !== screen
  })
  screen.receiveShadow = true
  return makeLeafHandle({ kind: 'cad', model, nodes, buttons, screen, materials: M, dispose: mats.dispose })
}
