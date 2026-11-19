# Test results

All numbers below come from runs on 2026-11-17 in this repository's environment: Linux,
2 CPUs, Node 22, Chrome via playwright-core, dev server or production preview on
localhost. Raw output is committed next to each suite:

- `tests/results.json`
- `e2e/results.json`
- `e2e/offline-results.json`
- `bench/results.json`
- `bench/browser-results.json`

**What "simulated" means here:** every SAGA Leaf result is against `sim/leaf-sim.ts` on
localhost. No physical Leaf, radio, battery or e-ink panel was involved.

## Summary

| Suite | Result |
|---|---|
| Unit and integration (Vitest) | **56 / 56 passed** |
| End-to-end user journey in Chrome (`e2e/run.ts`) | **26 / 26 steps passed** (author/publisher steps replaced by Discover steps), 0 unexpected console errors |
| Offline behaviour against the production build (`e2e/offline.ts`) | **6 / 6 steps passed** |
| Single-file build opened from `file://` (`e2e/standalone.ts`) | **17 / 17 steps passed**, 0 console errors; network only to Gutendex/Gutenberg on Discover |
| Optional accounts at the web address (`e2e/accounts.ts`) | **14 / 14 steps passed**, 0 console errors |
| Account sync engine (`tests/cloud.test.ts`) | **6 / 6** (part of the 56 unit tests) |
| Accessibility, axe-core WCAG 2.1 A/AA, 11 screens | **0 violations** (first scan found 4 rule types; all fixed) |
| Sync stress, 3 devices, 30% of requests failing | **0 annotations missing, 0 devices disagreeing, 0 of 329 note versions lost** |
| Interrupted Leaf transfer, 12 forced disconnects | **Completed, checksum matches** |
| TypeScript strict typecheck | Clean |

## Coverage against the brief

| Required area | Where it is tested |
|---|---|
| Book import and parsing | `tests/import.test.ts`: EPUB, PDF (13 pages, text layer), Gutenberg TXT (licence stripped, chapters found); DRM, Kindle formats, `.acsm` tickets and broken zips refused with readable messages |
| Metadata extraction | title, author, language, identifiers, subjects, description, cover, series (reading lists not mistaken for series) |
| Library persistence | reopen the database: books, text, device id and settings survive; crash leftovers swept |
| EPUB reading and navigation | e2e: render, keyboard paging, table of contents, in-book search jump, scrubber jump (benchmark), night theme, type size |
| Offline behaviour | `e2e/offline.ts`: relaunch fully offline from the service worker, read, highlight, see "3 changes will sync later", reconnect, second device receives it |
| Annotation storage | e2e highlight + note + tags stored as selected; anchors survive layout change; `tests/anchor.test.ts` re-anchoring after edits, wrong-place protection |
| Synchronization conflicts | `tests/sync.test.ts` + `tests/sync-stress.test.ts`: concurrent notes keep both texts; edit vs delete; per-device positions; idempotency; randomized convergence on 3 seeds; conflict resolution replicates |
| Interrupted transfers | relay upload resumes from the last chunk (only missing chunks sent); corrupted download rejected; Leaf upload resumes after a mid-transfer drop |
| Duplicate detection | same file under another name (hash); same work in another format (title + author); re-import of a deleted book restores it |
| Device simulator communication | `tests/leaf.test.ts`: firmware 1.0.0 endpoints, SD layout, 507 on full storage, discovery, pairing with code, wrong-code and brute-force limits, transfers, positions both ways, highlights both ways, offline device reconnect, battery and storage |

## The end-to-end journey (Chrome, real IndexedDB, persistent profile)

Import → open → read → highlight → **close the app and reopen** → resume → pair and sync
with the simulated Leaf → read on the Leaf → resume in the app → continue.

| Step | Result |
|---|---|
| Import an EPUB through the file picker | 259 ms |
| Import a PDF and a TXT; re-import of an existing file reported as duplicate | pass |
| Open the book | first page on screen 668 ms after tapping Start reading |
| Turn pages with the keyboard | progress moves, position saved |
| Highlight with the selection menu; add a note and tags | stored exactly as selected |
| Night theme and larger type | highlight stays anchored |
| Search inside the book, jump to result | 73 matches, result selected on screen |
| Close the browser, relaunch with the same profile | Home ready in 473 ms, showing the saved sentence |
| Continue reading | the same sentence on screen 568 ms after tapping |
| Discover and pair the simulated Leaf with its on-screen code | pass |
| Book sent automatically because it is being read | 818 ms after pairing |
| Leaf opens at the phone's sentence; 10 pages read and a highlight made on the Leaf | pass |
| Sync back | 66 ms; app offers "SAGA Leaf is further along: Go there"; resumes at the Leaf's place; highlights on both sides |
| Continue reading in the app | pass |
| Notes, library search, collections, settings, backup export (1 MB zip) | pass |
| Author upload, file check, details, ISBN checksum error, submit | pass |
| Publisher approve; book appears in Discover | pass |
| Reader gets the book; it opens; it goes to the Leaf | pass |
| Author report, labelled TEST DATA | pass |
| Phone-size layout; dark appearance | pass |

## The single-file build (`saga-reader.html`, Chrome, from `file://`)

Import of the four embedded books; read and highlight; quit and relaunch with the same
profile, and resume at the saved sentence with the highlight intact; a PDF rendered by its
worker; pairing the in-page Leaf with the code on its screen; the book sent automatically;
the Leaf opens at the reader's position; 8 pages and a highlight on the Leaf; sync; the reader
offers the Leaf's place and lands within 2%; both highlights anchored; author → publisher →
catalog → library; 30 days of TEST DATA in the report. The run also records every request:
none leave the page except discovery probes for a real Leaf at `sagaleaf.local` and
`192.168.4.1`, which fail harmlessly when no device is there.

Screenshots: `screenshots/standalone/`.

## Benchmarks

### Node (fake-indexeddb in memory)

| Measure | Result |
|---|---|
| Import 1,000 generated books (half EPUB, half TXT, 20 planted duplicates, 10 broken) | 970 added, 20 duplicates caught, 10 broken files rejected, 0 unexpected failures; median 4.8 ms per book, p95 13.1 ms, about 137 books/s |
| Passage search across 970 books (5 queries incl. one with no match) | median 208 ms, max 226 ms |
| 10,000-book library: load, sort, filter | median 95 ms |
| 10,000 books: build metadata index / search | 79 ms / 3.9 ms median |
| Sync stress: 3 devices × 60 rounds, 30% injected failure, 164 annotations | 96 sync rounds hit a failure; afterwards 0 missing, 0 disagreeing, 0 of 329 note versions lost |
| Leaf transfer: 1.24 MB converted book, 12 forced drops | completed in 13 attempts, checksum matches |

### Browser (Chrome, real IndexedDB)

| Measure | Result |
|---|---|
| Import 300 books through the file picker | 20.4 s total, 68 ms per book (101 ms before coalescing live queries) |
| Library with 300 books: navigate to tiles | 144 ms |
| Open Moby-Dick (1.4 MB, ~215k words) to text | 544 ms |
| Page turn, keypress to new location | median 37 ms, p95 67 ms, max 90 ms |
| Jump to 85% with the scrubber | 83 ms, lands at 85% |
| JS heap with Moby-Dick open in a 301-book library | 30 MB |

The full target list is the *Measured goals* sheet in `docs/SAGA-competitive-benchmark.xlsx`.
All 22 goals are met on this prototype. The targets were set by me as product goals: about
100 ms for a page turn (the usual threshold for feeling instant), 1 s to text, zero data
loss. They are not benchmarks of competitor apps, none of which were tested hands-on.

## Bugs found by testing and fixed

| Found by | Bug | Fix |
|---|---|---|
| unit tests | TXT chapter headings were duplicated into the text; PDF loader called `destroy` on the wrong object | parser and loader fixed |
| sync tests | "Is the file on this device" replicated, so other devices thought they had the file | device-local fields never replicate |
| Leaf tests | test phrase failed on Standard Ebooks' no-break spaces (anchoring itself was fine) | test corrected |
| e2e | a book sent to the Leaf didn't get its position until the next sync | device state refreshed after transfers |
| e2e | phone and Leaf measured progress differently (file bytes vs characters), which hid "go to Leaf's place" | one character-based measure on every device |
| sync stress | **16 of 164 annotations ended in different states on different devices** (edit vs delete decided from local view) | edits assert "not deleted" with their own clock; plain LWW |
| sync stress | conflict lists differed between devices | note-version heads derived from the set of writes; resolutions replicate as a union |
| browser bench | foliate-js drops page turns for 100 ms after each turn; jumps during a turn were ignored | turns queued; jumps wait |
| browser bench | quadratic re-rendering during bulk import | live queries coalesced |
| axe-core | muted text and links below 4.5:1 contrast; unnamed progress bars; tile names not matching visible text; aria-label on a role-less element | palette darkened to AA, labels fixed |
| standalone e2e | from `file://`, Chrome refuses module workers from blob: URLs; pdf.js hung waiting for its worker | worker source rewritten to run as a classic blob worker |
| standalone e2e | from `file://`, book pages loaded from blob: URLs are cross-origin to the app (no highlights, layout never finished) and their blob: stylesheets and images are refused | on `file://` only, sub-resources become data: URLs and pages load through `srcdoc` |
| visual review | Standard Ebooks reading lists shown as a "series"; mid-word breaks on generated covers; bare roman-numeral chapter labels | fixed |

## Not tested

- Real SAGA Leaf hardware, its firmware, Wi-Fi, battery or e-ink rendering.
- Safari and Firefox. Only Chrome was automated. foliate-js supports both, but SAGA hasn't been checked there.
- Real phones; the phone layout was tested at a 390×844 viewport.
- Screen readers. axe-core covers automated rules only.
- Very large real libraries. Scale tests used generated books.
- Publisher-produced EPUBs with complex layout (fixed layout, MathML, heavy CSS). Samples are Standard Ebooks, which are well formed.
- The sync relay under concurrent load, or as a deployed service.
