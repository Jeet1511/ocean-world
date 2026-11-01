# In-game validation captures

These are small Chromium/SwiftShader screenshots of the actual game, not offline renders or hardware-performance benchmarks. The seven destination images are single 320×180 arrival views, **not** continuous traversals. The turtle captures are 400×225. The current Bowl uses a modest, explicitly art-directed near-camera deep-water visibility fill.

- `glasshorizon.png`, `roseglass.png`, `verdant.png`, `aurel.png`, `azurespan.png`, `floodednave.png`, `abyssalbowl.png`: sampled views of all seven destinations. They show remaining gaps, notably sparse reef detail, faceted rocks, dark deep water and weak distant compositions.
- `nave-interior-low.png` and `nave-interior-high.png`: the same sampled Flooded Nave camera. Low uses the cheaper translucent shaft; high uses the aperture- and scene-depth-clipped half-resolution eight-step scattering pass. Smaller occluders along the sun ray and multiple scattering are not simulated.
- `turtle-in-world.png`, `turtle-stroke-a.png`, `turtle-stroke-b.png`: local in-world inspection after the original turtle normal map was independently re-baked into tangent space, with two key times of the approximate flipper cycle. These are diagnostic camera placements, not proof of a swim route or biomechanical validity.

All 34 `tests/*.mjs` scripts passed after the performance changes. The seven-view and turtle browser checks saw no page/console errors or warnings. A gameplay smoke covered map, dolphin toggle, pause, the seven-choice portal UI and one Roseglass travel; whale loading, animation and pause were also exercised. Turtle checks verified two shallow patrols, a weighted front-flipper vertex moving about 0.51 m between sampled animation times, and a nearby-swimmer avoidance response. Separate streaming tests intentionally induced network failures and a timeout. These are focused checks, not complete art, physics, ecology or traversal sign-off.

Four fixed software-rendered camera views were pixel-identical with the new flora/geology/school culling on versus off. Roseglass low went from 3,757,038 to 2,860,340 submitted triangles; Roseglass high went from 12,962,189 to 8,797,053. These numbers describe submissions, not GPU frame time, hardware FPS, power, memory or thermals. See `../PERFORMANCE_PASS.md` for all four views, startup asset bytes, shader and CPU checks, and limitations.

See `../WORLD_COMPLETION_PASS.md` for open work and `../../assets/ASSET_MANIFEST.md` for licenses and source changes.
