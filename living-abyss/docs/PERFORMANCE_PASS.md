# Performance pass — October 2026

This pass reduces unnecessary work while preserving the player's selected quality setting, existing geometry, instance populations, textures, effects and portal topology. It does **not** certify lag-free performance on a particular device.

## Changes

- Vegetation and geology use conservative, reversible per-instance frustum compaction inside the existing tiles. Original transforms are retained, and animated-plant bounds include shader sway. School draw bounds include both simulation/interpolation positions and shader deformation. Visible instances are not replaced by lower-quality meshes; the existing quality selections still work as before.
- Terrain ambient-occlusion sampling reuses precomputed offsets. School obstacle checks use a conservative broad phase and fewer temporary objects. Deterministic test hashes for terrain/AO and sampled school motion match the pre-pass results.
- The high-quality rock shader skips crack-cell hashes that cannot influence the final crack mask. It retains the same crack function for cells that can contribute; ambient light is also reused within a surface calculation.
- Table coral, deep coral and the blue whale are requested on approach or destination selection rather than during the initial build. Starting-habitat assets remain boot-critical. A coral prefetch begins 500 m from its habitat centre, outside the existing 240 m draw envelope. A portal waits for required destination detail for up to 15 seconds. On timeout or failure it allows travel and warns the player; late detail can then appear. Failed streamed loads retry after a five-second cooldown, and an explicit portal request can retry immediately. Network requests in flight are shared.
- Independent boot-critical assets can load concurrently. This changes scheduling, not visual assets or quality.

## Sampled evidence

Four matched 320×180 Chromium/SwiftShader screenshots were **pixel-identical** with frustum compaction on versus off. The render submissions were:

| View | Triangles before → after | Draw calls before → after |
|---|---:|---:|
| Roseglass, low | 3,757,038 → 2,860,340 | 382 → 362 |
| Roseglass, high | 12,962,189 → 8,797,053 | 508 → 489 |
| Verdant, low | 2,173,150 → 1,706,902 | 288 → 278 |
| Glass Horizon, low | 2,809,095 → 1,911,816 | 267 → 258 |

The reduction in submitted triangles is approximately 21–32% for those views, **not** a measured FPS improvement. Separately, before/after full-pass captures of Roseglass low/high and Verdant low were byte-identical. The high-quality rock-crack shader's old and bounded versions produced identical pixels in one sampled Roseglass view; 50,000 deterministic mathematical samples also matched. These captures do not prove equivalence at every camera pose, time or GPU.

Initial game-asset requests fell from 38 to 35; the audited encoded bodies fell from 27,512,271 to 25,362,259 bytes, approximately 7.8%, by postponing the three full-quality assets above. This is an asset-body comparison in a local run, not a network-speed or startup-time guarantee. The untouched starting spawn was checked across additional frames to ensure it does not immediately trigger those requests.

The added instance compaction has CPU cost: in a Node-only moving-camera audit it took median 0.528 ms and p95 0.671 ms per update, versus 0.012 ms and 0.040 ms without it. Those numbers exclude rendering, GPU buffer uploads, other game work and device variability. The shader's synthetic mathematical audit reduced the average cells hashed from 27 to 2.21; this operation count is not a hardware GPU benchmark.

## Validation and remaining risk

- All 34 `tests/*.mjs` scripts passed. The culling test sampled 29,938 sway-inclusive plant bounds and 45 moving-school bounds. Tests cannot prove all possible animation/camera combinations.
- Browser QA covered all seven arrival views, the cave at low/high, the re-baked turtle and two stroke poses, map/dolphin/pause/portal interaction, and whale loading/animation/pause. Normal runs reported no page errors or console warnings.
- A held table-coral request verified approach prefetch and that portal travel waited. Deliberate network failures verified coral and whale retries; a held deep-coral request verified the 15-second timeout, warning and later restoration of the full planned colony count. Those failure tests intentionally generated network errors/warnings.
- A very slow or failed load can therefore still cause missing detail or pop-in. Continuous swimming can outrun prefetch on a slow connection. Long-term memory, frame pacing, GPU time, thermals, and behavior on the user's actual hardware have **not** been measured. The existing low setting remains the default; use R to choose a higher setting.
- Reference-quality world art, complete creature coverage including the earlier 30-species request, ecosystem interactions, and full continuous traversal remain open; see `WORLD_COMPLETION_PASS.md`.

## Reproduce

Run `for test in tests/*.mjs; do node "$test" || break; done` from the project root. Optional Playwright/Chromium tools include `tools/performance-audit.mjs`, `tools/frustum-ab-qa.mjs`, `tools/shader-ab-qa.mjs`, `tools/streaming-qa.mjs`, `tools/streaming-failure-qa.mjs`, `tools/world-visual-qa.mjs` and `tools/turtle-visual-qa.mjs`; start `tools/dev_server.py` on port 8000 first. Browser tools are development dependencies, not game dependencies. Their default review output paths are sandbox-oriented; set `REVIEW_DIR` to choose a local output directory where supported.

For developer callers, `ABYSS.preload(id)` and `ABYSS.travel(id)` now return promises. A travel result of `false` means some destination detail did not finish loading, **not** that travel was canceled.
