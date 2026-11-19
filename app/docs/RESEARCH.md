# Research report: what to build, and why

This is the summary. The evidence lives in:

| File | What it holds |
|---|---|
| `research/reader_findings.json` | 86 reader findings (complaints, requests, loves, unmet needs) across all 20 categories, each with sources, evidence strength, severity, workarounds, proposed solution and complexity |
| `research/ecosystem_findings.json` | 34 findings for authors, publishers, bookstores, education and the marketplace |
| `research/reader_summary.md` | Reader-side narrative with inline citations |
| `research/ecosystem_research.md` | Stakeholder analysis, conflicts, economics, risks (about 4,000 words, cited) |
| `research/reader_matrix.json`, `docs/SAGA-competitive-benchmark.xlsx` | Feature matrix (14 products × 32 features) and weighted scoring |

## Method and its limits

- Two research passes on 2026-11-16/17 using web search and page fetches: about 55 calls for readers, about 75 for the ecosystem. Sources: official docs and help pages, press reviews, Reddit and MobileRead threads, GitHub issues and app-store review summaries.
- Each claim is tagged **verified** (official source or press), **user reports**, or **speculation**.
- **Evidence strength is not prevalence.** Loud online complaints come mostly from enthusiasts. Most Kindle owners never sideload a book, so a high count of sideloading complaints doesn't mean most readers care.
- No competitor app was tested hands-on. Competitor scores are from published evidence only.
- Gaps: Reddit was under-sampled directly (rate limits). Several Apple Books, Kobo and Libby complaints rest on one review-summary site and are marked weak. A few matrix cells come from general product knowledge (flagged in the workbook).
- Four surprising, recent claims were re-checked against primary sources before use:
  - KDP's 70% band now runs to $12.99, effective 2026-07-07 (KDP help).
  - Kindle Unlimited was renamed Kindle+ on 2026-10-22 (multiple outlets).
  - KDP DRM-free books can be downloaded as EPUB/PDF from 2026-01-20 (KDP help).
  - Lemon Squeezy has closed sign-ups and shuts down 2027-03-31 (banner on its pricing page).

## What readers need most (strongest evidence first)

| # | Need | Evidence | What SAGA did |
|---|---|---|---|
| 1 | **Own the files you buy** | R-001 (Kindle USB download removed Feb 2025), R-002, R-005, R-009 Pocket deletions | Originals stored unchanged and downloadable; one-click full library export; nothing depends on a server |
| 2 | **Sync for books that didn't come from the store** | R-010 (Kobo none, Kindle only Send-to-Kindle), R-011, R-013, R-014 | Position, highlights, notes, collections and files sync for any imported book, end-to-end encrypted |
| 3 | **Never lose your place or your notes** | R-057 position jumps, R-049 wiped highlights, R-058 sideloads wiped offline | One position row per device (nothing overwrites another), quote-anchored notes, soft deletes, conflict versions kept. Stress-tested: 0 lost |
| 4 | **No ads, no reading surveillance** | R-028 lockscreen ads, R-003 page-level telemetry, R-004 | No account, no analytics; privacy statement in Settings |
| 5 | **Good typography without a manual** | R-016 love Kobo, R-071 Kindle limits, R-027 KOReader labyrinth, R-017 publisher CSS | Six faces, real controls, publisher-styles toggle, five themes, one settings panel |
| 6 | **Text-to-speech that just works** | R-037, R-038, R-052, R-082 | **Not built yet**: top P1 |
| 7 | **PDFs that work** | R-024, R-025 | Basic page view with highlights; reflow and crop are P2 |
| 8 | **Highlights that go somewhere** | R-031 Readwise love, R-048 clipping limits, R-078 per-book export | Markdown, W3C Web Annotation, full export; no clipping limit on your own files |
| 9 | **A phone-back reader whose software is good** | R-019 love X4 form factor, R-018 X4 stock firmware, R-066 position drift on ESP32 | Leaf syncs by quoting text, not offsets; the protocol is designed within the ESP32's RAM |
| 10 | **Approachable power** | R-026/R-027, R-046/R-047 | Defaults that work; power lives in panels, not menus of menus |

### Things users love that SAGA must not regress

- Whispersync-grade seamlessness (R-012): "go to where your Leaf left off" is SAGA's version.
- Weeks of battery (R-063): a Leaf V2 hardware goal; sleep between page turns is modelled.
- Kobo's openness and typography (R-005, R-016, R-086).
- KOReader's PDF power (R-025).
- Libby's calm, ad-free tone (R-076).
- Apple Books' no-account EPUB import (R-079).
- OpenDyslexic availability (R-053).

### Why people stay, switch, or go "power user"

- **Stay with Kindle:** store size, deals, Kindle+ (formerly KU), Whispersync, cheap reliable hardware, US Libby delivery. Leaving means abandoning a purchased library. That last point is speculation, but it matches the "trapped" framing across reviews.
- **Switch to Kobo:** downloadable books, sideloading, no lockscreen ads, better fonts, OverDrive (decisive outside the US), KOReader and Calibre friendliness.
- **Power tools (KOReader, Calibre, Moon+, Readest):** control, PDFs, privacy, own-storage sync, at the cost of a steep learning curve. **The opening is "open *and* approachable".**

## Other stakeholders: the five most important unmet needs

| Stakeholder | Unmet needs (evidence) | SAGA's angle |
|---|---|---|
| Independent authors | Royalties capped by price bands and exclusivity (E-001, E-004). Slow, opaque pay (E-002, E-003). No reader relationship (E-005). Discovery runs on paid ads (E-006). Direct sales are a pile of tools with stacked fees (E-007, E-008, E-009) | One flat, published take with no delivery fee; opt-in reader email at purchase; one upload that validates like a device would; DRM-free by default |
| Publishers | ONIX 3.x migration (E-013). EAA accessibility from 2025-06-28 (E-015). DRM choices (E-016). Fragmented reporting (E-018). Big-five terms (E-017) | Accessibility checks at upload; ONIX later; LCP only on request. Realistic: indie and small press first |
| Independent bookstores | Ebook partners churn (E-021). Bookshop.org can't deliver to Kindle (E-020). Need a fair share (E-019, E-022) | Partner, don't compete: store-attributed sales share paid from SAGA's take; curated shelves |
| Education | Per-student annotation fees (E-023). Inclusive-access billing (E-024). Analytics privacy (E-025). Locked annotations (E-026) | W3C annotation export already built; private by default; aggregate-only instructor views |
| Readers (market) | Licences tied to one app (E-027). Library holds (E-028) | Portability built; lending needs partnerships |

The full stakeholder analysis, including competitors, workflows, obstacles, willingness to
pay and success measures, is in `research/ecosystem_research.md`.

### Where stakeholders conflict, and SAGA's position

- **Privacy vs analytics.** No individual-level data is sold or shared. Authors get aggregates with minimum cohort sizes. Email only with opt-in at purchase. Education gets aggregates by default.
- **Affordability vs royalties.** A flat 15% take with no delivery fee. A store share (about 10% to start) comes out of SAGA's take on store-attributed sales only. SAGA won't promise authors 85% and stores 30% at once; the arithmetic doesn't work.
- **Portability vs licensing.** DRM-free with watermarking is the default and the identity. LCP is added only if a publisher requires it, labelled honestly, and ownership is never quietly downgraded.

## Benchmarking framework

**Weights** come from the user research (what people cite when they stay, switch or
complain), tilted toward SAGA's ownership-first audience:

| Category | Weight |
|---|---|
| Reading quality | 14 |
| Synchronization | 11 |
| Ease of use | 10 |
| Format compatibility | 9 |
| Privacy & ownership | 9 |
| Offline | 8 |
| Device integration | 8 |
| Library | 7 |
| Annotations | 7 |
| Accessibility | 7 |
| Performance | 5 |
| Cost | 5 |

A mass-market weighting would rank Kindle higher.

| Product | Weighted score (0–10) | Basis |
|---|---|---|
| KOReader | 7.17 | published evidence |
| Moon+ Reader | 6.73 | published evidence |
| Kobo | 6.67 | published evidence |
| Calibre | 6.58 | published evidence |
| Apple Books | 6.54 | published evidence |
| Amazon Kindle | 6.47 | published evidence |
| Readwise Reader | 6.13 | published evidence |
| **SAGA, built and tested** | **6.13** | automated tests in this repo |
| Google Play Books | 5.78 | published evidence |
| Libby | 5.62 | published evidence |
| *SAGA, planned* | *8.26* | *roadmap target, not a result* |

**Honest reading:** today's SAGA prototype is mid-pack overall. It leads on privacy and
ownership (9), annotations (7) and offline (7). It trails on device integration (3: the
Leaf is simulator-only), format compatibility (4) and accessibility (5: no TTS). The
ranking moves only when those gaps close on real hardware and real users, not when
features are added to a list.

## Where SAGA can be best in class

Chosen because evidence is strong, competitors are structurally unlikely to fix it, and
SAGA has already shown it works:

1. **Sync for books you own**, across phone, computer and an e-ink device, encrypted end to end. Kindle and Kobo don't do this for sideloaded books; KOReader does progress only.
2. **Annotations that can't be lost and go anywhere**: anchored to quoted text, conflict-safe, exported in an open standard.
3. **Ownership and privacy as defaults**: no account, no telemetry, originals untouched, one-click export.
4. **A phone-back e-ink companion with good software**: the X4 proved the form factor and exposed the firmware gap.
5. **Approachable typography and accessibility**: Kobo-level control without KOReader-level menus, with dyslexia-friendly and low-vision faces built in.
6. **Fair, legible terms for indie authors**: a flat 15%, no delivery fee, opt-in reader relationship. A credible differentiator once there's an audience.
7. **TTS on owned books** (planned): the clearest unmet functional need.

## Measured goals

All 22 targets in the workbook's *Measured goals* sheet are met on the prototype; details
in [TEST_RESULTS.md](TEST_RESULTS.md). Headlines:

| Goal | Result |
|---|---|
| Import a book | 259 ms |
| Open to text | 668 ms (544 ms for a 215k-word book) |
| Resume after restart | 568 ms |
| Page turn | median 37 ms |
| Leaf sync round trip | 66 ms (simulated, localhost) |
| Data loss under 30% injected network failure | 0 |
| Import success on valid files | 100% of 990 |
| Library at 10,000 books | 95 ms to load, sort and filter |
| axe-core violations | 0 across 11 screens |
| Steps to send what you're reading to the Leaf | 0 |

These are prototype numbers on localhost; real devices and networks will be slower.
