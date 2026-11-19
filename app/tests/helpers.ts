import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Store } from '../src/core/store'
import { uid } from '../src/core/util'

export const sample = (name: string) => new Uint8Array(readFileSync(join(__dirname, '..', 'public', 'samples', name)))
export async function freshStore(name = 'test-' + uid(), device = 'Test device') {
  const s = new Store(name)
  await s.init(device)
  return s
}
