# Android app

The Android app is the same React + Dexie reader as the web app, built as one HTML file and
wrapped with [Capacitor 8](https://capacitorjs.com). There is one web codebase; the native
part is the `android/` project plus `capacitor.config.ts`, `identity.json` and
`src/app/native.ts`. There is no iOS target, and no in-app purchases or Play Billing.

| | Web (GitHub Pages) | Android |
|---|---|---|
| Build | `npm run build:standalone` → `dist-standalone/` | `npm run build:native` → `dist-native/` |
| Offline | service worker (`sw.js`) + manifest | everything is in the APK; **no service worker, no manifest** |
| Origin | `https://saga.proxima-3d.com` | `https://localhost` (Capacitor's default `androidScheme: 'https'`) |
| Sign-in | optional (Google, or an emailed link) | optional, same options (`FEATURES.nativeSignIn: true`, see below) |

The service worker can't register in the app: the native build is compiled with
`VITE_NATIVE=1`, and `registerServiceWorker()` also refuses inside any Capacitor WebView
(`src/app/pwa.ts`). The web build and its PWA files are unchanged.

## Name and application ID: one file

`app/identity.json` holds the visible name and the Android application ID:

```json
{ "name": "SAGA Reader", "shortName": "SAGA", "androidApplicationId": "llc.proxima.readerleaf" }
```

Everything reads it: the web app's `PRODUCT.name` (titles, messages, manifest), the Capacitor
config, and Gradle, which sets `applicationId` and the launcher label from it. To rename:

1. Edit `identity.json`.
2. `npm run android:sync`, then rebuild (debug or release).
3. If the icon changes, edit `public/icon.svg` and run `npm run android:assets`.

`llc.proxima.readerleaf` is a **temporary** ID. Pick the final one before the first upload:
Google Play never lets an app change its application ID. The Java package
(`llc.proxima.reader`, the `namespace` in `android/app/build.gradle`) is internal and never
needs to change.

Not covered by the constant: "SAGA Leaf" (the e-reader device), the web page filename
`saga-reader.html`, and the docs.

## What's native

- **Splash screen**: SAGA's leaf on the app background (`@capacitor/splash-screen`). It
  stays up until the library has rendered (`src/app/native.ts`).
- **Status bar**: the app draws edge to edge (required from Android 16). Capacitor's
  SystemBars passes the insets to CSS, and the layout pads with `env(safe-area-inset-*)`. The
  status bar icons follow the app's light or dark appearance.
- **Launcher icon**: generated from `public/icon.svg`, as adaptive and legacy icons, by
  `scripts/android-assets.mjs`.
- **Choose files**: the existing "Choose files" button opens Android's system file picker
  (Files, Downloads, Drive), filtered to EPUB, PDF and TXT.
- **Open with / Share**: the app is listed for EPUB, PDF and plain-text files under "Open
  with" (Files, mail attachments, Drive), and in the share sheet for EPUB and PDF. One book
  opens straight in the reader. The native half is
  `android/app/src/main/java/llc/proxima/reader/OpenedFilesPlugin.java`. It hands the
  `content://` URI to the page, which reads it through Capacitor's local server and imports
  it like a picked file.
- **Offline**: reading, highlights, notes, bookmarks and positions live in IndexedDB inside
  the app. No account is needed for anything, and nothing loads from the network at
  startup.

Known gaps:

- Some mail apps label attachments `application/octet-stream`, so the app isn't offered for
  them. Save the attachment, then open it from Files or use "Choose files".
- SAGA Leaf pairing over the local network uses `http://`. An `https://localhost` page
  can't call that (mixed content). A native HTTP path (CapacitorHttp) is a follow-up.
- Discover's Standard Ebooks downloads are fetched directly with `?source=download`. They
  work only while that server sends CORS headers that allow the app's origin. Wikisource and
  Internet Archive downloads go through the proxy, which must allow those hosts (see the PR for
  the allow-list change). The Gutenberg proxy already allows `https://localhost`.

## Sign-in in the app

Sign-in is optional on the web and in the app: reading, highlights and import work fully
offline with no account. Settings > Account & sync has **Continue with Google** (primary) and
**Email me a link**. Signing in turns sync on by itself, with no code or passphrase: the
account's own rows (`saga_sync`, one per book: title, author, cover thumbnail, where to get
the file again, highlights, notes, bookmarks, reading positions) are readable only by that
user (Supabase auth + row-level security, HTTPS). Book files are never uploaded; a book with a
source (Discover or a pasted link) downloads again on the other device, an uploaded file shows
as "On your other device" with an **Add file** action.

How it works in the app (`src/app/account.ts`):

1. `@capacitor/browser` opens the Google URL in the system browser (Google refuses embedded
   WebViews): `signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })`.
2. The return URL is `llc.proxima.readerleaf://auth-callback`. `MainActivity` has an intent
   filter for it (VIEW, DEFAULT, BROWSABLE, scheme `llc.proxima.readerleaf`, host
   `auth-callback`). The same URL is the `emailRedirectTo` of the emailed link.
3. `@capacitor/app` delivers it as `appUrlOpen` (or `getLaunchUrl` on a cold start); the page
   calls `exchangeCodeForSession(code)` (PKCE) and `Browser.close()`.
4. `@supabase/supabase-js` is bundled in the native build (the web build loads it from a CDN).

**Supabase dashboard** (Authentication, URL Configuration, Redirect URLs): add
`llc.proxima.readerleaf://auth-callback`. The web redirect (`https://saga.proxima-3d.com/saga-reader.html`)
stays.

**Account deletion** (required by Play for apps that create accounts): Settings > Account &
sync > "Delete account and synced data" deletes the user's `saga_sync` rows and calls the
`delete-account` Edge Function (`supabase/functions/delete-account/index.ts`), which deletes the
auth user with the service role. Deploy it with `supabase functions deploy delete-account`.
Without it the rows are still deleted and the user signed out. The table, its row-level
security policies (including DELETE) are in `supabase/saga_sync.sql`.

Not tested on a device: real Google sign-in through the system browser and the intent filter
on Android. The unit tests (`tests/discover.test.ts`) and `e2e/native.ts` cover the app-return
half with a mocked Supabase.

## Build

Prerequisites: Node 22, JDK 21, Android SDK platform 36 + build-tools 36. Android Studio
provides the last two.

```bash
cd app
npm ci
npm run android:sync        # build:native + cap sync android
```

Debug APK (signed automatically with the local debug key):

```bash
cd app/android
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or `npm run android:open` and press Run in Android Studio.

### Release bundle (AAB) and signing

**Debug vs release signing**

- **Debug builds** are signed with `~/.android/debug.keystore`. The SDK creates it on each
  machine. It's fine for emulators and test phones. Play rejects it.
- **Release builds** are signed with your **upload key**. With Play App Signing (the
  default for new apps), Google keeps the key that signs what users install. You sign
  uploads with the upload key, and Google checks it. If the upload key is lost, Play support
  can reset it. The app itself is never locked out.

Create the upload key once. Keep it and the passwords outside the repo, backed up:

```bash
keytool -genkeypair -v -keystore ~/keys/readerleaf-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android/keystore.properties.example` to `android/keystore.properties` (gitignored) and
fill it in (`storeFile` is relative to `android/`, or absolute). Then:

```bash
cd app && npm run android:sync
```

```bash
cd app/android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```

```bash
jarsigner -verify app/build/outputs/bundle/release/app-release.aab   # "jar verified."
```

Without `keystore.properties`, `bundleRelease` still runs but produces an unsigned bundle,
and Play won't take that. Raise `versionCode` (and `versionName`) in
`android/app/build.gradle` for every upload.

## Play Console, after you have a signed bundle

Nothing has been uploaded. In order:

1. **Create app** (Play Console → All apps → Create app): name, default language, App, Free.
   Accept the declarations.
2. **App content** (Policy → App content), all required before any release:
   - Privacy policy: `https://saga.proxima-3d.com/privacy.html`.
   - Ads: no ads.
   - App access: all functionality available without special access (no login).
   - Content rating: fill in the questionnaire (a reader with user-chosen content).
   - Target audience: 13+ (or 18+). Not designed for children.
   - Data safety: see the next section.
   - Government apps, financial features, health: none.
3. **Store listing** (Grow → Store presence → Main store listing): short and full
   description, a 512×512 icon, a 1024×500 feature graphic, and at least 2 phone
   screenshots.
4. **Internal testing** (Test and release → Testing → Internal testing):
   - Create a testers list (up to 100 emails), then **Create new release**.
   - Accept Play App Signing when asked, and upload `app-release.aab`.
   - Release name and notes, **Save**, **Review release**, then **Start rollout to
     Internal testing**.
   - Share the opt-in link with testers. They install from Play, usually within minutes.
5. Check the internal build on real phones (see "Not yet tested on a device" below).
6. Then move on to closed testing. New personal developer accounts must run a closed test
   (12+ testers for 14 days) before production access. Organisation accounts can go to
   production when ready.

## Play Data safety notes

Declare what this build actually sends off the device. The local library (book files,
highlights, notes, bookmarks, reading positions, collections) stays on the phone, in app
storage, and is deleted on uninstall. Proxima never receives it.

**Without signing in** (what the app does until the user chooses to sign in)

- Does the app collect or share any *required* user data types? **No** (everything below is optional).
  - No analytics, ads, crash reporting or other SDKs. The only permission is `INTERNET`.
  - Discover (optional, only when the user browses free books) sends catalogue searches to
    Gutendex, through Proxima's Supabase proxy, and downloads books from Project Gutenberg
    and Standard Ebooks. These are ordinary HTTPS requests with no identifiers. Play counts
    data that is processed ephemerally as not collected. **Check** that the proxy doesn't
    store request IPs or search terms; if it does, declare them.
- The landing website uses GoatCounter. That's the website, not the app, so it doesn't
  belong in the app's Data safety form.
- Android Auto Backup is on (`allowBackup`). Up to 25 MB of app data can go into the user's
  own Google backup. That's the user's backup, not collection by Proxima. If you'd rather
  keep the library out of it, add backup rules.

**With sign-in (`nativeSignIn: true`, this build)**, declare (all **optional**, none shared,
encrypted in transit, deletable on request):

| Category → type | Why | Notes |
|---|---|---|
| Personal info → Email address | Account management | Only if the user signs in (Google or email link). |
| Personal info → User IDs | Account management, App functionality | The Supabase account ID that sync rows are stored under. |
| App info and performance → none | | No analytics or crash reporting. |
| App activity → Other user-generated content | App functionality | Book list (title, author, cover thumbnail, source), highlights, notes, bookmarks, reading positions, synced automatically while signed in. Stored per account behind row-level security; **not end-to-end encrypted**, so Proxima's service can technically read it. Book files are never uploaded. |
| Web browsing / search history | Not declared | Discover sends search terms and, for Recommended on Home, the authors in the library to Proxima's read-only proxy and to the book sources. Check that the proxy doesn't log them; if it does, declare "App activity → In-app search history". |

Answer "Users can request that data be deleted: yes" (Delete account and synced data in the app).
"Is all of the user data collected by your app encrypted in transit?": yes.

## Tests

- `npm run test:native`: builds `dist-native/` and runs `e2e/native.ts` in a phone-sized
  Chromium with all outside network blocked. It covers the start without network, account
  or service worker, importing an EPUB with the file picker, highlighting, killing and
  relaunching with the highlight kept, and the web half of "open with".
- `e2e/pwa.ts` covers the web PWA, which this change must not break.

**Not yet tested on a device**: installing the APK, the splash, status-bar and edge-to-edge
layout on Android 15/16, and the native half of "open with" / share (`OpenedFilesPlugin`).
The CI sandbox has no emulator (no KVM). Check these on the first internal-test build.
