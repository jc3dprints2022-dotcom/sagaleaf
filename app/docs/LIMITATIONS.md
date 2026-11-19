# What exists, and what doesn't

Status labels:

- **Built and tested**: implemented and covered by automated tests or the e2e journey.
- **Built, lightly tested**: implemented and used in the e2e run, but without dedicated tests.
- **Simulated**: works against the Leaf simulator or demo server only.
- **Planned**: designed but not built.
- **Speculative**: an idea, not committed.

## Reader app

| Capability | Status | Notes |
|---|---|---|
| Import EPUB, PDF, TXT (picker, drag and drop, bulk) | Built and tested | MOBI/AZW3, CBZ, FB2 refused with guidance; foliate-js could add some later |
| DRM detection and refusal | Built and tested | No circumvention, ever |
| Exact duplicates (hash) and probable duplicates (title + author) | Built and tested | Merge keeps highlights by re-anchoring them |
| Metadata extraction and editing; covers; generated covers | Built and tested | No online metadata lookup (privacy); planned as opt-in |
| Collections, sort, filter, metadata search | Built and tested | No series view or shelves by tag yet |
| Full-text search in a book and across the library | Built and tested | Linear scan, ~200 ms at 1,000 books; inverted index planned for 10k+ |
| EPUB reading (pagination, scroll mode, TOC, search, scrubber, keyboard) | Built and tested | Footnote pop-ups not built; fixed-layout EPUB untested |
| Typography: 6 typefaces incl. Atkinson Hyperlegible, OpenDyslexic; size, spacing, margins, line length, justify, hyphenation, publisher styles toggle | Built and tested | No custom font upload |
| Themes: Day, Warm, E-ink, Night, Auto | Built and tested | |
| PDF reading with text-layer highlights | Built, lightly tested | Page view only; no reflow, crop or column splitting |
| Highlights (4 colours), notes, tags, bookmarks | Built and tested | |
| Annotations survive layout, font, device and edition changes | Built and tested | Quote + context + offsets + CFI |
| Recently deleted, restore; conflicting note versions kept until resolved | Built and tested | |
| Export: Markdown, W3C Web Annotation JSON-LD, full library zip; restore from backup | Built and tested | Readwise, Obsidian and Notion connectors planned |
| Offline (PWA, service worker) | Built and tested | Chrome only |
| Reading statistics | Planned | Local only when built |
| Text-to-speech | Planned | The biggest functional gap the research found |
| Intelligent assistance (definitions, recaps, character lists) | Speculative | Must be optional, local-first, never fabricate quotes; see IDEAS.md |
| Library lending (OverDrive/Libby) | Not possible without a partnership | |

## Sync

| Capability | Status | Notes |
|---|---|---|
| Op-log sync with field-level merge, per-device positions, conflict-safe notes, soft deletes | Built and tested | Randomized convergence tests |
| End-to-end encryption, library code, no account | Built and tested | Losing every device and the code means losing the *synced* copy (local copies are unaffected) |
| Encrypted, resumable book file sync with integrity checks | Built and tested | |
| Sync relay service | Simulated (demo server) | Not deployed; no rate limits, quotas or abuse protection |
| Account-based recovery, entitlements | Planned | Opt-in only |
| Self-hosted folder sync (WebDAV, Syncthing) | Planned | Peer adapter |

## SAGA Leaf

| Capability | Status | Notes |
|---|---|---|
| Firmware 1.0.0 protocol (status, books, upload, notes read) | **Simulated** | Matches the source; never run against the device. A real 1.0.0 Leaf will **refuse the web app** (no CORS, see LEAF_PROTOCOL F1) |
| Protocol 2: discovery, code pairing, tokens, resumable verified uploads, position and annotation sync | **Simulated** | Needs firmware work R1–R10 |
| Conversion to Leaf text (reuses the firmware project's converter) | Built and tested | |
| Battery level | Simulated | Needs a hardware change (R8) |
| mDNS discovery | Planned | Browsers can't do it; needs a native shell and firmware R7 |
| Encrypted LAN transport | Planned | R11 |
| BLE pairing and small-payload sync | Speculative | R12 |
| Firmware OTA from the app | Not built | Firmware supports it; deliberately left out of the app until signing exists |

## Publishing ecosystem (prototype)

| Capability | Status | Notes |
|---|---|---|
| Author upload with EPUB validation (structure, metadata, DRM, alt text, accessibility metadata, oversized sections) | Built, lightly tested | Not a replacement for EPUBCheck or Ace by DAISY |
| Editing details, cover replacement, ISBN checksum, submit, withdraw | Built, lightly tested | |
| Publisher review queue, approve or request changes | Built, lightly tested | |
| Demo catalog, acquire, download, open, send to Leaf | Built, lightly tested | **No payments**; a priced book records a test sale |
| Readership and earnings report | **Test data only** | Clearly labelled; "simulate 30 days" generates synthetic events |
| Accounts, auth, roles | Simulated | Role picked by the demo, sent as headers; must not be deployed |
| Payments, tax, payouts, refunds | Not built | Needs a merchant of record and legal review |
| ONIX import/export, territorial rights, pricing by market | Planned | |
| Watermarking (social DRM) | Planned | Offered in the form, not implemented |
| Indie bookstore partnerships, book clubs, reviews, recommendations | Speculative | See RESEARCH.md and BUSINESS_MODEL.md |

## Platforms

Only the web app/PWA exists. Desktop (Tauri) and mobile (Capacitor) shells are planned on
the same codebase. Only Chrome has been tested.

## Discover and accounts

- Discover depends on the free Gutendex service and on Project Gutenberg. If Gutenberg's file
  server doesn't allow the browser to download directly (CORS), SAGA Reader opens the
  download in a new tab and you add the file yourself.
- Tested against stand-ins for Gutendex, Supabase and the supabase-js CDN (the build machine
  has no internet). The request formats follow their documentation; check sign-in and sync
  once on the live site.
- supabase-js loads from a CDN when you start signing in, so sign-in needs that CDN reachable.
  The rest of the app never needs it.
- Sign-in links use PKCE: open the email link in the same browser where you asked for it.
- Account sync carries notes, highlights, bookmarks and positions only. To read a synced
  book on a new device, add the same file there (from Discover or your own copy).
- Losing the library code means synced notes can't be decrypted from the account; the copies
  on your devices are unaffected.

## The single-file build

- Tested in Chrome only. Firefox and Safari handle pages opened from disk differently (Safari
  in particular may limit storage for `file://` pages). Use the hosted or `npm run dev`
  version there until it's checked.
- Your library lives in that browser's storage for that file. Moving or renaming the file,
  or opening it in another browser, starts an empty library. Settings → Export keeps a backup.
- No device-to-device sync without a sync server (see the README).
- The in-page Leaf is a simulator of the proposed protocol-2 firmware. It isn't the hardware.
- To keep the file at about 6 MB, it embeds four sample books rather than five (no Moby-Dick
  or full Sherlock EPUB). Your own books aren't limited.
- PDFs use system fonts for the 14 standard PDF fonts, so rare documents that rely on them
  may render with substitutes.

## Known rough edges

- The platform server stores everything in one JSON file. It's fine for a demo, not for concurrent writes at scale.
- Generated covers rely on CSS container queries (supported in current browsers).
- Large PDFs render one page at a time; no thumbnails.
- In the simulator, "pages" are about 620 characters and don't match the real LVGL layout. Positions are exchanged as quotes, so this doesn't affect correctness.
