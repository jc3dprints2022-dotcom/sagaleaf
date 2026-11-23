/**
 * The SAGA Leaf model handle shared by every scene.
 *
 * Two builders return the same `LeafModel`:
 *  - `buildLeafFromGltf()` (src/three/leafGlb.ts): the rev 4 CAD model, public/models/leaf.glb.
 *  - `buildLeafModel()` (this file): a procedural stand-in drawn from src/data/geometry.ts and the
 *    CAD manifest. It is only a fallback for when the GLB cannot be loaded.
 *
 * Contract (both builders):
 *  - top-level node names: bezel, panel (with child `screen`), pcb, battery, ring, tray, skin, buttons
 *  - units: millimetres; origin at the bottom-left-rear corner of the core body
 *  - x = width, y = height (0 = bottom end), z = thickness (0 = rear face, +z = screen side)
 *  - groups and named parts have identity transforms, so exploding a layer is translating its group
 */
import * as THREE from 'three'
import { GEO, n, type LayerId, FINISHES, SCENE_SCALE } from '@/data/geometry'
import { BUTTON_IDS, GROUP_BOX, LAYER_IDS, PARTS, PIVOT, SCREEN_CENTER, SCREEN_SIZE, centerOf, sizeOf, type BoxMm } from './parts'

const core = n(GEO.core)
const skinDims = n(GEO.withSkin)
const tray = n(GEO.tray)
const bez = n(GEO.bezel)
const pan = n(GEO.panel)
const ring = n(GEO.ring)
const skin = n(GEO.skin)
const usb = n(GEO.usb)

// ---------- helpers ----------
function roundedRect(x: number, y: number, w: number, h: number, r: number, path: THREE.Path = new THREE.Shape()) {
  path.moveTo(x + r, y)
  path.lineTo(x + w - r, y)
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  path.lineTo(x + w, y + h - r)
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  path.lineTo(x + r, y + h)
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  path.lineTo(x, y + r)
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return path
}
function extrude(shape: THREE.Shape, z0: number, depth: number, bevel = 0, segs = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: segs,
  })
  g.translate(0, 0, z0 + bevel)
  return g
}
function boxOf(b: BoxMm) {
  const [w, h, t] = sizeOf(b), [cx, cy, cz] = centerOf(b)
  const g = new THREE.BoxGeometry(w, h, t)
  g.translate(cx, cy, cz)
  return g
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, name: string, shadows = true) {
  const o = new THREE.Mesh(g, m)
  o.name = name
  o.castShadow = shadows
  o.receiveShadow = shadows
  return o
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
/** Fine horizontal lines: the layer texture of a 3D-printed shell, used as a bump map. */
function layerLinesTexture() {
  return canvasTexture(8, 256, ctx => {
    for (let y = 0; y < 256; y++) {
      const v = 128 + Math.round(Math.sin(y * Math.PI * 0.5) * 40 + (y % 4 === 0 ? 20 : 0))
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(0, y, 8, 1)
    }
  })
}
/** Pouch-cell surface: a soft fold near each long edge and a centre seam. Material detail only. */
function pouchTexture() {
  return canvasTexture(128, 128, ctx => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 128, 128)
    const line = (x: number, w: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, 0, w, 128) }
    line(9, 2, '#5a5a5a'); line(11, 2, '#9c9c9c')
    line(115, 2, '#9c9c9c'); line(117, 2, '#5a5a5a')
    ctx.fillStyle = '#6c6c6c'; ctx.fillRect(0, 112, 128, 1); ctx.fillStyle = '#939393'; ctx.fillRect(0, 113, 128, 1)
  })
}

/** Material slots. The names match the material names inside leaf.glb. */
export interface LeafMaterials {
  shell: THREE.MeshStandardMaterial
  bezel: THREE.MeshStandardMaterial
  paper: THREE.MeshStandardMaterial
  screen: THREE.MeshStandardMaterial
  pcb: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  chip: THREE.MeshStandardMaterial
  pouch: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  skin: THREE.MeshPhysicalMaterial
  button: THREE.MeshStandardMaterial
  flex: THREE.MeshStandardMaterial
}
export const MATERIAL_KEYS = ['shell', 'bezel', 'paper', 'screen', 'pcb', 'metal', 'chip', 'pouch', 'steel', 'skin', 'button', 'flex'] as const

export interface LeafModelOptions { screenTexture?: THREE.Texture | null; lowDetail?: boolean; skinColor?: string }

/**
 * Tuned materials, shared by the CAD model and the fallback: matte printed shell with a faint
 * layer texture, diffuse paper-white e-paper (no glow), dark steel ring, satin skin with a thin
 * clearcoat, and clean engineering blocks for the board parts.
 */
export function createLeafMaterials(opts: LeafModelOptions = {}) {
  const bump = layerLinesTexture()
  const pouchBump = pouchTexture()
  const M: LeafMaterials = {
    shell: new THREE.MeshStandardMaterial({ color: '#2d2e34', roughness: 0.84, metalness: 0, bumpMap: bump, bumpScale: 0.55, envMapIntensity: 1 }),
    bezel: new THREE.MeshStandardMaterial({ color: '#2f3036', roughness: 0.82, metalness: 0, bumpMap: bump, bumpScale: 0.35, envMapIntensity: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: '#c9c9bf', roughness: 1, metalness: 0, envMapIntensity: 0.35 }),
    screen: new THREE.MeshStandardMaterial({ color: '#DBDBD1', roughness: 1, metalness: 0, envMapIntensity: 0.3, map: opts.screenTexture ?? null }),
    pcb: new THREE.MeshStandardMaterial({ color: '#15382a', roughness: 0.5, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9bcc0', roughness: 0.38, metalness: 0.9 }),
    chip: new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.55, metalness: 0.1 }),
    pouch: new THREE.MeshStandardMaterial({ color: '#b4b7bc', roughness: 0.46, metalness: 0.7, bumpMap: pouchBump, bumpScale: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.42, metalness: 0.9 }),
    skin: new THREE.MeshPhysicalMaterial({ color: opts.skinColor ?? FINISHES.copper.color, roughness: 0.5, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.42, bumpMap: bump, bumpScale: 0.18 }),
    button: new THREE.MeshStandardMaterial({ color: '#33343a', roughness: 0.72, metalness: 0.03 }),
    flex: new THREE.MeshStandardMaterial({ color: '#b5762c', roughness: 0.5, metalness: 0.1 }),
  }
  for (const k of MATERIAL_KEYS) M[k].name = k
  return { M, dispose() { Object.values(M).forEach(m => m.dispose()); bump?.dispose(); pouchBump?.dispose() } }
}

export interface LeafModel {
  /** 'cad' = public/models/leaf.glb; 'procedural' = the fallback drawn in code. */
  kind: 'cad' | 'procedural'
  /** Pivot at the device centre, scaled to scene units. Rotate/position this. */
  root: THREE.Group
  /** The millimetre-space model inside the pivot. */
  model: THREE.Group
  nodes: Record<LayerId, THREE.Group>
  /** The four button caps (btn-back, btn-prev, btn-select, btn-next). */
  buttons: THREE.Object3D[]
  /** The e-paper active area: a UV quad that carries the screen texture. */
  screen: THREE.Mesh
  materials: LeafMaterials
  /** 0 = assembled (every group at its CAD position), 1 = fully exploded, per layer. */
  applyExplode(e: Partial<Record<LayerId, number>>): void
  /** 0 = clipped on, 1 = detached behind the device (pulled straight off, then hinged on the bottom edge). */
  setSkinDetach(t: number): void
  setSkinColor(hex: string): void
  /** 0 = solid, 1 = rear shell and skin see-through (to show the ring and battery). */
  setXray(t: number): void
  dispose(): void
}

/** Explode vectors in mm (front layers travel furthest toward the viewer). */
export const EXPLODE: Record<LayerId, [number, number, number]> = {
  bezel: [0, 5, 82],
  panel: [0, 2.5, 62],
  pcb: [0, 0, 44],
  battery: [0, -3, 22],
  ring: [0, 3, 9],
  tray: [0, 0, 0],
  skin: [0, -2, -24],
  buttons: [0, 0, 0], // the caps slide sideways out of their slots, handled in applyExplode
}
/** How far each button cap slides out of its slot when exploded (mm). */
export const BUTTON_OUT = 12

const smooth = (a: number, b: number, t: number) => { const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x) }

/** Wraps a millimetre-space model in the shared handle: pivot, explode, skin detach, x-ray. */
export function makeLeafHandle(p: {
  kind: LeafModel['kind']; model: THREE.Group; nodes: Record<LayerId, THREE.Group>; buttons: THREE.Object3D[]
  screen: THREE.Mesh; materials: LeafMaterials; dispose: () => void
}): LeafModel {
  const { model, nodes, buttons, materials: M } = p
  const root = new THREE.Group(); root.name = 'leaf-root'
  model.position.set(-PIVOT[0], -PIVOT[1], -PIVOT[2])
  const scaler = new THREE.Group(); scaler.name = 'leaf-scale'; scaler.scale.setScalar(SCENE_SCALE); scaler.add(model)
  root.add(scaler)

  const side = (b: THREE.Object3D) => (b.name === 'btn-back' || b.name === 'btn-prev' ? -1 : 1)
  // The skin is a shallow cup: its walls wrap the lowest 2.9 mm of the shell. To come off without
  // passing through the shell it first pulls straight back past the wall height, and only then
  // hinges about its bottom edge and drifts away.
  const hingeY = GROUP_BOX.skin.min[1], floorZ = GROUP_BOX.skin.min[2]
  const wallH = GROUP_BOX.skin.max[2] - GROUP_BOX.skin.min[2]
  let skinDetach = 0, skinExplode = 0
  const placeSkin = () => {
    const t = skinDetach
    const pull = smooth(0, 0.4, t) * (wallH + 2.5)
    const angle = -0.42 * smooth(0.3, 1, t)
    const drift = smooth(0.4, 1, t)
    const pz = floorZ - pull // hinge line: the skin's bottom edge, after the straight pull
    const c = Math.cos(angle), s = Math.sin(angle)
    // rotate about the x axis through (hingeY, floorZ) in skin space, then put that line at (hingeY, pz)
    nodes.skin.rotation.x = angle
    nodes.skin.position.set(
      0,
      hingeY - (hingeY * c - floorZ * s) + EXPLODE.skin[1] * skinExplode - drift * 4,
      pz - (hingeY * s + floorZ * c) + EXPLODE.skin[2] * skinExplode - drift * 20,
    )
  }

  return {
    kind: p.kind, root, model, nodes, buttons, screen: p.screen, materials: M,
    applyExplode(e) {
      for (const id of Object.keys(e) as LayerId[]) {
        const t = e[id] ?? 0
        if (id === 'skin') { skinExplode = t; placeSkin(); continue }
        if (id === 'buttons') { for (const b of buttons) b.position.x = side(b) * BUTTON_OUT * t; continue }
        const [x, y, z] = EXPLODE[id]
        nodes[id].position.set(x * t, y * t, z * t)
      }
    },
    setSkinDetach(t) { skinDetach = THREE.MathUtils.clamp(t, 0, 1); placeSkin() },
    setSkinColor(hex) { M.skin.color.set(hex) },
    setXray(t) {
      for (const m of [M.shell, M.skin]) {
        const tr = t > 0.001
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true }
        m.opacity = 1 - 0.8 * t
        m.depthWrite = t < 0.5
      }
    },
    dispose: p.dispose,
  }
}

/**
 * Procedural fallback. Enclosure shapes come from src/data/geometry.ts; the board parts, battery,
 * ring and button caps are boxes placed at their CAD bounding boxes from the manifest.
 */
export function buildLeafModel(opts: LeafModelOptions = {}): LeafModel {
  const segs = opts.lowDetail ? 4 : 8
  const mats = createLeafMaterials(opts)
  const M = mats.M
  const port = new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.9 })
  const model = new THREE.Group(); model.name = 'leaf'
  const nodes = {} as Record<LayerId, THREE.Group>
  for (const id of LAYER_IDS) { const g = new THREE.Group(); g.name = id; model.add(g); nodes[id] = g }
  const inner = { x0: tray.wallLeft, x1: core.w - tray.wallRight, y0: tray.wallEnds, y1: core.h - tray.wallEnds }

  // ---- tray (rear shell): floor + walls ----
  const R = core.cornerR
  {
    const floor = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    nodes.tray.add(mesh(extrude(floor, 0, tray.floor, 0, segs), M.shell, 'tray-floor'))
    const wall = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    const innerR = Math.max(0.6, R - tray.wallRight)
    wall.holes.push(roundedRect(inner.x0, inner.y0, inner.x1 - inner.x0, inner.y1 - inner.y0, innerR, new THREE.Path()))
    nodes.tray.add(mesh(extrude(wall, tray.floor, GROUP_BOX.tray.max[2] - tray.floor, 0.25, segs), M.shell, 'tray-walls'))
    // USB-C mouth, drawn as a dark slot on the right side wall
    const len = usb.y1 - usb.y0 - 0.8, h = usb.z1 - usb.z0 - 0.4
    const slot = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(-h / 2, -len / 2, h, len, h / 2) as THREE.Shape, segs), port)
    slot.rotation.y = Math.PI / 2
    slot.position.set(core.w + 0.02, (usb.y0 + usb.y1) / 2, (usb.z0 + usb.z1) / 2)
    slot.name = 'usb-opening'
    nodes.tray.add(slot)
  }

  // ---- bezel: front frame with the window ----
  {
    const s = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    s.holes.push(roundedRect(SCREEN_CENTER[0] - bez.windowW / 2, SCREEN_CENTER[1] - bez.windowH / 2, bez.windowW, bez.windowH, 0.4, new THREE.Path()))
    nodes.bezel.add(mesh(extrude(s, GROUP_BOX.tray.max[2], bez.topZ - GROUP_BOX.tray.max[2], 0.2, segs), M.bezel, 'bezel-frame'))
  }

  // ---- panel: e-paper glass + active area ----
  nodes.panel.add(mesh(boxOf(PARTS['panel-glass'].box), M.paper, 'panel-glass'))
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_SIZE[0], SCREEN_SIZE[1]), M.screen)
  screen.name = 'screen'
  screen.position.set(SCREEN_CENTER[0], SCREEN_CENTER[1], pan.z1 + 0.02)
  nodes.panel.add(screen)

  // ---- board parts, battery, ring, button caps: boxes at their CAD bounding boxes ----
  for (const id of ['pcb', 'battery'] as const)
    for (const [name, part] of Object.entries(PARTS))
      if (part.group === id) nodes[id].add(mesh(boxOf(part.box), M[part.material as keyof LeafMaterials] ?? M.chip, name))
  {
    const s = new THREE.Shape(); s.absarc(ring.cx, ring.cy, ring.od / 2, 0, Math.PI * 2, false)
    const h = new THREE.Path(); h.absarc(ring.cx, ring.cy, ring.id / 2, 0, Math.PI * 2, true)
    s.holes.push(h)
    nodes.ring.add(mesh(extrude(s, ring.z0, ring.t, 0, opts.lowDetail ? 24 : 48), M.steel, 'magnet-ring'))
  }
  const buttons = BUTTON_IDS.map(name => { const b = mesh(boxOf(PARTS[name].box), M.button, name); nodes.buttons.add(b); return b })

  // ---- rear skin: floor + walls ----
  {
    const ox = (skinDims.w - core.w) / 2, oy = (skinDims.h - core.h) / 2
    const Ro = R + ox
    nodes.skin.add(mesh(extrude(roundedRect(-ox, -oy, skinDims.w, skinDims.h, Ro) as THREE.Shape, -skin.t, skin.t, 0.15, segs), M.skin, 'skin-floor'))
    const wall = roundedRect(-ox, -oy, skinDims.w, skinDims.h, Ro) as THREE.Shape
    wall.holes.push(roundedRect(0, 0, core.w, core.h, R, new THREE.Path()))
    nodes.skin.add(mesh(extrude(wall, 0, skin.wallH, 0, segs), M.skin, 'skin-walls'))
  }

  return makeLeafHandle({
    kind: 'procedural', model, nodes, buttons, screen, materials: M,
    dispose() {
      model.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
      mats.dispose(); port.dispose()
    },
  })
}
