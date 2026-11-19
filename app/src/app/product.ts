// The product's name and install colours, in one place. Used by the app (title,
// install hint, update notice) and by the build (web app manifest, icons,
// service worker cache name). Rename here, then rebuild.
export const PRODUCT = {
  name: 'SAGA Reader',
  shortName: 'SAGA',
  description: 'Your books, your notes, on every device you own.',
  /** The page the installed app opens; the service worker and manifest scope are limited to it. */
  page: 'saga-reader.html',
  themeColor: '#eceee9',
  backgroundColor: '#eceee9',
} as const
