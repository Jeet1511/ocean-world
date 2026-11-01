import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {planSpeciesSchools} from '../src/world/species-school-plan.js?rev=09';
const f=new TerrainField().build(),c=new SwimController(f);buildGeology(f,c);
const routes=planSpeciesSchools(f,c.colliders);
assert.deepEqual(routes,planSpeciesSchools(f,c.colliders),'placements deterministic');
assert.deepEqual(routes.map(r=>r.species),['palette_surgeonfish','palette_surgeonfish','bluefin_tuna']);
for(const r of routes){
 const floor=f.surfaceHeightAt(r.x,r.z);assert(floor>=r.floor[0]&&floor<=r.floor[1]);assert(r.y>floor+2&&r.y<0);assert.equal(r.count,8);
 for(let k=0;k<16;k++){let a=k*Math.PI/8;assert(f.surfaceHeightAt(r.x+Math.cos(a)*8,r.z+Math.sin(a)*8)<r.y-1.99);}
}
for(const [name,tris] of [['blue-tang',1536],['tuna',1438]]){
 let b=readFileSync(`assets/models/marine_pass11/${name}.glb`),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));
 let primitive=j.meshes[0].primitives[0];assert.equal(j.accessors[primitive.indices].count/3,tris);
 assert(j.materials[0].pbrMetallicRoughness.baseColorTexture,'textured source');
 assert(!j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture,'unused map not shipped');
}
console.log('PASS: two shallow surgeonfish groups, one open-water tuna group, sampled placement clearance and optimized texture assets.');
console.log('LIMIT: simplified static AI-assisted models, shader tail motion and sampled routes are not scientific or continuous-collision validation.');
