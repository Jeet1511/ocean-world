import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {createMeshContactGuard} from '../src/player/mesh-contact.js';import {SwimController} from '../src/player/controller.js';
import {TerrainField} from '../src/world/geography.js';import {buildGeology} from '../src/world/geology.js';
const geo=new THREE.BoxGeometry(.2,12,12);geo.computeBoundingBox();
const c=new SwimController({heightAt:()=>-100});c.surfaceSolids.push({source:'thin-wall',bounds:geo.boundingBox.clone(),createGuard:()=>createMeshContactGuard(geo)});
for(const sign of [-1,1]){
 c.setPose(sign*5,0,0,0,0);let target=new THREE.Vector3(-sign*5,0,0);c.resolveSweptSurfaceSolids(target);
 assert(sign*target.x>=c.radius+.1-.02,`thin visible wall must not be tunneled from ${sign}: ${target.x}`);
}
c.setPose(-5,0,-2,0,0);let diagonal=new THREE.Vector3(5,0,2);c.resolveSweptSurfaceSolids(diagonal);
assert(diagonal.x<=-.1-c.radius+.02,'wall blocks diagonal movement');assert(diagonal.z>1,'contact retains tangential sliding');
c.setPose(-5,0,12,0,0);let open=new THREE.Vector3(5,0,12);c.resolveSweptSurfaceSolids(open);assert.equal(open.x,5,'open water remains clear');
// Real Azure rocks: ray-find an actual visible face and sweep toward it.
const field=new TerrainField().build(),live=new SwimController(field);buildGeology(field,live);
let hits=0;for(const solid of live.surfaceSolids.filter(s=>s.source.startsWith('boulder:azurespan:'))){
 const b=solid.bounds,centre=b.getCenter(new THREE.Vector3()),origin=new THREE.Vector3(b.max.x+6,centre.y,centre.z);
 const mesh=new THREE.Mesh(solid.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(origin,new THREE.Vector3(-1,0,0),0,1000),intersection=ray.intersectObject(mesh,false)[0];if(!intersection)continue;
 const start=intersection.point.clone().add(new THREE.Vector3(3,0,0)),end=intersection.point.clone().add(new THREE.Vector3(-9,0,0));
 const one=new SwimController({heightAt:()=>-100});one.surfaceSolids.push(solid);one.setPose(...start.toArray(),0,0);one.traceCollisions=true;one.resolveSweptSurfaceSolids(end);
 if(one.collisionTrace.some(e=>e.kind==='visible-rock-sweep'))hits++;if(hits>=5)break;
}
assert(hits>=5,`expected swept contact on five real Azure rock surfaces, got ${hits}`);
console.log('PASS: thin-wall sweep from both sides, diagonal sliding, open water and five sampled Azure rock surfaces.');
console.log('LIMIT: sampled sweeps are not a full-world continuous-navigation certificate.');
