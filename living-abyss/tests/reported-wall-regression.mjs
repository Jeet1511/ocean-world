import assert from 'node:assert/strict';
import {TerrainField} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildGeology} from '../src/world/geology.js';
import {buildCaverns} from '../src/world/caverns.js';
import {buildPortals} from '../src/world/portals.js';
const field = new TerrainField().build(), c = new SwimController(field);
buildGeology(field,c); buildCaverns(field,c);
const portals=buildPortals(field,c.colliders,c.surfaceSolids).userData.portals;

c.traceCollisions=true; c.setPose(46,-6,640,0,-.35); c.addKey('KeyW',true);
for(let i=0;i<120;i++) c.update(.05);
const distance=Math.hypot(c.pos.x-46,c.pos.z-640);
assert(distance>25, `downward-angled swim stuck after ${distance.toFixed(2)} m`);
assert(c.collisionTrace.some(x=>x.kind==='terrain'), 'test must exercise terrain contact');
assert(c.pos.y>=field.surfaceHeightAt(c.pos.x,c.pos.z)+c.radius-1e-5, 'cannot pass through seabed');
console.log(`PASS: reported-area downward-angled swim covered ${distance.toFixed(2)} m; terrain remains solid.`);
