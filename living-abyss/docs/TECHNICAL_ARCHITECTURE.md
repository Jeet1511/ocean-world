# Technical architecture

`main.js` builds scene, renderer, controller, world, UI, gates and frame loop. `geography.js` owns heightfield and destination data; `terrain`, `geology`, `caverns`, `flora`, `portals`, `atmosphere`, `ocean`, `jellies`, `shells` build subsystems. `controller.js` integrates input, terrain, analytic cores and roof raycasts. `dolphin.js` uses the same controller. `hud.js` draws map, marker and interaction dial. `common.js` shares GLSL uniforms and underwater lighting.

New `school-simulation.js` contains bounded local-agent steering. Each existing school uploads dynamic position, previous-position and velocity attributes; shared fish shader interpolates. Population remains 17 schools/1,420 fish. `main.js` passes actual collider data and pauses simulation with the game. Revert from backup if necessary.
