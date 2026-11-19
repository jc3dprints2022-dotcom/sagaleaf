// pdf.js loading for browser and Node (tests, server), plus page text in the
// exact form the reader's text layer exposes, so offsets line up.
type PdfJs = typeof import('pdfjs-dist')
let lib: Promise<PdfJs> | null = null

export function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    const node = typeof process !== 'undefined' && !!(process.versions?.node) && (typeof window === 'undefined' || !!process.env.VITEST)
    lib = (node
      ? import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs' as string)
      : import('pdfjs-dist').then(async m => {
        if (import.meta.env.VITE_STANDALONE === '1') {
          // Single-file build: no worker file to point at, so the worker's source is
          // inlined and started from a blob (works from file:// with no server).
          // Browsers refuse module workers from blob: URLs on file:// pages, so the
          // worker's two module-only bits are rewritten and it runs as a classic worker.
          const src = (await import('pdfjs-dist/build/pdf.worker.min.mjs?raw')).default
            .replace(/import\.meta\.url/g, 'self.location.href').replace(/export\s*\{\s*WorkerMessageHandler\s*\};?\s*$/, '')
          try { m.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))) }
          catch { /* pdf.js falls back to parsing on the main thread */ }
        } else {
          m.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        }
        return m
      })) as Promise<PdfJs>
  }
  return lib
}

export interface PdfItem { str: string; hasEOL?: boolean }
/** Page text: item strings, with '\n' where pdf.js marks an end of line. */
export const pageText = (items: PdfItem[]) => items.map(i => i.str + (i.hasEOL ? '\n' : '')).join('')

export async function openPdf(bytes: Uint8Array) {
  const m = await pdfjs()
  const task = m.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, ...(typeof window !== 'undefined' && import.meta.env?.VITE_STANDALONE !== '1' && (typeof process === 'undefined' || !process.env?.VITEST) ? { standardFontDataUrl: `${import.meta.env?.BASE_URL ?? '/'}pdfjs/standard_fonts/` } : {}) } as Parameters<typeof m.getDocument>[0])
  const doc = await task.promise
  return Object.assign(doc, { close: () => task.destroy() })
}

export async function parsePdf(bytes: Uint8Array) {
  const doc = await openPdf(bytes)
  const info = (await doc.getMetadata().catch(() => null))?.info as Record<string, string> | undefined
  const outline = await doc.getOutline().catch(() => null)
  const pages: { section: number; title: string; text: string }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    pages.push({ section: p - 1, title: `Page ${p}`, text: pageText(tc.items as PdfItem[]) })
    page.cleanup()
  }
  const result = { title: info?.Title?.trim() || '', author: info?.Author?.trim() || '', pages, numPages: doc.numPages, hasOutline: !!outline?.length }
  await doc.close()
  return result
}

export async function renderPdfCover(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof OffscreenCanvas === 'undefined' && !document.createElement) return null
  try {
    const doc = await openPdf(bytes)
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const scale = 360 / vp.width
    const v = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.width); canvas.height = Math.round(v.height)
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: v } as never).promise
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82))
    await doc.close()
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch { return null }
}
