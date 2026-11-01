# THE LIVING ABYSS — build report (7 places + gates)

**Date:** 2026-10-30 · **Engine:** three.js 0.169.0 (unchanged) · **Scope:** the map
was cut from 40 locations / 4.8 × 3.6 km down to **7 designed places on a
1.8 × 1.8 km chart**, each with its own **teleporter gate**, all gates
interconnected.

---

## 1. What is built

### The seven places (verified against the terrain field)

| Place | Region | Floor sample | Authored band | Hero geology |
|---|---|---|---|---|
| The Glass Horizon | shelf | −8.5 m | −6 … −16 | 11 limestone pinnacles, low ribs |
| Roseglass Reef | reef | −24 m | −18 … −34 | two crag fields (14 towers) |
| Verdant Cathedral | kelp | −30 m | −22 … −46 | a 62 m wall + twin towers |
| The Pillars of Aurel | cathedral | −112 m | −95 … −150 | ring of 9 columns, 70–95 m, on a podium lens |
| The Azure Span | archways | −212 m | −170 … −260 | 238 m arch over a canyon + sandstone wall |
| The Flooded Nave | caverns | −78 m | −50 … −130 | roofed hall, mineral colonnade |
| The Abyssal Bowl | abyss | −560 m | −520 … −640 | basalt twins 150–190 m + basalt ring |

`node tools/validate_world.mjs` → **PASS, 0 issues**. It samples the master
field at every named coordinate, checks the measured depth against the band,
and prints the spread; it also wrote `docs/world_bathymetry.png`.

### The seven gates

* `src/world/portals.js` — carved torus (r = 8 m) on a stepped plinth, additive
  membrane shader (concentric caustic rings + fbm veil, `uOpen`/`uActive`),
  220 drifting motes per gate.
* Each gate stands in an authored **gate bowl** (a 46 m depression, pads
  `gate_*` in `geography.js`) so the ring is fully submerged even on the 8 m
  shelf: glasshorizon ring top −8.1 m, roseglass −22.6 m, verdant −28.3 m,
  aurel −110.1 m, azurespan −207.7 m, floodednave −77.7 m, abyssalbowl −557.9 m.
* Gates can never be swallowed by rock: `buildGeology` refuses towers within
  62 m of a gate, and `main.js` filters any collision volume standing inside an
  aperture.
* Flow: swim into the aperture → HUD prompt → **E** → dial listing all seven
  places (region, depth band, *you are here*) → pick → arrive 30 m inside the
  target arena facing its centre, with a 1.6 s cooldown.
* Verified end-to-end in a browser: `inside = roseglass` → `dial display: flex`
  → click destination → nearest gate becomes `verdant` at 31.7 m, dial closed,
  **no console or page errors**.

### Everything else that had to be re-pointed

Because the geography module was rewritten, every consumer was audited:

* `terrain.js` — chunking made divisor-proof (450 cells ÷ 6 × 6 chunks); the old
  8 × 6 split silently produced **NaN vertices and a black screen**. The outer
  apron now carries layered ridges and is shaded with rock + haze instead of a
  flat wash.
* `atmosphere.js` — sun shafts and fish schools were still placed with the *old*
  world coordinates (x −2300…900), i.e. entirely outside the new map. Both are
  now generated from `LOCATIONS`: shafts only in the four photic arenas, two to
  three schools per place.
* `flora.js` — kelp beds, seagrass meadows, coral gardens rewritten per place,
  plus a new **colony-cluster** pass so reefs read as reef heads rather than
  confetti; `SCATTER` limited to the three photic arenas.
* `geology.js` — 11 hero plans, per-place bommie/rubble zones, 1 500 boulders.
* `hud.js` — map, discovery and the new travel dial all iterate `LOCATIONS`, so
  the seven places are the map.

## 2. Optics work done in this pass

| Problem seen in QC | Cause | Fix |
|---|---|---|
| Hard black band across the horizon | the sky dome used its own older inscatter formula while `applyWater` used another | one shared `inscatter(dir, midY)` in `common.js`, used by **both** |
| Distance turned navy, then black | horizontal rays were 4.5× darker than upward rays; no multiple-scattering term | photic boost on inscatter in the top 130 m |
| Flat minty distance | fog too weak to close a 900 m arena | `fogDensity` 1.18 → 0.56 with depth |
| Jagged black seam at the waterline | near plane + far annulus intersected where a swell dropped through | single 24 km surface, no seam |
| Cliffs rendered as black cards | ambient had a hard `N.y` exponent, vertical faces got nothing | softer exponent, wrapped diffuse, deep-water readability floor |
| Table corals as painted pancakes | flat disc + no surface detail | polyp-scale albedo + normal perturbation, then dropped from placement entirely |
| Inverted/undersized hero towers | `Math.min(h, -depth − 10)` went **negative** on the shallow shelf | clamped in the factory (`5 … depth·0.92`) |
| Horizon a flat teal band | the apron was shaded as a flat wash | ridged distant relief + rock/haze shading |
| Milky wash at 24 m | exposure + silt albedo | exposure 0.84, sediment darkened |

## 3. Honest status

**Working:** the seven places exist with correct depths; the gates work and are
interconnected; cave/mesh validation passes (`tools/validate_meshes.mjs` →
9/9 generators watertight, 0 non-manifold, 0 flipped); HUD, map, discovery,
travel dial, place card and dolphin all run with **no console errors**.

**Not yet at the bar** (and this is the honest part):

1. **Draw calls.** 1 000+ calls / 21 M triangles at 720 × 405 in the shelf. The
   instancing is tiled at 220 m, which multiplies calls per arena. The target is
   < 120 calls and < 6 M triangles; the fix is a per-arena merge of small-species
   tiles plus an LOD chain for kelp and coral, which is not done.
2. **Rock silhouettes.** The lathe towers read well; the shelf lenses still read
   as slabs from a low camera, and crags as smooth blobs. Stratified displacement
   on the lens rim is the next material/geometry task.
3. **Reef density.** Coral is authored (≈14 700 individuals) but the clusters are
   still spaced out; a real reef needs a *framework* — crust, rubble and sponge
   under the heads — which is not authored yet.
4. **Kelp.** Blades are now olive-gold with corrugation, but they do not yet have
   translucency against the sun or a light gradient along the stipe.
5. **The `#placeCard` is not hidden by `hideUI(true)`** — the HUD re-shows it on
   discovery, so QC frames can contain the card.

## 4. How to run / verify

```bash
cd living-abyss && python3 -m http.server 8099       # then open index.html
node tools/validate_world.mjs                        # depths + bands, writes PNG
node tools/validate_meshes.mjs                       # watertightness report
```

Controls: **WASD** swim, **Q/E** rise/dive, **mouse** look, **Shift** sprint,
**F** dolphin, **M** map, **E** (inside a gate) travel dial, **H** hide HUD.
