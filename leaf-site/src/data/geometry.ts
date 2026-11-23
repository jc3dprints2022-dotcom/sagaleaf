/**
 * Every number the 3D views use, with where it came from.
 *
 * Units: 1 unit = 1 mm. Axes: x = width (0 = left edge of the core body, seen from the front),
 * y = height (0 = bottom end), z = thickness (0 = rear face of the core body, +z toward the
 * screen). `public/models/leaf.glb` (converted from the rev 4 STEP) uses these node names, this
 * origin and these units; `public/models/leaf.parts.json` lists its bounding boxes. The
 * procedural builder in `src/three/leafModel.ts` draws from the same numbers and is only a
 * fallback for when the GLB cannot be loaded.
 *
 * Status meanings (same as docs/SPECS.md):
 *   datasheet = from the part's datasheet
 *   estimated = rev 4 CAD output, never physically measured
 *   assumed   = not in the facts block; a placeholder chosen only to make the fallback model
 *               draw. Never shown as a spec on the site.
 */
export type GeoStatus = 'datasheet' | 'estimated' | 'assumed'
export interface Dim { v: number; src: string; status: GeoStatus }

const CAD = 'rev4 CAD report (unlit, YDL 504040)'
const DS_PANEL = 'Good Display GDEY0397T81P datasheet'
const ASSUMED = 'fallback-model placeholder (not a spec)'
/** Positions read from the rev 4 CAD model (bounding boxes in public/models/leaf.parts.json). */
const CAD_MODEL = 'rev4 CAD'

const d = (v: number, src: string, status: GeoStatus): Dim => ({ v, src, status })

export const GEO = {
  core: {
    w: d(62.69, CAD, 'estimated'),
    h: d(100.52, CAD, 'estimated'),
    t: d(7.87, CAD, 'estimated'),
    cornerR: d(3.5, CAD, 'estimated'),
  },
  withSkin: {
    w: d(64.19, CAD, 'estimated'),
    h: d(102.02, CAD, 'estimated'),
    t: d(8.47, CAD, 'estimated'),
    massG: d(62, CAD, 'estimated'),
  },
  tray: {
    wallLeft: d(3.35, CAD, 'estimated'),
    wallRight: d(2.7, CAD, 'estimated'),
    floor: d(0.6, CAD, 'estimated'),
    wallEnds: d(1.95, ASSUMED, 'assumed'),
  },
  bezel: {
    topZ: d(7.87, CAD, 'estimated'),
    windowW: d(52.64, CAD, 'estimated'),
    windowH: d(87.2, CAD, 'estimated'),
  },
  panel: {
    w: d(56.24, DS_PANEL, 'datasheet'),
    h: d(96.62, DS_PANEL, 'datasheet'),
    t: d(0.92, DS_PANEL, 'datasheet'),
    z0: d(6.35, CAD, 'estimated'),
    z1: d(7.27, CAD, 'estimated'),
    activeW: d(51.84, DS_PANEL, 'datasheet'),
    activeH: d(86.4, DS_PANEL, 'datasheet'),
    activeFromBottom: d(8.02, DS_PANEL, 'datasheet'),
    pxW: d(480, DS_PANEL, 'datasheet'),
    pxH: d(800, DS_PANEL, 'datasheet'),
    diagonalIn: d(3.97, DS_PANEL, 'datasheet'),
    litPanelT: d(1.8, 'rev4 CAD front-lit variant (planned)', 'estimated'),
  },
  pcb: {
    t: d(0.8, 'rev4 board design (confirmed)', 'estimated'),
    z0: d(5.3, CAD, 'estimated'),
    z1: d(6.1, CAD, 'estimated'),
  },
  battery: {
    w: d(42, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    h: d(40, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    t: d(5.0, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    layer: d(5.5, CAD, 'estimated'),
    mAh: d(1000, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    /** Bay position of the cell envelope (40.5 × 42.5 mm in CAD, lower half of the device). */
    x0: d(19.29, CAD_MODEL, 'estimated'),
    y0: d(1.65, CAD_MODEL, 'estimated'),
    bayW: d(40.5, CAD_MODEL, 'estimated'),
    bayH: d(42.5, CAD_MODEL, 'estimated'),
  },
  ring: {
    od: d(54, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    id: d(46, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    t: d(2.0, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    cx: d(31.67, CAD_MODEL, 'estimated'),
    cy: d(71.62, CAD_MODEL, 'estimated'),
    z0: d(0.6, CAD_MODEL, 'estimated'),
  },
  skin: {
    t: d(0.6, 'rev4 CAD rear skin (confirmed design)', 'estimated'),
    wallH: d(2.9, 'rev4 CAD rear skin (confirmed design)', 'estimated'),
  },
  buttons: {
    /** Centres measured down from the top inner edge (BACK/SELECT at 5 mm, PREV/NEXT at 12 mm). */
    upperFromTopInner: d(5, 'rev4 CAD button layout (confirmed design)', 'estimated'),
    lowerFromTopInner: d(12, 'rev4 CAD button layout (confirmed design)', 'estimated'),
  },
  usb: {
    /** GCT USB4110 receptacle. Its mouth opens through the right side wall (x = core width). */
    y0: d(45.7, CAD_MODEL, 'estimated'),
    y1: d(55.7, CAD_MODEL, 'estimated'),
    bodyX0: d(54.96, CAD_MODEL, 'estimated'),
    z0: d(2.04, CAD_MODEL, 'estimated'),
    z1: d(5.3, CAD_MODEL, 'estimated'),
  },
  esp32: {
    // ESP32-C3-MINI-1 module outline from the Espressif datasheet.
    w: d(13.2, 'Espressif ESP32-C3-MINI-1 datasheet', 'datasheet'),
    h: d(16.6, 'Espressif ESP32-C3-MINI-1 datasheet', 'datasheet'),
    t: d(2.4, 'Espressif ESP32-C3-MINI-1 datasheet', 'datasheet'),
  },
} as const

/** Convenience: plain numbers for the model builder. */
export const n = <T extends Record<string, Dim>>(g: T) =>
  Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.v])) as { [K in keyof T]: number }

/** Exploded-layer order, front to back (node names are the GLB contract). */
export const LAYERS = [
  { id: 'bezel', label: 'Bezel', note: 'Front frame, rebated over the panel' },
  { id: 'panel', label: 'E-paper panel', note: '3.97″, 480 × 800, monochrome' },
  { id: 'pcb', label: 'Board 1 (rev 4)', note: 'ESP32-C3, microSD, USB-C, 0.8 mm PCB' },
  { id: 'battery', label: 'Battery', note: '1000 mAh selected cell, subject to change' },
  { id: 'ring', label: 'Magnetic ring', note: 'MagSafe-pattern, 54 mm' },
  { id: 'tray', label: 'Rear shell', note: '3D-printed prototype enclosure' },
  { id: 'skin', label: 'Rear skin', note: 'Snap-on, 0.6 mm, concept finishes' },
  { id: 'buttons', label: 'Buttons', note: 'BACK · PREV left, SELECT · NEXT right' },
] as const
export type LayerId = (typeof LAYERS)[number]['id']

/** Scene scale: 1 mm → 0.01 scene units, so the device is about one unit tall. */
export const SCENE_SCALE = 0.01

/** Finishes (concept: the skin colours are not final). */
export const FINISHES = {
  copper: { color: '#B8663A', label: 'Copper', src: 'rev4 CAD render finish (concept)' },
  slate: { color: '#45484E', label: 'Slate', src: 'rev4 CAD render finish (concept)' },
} as const
export type FinishId = keyof typeof FINISHES
