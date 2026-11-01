# The Living Abyss

An in-progress, browser-based underwater world built on the existing 1.8 km × 1.8 km map. The seven destinations, portals, swimming controls and dolphin remain in the original game. This is **not** an AAA-complete release: see [world status](docs/WORLD_COMPLETION_PASS.md) and [validation captures](docs/validation/README.md).

## Run locally

Python 3 and a WebGL-capable browser are sufficient; no build step or external CDN is needed for the game.

```sh
cd living-abyss
python3 tools/dev_server.py --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/>. The development server reloads the page when runtime files change and should not be exposed to an untrusted network. The game should be served over HTTP rather than opened as `file://`, so local models and textures can load.

Click the game to look around. **W/S** swim, **A/D** turn, **Z/C** strafe, **Q/E** dive/rise, **Shift** sprints, **F** toggles the dolphin, **M** opens the map, **P** pauses, **H** hides the HUD, and **R** cycles quality. Near a portal, follow the on-screen **E** prompt. Startup defaults to low quality with a 30 FPS frame cap; higher quality costs more.

## Performance and streaming

The selected quality is preserved: off-screen plants, rocks and fish schools are culled conservatively, CPU work is reduced, and three distant full-quality assets load on approach or portal selection. A portal waits up to 15 seconds; if a load fails or is slow it warns and continues, and the detail can arrive later. Temporary failures are retried. See [performance results and limitations](docs/PERFORMANCE_PASS.md). The sampled optimizations do not guarantee lag-free play on every device.

## Checks

Run the standalone Node.js regressions from the project root:

```sh
for test in tests/*.mjs; do node "$test" || break; done
```

The optional current browser QA tools also need Playwright and Chromium; they are not game dependencies:

```sh
npm install --no-save --no-package-lock playwright
npx playwright install chromium
# In another terminal, start the development server first.
REVIEW_DIR=./docs/validation-local node tools/world-visual-qa.mjs
REVIEW_DIR=./docs/validation-local node tools/reef-visual-qa.mjs
REVIEW_DIR=./docs/validation-local node tools/turtle-visual-qa.mjs
REVIEW_DIR=./docs/validation-local node tools/streaming-qa.mjs
REVIEW_DIR=./docs/validation-local node tools/streaming-failure-qa.mjs
node tools/gameplay_smoke.mjs
```

These automated checks sample selected positions and behaviors; they do not establish full-route clearance, target-machine FPS or thermal safety. Some older diagnostic scripts in `tools/` retain environment-specific paths and are historical.

## Assets and current limitations

Third-party licenses, attribution, processing and source information are in [assets/ASSET_MANIFEST.md](assets/ASSET_MANIFEST.md); required credits are also in the in-game map. Smithsonian coral assets are artistically recolored derivatives of **dry museum specimens**, not photographs of living coral. The turtle is an approximate Blender rig and swim cycle. Some fish use simple shader deformation rather than skeletal animation. Several requested creatures and ecological interactions, deep-water art, complete traversal, and target-device profiling are still missing.

The original turtle source archive, editable rigged `.blend`, textures and license are preserved under `assets/source/ocean-turtle/`; they are not needed to play. To rerun the turtle normal bake and build scripts, the original [Ocean Turtle archive](https://github.com/CarpeNoctum101/baby-turtle-simulator-2/blob/main/Ocean%20Turtle.zip) at that path should have SHA-256 `0aad8ad0dd9cfd232588e81b3ab3d36db0a533268cac139de2be5b69d256f1e3`.
