/**
 * Pure functions of timeline time (0–100). Anything discrete on the homepage (which app screen
 * the phone shows, which e-paper page is up) and the phone's whole pose are computed here from
 * the playhead alone: no tween start values, no hysteresis, no clock. Scrubbing forward and back
 * to the same progress therefore always lands on the same state.
 */
import { GROUP_BOX, PIVOT } from './parts'
import { SCENE_SCALE } from '@/data/geometry'

/** Total timeline length in arbitrary units; beats are authored on a 0–100 scale. */
export const T = 100

/** Real SAGA Reader screenshots shown on the phone, in order (files under public/app/real/). */
export const PHONE_SCREENS = [
  { file: 'app/real/phone-library.webp', label: 'Library' },
  { file: 'app/real/phone-reader-highlighted.webp', label: 'Reader with highlights' },
  { file: 'app/real/phone-typography.webp', label: 'Text and layout' },
  { file: 'app/real/phone-discover.webp', label: 'Discover' },
  { file: 'app/real/phone-settings.webp', label: 'Settings' },
] as const

/**
 * Timeline times at which the phone switches to screen 1, 2, 3 and 4. Before PHONE_ON the phone
 * is seen from behind (screen off = -1); from PHONE_ON it shows screen 0 (Library).
 */
export const PHONE_ON = 58
export const PHONE_SCREEN_AT = [75.2, 77.3, 79.3, 81.5] as const

export function phoneScreenAt(time: number): number {
  if (time < PHONE_ON) return -1
  let i = 0
  while (i < PHONE_SCREEN_AT.length && time >= PHONE_SCREEN_AT[i]) i++
  return i
}

type Ease = (t: number) => number
const linear: Ease = t => t
const outQuad: Ease = t => 1 - (1 - t) * (1 - t)
const inQuad: Ease = t => t * t
const inOut: Ease = t => t * t * (3 - 2 * t)
const inExpo: Ease = t => (t <= 0 ? 0 : Math.pow(2, 10 * (t - 1)))

/** Keyframe track: [time, value, ease used to arrive at this key]. Clamped outside its range. */
type Key = readonly [number, number, Ease?]
export function track(keys: readonly Key[]) {
  return (time: number) => {
    if (time <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, ease = linear] = keys[i]
      if (time < t1) {
        const [t0, v0] = keys[i - 1]
        return v0 + (v1 - v0) * ease((time - t0) / (t1 - t0))
      }
    }
    return keys[keys.length - 1][1]
  }
}

export const PHONE_THICKNESS = 0.075
/** Phone centre when its back touches the Leaf's rear skin (device-local z, scene units). */
export const PHONE_TOUCH_Z = (GROUP_BOX.skin.min[2] - PIVOT[2]) * SCENE_SCALE - PHONE_THICKNESS / 2 - 0.002
/** Height of the magnetic ring's centre above the device pivot (scene units). */
export const RING_Y = ((GROUP_BOX.ring.min[1] + GROUP_BOX.ring.max[1]) / 2 - PIVOT[1]) * SCENE_SCALE

// Ring beat: a phone approaches from behind, hovers, snaps onto the ring, then lets go.
const snapZ = track([[42.6, PHONE_TOUCH_Z - 0.9], [43.8, PHONE_TOUCH_Z - 0.16, outQuad], [43.9, PHONE_TOUCH_Z - 0.16], [44.35, PHONE_TOUCH_Z, inExpo], [45.6, PHONE_TOUCH_Z], [47.2, PHONE_TOUCH_Z - 1.1, inQuad]])
const snapShow = track([[42.2, 0], [43.2, 1, inOut], [45.6, 1], [47.2, 0, inQuad]])
// Ecosystem beat: the phone slides in beside the Leaf showing the app, then leaves.
const appX = track([[72, 1.5], [74.4, 0.95, outQuad], [84, 0.95], [86, 1.7, inQuad]])
const appShow = track([[72, 0], [74.4, 1, outQuad], [84, 1], [86, 0, inQuad]])

export interface PhonePose { x: number; y: number; z: number; ry: number; show: number; screen: number }
export function phoneAt(time: number): PhonePose {
  if (time < PHONE_ON) return { x: 0, y: RING_Y, z: snapZ(time), ry: Math.PI, show: snapShow(time), screen: -1 }
  return { x: appX(time), y: 0, z: 0.02, ry: 0, show: appShow(time), screen: phoneScreenAt(time) }
}

/** E-paper page and type size are steps, flipped while the refresh flash / type menu covers them. */
export const PAGE_TURN_AT = 57
export const FONT_CHANGE_AT = 60.8
export const screenStepsAt = (time: number) => ({ page: time >= PAGE_TURN_AT ? 1 : 0, font: time >= FONT_CHANGE_AT ? 1 : 0 })
