# SAGA Leaf communication protocol

This document covers three things:

- what firmware 1.0.0 actually exposes, read from its source (`saga-leaf-firmware/saga-leaf/src/saga/net/web_server.cpp`, Nov 2026);
- the problems that creates for SAGA Reader;
- **protocol 2**, the extension SAGA Reader implements.

Protocol 2 has been implemented and tested **only against `sim/leaf-sim.ts`**. Nothing in
this document has run against the physical Leaf.

## 1. Firmware 1.0.0, as built

Transport: HTTP/1.1 on port 80. Wi-Fi is off while reading and turned on from Settings.
The device is reachable in two ways:

- **Hotspot**: SSID `SagaLeaf` at `192.168.4.1`, default password `sagaleaf1`.
- **Home network**: credentials come from the device UI or `wifi.txt` on the card. The firmware comments mention `sagaleaf.local` via mDNS, but I found no mDNS start call in the sources reviewed.

Auth: `Authorization: Bearer <device password>` on mutating endpoints only.

| Method | Path | Auth | Response / behaviour |
|---|---|---|---|
| GET | `/api/status` | no | `{connected, mode, ssid, ip, storageType, product:"Saga Leaf", firmware:"1.0.0", battery:{available:false,percent:null,state:"unknown"}, storage:{capacityBytes, usedBytes, bookCount}}` |
| GET | `/api/books` | **no** | `{books:[{id, title, author, mediaType, format, file, sizeBytes, addedAt, lastReadAt, progress, hasCover, schema}]}` |
| GET | `/api/notes` | **no** | `{notes:[{bookId, text, note, location}]}`. No ids, no offsets. |
| GET | `/api/notes/export?format=md\|txt` | yes | Markdown or text download |
| GET | `/api/auth/check` | yes | 200 or 401 |
| POST | `/api/upload?filename=&title=&author=` | yes | multipart, `.txt` or `.epub` only; streamed to `/saga/imports`, moved into `/saga/books/<id>/`; 201 `{ok,id}`; **507** with real free space when the budget would be exceeded |
| PUT | `/api/books/<id>` | yes | rename `{title, author}` |
| DELETE | `/api/books/<id>` | yes | removes the book, its annotations and its progress |
| POST | `/api/firmware` | yes | OTA image, validated, then reboot |
| GET | `/*` | no | static web UI from `/saga/web` |

On-card layout (reproduced exactly by the simulator):

```
/saga/books/<16-hex id>/original.(txt|epub), metadata.json
/saga/progress/<id>.json        {"chapter":N,"offset":bytes,"progress":0..1}
/saga/annotations/<id>.json     [{id,kind,chapter,start,end,selected,note,location,createdAt}]
/saga/imports/                  upload staging (atomic rename)
```

The device splits text into chapters of about 16 KB. Position is (chapter, **byte** offset
within that chapter). There is no real-time clock: `createdAt` is 0 or boot-relative.

### What this means for SAGA Reader

| # | Finding | Effect | Severity |
|---|---|---|---|
| F1 | **No CORS headers** | A browser app served from anywhere other than the Leaf itself is blocked from calling it. SAGA's web app can't talk to a real 1.0.0 Leaf. A native shell (Tauri or Capacitor) can. | Blocker for the web client |
| F2 | No progress endpoint | Reading position can't sync. `/saga/progress` exists on the card but isn't served. | High |
| F3 | Notes are read-only and have no ids | One-way import only (SAGA dedupes by content hash). App highlights can't reach the device. | High |
| F4 | GET endpoints unauthenticated | Anyone on the hotspot can list books and read notes. | Medium (privacy) |
| F5 | Shared password, default `sagaleaf1` | No per-app pairing or revocation. | Medium |
| F6 | Single-shot multipart upload | An interrupted transfer restarts from zero. No checksum, so silent corruption isn't detected. | Medium |
| F7 | No battery sense line (GPIO34 is not VBAT) | No battery level. Hardware change. | Low |
| F8 | No book identity beyond title | SAGA must match books by title and author. Renaming on either side breaks the link. | Medium |
| F9 | Plain HTTP | LAN traffic, including the password, is cleartext. | Medium |
| F10 | Hotspot-only setups drop the phone's internet | Phone OSes may abandon the network (noted in the firmware's own comments). | UX |

SAGA Reader supports 1.0.0 as far as these allow. It sends books (as cleaned text, exactly
like the firmware's own web UI), imports notes one way, and shows storage. The Devices
screen lists what works and what doesn't for each Leaf.

## 2. Protocol 2 (proposed)

Design rules:

- **Backward compatible.** Every protocol 1 endpoint stays.
- **Small enough for the ESP32** (320 KB RAM, no PSRAM, about 18 KB contiguous heap with Wi-Fi up). No JSON over 8 KB in one go, streaming uploads, nothing that needs a clock.
- **Positions and highlights are exchanged as quoted text plus a fraction, never as raw offsets**, because the Leaf's converted text and the app's text differ in whitespace and front matter. The quote makes mapping exact; the fraction breaks ties.

### 2.1 Discovery

- `GET /api/v2/hello` (no auth) → `{protocol:2, deviceId, name, product, model, firmware, capabilities:[...], paired:boolean}`. Clients fall back to `/api/status` on 404 to detect protocol 1.
- Firmware SHOULD advertise `_saga-leaf._tcp` over mDNS with TXT `id=<deviceId>,proto=2` (R7). Browsers can't use mDNS; the web client probes saved addresses, `sagaleaf.local` and `192.168.4.1`, and accepts a typed address.

### 2.2 Pairing

1. `POST /api/v2/pair/start {clientId, clientName}` → `{pairingId, expiresIn:120}`. The Leaf **shows a 6-digit code on its screen**.
2. `POST /api/v2/pair/confirm {pairingId, code}` → `{token, deviceId, name}`. The token is 24 random bytes, base64url, and the device stores it per client in NVS. Wrong code returns 403; after 5 failures the attempt is cancelled (429); an expired attempt returns 410.
3. `DELETE /api/v2/pair/<clientId>` revokes a client.

All v2 endpoints and all mutating v1 endpoints require `Authorization: Bearer <token>`.
The device password keeps working for v1 clients. Proposed hardening (R10): GET
`/api/books` and `/api/notes` require auth once at least one client is paired.

### 2.3 State in one round trip

`GET /api/v2/state` → `{deviceId, counter, storage, battery, books:[{id, title, author, sizeBytes, sha256, sagaId, progressRev, annotationRev}]}`

`progressRev` and `annotationRev` are per-book counters that go up on every local change.
A client compares them with what it last saw and fetches only what changed. `counter` is
the device's monotonic "reading clock", which stands in for the missing RTC.

### 2.4 Reading position

- `GET /api/books/<id>/progress` → `{chapter, offset, progress, fraction, rev, snippet}`. `snippet` is the first 12 words on the current page, computed from the device's text.
- `PUT /api/books/<id>/progress {snippet, fraction, baseRev, from}`. The device places the position by finding `snippet` in its own text (nearest match to `fraction`), falling back to `fraction` alone. **If `baseRev` ≠ the current `rev`, it answers 409** with the current position: someone turned a page on the Leaf since the client last looked, and the device's place wins until the user chooses.

Client rules, implemented in `src/core/leaf/sync.ts`:

- The Leaf moved since the last sync → record its place as the Leaf's own position row in SAGA. The app offers to jump there and never overwrites the Leaf.
- The Leaf did not move and another device has a newer place → push it with `baseRev`.
- Both moved → push nothing. Both places are kept and the reader offers the choice.

### 2.5 Annotations

- `GET /api/books/<id>/annotations?since=<rev>` → `{rev, annotations:[{id, sagaId?, kind, chapter, start, end, selected, note, location, rev, deleted?}]}`
- `POST /api/books/<id>/annotations {annotations:[{sagaId, kind, exact, note, deleted?, fraction?}]}`. The device upserts by `sagaId`, locates `exact` in its text to get its own offsets, and bumps `rev`. Deletions are soft: `deleted:true`, and the record is kept.

The client imports Leaf-made highlights by quoting `selected` into its own text
(`findQuote`). If the passage can't be found, the highlight is kept and marked "not found
in this edition", never dropped.

### 2.6 Resumable, verified uploads

1. `POST /api/v2/uploads {filename, size, sha256, title, author, sagaId}`:
   - `{uploadId:null, existing:<bookId>}` if a book with that hash is already on the device;
   - `{uploadId, received}` to resume an unfinished upload of the same hash;
   - 201 `{uploadId, received:0}` for a new one;
   - **507** if it won't fit, with the free space in the message.
2. `PUT /api/v2/uploads/<uploadId>?offset=<n>` with a raw chunk (64 KB from SAGA). A 409 `{received}` answer means the client re-syncs its offset.
3. `POST /api/v2/uploads/<uploadId>/commit`. The device checks SHA-256 and moves the file into the library with `sha256` and `sagaId` in `metadata.json`, or answers 422 and discards the file if the checksum fails.

Staging survives reboots (`/saga/imports/<uploadId>.part` + `.json`). The simulator test
drops the connection mid-upload 12 times; the transfer completes and the checksum matches.

### 2.7 Battery and storage

`battery: {available:true, percent, state}` only when the hardware can measure it (R8).

### 2.8 Errors

JSON `{error:"<human sentence>"}` on every failure, as in 1.0.0. SAGA shows the sentence.

## 3. Firmware requirements (to make protocol 2 real)

| ID | Requirement | Why | Effort estimate |
|---|---|---|---|
| R1 | Send `Access-Control-Allow-Origin` (allow-list or `*`), `Allow-Headers: authorization, content-type`, answer `OPTIONS`, and `Access-Control-Allow-Private-Network: true` | Lets a browser app reach the Leaf (F1). Chrome's Private Network Access needs the last header for public-origin to LAN requests. | S |
| R2 | `/api/v2/hello` and `/api/v2/state` | Discovery and change detection. | S |
| R3 | Pairing: on-screen 6-digit code, per-client tokens in NVS, revoke, attempt limit | Replaces the shared password (F5). Needs a small LVGL screen. | M |
| R4 | Progress GET/PUT with `rev`, `snippet` and snippet search in the device's own text | Position sync (F2). Search must stream chapter by chapter to fit RAM. | M |
| R5 | Annotation GET/POST with `sagaId`, `rev`, soft delete; extend `notes::Annotation` with `rev`, `sagaId`, `deleted` | Two-way highlights (F3). | M |
| R6 | Resumable uploads with SHA-256 (mbedTLS is already in ESP-IDF) | Interrupted transfers, integrity (F6). | M |
| R7 | mDNS advertisement `_saga-leaf._tcp` | Discovery for native clients. | S |
| R8 | Battery sense: two-resistor divider from VBAT to a free ADC pin (see HARDWARE.md); report percent and charging state | Battery level (F7). **Hardware change**, so design it into V2. | S (HW) |
| R9 | Store `sha256` and `sagaId` in `metadata.json` (schema 2, tolerant reader) | Stable identity (F8). | S |
| R10 | Require auth on GET `/api/books` and `/api/notes` once paired | Privacy (F4). | S |
| R11 | Encrypt LAN traffic. Option A: HTTPS with a per-device self-signed certificate whose fingerprint is shown during pairing and pinned by the app. Option B: encrypt payloads with a key from pairing (Noise-style handshake). | Cleartext on shared Wi-Fi (F9). B is likely cheaper on ESP32-C3 RAM; prototype both. | L |
| R12 | Optional: BLE GATT service for pairing and small payloads (position, notes), Wi-Fi only for book files | Phone-back use without joining a hotspot (F10), and lower power than Wi-Fi for frequent syncs. | L |

V2 hardware (ESP32-C3, 3.97" e-ink, per `saga-leaf-v2/`) changes the RAM picture
(400 KB SRAM, no PSRAM). The protocol was kept within those limits deliberately.

## 4. How SAGA Reader maps positions

1. The app converts the book to text with the same code the firmware's web UI uses (`src/vendor/leaf-epub-convert.js`) and uploads that text.
2. The Leaf chapterizes it itself, so its offsets are its own.
3. The Leaf reports 12 words + a fraction. SAGA finds those words in its own section texts (whitespace and quote-insensitive), picking the occurrence nearest the fraction, and stores section + offset + a fraction computed in characters.
4. SAGA sends the Leaf 12 words + fraction from its own position. The Leaf does the same search in its text.

Tested against real book text (Pride and Prejudice). Phone to Leaf: the Leaf's first page
starts at the phone's sentence. Leaf to phone: SAGA's position text starts with the Leaf's
snippet. Highlights made on either side land on the same passage.

## 5. Simulator

`sim/leaf-sim.ts` runs two devices by default:

- `:8790`: protocol 2, CORS on, battery 82%.
- `:8792`: firmware 1.0.0 behaviour. CORS is turned on there only so the web app can demo it; the class default for protocol 1 matches the real firmware, with no CORS.

Each device keeps the firmware's SD layout under `sim/.leaf-data/`, paginates its text at
about 620 characters per 240×320 page, and serves a screen at `/device` with Back, Prev,
Next and Highlight buttons.

Control API for tests (`/sim/*`): `screen`, `open`, `back`, `turn {pages}`,
`highlight {note}`, `faults {offline, latencyMs, dropUploadAfterBytes, failNextRequests}`,
`battery {percent}`, `state`.

Not modelled:

- radio range, sleep and wake latency, or Wi-Fi bring-up time;
- heap limits (real uploads and searches must stream);
- touch input;
- the exact LVGL pagination, so page boundaries differ from the device. Positions survive this because they are exchanged as quotes.
