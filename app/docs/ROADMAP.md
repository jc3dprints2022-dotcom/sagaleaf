# Roadmap to a public release

Ordered by what most reduces the risk that a real reader wouldn't choose SAGA every day.
Each milestone ends with a measurable exit test.

## M1: Prove the Leaf on hardware (highest risk)

Everything Leaf-related is simulator-tested only.

1. Firmware R1 (CORS + Private Network Access) and R2 (`hello`, `state`) on the V1 board. Run SAGA's protocol tests against the real device: parametrize `tests/leaf.test.ts` (today it boots the simulator) to take a device URL.
2. R9 (sha256 and sagaId in metadata), R6 (resumable uploads), R4 (progress with snippet search, streaming chapter by chapter within RAM).
3. R3 pairing screen, R5 annotations, R10 auth on reads.
4. Measure on hardware: transfer speed over hotspot and home Wi-Fi, sync round trip including Wi-Fi bring-up, battery cost per sync, heap headroom during snippet search.

**Exit:** the e2e journey passes against a physical Leaf, with real timings recorded in TEST_RESULTS.md.

## M2: Native shells and browsers

1. Tauri desktop build (macOS, Windows, Linux): watched folders, mDNS discovery, LAN access without browser limits.
2. Capacitor Android and iOS builds; background sync; share-sheet import.
3. Safari and Firefox runs of the e2e suite; fix what breaks.

**Exit:** e2e passes on Chrome, Safari, Firefox, the Android app and the iOS app.

## M3: Accessibility and read-aloud

1. Screen-reader audit of the library and reader (VoiceOver, NVDA, TalkBack) with blind and low-vision testers; fix findings.
2. TTS with sentence highlighting using platform voices; continue across sections; works offline.
3. Footnote pop-ups with back navigation.

**Exit:** a tester using a screen reader can import, open, read, highlight and export without sighted help. WCAG 2.2 AA audit by an external reviewer.

## M4: Production sync

1. Durable relay (object storage + small metadata DB), quotas, rate limits, abuse protection, monitoring, a self-hostable container.
2. Optional account for encrypted recovery of the library code.
3. Inverted full-text index for 10k+ book libraries.

**Exit:** a 30-day beta with real users and zero reported data loss; sync p95 under 2 s on real networks.

## M5: Public beta

1. Choose and apply a licence (open-source core is consistent with the ownership pitch; decide before outside contributions).
2. Privacy policy, terms, support channel, crash reporting that is opt-in and contains no book content.
3. Usability study with 10–15 readers across casual and heavy reading: time to first page, finding a passage, recovering from a mistake.

**Exit:** most study participants complete the core journey unaided, and the gaps they hit are fixed.

## M6: Leaf V2 hardware integration

- Port firmware to the V2 board (ESP32-C3, 3.97" e-ink), add the battery-sense line (R8), and implement sleep between page turns.
- Encrypted LAN transport (R11); evaluate BLE (R12).

**Exit:** measured battery life and sync reliability on V2 prototypes.

## M7: Publishing, carefully

Only after the reader has an audience.

1. Real accounts and roles; a merchant of record; tax; payouts; refunds; legal review.
2. Watermarking; ARC distribution; opt-in reader email.
3. A pilot with 20–50 indie authors; one partner bookstore.

**Exit:** the first real sales are paid out correctly; authors can reconcile every cent from the reports.

## Later (P2)

PDF reflow and cropping, OPDS and Calibre, DRM-free MOBI/FB2/CBZ, local reading stats,
Readwise/Obsidian/Notion connectors, course packs, gated on-device assistant features (see
IDEAS.md), ONIX.
