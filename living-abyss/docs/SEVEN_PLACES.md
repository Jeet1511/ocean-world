# THE LIVING ABYSS — seven places, seven gates

The world is no longer a 40-location bathymetric survey spread over 4.8 × 3.6 km.
It is **seven authored arenas on a 1.8 × 1.8 km chart**, each with its own
geology, its own water, its own flora, and its own **teleporter gate**. Every
gate links to every other gate.

```
                    z +900   (open ocean)
                        │
        GLASS HORIZON ──┼── gates selected at runtime          shelf      −6 … −16 m
                        │
   ROSEGLASS REEF ──────┼──── VERDANT CATHEDRAL    reef / kelp −18 … −46 m
     (−520, 300)        │      (520, 280)
                        │
                 PILLARS OF AUREL  (0, 20)        cathedral  −95 … −150 m
                        │
   AZURE SPAN ──────────┼──── FLOODED NAVE        arch / hall −170 … −130 m
    (−480, −340)        │      (500, −360)
                        │
                ABYSSAL BOWL  (0, −700)           abyss      −520 … −640 m
                        │
                    z −900
```

## The seven places

| # | Place | Region | Floor | Depth band | What you see |
|---|-------|--------|-------|------------|--------------|
| 1 | **The Glass Horizon** | shelf | (0, 620) −8.5 m | −6 … −16 m | flat rippled sand, seagrass meadows, a scatter of limestone pinnacles, water so clear the surface is a mirror overhead |
| 2 | **Roseglass Reef** | reef | (−520, 300) −24 m | −18 … −34 m | clustered coral heads — rose, amber, violet — on reef crags, sand channels between them |
| 3 | **Verdant Cathedral** | kelp | (520, 280) −30 m | −22 … −46 m | a dense kelp forest, olive-gold blades, canopy overhead, a rock wall behind it |
| 4 | **The Pillars of Aurel** | cathedral | (0, 20) −112 m | −95 … −150 m | a ring of nine limestone columns 70–95 m tall standing on a broken podium |
| 5 | **The Azure Span** | archways | (−480, −340) −212 m | −170 … −260 m | a 238 m natural arch over a canyon, sandstone wall alongside |
| 6 | **The Flooded Nave** | caverns | (500, −360) −78 m | −50 … −130 m | a roofed hall with a mineral colonnade and light bleeding through the gate |
| 7 | **The Abyssal Bowl** | abyss | (0, −700) −560 m | −520 … −640 m | basalt twins 150–190 m tall, a basalt ring, and a descent into −700 m |

`tools/validate_world.mjs` samples the terrain at named coordinates against the authored depth bands. It does not verify the complete destination, artwork, navigation, or wildlife.

## The gates

`src/world/portals.js` builds one gate per place: a carved limestone torus
(8 m radius) on a stepped plinth, at a site chosen at runtime from candidate positions. The original pads still shape the terrain; the selected site can differ from the original authored gate-pad coordinates.

* Gate placement checks sampled terrain, chart bounds, depth, conservative visible-rock bounds and collision volumes. It does not delete nearby colliders. These checks and four short local approach samples per gate are not proof that every visible surface or route is clear.
* Swim into the aperture and the HUD shows **“Portal to the other places”**;
  press **E** and a dial opens listing all seven places (region, depth band,
  and *you are here*).
* Choosing a destination fades you to that place's own gate, 30 m inside the
  arena, facing its centre. There is no other teleport in the game: the map
  only sets waypoints.

`src/main.js` holds the travel state machine (`travel`, `arriveAtPortal`,
`tryTravel`), `src/ui/hud.js` holds `openTravelDial` / `showPortalPrompt`.

## Coordinates are sampled, never invented

`PADS` (14 benches, basins, slopes and the 7 gate bowls) shape the master height
field; `macroHeight`/`detailHeight` produce it; `TerrainField.heightAt` is the
single source of truth used by the validator, the geology placer, the flora
placer, the portals and the player controller.

## Files that define the seven places

| File | Role |
|------|------|
| `src/world/geography.js` | `WORLD`, `REGIONS`, `PADS` (incl. gate bowls), `CANYONS`, `MASSIFS`, `CHAMBERS`, `LOCATIONS`, `PORTALS`, `START_POSE` |
| `src/world/portals.js` | gate geometry, membrane shader, motes, proximity/Travel API |
| `src/world/geology.js` | hero plans per place (crags, pinnacles, pillar rings, walls, arch, shelves), bommies, rubble, boulders |
| `src/world/flora.js` | kelp beds, seagrass meadows, coral gardens + colony clusters, per-place palettes |
| `src/world/atmosphere.js` | sun shafts and fish schools, placed **from `LOCATIONS`** |
| `src/ui/hud.js` | map with 7 markers, discovery, place card, travel dial |
