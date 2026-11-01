import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildFlora} from '../src/world/flora.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {planReefShoals} from '../src/world/reef-shoal-plan.js?rev=09';
const field=new TerrainField().build(),c=new SwimController(field);buildGeology(field,c);
// The two towers diagnosed in screenshot 13: actual first ring in rendered geometry.
for(const source of ['formation:limestone:2','formation:limestone:6']){
 const s=c.surfaceSolids.find(q=>q.source===source);assert(s,source);const p=s.geometry.attributes.position;
 let max=-Infinity;
 for(let i=0;i<35;i++)max=Math.max(max,p.getY(i)-field.surfaceHeightAt(p.getX(i),p.getZ(i)));
 assert(max<-.10,`${source} base ring must remain buried in rendered terrain: ${max}`);
}
const caves=buildCaverns(field,c);
for(const vault of caves.children.filter(x=>x.name.startsWith('vault_'))){
 assert(vault.userData.contactGuard,'visible shell has swept contact guard');
 const position=vault.geometry.attributes.position,index=vault.geometry.index;
 // Actual shell triangle in the inner roof: attempt to cross it from either side.
 const k=6*64*6+30*6, get=i=>new THREE.Vector3().fromBufferAttribute(position,index.getX(k+i));
 const a=get(0),b=get(1),d=get(2),tri=new THREE.Triangle(a,b,d),normal=tri.getNormal(new THREE.Vector3());
 const mid=tri.getMidpoint(new THREE.Vector3());
 assert(tri.getArea()>1e-3,'sample is not degenerate');
 let resolved=0;
 for(const sign of [-1,1]){
  const p=mid.clone().addScaledVector(normal,sign*.4);
  if(vault.userData.contactGuard.resolve(p,1))resolved++;
 }
 assert.equal(resolved,2,`${vault.name} shell blocks both sides of sampled triangle`);
}
assert(c.surfaceSolids.filter(q=>q.source.startsWith('formations_')).length>0,'cave spires register visible collision surfaces');
const flora=buildFlora(field,{quality:'low'}),placements=flora.userData.twilightCoralPlacements;
assert.equal(placements.length,288);for(const p of placements)assert(Math.abs(p.y-field.surfaceHeightAt(p.x,p.z))<1e-6,'filter feeder base samples real terrain');
const portals=buildPortals(field,c.colliders,c.surfaceSolids).userData.portals;
const routes=planReefShoals(field,c.colliders,portals);assert.equal(routes.length,4);
assert.deepEqual(routes.map(r=>r.place),['glasshorizon','glasshorizon','roseglass','roseglass']);
console.log('PASS: two reported tower bases grounded, sampled vault shell contacts from both sides, cave spires registered, 288 grounded filter feeders, four planned reef shoals.');
console.log('LIMIT: these are targeted vertex and contact samples, not certification of every formation or swimming route.');
