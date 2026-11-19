# Ideas brainstormed and how they scored

Each idea was scored 1–5 on four criteria:

- **Impact on reading**: does it make reading better, measurably or in the research?
- **Evidence**: is there a documented need behind it (finding IDs)?
- **Feasibility**: can it be built reliably by a small team?
- **Differentiation**: would incumbents struggle to copy it?

**Kept** ideas are in the roadmap. **Rejected** ideas add complexity without materially
improving reading.

| # | Idea | Impact | Evidence | Feasibility | Differentiation | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Resume mid-sentence**: Home shows the exact passage you stopped at, in your reading font | 4 | R-012 | 5 | 3 | **Built** |
| 2 | **One position per device, offer the newer one** instead of last-write-wins | 5 | R-057, R-012 | 5 | 4 | **Built** |
| 3 | **Quote-anchored annotations** that survive editions, devices and layout | 5 | R-048, R-049 | 4 | 4 | **Built** |
| 4 | **Conflicting note versions kept**, merged or picked by the user | 4 | brief | 4 | 4 | **Built** |
| 5 | **Leaf syncs by quoting text, not offsets** (survives conversion and a different pagination engine) | 5 | R-066 | 4 | 5 | **Built (simulated)** |
| 6 | **Zero-tap "send what I'm reading"** to the Leaf | 4 | R-007, R-045 | 4 | 4 | **Built (simulated)** |
| 7 | **Library code instead of an account**: end-to-end encrypted sync with no sign-up | 4 | R-003, R-069 | 4 | 4 | **Built** |
| 8 | **Merge duplicate editions, carrying highlights over** by re-anchoring | 3 | R-067 | 4 | 4 | **Built** |
| 9 | **Device-grade EPUB check for authors** (the same parser readers' devices use) | 3 | E-015 | 4 | 3 | **Built (prototype)** |
| 10 | **Read-aloud on any owned book with sentence highlight**, handing off to the Leaf | 5 | R-037, R-038, R-082 | 3 | 3 | **Kept: P1** |
| 11 | **Spoiler-safe recap**, generated only from text before your position, on device or with explicit consent; every line linked to a passage | 4 | brief | 2 | 4 | **Kept: P2, gated** (no quotes without a verified passage link; no book text leaves the device without consent) |
| 12 | **Character and place index from your read-so-far text** (local NLP, no AI service) | 3 | brief | 3 | 3 | **Kept: P2** |
| 13 | **Annotations as W3C Web Annotations everywhere** (export, import, sync format) | 3 | E-026 | 5 | 3 | **Built** (export); import planned |
| 14 | **Course packs**: a reading list plus shared, private-by-default annotations, with aggregate-only instructor views | 3 | E-023, E-025 | 3 | 4 | **Kept: P2** |
| 15 | **Bookstore shelves**: an indie store curates a SAGA shelf and earns on attributed sales | 2 | E-019, E-021 | 3 | 4 | **Kept: P2** (partnership-dependent) |
| 16 | **Opt-in "write to the author"** at purchase: the reader chooses, the author gets an email, SAGA keeps nothing | 2 | E-005 | 4 | 4 | **Kept: P1 with store** |
| 17 | **Leaf "read on my phone's screen-off"**: the phone pushes position to the Leaf over BLE when the screen locks | 3 | R-019 | 2 | 5 | **Kept: speculative**; needs BLE firmware |
| 18 | **Paper-like margin notes on the Leaf with physical buttons** | 2 | — | 2 | 3 | Rejected: 4 buttons, no keyboard; voice notes would be better and need audio hardware |
| 19 | **Social reading feed and public highlights by default** | 2 | R-034 | 4 | 1 | Rejected: conflicts with privacy; Goodreads and StoryGraph own this |
| 20 | **Gamified streaks and badges on by default** | 1 | R-065 | 5 | 1 | Rejected as a default; opt-in local stats only (RD-15) |
| 21 | **Page-curl animations** | 1 | R-015 | 4 | 1 | Rejected: users disliked Apple's animation changes; instant is better on e-ink too (the Leaf firmware made the same call) |
| 22 | **An all-you-can-read subscription** | 2 | E-003 | 1 | 1 | Rejected: no catalogue, conflicts with author pay |
| 23 | **AI-generated audiobook narration of purchased books** | 3 | R-082 | 2 | 1 | Rejected for now: rights unclear, Kindle+ is moving there with AI voices; system TTS on owned books covers the reading need |
| 24 | **Automatic metadata cleanup from online sources** | 3 | R-046 | 4 | 2 | **Kept: P2, opt-in** (looking up a title tells a third party what you own) |
| 25 | **Parallel reading of two editions or translations side by side** | 2 | R-084 | 3 | 3 | Kept: P2 (language learners) |
| 26 | **Reading-position "time machine"**: every device's place history, undo a bad jump | 3 | R-057 | 4 | 3 | Kept: P1, cheap given per-device rows |
| 27 | **Highlight heat map of your own re-reads** | 1 | — | 4 | 2 | Rejected: novelty, no evidence |
| 28 | **Leaf shows the phone's notification-free "focus timer"** | 1 | — | 3 | 2 | Rejected: distraction-free means not adding phone features to the Leaf |

## Why the AI ideas are fenced

The brief asks that AI be optional, privacy-conscious, clearly separated from the text,
and never fabricate quotations. Any assistant feature in SAGA will follow these rules:

- **Off by default.** It runs on device when possible. Sending book text to a service needs a per-book, explicit consent screen that names the service.
- **Every quotation is a link to a passage SAGA found in the text** with the same anchoring code used for highlights. If the passage isn't found, the line isn't shown.
- **Recaps use only text before the reader's position**, so they're spoiler-safe by construction.
- **Generated content is visually distinct** from the book and never stored as an annotation unless the reader saves it.
