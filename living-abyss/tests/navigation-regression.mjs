import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { SwimController } from '../src/player/controller.js';

// A diagonal move into a raised corner slides along the x axis. The old code
// applied the rejected corner's floor height after sliding, causing a jump.
const slope = new SwimController({heightAt:(x,z) => x > 0.01 && z > 0.01 ? 50 : -20});
slope.setPose(0,0,0,0,0); slope.vel.set(10,0,10); slope.update(0.05);
assert(slope.pos.x > 0 && Math.abs(slope.pos.z) < 1e-6, 'must slide along the clear axis');
assert(slope.pos.y < 1, `rejected corner must not lift swimmer: ${slope.pos.y}`);

// A real down-facing roof blocks upward movement, but not a point outside it.
const flat = {heightAt:()=>-100};
const roof = new THREE.Mesh(new THREE.PlaneGeometry(10,10), new THREE.MeshBasicMaterial());
roof.rotation.x = Math.PI / 2; roof.position.y = 3; roof.updateMatrixWorld(true);
function swimUp(x) {
 const c = new SwimController(flat); c.roofs.push(roof); c.setPose(x,0,0,0,0); c.addKey('KeyE',true);
 for(let i=0;i<80;i++) c.update(0.05);
 return c.pos.y;
}
const inside=swimUp(0), outside=swimUp(30);
assert(inside <= 3 - 1.15 + 1e-5, `visible roof must block ascent: ${inside}`);
assert(outside > 3, `open water must not have an imaginary roof: ${outside}`);
console.log('PASS: terrain slide avoids rejected floor; visible roof blocks ascent; open water remains clear.');
const edge = new SwimController(flat);
edge.setPose(850, -10, 0, 0, 0); edge.update(0.05);
assert(edge.pos.x >= 849, `must not clamp 60 m inside the map: ${edge.pos.x}`);
console.log('PASS: map boundary no longer clamps 60 m inside the authored edge.');
// Collision samples must lie on the actual rendered triangle rather than the
// bilinear patch. Synthetic saddle exposes the discrepancy at cell centre.
const {TerrainField, WORLD} = await import('../src/world/geography.js');
const terrain = new TerrainField();
terrain.cell=4; terrain.nx=1; terrain.nz=1; terrain.vx=2;
terrain.heights=new Float32Array([0,0,0,40]);
assert.equal(terrain.surfaceHeightAt(WORLD.minX+2,WORLD.minZ+2),0);
assert.equal(terrain.heightAt(WORLD.minX+2,WORLD.minZ+2),10);
const onMesh=new SwimController(terrain);
assert.equal(onMesh.floorAt(WORLD.minX+2,WORLD.minZ+2),0);
console.log('PASS: collision height matches rendered terrain triangles.');
// Swimming slightly down into a gently rising seabed should glide along it,
// not lose almost all horizontal motion to per-frame collision damping.
const gentle = new SwimController({heightAt:(x,z)=>0.03*x});
gentle.setPose(0,1.15,0,-Math.PI/2,-0.35); gentle.addKey('KeyW',true);
for(let i=0;i<120;i++) gentle.update(.05);
assert(gentle.pos.x > 30, `gentle seabed must not act like a wall: ${gentle.pos.x}`);
assert(gentle.pos.y >= 0.03*gentle.pos.x+gentle.radius-1e-5, 'must remain above solid seabed');
// A nearly vertical wall cannot be crossed by projecting movement onto it.
const cliff = new SwimController({heightAt:(x,z)=>x>0.1 ? 20 : 0});
cliff.setPose(0,1.15,0,-Math.PI/2,-0.35);cliff.addKey('KeyW',true);
for(let i=0;i<120;i++)cliff.update(.05);
assert(cliff.pos.x <= 0.1, `must not climb or phase through a sheer cliff: ${cliff.pos.x}`);
console.log('PASS: angled swimming glides along gentle seabed while a sheer cliff remains solid.');
