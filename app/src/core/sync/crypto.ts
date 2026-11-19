// Library encryption for the sync relay. The relay stores ciphertext only: a
// random library secret (kept on the user's devices, shown as a pairing code)
// derives an AES-GCM key, an HMAC key for blob names, and the public library id.
const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('')

export function newLibrarySecret() {
  const b = crypto.getRandomValues(new Uint8Array(15))
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const chars = Array.from(b, x => alphabet[x % alphabet.length]).join('')
  return `saga-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}`
}

export interface LibraryKeys { libraryId: string; aes: CryptoKey; mac: CryptoKey }

export async function deriveKeys(secret: string): Promise<LibraryKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.trim().toLowerCase()), 'HKDF', false, ['deriveKey', 'deriveBits'])
  const info = (s: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('saga-library-v1'), info: enc.encode(s) })
  const aes = await crypto.subtle.deriveKey(info('content'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const mac = await crypto.subtle.deriveKey(info('names'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign'])
  const id = await crypto.subtle.deriveBits(info('id'), base, 128)
  return { libraryId: hex(id), aes, mac }
}

export async function seal(keys: LibraryKeys, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, data as unknown as BufferSource))
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12)
  return out
}
export async function open(keys: LibraryKeys, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) as unknown as BufferSource }, keys.aes, data.subarray(12) as unknown as BufferSource))
}
export const sealJson = async (k: LibraryKeys, v: unknown) => b64(await seal(k, enc.encode(JSON.stringify(v))))
export const openJson = async <T>(k: LibraryKeys, s: string): Promise<T> => JSON.parse(dec.decode(await open(k, unb64(s))))
export async function blobName(k: LibraryKeys, hash: string) { return hex(await crypto.subtle.sign('HMAC', k.mac, enc.encode(hash))).slice(0, 32) }
