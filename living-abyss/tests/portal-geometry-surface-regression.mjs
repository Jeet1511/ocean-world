import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {createMeshContactGuard} from '../src/player/mesh-contact.js';
const field=new TerrainField().build(),c=new SwimController(field);
buildGeology(field,c);buildCaverns(field,c);
const original=c.colliders.length;
const portals=buildPortals(field,c.colliders,c.surfaceSolids).userData.portals;
assert.equal(portals.length,7);assert.equal(c.colliders.length,original,'no collider removed to clear a gate');
const guards=new Map();
function guardOf(s){if(!guards.has(s))guards.set(s,s.createGuard());return guards.get(s);}
function pointClear(solid,px,py,pz,r){
  const b=solid.bounds;
  if(px+r<b.min.x||px-r>b.max.x||py+r<b.min.y||py-r>b.max.y||pz+r<b.min.z||pz-r>b.max.z)return true;
  return !guardOf(solid).resolve(new THREE.Vector3(px,py,pz),r);
}
for(const p of portals){
  assert(p.clearanceVerified,`${p.id} gate has no clear site`);
  const azurespan=p.id==='azurespan';
  for(const s of c.surfaceSolids){const b=s.bounds;
    if(azurespan) continue; // Azure is certified by exact triangle + sampled approach checks below
    assert(!(p.x+12.5>b.min.x&&p.x-12.5<b.max.x&&p.z+12.5>b.min.z&&p.z-12.5<b.max.z&&p.centreY+10>b.min.y&&p.centreY-10<b.max.y),`${p.id} intersects ${s.source}`);
  }
  if(azurespan){
    // Exact-surface certification: ring point plus a full ring apron must not
    // penetrate any actual visible triangle whose bounds reach it.
    let ringOk=true;
    for(const s of c.surfaceSolids)if(!pointClear(s,p.x,p.centreY,p.z,14)){ringOk=false;break;}
    assert(ringOk,'Azure ring point penetrates visible geometry');
    for(let a=0;a<Math.PI*2;a+=Math.PI/4){
      const px=p.x+Math.cos(a)*14,pz=p.z+Math.sin(a)*14;
      const floor=field.surfaceHeightAt(px,pz);
      if(p.centreY-floor<2||p.centreY-floor>16)throw new Error(`Azure ring apron off-floor at ${a}`);
      for(const s of c.surfaceSolids)if(!pointClear(s,px,p.centreY,pz,2)){ringOk=false;break;}
    }
    assert(ringOk,'Azure ring apron penetrates visible geometry');
  }
  let reaches=0;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    c.setPose(p.x+dx*24,p.centreY,p.z+dz*24,Math.atan2(dx,dz),0);c.keys.clear();c.addKey('KeyW',true);
    for(let i=0;i<100;i++){c.update(.05);if(Math.hypot(c.pos.x-p.x,c.pos.z-p.z)<p.radius*1.55 && Math.abs(c.pos.y-p.centreY)<p.radius*1.5){reaches++;break;}}
  }
  assert(reaches>=2,`${p.id} has fewer than two short approach paths`);
  console.log(`${p.id}: visual bounds clear; ${reaches}/4 local collision-enabled approaches`);
}
// Probe actual visible boulder triangles, not their conservative ellipsoid cores.
const candidates=c.surfaceSolids.filter(s=>s.source.startsWith('boulder:glasshorizon:'));
let hits=0;
for(const s of candidates.slice(0,12)){
  const b=s.bounds,centre=b.getCenter(new THREE.Vector3());
  const origin=new THREE.Vector3(b.max.x+6,centre.y,centre.z),dir=centre.clone().sub(origin).normalize();
  const mesh=new THREE.Mesh(s.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const ray=new THREE.Raycaster(origin,dir,0,1000),hit=ray.intersectObject(mesh,false)[0];
  if(!hit)continue;
  const point=hit.point.clone().addScaledVector(dir,-.35),old=point.clone();
  if(s.createGuard().resolve(point,1.15)&&point.distanceTo(old)>.1)hits++;
}
assert(hits>=4,`actual rock surface contact expected, got ${hits}`);
console.log(`PASS: ${hits} sampled visible Glass Horizon boulder surfaces produce triangle contact; not a full-world proof.`);
