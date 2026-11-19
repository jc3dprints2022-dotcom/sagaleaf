# SAGA Reader: competitive and user research summary

*Compiled 2026-11-17. This draws on published sources only; I did no hands-on testing. Detail and URLs are in `reader_findings.json` (86 findings), `reader_matrix.json` and `reader_scores.json`. Each claim below is tagged **[verified]** (official docs or press), **[user reports]** (forums, app reviews, GitHub) or **[speculation]** (my inference). How loud a complaint is online does not tell you how many users it affects. Most Kindle owners never sideload, and most of these complaints come from enthusiasts.*

## Top 10 recurring pain points (ranked by evidence strength)

1. **Ownership erosion on Kindle** [verified]. On 26 Feb 2025 Amazon removed "Download & Transfer via USB" ([Cloudwards](https://www.cloudwards.net/news/amazon-removes-usb-download-transfer-kindle-books), [Libreture](https://libreture.com/blog/amazon-removing-your-ability-download-keep-ebooks/)). The 2026 DRM-free EPUB/PDF downloads only cover titles whose authors opted out of DRM ([TechCrunch](https://techcrunch.com/2025/12/10/amazon-changes-how-copyright-protection-is-applied-to-kindle-directs-self-published-ebooks)).
2. **No sync for sideloaded books** [verified]. Kobo doesn't sync non-Kobo books at all. Kindle syncs them only if they came through Send-to-Kindle ([The eBook Reader](https://blog.the-ebook-reader.com/2024/06/20/nook-ereaders-and-apps-can-sync-sideloaded-ebooks-now/)). On top of that, Kobo had to rebuild its sync for purchased books in 2026 ([The eBook Reader](https://blog.the-ebook-reader.com/2026/09/11/sync-issues-with-kobo-ereaders-and-apps-finally-fixed/)).
3. **TTS is hard to use or missing on e-readers** [verified + user reports]. Kindle TTS needs Bluetooth and VoiceView gestures ([The eBook Reader](https://blog.the-ebook-reader.com/2024/01/22/why-is-text-to-speech-so-difficult-to-use-on-kindles/)). The Assistive Reader came back in 2025, but reportedly works only on purchased books ([The eBook Reader](https://blog.the-ebook-reader.com/2025/08/19/another-kindle-software-update-released-brings-back-tts/)). Users say Kobo has no general TTS.
4. **Ads and store pressure** [verified]. Kindle shows lockscreen ads unless you pay to remove them, including ads for AI-generated books ([BGR](https://bgr.com/2147837/how-to-remove-ads-amazon-kindle/), [Yahoo](https://uk.news.yahoo.com/amazon-kindle-lock-screens-showing-140836783.html)). The Moon+ free tier also shows ads.
5. **Reading telemetry and opaque vendors** [press]. Kindle logs page-level reading behaviour ([Nullsweep](https://nullsweep.com/kindle-collects-a-surprisingly-large-amount-of-data/)). Mozilla rates Boox "very creepy" ([Mozilla](https://foundation.mozilla.org/privacynotincluded/onyx-boox/)).
6. **PDFs on e-ink are poor** [user reports]. MobileRead regulars still recommend tablets for PDFs, or KOReader's reflow ([MobileRead](https://www.mobileread.com/forums/showthread.php?p=4523506)).
7. **Losing local data** [user reports]. Kindles have deleted sideloaded books after leaving airplane mode ([The eBook Reader](https://blog.the-ebook-reader.com/2024/02/01/beware-of-airplane-mode-on-kindles-if-you-sideload-books/)). Apple Books users report wiped PDF highlights ([Apple Community](https://discussions-jp-prz.apple.com/thread/256149383)). Pocket deleted users' saves when it shut down ([Kobo Help](https://help.kobo.com/hc/en-us/articles/360017763753)).
8. **Weak typography and navigation on Kindle** [user reports]. Users cite three margin settings, fixed tap zones, footnote pop-ups that show one paragraph, and accidental page turns ([The eBook Reader](https://blog.the-ebook-reader.com/2023/11/30/what-are-some-things-you-dont-like-about-kindles/)).
9. **Power tools are hard to learn** [user reports]. People call KOReader's settings "labyrinthine" ([LWN](https://lwn.net/Articles/891494)), and Calibre's UI has long been called dated.
10. **Tiny phone-back readers have rough firmware** [press]. The Xteink X4's stock software forces justified text, gives no margin control, breaks italics, doesn't mount over USB and has no front light. Reviewers say the open CrossPoint firmware is what rescues it ([Digital Trends](https://www.digitaltrends.com/phones/xteink-x4-review/), [Aftermath](https://aftermath.site/xteink-x4-cheap-hackable-ereader-crosspoint-review/)). Position sync on ESP32-class hardware drifts by 2–3 pages and has crashed on large books ([CrossPoint #61](https://github.com/crosspoint-reader/crosspoint-reader/discussions/61)).

## What users love: SAGA must not regress on these

- **Whispersync-grade seamlessness.** This is the feature people name when they explain staying on Kindle ([Android Authority](https://www.androidauthority.com/kindle-feature-stopping-me-switching-3591123)).
- **Battery life measured in weeks**, along with the Kindle store and Kindle Unlimited ([SlashGear](https://www.slashgear.com/2299893/things-kindle-owners-say-love-most/)).
- **Kobo's openness**: typography control, OverDrive, working with Calibre, and running KOReader without a jailbreak ([Laptop Mag](https://www.laptopmag.com/news/amazon-kindle-vs-kobo-clara-bw), [The eBook Reader](https://blog.the-ebook-reader.com/2025/01/08/kindle-kobo-is-the-best-combination-why-take-sides)).
- **KOReader's PDF and typography power**, and **Readwise's highlight pipeline** into Obsidian and Notion ([Asian Efficiency](https://www.asianefficiency.com/productivity/readwise-reader-review/)).
- **Libby's calm, ad-free tone** and **Apple Books' frictionless EPUB import** ([Unstar summary](https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026)).
- **Phone-back form factor**: about $69, roughly 77 g, magnetic, with around two weeks of battery. This validates the SAGA Leaf concept ([Boing Boing](https://boingboing.net/2026/02/23/xteinks-x4-a-69-e-ink-reader-that-magsafes-to-your-wallet.html)).
- **Accessibility baseline**: Kindle has shipped OpenDyslexic since 2016 ([About Amazon](https://aboutamazon.com/news/devices/new-accessibility-features-for-kindle-e-readers)), and Thorium is the reference for screen-reader support ([DAISY](https://daisy.org/news-events/news/thorium-1-8-0-new-improvements-for-accessibility/)).

## Why people stay, switch, or go "power user"

- **Stay with Kindle** [press]: store size, deals and KU; Whispersync across devices and Audible; cheap, reliable hardware with fast delivery; and in the US, Libby delivery to Kindle. Disliking Amazon matters less than losing a library you've already bought. That last point is my **[speculation]**, but it matches the "trapped" framing used across reviews.
- **Switch to Kobo** [press]: being able to download and sideload books, no lockscreen ads, better fonts, OverDrive built in (decisive outside the US), and Calibre/KOReader support. The 2025 USB removal was a big trigger.
- **Pick power tools** (KOReader, Calibre, Moon+, Readest): full control, PDFs, privacy, and syncing to storage they own. They accept a steep learning curve, which leaves an opening for a reader that is **open and approachable at the same time** [speculation].

## Suggested benchmark weighting (sums to 100)

| Category | % | Justification |
|---|---|---|
| Reading quality | 14 | Typography and layout drive most love/hate across Kobo, KOReader and Kindle reviews. |
| Synchronization | 11 | Whispersync is the top reason people stay; missing sideload sync is the top unmet need. |
| Ease of use | 10 | Complaints about KOReader and Calibre complexity show power alone doesn't win. |
| Format compatibility | 9 | Send-to-Kindle conversion and EPUB errors come up constantly; PocketBook's format breadth gets praised. |
| Privacy & ownership | 9 | USB removal, telemetry, Pocket deletion; this is SAGA's core differentiator. |
| Offline functionality | 8 | Sideload-deletion and captive-portal stories; cloud-first readers need pre-caching. |
| Device integration | 8 | Kobo/Calibre openness and Kindle hardware are major reasons people choose; Leaf depends on it. |
| Library management | 7 | Series/sort gaps on Kindle; Calibre is loved for exactly this. |
| Annotation quality | 7 | Clipping limits, awkward per-book export, lost highlights; Readwise is loved. |
| Accessibility | 7 | TTS gaps and NFB criticism; the affected audience is high-impact even if it's smaller. |
| Performance | 5 | Firmware lag and slow PDFs come up, but less often than the above. |
| Cost | 5 | Readwise's price and ad tiers draw complaints, but most readers are free or buy hardware once. |

Product scores (0–10) are in `reader_scores.json`, built from **published evidence only**. Weighted totals using these weights: KOReader 7.2, Moon+ 6.7, Kobo 6.7, Calibre 6.6, Apple Books 6.5, Kindle 6.5, Readwise 6.1, Play Books 5.8, Libby 5.6. These weights reflect SAGA's ownership-focused priorities, not mass-market preference. A mainstream weighting would rank Kindle much higher.

## Caveats

- Matrix cells marked "unknown" are unverified.
- A few cells (for example platform availability, Calibre's full-text search and Apple Books' scroll mode) come from general product knowledge rather than a fetched source. Spot-check them before publishing.
- Several user-report findings rest on a single source and are marked `weak`.
