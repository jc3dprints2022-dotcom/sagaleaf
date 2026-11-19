import json

def S(t, u):
    return {"title": t, "url": u}

F = []
def add(cat, typ, problem, comps, sources, strength, kind, persist, sev, work, sol, cx):
    F.append({"id": "R-%03d" % (len(F) + 1), "category": cat, "type": typ, "problem": problem,
              "competitors": comps, "sources": sources, "evidence_strength": strength,
              "evidence_kind": kind, "persistence": persist, "severity": sev,
              "workarounds": work, "saga_solution": sol, "complexity": cx})

# ---------------- Preservation & portability / Privacy & ownership ----------------
add("Preservation & portability", "complaint",
    "Amazon removed the web 'Download & Transfer via USB' option on 26 Feb 2025, so buyers can no longer pull a local backup copy of purchased books from the website. It hit a minority of owners directly, but it made the 'you own a license, not a book' issue visible to everyone.",
    ["Amazon Kindle"],
    [S("Cloudwards: Amazon removes USB download & transfer", "https://www.cloudwards.net/news/amazon-removes-usb-download-transfer-kindle-books"),
     S("AlternativeTo news: removal by Feb 2025", "https://alternativeto.net/news/2025/2/amazon-will-remove-the-option-to-download-transfer-kindle-e-books-via-usb-by-february-2025"),
     S("Libreture: Amazon removing your ability to download and keep ebooks", "https://libreture.com/blog/amazon-removing-your-ability-download-keep-ebooks/"),
     S("Rossmann Group wiki entry", "https://wiki.rossmanngroup.com/wiki/Amazon_Kindle_removes_download_feature_of_purchased_books")],
    "strong", "press/review", "recent", "high",
    "Send to a Kindle over Wi-Fi, then copy KFX files off by USB; buy from DRM-free stores instead.",
    "Every imported file stays a plain file the user can see in the OS file manager; a one-tap 'Export library' writes originals + annotations + metadata to a folder or zip, with no account needed.",
    "M")

add("Preservation & portability", "request",
    "Amazon now lets KDP authors who sell DRM-free let buyers download EPUB/PDF copies (announced Dec 2025, from Jan 2026). Readers welcomed it, but it only covers the titles where the author opted out of DRM, so most of a typical Kindle library is unaffected.",
    ["Amazon Kindle"],
    [S("The eBook Reader: DRM-free Kindle ebooks downloadable as EPUB/PDF", "https://blog.the-ebook-reader.com/2025/12/11/drm-free-kindle-ebooks-will-be-downloadable-in-epub-and-pdf-formats-soon/"),
     S("TechCrunch: Amazon changes how DRM applies to KDP ebooks", "https://techcrunch.com/2025/12/10/amazon-changes-how-copyright-protection-is-applied-to-kindle-directs-self-published-ebooks"),
     S("The Bookseller: download of some e-books from 2026", "https://www.thebookseller.com/news/amazon-to-enable-download-of-some-e-books-across-range-of-devices-from-2026")],
    "strong", "press/review", "recent", "medium",
    "Check each title's DRM status; download eligible EPUBs manually.",
    "Make SAGA the obvious destination for these newly downloadable DRM-free EPUB/PDFs: share-sheet import from Amazon's download page, dedupe against existing copies, keep the original file untouched.",
    "S")

add("Privacy & ownership", "complaint",
    "Independent traffic analysis found the Kindle app reports very fine-grained reading behaviour (page timestamps, character positions, taps, settings changes) and queues it while offline for later upload. Most readers never look, but privacy-minded users cite it as a reason to leave.",
    ["Amazon Kindle"],
    [S("Nullsweep: Kindle collects a surprisingly large amount of data", "https://nullsweep.com/kindle-collects-a-surprisingly-large-amount-of-data/"),
     S("Reclaim The Net: On Kindle, Amazon tracks your every tap", "https://reclaimthenet.org/kindle-amazon-tracks-each-tap"),
     S("Input: Amazon tracks every tap on your Kindle", "https://www.inputmag.com/tech/amazon-tracks-every-tap-on-your-kindle")],
    "moderate", "press/review", "multi-year", "medium",
    "Keep the device in airplane mode; use KOReader or an offline reader.",
    "No reading telemetry by default; reading stats computed and stored on-device; any opt-in crash reporting excludes book titles and positions; publish a plain-language data inventory.",
    "M")

add("Privacy & ownership", "complaint",
    "Mozilla's Privacy Not Included rated Onyx Boox 'very creepy': no device-specific privacy policy found, unconfirmed security update practice, and no reply to inquiries. Boox users get great hardware flexibility but little transparency.",
    ["Boox"],
    [S("Mozilla Privacy Not Included: Onyx Boox", "https://foundation.mozilla.org/privacynotincluded/onyx-boox/"),
     S("MobileRead thread on Boox data/privacy", "https://www.mobileread.com/forums/showthread.php?p=4222351")],
    "moderate", "press/review", "multi-year", "medium",
    "Block vendor apps with a firewall; use third-party reader apps on Boox.",
    "SAGA Leaf firmware ships with a published privacy policy, no cloud dependency, and open update notes; the app works with the Leaf over local transfer only unless the user opts into sync.",
    "M")

add("Privacy & ownership", "love",
    "Kobo is repeatedly praised because buyers can still download their purchased books and sideload freely, which reviewers frame as more ownership than Kindle allows.",
    ["Kobo", "Amazon Kindle"],
    [S("Laptop Mag: I switched from Kindle to Kobo for a week", "https://www.laptopmag.com/news/amazon-kindle-vs-kobo-clara-bw"),
     S("Johnny Jet: why I switched from Kindle Oasis to Kobo Libra Colour", "https://johnnyjet.com/why-i-switched-from-a-kindle-oasis-to-a-kobo-libra-colour/")],
    "moderate", "press/review", "recent", "medium",
    "n/a",
    "Match Kobo's openness and go further: no store lock-in at all, any DRM-free file is a first-class book.",
    "S")

# ---------------- Device connectivity ----------------
add("Device connectivity", "complaint",
    "Kindle devices no longer show covers for books sideloaded over USB or Wi-Fi on some models (titles appear as text tiles), which reviewers call a deliberate or neglected degradation of non-Amazon content.",
    ["Amazon Kindle"],
    [S("Tom's Guide: Kindle Colorsoft shortcoming with sideloaded covers", "https://www.tomsguide.com/computing/e-readers/amazons-kindle-colorsoft-finally-convinced-me-to-get-an-e-reader-but-this-one-shortcoming-is-really-getting-under-my-skin"),
     S("Book Riot: How to fix missing covers on sideloaded Kindle ebooks", "https://bookriot.com/how-to-fix-missing-sideloaded-ebook-covers-on-kindle/"),
     S("The eBook Reader: personal documents show covers on lockscreen but not library", "https://blog.the-ebook-reader.com/2022/05/16/kindle-personal-documents-show-covers-on-lockscreen-but-not-library/")],
    "strong", "press/review", "multi-year", "low",
    "Calibre 'fix covers' on device; send via Send-to-Kindle instead of USB.",
    "Treat sideloaded books identically to any other: extract the EPUB cover, let the user replace it, and push the same thumbnail to SAGA Leaf.",
    "S")

add("Device connectivity", "complaint",
    "The Xteink X4 does not mount as a USB drive, so books go on via microSD or a browser upload to the device's local IP. Owners find this fiddly compared with drag-and-drop.",
    ["Xteink X4"],
    [S("PocketInk: Xteink X4 pre-purchase reality check", "https://pocketink.io/blog/xteink-x4-pre-purchase-reality-check"),
     S("Digital Trends: Xteink X4 review", "https://www.digitaltrends.com/phones/xteink-x4-review/")],
    "moderate", "press/review", "recent", "medium",
    "microSD card reader; CrossPoint firmware Wi-Fi upload or Calibre wireless.",
    "SAGA Leaf: pair once with the phone app (BLE handshake, Wi-Fi/BLE bulk transfer) and push books from the SAGA library with one tap; also expose USB mass storage as a fallback.",
    "L")

add("Device connectivity", "love",
    "Kobo's built-in Instapaper integration (replacing Pocket after Mozilla shut Pocket in July 2025) was received as Kobo 'saving' a favourite feature: read-later articles appear on the e-reader.",
    ["Kobo"],
    [S("Kobo Help: Pocket has shut down", "https://help.kobo.com/hc/en-us/articles/360017763753"),
     S("Android Authority: Kobo Instapaper integration rolls out", "https://www.androidauthority.com/kobo-instapaper-integration-roll-out-3592013/"),
     S("Boing Boing: Kobo just saved one of its e-readers' best features", "https://boingboing.net/2025/09/03/kobo-just-saved-one-of-its-e-readers-best-features.html")],
    "strong", "official", "recent", "medium",
    "n/a",
    "Let SAGA import web articles (share-sheet, Instapaper/Wallabag/Readwise via OPML or API) and push them to SAGA Leaf as clean reflowable text.",
    "M")

add("Integrations", "complaint",
    "Pocket's shutdown deleted users' saved items after the export window closed (Oct 2025), a reminder that read-later and reading data held by a third party can vanish.",
    ["Kobo", "Pocket"],
    [S("Kobo Help: Pocket has shut down", "https://help.kobo.com/hc/en-us/articles/360017763753"),
     S("Good e-Reader: Will you buy a Kobo now that Pocket is discontinued?", "https://goodereader.com/blog/kobo-ereader-news/will-you-buy-a-new-kobo-e-reader-now-that-pocket-is-being-discontinued")],
    "strong", "official", "recent", "medium",
    "Export to HTML/CSV before the deadline; move to Instapaper.",
    "All saved articles and highlights live locally in an open format (EPUB/Markdown + JSON); if SAGA's cloud ever ends, nothing is lost.",
    "M")

# ---------------- Sync ----------------
add("Sync", "unmet-need",
    "Kobo does not sync reading position or annotations for sideloaded books across devices and apps, and Kindle only syncs personal documents sent via Send-to-Kindle, not USB sideloads. Readers with DRM-free libraries lose the 'pick up anywhere' experience that store buyers get.",
    ["Kobo", "Amazon Kindle"],
    [S("The eBook Reader: Nook can sync sideloaded ebooks now (compares Kindle/Kobo)", "https://blog.the-ebook-reader.com/2024/06/20/nook-ereaders-and-apps-can-sync-sideloaded-ebooks-now/"),
     S("The eBook Reader: sync issues with Kobo finally fixed (purchased only)", "https://blog.the-ebook-reader.com/2026/09/11/sync-issues-with-kobo-ereaders-and-apps-finally-fixed/"),
     S("MobileRead: Kobo sideloaded sync thread", "https://www.mobileread.com/forums/showthread.php?p=4362085")],
    "strong", "press/review", "multi-year", "high",
    "KOReader progress sync server; Calibre-Web/Kobo sync hacks; Send-to-Kindle.",
    "Position + highlight sync keyed by content hash (not filename), working identically for every imported file across phone, desktop, web and SAGA Leaf; end-to-end encrypted.",
    "L")

add("Sync", "complaint",
    "Kobo's own bookmark/progress sync between e-readers and apps was unreliable long enough that Kobo rebuilt the system in 2026; users must manually run 'Repair account' or re-sign-in on each device to get the fix.",
    ["Kobo"],
    [S("The eBook Reader: sync issues with Kobo ereaders and apps finally fixed", "https://blog.the-ebook-reader.com/2026/09/11/sync-issues-with-kobo-ereaders-and-apps-finally-fixed/"),
     S("Notebookcheck: Kobo finally fixes longstanding issues", "https://www.notebookcheck.net/Kobo-finally-fixes-longstanding-issues-on-its-e-readers.1398521.0.html")],
    "strong", "press/review", "multi-year", "high",
    "Manually note page; repair account per device.",
    "Show sync state explicitly (last synced, from which device) and offer 'jump to furthest position' with conflict choice rather than silently overwriting.",
    "M")

add("Sync", "love",
    "Whispersync (position, highlights, notes moving seamlessly across Kindle devices and apps) is one of the features that keeps people on Kindle even when they dislike Amazon.",
    ["Amazon Kindle"],
    [S("Android Authority: the Kindle feature stopping me switching", "https://www.androidauthority.com/kindle-feature-stopping-me-switching-3591123"),
     S("SlashGear: 3 things Kindle owners say they love most", "https://www.slashgear.com/2299893/things-kindle-owners-say-love-most/")],
    "moderate", "press/review", "multi-year", "high",
    "n/a",
    "Parity is mandatory: sync must 'just work' with zero configuration for users who opt in, including the Leaf.",
    "L")

add("Sync", "request",
    "Open-source readers rely on partial sync: KOReader's official sync server handles progress only, and matching can break if filenames or file contents differ; annotation sync needs third-party plugins (Readest server, Syncthing, AnnotationSync).",
    ["KOReader", "Readest"],
    [S("Readest wiki: Sync with KOReader devices", "https://github.com/readest/readest/wiki/Sync-with-Koreader-devices"),
     S("AnnotationSync.koplugin release", "https://newreleases.io/project/github/dani84bs/AnnotationSync.koplugin/release/v0.2.1"),
     S("koreader-syncthing plugin", "https://github.com/jasonchoimtt/koreader-syncthing")],
    "strong", "github-issue", "multi-year", "medium",
    "Syncthing folder sync of sidecar files; Readest plugin; manual export.",
    "Interoperate: speak the KOReader progress-sync protocol so existing KOReader devices can sync with SAGA, and offer annotation sync natively.",
    "M")

add("Sync", "request",
    "Desktop-only readers such as Foliate have no built-in cross-device progress sync, so users write tutorials for syncing config folders between computers.",
    ["Foliate"],
    [S("EndeavourOS forum: how to sync reading progress in Foliate", "https://forum.endeavouros.com/t/tutorial-how-to-sync-reading-progress-in-foliate-ebook-reader/45695"),
     S("Foliate (Wikipedia)", "https://en.wikipedia.org/wiki/Foliate_(software)")],
    "weak", "user-reports", "multi-year", "medium",
    "Sync ~/.local/share/foliate with Nextcloud/Syncthing.",
    "Ship a Linux/desktop client with the same sync engine instead of leaving desktop as an afterthought.",
    "M")

# ---------------- Reading interface & typography ----------------
add("Reading interface & typography", "complaint",
    "Apple's iOS 16 Books redesign hid controls behind a menu, replaced the page-curl with a card-slide animation, and added accidental double-tap bookmarks; enough users objected that Apple restored the curl option in iOS 16.4.",
    ["Apple Books"],
    [S("Michael Tsai: Apple Books in iOS 16", "https://mjtsai.com/blog/2022/10/07/apple-books-in-ios-16"),
     S("MacRumors forum: I truly despise the iOS 16 Apple Books update", "https://forums.macrumors.com/threads/i-truly-despise-the-ios-16-apple-books-update.2372905"),
     S("TidBITS talk: How Apple's Books app changed in iOS 16", "https://talk.tidbits.com/t/how-apple-s-books-app-has-changed-in-ios-16/20125")],
    "strong", "press/review", "multi-year", "medium",
    "Wait for 16.4 toggle; switch apps.",
    "Never force a UI redesign on readers: keep page-turn style, chrome visibility and tap zones as user settings that survive updates.",
    "S")

add("Reading interface & typography", "love",
    "Kobo readers praise the typography control (more built-in fonts, weight/sharpness sliders, easy custom font loading), which is a common reason given for switching from Kindle.",
    ["Kobo", "Amazon Kindle"],
    [S("Laptop Mag: Kindle vs Kobo hands-on", "https://www.laptopmag.com/news/amazon-kindle-vs-kobo-clara-bw"),
     S("Avocado Diaries: Why I'm switching from Kindle to Kobo", "https://www.avocadodiaries.com/2022/04/kobo-review.html")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Ship good defaults plus weight/sharpness, margins, line spacing, hyphenation and drag-in custom fonts on every platform, including the Leaf.",
    "M")

add("Reading interface & typography", "complaint",
    "Publisher/author CSS often makes ebooks look bad on Kindle (forced fonts, odd spacing), and readers cannot always override it.",
    ["Amazon Kindle"],
    [S("BookFunnel blog: why do ebooks look ugly on Kindle", "https://blog.bookfunnel.com/2022/why-do-ebooks-look-ugly-on-kindle")],
    "weak", "press/review", "multi-year", "medium",
    "Edit the EPUB in Calibre/Sigil; use publisher font toggle.",
    "Provide a 'publisher styles: full / partial / off' switch per book, as KOReader does with style tweaks.",
    "M")

add("Reading interface & typography", "complaint",
    "Stock Xteink X4 software forces justified text, offers no margin control, limited fonts and broken bold/italic, and sometimes defaults to Chinese; reviewers say the open CrossPoint firmware is what makes it pleasant.",
    ["Xteink X4"],
    [S("Aftermath: Xteink X4 cheap hackable e-reader / CrossPoint review", "https://aftermath.site/xteink-x4-cheap-hackable-ereader-crosspoint-review/"),
     S("Digital Trends: Xteink X4 review", "https://www.digitaltrends.com/phones/xteink-x4-review/")],
    "strong", "press/review", "recent", "high",
    "Flash CrossPoint firmware (~20 min).",
    "SAGA Leaf must ship with good typography out of the box (margin, alignment, line height, bold/italic, a crisp small-screen font) rather than relying on community firmware.",
    "L")

# ---------------- Small screens ----------------
add("Small screens", "love",
    "Reviewers love the card-sized, ~77 g, magnetic phone-back form of the Xteink X4: always with you, cheap (~$69) and comfortable for long sessions with ~2 weeks of battery.",
    ["Xteink X4"],
    [S("Digital Trends: Xteink X4 review", "https://www.digitaltrends.com/phones/xteink-x4-review/"),
     S("Aftermath: Xteink X4 review", "https://aftermath.site/xteink-x4-cheap-hackable-ereader-crosspoint-review/"),
     S("Boing Boing: Xteink X4 MagSafes to your wallet", "https://boingboing.net/2026/02/23/xteinks-x4-a-69-e-ink-reader-that-magsafes-to-your-wallet.html")],
    "strong", "press/review", "recent", "medium",
    "n/a",
    "Validates SAGA Leaf's concept; keep it light, cheap, magnetic and long-lasting.",
    "L")

add("Small screens", "complaint",
    "On a 4.3-inch 220 ppi screen only a few paragraphs fit per page and text is softer than 300 ppi readers; the original X4 also lacks a front light and touch, so reading in bed needs a clip-on lamp.",
    ["Xteink X4"],
    [S("Digital Trends: Xteink X4 review", "https://www.digitaltrends.com/phones/xteink-x4-review/"),
     S("PocketInk: Xteink X4 reality check", "https://pocketink.io/blog/xteink-x4-pre-purchase-reality-check"),
     S("Digital Trends: Xteink X4 Pro review (adds front light)", "https://www.digitaltrends.com/phones/xteink-x4-pro-review/")],
    "strong", "press/review", "recent", "high",
    "Clip-on light; smallest font; buy X4 Pro.",
    "Leaf: include a front light, a font tuned for small sizes, tight-but-readable default margins, and an optional 'compact' layout that hides headers/footers.",
    "L")

add("Small screens", "complaint",
    "Large camera bumps on newer phones stop magnetic phone-back readers sitting flush, so they rock or overhang.",
    ["Xteink X4"],
    [S("Digital Trends: Xteink X4 review", "https://www.digitaltrends.com/phones/xteink-x4-review/"),
     S("Aftermath: Xteink X4 review", "https://aftermath.site/xteink-x4-cheap-hackable-ereader-crosspoint-review/")],
    "moderate", "press/review", "recent", "low",
    "Use on a case or wallet; adhesive ring offset.",
    "Design the Leaf's magnet ring and back geometry around current camera-bump layouts; offer a slim wallet/case variant.",
    "M")

# ---------------- Performance & battery ----------------
add("Performance & battery", "complaint",
    "KOReader on PocketBook was faster for PDFs but crashed occasionally on first load of large PDFs, and loading screens interrupt the flow.",
    ["KOReader", "PocketBook"],
    [S("TechTactician: PocketBook Verse Pro with KOReader after 4 months", "https://techtactician.com/pocketbook-verse-pro-with-koreader-my-experience/")],
    "weak", "user-reports", "recent", "medium",
    "Pre-open big PDFs on a charger; use stock reader for EPUB.",
    "Index/render big PDFs in the background with progress, cache rendered pages, and recover gracefully from render failures without losing position.",
    "M")

add("Performance & battery", "complaint",
    "Readwise Reader's mobile app is described as somewhat laggy with large libraries; reviewers say desktop/web is the stronger experience.",
    ["Readwise Reader"],
    [S("Asian Efficiency: Readwise Reader review", "https://www.asianefficiency.com/productivity/readwise-reader-review/")],
    "weak", "press/review", "recent", "medium",
    "Archive old items; use desktop.",
    "Local database with incremental indexing so library size does not affect scroll performance on phone or Leaf.",
    "M")

# ---------------- Academic & technical ----------------
add("Academic & technical reading", "unmet-need",
    "MobileRead users still say no e-ink reader matches a tablet for PDFs; large Boox devices or column-splitting/reflow are the compromises. Small-screen e-readers handle academic PDFs poorly.",
    ["Kobo", "Amazon Kindle", "Boox"],
    [S("MobileRead: Best e-reader for PDFs in 2025", "https://www.mobileread.com/forums/showthread.php?p=4523506"),
     S("The eBook Reader: PDF showdown ranking readers", "https://blog.the-ebook-reader.com/2013/04/30/pdf-showdown-ranking-the-best-and-worst-ebook-readers-for-pdf-reading/")],
    "moderate", "user-reports", "multi-year", "high",
    "KOReader reflow (k2pdfopt); large tablets; crop margins.",
    "PDF mode with auto-crop margins, column detection, text reflow for text-layer PDFs; route PDFs to phone/desktop and send only reflowed text to the Leaf.",
    "XL")

add("Academic & technical reading", "love",
    "KOReader is loved for PDF handling far beyond stock firmware (reflow, cropping, contrast and font thickening).",
    ["KOReader"],
    [S("LWN: KOReader article and comments", "https://lwn.net/Articles/891494"),
     S("TechTactician: PocketBook with KOReader", "https://techtactician.com/pocketbook-verse-pro-with-koreader-my-experience/")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Benchmark SAGA's PDF tools against KOReader's crop/reflow on the same test PDFs before launch.",
    "L")

# ---------------- Personalization ----------------
add("Personalization", "love",
    "KOReader's deep customization (programmable gestures, style tweaks, frontlight shortcuts) is the main reason power users install it.",
    ["KOReader"],
    [S("LWN: KOReader", "https://lwn.net/Articles/891494"),
     S("ZSA Loves: KOReader", "https://blog.zsa.io/zsa-loves-koreader")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Offer gesture/tap-zone mapping and saved reading profiles, but behind an 'Advanced' layer.",
    "M")

add("Personalization", "complaint",
    "KOReader's settings are described as labyrinthine; one user needed hundreds of adjustments to get comfortable. Power comes at the cost of approachability.",
    ["KOReader"],
    [S("LWN: KOReader comments", "https://lwn.net/Articles/891494"),
     S("Tildes: KOReader discussion", "https://tildes.net/~books/1w02/koreader_custom_reader_software_for_eink_devices")],
    "moderate", "user-reports", "multi-year", "medium",
    "Copy someone else's settings file; follow guides.",
    "Progressive disclosure: 5 essential settings on the reading screen, full control in Advanced; ship presets ('Classic', 'Large print', 'Dyslexia-friendly', 'Compact Leaf').",
    "M")

# ---------------- Pricing & subscriptions ----------------
add("Pricing & subscriptions", "complaint",
    "Kindle e-readers show lockscreen ads ('Special Offers') unless the buyer pays extra to remove them; reviewers note Kobo shows none, and lockscreens have even promoted low-quality AI-generated books.",
    ["Amazon Kindle", "Kobo"],
    [S("BGR: How to turn off ads on your Kindle", "https://bgr.com/2147837/how-to-remove-ads-amazon-kindle/"),
     S("Laptop Mag: Kindle vs Kobo", "https://www.laptopmag.com/news/amazon-kindle-vs-kobo-clara-bw"),
     S("Yahoo: Kindle lock screens showing ads for AI-generated books", "https://uk.news.yahoo.com/amazon-kindle-lock-screens-showing-140836783.html")],
    "strong", "press/review", "multi-year", "medium",
    "Pay to remove ads; ask support to remove.",
    "No ads or store promotions anywhere in the reading UI or Leaf sleep screen; sleep screen shows the current book cover or user image.",
    "S")

add("Pricing & subscriptions", "complaint",
    "Readwise Reader costs around $10/month (more billed monthly), which reviewers call steep for a reading app when free options exist, and its value takes weeks to appear.",
    ["Readwise Reader"],
    [S("Asian Efficiency: Readwise Reader review", "https://www.asianefficiency.com/productivity/readwise-reader-review/"),
     S("Activepieces: Readwise pricing 2026 guide", "https://www.activepieces.com/blog/readwise-pricing-plans-and-costs-2026-guide")],
    "moderate", "press/review", "recent", "medium",
    "Annual billing; Lite tier; free alternatives.",
    "Core reading, import, local stats and export free forever; charge only for optional hosted sync/storage and the Leaf hardware.",
    "S")

add("Pricing & subscriptions", "complaint",
    "BookFusion users note that uploading large libraries requires a paid subscription, adding cost for people already leaving Kindle/Audible.",
    ["BookFusion"],
    [S("Tildes: BookFusion discussion", "https://tildes.net/~books/1mh2/bookfusion_upload_organize_read_share_and_sync_your_ebooks")],
    "weak", "user-reports", "recent", "medium",
    "Keep library local; upload selectively.",
    "Local library has no size limit; paid sync tiers priced on storage with a generous free tier for metadata/annotation sync (small) separate from file sync (large).",
    "S")

# ---------------- Integrations ----------------
add("Integrations", "love",
    "Readwise Reader is valued for pushing highlights automatically into Notion/Obsidian, importing Kindle highlights, and resurfacing highlights via spaced repetition.",
    ["Readwise Reader"],
    [S("Asian Efficiency: Readwise Reader review", "https://www.asianefficiency.com/productivity/readwise-reader-review/"),
     S("Readwise Reader update Dec 2025", "https://readwise.io/reader/update-dec2025")],
    "moderate", "press/review", "recent", "medium",
    "n/a",
    "Export highlights as Markdown/JSON automatically to a chosen folder (works with Obsidian vaults) and offer a Readwise export target.",
    "M")

add("Integrations", "love",
    "BookFusion's Calibre plugin and cross-device library are liked by users with DRM-free collections, who say those files stop being second-class citizens.",
    ["BookFusion", "Calibre"],
    [S("Tildes: BookFusion discussion", "https://tildes.net/~books/1mh2/bookfusion_upload_organize_read_share_and_sync_your_ebooks"),
     S("BookFusion docs: Calibre plugin", "https://docs.bookfusion.com/docs/tags/integration"),
     S("BookFusion feature board: sync Calibre highlights", "https://bookfusion.featureos.app/p/sync-calibre-highlights")],
    "moderate", "user-reports", "recent", "medium",
    "n/a",
    "Calibre import that preserves metadata, tags, series and custom columns; optional Calibre content-server/OPDS connection.",
    "M")

# ---------------- Discovery & purchasing ----------------
add("Discovery & purchasing", "love",
    "Kindle's store size, frequent deals and Kindle Unlimited are among the main reasons people stay, along with cheap, reliable hardware and Prime delivery.",
    ["Amazon Kindle"],
    [S("SlashGear: 3 things Kindle owners love most", "https://www.slashgear.com/2299893/things-kindle-owners-say-love-most/"),
     S("Laptop Mag: Kindle vs Kobo (Kindle still wins on accessories/delivery)", "https://www.laptopmag.com/news/amazon-kindle-vs-kobo-clara-bw"),
     S("The eBook Reader: Kindle + Kobo is the best combination", "https://blog.the-ebook-reader.com/2025/01/08/kindle-kobo-is-the-best-combination-why-take-sides")],
    "moderate", "press/review", "multi-year", "high",
    "n/a",
    "Don't compete with the store; make SAGA the best home for books bought elsewhere (DRM-free stores, Humble/StoryBundle, Gutenberg, Standard Ebooks) with built-in OPDS catalog browsing.",
    "M")

add("Discovery & purchasing", "complaint",
    "Goodreads (Amazon-owned) is criticised as stagnant: dated design, buggy apps, few new features; many users moved to StoryGraph partly to avoid Amazon.",
    ["Goodreads", "StoryGraph"],
    [S("MakeUseOf: 6 reasons to stop using Goodreads", "https://www.makeuseof.com/6-reasons-why-you-should-stop-using-goodreads/"),
     S("HuffPost: people leaving Goodreads for StoryGraph", "https://huffingtonpost.co.uk/entry/storygraph-amazon-goodreads-jeff-bezos_l_673e2013e4b0f17b35e0a123")],
    "strong", "press/review", "multi-year", "low",
    "StoryGraph, Hardcover, BookWyrm.",
    "Optional export of finished books/ratings to StoryGraph/Goodreads CSV formats; never require a social account.",
    "S")

# ---------------- Library lending (Integrations/Discovery) ----------------
add("Integrations", "love",
    "Kobo's built-in OverDrive lets readers borrow library ebooks directly on the device, a major reason readers outside the US (where Kindle Libby delivery is unavailable) pick Kobo.",
    ["Kobo", "Libby"],
    [S("SlashGear: Is Libby compatible with Kobo?", "https://www.slashgear.com/1819179/libby-kobo-compatibility-explained/"),
     S("Libby Help: reading Libby ebooks on a Kobo", "https://help.libbyapp.com/6251.htm"),
     S("NBC Select: Kobo Libra Colour review", "https://www.nbcnews.com/select/shopping/kobo-libra-colour-review-rcna171899")],
    "strong", "official", "multi-year", "high",
    "ADE + .acsm for older Kobos.",
    "Library lending requires DRM licensing SAGA won't have at launch; instead deep-link to Libby and support Adobe/LCP-free library EPUBs where offered (e.g., public domain). Be honest in marketing that SAGA is for DRM-free books.",
    "XL")

add("Discovery & purchasing", "complaint",
    "Libby users in the US report some new releases cannot be sent to Kindle immediately (or ever) because of publisher/Amazon authorization, forcing reading in the Libby app.",
    ["Libby", "Amazon Kindle"],
    [S("Boing Boing: new Libby ebooks not available on Kindle, wait a day", "https://boingboing.net/2025/07/30/newly-released-ebooks-via-libby-not-available-on-kindle-wait-a-day.html")],
    "weak", "user-reports", "recent", "medium",
    "Read in Libby app; wait 1-2 days.",
    "n/a for DRM content; note as a reason Libby users may still need Libby alongside SAGA.",
    "S")

# ---------------- Accessibility / Audio ----------------
add("Audio & TTS", "complaint",
    "Kindle e-reader TTS is only available through VoiceView, an accessibility screen reader buried in settings, needing Bluetooth audio, ~18 gestures, and English only; Fire tablets have a much easier TTS.",
    ["Amazon Kindle"],
    [S("The eBook Reader: why is TTS so difficult on Kindles", "https://blog.the-ebook-reader.com/2024/01/22/why-is-text-to-speech-so-difficult-to-use-on-kindles/"),
     S("TeleRead: I'm blind - Kindle TTS has been a nightmare", "https://teleread.org/2016/08/28/im-blind-kindle-text-to-speech-has-been-a-nightmare-to-master-heres-how-to-fix-this/")],
    "strong", "press/review", "multi-year", "high",
    "Use Kindle app on phone with system TTS; Fire tablet.",
    "First-class 'Listen' button in reading UI using OS voices (and optional on-device neural voices), sentence highlighting, sleep timer, continues with screen off.",
    "M")

add("Audio & TTS", "complaint",
    "Kobo e-readers lack general text-to-speech for ebooks (commenters note it), while PocketBook's official TTS is a reason some prefer PocketBook.",
    ["Kobo", "PocketBook"],
    [S("The eBook Reader: Kindle TTS article (comment on Kobo)", "https://blog.the-ebook-reader.com/2024/01/22/why-is-text-to-speech-so-difficult-to-use-on-kindles/"),
     S("TechTactician: PocketBook official TTS", "https://techtactician.com/pocketbook-verse-pro-with-koreader-my-experience/")],
    "weak", "user-reports", "multi-year", "medium",
    "Use phone app; PocketBook device.",
    "TTS in the phone app that can follow along on the Leaf (page turns in sync).",
    "L")

add("Audio & TTS", "love",
    "BookFusion's listening controls (skip by sentence) and EPUB 3 Media Overlay read-along support are singled out as better than Kindle's.",
    ["BookFusion"],
    [S("Tildes: BookFusion discussion", "https://tildes.net/~books/1mh2/bookfusion_upload_organize_read_share_and_sync_your_ebooks")],
    "weak", "user-reports", "recent", "medium",
    "n/a",
    "Support EPUB 3 Media Overlays (pre-recorded narration synced to text) and sentence-level skip in TTS.",
    "L")

add("Accessibility", "complaint",
    "The US National Federation of the Blind has long documented gaps in Amazon device accessibility; blind users describe Kindle e-reader accessibility as hard to learn.",
    ["Amazon Kindle"],
    [S("NFB: The state of Amazon device accessibility", "https://nfb.org/node/7525"),
     S("TeleRead: Kindle TTS a nightmare for blind user", "https://teleread.org/2016/08/28/im-blind-kindle-text-to-speech-has-been-a-nightmare-to-master-heres-how-to-fix-this/")],
    "moderate", "press/review", "multi-year", "high",
    "Use phone apps with VoiceOver/TalkBack.",
    "Build with platform accessibility APIs from day one: VoiceOver/TalkBack labels, logical focus order, reading-content exposure to screen readers, test with blind users before launch.",
    "L")

add("Accessibility", "love",
    "Thorium Reader is recognised by the DAISY Consortium for accessibility work (screen-reader support, EPUB 3 accessibility, read-aloud), showing what a reader built for accessibility looks like.",
    ["Thorium"],
    [S("DAISY: Thorium 1.8.0 accessibility improvements", "https://daisy.org/news-events/news/thorium-1-8-0-new-improvements-for-accessibility/"),
     S("Thorium docs: accessibility", "https://thorium.edrlab.org/docs/300_accessibility/")],
    "strong", "official", "multi-year", "medium",
    "n/a",
    "Use Thorium/Readium accessibility behaviour as SAGA's accessibility test baseline.",
    "M")

add("Accessibility", "unmet-need",
    "Dyslexia-friendly fonts are frequently requested, but literacy research suggests spacing and layout matter more than special typefaces; readers need control of letter, word and line spacing, not just one font.",
    ["Amazon Kindle", "Kobo"],
    [S("Shanahan on Literacy: special fonts for dyslexia", "https://www.shanahanonliteracy.com/blog/what-about-special-fonts-for-kids-with-dyslexia-or-other-reading-problems"),
     S("Popular Science: ebook readers make reading easier for people with dyslexia", "https://www.popsci.com/technology/article/2013-09/ebook-readers-make-reading-easier-dyslexics")],
    "moderate", "press/review", "multi-year", "medium",
    "Sideload OpenDyslexic; short line length.",
    "Bundle OpenDyslexic/Atkinson Hyperlegible plus letter/word/line spacing, short-line mode and optional line focus ruler; avoid overclaiming that a font 'fixes' dyslexia.",
    "S")

# ---------------- Import & formats ----------------
add("Import & formats", "complaint",
    "Amazon dropped MOBI from Send-to-Kindle and converts EPUBs on its side; some files fail conversion or lose formatting, and users depend on Amazon's pipeline to read their own files.",
    ["Amazon Kindle"],
    [S("The eBook Reader: Amazon dropping MOBI on Send-to-Kindle", "https://blog.the-ebook-reader.com/2022/05/03/amazon-dropping-mobi-support-on-send-to-kindle-apps/"),
     S("MobileRead: Send-to-Kindle EPUB thread", "https://www.mobileread.com/forums/showthread.php?p=4221638")],
    "moderate", "user-reports", "multi-year", "medium",
    "Convert with Calibre first; fix EPUB errors.",
    "Read EPUB natively without server conversion; validate on import and repair common EPUB errors locally with a report.",
    "M")

add("Import & formats", "complaint",
    "Google Play Books uploads sometimes fail with EPUB processing errors, and users hit opaque failures with files that open fine elsewhere.",
    ["Google Play Books"],
    [S("OSTechNix: fix EPUB processing error in Google Play Books", "https://ostechnix.com/fix-epub-processing-error-google-play-books/"),
     S("Adobe Community: Google Play Books upload error", "https://community.adobe.com/t5/indesign-discussions/google-playbook-upload-error/m-p/13194932")],
    "weak", "user-reports", "multi-year", "medium",
    "Re-export via Calibre; repair EPUB.",
    "Local import never depends on a server; when a file is malformed, open it anyway in a tolerant mode and explain what's wrong.",
    "M")

add("Import & formats", "love",
    "The Xteink X4 community (CrossPoint) supports Calibre wireless send and browser upload, which reviewers say turns a limited gadget into a joy.",
    ["Xteink X4", "Calibre"],
    [S("Aftermath: Xteink X4 / CrossPoint review", "https://aftermath.site/xteink-x4-cheap-hackable-ereader-crosspoint-review/")],
    "weak", "press/review", "recent", "medium",
    "n/a",
    "Leaf supports Calibre wireless device protocol and OPDS pull in addition to the SAGA app.",
    "L")

# ---------------- Library organization ----------------
add("Library organization", "love",
    "Calibre remains the power tool for managing ebook libraries (metadata, conversion, device management) despite a long-criticised interface.",
    ["Calibre"],
    [S("LWN: Calibrating Calibre 1.0", "https://lwn.net/Articles/564865"),
     S("OMG! Ubuntu: Calibre 4.0 released", "https://www.omgubuntu.co.uk/2019/10/calibre-4-0-released-features")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Import Calibre libraries losslessly; don't try to replace Calibre for power users — interoperate.",
    "M")

add("Library organization", "complaint",
    "Calibre's interface is widely called dated and cluttered; newcomers find it intimidating even though it is powerful.",
    ["Calibre"],
    [S("Slashdot: Calibre 1.0 released (comments)", "https://news.slashdot.org/story/13/08/25/029205/calibre-version-10-released-after-7-years-of-development"),
     S("OMG! Ubuntu: making Calibre look nicer", "https://www.omgubuntu.co.uk/2011/05/making-calibre-look-nicer"),
     S("MobileRead: Calibre UI discussion", "https://www.mobileread.com/forums/showthread.php?p=1916118")],
    "moderate", "user-reports", "multi-year", "low",
    "Themes; Calibre-Web front end.",
    "Simple library: shelves, tags, series, auto-metadata from the file, smart collections; bulk edit for power users.",
    "M")

# ---------------- Annotations ----------------
add("Annotations", "complaint",
    "Kindle limits how much of a publisher's book you can export as highlights (clipping limit), truncating notes, and highlights on personal documents need workarounds to export.",
    ["Amazon Kindle"],
    [S("Readwise docs: Kindle highlights import / truncation", "https://docs.readwise.io/highlights/docs/importing-highlights/kindle"),
     S("Instructables: export Kindle highlights incl. personal documents", "https://www.instructables.com/How-to-Export-Kindle-Highlights-Personal-Documents"),
     S("Hongkiat: export Kindle notes and highlights", "https://www.hongkiat.com/blog/export-kindle-highlights/")],
    "moderate", "press/review", "multi-year", "medium",
    "My Clippings.txt from device; third-party exporters.",
    "No export limits on your own files; export highlights with chapter, location, colour, note and timestamp as Markdown, JSON, CSV, and annotated EPUB.",
    "S")

add("Annotations", "complaint",
    "Apple Books users report books corrupting and PDF highlights being wiped, and EPUBs disappearing after iOS updates, with no way to recover annotations.",
    ["Apple Books"],
    [S("Apple Community: Apple Books corrupted my book and wiped all my PDF highlights", "https://discussions-jp-prz.apple.com/thread/256149383"),
     S("Apple Community: EPUB books disappeared after iOS 15.4", "https://discussions.apple.com/thread/253751313")],
    "weak", "user-reports", "multi-year", "high",
    "Back up via Mac; export notes regularly.",
    "Annotations stored separately from the book file with versioned history and automatic local backups; restoring a book never deletes its notes.",
    "M")

add("Annotations", "love",
    "Google Play Books can save notes and highlights to a Google Drive document, which users like for studying.",
    ["Google Play Books"],
    [S("The eBook Reader: Google Play Books now syncs notes to Google Drive", "https://blog.the-ebook-reader.com/2015/07/22/google-play-books-app-now-syncs-notes-to-google-drive/")],
    "weak", "official", "multi-year", "low",
    "n/a",
    "Auto-export annotations to a user-chosen folder (local, iCloud Drive, Google Drive) as a live Markdown file per book.",
    "M")

# ---------------- Stats & habits ----------------
add("Stats & habits", "love",
    "StoryGraph is liked for detailed reading stats and mood/pace charts, plus features Goodreads lacked such as DNF and partial-star ratings.",
    ["StoryGraph", "Goodreads"],
    [S("Book Riot: StoryGraph review", "https://bookriot.com/storygraph-review/"),
     S("MakeUseOf: reasons to stop using Goodreads (no DNF, whole stars)", "https://www.makeuseof.com/6-reasons-why-you-should-stop-using-goodreads/"),
     S("NewsBytes: Goodreads finally gets half and quarter star ratings", "https://www.newsbytesapp.com/news/science/goodreads-finally-gets-half-and-quarter-star-ratings/story")],
    "moderate", "press/review", "multi-year", "low",
    "n/a",
    "On-device stats (time read, pages/day, streaks, finish estimates, genre breakdowns) with DNF state, no social obligation, CSV export.",
    "M")


add("Audio & TTS", "complaint",
    "Amazon restored an 'Assistive Reader' read-aloud mode on recent Kindles in Aug 2025 after previously pulling it, but it needs Bluetooth audio, is not officially announced, and a commenter reports it works only on Amazon-purchased books, not sideloads.",
    ["Amazon Kindle"],
    [S("The eBook Reader: Kindle software update brings back TTS", "https://blog.the-ebook-reader.com/2025/08/19/another-kindle-software-update-released-brings-back-tts/")],
    "moderate", "press/review", "recent", "medium",
    "Use phone app TTS; Fire tablet.",
    "TTS treats every file equally, works on phone speaker without pairing, and is never remotely withdrawn.",
    "M")

add("Accessibility", "love",
    "Amazon officially offers OpenDyslexic on Kindle (since 2016) together with larger sizes and spacing/margin controls, which accessibility advocates count as a baseline others should match.",
    ["Amazon Kindle"],
    [S("About Amazon: new accessibility features for Kindle e-readers", "https://aboutamazon.com/news/devices/new-accessibility-features-for-kindle-e-readers"),
     S("Kobo Help: fonts on Kobo eReader", "https://help.kobo.com/hc/en-us/articles/360020048733")],
    "strong", "official", "multi-year", "medium",
    "n/a",
    "Ship OpenDyslexic and Atkinson Hyperlegible by default on app and Leaf.",
    "S")

add("Sync", "love",
    "Moon+ Reader syncs positions, highlights and bookmarks through the user's own Dropbox or WebDAV rather than a vendor cloud, which suits privacy-minded Android users.",
    ["Moon+ Reader"],
    [S("Moon+ Reader FAQ", "https://moondownload.com/faq.html")],
    "moderate", "official", "multi-year", "medium",
    "n/a",
    "Offer 'bring your own storage' sync backends (WebDAV, iCloud Drive, Dropbox, Syncthing folder) alongside SAGA's hosted sync.",
    "M")

# ================= BATCH 2 =================
KDIS = S("The eBook Reader: What are some things you don't like about Kindles?", "https://blog.the-ebook-reader.com/2023/11/30/what-are-some-things-you-dont-like-about-kindles/")
UNSTAR = S("Unstar: Kindle, Apple Books, Kobo, Libby, Scribd apps ranked 2026 (summary of 1-3 star reviews)", "https://unstar.app/blog/kindle-apple-books-kobo-libby-scribd-ereader-apps-ranked-2026")

add("Navigation & speed", "complaint",
    "Kindle owners list navigation friction: footnote pop-ups show only the first paragraph, there is no back button from search results, tap zones can't be customised, and menus take several taps.",
    ["Amazon Kindle"], [KDIS], "moderate", "user-reports", "multi-year", "medium",
    "Use Page Flip; tap back via 'Go to'.",
    "Full-length footnote pop-ups with 'open in place', a persistent back stack (search, links, footnotes all reversible), and remappable tap zones.",
    "M")

add("Navigation & speed", "complaint",
    "Accidental page turns are a recurring Kindle gripe: bezel touches and swipes flip pages or change font size, and newer models dropped physical page-turn buttons, with touch not always disable-able.",
    ["Amazon Kindle"], [KDIS], "moderate", "user-reports", "multi-year", "medium",
    "Lock screen orientation; buy Kobo/PocketBook with buttons.",
    "SAGA Leaf uses physical buttons as the primary input; phone app offers a 'touch lock' and lets users disable pinch-to-zoom font changes.",
    "S")

add("Navigation & speed", "complaint",
    "In the Kindle app, reading position sometimes jumps back tens of pages after syncing, according to summaries of low-star app store reviews.",
    ["Amazon Kindle"], [UNSTAR], "weak", "user-reports", "recent", "high",
    "Remember page manually; disable sync.",
    "Never move the reader backward silently; when a remote position differs, show a non-blocking 'Jump to p. X from Leaf?' prompt.",
    "M")

add("Offline reliability", "complaint",
    "Kindles have been reported to wipe Calibre-sideloaded books after long periods in airplane mode followed by reconnection; Amazon never confirmed a cause and updates through 2024 did not fix it. This hits exactly the readers who go offline on purpose.",
    ["Amazon Kindle"],
    [S("The eBook Reader: Kindle ereaders deleting sideloaded ebooks", "https://blog.the-ebook-reader.com/2023/10/23/kindle-ereaders-deleting-sideloaded-ebooks/"),
     S("The eBook Reader: Beware of airplane mode on Kindles if you sideload", "https://blog.the-ebook-reader.com/2024/02/01/beware-of-airplane-mode-on-kindles-if-you-sideload-books/")],
    "moderate", "user-reports", "multi-year", "high",
    "Keep Wi-Fi always on or always off; keep backups.",
    "Local files are never removed by sync; deletes require explicit user action and go to a recoverable 'Recently deleted' for 30 days, on app and Leaf.",
    "M")

add("Offline reliability", "complaint",
    "A traveller's Kindle could not get past a hotel Wi-Fi login page and queued library books had never actually downloaded, so the books were unavailable until they found open Wi-Fi.",
    ["Amazon Kindle", "Libby"],
    [S("TechRadar: A vacation Amazon Kindle near-disaster", "https://techradar.com/features/a-vacation-amazon-kindle-near-disaster-almost-brought-me-back-to-books")],
    "weak", "press/review", "recent", "medium",
    "Download everything before travel; phone hotspot.",
    "Make download state obvious (fully on device vs. cloud-only), offer 'keep next N books on device', and let the Leaf receive books over phone-to-device Bluetooth/Wi-Fi Direct without any internet.",
    "M")

add("Offline reliability", "request",
    "Cloud-first readers need pre-caching to work offline: Readwise Reader asks users to open the app first and choose offline sections, and Readest users requested an offline mode for its web/PWA version.",
    ["Readwise Reader", "Readest"],
    [S("Readwise Reader FAQs (offline)", "https://docs.readwise.io/reader/docs/faqs"),
     S("Readest issues list (#247 offline mode for PWA)", "https://issues.ecosyste.ms/hosts/GitHub/repositories/readest%2Freadest/issues?page=1")],
    "moderate", "github-issue", "recent", "medium",
    "Open app before going offline; use native app.",
    "Local-first architecture: the library lives on-device and the cloud is a replica, so offline is the default state, not a mode.",
    "L")

add("Offline reliability", "complaint",
    "Libby audiobooks are large and sometimes fail to play offline, and loans expire after 14-21 days, according to summaries of negative app reviews.",
    ["Libby"], [UNSTAR], "weak", "user-reports", "recent", "medium",
    "Download over Wi-Fi in advance; renew early.",
    "For SAGA's own files: no expiry, no licence checks, and storage usage visible per book.",
    "S")

add("Performance & battery", "complaint",
    "A 2024 Kindle firmware update brought user reports of lag, freezes, battery drain while idle, fonts reverting to Bookerly, and a tiny progress indicator; not every device was affected and Amazon didn't confirm.",
    ["Amazon Kindle"],
    [S("The eBook Reader: More problems caused by latest Kindle software update", "https://blog.the-ebook-reader.com/2024/08/15/more-problems-caused-by-latest-kindle-software-update/")],
    "weak", "user-reports", "recent", "medium",
    "Restart; wait for next update.",
    "Staged rollouts for Leaf firmware with a one-tap rollback, and preference migrations tested so updates never reset fonts or layout.",
    "M")

add("Performance & battery", "love",
    "Weeks-long battery life is one of the three things Kindle owners praise most.",
    ["Amazon Kindle"],
    [S("SlashGear: 3 things Kindle owners say they love most", "https://www.slashgear.com/2299893/things-kindle-owners-say-love-most/")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Leaf target: 2+ weeks at 1 hr/day with front light; deep sleep between page turns; phone app must not drain battery with background sync.",
    "L")

add("Stats & habits", "request",
    "KOReader users build self-hosted dashboards (KoInsight, KoShelf) to see their reading statistics and notes outside the device, showing demand for owned, exportable reading stats.",
    ["KOReader"],
    [S("Bright Coding: KoInsight self-hosted dashboard for KOReader stats", "https://blog.brightcoding.dev/2026/09/30/georgesgkoinsight-self-hosted-dashboard-for-koreader-stats"),
     S("Bright Coding: KoShelf reading dashboard", "https://blog.brightcoding.dev/2026/06/08/stop-losing-your-koreader-notes-koshelf-exposes-the-hidden-reading-dashboard"),
     S("KoInsight on GitHub", "https://github.com/dev107/KoInsight")],
    "moderate", "github-issue", "recent", "low",
    "Self-host KoInsight; export statistics.sqlite.",
    "Built-in stats dashboard merging sessions from phone, desktop and Leaf, stored locally, exportable as CSV/SQLite.",
    "M")

add("Stats & habits", "request",
    "Community KOReader plugins add cover-based home screens with progress and reading streaks, implying the stock experience lacks motivating habit features.",
    ["KOReader"],
    [S("Boredom at Work: 10 best KOReader plugins (SimpleUI streaks)", "https://boredom-at-work.com/best-koreader-plugins/")],
    "weak", "press/review", "recent", "low",
    "Install SimpleUI plugin.",
    "Optional, gentle streaks and goals (off by default, no guilt notifications); Leaf sleep screen can show progress.",
    "S")

add("Small screens", "unmet-need",
    "Syncing position between a tiny ESP32 reader (Xteink X4 on CrossPoint) and KOReader is hard: memory limits prevent full-book layout, positions drifted 2-3 pages, and large books crashed during indexing.",
    ["Xteink X4", "KOReader"],
    [S("CrossPoint GitHub discussion #61: KOReader progress sync", "https://github.com/crosspoint-reader/crosspoint-reader/discussions/61")],
    "moderate", "github-issue", "recent", "high",
    "Manual chapter-level sync; percentage hacks.",
    "Have the phone app pre-paginate/pre-process books for the Leaf (chapter-split, pre-indexed anchors) so position maps by stable text anchors (CFI-like), not page numbers.",
    "L")

add("Library organization", "complaint",
    "Kindle libraries can't sort or filter by series or author well, collections are hard to manage for Calibre users, and sort settings don't carry into collections.",
    ["Amazon Kindle"], [KDIS], "moderate", "user-reports", "multi-year", "medium",
    "Calibre collections plugin; manual collections.",
    "Series-aware library (read from EPUB/Calibre metadata), sort/filter by author, series, tag, status, with saved views shared across devices.",
    "M")

add("Library organization", "request",
    "Readest users requested recursive import of a folder of books, a basic need for people moving existing libraries.",
    ["Readest"],
    [S("Readest issues list (#179 import directory recursively)", "https://issues.ecosyste.ms/hosts/GitHub/repositories/readest%2Freadest/issues?page=1")],
    "weak", "github-issue", "recent", "medium",
    "Import files in batches.",
    "Watch-folder and recursive import with dedupe by content hash.",
    "S")

add("Privacy & ownership", "request",
    "Readest users asked to self-host its web reader and sync API rather than depend on the developer's cloud.",
    ["Readest"],
    [S("Readest issues list (#192 self-hosting sync)", "https://issues.ecosyste.ms/hosts/GitHub/repositories/readest%2Freadest/issues?page=1")],
    "weak", "github-issue", "recent", "low",
    "Use KOReader sync server; Syncthing.",
    "Documented, open sync protocol with a self-hostable server option; also folder-based sync via iCloud Drive/Syncthing.",
    "L")

add("Personalization", "request",
    "Custom font support is a recurring request for newer readers (open Readest feature request) and Kindle commenters complain fonts apply globally, not per book.",
    ["Readest", "Amazon Kindle"],
    [S("Readest issues list (#237 custom fonts)", "https://issues.ecosyste.ms/hosts/GitHub/repositories/readest%2Freadest/issues?page=1"), KDIS],
    "moderate", "github-issue", "multi-year", "low",
    "Edit CSS; sideload fonts folder.",
    "Drag-in TTF/OTF fonts that sync (where licence allows) to every device and convert to Leaf bitmap format; per-book overrides.",
    "M")

add("Reading interface & typography", "complaint",
    "Kindle typography controls are limited compared with Kobo: few usable font sizes, only three margin and line-spacing settings.",
    ["Amazon Kindle", "Kobo"], [KDIS], "moderate", "user-reports", "multi-year", "medium",
    "Custom fonts; switch to Kobo/KOReader.",
    "Continuous sliders (with sensible steps) for size, margins, line height, paragraph spacing.",
    "S")

add("Pricing & subscriptions", "complaint",
    "Moon+ Reader's free version shows a home-screen banner and occasional full-screen ads, and PDF support needs the paid Pro upgrade.",
    ["Moon+ Reader"],
    [S("Yahoo Tech: Moon+ Reader review", "https://www.yahoo.com/tech/moon-reader-review-220655508.html")],
    "weak", "press/review", "multi-year", "low",
    "Buy Pro (one-off).",
    "No ads, ever; PDF and EPUB both free.",
    "S")

add("Personalization", "love",
    "Moon+ Reader is praised as a smooth, highly customisable Android reader: many themes with auto day/night switching, gesture/tap mapping, TTS and dictionaries.",
    ["Moon+ Reader"],
    [S("Yahoo Tech: Moon+ Reader review", "https://www.yahoo.com/tech/moon-reader-review-220655508.html"),
     S("MobileRead Wiki: Moon+ Reader", "https://wiki.mobileread.com/wiki/Moon+ Reader")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Match Moon+ on themes and auto day/night; keep the UI cleaner than Moon+.",
    "M")

add("Pricing & subscriptions", "complaint",
    "Kobo Plus titles rotate out and it isn't always clear which books are included, per summaries of negative reviews.",
    ["Kobo"], [UNSTAR], "weak", "user-reports", "recent", "low",
    "Track titles manually.",
    "No rotating catalogue; anything imported stays.",
    "S")

add("Discovery & purchasing", "complaint",
    "Popular Libby bestsellers can take 8-16 weeks of waiting, and libraries are tightening hold rules (e.g., suspended holds now auto-cancel after a year) to speed circulation.",
    ["Libby"],
    [UNSTAR, S("TRL: Libby holds are changing", "https://trl.org/blogs/post/libby-holds-update/")],
    "moderate", "official", "recent", "low",
    "Multiple library cards; buy the book.",
    "Out of scope for DRM loans; SAGA can show 'available free' links for public-domain editions (Standard Ebooks/Gutenberg).",
    "S")

add("Discovery & purchasing", "love",
    "Libby is loved for being free, supporting local libraries, and having no ads or recommendation clutter.",
    ["Libby"], [UNSTAR, S("Everyday Reading: Why I love the Libby app", "https://everyday-reading.com/libby-app/comment-page-1/")],
    "moderate", "user-reports", "multi-year", "medium",
    "n/a",
    "Adopt Libby's calm, clutter-free tone; never put store promotion on the home screen.",
    "S")

add("Discovery & purchasing", "complaint",
    "Kindle's app home screen is dominated by recommendations, and Kindle devices push the store heavily.",
    ["Amazon Kindle"], [UNSTAR, KDIS], "moderate", "user-reports", "multi-year", "low",
    "Switch to library view.",
    "Home opens to 'Continue reading' and your shelves; no store.",
    "S")

add("Annotations", "complaint",
    "Apple Books annotation export is per-book and awkward for heavy note-takers.",
    ["Apple Books"], [UNSTAR], "weak", "user-reports", "multi-year", "medium",
    "Email notes per book; third-party exporters.",
    "Library-wide annotation view with search and bulk export.",
    "S")

add("Import & formats", "love",
    "Apple Books handles sideloaded EPUBs and PDFs smoothly with no extra account, and is preinstalled with a clean UI.",
    ["Apple Books"], [UNSTAR], "weak", "user-reports", "multi-year", "medium",
    "n/a",
    "Match the 'open in' import ease on iOS: share sheet, Files app, AirDrop.",
    "S")

add("Import & formats", "complaint",
    "Getting non-Kobo EPUBs into the Kobo iOS app requires a desktop workflow, per review summaries.",
    ["Kobo"], [UNSTAR], "weak", "user-reports", "multi-year", "medium",
    "Use Kobo desktop/Dropbox on device.",
    "Import directly on phone from Files, share sheet, browser downloads, OPDS.",
    "S")

add("Import & formats", "love",
    "PocketBook devices are praised for broad format support (EPUB, PDF, MOBI, FB2, comics, DRM-free AZW), multilingual TTS, and free cloud storage for moving books between devices.",
    ["PocketBook"],
    [S("Notebookcheck: PocketBook Verse Pro Color review", "https://www.notebookcheck.net/PocketBook-Verse-Pro-Color-review-A-color-display-and-audiobooks-in-a-compact-e-reader.895892.0.html"),
     S("Expert Reviews: PocketBook InkPad One - diverse file support", "https://www.expertreviews.co.uk/technology/tablets-ereaders/pocketbook-inkpad-one-review")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Support EPUB, PDF, TXT, and add FB2/CBZ/DRM-free AZW3 import (convert to EPUB) early.",
    "M")

add("Audio & TTS", "unmet-need",
    "Whispersync's link between Kindle text and Audible narration lets readers swap between reading and listening without losing their place; Apple Books doesn't link audio and ebook positions automatically.",
    ["Amazon Kindle", "Apple Books"],
    [S("Android Authority: the Kindle feature stopping me switching", "https://www.androidauthority.com/kindle-feature-stopping-me-switching-3591123"), UNSTAR],
    "moderate", "press/review", "multi-year", "medium",
    "Buy both formats on Amazon.",
    "TTS-based 'listen from here' that hands off exactly to reading position; later, align user-owned DRM-free audiobooks to EPUB text (forced alignment).",
    "XL")

add("Audio & TTS", "request",
    "Readest users request custom TTS engines, and its free AI voices are time-capped with paid plans for more.",
    ["Readest"],
    [S("Readest issues list (#258 custom TTS engine)", "https://issues.ecosyste.ms/hosts/GitHub/repositories/readest%2Freadest/issues?page=1"),
     S("Make Tech Easier: Readest ebook reader", "https://maketecheasier.com/readest-ebook-reader/")],
    "weak", "github-issue", "recent", "low",
    "Use OS TTS.",
    "Default to free on-device/OS voices; pluggable engines.",
    "M")

add("Academic & technical reading", "love",
    "Readest's side-by-side parallel reading of two books is singled out as useful for language learning and research, alongside built-in dictionary and Wikipedia lookups.",
    ["Readest"], [S("Make Tech Easier: Readest ebook reader", "https://maketecheasier.com/readest-ebook-reader/")],
    "weak", "press/review", "recent", "low",
    "n/a",
    "Desktop split view (book + book, or book + notes) and offline dictionary packs.",
    "M")

add("Sync", "complaint",
    "Readest sync can take minutes, a book can't be removed from its cloud directly, and syncing requires an account.",
    ["Readest"], [S("Make Tech Easier: Readest ebook reader", "https://maketecheasier.com/readest-ebook-reader/")],
    "weak", "press/review", "recent", "low",
    "Delete from originating device and re-upload.",
    "Near-real-time position sync (small payloads), clear per-book 'remove from cloud / remove from device' controls.",
    "M")

add("Device connectivity", "love",
    "Kobo's seamless Calibre support and the ability to install KOReader without jailbreaking are cited as reasons tinkerers prefer Kobo; Kindle's advantage is syncing Send-to-Kindle docs.",
    ["Kobo", "Calibre", "KOReader", "Amazon Kindle"],
    [S("The eBook Reader: Kindle + Kobo is the best combination", "https://blog.the-ebook-reader.com/2025/01/08/kindle-kobo-is-the-best-combination-why-take-sides")],
    "moderate", "press/review", "multi-year", "medium",
    "n/a",
    "Leaf should be open: documented transfer protocol, Calibre device driver, user-flashable firmware.",
    "L")

json.dump(F, open("/home/claude/saga/research/reader_findings.json", "w"), indent=1, ensure_ascii=False)
print(len(F))
