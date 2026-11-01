# Marine Ecosystem Reconstruction — Binding Production Plan

## Visual target
The supplied references establish five composition modes: sunlit coral canyon, dense mixed reef, luminous cave garden, blue-water ruin/wreck site, and deep pelagic basin. The target is overlapping biological structure on colonized rock, with open routes intentionally carved through it—not uniform objects on exposed terrain.

## Research translated into production rules
- Reef-building tropical corals are shallow-light organisms; deep zones instead use cold-water corals, octocorals and sponges. Smithsonian: https://ocean.si.edu/ocean-life/invertebrates/corals-and-coral-reefs
- Seagrasses are rooted flowering plants of shallow protected sediment, while kelp are algae anchored to rocky substrate and form canopy/understory layers. Smithsonian: https://ocean.si.edu/ocean-life/plants-algae/seagrass-and-seagrass-beds and https://ocean.si.edu/kelp-and-kelp-forests
- Seagrass habitat includes epiphytic algae, anemones, bryozoans, sponges, molluscs, urchins, sea cucumbers, shrimp and juvenile fish. Florida Museum: https://www.floridamuseum.ufl.edu/southflorida/habitats/seagrasses/life/
- Gorgonians are flexible, holdfast-attached animals adapted to flow; hard corals are calcareous colonies; coralline algae cement reef substrate. Florida Museum: https://www.floridamuseum.ufl.edu/southflorida/habitats/corals/
- Deep hard surfaces and current-exposed ridges support corals, sponges and anemones; sediment channels support sea pens; coral and sponge structure supports crinoids, brittle stars, crustaceans and fish. NOAA Ocean Exploration: https://oceanexplorer.noaa.gov/static/news/exploration-extras/24-national-ocean-month/welcome.html

## Existing asset audit
### Procedural geometry currently present
- Kelp: 4 species families with blade/stipe geometry.
- Seagrass: 3 variants.
- Photic algae: 3 variants.
- Coral/benthos: branching, table, foliose, fan/gorgonian, massive/brain-like, tube sponge, encrusting mat.
- Scan assets: boulder, branching, deep, foliose, staghorn and table coral GLBs.
- Small fauna asset: sea star.

### Defects requiring replacement, not density inflation
- `makeBranchingCoral` serves too many biological identities.
- Sponge library is dominated by one tube cluster silhouette.
- Seagrass and photic algae variants do not yet read as turtle/eel/paddle grass and red/green/brown macroalgae.
- No dedicated elkhorn, finger, pillar, mushroom, whip, vase/barrel/glass sponge, anemone, crinoid, sea pen, urchin, cucumber, bivalve, tubeworm, tunicate or bryozoan geometry.
- Ambient scatter remains visually legible as procedural scatter.
- Low-detail quality compaction can remove important authored colony composition.
- Ground shaders provide geology but insufficient layered turf/coralline/encrusting cover.
- No authored shipwreck landmark exists.

## Destination habitat identities and required production
| Destination | Habitat | Foundation | Dominant biology | Landmark/story layer | Status |
|---|---|---|---|---|---|
| Glass Horizon | shallow lagoon/shelf | rippled sand, patch rock, rubble | seagrass meadow, patch reefs, anemones, juvenile fish | small weathered wreck/debris trail | hero reef mound pass begun; replacement incomplete |
| Roseglass | tropical forereef | coral limestone terraces, chutes | staghorn/elkhorn, table/plate, massive brain/boulder, fans, sponges | coral canyon and overgrown wreck | dense existing coverage; species library incomplete |
| Verdant | temperate rocky kelp forest | boulder/cobble reef | giant/bull/ribbon-like kelp, understory algae, urchins, stars | lost stone observatory | kelp coverage exists; understory/fauna incomplete |
| Aurel | current-exposed monumental reef | limestone crags/columns | gorgonians, whips, encrusting sponges, crinoids | drowned colonnade | geology enriched; benthos incomplete |
| Azure Span | twilight canyon | sandstone ledges, talus | sparse cold corals, sea pens in sediment, sponges on ledges | broken bridge/ship section | geology enriched; benthos incomplete |
| Flooded Nave | marine cave/ruin | vault, rubble, dark rock | cave sponges, anemones, hydroids, tunicates, restrained luminous life | nave/rose-window wreck relic | rubble and living-light pass begun; species incomplete |
| Abyssal Bowl | deep basin/seamount | basalt rim, sediment basin | glass sponges, bamboo/black coral, sea pens, crinoids | deep wreck fragments/rare discovery | rim enriched and living lights added; benthos incomplete |

## Rendering architecture
- Hero and medium assets: shared geometry/material families and InstancedMesh batches.
- Close PBR detail: atlased albedo/normal/roughness/AO; macro color remains shader-controlled per habitat.
- Distance: true reduced geometry per species, never global deletion of ecology.
- Authored colony IDs remain coherent under quality compaction.
- Static corals/sponges do not sway. Kelp, seagrass, soft coral, fans and anemones use species-specific current response.
- One bounded draw layer per small-detail family where practical; no independent object per organism.
- CPU-safe and software-rendering-safe paths remain mandatory.

## Acceptance gate
A destination is not complete until inspected in the running game at arrival, route, landmark, close-up and distant views; checked for portal/collider overlap; and benchmarked through repeated transitions. Counts alone are not evidence.
