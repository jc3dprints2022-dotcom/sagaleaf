# Rev 4 CAD -> web GLB, and real app screenshots

Provenance for the assets added on branch `leaf-assets-rev4` (prepared 2026-11-22).

## `public/models/leaf.glb`
- Source: `saga_leaf_v2_rev4_assembly_unlit_c504040y.step` (rev 4 CAD, unlit panel, YDL 504040 cell). Not in this repo.
- `step_to_parts.py <step> parts.npz` (cadquery-ocp 8.x): reads the named STEP products, tessellates each (0.02 mm linear / 0.2 rad angular deflection).
- `build_glb.py` (trimesh): groups parts into the site's node contract and writes the GLB; then
  `gltf-transform meshopt leaf-rev4.glb leaf.glb` (EXT_meshopt_compression + KHR_mesh_quantization, 64 KB; raw ~370 KB).
- Units mm, origin and axes exactly as `src/data/geometry.ts` describes. Group nodes have identity transforms.
  Each named part node (e.g. `btn-back`) wraps a `<name>-mesh` child that carries the meshopt dequantization
  transform: animate the named nodes, never the `-mesh` children.
- `public/models/leaf.parts.json`: node tree, bounding boxes, CAD z levels, notes.
- `docs/cad/leaf-rev4-preview.png`: three.js r170 render of the GLB (exploded + assembled) as a sanity check.

## `public/app/real/*.webp`
Captured from the live https://saga.proxima-3d.com/saga-reader.html with headless Chromium, no sign-in, no personal data,
public-domain sample books only. `phone-*` = 390x844 @2x, `tablet-*` = 834x1194 @2x. Script: `capture-app-screens.mjs`.
