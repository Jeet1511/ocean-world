# Marine life, deep habitat and culling pass 09

**Status: partial implementation, not acceptance of the full production mandate.** The existing seven-place geography, gates, swimming controls, dolphin and progression are preserved. The work below addresses specific omissions and cost; it does not make this an AAA-complete world.

## Changes made

- A concrete deep-habitat defect was found: the shallow coral placement loops rejected depths greater than 240 m, so their Abyssal Bowl entries never produced colonies at the bowl's depth. A separate seeded, depth-limited pass now places 176 fan-coral- and tube-sponge-like instances in four sparse Abyssal Bowl clusters. These reuse the existing procedural flora geometry and are not new scientifically identified species. A restrained near-camera, depth-dependent artistic bounce makes them visible without claiming the organisms glow. Substrate hardness has not been verified, and some instances can be hidden by geology.
- Added six non-solid animated visitors on sampled, deterministic circular patrols: three manta rays in Glass Horizon, Roseglass Reef and Verdant Cathedral; three sharks in Glass Horizon, Roseglass Reef and Pillars of Aurel. A textured, rigged CC BY shark model and a deliberately low-poly, untextured CC0 ray model are locally hosted, with full provenance in `assets/ASSET_MANIFEST.md` and in-game chart credits. These are generic model identifications, not claims of accurate taxonomy, ecological ranges or species-specific AI. They slow when a player comes close; they do not hunt or perform sophisticated interactions. Their visible meshes are distance-culled and off-screen animation updates are skipped.
- Replaced world-wide, always-submitted geology/scree/rubble batches with 640 m spatial tiles. Complete formations are never sliced; culling bounds include the full geometry. The same family triangle totals, 10,268 decorative instances, 620 analytic geology collision cores and 1,033 surface registrations are retained. A direct before/after comparison additionally produced an identical SHA-256 digest of the sorted instance transforms. This trades more draw calls for fewer submitted triangles. There is no occlusion culling and no target-device performance guarantee.
- Kept the chart credits reachable on short displays by making the map overlay scrollable. Changed cache revision to 09. Snapshot before this pass: `preservation/pre-marine-life-pass.tar.gz` relative to `/home/user`.

## Ecology references

NOAA describes deep-sea coral and sponge habitats as communities that do not depend on sunlight: [NOAA Fisheries: Deep-Sea Coral Habitat](https://www.fisheries.noaa.gov/national/habitat-conservation/deep-sea-coral-habitat). The distinction between shallow, mesophotic and deep reef communities is summarized by [NOAA National Marine Sanctuaries](https://sanctuaries.noaa.gov/visit/ecosystems/coralwelcome.html). The placement and shaders are art-directed approximations, not a measured ecological simulation.

## Seven gate-arrival review

These observations are from 320 × 180 diagnostic captures using Chromium SwiftShader, not continuous traversal or full-resolution art approval. Final captures and telemetry are in `preservation/visual-audit/marine-pass-09-tile640/` relative to `/home/user`.

| Place | Observed condition and limits |
|---|---|
| Glass Horizon | Open, bright sand and fish school read; the new ray and shark patrol nearby. Sand and distant stone remain visually sparse and coarse. |
| Roseglass Reef | A large foreground formation still crowds the arrival; new ray and shark patrol the region. Coral identity and a clear composition need more work. |
| Verdant Cathedral | Kelp reads as a distinct forest, and a ray patrol is present. Plant geometry and rock framing are still stylized and repetitive. |
| Pillars of Aurel | A shark patrol is present in the upper part of the region. Arrival view still has heavy foreground rock and lacks an adequate authored focal hierarchy. |
| Azure Span | Still dark and obstructed, with no new location-specific animal or landmark in this pass. The arch and canyon require further art and lighting work. |
| Flooded Nave | Previous pass removed the floating plinth; columns and roof remain rough. This pass did not remodel the cavern or add cavern-specific animals. |
| Abyssal Bowl | New scattered cold-water coral/sponge-like clusters are visible in deep blue, but remain simple procedural forms. The basin is still dark and lacks sufficient authored landmarks and deep-specific animals. |

## Comparison and optimization limits

Under the same small 320 × 180 software-rendered gate-arrival diagnostic, below are renderer-reported submitted triangles and draw calls. These samples include the new animals and deep habitat; telemetry may lag the camera on slow software rendering and is not a reliable frame-time benchmark. The 640 m tiling was selected over a tested 320 m variant because the latter raised draw calls much further.

| Arrival | Before triangles / draws | After triangles / draws |
|---|---:|---:|
| Glass Horizon | 5.30M / 230 | 4.70M / 264 |
| Roseglass | 7.62M / 292 | 7.16M / 376 |
| Verdant | 5.94M / 274 | 4.95M / 305 |
| Aurel | 3.07M / 158 | 2.78M / 231 |
| Azure Span | 3.18M / 164 | 3.08M / 277 |
| Flooded Nave | 2.90M / 128 | 1.70M / 136 |
| Abyssal Bowl | 2.78M / 85 | 1.90M / 156 |

This is a mixed trade-off, not proof of better FPS. In particular Roseglass remains over seven million submitted triangles at low quality and more draw-call-heavy. Target hardware profiling, flora complexity/LOD work and larger-resolution review are still necessary.

## Tests actually run

- All 18 non-mutating test scripts passed. New checks exercise the 176 sampled deep placements, deterministic six patrols with 24 samples each against terrain and approximate collider bounds, rigged-asset presence, in-game attribution, tile bounds, original triangle totals and collision registration counts. These checks are not continuous geometry or complete navigation proofs.
- Rendered seven gate arrivals in the app with no browser console or page errors. Separate targeted captures show the two visitors and deep coral. `tools/marine_smoke.mjs` checked six loaded visitors, nearby animation advancing, pause freezing it, distance culling, and chart attribution. `tools/gameplay_smoke.mjs` checked chart open/close, dolphin and pause toggles, seven portal choices and one Glass Horizon → Roseglass portal trip using diagnostic teleportation. None is an end-to-end manual playthrough.
- No target-computer benchmark, all-portal-pair test, complete continuous route/cave collision certification, species-level behavior study or comprehensive animation/visual review has been performed.

## Remaining acceptance gaps

Production-quality authored environments and terrain, especially Azure Span and Flooded Nave; distinctive landmarks and discoveries at all seven destinations; a much richer, habitat-appropriate roster including deep and cavern life; integrated animal interactions and actual mesh/roof-aware navigation; more extensive continuous gameplay and accessibility testing; and credible optimization on the user's target hardware. The seven existing destinations were reviewed, but only some received new content in this pass.
