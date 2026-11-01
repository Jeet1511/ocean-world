# OmniRush / The Living Abyss — preservation audit

Baseline: current extracted project, 2026-10-30. This is a working checklist, not a certification of visual or gameplay completion. The project is a browser-based Three.js application using locally vendored Three.js. The supplied images are art-direction references, not game assets.

## Safety and traceability
- [x] Snapshot current project, helper tools, and pre-existing workspace inventory: `pre-enhancement-20261030.zip`.
- [x] Preserve the authored files from the earlier archived version: `archived-earlier-version.zip` (this smaller archive omits the redundant Three.js package, tarball, and vendor copy; the complete original transfer remains the authoritative source).
- [x] Initial world and mesh validation scripts passed on the current version; these are not visual or complete collision proofs.
- [ ] Verify representative baseline and final renders and interactive gameplay in a WebGL-capable browser.
- [ ] Profile on the stated target hardware; no benchmark has been performed here.

## Version conflict — user decision
The earlier archived source and the current project represent different, incompatible world layouts. After this discrepancy was disclosed, the user selected the **current seven-place layout** as the source of truth and chose to **preserve its existing gates**. Do not restore the earlier geography over the current project, and do not add new travel mechanisms. The current documentation explicitly says the world was previously reduced and renamed and that portals were added; both versions are preserved for reference.

| Property | Earlier archived source | Current project |
|---|---|---|
| World bounds | x −2400..2400, z −1800..1800 (4.8 × 3.6 km) | x −900..900, z −900..900 (1.8 × 1.8 km) |
| Maximum configured depth | 1,150 m | 700 m |
| Regions | 10, including surface, canyon and Eternal Blue | 7 |
| Main LANDMARKS records | 9 | 7 |
| Canyon definitions | 7 | 2 |
| Cave chambers | 8 | 2 |
| Gate travel | No `PORTALS` export in earlier geography | 7 portal definitions and travel dial |

The earlier source has 9 LANDMARKS records; the later documentation also describes the former project as a 40-location survey, but that number has not been independently verified against all its other data. Preserve both baselines until the original design is identified. Restoring earlier coordinates while simultaneously keeping the seven current coordinates unchanged is not automatically possible; The Flooded Nave alone moved from (1080, 620) to (500, −360).

## Earlier regions and landmark coordinates
- Open Ocean, anchor (−600, 1620); Sunlit Shelf (−700, 1250); Coral Garden (−950, 880); Kelp Forest (−1800, 800); Drowned Cathedral (−350, 210); Great Natural Archways (−250, −230); Azure Canyon (−320, −720); Veiled Caverns (1180, 480); Crystal Abyss (−480, −1330); Eternal Blue (−700, −1680).
- Named landmarks: Shelf Shallows (−700, 1290); The Coral Terraces (−950, 880); Kelp Cathedral (−1800, 800); The First Pillar (−350, 380); The Great Span (−250, −230); Azure Gate (−60, −560); The Flooded Nave (1080, 620); Crystal Ridge (−480, −1330); Eternal Blue Floor (−700, −1680).
- Eight chambers: The Flooded Nave, The Sunken Gallery, The Whispering Vault, The Green Hall, The Cathedral Crypt, The Lower Reliquary, The Narrow Chapel, The Deep Sanctum. Seven canyon definitions represent routes; reachability not yet tested.

## Current destination preservation checklist
- [ ] The Glass Horizon, shelf, (0, 620), −6 to −16 m: rippled sand, seagrass and limestone; shallow-water/sunlit surface references.
- [ ] Roseglass Reef, reef, (−520, 300), −18 to −34 m: coral terraces and crags; colorful coral and reef channel references.
- [ ] Verdant Cathedral, kelp, (520, 280), −22 to −46 m: kelp forest and wall; kelp forest references.
- [ ] The Pillars of Aurel, cathedral, (0, 20), −95 to −150 m: limestone columns and plateau; monumental shelf references.
- [ ] The Azure Span, archways, (−480, −340), −170 to −260 m: natural bridge and canyon; archway/panorama references.
- [ ] The Flooded Nave, caverns, (500, −360), −50 to −130 m: cavern hall, ridge and light shaft; cavern references.
- [ ] The Abyssal Bowl, abyss, (0, −700), −520 to −640 m: basalt pillars and basin; deep valleys and atmospheric abyss references.

For each item, unfinished means not yet visually inspected and validated; it does not imply the existing implementation has been removed.

## Current implementation inventory
- Geography: shared height field, 7 region records, 7 location/landmark records, 21 terrain pads (including link and gate pads), 2 canyon definitions, 19 massif definitions, 2 chambers, 7 existing portals and a start pose. Preserve actual route and clearance behaviour pending interactive tests.
- Geology: tower, arch, shelf, wall and boulder mesh factories, hero plans, instanced/small geology and collision volumes. Cave vaults and spikes are built separately. Automated mesh test covered nine solid generator samples, not every instance, cave opening, intersection, backside, or route.
- Flora: procedural kelp, seagrass, branching, table, fan and massive corals, tube sponges, encrusting organisms, placement and quality controls. Presence of a generator does not prove it is placed or visually finished.
- Environment: terrain chunks and distant apron; sky and continuous ocean surface; shared water/lighting shaders; marine snow, shafts and animated fish schools; rock and terrain materials; postprocessing and quality settings. Visually verify all of these.
- Navigation/gameplay: swim controller, free and dolphin modes, terrain and obstacle collision, region detection, map waypoints, discovery, existing portal proximity/dial/travel, photography pause. Do not add new travel mechanisms. Portal status requires user decision due to version conflict.
- Controls from code: W/S forward/back; A/D turn with small strafe; Z/C strafe; Q descend and E ascend; Shift sprint; mouse look/pointer lock and drag fallback; touch look; F dolphin toggle; M map; H HUD; P pause/photo; R quality; Escape closes map. E also opens the existing portal dial when inside a portal. Key descriptions and behavior need live testing.
- Interface: loading overlay, progress/status, region/depth panel and depth bar, compass, minimap, large map, map legend/waypoints, keys, performance text, center reticle, toast, portal prompt and travel dial, click-to-enter notice, location cards. Preserve all until direction is resolved.
- Resources: `src`, `vendor`, `index.html`, project tools, docs, root Playwright helper project, user uploads. No external texture or imported 3D asset inventory has yet been established beyond examining the source layout.

## Diagnosis and enhancement plan
- Most urgent: resolve the version conflict before editing coordinates, world dimensions, route definitions, landmarks, or portal behavior.
- E-key routing previously intercepted every E keydown for portal interaction, preventing its documented ascent function. A narrow fix has been applied: only intercept E at an active portal, retaining E ascent elsewhere and existing portal interaction.
- Existing report itself flags heavy draw calls and triangle counts, weak silhouettes, sparse reef framework, and unfinished kelp translucency. Treat those reports as historical observations, not new profiling.
- Future work: baseline screenshots and all-region route tests; geometry/clearance audit; targeted asset and material upgrades; location-specific environmental dressing and lighting; performance profiling; matched screenshots and regression tests. No destination may be declared polished on the basis of script success alone.
- Reference analysis: large images emphasize layered irregular shelves and overhangs, deep foreground-to-background spatial separation, broad natural arches, cool distance haze and sunlit shallow clearings. Smaller references emphasize distinct coral masses and small fish, tall irregular kelp canopies, and surface light. References are guides; do not use as substitutes for actual geometry.

## Tool limitations observed
No Blender or browser executable was initially found on PATH, and no skill instructions were found in the workspace or shallow system search. A temporary Chromium with software WebGL was subsequently installed outside the workspace and used for the limited screenshots and smoke tests described in `PROGRESS_AND_VISUAL_AUDIT.md`. This is not a target-GPU performance test or an exhaustive visual/gameplay audit. Do not infer completeness from static code or mesh tests.
