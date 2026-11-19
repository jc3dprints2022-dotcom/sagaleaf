# SAGA design system

## Idea

SAGA's palette comes from its hardware: e-ink paper, slate ink, and the oxidized copper
of the Leaf's skins. It avoids the warm cream and terracotta look that most reading apps
(and most generated designs) share. The one bold move is **Home opening on the sentence
you stopped at**, set in your own reading font. Everything else stays quiet so that move
carries the screen.

## Colour

All text pairs meet WCAG AA, checked with axe-core on 11 screens: 0 violations.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#eceee9` | `#161b1e` | App background: cool e-ink mist |
| `--sheet` | `#f7f8f5` | `#1d2428` | Raised surfaces |
| `--well` | `#e2e5df` | `#242c31` | Inset controls, hovers |
| `--ink` | `#1f2a30` | `#e1e6e3` | Text: slate |
| `--muted` | `#57646a` | `#8b9894` | Secondary text (5.2:1 on paper) |
| `--accent` | `#24695c` | `#5fb3a1` | Verdigris: actions, focus, progress (5.5:1) |
| `--copper` / `--copper-ink` | `#b06a3b` / `#8f4f26` | `#d48b5c` / `#e2a57c` | **Leaf only**: device art, Leaf progress, Leaf badges |
| Highlights | amber `#f2d27a`, sage `#b9d8b0`, sky `#b5d3ea`, rose `#efbfc4` | | |

Reading themes are separate from app colours:

| Theme | Background | Text | Muted text |
|---|---|---|---|
| Day | `#fbfbf8` | `#1d2326` | `#5d686c` |
| Warm | `#f4e9d3` | `#3b2f22` | `#6e5d47` |
| E-ink | `#e6e8e3` | `#222826` | `#575e5b` |
| Night | `#121517` | `#c8cfcb` | `#8f9a96` |
| Auto | follows the system (Day or Night) | | |

## Type

| Role | Face | Notes |
|---|---|---|
| Interface | Hanken Grotesk (variable) | 15 px base; sentence case; no all-caps labels |
| Book titles, page titles, passages | Newsreader (variable) | Display weight 600, tracking −0.02em at large sizes |
| Reading (user choice) | Literata (default), Newsreader, Georgia, Atkinson Hyperlegible, OpenDyslexic, system sans | Atkinson and OpenDyslexic for low vision and dyslexia |

Scale: 13 / 15 / 18 / 22 / 28–40 (page title, fluid). Reading text defaults to 18 px with
1.55 line height and about 66 characters per line ("Medium").

## Layout

- **Desktop:** a 236 px rail (navigation, then Discover, Author, Publisher, Settings; the sync status sits at the foot in plain words). Content is left-aligned with a 1,180 px maximum.
- **Phone (≤ 860 px):** a bottom tab bar with Home, Library, Notes, Search and Devices.
- **Reader:** full bleed. Chrome auto-hides on the first page turn. Edges turn pages; the centre toggles chrome. Panels (contents, search, notes, text) slide in from the right and replace each other rather than stacking.

## Components

- **Covers:** the publisher's art when the file has it. Otherwise a typographic cover tinted per book from a hash of title and author, with a spine shading on the left edge. A format badge appears only for non-EPUB files; a cloud badge marks a book whose file is on another device.
- **Progress bars:** 4 px, verdigris; copper for a Leaf's position.
- **Pills:** state only (Paired, In review, Must fix). Never decoration.
- **Toasts:** one line with at most one action, named for exactly what it does ("Read now", "Undo").
- **Selection menu:** dark capsule with four colour swatches, Note, Copy and Find. It appears above the selection, or below near the top edge.
- **Leaf art:** a CSS drawing of the device in its copper skin, showing the passage actually open on that Leaf, labelled "Simulator" when it is one.

## Writing

- Plain verbs, sentence case, and the reader's words: "Send what I'm reading", not "Auto-sync policy".
- Errors say what happened and what to do: "Wrong password. The default is printed in the Leaf's manual; you may have changed it in its settings."
- Empty states invite an action: "Drop EPUB, PDF or text files anywhere on this page".
- Sync status is never technical: "Up to date, 2 min ago", "Offline. 3 changes will sync later", "Can't reach sync right now".

## Motion

Only motion that answers an action:

- panels slide in (220 ms);
- dialogs rise (200 ms);
- toasts rise;
- chrome slides away on reading.

No page-curl, no entrance animations, and everything respects `prefers-reduced-motion`.

## Screens

Home, Library (covers and list), Book details, Reader (with contents, search, notes and
text panels, selection menu, note editor and "pick up where your Leaf left off"),
Highlights and notes (including Recently deleted and conflicting versions), Search,
Collections, Devices (sync setup, library code, Leaf pairing), Leaf management, Settings,
Discover, SAGA Author (upload, file check, details, report), SAGA Publisher (queue,
review). Screenshots of each are in `screenshots/`.
