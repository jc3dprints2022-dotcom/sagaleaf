/**
 * Every number the concept 3D model uses, with where it came from.
 *
 * Units: 1 unit = 1 mm. Axes: x = width (0 = left edge of the core body, seen from the front),
 * y = height (0 = bottom edge, the USB-C end), z = thickness (0 = rear face of the core body,
 * +z toward the screen). A later `public/models/leaf.glb` exported from the rev 4 STEP should
 * keep these node names, this origin and these units so it can replace the procedural model.
 *
 * Status meanings (same as docs/SPECS.md):
 *   datasheet = from the part's datasheet
 *   estimated = rev 4 CAD output, never physically measured
 *   assumed   = not in the facts block; a placeholder chosen only to make the concept model
 *               draw. Never shown as a spec on the site. CAD will replace it.
 */
export type GeoStatus = 'datasheet' | 'estimated' | 'assumed'
export interface Dim { v: number; src: string; status: GeoStatus }

const CAD = 'rev4 CAD report (unlit, YDL 504040)'
const DS_PANEL = 'Good Display GDEY0397T81P datasheet'
const ASSUMED = 'concept-model placeholder (not a spec)'

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
    wallTopZ: d(7.0, ASSUMED, 'assumed'),
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
    topBlockY0: d(46, ASSUMED, 'assumed'),
    stripX0: d(47, ASSUMED, 'assumed'),
  },
  battery: {
    w: d(42, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    h: d(40, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    t: d(5.0, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    layer: d(5.5, CAD, 'estimated'),
    mAh: d(1000, 'YDL 504040 cell spec (selected, not ordered)', 'datasheet'),
    x0: d(4.5, ASSUMED, 'assumed'),
    y0: d(4, ASSUMED, 'assumed'),
  },
  ring: {
    od: d(54, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    id: d(46, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    t: d(2.0, 'rev4 CAD, MagSafe-pattern ring (confirmed design)', 'estimated'),
    cy: d(72, ASSUMED, 'assumed'),
  },
  skin: {
    t: d(0.6, 'rev4 CAD rear skin (confirmed design)', 'estimated'),
    wallH: d(2.9, 'rev4 CAD rear skin (confirmed design)', 'estimated'),
  },
  buttons: {
    /** Centres measured down from the top inner edge (BACK/SELECT at 5 mm, PREV/NEXT at 12 mm). */
    upperFromTopInner: d(5, 'rev4 CAD button layout (confirmed design)', 'estimated'),
    lowerFromTopInner: d(12, 'rev4 CAD button layout (confirmed design)', 'estimated'),
    capLen: d(4.5, ASSUMED, 'assumed'),
    capProud: d(0.8, ASSUMED, 'assumed'),
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

/** Finishes (concept, from CAD renders). */
export const FINISHES = {
  copper: { color: '#B8663A', label: 'Copper', src: 'rev4 CAD render finish (concept)' },
  slate: { color: '#45484E', label: 'Slate', src: 'rev4 CAD render finish (concept)' },
} as const
export type FinishId = keyof typeof FINISHES
