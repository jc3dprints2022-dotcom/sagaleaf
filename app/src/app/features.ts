// Product switches. Flip a flag to bring a hidden area back; its code is kept.
export const FEATURES = {
  /** SAGA Author and SAGA Publisher portals, and the author catalog in Discover. */
  authorPortal: false,
  /** Sign-in (and so cloud sync) in the Android/iOS app. Off until the OAuth and magic-link
   *  redirects return to the app through a deep link; see docs/ANDROID.md. Off hides the
   *  Account section in the native build entirely; the web app is unaffected. */
  nativeSignIn: false,
} as const
