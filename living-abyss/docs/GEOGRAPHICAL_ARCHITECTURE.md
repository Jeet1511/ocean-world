# Geographical architecture

`geography.js` defines WORLD, pads, canyon paths, massifs, chambers, locations and gates. `terrain.js` renders tiled terrain; `surfaceHeightAt` matches the actual terrain triangles for collision, while `heightAt` remains the original bilinear placement sampler. Existing chart: `world_bathymetry.png` and live in-game map. No new world-scale elevation or coordinate changes this pass.

Key open issues: some cliff/terrain transitions are steep; caves and arches require actual end-to-end route validation; boulder cores intentionally underfit irregular ledges. A top-down depth chart does not prove connected 3D routes. The game name “Abyssal Bowl” is retained; its ~520–640 m depth is not the scientific abyssopelagic zone.
