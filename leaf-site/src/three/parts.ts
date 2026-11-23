/**
 * The rev 4 CAD manifest (public/models/leaf.parts.json): bounding boxes in millimetres for every
 * group and part of public/models/leaf.glb. Anything that anchors a label, a callout or a camera
 * to the model reads its numbers from here instead of eyeballing them.
 */
import manifest from '../../public/models/leaf.parts.json'
import { LAYERS, type LayerId } from '@/data/geometry'

export type Vec3Tuple = [number, number, number]
export interface BoxMm { min: Vec3Tuple; max: Vec3Tuple }
interface ManifestMesh { node: string; material: string; bbox_mm: BoxMm }
interface ManifestGroup { bbox_mm: BoxMm; meshes: ManifestMesh[] }

const groups = manifest.groups as unknown as Record<LayerId, ManifestGroup>

export const LAYER_IDS = LAYERS.map(l => l.id) as LayerId[]
export const BUTTON_IDS = ['btn-back', 'btn-prev', 'btn-select', 'btn-next'] as const

/** Bounding box of each of the eight groups. */
export const GROUP_BOX = Object.fromEntries(LAYER_IDS.map(id => [id, groups[id].bbox_mm])) as Record<LayerId, BoxMm>

/** Bounding box, group and material name of every named part node. */
export const PARTS = Object.fromEntries(
  LAYER_IDS.flatMap(id => groups[id].meshes.map(m => [m.node, { group: id, material: m.material, box: m.bbox_mm }] as const)),
) as Record<string, { group: LayerId; material: string; box: BoxMm }>

export const centerOf = (b: BoxMm): Vec3Tuple => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
export const sizeOf = (b: BoxMm): Vec3Tuple => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]

/** Core body (tray + bezel) and the whole assembly including the rear skin. */
export const CORE_BOX: BoxMm = { min: [0, 0, 0], max: [GROUP_BOX.tray.max[0], GROUP_BOX.tray.max[1], GROUP_BOX.bezel.max[2]] }
export const ASSEMBLY_BOX: BoxMm = LAYER_IDS.reduce<BoxMm>((acc, id) => ({
  min: acc.min.map((v, i) => Math.min(v, GROUP_BOX[id].min[i])) as Vec3Tuple,
  max: acc.max.map((v, i) => Math.max(v, GROUP_BOX[id].max[i])) as Vec3Tuple,
}), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })

/** The pivot every scene rotates the device about: the centre of the core body. */
export const PIVOT: Vec3Tuple = centerOf(CORE_BOX)

/** The e-paper active area (the `screen` UV quad). */
export const SCREEN_BOX = PARTS.screen.box
export const SCREEN_CENTER = centerOf(SCREEN_BOX)
export const SCREEN_SIZE = sizeOf(SCREEN_BOX)
