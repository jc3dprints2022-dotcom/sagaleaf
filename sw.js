// SAGA Reader service worker. Built by pwa/plugin.ts into dist-standalone/sw.js
// and published next to saga-reader.html. Its scope is only the reader page, so
// it never touches the landing page or the privacy policy.
//
// What it does: keeps the app shell (the single reader HTML file, the manifest
// and the icons) so the reader opens with no network. Books, highlights and
// notes already live in IndexedDB. Everything else (supabase-js from the CDN,
// Gutendex, the Gutenberg proxy, covers, Supabase) is never intercepted or cached.
//
// Updates: the build stamps VERSION with a hash of the HTML, so every deploy
// changes this file and the browser installs the new worker on the next visit.
// It activates at once (skipWaiting + clients.claim) and drops older caches.
// The page itself is fetched network-first, so an online visit always gets the
// current deploy even if an old worker is still in charge.
const VERSION = 'd56d2b82b439'
const CACHE = 'saga-shell-' + VERSION
const PAGE = 'saga-reader.html'
const SHELL = [PAGE, "saga-reader.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"]
const NETWORK_WAIT_MS = 5000

const here = new URL('./', self.location.href)
const urlOf = p => new URL(p, here).href
const PAGE_URL = urlOf(PAGE)
const SHELL_URLS = new Set(SHELL.map(urlOf))

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(SHELL.map(p => new Request(urlOf(p), { cache: 'reload' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('saga-shell-') && key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data === 'saga:version') event.source?.postMessage({ type: 'saga:version', version: VERSION })
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return              // CDN, Gutendex, proxy, Supabase: straight to the network
  url.hash = ''
  const bare = url.origin + url.pathname
  if (req.mode === 'navigate' && bare === PAGE_URL) return event.respondWith(page(event))
  if (url.search === '' && SHELL_URLS.has(bare)) return event.respondWith(cacheFirst(req, bare))
})

/** Network first, so online visits get the latest deploy; the cached copy if offline or the network stalls. */
async function page(event) {
  const cache = await caches.open(CACHE)
  // Revalidate with the server (a cheap 304 on GitHub Pages) rather than trusting the HTTP cache, so a deploy shows up at once.
  const network = fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
  event.waitUntil(network.then(res => res.ok && res.type === 'basic' ? cache.put(PAGE_URL, res.clone()) : undefined).catch(() => {}))
  const cached = await cache.match(PAGE_URL)
  if (!cached) return network
  const stalled = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS, cached))
  return Promise.race([network.then(res => (res.ok ? res : cached), () => cached), stalled])
}

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE)
  return (await cache.match(key)) ?? fetch(req)
}
