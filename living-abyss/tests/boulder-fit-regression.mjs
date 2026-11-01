import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeBoulder,fitBoulderCore} from '../src/world/geology.js';
// Check every triangle, not just bounding boxes or a single ray.
for (let seed=1;seed<=12;seed++) {
 const g=makeBoulder(seed*8,4);g.scale(20,12,17);g.rotateY(seed*.27);g.translate(130,-25,600);
 const center=new THREE.Vector3(130,-25,600), core=fitBoulderCore(g,center);
 assert(core.rx>0 && core.ry>0 && core.rz>0,'must retain a solid core');
 const p=g.attributes.position,t=new THREE.Triangle(),q=new THREE.Vector3(),origin=new THREE.Vector3();let min=Infinity;
 const v=(o,i)=>o.set((p.getX(i)-center.x)/core.rx,(p.getY(i)-center.y)/core.ry,(p.getZ(i)-center.z)/core.rz);
 for(let i=0;i<p.count;i+=3){v(t.a,i);v(t.b,i+1);v(t.c,i+2);t.closestPointToPoint(origin,q);min=Math.min(min,q.length());}
 assert(min>=1.0-1e-6,`collider protrudes through a triangle: ${min}`);
}
console.log('PASS: fitted boulder cores are nonzero and inside sampled actual triangles (outer ledges remain approximate).');
