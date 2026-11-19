// The product's name and install colours, in one place. Used by the app (title,
// install hint, update notice) and by the build (web app manifest, icons,
// service worker cache name). The name itself lives in app/identity.json, which
// the Android build (applicationId, launcher label) reads too: rename there, then rebuild.
import identity from '../../identity.json'

export const PRODUCT = {
  name: identity.name,
  shortName: identity.shortName,
  description: 'Your books, your notes, on every device you own.',
  /** The page the installed app opens; the service worker and manifest scope are limited to it. */
  page: 'saga-reader.html',
  themeColor: '#eceee9',
  backgroundColor: '#eceee9',
} as const
