// Regression fixtures from the pre-optimization build: terrain vertices/AO and
// simulated fish positions/velocities must remain bit-for-bit identical.
// The terrain hash is frozen; the fish hash was intentionally regenerated
// when school movement gained momentum, burst/glide speed pulsing and pitch
// attitude (more natural swimming). This is an intentional behavior change,
// not an optimization equivalence regression.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {buildTerrain} from '../src/world/terrain.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {buildAtmosphere} from '../src/world/atmosphere.js?rev=09';
import {obstacleMayBeNear} from '../src/world/school-simulation.js?rev=09';
const field = new TerrainField().build(), terrain = buildTerrain(field), th = createHash('sha256');
for (const o of terrain.children) {
  for (const name of ['position', 'normal', 'aAO']) {
    th.update(Buffer.from(o.geometry.attributes[name].array.buffer));
  }
  th.update(Buffer.from(o.geometry.index.array.buffer));
}
assert.equal(th.digest('hex'), 'eb1ab92ed47a4cef65f7a67960a4fb9933ea510314c4f76e89e04a85e09581f7', 'terrain and baked AO unchanged');
const c = new SwimController(field);
buildGeology(field, c);
buildCaverns(field, c);
const portals = buildPortals(field, c.colliders, c.surfaceSolids).userData.portals;
const atmosphere = buildAtmosphere(field, { quality: 'high' }, c.colliders, null, portals),
  schools = atmosphere.group.children.filter(o => o.userData.simulation);
const player = new THREE.Vector3(-470, -14, 390),
  predators = [new THREE.Vector3(-475, -18, 388), new THREE.Vector3(500, -70, 0)];
for (let k = 0; k < 20; k++) for (const s of schools) s.userData.simulation.step(.125, player, predators);
const h = createHash('sha256');
for (const s of schools) {
  h.update(Buffer.from(s.userData.simulation.positions.buffer));
  h.update(Buffer.from(s.userData.simulation.velocities.buffer));
}
assert.equal(h.digest('hex'), 'cc7df76da095eca718993b21e2eeb9507946f0b7eb812f4b2dbb16aaed2cef01', 'sampled fish simulation reflects intentional movement pass');
// Fuzz the broad phase against the original distance formulas, including very
// elongated ellipsoids and slanted capsules. It may admit false positives but
// must not reject a core whose original distance is below the threshold.
function oldDistance(c, x, y, z) {
  if (c.type === 'ell') return (Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry, (z - c.z) / c.rz) - 1) * Math.min(c.rx, c.ry, c.rz);
  if (c.type === 'cyl') {
    const dx = x - c.x, dz = z - c.z, h = Math.hypot(dx, dz) || 1e-9,
      v = y < c.yBase ? y - c.yBase : y > c.yTop ? y - c.yTop : 0, r = h - c.r;
    return v !== 0 && r < 0 ? Math.abs(v) : v !== 0 ? Math.hypot(r, v) : r;
  }
  const bx = c.x2 - c.x1, by = c.y2 - c.y1, bz = c.z2 - c.z1;
  const t = Math.max(0, Math.min(1, ((x - c.x1) * bx + (y - c.y1) * by + (z - c.z1) * bz) / (bx * bx + by * by + bz * bz || 1)));
  return Math.hypot(x - c.x1 - t * bx, y - c.y1 - t * by, z - c.z1 - t * bz) - c.r;
}
let seed = 123456789;
const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
for (let i = 0; i < 50000; i++) {
  const type = i % 3,
    shape = type === 0 ? { type: 'ell', x: 0, y: 0, z: 0, rx: .2 + rand() * 30, ry: .2 + rand() * 30, rz: .2 + rand() * 30 } :
      type === 1 ? { type: 'cyl', x: 0, z: 0, yBase: -10, yTop: 10, r: .2 + rand() * 20 } :
        { type: 'cap', x1: -8, y1: -3, z1: 5, x2: 12, y2: 7, z2: -9, r: .2 + rand() * 8 };
  const x = (rand() - .5) * 160, y = (rand() - .5) * 160, z = (rand() - .5) * 160, threshold = [.3, .5, 4][i % 3];
  if (oldDistance(shape, x, y, z) < threshold) assert(obstacleMayBeNear(shape, x, y, z, threshold), 'broad phase cannot reject a relevant obstacle');
}
console.log(`PASS: exact pre-optimization terrain/AO and ${schools.length} sampled fish trajectories; 50,000 conservative obstacle checks.`);
console.log('LIMIT: sampled trajectory equivalence is not full physics or device-performance certification.');
