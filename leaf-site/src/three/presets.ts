import { initialState, type StoryState } from './sceneState'

/** Fixed camera states used for the static WebP renders (reduced-motion / no-WebGL path). */
export const PRESETS: Record<string, (s: StoryState) => void> = {
  hero: s => { s.idle = 0 },
  assembled: s => { s.assemble = 1; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.14, ry: -0.62, rz: 0 }; s.cam = { x: 0.5, y: 0.32, z: 2.6 }; s.warm = 0.4 },
  exploded: s => { s.assemble = 0; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.1, ry: -1.0, rz: 0 }; s.cam = { x: 0.6, y: 0.4, z: 3.4 } },
  rear: s => { s.assemble = 1; s.idle = 0; s.xray = 1; s.dev = { x: 0, y: 0, z: 0, rx: -0.08, ry: 2.55, rz: 0 }; s.cam = { x: 0, y: 0.25, z: 2.4 } },
  side: s => { s.assemble = 1; s.idle = 0; s.dev = { x: 0, y: 0, z: 0, rx: -0.1, ry: 1.18, rz: 0 }; s.cam = { x: 0.15, y: 0.4, z: 2.0 }; s.look = { x: 0, y: 0.15, z: 0 } },
  studio: s => { s.assemble = 1; s.idle = 0; s.warm = 1; s.screen = { page: 1, flash: 0, font: 1, menu: 0, highlight: 1, note: 1 }; s.dev = { x: 0, y: 0, z: 0, rx: -0.12, ry: -0.6, rz: 0 }; s.cam = { x: 0.55, y: 0.34, z: 2.7 } },
}
export function presetState(name: string): StoryState {
  const s = initialState()
  ;(PRESETS[name] ?? PRESETS.hero)(s)
  return s
}
