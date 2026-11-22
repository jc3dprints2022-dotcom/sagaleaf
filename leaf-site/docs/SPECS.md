# SAGA Leaf site: every spec string and its source

The site may show only facts from the facts block in Task 06. This file lists every product
statement on the site with its status and source. `src/data/specs.ts` is the single source in code
(each entry carries `src` and `status`); the table below is generated from it with
`node --experimental-strip-types scripts/specs-table.ts`, and `tests/specs.spec.ts` fails if they drift.

**Status:** Confirmed = measured or decided · Datasheet = from the part's datasheet ·
Estimated = CAD model output, never physically measured · Planned = intended, not built ·
In development = being written, not yet run on Leaf hardware.

## Specs (`src/data/specs.ts`)

| id | Group | Label | Value shown | Status | Source |
|---|---|---|---|---|---|
| `status-build` | Status | Hardware | No device has been built or run on hardware yet | Confirmed | Proxima project status |
| `status-board` | Status | Board 1 (rev 4) | Designed and DRC-clean, not yet ordered | Confirmed | rev4 board design |
| `status-date` | Status | Ship date and price | Not set. We won’t give a date until it is ready | Confirmed | Proxima project status |
| `status-maker` | Status | Designed by | Proxima LLC, Arizona | Confirmed | Proxima project status |
| `display-size` | Display | Screen | 3.97″ monochrome e-paper | Datasheet | Good Display GDEY0397T81P datasheet |
| `display-res` | Display | Resolution | 480 × 800 pixels, portrait | Datasheet | Good Display GDEY0397T81P datasheet |
| `display-active` | Display | Active area | 51.84 × 86.40 mm | Datasheet | Good Display GDEY0397T81P datasheet |
| `display-panel` | Display | Panel | Good Display GDEY0397T81P | Datasheet | Good Display GDEY0397T81P datasheet |
| `display-unlit` | Display | Lighting | Board 1 is unlit (no front light) | Confirmed | rev4 board design |
| `display-frontlight` | Display | Front light | Planned / under evaluation | Planned | rev4 CAD front-lit variant; lit-panel quote pending |
| `display-touch` | Display | Touch | No touchscreen. Four physical buttons | Confirmed | design decision, Nov 13 2026 |
| `size-skin` | Size and weight | Size with rear skin | 64.19 × 102.02 × 8.47 mm (CAD estimate) | Estimated | rev4 CAD report |
| `size-core` | Size and weight | Core body | 62.69 × 100.52 × 7.87 mm (CAD estimate) | Estimated | rev4 CAD report |
| `size-thin` | Size and weight | Thickness | About 8.5 mm thin (CAD estimate) | Estimated | rev4 CAD report |
| `size-mass` | Size and weight | Weight | About 62 g with skin (CAD estimate) | Estimated | rev4 CAD report |
| `size-corner` | Size and weight | Corner radius | 3.5 mm (CAD estimate) | Estimated | rev4 CAD report |
| `elec-mcu` | Electronics | Processor | ESP32-C3 module (ESP32-C3-MINI-1-H8X, 8 MB) with Wi-Fi | Confirmed | rev4 board design (unverified on hardware) |
| `elec-pcb` | Electronics | Board | 0.8 mm custom PCB | Confirmed | rev4 board design (unverified on hardware) |
| `elec-sd` | Electronics | Storage | microSD slot; you supply the card | Confirmed | rev4 board design, Molex 104031 |
| `elec-usb` | Electronics | Port | USB-C for charging and data, bottom edge | Confirmed | rev4 board design, GCT USB4110 |
| `elec-charger` | Electronics | Charging | TI BQ21040 charger with battery-temperature protection | Confirmed | rev4 board design (unverified on hardware) |
| `elec-buttons` | Electronics | Buttons | Four: BACK and PREV on the left, SELECT and NEXT on the right | Confirmed | rev4 CAD button layout |
| `power-battery` | Power | Battery | 1000 mAh battery (selected cell, subject to change) | Planned | YDL 504040 selection; supplier replied, not ordered |
| `attach-ring` | Attachment | Magnetic attachment | MagSafe-pattern magnetic ring, so it can snap to the back of a phone or a magnetic mount | Confirmed | rev4 CAD ring, 54 mm OD / 46 mm ID / 2.0 mm |
| `enc-skin` | Enclosure | Rear skin | 0.6 mm snap-on rear skin | Confirmed | rev4 CAD rear skin |
| `enc-finish` | Enclosure | Finishes | Copper and Slate (concept renders) | Planned | rev4 CAD renders |
| `enc-material` | Enclosure | Materials | Prototypes are 3D-printed; production materials undecided | Confirmed | Proxima project status |
| `sw-base` | Software | Firmware | Based on the open-source CrossPoint e-reader firmware | In development | Leaf firmware plan (not yet run on Leaf hardware) |
| `sw-epub` | Software | Books | Designed for EPUB with reflowable text, stored on microSD | In development | Leaf firmware plan |
| `sw-type` | Software | Typography | Designed for adjustable fonts, size and margins, with custom fonts from microSD | In development | Leaf firmware plan |
| `sw-notes` | Software | Notes | Designed for bookmarks, highlights and notes saved on the device | In development | Leaf firmware plan |
| `sw-upload` | Software | Transfer | Designed for wireless book upload over Wi-Fi | In development | Leaf firmware plan |
| `sw-offline` | Software | Offline | Designed for fully offline reading | In development | Leaf firmware plan |
| `app-live` | App | SAGA Reader app | Live on the web; Android test build exists | Confirmed | saga.proxima-3d.com/saga-reader.html |
| `app-sync` | App | Leaf ↔ app sync | Planned, not working on hardware | Planned | SAGA Reader Devices screen (simulated Leaf only) |

**Homepage callouts** (each points at a spec above)

| Callout text | Spec | Source |
|---|---|---|
| 3.97″ e-paper, 480 × 800 | `display-size` | Good Display GDEY0397T81P datasheet |
| Four physical buttons. No touchscreen | `elec-buttons` | rev4 CAD button layout |
| USB-C and microSD | `elec-usb` | rev4 board design |
| MagSafe-pattern magnetic ring | `attach-ring` | rev4 CAD ring |
| About 8.5 mm thin (CAD estimate) | `size-thin` | rev4 CAD report |

## Other product statements in copy

| Where | String | Status | Source |
|---|---|---|---|
| Home hero | "Not built yet. It isn't ready, and we won't give a date until it is." | Confirmed | Proxima project status; live landing page wording |
| Home, assembly layer notes (`src/data/geometry.ts` `LAYERS`) | Bezel "Front frame, rebated over the panel" | Estimated | rev4 CAD report |
| ″ | E-paper panel "3.97″, 480 × 800, monochrome" | Datasheet | Good Display GDEY0397T81P datasheet |
| ″ | Board 1 (rev 4) "ESP32-C3, microSD, USB-C, 0.8 mm PCB" | Confirmed | rev4 board design |
| ″ | Battery "1000 mAh selected cell, subject to change" | Planned | YDL 504040 selection |
| ″ | Magnetic ring "MagSafe-pattern, 54 mm" | Confirmed (design) | rev4 CAD ring |
| ″ | Rear shell "3D-printed prototype enclosure" | Confirmed | Proxima project status |
| ″ | Rear skin "Snap-on, 0.6 mm, concept finishes" | Confirmed (design) / finishes concept | rev4 CAD rear skin |
| ″ | Buttons "BACK · PREV left, SELECT · NEXT right" | Confirmed | rev4 CAD button layout |
| Home, hardware callouts | "Board 1 is unlit; a front light is planned and under evaluation." | Confirmed / Planned | rev4 board design; lit-panel quote pending |
| ″ | "64.19 × 102.02 × 8.47 mm with the rear skin, about 62 g. Estimated from the CAD model" | Estimated | rev4 CAD report |
| Home, screen beat | "Fonts, size and margins, with your own fonts from microSD" / "Highlights and notes, saved on the device" / page turn as an e-paper refresh | In development | Leaf firmware plan (CrossPoint-based) |
| ″ | "Concept screen: device UI in development" label, grayscale 480 × 800 page | Concept | screen drawn by `src/three/screenTexture.ts`; text is *Pride and Prejudice* (public domain) |
| Home, ecosystem | "SAGA Reader runs today in your browser, and an Android test build exists" | Confirmed | live app at /saga-reader.html |
| ″ | "Leaf ↔ app sync: planned … works against a simulated Leaf today, not on hardware" | Planned | app Devices screen (simulated Leaf) |
| Shop / cart (`src/data/catalog.dev.json`) | SAGA Leaf (unlit); Front-lit (planned, disabled); Copper; Slate; "No accessories announced yet" | concept: true, price: null | each item's `source` field |
| Shop / cart | "Price not set yet"; "No payment is taken and nothing is reserved" | Confirmed | no price exists; waitlist provider only |
| Support FAQ | "We'll share a date when there is one"; "No: e-paper with four buttons"; "Sync is planned"; no price yet; Board 1 unlit, front light planned; EPUB on microSD and Wi-Fi upload in development | as per specs above | specs above |

## Concept-model numbers that are *not* specs

`src/data/geometry.ts` also holds a few placeholders marked `status: 'assumed'` (end-wall
thickness, wall height under the bezel, PCB outline split, battery and ring placement, button cap
size). They exist only so the procedural model can draw; they are never shown as text and will be
replaced by the rev 4 CAD GLB. The ESP32-C3-MINI-1 module outline (13.2 × 16.6 × 2.4 mm) is from
Espressif's datasheet and likewise only drives geometry.

## Built-output grep

See the PR body for the grep of `/leaf/` for "FCC", "battery life", "hours", "$" and "ships",
with an explanation of each hit.
