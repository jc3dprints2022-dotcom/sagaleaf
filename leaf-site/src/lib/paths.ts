/** Asset paths under the /leaf basePath (next/image is unoptimised, plain <img>/fetch need the prefix). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/leaf'
export const asset = (p: string) => `${BASE}/${p.replace(/^\//, '')}`
export const SITE_URL = 'https://saga.proxima-3d.com'
export const READER_APP = '/saga-reader.html'
