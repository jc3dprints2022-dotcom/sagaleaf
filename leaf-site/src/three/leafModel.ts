/**
 * Procedural concept model of SAGA Leaf, built from src/data/geometry.ts.
 *
 * Contract for the future CAD swap (public/models/leaf.glb from the rev 4 STEP):
 *  - top-level node names: bezel, panel (with child `screen`), pcb, battery, ring, tray, skin, buttons
 *  - units: millimetres; origin at the bottom-left-rear corner of the core body
 *  - x = width, y = height (0 = bottom/USB edge), z = thickness (0 = rear face, +z = screen side)
 * `buildLeafModel()` returns the same handle shape a GLB loader would, so scenes don't care which.
 */
import * as THREE from 'three'
import { GEO, n, type LayerId, FINISHES } from '@/data/geometry'

const core = n(GEO.core)
const skinDims = n(GEO.withSkin)
const tray = n(GEO.tray)
const bez = n(GEO.bezel)
const pan = n(GEO.panel)
const pcbG = n(GEO.pcb)
const bat = n(GEO.battery)
const ring = n(GEO.ring)
const skin = n(GEO.skin)
const btn = n(GEO.buttons)
const esp = n(GEO.esp32)

// ---------- derived layout (mm) ----------
const inner = { x0: tray.wallLeft, x1: core.w - tray.wallRight, y0: tray.wallEnds, y1: core.h - tray.wallEnds }
const panelX0 = inner.x0 + (inner.x1 - inner.x0 - pan.w) / 2
const panelY0 = (core.h - pan.h) / 2
const activeX0 = panelX0 + (pan.w - pan.activeW) / 2
const activeY0 = panelY0 + pan.activeFromBottom
export const LAYOUT = {
  inner,
  panelX0, panelY0, activeX0, activeY0,
  activeCx: activeX0 + pan.activeW / 2,
  activeCy: activeY0 + pan.activeH / 2,
  center: new THREE.Vector3(core.w / 2, core.h / 2, core.t / 2),
}

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
function box(w: number, h: number, t: number, x0: number, y0: number, z0: number) {
  const g = new THREE.BoxGeometry(w, h, t)
  g.translate(x0 + w / 2, y0 + h / 2, z0 + t / 2)
  return g
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, name: string, shadows = true) {
  const o = new THREE.Mesh(g, m)
  o.name = name
  o.castShadow = shadows
  o.receiveShadow = shadows
  return o
}
/** Deterministic pseudo-random so the board looks the same on every load. */
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) }

/** Fine horizontal lines: the layer texture of a 3D-printed shell, used as a bump map. */
function layerLinesTexture() {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 8; c.height = 256
  const ctx = c.getContext('2d')!
  for (let y = 0; y < 256; y++) {
    const v = 128 + Math.round(Math.sin(y * Math.PI * 0.5) * 40 + (y % 4 === 0 ? 20 : 0))
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(0, y, 8, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 12)
  return t
}

export interface LeafMaterials {
  shell: THREE.MeshStandardMaterial
  bezel: THREE.MeshStandardMaterial
  paper: THREE.MeshStandardMaterial
  screen: THREE.MeshStandardMaterial
  pcb: THREE.MeshStandardMaterial
  gold: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  chip: THREE.MeshStandardMaterial
  pouch: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
  skin: THREE.MeshPhysicalMaterial
  button: THREE.MeshStandardMaterial
  flex: THREE.MeshStandardMaterial
  port: THREE.MeshStandardMaterial
}

export interface LeafModel {
  /** Pivot at the device centre, scaled to scene units. Rotate/position this. */
  root: THREE.Group
  /** The millimetre-space model inside the pivot. */
  model: THREE.Group
  nodes: Record<LayerId, THREE.Group>
  screen: THREE.Mesh
  materials: LeafMaterials
  /** 0 = assembled, 1 = fully exploded, per layer. */
  applyExplode(e: Partial<Record<LayerId, number>>): void
  /** 0 = clipped on, 1 = detached behind the device (hinges on the USB end, as the real skin does). */
  setSkinDetach(t: number): void
  setSkinColor(hex: string): void
  /** 0 = solid, 1 = rear shell and skin see-through (to show the ring and battery). */
  setXray(t: number): void
  dispose(): void
}

/** Explode vectors in mm (front layers travel furthest toward the viewer). */
export const EXPLODE: Record<LayerId, [number, number, number]> = {
  bezel: [0, 6, 78],
  panel: [0, 3, 58],
  pcb: [0, 0, 38],
  battery: [0, -4, 20],
  ring: [0, 4, 8],
  tray: [0, 0, 0],
  skin: [0, -2, -24],
  buttons: [0, 0, 0], // buttons move sideways, handled below
}

export function buildLeafModel(opts: { screenTexture?: THREE.Texture | null; lowDetail?: boolean; skinColor?: string } = {}): LeafModel {
  const segs = opts.lowDetail ? 4 : 8
  const bump = layerLinesTexture()
  const M: LeafMaterials = {
    shell: new THREE.MeshStandardMaterial({ color: '#28292E', roughness: 0.82, metalness: 0.02, bumpMap: bump, bumpScale: 0.6 }),
    bezel: new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.78, metalness: 0.02, bumpMap: bump, bumpScale: 0.4 }),
    paper: new THREE.MeshStandardMaterial({ color: '#cfcfc4', roughness: 0.95, metalness: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: '#DBDBD1', roughness: 0.92, metalness: 0, map: opts.screenTexture ?? null }),
    pcb: new THREE.MeshStandardMaterial({ color: '#173a2a', roughness: 0.55, metalness: 0.05 }),
    gold: new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.3, metalness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bbbf', roughness: 0.35, metalness: 0.9 }),
    chip: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5, metalness: 0.1 }),
    pouch: new THREE.MeshStandardMaterial({ color: '#b9bcc1', roughness: 0.42, metalness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#3a3c40', roughness: 0.45, metalness: 0.85 }),
    skin: new THREE.MeshPhysicalMaterial({ color: opts.skinColor ?? FINISHES.copper.color, roughness: 0.55, metalness: 0.15, clearcoat: 0.25, clearcoatRoughness: 0.6, bumpMap: bump, bumpScale: 0.3 }),
    button: new THREE.MeshStandardMaterial({ color: '#34353b', roughness: 0.7, metalness: 0.05 }),
    flex: new THREE.MeshStandardMaterial({ color: '#b5762c', roughness: 0.5, metalness: 0.1 }),
    port: new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.9 }),
  }
  const model = new THREE.Group(); model.name = 'leaf'
  const group = (name: LayerId) => { const g = new THREE.Group(); g.name = name; model.add(g); return g }
  const nodes = {} as Record<LayerId, THREE.Group>
  for (const id of ['bezel', 'panel', 'pcb', 'battery', 'ring', 'tray', 'skin', 'buttons'] as LayerId[]) nodes[id] = group(id)

  // ---- tray (rear shell): floor + walls ----
  const R = core.cornerR
  {
    const floor = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    nodes.tray.add(mesh(extrude(floor, 0, tray.floor, 0, segs), M.shell, 'tray-floor'))
    const wall = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    const innerR = Math.max(0.6, R - tray.wallRight)
    wall.holes.push(roundedRect(inner.x0, inner.y0, inner.x1 - inner.x0, inner.y1 - inner.y0, innerR, new THREE.Path()))
    nodes.tray.add(mesh(extrude(wall, tray.floor, tray.wallTopZ - tray.floor, 0.25, segs), M.shell, 'tray-walls'))
    // USB-C opening, drawn as a dark slot on the bottom face
    const slot = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(-4.6, -1.65, 9.2, 3.3, 1.6) as THREE.Shape, segs), M.port)
    slot.rotation.x = Math.PI / 2
    slot.position.set(53, -0.02, 3.9)
    slot.name = 'usb-opening'
    nodes.tray.add(slot)
  }

  // ---- bezel: front frame with the window, rebated over the panel ----
  {
    const s = roundedRect(0, 0, core.w, core.h, R) as THREE.Shape
    const wx = LAYOUT.activeCx - bez.windowW / 2
    const wy = LAYOUT.activeCy - bez.windowH / 2
    s.holes.push(roundedRect(wx, wy, bez.windowW, bez.windowH, 0.4, new THREE.Path()))
    nodes.bezel.add(mesh(extrude(s, tray.wallTopZ, bez.topZ - tray.wallTopZ, 0.2, segs), M.bezel, 'bezel-frame'))
    // rebate lip that drops over the panel edge
    const lip = roundedRect(panelX0 - 0.4, panelY0 - 0.4, pan.w + 0.8, pan.h + 0.8, 1.2) as THREE.Shape
    lip.holes.push(roundedRect(panelX0 + 0.6, panelY0 + 0.6, pan.w - 1.2, pan.h - 1.2, 0.6, new THREE.Path()))
    nodes.bezel.add(mesh(extrude(lip, pan.z1, tray.wallTopZ - pan.z1), M.bezel, 'bezel-rebate'))
  }

  // ---- panel: e-paper glass + active area + flex tail ----
  let screen: THREE.Mesh
  {
    nodes.panel.add(mesh(box(pan.w, pan.h, pan.t, panelX0, panelY0, pan.z0), M.paper, 'panel-glass'))
    const sg = new THREE.PlaneGeometry(pan.activeW, pan.activeH)
    screen = new THREE.Mesh(sg, M.screen)
    screen.name = 'screen'
    screen.position.set(LAYOUT.activeCx, LAYOUT.activeCy, pan.z1 + 0.02)
    nodes.panel.add(screen)
    // driver strip below the active area, then the flex tail folding back to the board
    nodes.panel.add(mesh(box(16, 2.2, 0.3, LAYOUT.activeCx - 8, panelY0 + 2.5, pan.z1), M.chip, 'panel-driver'))
    nodes.panel.add(mesh(box(14, 0.15, pan.z1 - pcbG.z0, LAYOUT.activeCx + 6, panelY0 - 0.2, pcbG.z0), M.flex, 'panel-flex'))
  }

  // ---- pcb: L-shaped board (top block + right strip down to the USB end), parts on the rear face ----
  {
    const xL = inner.x0 + 0.3, xR = inner.x1 - 0.3, yT = inner.y1 - 0.3, yB = inner.y0 + 0.3
    const s = new THREE.Shape()
    s.moveTo(xL, pcbG.topBlockY0)
    s.lineTo(pcbG.stripX0, pcbG.topBlockY0)
    s.lineTo(pcbG.stripX0, yB)
    s.lineTo(xR, yB)
    s.lineTo(xR, yT)
    // antenna keep-out notch under the module's antenna end, near the top edge
    s.lineTo(xL + 18, yT)
    s.lineTo(xL + 18, yT - 4.2)
    s.lineTo(xL + 3, yT - 4.2)
    s.lineTo(xL + 3, yT)
    s.lineTo(xL, yT)
    s.lineTo(xL, pcbG.topBlockY0)
    nodes.pcb.add(mesh(extrude(s, pcbG.z0, pcbG.t), M.pcb, 'pcb-board'))
    const under = pcbG.z0 // parts hang below the board (rear face)
    // ESP32-C3 module: shield can + antenna end overhanging the notch
    const mx = xL + 3.2, my = yT - esp.h + 0.2
    nodes.pcb.add(mesh(box(esp.w, esp.h - 4, esp.t - 0.6, mx, my, under - esp.t + 0.6), M.metal, 'esp32-shield'))
    nodes.pcb.add(mesh(box(esp.w, esp.h, 0.8, mx, my, under - 0.8), M.pcb, 'esp32-module'))
    // microSD socket (Molex 104031 class)
    nodes.pcb.add(mesh(box(11.4, 14.6, 1.5, pcbG.stripX0 + 0.6, 16, under - 1.5), M.metal, 'microsd'))
    // USB-C receptacle at the bottom edge
    nodes.pcb.add(mesh(box(8.94, 7.35, 3.2, 53 - 4.47, 0.4, under - 3.2), M.metal, 'usb-c'))
    // display connector
    nodes.pcb.add(mesh(box(18, 4, 1.2, 30, pcbG.topBlockY0 + 1, under - 1.2), M.chip, 'display-connector'))
    // charger IC, passives and gold pads (front and rear)
    nodes.pcb.add(mesh(box(2, 2, 0.8, 50, 40, under - 0.8), M.chip, 'bq21040'))
    const rand = rng(7)
    const pads = new THREE.Group(); pads.name = 'pads'
    for (let i = 0; i < (opts.lowDetail ? 14 : 34); i++) {
      const front = i % 2 === 0
      const x = xL + 4 + rand() * (xR - xL - 8), y = pcbG.topBlockY0 + 2 + rand() * (yT - pcbG.topBlockY0 - 8)
      const w = 0.8 + rand() * 1.4, h = 0.6 + rand() * 0.9
      pads.add(mesh(box(w, h, 0.05, x, y, front ? pcbG.z1 : under - 0.05), M.gold, 'pad', false))
    }
    for (let i = 0; i < (opts.lowDetail ? 6 : 16); i++) {
      const x = xL + 20 + rand() * (xR - xL - 26), y = pcbG.topBlockY0 + 8 + rand() * 30
      pads.add(mesh(box(1 + rand(), 0.5 + rand() * 0.6, 0.45, x, y, under - 0.45), M.chip, 'passive', false))
    }
    nodes.pcb.add(pads)
  }

  // ---- battery pouch (selected cell) ----
  {
    const s = roundedRect(bat.x0, bat.y0, bat.w, bat.h, 1.2) as THREE.Shape
    nodes.battery.add(mesh(extrude(s, tray.floor, bat.t, 0.9, segs), M.pouch, 'battery-pouch'))
    nodes.battery.add(mesh(box(26, 2.2, 1, bat.x0 + 8, bat.y0 + bat.h, tray.floor + 2), M.pcb, 'battery-protection'))
  }

  // ---- magnet ring ----
  {
    const cx = (inner.x0 + inner.x1) / 2
    const s = new THREE.Shape(); s.absarc(cx, ring.cy, ring.od / 2, 0, Math.PI * 2, false)
    const h = new THREE.Path(); h.absarc(cx, ring.cy, ring.id / 2, 0, Math.PI * 2, true)
    s.holes.push(h)
    nodes.ring.add(mesh(extrude(s, tray.floor, ring.t, 0, opts.lowDetail ? 24 : 48), M.steel, 'magnet-ring'))
  }

  // ---- rear skin: floor + U-shaped walls (open at the top end) ----
  {
    const ox = (skinDims.w - core.w) / 2, oy = (skinDims.h - core.h) / 2
    const Ro = R + ox
    const floor = roundedRect(-ox, -oy, skinDims.w, skinDims.h, Ro) as THREE.Shape
    nodes.skin.add(mesh(extrude(floor, -skin.t, skin.t, 0.15, segs), M.skin, 'skin-floor'))
    const u = new THREE.Shape()
    const x0 = -ox, x1 = core.w + ox, y0 = -oy, top = core.h - 6
    u.moveTo(x0, top)
    u.lineTo(x0, y0 + Ro); u.absarc(x0 + Ro, y0 + Ro, Ro, Math.PI, Math.PI * 1.5, false)
    u.lineTo(x1 - Ro, y0); u.absarc(x1 - Ro, y0 + Ro, Ro, -Math.PI / 2, 0, false)
    u.lineTo(x1, top); u.lineTo(core.w, top)
    u.lineTo(core.w, R); u.absarc(core.w - R, R, R, 0, -Math.PI / 2, true)
    u.lineTo(R, 0); u.absarc(R, R, R, -Math.PI / 2, -Math.PI, true)
    u.lineTo(0, top); u.lineTo(x0, top)
    nodes.skin.add(mesh(extrude(u, 0, skin.wallH - skin.t, 0, segs), M.skin, 'skin-walls'))
  }

  // ---- buttons: BACK, PREV (left) · SELECT, NEXT (right) ----
  {
    const topInner = inner.y1
    const zc = 4.6, ht = 2.0
    const mk = (name: string, left: boolean, fromTop: number) => {
      const y = topInner - fromTop - btn.capLen / 2
      const x = left ? -btn.capProud : core.w
      const m = mesh(extrude(roundedRect(x, y, btn.capProud + 0.3, btn.capLen, 0.35) as THREE.Shape, zc - ht / 2, ht, 0.12), M.button, name)
      if (!left) m.position.x = -0.3
      m.userData.side = left ? -1 : 1
      nodes.buttons.add(m)
    }
    mk('btn-back', true, btn.upperFromTopInner)
    mk('btn-prev', true, btn.lowerFromTopInner)
    mk('btn-select', false, btn.upperFromTopInner)
    mk('btn-next', false, btn.lowerFromTopInner)
  }

  // pivot at the device centre, scaled to scene units
  const root = new THREE.Group(); root.name = 'leaf-root'
  model.position.copy(LAYOUT.center).multiplyScalar(-1)
  const scaler = new THREE.Group(); scaler.scale.setScalar(0.01); scaler.add(model)
  root.add(scaler)

  const skinBase = { rx: 0, z: 0, y: 0 }
  let skinDetach = 0
  let skinExplode = 0
  const placeSkin = () => {
    // Detach: hinge about the USB (bottom) end, lift the open top end away, then drift back.
    const t = skinDetach
    const hinge = Math.min(1, t * 1.6)
    const drift = Math.max(0, t - 0.45) / 0.55
    nodes.skin.position.set(0, skinBase.y + EXPLODE.skin[1] * skinExplode - drift * 6, EXPLODE.skin[2] * skinExplode - hinge * 3 - drift * 26)
    nodes.skin.rotation.x = hinge * 0.32 * (1 - drift * 0.6)
  }

  return {
    root, model, nodes, screen, materials: M,
    applyExplode(e) {
      for (const id of Object.keys(e) as LayerId[]) {
        const t = e[id] ?? 0
        if (id === 'skin') { skinExplode = t; placeSkin(); continue }
        if (id === 'buttons') {
          for (const b of nodes.buttons.children) b.position.x = (b.userData.side === 1 ? -0.3 : 0) + b.userData.side * 14 * t
          nodes.buttons.position.z = 30 * t
          continue
        }
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
        m.opacity = 1 - 0.78 * t
        m.depthWrite = t < 0.5
      }
    },
    dispose() {
      model.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
      Object.values(M).forEach(m => m.dispose())
      bump?.dispose()
    },
  }
}
