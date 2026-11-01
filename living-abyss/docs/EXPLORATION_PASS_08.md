# Exploration and terrain repair — update 08

## Scope
This is a targeted response to the report of jagged, illogical rocks, unfinished cavern geometry and insufficient accessible areas and wildlife. It is not an all-world art completion or a new animal-species production pass. The screenshot did not show an exact world coordinate or orientation, so the Flooded Nave was reviewed at its existing diagnostic gate arrival, not the user's exact camera.

## Root causes and changes

* The terrain previously chose one authored elevation pad using a hard winner-take-all score. When nearby pad scores crossed, their different target elevations could produce a discontinuity. Pad targets now blend continuously, with an eighth-power weighting to preserve the stronger authored region. The authored location positions and depth bands remain unchanged.
* Massif perimeter lobe functions used non-integer angular frequencies (3.1 and 5.3), producing a discontinuity across the angle wrap. Integer frequencies now make those outlines continuous.
* Six small filtering passes on the common height grid soften grid-scale artifacts. Terrain rendering, player collision, flora placement and the map all use that filtered grid. This is not a complete rebuild of the geography: intentional and accidental very steep areas still exist. In the earlier grid, a sampled worst neighboring-cell jump was 214 m; after the changes the worst measured jump was about 56 m. The latter is still very steep over a 4 m cell and remains work for a proper level-design pass.
* Cave-roof erosion now samples world-space noise at a consistent scale and fades erosion at the outer rim. Roof meshes remain the actual meshes used for upward collision. The vault is still procedurally formed and its silhouette is not approved as finished.
* The Flooded Nave's floating giant podium was found to create a straight dark slab across the entry view. Only that specific shelf and its corresponding registered collision surface were removed; the surrounding columns and existing cave remain. A 320×180 software-rendered gate view after removal is `../../preservation/visual-audit/exploration-pass-08-final/all.png`.
* Random reef bommies were reduced from 474 to 302, with most remaining bommies scaled to 78% and a clear area around each named location. This affects visible geometry and matching collision together. Other major geology, destination locations, portals and world bounds are retained. The audit-baseline Glass Horizon rock 19 was kept at its original size for its regression test. This adds negative space but is not a full design of seven bespoke exploration routes.
* Gate selection now rejects candidates outside the playable map or substantially outside the destination depth band and searches additional candidates. This prevents an observed abyss gate from being chosen above its basin or outside the map after the terrain change. Seven clearance checks passed in the sampled run, but gate-site selection may choose different positions from the previous pass.
* One of each destination's **existing** schools is placed on a line between its selected gate and the named destination, making marine life more likely to be encountered. All 17 schools and their current simulation remain. No sharks, rays, turtles or other new species were created, and there is no claim that every fish avoids all visible geometry or cave roofs.

## Verification

* All 16 selected regression scripts passed, excluding the separate collision-inventory generator which rewrites its audit output. `tests/exploration-pass-regression.mjs` checks two previously severe seam samples, seven authored depth bands, seven in-bounds/depth-appropriate portal sites, seven entrance-school anchors, and retained roof collision.
* Each gate had four short controller-simulated approaches in `portal-geometry-surface-regression.mjs`; this is not an end-to-end route or all-world collision certification.
* Chromium software-WebGL rendered the seven gate arrivals without recorded browser errors. The seven initial captures in `../../preservation/visual-audit/exploration-pass-08/` precede the final Flooded Nave podium removal; the `exploration-pass-08-final/all.png` image is after that removal. These are low-resolution diagnostic frames, not final beauty or performance benchmarks.
* Browser smoke exercised map, dolphin and pause toggles and the seven-option gate dialog for one Glass Horizon → Roseglass trip. No target-PC FPS benchmark or full-world playthrough was performed.

## Still outstanding

The review images still show rough geology, dark and sparse regions, an insufficiently natural cavern vault, and weak focal composition. The revised seabed still includes abrupt terrain transitions, and gate-to-landmark routes must be physically playtested, including cave entrances and both swimmer modes. Significant environment art, meaningful discoveries, more vegetation and genuinely distinct high-quality animals remain to be built and checked. Nothing here establishes stable performance on the user's hardware or completion of the full request.

A source/test/index rollback is in `../../preservation/pre-terrain-continuity-pass.tar.gz`. Asset files were not changed by this pass.
