// Running from disk (file://) the browser treats every blob: URL as a foreign
// origin: a book page loaded into an iframe from a blob: URL can't be reached by
// the reader (no highlights, no layout), and the page's own blob: stylesheets,
// images and fonts are refused. For file:// only, we:
//  1. remember each blob foliate creates,
//  2. rewrite blob: references inside a book page to data: URLs, and
//  3. hand the page to its iframe as srcdoc (same-origin) instead of src.
// Served over http(s) none of this runs.
const registry = new Map<string, Blob>()
let patched = false
export const needsInlining = () => typeof location !== 'undefined' && location.protocol === 'file:'

function patch() {
  if (patched) return; patched = true
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (o: Blob | MediaSource) => { const u = create(o); if (o instanceof Blob) registry.set(u, o); return u }
  URL.revokeObjectURL = (u: string) => { registry.delete(u); revoke(u) }
  const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    configurable: true, enumerable: true,
    get(this: HTMLIFrameElement) { return src.get!.call(this) },
    set(this: HTMLIFrameElement, v: string) {
      const b = registry.get(v)
      if (b && /html|xml/.test(b.type)) void b.text().then(t => { this.srcdoc = asHtml(t, b.type) })
      else src.set!.call(this, v)
    },
  })
}

/** srcdoc is always parsed as HTML: re-serialize XHTML so <a id="x"/> doesn't swallow what follows. */
function asHtml(text: string, type: string) {
  if (!/xhtml|xml/.test(type)) return text
  const x = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  if (x.querySelector('parsererror') || !x.documentElement) return text
  const h = document.implementation.createHTMLDocument('')
  h.replaceChild(h.importNode(x.documentElement, true), h.documentElement)
  return '<!DOCTYPE html>' + h.documentElement.outerHTML
}

const BLOB = /blob:null\/[0-9a-f-]{36}/g
const cache = new Map<string, Promise<string>>()
function toDataUrl(u: string): Promise<string> {
  if (!cache.has(u)) cache.set(u, (async () => {
    const b = registry.get(u); if (!b) return u
    let bytes: Uint8Array
    if (/css|svg|xml|html/.test(b.type)) bytes = new TextEncoder().encode(await inline(await b.text()))   // nested url()s
    else bytes = new Uint8Array(await b.arrayBuffer())
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`
  })())
  return cache.get(u)!
}
async function inline(str: string) {
  const found = [...new Set(str.match(BLOB) ?? [])]
  if (!found.length) return str
  const map = new Map(await Promise.all(found.map(async u => [u, await toDataUrl(u)] as const)))
  return str.replace(BLOB, u => map.get(u) ?? u)
}

/** Attach to a foliate book before it is opened. */
export function inlineSubresources(book: { transformTarget?: EventTarget }) {
  if (!needsInlining() || !book.transformTarget) return
  patch()
  book.transformTarget.addEventListener('data', e => {
    const d = (e as CustomEvent<{ data: unknown; type: string }>).detail
    if (/html|xml/.test(d.type)) d.data = Promise.resolve(d.data).then(x => (typeof x === 'string' ? inline(x) : x))
  })
}
export const installBlobRegistry = () => { if (needsInlining()) patch() }
