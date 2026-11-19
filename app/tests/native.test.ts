// src/app/native.ts must never call a native plugin outside the Capacitor shell or when the
// shell lacks it, and must never throw (sync or async) when a plugin misbehaves.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const env = vi.hoisted(() => ({ native: false, available: new Set<string>(), setStyle: vi.fn(), hide: vi.fn(), addListener: vi.fn(), takePending: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => env.native, isPluginAvailable: (n: string) => env.available.has(n), convertFileSrc: (u: string) => u },
  registerPlugin: () => ({ addListener: env.addListener, takePending: env.takePending }),
  SystemBars: { setStyle: env.setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: env.hide } }))
vi.mock('../src/core/library', () => ({ importFiles: vi.fn() }))
vi.mock('../src/app/importers', () => ({ importDropped: vi.fn() }))
vi.mock('../src/app/state', () => ({ go: vi.fn(), store: {}, toast: vi.fn() }))

async function load() {
  vi.resetModules()
  vi.stubEnv('VITE_NATIVE', '1')          // the native build, as in e2e/native.ts
  return import('../src/app/native')
}
const tick = () => new Promise(r => setTimeout(r, 20))

beforeEach(() => {
  env.native = false; env.available = new Set()
  for (const f of [env.setStyle, env.hide, env.addListener, env.takePending]) f.mockReset()
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0 }
})

describe('native plugin guards', () => {
  it('native build in a plain browser: no plugin is called', async () => {
    const n = await load()
    await n.initNative(); n.hideSplash()
    document.documentElement.dataset.appearance = 'dark'; await tick()
    expect(env.setStyle).not.toHaveBeenCalled()
    expect(env.hide).not.toHaveBeenCalled()
    expect(env.addListener).not.toHaveBeenCalled()
    expect(env.takePending).not.toHaveBeenCalled()
  })

  it('in the shell, only the plugins it has are called', async () => {
    env.native = true; env.available = new Set(['SplashScreen'])
    env.hide.mockResolvedValue(undefined)
    const n = await load()
    await n.initNative()
    expect(env.hide).toHaveBeenCalled()
    expect(env.setStyle).not.toHaveBeenCalled()
    expect(env.takePending).not.toHaveBeenCalled()
  })

  it('a plugin that throws, rejects or returns null never surfaces an error', async () => {
    env.native = true; env.available = new Set(['SystemBars', 'SplashScreen', 'OpenedFiles'])
    env.setStyle.mockImplementation(() => { const e: { style?: string } | null = null; return e!.style })   // sync TypeError
    env.hide.mockRejectedValue(new Error('no splash'))
    env.addListener.mockImplementation(async (_: string, cb: (e: unknown) => void) => { cb(null); return { remove: async () => {} } })
    env.takePending.mockResolvedValue(null)
    const n = await load()
    const errors: unknown[] = []
    const onErr = (e: unknown) => errors.push(e)
    process.on('unhandledRejection', onErr)
    await expect(n.initNative()).resolves.toBeUndefined()
    n.hideSplash()
    document.documentElement.dataset.appearance = 'light'; await tick()
    process.off('unhandledRejection', onErr)
    expect(env.setStyle).toHaveBeenCalled()
    expect(errors).toEqual([])
  })
})
