# SAGA Leaf homepage: research and storyboard (milestone 1)

## Direction

One continuous camera shot, literary and calm. Near-black charcoal (`#0e0e10`), warm ivory type
(`#efe9dc`), one restrained amber accent (`#d39a4e`), book typography (Fraunces for display,
Literata for reading text, Hanken Grotesk for UI: the same families as the SAGA Reader app).
No gradients-as-decoration, no glass, no floating shapes. Every camera move answers a question
about the product, and every fact on screen comes from `src/data/specs.ts`.

## References: what we borrow and why

| Reference | Technique | What we borrow | What we leave |
|---|---|---|---|
| Apple product pages (AirPods Pro, iPad Pro "explode") | Scroll-scrubbed product reveal, one idea per viewport, exploded internals | The assembly beat and the rule "one callout per screen"; copy that says one thing | Image-sequence video (heavy); superlatives |
| Lusion (lusion.co) | Single persistent WebGL canvas behind DOM copy; restrained palette; camera as narrator | One pinned R3F canvas for the whole homepage; DOM text layered over it so it stays crawlable | Heavy post-processing (none in milestone 1) |
| Zentry (zentry.com) | Scroll-driven scene transitions with hard cuts disguised as camera moves | Scene boundaries hidden inside continuous moves (push into the screen, pull back to the phone) | The loud, gamer palette |
| Bruno Simon (bruno-simon.com) | Hand-built procedural 3D with honest, toy-like materials | Procedural model built in code from real dimensions; materials that look like what they are (printed plastic, PCB, steel) | Physics playground |
| Teenage Engineering product pages | Engineering drawings as marketing; exact dimensions shown plainly | Labels with real numbers and a visible status ("CAD estimate") | – |
| reMarkable / Kobo e-paper pages | E-paper shown without glow; calm paper tone | Unlit, diffuse paper material (`#DBDBD1`), page turn shown as a refresh flash, not a curl | Lifestyle photography (we have none yet) |
| GSAP ScrollTrigger + Lenis showcase sites | One master timeline scrubbed by scroll; smooth wheel | Single `gsap.timeline` scrubbing a plain state object: fully reversible by construction | Many independent ScrollTriggers (they drift and get stuck) |

## Architecture

- `StoryState` (`src/three/sceneState.ts`): one plain object: camera, look target, device transform,
  assembly amount, x-ray, screen state, phone, warmth.
- `StoryController.tsx`: builds one GSAP timeline (0–100 units) scrubbed by ScrollTrigger over
  `#story` (1300vh). It tweens only `StoryState` and DOM copy opacity. Lenis smooths the wheel.
- `StoryCanvas.tsx`: one R3F canvas that reads `StoryState` every frame. It owns no animation, so
  scrolling back replays exactly (tested in `tests/story.spec.ts`).
- Framing uses a camera lens shift (`setViewOffset`): device right of the copy on wide screens,
  above the copy panel on narrow screens. The authored path stays centred on the device.
- Default markup is the static, stacked layout. An inline script adds `html.cinematic` before first
  paint only when motion is allowed and WebGL exists, so the reduced-motion and no-WebGL paths are
  the same HTML without the upgrade.

## Scene by scene

Timeline units are 0–100 (≈13 viewport heights of scroll). "Desktop" = aspect > 1.05.

| # | Scroll | Camera / motion | Copy | Fact it proves | Fallback (static path) |
|---|---|---|---|---|---|
| Hero | 0–5 | Exploded stack floats at a three-quarter angle, slow idle sway | "SAGA Leaf" · "A small e-paper reader, made for one thing: the page in front of you." · "Not built yet…" · **Explore** / **Shop** | Status: not built, no date | `leaf-assembled.webp` |
| 1 Assembly | 5–25 | Layers settle in the documented order (bezel → panel → pcb → battery → ring → tray → skin → buttons), staggered; camera eases to three-quarter | "Eight layers, one quiet page." + numbered layer list lighting up in sync | Layer stack and z-levels (rev 4 CAD, estimated) | `leaf-exploded.webp` + full layer list |
| 2a Display | 25–30 | Turn toward front | "3.97″ e-paper, 480 × 800" | Datasheet; unlit; front light planned | `leaf-rear.webp`, `leaf-side.webp`, all callouts listed |
| 2b Buttons | 30–35 | Left edge to camera, close on upper side | "Four physical buttons. No touchscreen" | Button layout (5 / 12 mm below top) | ″ |
| 2c Ports | 35–40 | Tilt bottom edge to camera (USB-C opening) | "USB-C and microSD" | rev 4 board parts | ″ |
| 2d Ring | 40–46 | Rear to camera, shell goes see-through to show ring + battery; turn; a plain phone silhouette slides in behind and snaps on (expo-in) | "MagSafe-pattern magnetic ring" | Ring 54/46/2.0 mm; no Apple claim | ″ |
| 2e Thin | 46–50 | Phone lets go; near side profile | "About 8.5 mm thin (CAD estimate)" | 64.19 × 102.02 × 8.47 mm, ~62 g, estimated | ″ |
| 3 Screen | 50–70 | Face-on, push in until the page fills the viewport height (desktop) / the upper viewport (phone). Refresh flash page turn (inverted frame), type menu → larger size, grayscale highlight sweep, note card | "Then the device disappears." Turn / Set the type / Keep a thought. Badge: "Concept screen: device UI in development" | Firmware designed-for features, in development | `leaf-screen.webp` (the same canvas drawing) |
| 4 Ecosystem | 70–84 | Pull back; Leaf left, phone with real app screenshots right (Library → Discover → Settings) | "The app is already here." Tags "SAGA Reader app (live)", "Leaf ↔ app sync: planned"; link to /saga-reader.html | App is live; sync planned | Three app screenshots |
| 5 Studio | 84–100 | Phone exits; three-quarter, light warms to product studio, idle sway returns | "Make it yours, when it's ready." **Build your SAGA Leaf** → /leaf/shop/ | Preorder interest only | `leaf-studio.webp` |

After the story: "Where it stands" (status specs) and links to the spec page and configurator.

## Fallbacks and quality

- **Reduced motion:** no `cinematic` class → no Lenis, no ScrollTrigger, no canvas; stacked sections with static WebP renders.
- **No WebGL:** same as reduced motion. Shop shows the matching static render per finish.
- **Before 3D loads:** the story is already scrollable; the pinned stage shows `leaf-hero.webp` (rendered from the same camera) until the first frame, then cross-fades.
- **Mobile:** DPR capped at 1.25, no antialias, fewer PCB details, no contact shadows, no post-processing.
- **Accessibility:** real headings in HTML, skip link, visible amber focus ring, hidden beats use `visibility: hidden` so they're out of the tab order; canvas is `aria-hidden`.

## Asset plan

**Have (used in milestone 1)**
- Facts block numbers → `src/data/geometry.ts`, `src/data/specs.ts`.
- Real SAGA Reader screenshots at 390 × 844 (captured from a scratch build of `app/` with Playwright; public-domain books): `public/app/*.webp`.
- Fonts from the app (OFL): Literata, Fraunces, Hanken Grotesk.
- Procedural concept model (`src/three/leafModel.ts`) and static renders made from it (`public/renders/*.webp`, `public/og.jpg`).

**Missing (needed from Proxima)**
- `public/models/leaf.glb` exported from the rev 4 STEP (same node names, mm, origin bottom-left-rear; Draco/Meshopt compressed, < 1.5 MB).
- Real product photography (none exists; no device built).
- Final firmware UI screens (the on-device page is a concept drawing).
- Final finishes and production materials (Copper/Slate are CAD-render concepts).
- Prices, SKUs, stock, ship date (none exist; the catalogue schema supports them).
- Front-lit panel decision and accessory designs (cases/folios).
