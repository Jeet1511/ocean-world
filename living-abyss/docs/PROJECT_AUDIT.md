# Project audit — 31 October 2026

**Baseline:** existing seven-place 1.8 × 1.8 km world; do not confuse the historical 4.8 × 3.6 km label in index.html with current WORLD dimensions. Static browser app: Three.js r169/WebGL, vendored modules, ES modules and no build step. Source and browser runtime were inspected over prior passes and again for this pass.

- Working in limited tests: terrain generation, 17 instanced schools, map marker, seven portal interactions and swim controller.
- Partially working: boulder cores are inscribed rather than exact; terrain and roof collision improved but every route not tested; fish now use local steering but remain primitive meshes. Map line is direct guidance, not pathfinding.
- Defects: coarse jagged rock silhouettes, sparse simple vegetation, simplistic species models and unreviewed lighting/composition; some historical reference screenshots contain a place-card overlay.
- Missing: production creature rigs, asset/texture pipeline coverage, full cave and route QA, target hardware profiling, full streaming/LOD.
- Preserve: all destinations, gates, dolphin, controls, map, water, sky, original flora and wildlife. See `COLLISION_AUDIT.md`, `QA_REPORT.md`, `PRODUCTION_STATUS.md` and the backup under `/home/user/preservation/`.
