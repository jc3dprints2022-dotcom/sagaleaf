import json
P = ["Amazon Kindle", "Kobo", "Apple Books", "Google Play Books", "Readwise Reader", "Moon+ Reader",
     "Calibre", "KOReader", "BookFusion", "PocketBook", "Libby", "Readest", "Thorium", "Xteink X4 (stock/CrossPoint)"]
code = {"y": "yes", "p": "partial", "n": "no", "u": "unknown"}
rows = [
 ("EPUB sideload", "pyyyyyyyyynyyy", "Kindle: EPUB only via Send-to-Kindle server conversion, not USB. Libby: loans only."),
 ("PDF", "yyyyypyyyynyyn", "Moon+ PDF needs Pro (Yahoo review). X4 stock supports TXT/EPUB/images only (Digital Trends)."),
 ("TXT", "pynnuyyyuynyuy", "Unknown where not confirmed."),
 ("DRM-free export of own files", "ppupuyyyuynyyy", "Kindle: web USB download removed Feb 2025; DRM-free KDP titles downloadable as EPUB/PDF from 2026."),
 ("Cross-device position sync for sideloaded books", "pnyyyynpyunynp", "Kindle only for Send-to-Kindle docs; Kobo none (The eBook Reader 2024/2026); KOReader progress-only server; Moon+ via Dropbox/WebDAV; X4 via CrossPoint KOReader sync."),
 ("Highlight export (formats)", "pppyyuyyuuuuuu", "Kindle has publisher clipping limits; Play Books to Google Docs; Readwise to Markdown/Notion/Obsidian; KOReader has built-in exporters incl. Readwise."),
 ("Annotation sync for sideloaded books", "pnyyyynpyunynn", "KOReader needs plugins (AnnotationSync, Readest server)."),
 ("Works fully offline", "pyypppyyppppyy", "Kindle sideload-deletion bug after airplane mode; Readwise needs pre-caching; Readest PWA lacks offline."),
 ("No account required", "npnnnyyynynpyy", "Kobo setup can be skipped only with workarounds; Apple Books needs Apple ID for sync; Readest needs account only for sync."),
 ("Open source", "nnnnnnyynnnyyp", "X4: stock closed, CrossPoint firmware open."),
 ("Library lending", "pynnnnnnnuynpn", "Kindle: Libby delivery US only; Kobo: built-in OverDrive; Thorium: LCP library loans where offered."),
 ("Store", "yyyynnnnuynnnn", ""),
 ("TTS", "pnpyyyyuyyuyyn", "Kindle: VoiceView/Assistive Reader, Bluetooth needed, reportedly purchased books only; Moon+ TTS is Pro; Kobo lacks general TTS per user comments."),
 ("Dyslexia-friendly font", "yuuuuuppuupuun", "Kindle OpenDyslexic official since 2016; OverDrive added dyslexic font option 2015; others via custom fonts."),
 ("Custom fonts", "yyunuyyyuynpup", "Readest custom fonts was an open request (#237)."),
 ("Collections/tags", "yyyyyyyyyyyuun", ""),
 ("Full-text search across library", "uuuuuuyuuuuuuu", "Only Calibre confirmed (full-text search). Not verified for others."),
 ("Reading stats", "uyyuuuuyuuuuun", "KOReader statistics plugin; Kobo shows reading stats; Apple Books has reading goals."),
 ("Ads/upsell in reading UI (yes = bad)", "ynpppnnnuunuun", "Kindle lockscreen ads unless paid + recommendation-heavy home; Moon+ free has ads; Kobo shows no lockscreen ads (Laptop Mag)."),
 ("Telemetry on reading behaviour (yes = bad)", "ypuuuuunuuuuuu", "Kindle per Nullsweep traffic analysis; Kobo telemetry noted by an LWN commenter (weak)."),
 ("Price: core reading free", "yyyynpyypppyyp", "Kindle/Kobo apps free, devices paid; Readwise ~$10/mo; Moon+ Pro one-off; Readest paid plans from $5/mo; BookFusion subscription for larger uploads; X4 ~$69 device."),
 ("Web reader", "ynnyynpnyuyynn", "Calibre content server includes a browser viewer."),
 ("Android", "yynyyynyyyyynn", ""),
 ("iOS", "yyyyynnnyyyynn", ""),
 ("Desktop", "yppyynypyupyyn", "Apple Books Mac only; KOReader desktop builds mainly for development."),
 ("E-ink device support", "yynppppypypuny", "Android-based e-ink (Boox) can run Android apps."),
 ("OPDS", "nnnnuyyyuunuyu", "Moon+ OPDS per FAQ."),
 ("Calibre integration", "pynnnpyyyynuup", "BookFusion Calibre plugin; CrossPoint supports Calibre wireless."),
 ("PDF reflow", "pnnuuupyuunuun", "KOReader reflow is a key power-user draw."),
 ("Footnote popups", "puyuuuuyuuuuuu", "Kindle pop-ups show only first paragraph (user reports)."),
 ("Vertical scroll mode", "uuyuyyuyuuuuuu", ""),
 ("Page-turn animation options", "uuyuuyuuuuuuuu", "Apple restored curl option in iOS 16.4 after backlash."),
]
features = []
for f, v, note in rows:
    assert len(v) == len(P), f
    features.append({"feature": f, "values": {p: code[c] for p, c in zip(P, v)}, "note": note})
json.dump({"products": P, "features": features}, open("/home/claude/saga/research/reader_matrix.json", "w"), indent=1)

W = {"Reading quality": 14, "Ease of use": 10, "Library management": 7, "Synchronization": 11,
     "Offline functionality": 8, "Annotation quality": 7, "Format compatibility": 9, "Device integration": 8,
     "Accessibility": 7, "Privacy & ownership": 9, "Performance": 5, "Cost": 5}
assert sum(W.values()) == 100
cats = list(W)
raw = {
 "Amazon Kindle":     [7, 8, 5, 9, 6, 6, 4, 9, 7, 2, 7, 7],
 "Kobo":              [8, 8, 6, 5, 8, 5, 7, 8, 4, 6, 7, 7],
 "Apple Books":       [8, 8, 6, 7, 7, 5, 6, 3, 7, 5, 7, 9],
 "Google Play Books": [6, 7, 5, 7, 6, 6, 5, 3, 6, 4, 6, 9],
 "Readwise Reader":   [7, 6, 7, 8, 5, 9, 7, 4, 5, 5, 5, 3],
 "Moon+ Reader":      [8, 6, 6, 6, 9, 6, 8, 4, 6, 7, 7, 7],
 "Calibre":           [5, 3, 10, 2, 10, 5, 10, 7, 5, 10, 6, 10],
 "KOReader":          [9, 3, 6, 5, 10, 7, 9, 7, 4, 10, 6, 10],
 "Libby":             [6, 8, 4, 7, 6, 3, 2, 6, 6, 4, 6, 10],
}
scores = {p: dict(zip(cats, v)) for p, v in raw.items()}
rat = {
 "Amazon Kindle": "Best-in-class Whispersync, hardware, battery and store; weakest on ownership (USB download removal, telemetry, ads) and EPUB handling.",
 "Kobo": "Open formats, OverDrive, typography and Calibre/KOReader friendliness; no sync for sideloads and a long-running sync reliability problem; weak TTS.",
 "Apple Books": "Smooth EPUB/PDF sideloading and iCloud sync for free; iOS/Mac only, 2022 UI backlash, reports of lost highlights and awkward export.",
 "Google Play Books": "Free cross-platform upload and Drive notes export; opaque upload errors and no e-ink-first experience.",
 "Readwise Reader": "Strongest annotation/integration story; subscription price, cloud-first offline model and mobile lag pull it down.",
 "Moon+ Reader": "Deep customisation, own-storage sync, OPDS and TTS on Android; Android-only and ads/Pro paywall.",
 "Calibre": "Unmatched library power, conversion and ownership; dated UI and not a cross-device reading/sync product.",
 "KOReader": "Top typography/PDF power and fully offline/private; steep learning curve and partial sync without plugins.",
 "Libby": "Free, calm, beloved library access; formats and ownership limited by lending model, long holds.",
}
basis = {p: "published evidence only, not firsthand" for p in raw}
json.dump({"weights": W, "scores": scores, "basis": basis, "rationale": rat},
          open("/home/claude/saga/research/reader_scores.json", "w"), indent=1)
w = {p: round(sum(scores[p][c] * W[c] for c in cats) / 100, 2) for p in raw}
print(sorted(w.items(), key=lambda x: -x[1]))
