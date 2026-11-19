# Architecture

## Goals that shaped it

1. **The reading experience works with no network and no server.** Offline is the normal case, not a fallback.
2. **User data can't be silently lost**, whatever the order in which devices reconnect.
3. **One engine, many clients.** The first platform is the web (installable PWA). Desktop, Android and iOS clients should reuse the engine, not rewrite it.
4. **Cloud sync, optional accounts and third-party integrations can be added later without a rewrite.**
5. **Use established renderers**, not a home-made one.

## Stack and why

| Layer | Choice | Why, and what was rejected |
|---|---|---|
| Language | TypeScript (strict) | One language for app, engine, simulator and server; types document the sync model. |
| First platform | Web app + PWA (Vite, React 19) | Runs on every OS today, installs offline, and is the shortest path to a fully working product. Native shells (Tauri for desktop, Capacitor for mobile) can wrap the same bundle; see "Future clients". |
| EPUB rendering | foliate-js 1.0 (MIT) | The engine behind the Foliate desktop reader: real pagination with CSS columns, EPUB CFI, search, overlays for highlights. epub.js was the alternative: older, slower pagination, less maintained. Readium's web toolkit is heavier and aimed at publishers. |
| PDF rendering | pdf.js 5 (Apache-2.0) | The standard. foliate-js 1.0's npm build doesn't wire PDF, so SAGA has a small page view with pdf.js's text layer for selection and highlights. |
| Storage | IndexedDB via Dexie 4 | Transactions, indexes, survives restarts, works in every browser. Files are stored as bytes keyed by SHA-256, so identical files are stored once. |
| Search | MiniSearch for metadata; a scan of the stored text index for passages | Metadata search at 10,000 books takes about 4 ms. Passage search across about 1,000 books takes about 200 ms (see test results). A real inverted index is on the roadmap. |
| Sync | Op log + field-level last-writer-wins with hybrid logical clocks, merged client-side, relayed through an end-to-end-encrypted server | Simple, correct under reordering, and the server never sees content. CRDT libraries (Automerge, Yjs) were considered; the data is records with independent fields, where per-field LWW plus explicit note-version tracking is enough and far smaller. |
| Server | Node `http`, files on disk | Deliberately minimal: the reader must not depend on it. |
| Tests | Vitest + happy-dom + fake-indexeddb; Playwright-core driving Chrome | Unit, integration (real HTTP to real servers in-process) and end-to-end. |

## Module boundaries

```
           ┌──────────────────────────── src/ui (React) ──────────────────────────────┐
           │  screens/*            reader/Reader.tsx ──► reader/engine.ts             │
           │                                            ├─ EPUB/TXT: foliate-js       │
           │                                            └─ PDF: pdf.js + text layer   │
           └───────▲───────────────────────────────────────────────▲─────────────────┘
                   │ useLive(query, tables)                          │
┌──────────────────┴──────────────── src/core (no UI, no React) ─────┴────────────────┐
│ library.ts  import · dedupe · export · restore · search                              │
│ epub.ts txt.ts pdf.ts   parsing + validation        anchor.ts   text anchors          │
│ store.ts  ◄── the only write path: record + clock + op, in one transaction            │
│ db.ts     IndexedDB schema (Dexie)                                                    │
│ sync/engine.ts  peers: relay ◄──► RelayClient (encrypted)      sync/crypto.ts         │
│ leaf/sync.ts    peers: leaf  ◄──► LeafClient (protocol 1 or 2)  leaf/convert.ts       │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ HTTPS (ciphertext only)                         │ HTTP on the LAN
        ▼                                                 ▼
 server/platform.ts  /sync/* relay                 SAGA Leaf firmware / sim/leaf-sim.ts
                     /api/* author, publisher, catalog (demo)
```

Reading, storage, sync and hardware integration are separate modules with one-way
dependencies: the UI depends on core; core never imports UI. The Leaf layer and the relay
are both "peers" of the same sync engine, so adding a peer type (a self-hosted WebDAV
folder, a Kobo export) means writing one adapter.

## Data model

All records are plain JSON (`src/core/types.ts`), so they cross the sync boundary and
export cleanly.

| Record | Key | Notes |
|---|---|---|
| Book | first 16 hex chars of the file's SHA-256 | Same file anywhere has the same id, so importing it on two devices merges instead of duplicating. `fileState` (is the file on *this* device) never replicates. |
| File | SHA-256 | Original bytes, unchanged. |
| Text | (book, section) | Plain text of each section, exactly as the renderer's DOM exposes it; powers search, Home's passage, Leaf mapping. |
| Position | `book:device` | **Each device writes only its own row.** Positions never overwrite each other; the reader decides which to offer. |
| Annotation | random id | Section + character offsets *and* the quoted text with 32 characters of context (W3C TextQuote + TextPosition). CFI cached for fast drawing. |
| Collection, Member | id, `collection:book` | Membership is its own record so concurrent add/remove merge cleanly. |
| Op | auto-increment seq | Replication log of local edits. |
| Peer, Transfer | id | Sync partners and resumable device transfers. Local only. |

### Why positions are one row per device

Kindle's well-known failure mode is a phone overwriting the place you reached on another
device. SAGA keeps every device's place. On open, the reader goes to this device's place
and, if another device is newer and somewhere else, offers "Your SAGA Leaf is further
along: Go there / Stay here". On a device with no place yet it simply continues from the
newest one. Progress is measured in **characters of text** on every device, so a phone, a
laptop and a Leaf reading a converted copy compute the same percentage for the same place.

## Writes, clocks and merging

`store.put(entity, key, fields)` runs one IndexedDB transaction that:

1. stamps each changed field with a **hybrid logical clock** (wall time, counter, device id), which orders correctly even with clock skew and never runs backwards on a device;
2. records the clock each field had *before* the edit (`base`);
3. appends an Op to the replication log.

Remote ops are merged by `store.apply()`:

- **Every field is last-writer-wins by clock.** Applying the same op twice changes nothing, and order doesn't matter.
- **Deletes are soft.** A deleted annotation keeps its content and appears in *Recently deleted*. An annotation edit also asserts "not deleted" with its own clock, so an edit and a concurrent delete resolve identically on every device.
- **Notes never lose text.** Each note write is (clock, text, base). A version is a *head* until a later write is made on top of it. The note shown is the newest head; other non-empty heads are kept as conflicting versions ("Also written on your laptop…") until the user picks one, merges both, or discards. Heads depend only on the set of writes, so every device computes the same list. Resolutions replicate as a set union.

The randomized stress test (3 devices, 30% of requests failing, edits, deletes and
concurrent notes) checks that after reconnection nothing is missing, every device agrees,
and no note version was lost by a causal check over every write. It passes on three seeds
in the test suite and in the benchmark.

## Sync relay and privacy

- On *Turn on sync*, the device makes a random **library code** (`saga-xxxxx-xxxxx-xxxxx`, about 74 bits). HKDF derives three things from it: an AES-256-GCM key, an HMAC key, and the public library id.
- The relay receives only `{library id, device id, ciphertext}` batches and returns them by cursor. Book files are uploaded as encrypted 512 KB chunks under an HMAC of their hash, so the server can't tell which book a file is.
- Uploads are **resumable**: the client asks which chunks exist and sends only the missing ones. Downloads are verified against the SHA-256 before import; a corrupted or tampered file is rejected (AES-GCM authentication fails first).
- Joining another device means entering the code. There is no account, and losing every device and the code means the synced copy can't be decrypted. That is the price of the server knowing nothing. A recovery option with an account is on the roadmap as an opt-in.

## SAGA Leaf integration

See [LEAF_PROTOCOL.md](LEAF_PROTOCOL.md). In short: `LeafClient` speaks firmware 1.0.0's
real HTTP API (verified against its source) and a proposed protocol 2. `leaf/convert.ts`
turns books into the cleaned plain text the firmware reads best, reusing the firmware
project's own converter. `leaf/sync.ts` maps the Leaf's byte offsets to SAGA's text by
**quoting the words at the position**, because offsets in a converted copy never line up.

## Rendering pipeline

- **EPUB**: the original file goes to foliate-js. Styles are injected per theme and typeface; the publisher's fonts are optional. Highlights are drawn with foliate's overlayer from CFIs; if a CFI no longer resolves, the quote is used and the CFI rewritten.
- **TXT**: Gutenberg licences are stripped, chapters detected, then packaged in memory as a minimal EPUB so the same renderer handles it.
- **PDF**: pdf.js renders a canvas plus its text layer. Selection offsets are computed over the text layer in the same form as the stored page text.
- **Page turns** are queued while foliate-js is mid-turn, so a quick second tap isn't dropped, and jumps wait for in-flight turns.

## Performance choices

- Covers and text are separate from book metadata; library screens load metadata only.
- Live queries re-run at most once every 120 ms while changes stream in. This took UI bulk import from 101 to about 58 ms per book.
- Imports write file, cover and text first and the book record last, so a crash leaves only unreferenced rows that `sweepOrphans` removes on next start.

## Future clients, cloud and accounts

- **Desktop**: wrap the built PWA with Tauri. That gives a filesystem for watched folders, native mDNS for Leaf discovery, and no browser CORS or mixed-content limits on the LAN.
- **Android and iOS**: Capacitor shell around the same bundle first; move hot paths (rendering, storage) to native only if measurements demand it. `src/core` has no DOM dependency except DOMParser for EPUB metadata, which exists in WebViews.
- **Cloud sync**: the relay is already an append-only, encrypted op log. Scaling it means a durable store (S3 or Postgres) behind the same three endpoints.
- **Optional accounts**: an account would hold an *encrypted* copy of the library code for recovery and entitlements for catalog purchases. Reading never requires one.
- **Third-party libraries** (OPDS, Calibre content server, Readwise export): new importers and peers against the same `importBytes` and op log.

## Security notes

- Content from books runs in foliate-js's sandboxed iframes; external links ask before opening.
- The platform server is a **demo**: roles come from request headers chosen in the UI, with no authentication. It must not be exposed publicly as is.
- Leaf protocol 1 (firmware 1.0.0) authenticates with a shared device password and leaves GET endpoints open; protocol 2 fixes both. Neither protocol encrypts LAN traffic; see the protocol doc for the proposal.

## Single-file build

`npm run build:standalone` (vite.standalone.config.ts, vite-plugin-singlefile) inlines all
code, styles, the pdf.js worker and four sample books into one HTML file that runs from
`file://`. `VITE_STANDALONE=1` switches three things:

- **Publishing demo in the page.** The author/publisher/catalog logic lives in
  `server/platform-core.ts`, independent of transport and storage. `server/platform.ts`
  serves it over HTTP with files on disk; `src/app/localPlatform.ts` runs the same core
  with IndexedDB, and `platform()` calls it directly.
- **Simulated Leaf in the page.** The device model lives in `sim/leaf-core.ts`. The Node
  simulator (`sim/leaf-sim.ts`) wraps it with HTTP and the SD layout on disk, which the
  protocol tests exercise. `src/app/localLeaf.ts` gives it an IndexedDB "SD card" and
  registers it at `http://saga-leaf.simulated`; `LeafClient` answers that address
  in-process, so pairing, transfer and sync run the same code a real device would.
- **`file://` quirks** (`src/ui/reader/fileUrls.ts`, `src/core/pdf.ts`). On `file://`, Chrome
  treats blob: documents as cross-origin and refuses their blob: sub-resources, and won't
  start module workers from blobs. So book pages load via `srcdoc` with sub-resources as
  data: URLs, and the pdf.js worker runs as a classic worker. Over http(s) none of this applies.
