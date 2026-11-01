// Visibility optimization must not delete or relocate marine flora.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { TerrainField } from '../src/world/geography.js';
import { buildFlora } from '../src/world/flora.js';
const field=new TerrainField().build(),flora=buildFlora(field,{quality:'high'});
const tiles=flora.children.filter(o=>o.isInstancedMesh),counts=tiles.map(o=>o.count);
const camera={position:new THREE.Vector3(0,-6,720)};
flora.userData.update(.016,0,camera);
const near=tiles.filter(o=>o.visible).length;
assert(near>0 && near<tiles.length,'near view keeps nearby tiles and culls remote tiles');
for(const tile of tiles){
 const b=tile.boundingSphere;
 if(camera.position.distanceTo(b.center)<=b.radius+320)assert(tile.visible,'high quality must retain tiles overlapping visibility range');
}
camera.position.set(10000,10000,10000);flora.userData.update(.016,0,camera);
assert.equal(tiles.filter(o=>o.visible).length,0,'far-away tiles culled');
camera.position.set(0,-6,720);flora.userData.update(.016,0,camera);
assert.equal(tiles.filter(o=>o.visible).length,near,'tiles return when revisited');
assert.deepEqual(tiles.map(o=>o.count),counts,'instance counts preserved');
flora.userData.setQuality('low');
const branching=tiles.filter(o=>o.userData.species.startsWith('coral_branching'));
assert(branching.length && branching.some(o=>o.count < o.userData.count),'low quality reduces branching coral submissions');
assert(tiles.every(o=>o.count > 0 && o.count <= o.userData.count),'low quality never exceeds original buffers');
flora.userData.setQuality('high');
assert.deepEqual(tiles.map(o=>o.count),counts,'quality changes restore all original instances');
console.log(`PASS: ${tiles.length} flora tiles retained; ${near} within high-quality range at start; visibility and quality budgets restore.`);
