import { initialState, type StoryState } from './sceneState'

/**
 * Fixed camera states used for the static WebP renders (posters, the reduced-motion / no-WebGL
 * path, og.jpg). They are drawn by the same canvas as the live story, from the rev 4 CAD model.
 */
/** On narrow screens the hero looks slightly left, at the middle of the exploded stack (it extends toward the viewer). */
export const HERO_LOOK_X_NARROW = -0.2

export const PRESETS: Record<string, (s: StoryState, wide: boolean) => void> = {
  // The first frame of the live story: must match StoryController's hero camera exactly.
  hero: (s, wide) => { s.idle = 0; s.cam.z = wide ? 3.6 : 6.4; s.look.x = wide ? 0 : HERO_LOOK_X_NARROW },
  assembled: s => { s.assemble = 1; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.14, ry: -0.62, rz: 0 }; s.cam = { x: 0.5, y: 0.32, z: 2.3 }; s.warm = 0.4 },
  // Seen from behind the stack, so the parts hanging under the board are in view.
  exploded: s => { s.assemble = 0; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.12, ry: -2.2, rz: 0 }; s.cam = { x: 0.3, y: 0.45, z: 3.1 }; s.look = { x: 0, y: 0, z: 0 } },
  rear: s => { s.assemble = 1; s.idle = 0; s.xray = 1; s.dev = { x: 0, y: 0, z: 0, rx: -0.08, ry: 2.55, rz: 0 }; s.cam = { x: 0, y: 0.25, z: 2.25 } },
  // Right side: the USB-C mouth in the side wall, SELECT and NEXT above it.
  side: s => { s.assemble = 1; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.08, ry: -1.2, rz: 0 }; s.cam = { x: 0.12, y: 0.3, z: 2.45 }; s.look = { x: 0, y: 0, z: 0 } },
  studio: s => { s.assemble = 1; s.idle = 0; s.warm = 1; s.screen = { page: 1, flash: 0, font: 1, menu: 0, highlight: 1, note: 1 }; s.dev = { x: 0, y: 0, z: 0, rx: -0.12, ry: -0.6, rz: 0 }; s.cam = { x: 0.55, y: 0.34, z: 2.35 } },
}
export function presetState(name: string, wide = true): StoryState {
  const s = initialState()
  ;(PRESETS[name] ?? PRESETS.hero)(s, wide)
  return s
}
