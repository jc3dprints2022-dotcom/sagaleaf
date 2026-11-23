# SAGA Leaf homepage: research and storyboard

Milestone 1 built the story on a procedural concept model. The polish pass (Task 07) keeps the
story and replaces the model with the real rev 4 CAD (`public/models/leaf.glb`) and the app
screens with real screenshots (`public/app/real/`).

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
| Bruno Simon (bruno-simon.com) | Hand-built 3D with honest, toy-like materials | Materials that look like what they are (matte printed plastic, PCB, dark steel, satin skin); the CAD's plain box envelopes are shown as clean engineering blocks, not dressed up | Physics playground |
| Teenage Engineering product pages | Engineering drawings as marketing; exact dimensions shown plainly | Labels with real numbers and a visible status ("CAD estimate") | – |
| reMarkable / Kobo e-paper pages | E-paper shown without glow; calm paper tone | Unlit, diffuse paper material (`#DBDBD1`), page turn shown as a refresh flash, not a curl | Lifestyle photography (we have none yet) |
| GSAP ScrollTrigger + Lenis showcase sites | One master timeline scrubbed by scroll; smooth wheel | Single `gsap.timeline` scrubbing a plain state object: fully reversible by construction | Many independent ScrollTriggers (they drift and get stuck) |

## Architecture

- `StoryState` (`src/three/sceneState.ts`): one plain object: camera, look target, device transform,
  assembly amount, x-ray, screen state, phone, warmth.
- `StoryController.tsx`: builds one GSAP timeline (0–100 units) scrubbed by ScrollTrigger over
  `#story` (1300vh). It tweens only `StoryState` and DOM copy opacity. Lenis smooths the wheel.
- `StoryCanvas.tsx`: one R3F canvas that reads `StoryState`. It owns no animation, so scrolling
  back replays exactly (tested in `tests/story.spec.ts`). Frames are drawn on demand: when the
  timeline moves, while the idle turntable runs, and when the model or a texture arrives.
- `src/three/timeline.ts`: everything discrete (which app screen the phone shows, the e-paper
  page and type size) and the phone's whole pose are pure functions of timeline time, with
  explicit thresholds. No tween start values, no hysteresis, no clock.
- `src/three/leafGlb.ts` + `useLeafModel.ts`: load `leaf.glb` (meshopt, no Draco) once, hand each
  canvas its own clone and materials, and fall back to the procedural builder in `leafModel.ts`
  if the file cannot be loaded. Both return the same `LeafModel` handle.
- `src/three/parts.ts`: the CAD manifest (`leaf.parts.json`). Callouts, layer chips, the phone's
  snap position and the screen push-in are anchored to its bounding boxes.
- Framing uses a camera lens shift (`setViewOffset`): device right of the copy on wide screens,
  above the copy panel on narrow screens. The authored path stays centred on the device.
- Default markup is the static, stacked layout. An inline script adds `html.cinematic` before first
  paint only when motion is allowed and WebGL exists, so the reduced-motion and no-WebGL paths are
  the same HTML without the upgrade.

## Scene by scene

Timeline units are 0–100 (≈13 viewport heights of scroll). "Desktop" = aspect > 1.05.

| # | Scroll | Camera / motion (what the move shows) | Copy | Fact it proves | Fallback (static path) |
|---|---|---|---|---|---|
| Hero | 0–5 | Exploded CAD stack at a three-quarter angle, slow idle sway | "SAGA Leaf" · "A small e-paper reader, made for one thing: the page in front of you." · "Not built yet…" · **Explore** / **Shop** | Status: not built, no date | `leaf-assembled.webp` |
| 1 Assembly | 5–25 | One slow turn around the stack while the layers settle in the documented order (bezel → panel → pcb → battery → ring → tray → skin → buttons), staggered. Passing behind shows the underside of the board (the parts hang below the PCB) and the skin clicking on; the button caps slide sideways into their slots as the front comes back. Numbered chips ride on each layer, anchored to its CAD bounding box | "Eight layers, one quiet page." + numbered layer list lighting up in sync | Layer stack and z-levels (rev 4 CAD, estimated) | `leaf-exploded.webp` (seen from behind, board underside in view) + full layer list |
| 2a Display | 25–30 | Turn to face the screen | "3.97″ e-paper, 480 × 800" | Datasheet; unlit; front light planned | `leaf-rear.webp`, `leaf-side.webp`, all callouts listed |
| 2b Buttons | 30–35 | Left edge to camera, close on the BACK / PREV slots (camera aimed at the caps' CAD position) | "Four physical buttons. No touchscreen" | Button layout | ″ |
| 2c Ports | 35–40 | Right edge to camera, on the USB-C mouth in the side wall (camera aimed at the `usb-c` part) | "USB-C and microSD" | rev 4 CAD: USB-C on the right side | ″ |
| 2d Ring | 40–46 | Carry on round to the rear, shell goes see-through to show ring + battery; turn; a plain phone silhouette slides in behind and snaps on at the ring's height | "MagSafe-pattern magnetic ring" | Ring 54 mm OD at y 71.6 mm; no Apple claim | ″ |
| 2e Thin | 46–50 | Phone lets go; near side profile | "About 8.5 mm thin (CAD estimate)" | 64.19 × 102.02 × 8.47 mm, ~62 g, estimated | ″ |
| 3 Screen | 50–70 | Square up, then push in until the `screen` quad exactly fills the viewport (its height on wide screens, its width on narrow ones; the nav steps aside). Refresh flash page turn, type menu → larger size, grayscale highlight sweep, note card | "Then the device disappears." Turn / Set the type / Keep a thought. Badge: "Concept screen: device UI in development" | Firmware designed-for features, in development | `leaf-screen.webp` (the same canvas drawing) |
| 4 Ecosystem | 70–84 | Pull back out; Leaf left, phone with real app screenshots right (Library → reader with highlights → Text and layout → Discover → Settings) | "The app is already here." Tags "SAGA Reader app (live)", "Leaf ↔ app sync: planned"; link to /saga-reader.html | App is live; sync planned | The same five real screenshots |
| 5 Studio | 84–100 | Phone exits; three-quarter, light warms to product studio with a contact shadow on the floor, idle sway returns | "Make it yours, when it's ready." **Build your SAGA Leaf** → /leaf/shop/ | Preorder interest only | `leaf-studio.webp` |

The on-device e-paper screen is always the grayscale concept page from `screenTexture.ts`,
labelled "Concept screen: device UI in development". The web app's colour UI only ever appears on
the phone.

After the story: "Where it stands" (status specs) and links to the spec page and configurator.

## Fallbacks and quality

- **Reduced motion:** no `cinematic` class → no Lenis, no ScrollTrigger, no canvas; stacked sections with static WebP renders (made from the CAD model) and the real app screenshots.
- **No WebGL:** same as reduced motion. Shop shows the matching static render per finish.
- **Before 3D loads:** the story is already scrollable; the pinned stage shows a poster of the hero frame (rendered from the same camera; a separate one for narrow screens) until the GLB and textures have drawn a first frame, then the canvas fades in over it. The shop does the same with a poster per finish.
- **GLB fails to load:** the procedural fallback is drawn instead and the label changes to "Concept model".
- **Lighting:** soft key (casting soft shadows on desktop), amber rim, cool fill, and a small Lightformer environment (no HDR download). Contact shadow in the studio beat and the shop: a blurred depth pass on desktop, a single soft blob on phones.
- **Mobile:** DPR capped at 1.5, no antialias, no shadow maps, blob contact shadow, no post-processing; frames only on demand; textures, materials and geometry are disposed on unmount.
- **Accessibility:** real headings in HTML, skip link, visible amber focus ring, hidden beats use `visibility: hidden` so they're out of the tab order; canvas is `aria-hidden` on the homepage and a labelled `img` in the shop; configurator options are native radios in labelled fieldsets.

## Asset plan

**Have**
- Facts block numbers → `src/data/geometry.ts`, `src/data/specs.ts`.
- Rev 4 CAD model: `public/models/leaf.glb` (76 KB, meshopt) + `leaf.parts.json`; provenance in `scripts/cad/README.md`.
- Real SAGA Reader screenshots, phone 390 × 844 @2x and tablet 834 × 1194 @2x: `public/app/real/*.webp` (live app, no sign-in, public-domain books).
- Fonts from the app (OFL): Literata, Fraunces, Hanken Grotesk.
- Static renders made from the CAD model (`public/renders/*.webp`, `public/og.jpg`) with `npm run renders`.

**Missing (needed from Proxima)**
- Detailed CAD for the parts that are still box envelopes (battery, module, microSD, connectors, switches, passives).
- Real product photography (none exists; no device built).
- Final firmware UI screens (the on-device page is a concept drawing).
- Final finishes and production materials (Copper/Slate are concept finishes).
- Prices, SKUs, stock, ship date (none exist; the catalogue schema supports them).
- Front-lit panel decision and accessory designs (cases/folios).
