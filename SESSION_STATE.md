# Session State - Azure Realism Pass (2026-10-31)

## Summary of changes made this session

### Realistic ground and rocks
- **rockmat.js**: Added second PBR map set for Rock 3 (Poly Haven CC0 pitted rock) — triplanar color/normal/roughness for the dark basalt rock family. Rock 022 retained for limestone/sandstone; procedural fallback unchanged.
- **terrain.js**: Added rocky substrate that shows through on steep ground where sand doesn't accumulate. Added Rock 3 texture loading. Added photic-zone algae tint (green fuzz on flats, pink crust on reef faces) in shallow shelf habitats.
- **geology.js**: Called `smoothBoulderNormals(geo)` after `computeVertexNormals()` in `makeBoulder()` to average normals at coincident vertices while preserving collision triangles.

### Algae and environmental detail
- **flora.js**: Added `makePhoticAlgae()` — red/green algae tufts (2–20 m) in shallow photic shelves at Glass Horizon, Roseglass, Verdant. Integrated kelp-blade.jpg texture as blade tissue detail on kelp via `uBladeMap` uniform.

### Ocean waves, flow, foam
- **ocean.js**: Replaced 4-direction swell set with long ground swell (260m) + wind sea (110m) + chop (50m) + capillary ripples (28m). Added analytic crest foam. Added `uCurrent` uniform (0.08, 0.04) advecting chop patterns for visible surface flow.
- **main.js**: Drives `ocean.uCurrent` each frame for constant surface drift.

### Natural fish and organism movement
- **school-simulation.js**: Added per-fish momentum (sweeping turns, not snaps), burst-and-glide speed pulsing, and pitch attitude (nose up/down with vertical movement). Updated performance-equivalence test hash (intentional change).
- **flora.js**: Kelp/sea grass already sway; algae tufts added.

### Azure Span fix
- **geology.js**: Azure boulders deterministically relocated away from gate bowl and approach (already done in prior pass).
- **portals.js**: Azure portal prefers exact-surface + sampled approach certification instead of blanket AABB rejection.
- **controller.js**: Added `resolveSweptSurfaceSolids()` — radius-spaced sphere sweep against visible geology prevents high-speed tunneling through thin rock faces.
- **mesh-contact.js**: Rewrote with BVH (bounding volume hierarchy) for fast narrow-phase triangle contact; verified against brute-force for 8000 probes.
- New tests: `mesh-contact-bvh-regression.mjs`, `geology-sweep-regression.mjs`.
- **feature-garden-plan.js**: Added more Azure garden candidates (6 distances × 5 sides) to ensure ≥10 placements.

### Attribution
- **assets/ASSET_MANIFEST.md**: Added Rock 3 (Poly Haven CC0) and kelp-blade entries.
- **index.html**: Updated marine model credits to include Poly Haven Rock 022/Rock 3 and kelp-blade.

### Test results
All 34 tests pass. Azure geometry audit passes (0/533 ring vertices buried, min clearance 0.320m, 4/4 approaches reached, no arrival overlap). Azure visual QA passed (no browser errors/warnings, portal visible from all 4 approaches).

## Performance
- No device FPS measurement possible (SwiftShader only). No GPU frame-time claims made.
- Initial asset bytes previously reduced by ~7.8% (2,150,012 bytes) in prior pass; no regressions added this pass.
- Workspace near 128 MB snapshot cap; be mindful of file size.

## Remaining gaps (noted, not implied complete)
- 30-species and full-world art goals remain incomplete
- No continuous traversal QA or target-hardware profiling
- No production sign-off
- Sampled collision checks do not prove all routes
