# Living Abyss — Performance Engineering Audit

Date: 2026-11-01

## Scope and rules

This audit treats frame pacing, not average FPS, as the primary outcome. The target budgets are 16.67 ms for 60 Hz and 33.33 ms for 30 Hz. Changes must preserve the ecosystem and visual identity; distance/quality systems should change representation and scheduling rather than delete content.

## Technical research translated to this project

1. **Measure frame time and subsystem cost.** Unreal's profiling guidance recommends milliseconds rather than FPS and first identifying whether the game thread, draw submission, or GPU is limiting. Chrome's Long Animation Frames API identifies main-thread frames delayed beyond 50 ms. The project now records bounded frame-time samples, percentiles, subsystem CPU timings and LoAF events.
2. **Amortize slowly changing work.** NVIDIA describes round-robin measurement for values that change predictably rather than recalculating everything every frame. This directly applies to terrain/flora visibility, LOD classification, and environmental queries.
3. **Batch repeated geometry.** Three.js InstancedMesh and Unity Entities Graphics both reduce submission overhead by batching objects that share geometry/material. The game already uses instancing heavily; the next audit step is identifying remaining material splits and small batches.
4. **Control overdraw and effect resolution, not feature identity.** NVIDIA's particle guidance renders fill-heavy effects to reduced-resolution targets. Unreal TSR similarly separates display quality from internal rendering cost. Water particles, volumetrics, bloom, and grading should each have measured internal resolution budgets.
5. **Avoid runtime compilation/resource recreation.** NVIDIA recommends pipeline caching and avoiding runtime shader compilation. Three.js documents that material/render-target disposal and recreation can trigger resource and shader re-creation. Destination variants must be pre-warmed or introduced incrementally.
6. **Use persistent, data-oriented state.** Unity DOTS uses contiguous entity data, batched rendering and delta GPU updates. Fish already use typed-array structure-of-arrays and a spatial grid; this should be retained and profiled before considering workers.
7. **Do not assume GPU limitation.** Resolution-scaling experiments distinguish fill/GPU pressure from main-thread simulation/draw submission. LoAF and subsystem timings distinguish JS stalls from rendering pressure.

## Official references

- Three.js WebGLRenderer statistics: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh.html
- Three.js resource disposal: https://threejs.org/manual/en/how-to-dispose-of-objects.html
- Chrome Long Animation Frames: https://developer.chrome.com/docs/web-platform/long-animation-frames
- Chrome runtime performance analysis: https://developer.chrome.com/docs/devtools/performance
- Unreal profiling overview: https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-and-profiling-overview
- Unreal Lumen performance budgets: https://dev.epicgames.com/documentation/unreal-engine/lumen-performance-guide-for-unreal-engine
- Unreal temporal upscaling: https://dev.epicgames.com/documentation/unreal-engine/temporal-super-resolution-in-unreal-engine
- Unity Entities Graphics performance: https://docs.unity3d.com/Packages/com.unity.entities.graphics@1.0/manual/entities-graphics-performance.html
- NVIDIA reduced-resolution particles: https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles
- NVIDIA pipeline/shader compilation guidance: https://developer.nvidia.com/blog/advanced-api-performance-pipeline-state-objects/
- NVIDIA amortized round-robin measurement: https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-28-mipmap-level-measurement

## Static baseline

- World destinations: 7
- Geology tiles: 30
- Rock/rubble instances: 10,264
- Flora tiles: 1,101
- Sway-inclusive plant bounds: 31,315
- Dynamically bounded fish schools: 45
- Explicit InstancedMesh construction sites: 10
- Material/shader construction sites: 26
- Asset payload in workspace: ~37 MB across 49 files
- Largest runtime GLB: tropical shoal, ~3.9 MB
- Barramundi animated GLB: ~3.5 MB
- Sea turtle GLB: ~1.9 MB
- Textures include multiple 1–2.2 MB normal/color maps

These figures show that freezes can originate from main-thread GLB parsing, shader compilation, visibility compaction, instance uploads, full-screen fill cost, or simultaneous LOD activation—not only fish AI.

## Runtime instrumentation added

`src/core/frame-profiler.js` uses fixed-size typed-array rings and records:

- average, median, p95, p99 and p99.9 frame time
- worst frame time
- average FPS, 1% low and 0.1% low FPS
- controller, creature LOD, atmosphere, flora, geology, HUD and render CPU sections
- draw calls, triangles, points, geometry count, texture count and program count
- JS heap where Chrome exposes `performance.memory`
- last ten Long Animation Frames

Console/API commands:

```js
await ABYSS.benchmark(10)
ABYSS.performanceReport()
await ABYSS.benchmarkTour(3)
ABYSS.resetPerformance()
ABYSS.renderInventory()
ABYSS.counts()
```

`benchmarkTour(3)` measures every destination for three seconds after a 500 ms settling period. Run each quality tier at least three times; use medians and preserve raw reports.

## Root causes already proven

- NaN terrain/player/creature coordinates could poison rendering.
- Fish pitch was fed back into vertical velocity, causing vertical acceleration.
- Remote schools and creature systems could activate together.
- Destination GLB parsing occurred during movement.
- A linear whale distance was compared with a squared threshold.
- All geology visibility groups could compact in one frame.
- Software rendering attempted expensive full-screen post-processing.
- Cavern cone shafts and low-sample scattering caused overdraw/artifacts.

## Next evidence-driven changes

1. Capture High and Ultra benchmark tours on hardware GPU and software WebGL.
2. Compare render CPU section and frame-time response at 0.75x versus 1.0x resolution. A strong response indicates fill/GPU pressure; a weak response indicates CPU/draw pressure.
3. Record draw/program changes entering every destination to locate shader-compilation spikes.
4. Record heap, texture, geometry and program counts before/after three complete tours to identify leaks or unbounded caches.
5. Instrument asset decode/parse duration and separate download from main-thread GLTF processing.
6. Convert remaining repeated small meshes/material variants only where the draw inventory proves material fragmentation.
7. Introduce fixed-timestep fish simulation with render interpolation only after current subsystem timings quantify its cost.
8. Evaluate a worker only if fish/AI CPU time is a material part of the frame; typed-array transfer and synchronization overhead must be measured first.

## Acceptance evidence required

No performance claim is complete without saved benchmark reports containing p99/p99.9 frame time, worst frame, LoAF count, renderer workload and memory before and after repeated destination tours. A successful build or screenshot is not performance evidence.
