# SAGA Reader

A local-first reading app for books you own, with a companion e-ink device, SAGA Leaf.
Import DRM-free EPUB, PDF and TXT files; read them with real typography; highlight and
annotate; carry your place and notes between phones, computers and the Leaf, encrypted
end to end. No account, no ads, no reading telemetry.

This repository also holds a working prototype of the publishing side (SAGA Author,
SAGA Publisher and a demo catalog) and the research behind the product decisions.

**Status: working prototype.** Everything listed as *built and tested* in
[docs/LIMITATIONS.md](docs/LIMITATIONS.md) passes automated tests. SAGA Leaf integration has
been tested **only against a simulator**, never against the physical device.

![Home screen opening on the sentence you stopped at](screenshots/12-home-continue-reading.png)

## Just open it (no install, no server)

`saga-reader.html` is the whole app in one file. Double-click it, or drag it into Chrome or
Edge. It runs from disk like any page you saved: your library, highlights and reading
position stay in that browser on that computer.

Everything works without a server, including a simulated SAGA Leaf that runs inside the page:

- **Add classic books** loads four public-domain books baked into the file.
- **Devices → Find my SAGA Leaf → SAGA Leaf (simulated in this page)** pairs the in-page SAGA Leaf.
  Its screen, with the pairing code, appears right in the dialog. Open it again later from
  the device page to read and highlight on it, then press Sync now.
- **Discover** lists free public-domain books from Project Gutenberg (through the Gutendex API)
  and new releases from Standard Ebooks. **Get book** downloads the file once and adds it to your
  library like any import. You can also paste a Gutenberg or Standard Ebooks link.
- **Library → Import** brings in a Calibre library (folder or zip; DRM-free EPUB, PDF and TXT,
  with Calibre's titles and authors) and Kindle highlights (`My Clippings.txt`, or a Kindle app's
  notebook HTML/CSV export). Notes only: SAGA never opens Kindle book files or removes DRM.
  See [docs/IMPORT.md](docs/IMPORT.md) for formats, matching rules and the URLs used.
- **Settings → Account (optional)**: sign in with an email link or Google (Supabase Auth) and
  turn on "Sync my notes and reading progress". Notes are encrypted on the device with your
  library code before upload; book files never leave the device. Sign-in needs the web
  address (https), not a file opened from disk. Configuration is the `SAGA_AUTH` line at the
  top of the HTML file; leave it empty to turn accounts off.

SAGA Author and SAGA Publisher are hidden in this version. Set `authorPortal: true` in
`src/app/features.ts` and rebuild to bring them back.

The one thing that needs a server is syncing *between* devices. Start one with
`npm run platform` on a computer your devices can reach and enter its address under
Devices → Turn on sync. Build the file yourself with `npm run build:standalone`; it is written
to `dist-standalone/saga-reader.html`.

## Quick start (development)

Requirements: Node 20+ (tested on 22), a Chromium-based browser for the e2e suite.

```bash
npm install
npm run dev          # app + simulated Leaf + platform server, all at once
```

| What | URL |
|---|---|
| SAGA Reader | http://127.0.0.1:5173 |
| Simulated Leaf screen (firmware 2 proposal) | http://127.0.0.1:8790/device |
| Simulated Leaf, firmware 1.0.0 behaviour | http://127.0.0.1:8792/device |
| Platform server (sync relay, author/publisher API, catalog) | http://127.0.0.1:8791/api/health |

On first launch, choose **Add classic books** (public-domain editions from Standard
Ebooks, bundled in `public/samples/`) or drop your own files on the window.

To try the Leaf: Devices, **Find my Leaf**, pick *SAGA Leaf (simulated)*, then type the
six-digit code shown on the simulated screen at `:8790/device`. Read on that page with the
arrow keys, then sync.

To try publishing: SAGA Author, upload `public/samples/frankenstein.epub`, fill in details,
send for review; SAGA Publisher, approve; Discover, get the book.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server + Leaf simulators + platform server |
| `npm run app` / `leaf` / `platform` | Each piece on its own |
| `npm test` | 99 unit and integration tests (Vitest) |
| `npm run test:e2e` | Full user journey in Chrome (needs `npm run dev` running and Chrome at `/usr/bin/google-chrome`, or set the path in `e2e/run.ts`) |
| `npx tsx e2e/offline.ts` | Offline behaviour against the production build (`npm run build && npx vite preview --port 4173` first) |
| `npm run bench` | Node benchmarks: 1,000-book import, 10,000-book library, sync stress, transfer stress |
| `npx tsx bench/browser.ts` | Browser benchmarks and axe-core accessibility scan (needs dev server) |
| `npm run build` | Production build into `dist/` (installable PWA) |
| `npm run build:standalone` | The whole app as one HTML file that runs from disk, `dist-standalone/saga-reader.html` |
| `npx tsx e2e/import.ts` | Calibre, Kindle, Gutenberg and Standard Ebooks import against the published PWA files, then offline reading (network mocked; 7 steps) |
| `npx tsx e2e/standalone.ts` | Opens that file from `file://` and runs the journey, Discover included (17 steps) |
| `npx tsx e2e/accounts.ts` | Serves the file at its web address and tests sign-in and encrypted notes sync across two devices (14 steps) |
| `npm run android:sync` | Builds the Android web bundle (`dist-native/`) and syncs it into `android/`; then `cd android && ./gradlew assembleDebug` or `bundleRelease` (see [docs/ANDROID.md](docs/ANDROID.md)) |
| `npm run test:native` | The Android bundle in a phone-sized browser with no network: import, highlight, relaunch, open-with (7 steps) |
| `npm run typecheck` | TypeScript, strict |

Environment: `VITE_PLATFORM_URL` points the app at another platform server.
`LEAF_PORT`, `LEAF_V1_PORT`, `PORT` change simulator and server ports.

## Repository map

```
src/core/          Platform-independent engine (no React): the part future native clients reuse
  types.ts           Data model
  db.ts store.ts     IndexedDB schema; the single write path with clocks + replication log
  library.ts         Import, dedupe, delete, export/backup, restore, full-text search
  epub.ts txt.ts pdf.ts   Format parsing and validation
  anchor.ts          Text-quote anchors that survive layout and edition changes
  sync/              Encrypted relay sync engine (crypto.ts, engine.ts)
  leaf/              Leaf client (both protocols), conversion, Leaf sync
src/ui/            React UI: screens/, reader/ (engine adapters for foliate-js and pdf.js)
src/vendor/        leaf-epub-convert.js: the Leaf firmware project's own EPUB→text converter
sim/               SAGA Leaf simulator (firmware 1.0.0 protocol + proposed protocol 2)
server/            Platform server: sync relay, author/publisher workflow, demo catalog
tests/ e2e/ bench/ Automated tests, browser journey, benchmarks (with result JSON)
research/          Evidence database (JSON), research reports, generator scripts
docs/              Architecture, protocol, design, test results, limitations, roadmap, research
screenshots/       Captured by the e2e run
public/samples/     Public-domain test books (Standard Ebooks, CC0) and generated PDF/TXT fixtures
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): stack choice, modules, data model, sync design, how cloud and accounts slot in later
- [Leaf protocol](docs/LEAF_PROTOCOL.md): firmware 1.0.0 as built, the proposed protocol 2, and the firmware and hardware changes it needs
- [Test results](docs/TEST_RESULTS.md): what ran, real numbers, what is simulated
- [Limitations](docs/LIMITATIONS.md): built, tested, simulated, planned, speculative
- [Roadmap](docs/ROADMAP.md): prioritized path to public release
- [Android app](docs/ANDROID.md): Capacitor build, renaming, signing, Play Console steps, Data safety notes
- [Design system](docs/DESIGN.md)
- [Research report](docs/RESEARCH.md), [product requirements](docs/PRODUCT_REQUIREMENTS.md), [ideas evaluated](docs/IDEAS.md), [business model](docs/BUSINESS_MODEL.md)
- [Competitive benchmark workbook](docs/SAGA-competitive-benchmark.xlsx)

## Content and licences

Sample books are public domain in the US; the Standard Ebooks editions are released under
CC0. Rendering uses [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) and
[pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0). Fonts: Literata, Newsreader,
Hanken Grotesk, Atkinson Hyperlegible (OFL), OpenDyslexic (Bitstream Vera licence). SAGA's
own licence is not chosen yet (see roadmap).

SAGA does not remove DRM and never will. DRM-protected files are detected and refused with
an explanation.
