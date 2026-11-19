export function cleanPlainText(raw: string): string
export function xhtmlToText(html: string): string
export function convertEpubToText(buf: ArrayBuffer | Uint8Array, opts?: { onProgress?: (p: { section: number; total: number }) => void }): Promise<{ text: string; title: string | null; author: string | null; sections: number; skipped: number; biggestChapter: number }>
