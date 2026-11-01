# QA report

## This pass
- `tests/school-simulation-regression.mjs`: 17 schools/1,420 fish, 10 simulated seconds; fish centre samples above rendered terrain and below surface, finite positions, player response. At final sample 0 within 0.5 m of an analytic core. This is not body-mesh, irregular-rock-shell or cave-roof verification.
- Chromium loaded both baseline and new scene; 17 schools retained; fish simulation advanced; no reported JS/shader errors in that run. Same-pose screenshots `omega-school-before.png` and `omega-school-after.png`: fish remain visually simple, rocks angular, place-card overlays obscure the middle; not accepted as final art.
- Existing terrain-slide, cliff, collider-fit, trace, 28 local gate-approach and geology merge regressions pass. These do not establish all-world routes, all gate interactions in this pass, or a bug-free world.

## Not passed
All seven destination wide/normal/detail/animal visual reviews, real full-route swims, exact collision-to-mesh audit for all object families, creature rig/anatomy, live RTX 3050 profiling.
- A later Chromium keyboard check verified the new school simulation stayed at the same time/position during P pause and resumed afterward, with no page or non-favicon console errors. This was a short software-rendered smoke test.
