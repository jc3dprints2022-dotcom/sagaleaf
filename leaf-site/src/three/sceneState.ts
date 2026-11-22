/**
 * One mutable object that the GSAP master timeline tweens and the R3F scene reads every frame.
 * Keeping all motion in a single scrubbed timeline is what makes the homepage fully reversible.
 */
import type { ScreenState } from './screenTexture'

export interface Vec3 { x: number; y: number; z: number }
export interface StoryState {
  cam: Vec3
  look: Vec3
  /** Device group transform (radians / scene units). */
  dev: { x: number; y: number; z: number; rx: number; ry: number; rz: number }
  /** 0 = exploded stack, 1 = assembled. Layers settle in order, front to back. */
  assemble: number
  xray: number
  /** Camera push until the e-paper fills the viewport (0..1). */
  fill: number
  /** Phone silhouette, in the device group's local space. */
  phone: { x: number; y: number; z: number; ry: number; show: number; screen: number }
  screen: ScreenState
  /** 0 = cool night, 1 = warm product studio. */
  warm: number
  /** Idle turntable speed multiplier (0 while the timeline is steering). */
  idle: number
  /** Rear skin colour (concept finish). */
  skin: string
}

export function initialState(): StoryState {
  return {
    cam: { x: 0.9, y: 0.35, z: 3.1 },
    look: { x: 0, y: 0, z: 0 },
    dev: { x: 0.35, y: 0.02, z: 0, rx: -0.12, ry: -0.75, rz: 0 },
    assemble: 0,
    xray: 0,
    fill: 0,
    phone: { x: 0, y: 0.12, z: -0.6, ry: Math.PI, show: 0, screen: 0 },
    screen: { page: 0, flash: 0, font: 0, menu: 0, highlight: 0, note: 0 },
    warm: 0,
    idle: 1,
    skin: '#B8663A',
  }
}
