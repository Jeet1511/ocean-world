import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TerrainField } from '../src/world/geography.js?rev=09';
import { buildFlora } from '../src/world/flora.js?rev=09';
import { planMarinePatrols } from '../src/world/marine-patrols.js?rev=09';
import { SwimController } from '../src/player/controller.js?rev=09';
import { buildGeology } from '../src/world/geology.js?rev=09';
import { buildCaverns } from '../src/world/caverns.js?rev=09';
import { buildPortals } from '../src/world/portals.js?rev=09';
const field=new TerrainField().build();
const flora=buildFlora(field,{quality:'low'}), cold=flora.userData.coldCoralPlacements;
assert.equal(cold.length,176,'four controlled deep-water colonies');
assert.equal(flora.userData.stats.coldCoral,cold.length);
for(const a of cold){
 assert(a.y < -260 && a.y > -690,'cold corals live at the intended depth');
 assert(Math.abs(a.y-field.surfaceHeightAt(a.x,a.z))<1e-6,'cold coral sits on the seabed');
 assert(['fan','sponge'].includes(a.kind));
}
assert(cold.some(a=>a.kind==='fan') && cold.some(a=>a.kind==='sponge'));
const controller=new SwimController(field);buildGeology(field,controller);buildCaverns(field,controller);buildPortals(field,controller.colliders,controller.surfaceSolids);
const patrols=planMarinePatrols(field,controller.colliders);
assert.ok(patrols.length>=6,'expanded marine visitor patrols should fit the actual world');
// Every destination should have at least one large marine visitor.
const places=new Set(patrols.map(p=>p.place));
assert.ok(places.has('glasshorizon') && places.has('roseglass') && places.has('verdant') && places.has('aurel') && places.has('azurespan'),'large marine spread across destinations');
// Species variety: mantas, eagle rays, sharks, whale sharks and blue whales.
const kinds=new Set(patrols.map(p=>p.kind));
assert.ok(kinds.has('manta') && kinds.has('shark') && kinds.has('blue_whale'),'core large marine species present');
assert.deepEqual(planMarinePatrols(field,controller.colliders),patrols,'seeded routes are deterministic');
for(const p of patrols){
 const [dMin,dMax]=p.depthBand||[0,80];
 assert(p.y<=-dMin+3 && p.y>=-dMax-20,'patrol within its depth band: '+p.place);
 for(let k=0;k<24;k++){
  const angle=k*Math.PI/12,x=p.x+Math.cos(angle)*p.radius,z=p.z+Math.sin(angle)*p.radius;
  assert(p.y>=field.surfaceHeightAt(x,z)+3-1e-6,'sampled patrol clears terrain');
  for(const c of controller.colliders){let b=c.visualBounds,m=3.5;if(b)assert(!(x>b.min[0]-m&&x<b.max[0]+m&&p.y>b.min[1]-m&&p.y<b.max[1]+m&&z>b.min[2]-m&&z<b.max[2]+m),'sampled patrol clears approximate collider bounds');}
 }
}
for(const kind of ['manta','shark']){
 const b=readFileSync(`assets/models/large_marine/${kind}.glb`);assert.equal(b.toString('ascii',0,4),'glTF');
 const n=b.readUInt32LE(12),gltf=JSON.parse(b.subarray(20,20+n).toString());
 assert(gltf.animations?.length && gltf.skins?.length,`${kind} has a rig and animation`);
}
assert(readFileSync('index.html','utf8').includes('Optic_idealist'),'CC BY credit exposed in game');
console.log(`PASS: ${cold.length} deep coral/sponge placements, six deterministic marine visitor routes, rigged local assets and on-screen attribution.`);
console.log('NOTE: route samples and approximate collider bounds are not complete continuous-geometry certification.');
