# Product requirements and priorities

Priority:

- **P0**: needed for a credible first public release.
- **P1**: needed to beat the incumbents on the axes the research weights most.
- **P2**: valuable later.

Evidence IDs refer to `research/reader_findings.json` (R-) and
`research/ecosystem_findings.json` (E-). Status uses the labels in
[LIMITATIONS.md](LIMITATIONS.md).

## Principles

1. **Open a book and read.** Nothing advanced may get in the way of that (R-027, R-047).
2. **Your files, your notes, your device.** Nothing is lost, locked or reported (R-001, R-003, R-009, R-049).
3. **Every claim is measured.** A feature isn't done until it's tested; the Leaf isn't "integrated" until it runs on hardware.

## Reader

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| RD-1 | Import DRM-free EPUB, PDF, TXT by picker, drag and drop and bulk; refuse DRM and unsupported formats with guidance | P0 | R-043, R-044, R-068 | Built and tested |
| RD-2 | Dedupe by content; detect probable duplicates; merge without losing highlights | P0 | R-067 | Built and tested |
| RD-3 | EPUB reading with pagination and scroll, TOC, scrubber, keyboard, tap zones | P0 | R-055, R-056 | Built and tested |
| RD-4 | Typography: faces incl. low-vision and dyslexia, size, spacing, margins, line length, justify, hyphenation, publisher styles toggle; Day/Warm/E-ink/Night/Auto | P0 | R-016, R-017, R-071, R-053 | Built and tested |
| RD-5 | Highlights, notes, tags, bookmarks anchored by quote; survive layout and edition changes | P0 | R-048, R-049 | Built and tested |
| RD-6 | Search in book and across the library, offline | P0 | R-067 | Built and tested |
| RD-7 | Works fully offline; installable | P0 | R-058, R-059, R-060 | Built and tested (Chrome) |
| RD-8 | Export everything: originals, Markdown, W3C Web Annotation; restore | P0 | R-001, R-009, E-026 | Built and tested |
| RD-9 | Footnote pop-ups with back navigation | P1 | R-055 | Planned |
| RD-10 | Text-to-speech for any owned book, with sentence highlighting; system voices first, optional higher-quality voices | P1 | R-037, R-038, R-052, R-082 | Planned |
| RD-11 | Safari and Firefox support verified; native desktop and mobile shells | P0 | — | Planned |
| RD-12 | Screen-reader audit of the reading view (VoiceOver, NVDA, TalkBack) | P0 | R-040, R-041 | Planned |
| RD-13 | PDF: reflow, margin crop, column splitting, thumbnails | P2 | R-024, R-025 | Planned |
| RD-14 | Highlight connectors: Readwise, Obsidian, Notion | P1 | R-031 | Planned |
| RD-15 | Local-only reading statistics and streaks (opt-in) | P2 | R-051, R-064, R-065 | Planned |
| RD-16 | MOBI (DRM-free), FB2, CBZ via foliate-js | P2 | R-081 | Planned |
| RD-17 | OPDS catalogs and Calibre content server | P2 | R-032, R-046 | Planned |
| RD-18 | Custom font upload | P2 | R-070 | Planned |

## Sync

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| SY-1 | Position, highlights, notes, collections and metadata sync for any imported book | P0 | R-010, R-011, R-013 | Built and tested |
| SY-2 | No device's position overwrites another's; offer the newer place | P0 | R-057, R-012 | Built and tested |
| SY-3 | Concurrent edits never silently discard text; deletes are soft | P0 | brief | Built and tested |
| SY-4 | End-to-end encryption, no account required | P0 | R-003, R-069 | Built and tested |
| SY-5 | Resumable, verified file sync, opt-in | P0 | — | Built and tested |
| SY-6 | Production relay: durable storage, quotas, rate limits, monitoring, self-hostable image | P0 | R-069 | Planned |
| SY-7 | Optional account for code recovery (encrypted escrow) and purchases | P1 | — | Planned |
| SY-8 | Own-storage sync adapters (WebDAV, Syncthing folder) | P2 | R-054 | Planned |

## SAGA Leaf

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| LF-1 | Firmware CORS + Private Network Access headers (R1) | P0 | LEAF_PROTOCOL F1 | Firmware change needed |
| LF-2 | Pairing by on-screen code, per-app tokens, revoke (R3) | P0 | F4, F5 | Simulated |
| LF-3 | Auto-send what you're reading; resumable, verified transfers (R6, R9) | P0 | R-007, R-045 | Simulated |
| LF-4 | Position sync by quoted text, never overwriting the device (R4) | P0 | R-066 | Simulated |
| LF-5 | Two-way highlights (R5) | P1 | R-048 | Simulated |
| LF-6 | Battery sense line in V2 hardware (R8) | P1 | R-063 | Hardware change |
| LF-7 | Encrypted LAN transport (R11) | P1 | F9 | Planned |
| LF-8 | Native-shell mDNS discovery (R7) | P1 | — | Planned |
| LF-9 | BLE for pairing and small syncs (R12) | P2 | R-021, F10 | Speculative |

## Publishing (after the reader ships)

| ID | Requirement | Priority | Evidence | Status |
|---|---|---|---|---|
| PB-1 | Author upload with device-grade validation and accessibility checks (EAA) | P1 | E-015 | Built (prototype) |
| PB-2 | Metadata, cover, price, licence; submit; review; publish | P1 | — | Built (prototype) |
| PB-3 | Flat published take, no delivery fee; transparent daily reporting | P1 | E-001, E-002, E-012 | Built with test data |
| PB-4 | Real accounts, payments through a merchant of record, tax, payouts, refunds | P1 | E-032, E-033 | Not built; needs legal and finance work |
| PB-5 | Opt-in reader email at purchase | P1 | E-005 | Planned |
| PB-6 | Watermarking; LCP only on publisher request | P2 | E-011, E-016 | Planned |
| PB-7 | ONIX 3.x import and export | P2 | E-013 | Planned |
| PB-8 | Bookstore attribution and revenue share | P2 | E-019, E-021 | Speculative |
| PB-9 | Education: course reading lists, private annotation, aggregate-only instructor view | P2 | E-023, E-025 | Speculative |

## Explicit non-goals

- DRM circumvention, now or later.
- Ads, reading telemetry, selling data.
- An all-you-can-read subscription competing with Kindle+ (E-003). There's no catalogue to support it and it conflicts with author pay.
- Trade (big-five) catalogue before publisher agreements exist (E-017).
