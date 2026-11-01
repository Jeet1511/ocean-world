import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {buildFlora} from '../src/world/flora.js?rev=09';
import {planArrival} from '../src/world/arrival-plan.js?rev=09';
import {planScanColonies} from '../src/world/reef-scan-plan.js?rev=09';
const f=new TerrainField().build(),c=new SwimController(f);buildGeology(f,c);buildCaverns(f,c);
const portals=buildPortals(f,c.colliders,c.surfaceSolids).userData.portals;
const plan=planScanColonies(f,portals,c.colliders);
assert.deepEqual(plan,planScanColonies(f,portals,c.colliders),'placements are deterministic');
assert(plan.placements.filter(p=>p.habitat==='roseglass').length>=45,'reef retains authored scan colonies');
assert(plan.placements.filter(p=>p.habitat==='abyssalbowl'&&p.kind==='deep').length>0,'deep scan survives collision exclusions');
for(const p of plan.placements){
 assert(Math.abs(p.y+.04-f.surfaceHeightAt(p.x,p.z))<1e-6,'base follows terrain');
 assert(f.steepness(p.x,p.z)<=.46);
 const pose=planArrival(portals.find(q=>q.id===p.habitat),f),ux=-Math.sin(pose.yaw),uz=-Math.cos(pose.yaw);
 assert(Math.abs(-(p.x-pose.x)*uz+(p.z-pose.z)*ux)>=5,'new corals leave the approach centre open');
 if(p.kind==='deep')assert(p.habitat==='abyssalbowl'&&p.y<-400,'deep-coral scan restricted to deep habitat');
 else assert(['roseglass','glasshorizon'].includes(p.habitat)&&p.y>-52,'reef scans restricted to shallow water');
}
for(const kind of ['branching','boulder','foliose','staghorn','table','deep']){
 const data=readFileSync(`assets/models/coral_scans/${kind}.glb`);assert.equal(data.toString('ascii',0,4),'glTF');
 const n=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+n));assert(g.materials[0].pbrMetallicRoughness.baseColorTexture&&g.materials[0].normalTexture&&g.materials[0].occlusionTexture,`${kind} retains 3 scanned maps`);
 assert(data.length<1300000,`${kind} optimized storage`);
}
const flora=buildFlora(f,{quality:'high'},c.colliders,portals),tiles=flora.children.filter(x=>x.isInstancedMesh&&x.userData.lowGeometry);
assert(tiles.some(x=>x.userData.species.startsWith('kelp'))&&tiles.some(x=>x.userData.species.includes('branching')));
const old=tiles.map(x=>({g:x.geometry,count:x.count,matrix:Array.from(x.instanceMatrix.array)}));
flora.userData.setQuality('low');
for(let i=0;i<tiles.length;i++){
 const t=tiles[i],a=old[i],tri=g=>(g.index?g.index.count:g.attributes.position.count)/3;
 assert.notEqual(t.geometry,a.g,'low quality swaps actual geometry');
 assert(tri(t.geometry)<tri(a.g)*.75,`${t.name} has measurably simpler geometry`);
 assert(t.count>=Math.floor(a.count*.60)&&t.count<=a.count,'low retains much of original placement density');
 assert.deepEqual(Array.from(t.instanceMatrix.array),a.matrix,'quality change does not move instances');
}
flora.userData.setQuality('high');
for(let i=0;i<tiles.length;i++){assert.equal(tiles[i].geometry,old[i].g);assert.equal(tiles[i].count,old[i].count);}
console.log(`PASS: ${plan.placements.length} grounded, habitat-limited scan placements; six optimized mapped GLBs; ${tiles.length} flora tiles swap and restore genuine lower-poly LOD.`);
console.log('LIMIT: centreline and sampled terrain checks do not prove continuous navigation or whole-colony contact.');
