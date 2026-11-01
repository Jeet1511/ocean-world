# Habitat and performance pass 07

## Status: incremental improvement, NOT final acceptance

The seven existing locations, geometry, portals, navigation and dolphin mode remain the baseline. This pass does not deliver the requested full AAA environment, animal roster, or visual certification. The 320 × 180 software-rendered gate-arrival screenshots show that several areas still have coarse silhouettes, heavy close foreground rock, dark/blue views and insufficient readable landmarks. They cannot establish final artistic quality. `preservation/visual-audit/habitat-pass/` contains the seven diagnostic images and report, relative to the workspace root.

## Research and creative translation

* Matt Nava's GDC overview describes the importance of authored but revisable terrain, fish animation, dynamic kelp and undersea light ([GDC Vault](https://www.gdcvault.com/play/1024409/Creating-the-Art-of-ABZU)). This pass preserves the original project's geography rather than importing any proprietary designs.
* Nava discusses putting marine life in plausible biomes and using marine behavior and architecture for environmental storytelling ([Inverse interview](https://www.inverse.com/article/21362-abz-creative-director-matt-nava-interview)). The present schools are habitat-tuned generic fish, not a scientifically accurate set of species.
* NVIDIA's GPU Gems explains light focusing and practical real-time caustics ([chapter 2](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics)). The project already uses artistic procedural caustics and depth/distance attenuation; the new profiles do not make this a physically measured optical renderer.

## Geographic intentions and actual state

| Place | Original authored identity / profile intent | Gate-arrival review |
|---|---|---|
| Glass Horizon | Open, sunlit pale sand and the surface; clear coastal water. | Surface and sand read, but rocks are coarse and sparse. |
| Roseglass Reef | Layered coral reef, warmer coastal water, tighter active schools. | View from arrival dominated by angular stone; coral composition needs work. |
| Verdant Cathedral | Tall kelp aisles, greener and slightly hazier water, slower compact schools. | Kelp is recognisable, but a foreground rock obscures much of the view. |
| Pillars of Aurel | Monumental colonnade, open cool blue, mobile schools. | Columns and broken stone visible; composition is noisy and lacks a strong focal hierarchy. |
| Azure Span | Deep blue bridge and canyon, clearer water and wider-moving schools. | Gate-arrival view is dark and foreground-heavy; arch is not sufficiently readable. |
| Flooded Nave | Sheltered cavern, muted green-blue, slow compact schools. | Dark, rocky, poorly legible at reviewed arrival; cavern roofs and lighting need dedicated work. |
| Abyssal Bowl | Large quiet deep basin, restrained cobalt, slow dispersed schools. | Dark terrain reads, but landmark silhouettes, life and spatial scale are inadequate. |

Images are seven fixed gate-arrival views, not an exhaustive inspection of those areas or their connecting routes. Actual on-screen framing can differ with camera, viewport and hardware.

## Implemented changes

* Seven continuous, distance-blended artistic water profiles (`src/world/habitat-profiles.js`). The tint is applied through the shared water shader so sky/medium use the same color calculation. The existing depth-based absorption, caustics and lighting remain; only modest regional density/tint modulation is added.
* School motion has habitat-specific range, cohesion, alignment and maximum-speed parameters. These are generic presentation presets, not taxonomic behaviours. A two-dimensional spatial grid replaces all-pairs neighbor checks without reducing the 5 m neighbor radius. One synthetic 100-fish test checked 684 candidate neighbours rather than 9,900 all-pairs candidates; this is not a whole-frame benchmark.
* School steps reject approaches into the same approximate analytic rock cores already used for steering; fish previously within a core may move outward. This does not guarantee avoidance of exact visible mesh surfaces, cave roofs, thin geometry or other animals. One of 1,420 fish was within 0.5 m of/inside a core at the end of the world-simulation test, so there is no claim of perfect avoidance.
* Low and medium quality reduce submitted instances rather than destroying placements, with deterministic spreading across coral tiles. High/ultra restore every placement. At the sampled Roseglass position, the sum of triangles for all distance-visible flora tiles on low quality fell from approximately 10.11 million to 4.82 million in a standalone diagnostic; this upper bound includes tiles outside the camera frustum and is not FPS or target-GPU profiling. Startup now defaults to low; press R to change quality. Real hardware performance remains unknown.
* Loading subtitle, depth-bar scale and chart scale now match the current 1.8 km × 1.8 km / 700 m geography rather than the prior world dimensions.
* Cache revision bumped to 07. Reversible source snapshot: `preservation/pre-habitat-pass-source.tar.gz` in the workspace root.

## Tests completed

* 15 regression scripts passed, including sampled gate approaches, terrain and mesh-contact tests, fauna simulation, reversible quality settings and new habitat continuity/neighbor-count tests. The separate collision-inventory generator was not run because it rewrites an audit file. These tests are sampled, not proof of complete navigability or collision coverage.
* The running application rendered all seven destinations at existing gate arrivals with Chromium SwiftShader; no browser page or console errors were recorded. Captures are very small and software rendering was slow; reported frame rates are not representative of the user's PC.
* Browser gameplay smoke exercised map open/close, dolphin and pause toggles, the seven-option portal dial and one actual Glass Horizon → Roseglass portal selection using diagnostic positioning. It did not play through the other routes, all gate pairs, caves, trenches, or every control.

## Work still required before acceptance

1. Re-author and test hero silhouettes, arrival sightlines, terrain readability, caves and transition routes; capture higher-resolution views and compare with specific composition goals.
2. Produce and license suitable distinct animals and animations (rays, turtles, sharks and other species), add habitat-specific behaviors and predator/prey reactions. Existing generic schools, jellies, five textured barramundi and player dolphin do not satisfy that requirement.
3. Improve obstacle and roof-aware animal navigation against real geometry, and prove continuous route/collision safety through actual playthroughs.
4. Profile the real target CPU/GPU, address expensive plant shaders and remaining multi-million-triangle scenes, then validate visual quality and stability on low hardware. There is no adaptive dynamic-resolution controller, complete occlusion system, or target-hardware performance certification.
5. Review lighting, color, terrain and artifacts at full resolution across each destination and transition; fix remaining issues rather than treating the current images as approval.
