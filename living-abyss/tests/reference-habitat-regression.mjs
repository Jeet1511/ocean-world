import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TerrainField,LOCATIONS} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {planFeatureGardens} from '../src/world/feature-garden-plan.js?rev=09';
import {planWhaleRoute} from '../src/world/whale-route.js?rev=09';
const f=new TerrainField().build(),c=new SwimController(f);buildGeology(f,c);buildCaverns(f,c);
const portals=buildPortals(f,c.colliders,c.surfaceSolids).userData.portals;
const gardens=planFeatureGardens(f,portals,c.colliders);
assert.deepEqual(gardens,planFeatureGardens(f,portals,c.colliders),'seeded gardens reproducible');
for(const l of LOCATIONS){
 const plants=gardens.placements.filter(q=>q.id===l.id);assert(plants.length>=10,`${l.id} retains a small feature garden`);
 const p=portals.find(p=>p.id===l.id),d=Math.hypot(l.x-p.x,l.z-p.z),dx=(l.x-p.x)/d,dz=(l.z-p.z)/d;
 for(const a of plants){
  assert(Math.abs(a.y-f.surfaceHeightAt(a.x,a.z))<1e-6,'base samples rendered terrain');
  const rx=a.x-p.x,rz=a.z-p.z;assert(Math.abs(-rx*dz+rz*dx)>=15,'central swimming aisle clear of new plants');
  assert(Math.hypot(rx,rz)>=24,'portal approach not occupied');
  if(['aurel','azurespan','floodednave','abyssalbowl'].includes(l.id))assert(['fan','sponge'].includes(a.kind),'deep/sheltered plants are filter-feeder forms, not tropical coral');
 }
}
assert(gardens.placements.some(p=>p.kind==='foliose'&&p.id==='roseglass'),'foliose reef garden present');
const whale=planWhaleRoute(f,c.colliders);assert(whale&&whale.size===22);assert.deepEqual(whale,planWhaleRoute(f,c.colliders));
for(let k=0;k<24;k++){
 const angle=k*Math.PI/12,x=whale.x+Math.cos(angle)*whale.radius,z=whale.z+Math.sin(angle)*whale.radius;
 for(const [u,v] of [[0,0],[12,0],[-12,0],[0,12],[0,-12]])assert(f.surfaceHeightAt(x+u,z+v)<=whale.y-27.99,'sampled whale envelope above terrain');
 for(const collider of c.colliders){const b=collider.visualBounds,m=12;if(b)assert(!(x>b.min[0]-m&&x<b.max[0]+m&&whale.y>b.min[1]-m&&whale.y<b.max[1]+m&&z>b.min[2]-m&&z<b.max[2]+m),'sampled whale position outside coarse rock bounds');}
}
const data=readFileSync('assets/models/marine_pass12/blue-whale.glb'),n=data.readUInt32LE(12),asset=JSON.parse(data.subarray(20,20+n));assert(asset.animations?.length&&asset.skins?.length,'local whale rig/clip retained');assert(readFileSync('index.html','utf8').includes('Bohdan Lvov'),'CC BY credit exposed');
console.log(`PASS: ${gardens.sites.length} garden patches, ${gardens.placements.length} grounded habitat placements in seven places; whale sampled-route clearance and attribution.`);
console.log('LIMIT: sampled floor/rock bounds are not complete continuous animal, plant-footprint or camera collision proof.');
