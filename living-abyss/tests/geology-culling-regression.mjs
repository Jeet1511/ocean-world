import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
const field=new TerrainField().build(),c=new SwimController(field),group=buildGeology(field,c);
const totals={},v=new THREE.Vector3(),m=new THREE.Matrix4(),s=new THREE.Sphere();
let instances=0,mergedCount=0;
for(const o of group.children){
 if(o.name.startsWith('geology_')){
  mergedCount++;assert(o.frustumCulled);assert(o.geometry.boundingSphere);
  const family=o.name.match(/^geology_(limestone|reef|sandstone|basalt|mineral)/)[1];
  totals[family]=(totals[family]||0)+o.geometry.index.count/3;
  const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   v.fromBufferAttribute(p,i);
   assert(v.distanceTo(o.geometry.boundingSphere.center)<=o.geometry.boundingSphere.radius+0.01,'merged tile bound encloses vertices');
  }
 }
 if(o.isInstancedMesh){
  instances+=o.count;assert(o.frustumCulled && o.boundingSphere,'instanced tile has a culling bound');
  o.geometry.computeBoundingSphere();
  for(let i=0;i<o.count;i++){
   o.getMatrixAt(i,m);s.copy(o.geometry.boundingSphere).applyMatrix4(m);
   assert(s.center.distanceTo(o.boundingSphere.center)+s.radius<=o.boundingSphere.radius+0.01,'instance must remain inside tile bound');
  }
 }
}
assert(mergedCount>5,'geology is spatially partitioned');
assert.deepEqual(totals,{limestone:143992,reef:147324,sandstone:1820,basalt:37088,mineral:19040},'original family triangles preserved');
// Slope-constrained terrain changes the seeded acceptance of four small
// rubble/scree placements; this count records the new deterministic world.
assert.equal(instances,10264,'terrain-aware scree and decorative rubble count');
assert.equal(c.colliders.length,620,'same geology collision cores');
assert.equal(c.surfaceSolids.length,1034,'deterministic geology visible-surface registrations');
console.log(`PASS: ${mergedCount} bounded geology tiles, ${instances} rock/rubble instances, original hero triangle totals and current collision registrations.`);
