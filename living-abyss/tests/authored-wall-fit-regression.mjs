import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js';import {SwimController} from '../src/player/controller.js';import {buildGeology} from '../src/world/geology.js';
const field=new TerrainField().build(),c=new SwimController(field);buildGeology(field,c);
const walls=c.colliders.filter(x=>x.source?.startsWith('wall:')), arches=c.colliders.filter(x=>x.source?.startsWith('arch:'));
assert(walls.length>0&&arches.length>0,'authored walls and arches must retain collision');
assert([...walls,...arches].every(x=>x.meshGuard?.triangleCount>0),'all authored wall and arch broad-phase shapes have a real triangle guard');
const w=walls.find(x=>x.source==='wall:verdant'&&x.x>670);assert(w);
const y=(w.yBase+w.yTop)/2;let free=0,contacts=0;
for(let j=0;j<24;j++)for(const r of [w.r*.2,w.r*.5,w.r*.8]){
 const a=j*Math.PI/12,p=new THREE.Vector3(w.x+Math.cos(a)*r,y,w.z+Math.sin(a)*r),before=p.clone();
 c.colliders=[w];c.resolveColliders(p);if(p.distanceTo(before)<1e-7)free++;else contacts++;
}
assert(free>0,'the overextended wall collider must no longer block all sampled empty water');
assert(contacts>0,'actual wall is still collidable');
console.log(`PASS: ${walls.length} wall and ${arches.length} arch broad-phase colliders use actual triangles; Verdant wall samples: ${free} clear, ${contacts} contacts.`);
