// Product switches. Flip a flag to bring a hidden area back; its code is kept.
export const FEATURES = {
  /** SAGA Author and SAGA Publisher portals, and the author catalog in Discover. */
  authorPortal: false,
  /** Sign-in (and so account sync) in the Android app. Google opens in the system browser and returns through
   *  llc.proxima.readerleaf://auth-callback; see docs/ANDROID.md "Sign-in in the app". */
  nativeSignIn: true,
} as const
