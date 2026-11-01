# Living Abyss: world-completion audit and checklist

This is an active checklist, **not a completion or AAA-quality certificate**. The notes and screenshots below are historical audit snapshots; later ecosystem, coral scan, turtle, cave-scattering and performance work is summarized in `WORLD_COMPLETION_PASS.md`, `PERFORMANCE_PASS.md` and `validation/README.md`. The user requires work in the existing seven-place game, not a replacement project. Prior conversation selected the current chart and existing gate topology as the source of truth; the earlier incompatible world remains an archived reference. Do not claim full traversal, accurate ecosystems, full asset QA or target-hardware performance from these sampled checks.

The latest quality-preserving pass has 34 passing Node regressions, sampled pixel-identical culling comparisons, and browser checks of streaming, retry and timeout behavior. The checklist's art, 30-species, continuous traversal and target-device gates below remain open.

## Reference review
The supplied `uploads/README.txt` describes the six large landscape PNGs as panoramic composition/atmosphere guides and the smaller images as marine-detail references. They do **not** contain an unambiguous one-to-one designation for every destination, so the associations below are art-direction hypotheses, not invented location labels.

| Reference | Relevant destination / mandatory motifs to develop | Current gap |
|---|---|---|
| `01_monumental_shelves_and_cavern.png`, `02_full_underwater_geological_landscape.png` | All transitions, particularly Flooded Nave and Aurel: layered continuous shelves, large arches, dark cavern mouths, spatial depth and readable silhouettes | Current cave/columns are not yet equivalent; jagged exposed geometry and flat, underpopulated areas remain. |
| `03_fantasy_realism_shelves_and_abyss.png`, `04_underwater_shelves_and_deep_valleys.png` | Reef-to-abyss transition: distinct near/mid/far shelves, colorful upper ecology and a coherent descending basin | Abrupt steep slopes persist; upper reef foliage is much simpler. |
| `05_cinematic_archways_and_canyons.png`, `06_cinematic_reef_and_abyss_environment.png` | Azure Span, Reef and deep routes: clear natural bridges, complex cliff margins, water-column scale | The span is not clearly readable from its gate view; routes and formations need close continuous traversal QA. |
| `01_coral_and_kelp_detail.webp`, `03_underwater_kelp_forest.webp`, `1.webp`, `3.webp` | Roseglass and Verdant: richly modeled coral/kelp, schooling fish, layered, filtered light | Coral families exist but are mostly procedural; kelp silhouettes and density are not reference quality. |
| `02_sunlit_shallow_ocean_and_fish.webp`, `2.webp`, `OIP.webp` | Glass Horizon: bright surface, sun shafts, schools and varied shallow relief | A sunlit floor and school LODs exist; shallow terrain remains visually plain and light shafts are approximate. |
| `04_colorful_underwater_reef_channel.webp`, `4.webp`, `OIP-2.webp`, `OIP-5.webp` | Roseglass: colorful coral banks framing navigable open channels and water rays | A sideways/lower arrival now clears the immediate rock view in the tested pose; reef composition, texture and life still need substantial work. |
| `05_monumental_underwater_world.webp`, `5.webp` | Overall composition, especially Aurel/Azure/Nave: scale, layered geological forms and contrast | Current places do not achieve the pictured composition. |
| `OIP-3.webp` | Organism variety and localized luminosity, without making all habitats neon | No verified ecosystem of the illustrated organisms; avoid implausible artificial glow. |
| `OIP-4.webp` | Shallow seagrass, turtle encounter, reef animals | Two approximate rigged turtle patrols have since been added; seagrass and shallow ecology remain incomplete. |
| `download.webp` | Open-water sense of scale and a whale | One licensed animated whale exists near Azure Span; fixed small orbit and dark appearance do not yet match the composition. |
| `image-1.png` through `image-15.png` | In-game defect reports, not 3D asset sources; especially screenshot 13 grounding, 14 Flooded Nave and 15 smooth fish | Targeted tower bases, cave fixes and Glass fish LODs are implemented, but wider grounding/cave/fish-model audits remain open. |

## Seven-place inspection and production gate
Arrival images at `../../preservation/visual-audit/reference-final/` are single software-rendered camera views, not complete location inspections. All rows remain **OPEN**.

| Destination | Current evidence / distinct identity | Major unfinished work |
|---|---|---|
| Glass Horizon | Shallow caustics, grass, textured Glass schools, some shafts; sampled gate approaches | Sparse composition, detailed biodiversity, terrain/rock junctions, full swim-through. |
| Roseglass Reef | Reef gardens and textured shoals, shallow light, sampled gate approaches | Arrival rock obscures view; untextured generic fish, weak coral forms/texture, empty stretches, full routes. |
| Verdant Cathedral | Kelp beds and sampled gate approaches | Repetitive thin kelp, missing canopy/animal layers, route readability and attachment QA. |
| Pillars of Aurel | Columns and cold-water fans/sponges, sampled gate approaches | Entry view dominated by near rock, dark composition, generic wildlife, pillar bases and navigation. |
| Azure Span | Arch/canyon, cold-water fans and one nearby whale, sampled gate approaches | Arch legibility, severe cliff geometry, dark empty water, collision/traversal and whale path beyond samples. |
| Flooded Nave | Two visible cavern shells, gate opening, roof/spire collision registrations, cold-water organisms | Roof seams and large triangular surfaces, interiors/entries, visual storytelling, real continuous passage QA. |
| Abyssal Bowl | Basin, sparse deep fan/sponge forms, blue-toned atmosphere, sampled gate approaches | Mostly dark/empty, geography and species models unfinished; named fictional 'abyss' is ~560 m, not scientific abyssopelagic depth. |

## Audits and tracked defects
- [x] Enumerate seven current locations, 21 pads, two canyon definitions, 19 massifs, two cave chambers, gates, current source assets and existing references. This is an inventory, **not an exhaustive per-object artistic inspection**.
- [x] Capture one gate-arrival view per destination; inspect representative gardens, underwater whale, and deep terrain transition. Do not equate teleport screenshots with traversing the world.
- [x] Sample 1,033 geology surface registrations against rendered terrain vertices: no entire structure in that sample had every sampled vertex more than 1 m above the ground. This coarse test does **not** detect partially floating edges, clipped objects, caves, or prove contact.
- [x] Grid scan: reduce the maximum cardinal 4 m terrain-edge height difference from 56.22 m to 35.28 m; edges over 40 m fell from 110 to zero. Approximately 6,346 of 202,500 sampled grid cells changed by over 0.5 m; maximum change was 55.73 m in a steep transition and mean absolute change was 0.34 m. Seven destination-centre heights were unchanged. A 35 m jump in 4 m is still extremely steep and fails a natural-landscape/navigation acceptance gate.
- [x] Register per-spire visual bounds and sampled swept contact for cave spike meshes; synthetic crossings and a sampled real spire in each chamber passed. Other geology remains largely endpoint-checked and continuous contact is not fully solved.
- [x] Connect existing shark patrol positions to nearby instanced-fish avoidance; two sampled patrols overlap a school neighborhood and a browser sample saw a real fish within 15 m. This is avoidance only, **not** hunting, feeding, migration, reproduction, population dynamics or a balanced ecosystem.
- [x] Keep offscreen schools moving at a reduced 4 Hz fixed simulation rate, versus 8 Hz nearby. This is simulation LOD, not a complete ecosystem model.
- [x] Add a 30 FPS rendering cap in the default low-quality mode (60 FPS cap on medium/high/ultra); quality is adjustable with R. This limits frame submissions but cannot guarantee device temperature or sustainable FPS.
- [x] Tile the 90 existing shell instances and distance/frustum-cull them, retaining placements. One Roseglass low-quality software view changed from ~7.31 million to ~6.36 million submitted triangles (draw calls 380 to 382); a deep-basin arrival changed from ~1.92 million to ~0.79 million because the offscreen shallow shells were no longer drawn. These are not target-device benchmarks or performance guarantees.
- [ ] Audit every geological vertex/edge and every prop footprint, including roofs, cave walls, ledges and gate foundations; use exact visual-surface tests, not just broad bounds or centre samples.
- [ ] Repair remaining unusually steep terrain and cave joins; conduct full continuous swimming routes, climb/descent, both sides of obstacles, and all portal entrances.
- [ ] Replace generic legacy fish with distinct, researched, suitably licensed, animated species; deliver the earlier requested minimum of 30 actual types, not recolors or labels.
- [ ] Build habitat-specific ecosystem behavior, feeding, refuges, migration, population variation and meaningful discoveries; no reproductive or food-web simulation exists yet.
- [ ] Upgrade art, geology, materials and light across **all** places; ensure cave entrances and arch silhouettes read from actual approaches.
- [ ] Profile GPU/CPU, memory, thermals and frame pacing on the user's actual target device. SwiftShader telemetry is a diagnostic only and cannot certify performance or thermals.
- [ ] Run end-to-end manual traversal with player and dolphin, full gate menu/navigation, collision trace, creature/model/lighting inspection and regression suite; compare all relevant views with reference motifs.

## Update 13 targeted validation
26 selected non-mutating Node regression scripts, four short approaches to each of seven gates, browser map/dolphin/pause/one portal flow, marine visitors, reef shoals, whale, shell distance culling and predator-link smoke passed in the sandbox. The culling and rendering measurements are taken on a software WebGL renderer at a small resolution; they do not establish real hardware FPS. Static/scanned visual evidence and tests are saved selectively rather than building up redundant backup archives.

Sources for habitat rationale: [NOAA reef fish and shelters](https://www.aoml.noaa.gov/general/lib/CEDAR_files/cedar103.pdf), [NOAA food web lesson](https://nmssanctuaries.blob.core.windows.net/sanctuaries-prod/media/docs/20231129-coral-reef-lesson-plan.pdf), [NOAA shark ecology](https://sanctuaries.noaa.gov/news/2025/how-sharks-keep-the-ocean-healthy.html), and [NOAA coral distribution](https://oceanservice.noaa.gov/education/tutorial_corals/coral05_distribution.html). The game remains an intentionally mixed, fictional geography; its current simple behaviors are not scientifically validated.
