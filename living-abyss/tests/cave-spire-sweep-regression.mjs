import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {SwimController} from '../src/player/controller.js';
import {createMeshContactGuard} from '../src/player/mesh-contact.js';
import {TerrainField} from '../src/world/geography.js';
import {buildCaverns} from '../src/world/caverns.js';
const geo=new THREE.PlaneGeometry(10,10);geo.rotateY(Math.PI/2);geo.computeBoundingBox();
const piece={source:'synthetic-spire',bounds:geo.boundingBox.clone(),createGuard:()=>createMeshContactGuard(geo,{surfaceOnly:true})};
const c=new SwimController({heightAt:()=>-100});c.surfaceSolids.push({sweptPieces:[piece]});
for(const sign of [-1,1]){
 c.setPose(sign*5,0,0,0,0);let target=new THREE.Vector3(-sign*5,0,0);c.resolveSweptCaveSpikes(target);
 assert(sign*target.x>=c.radius-.01,`high-speed sweep must stop on original side ${target.x}`);
}
c.setPose(-5,0,9,0,0);let target=new THREE.Vector3(5,0,9);c.resolveSweptCaveSpikes(target);assert.equal(target.x,5,'open space remains open');
const field=new TerrainField().build(),live=new SwimController(field);buildCaverns(field,live);
const spires=live.surfaceSolids.filter(s=>s.sweptPieces);assert(spires.length>=2);assert(spires.every(s=>s.sweptPieces.length>0));
for(const solid of spires){
 const part=solid.sweptPieces[0],box=part.bounds,mid=box.getCenter(new THREE.Vector3());
 // Sample a real spire at its centre elevation along its short horizontal axis.
 const size=box.getSize(new THREE.Vector3());const xAxis=size.x<size.z;
 let start=mid.clone(),end=mid.clone();
 if(xAxis){start.x=box.min.x-3;end.x=box.max.x+3;}else{start.z=box.min.z-3;end.z=box.max.z+3;}
 live.setPose(start.x,start.y,start.z,0,0);live.traceCollisions=true;live.collisionTrace=[];let next=end.clone();live.resolveSweptCaveSpikes(next);
 assert(live.collisionTrace.some(q=>q.kind==='cave-spike-surface'),`${solid.source} real spire swept contact`);
}
console.log('PASS: swept cave-spire contact from both sides, open space and sampled real spires in both chambers.');
console.log('LIMIT: discrete radius-spaced samples; other geology still uses endpoint checks.');
