import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {createMeshContactGuard} from '../src/player/mesh-contact.js';import {makeBoulder} from '../src/world/geology.js';
// Slow independent reference: brute-force the original visual triangles.
function reference(g,surfaceOnly=false){
 const pos=g.attributes.position,index=g.index,count=index?index.count:pos.count,triangles=[];
 for(let i=0;i+2<count;i+=3){const get=k=>index?index.getX(i+k):i+k;
  const a=new THREE.Vector3().fromBufferAttribute(pos,get(0)),b=new THREE.Vector3().fromBufferAttribute(pos,get(1)),c=new THREE.Vector3().fromBufferAttribute(pos,get(2));
  const tri=new THREE.Triangle(a,b,c);if(tri.getArea()<1e-10)continue;
  triangles.push({tri,minX:Math.min(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),maxX:Math.max(a.x,b.x,c.x),maxY:Math.max(a.y,b.y,c.y),maxZ:Math.max(a.z,b.z,c.z)});
 }
 const tmp=new THREE.Vector3(),near=new THREE.Vector3(),hit=new THREE.Vector3(),ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(.837,.337,.431).normalize());
 const inside=p=>{ray.origin.copy(p);const ds=[];for(const t of triangles)if(ray.intersectTriangle(t.tri.a,t.tri.b,t.tri.c,false,hit))ds.push(hit.distanceToSquared(p));
  ds.sort((a,b)=>a-b);let n=0,last=-Infinity;for(const d of ds)if(Math.abs(d-last)>1e-5*Math.max(1,d)){n++;last=d;}return n%2===1;};
 return (p,radius)=>{const r=radius+1e-5;let best=Infinity,tri=null;
  for(const t of triangles){if(p.x+r<t.minX||p.x-r>t.maxX||p.y+r<t.minY||p.y-r>t.maxY||p.z+r<t.minZ||p.z-r>t.maxZ)continue;
   t.tri.closestPointToPoint(p,tmp);let d=tmp.distanceToSquared(p);if(d<best){best=d;near.copy(tmp);tri=t.tri;}}
  const ins=!surfaceOnly&&inside(p);if(!ins&&best>=radius*radius)return false;
  if(ins&&best===Infinity)for(const t of triangles){t.tri.closestPointToPoint(p,tmp);const d=tmp.distanceToSquared(p);if(d<best){best=d;near.copy(tmp);tri=t.tri;}}
  if(!tri)return false;const d=Math.sqrt(best),dir=new THREE.Vector3();if(d>1e-7)dir.copy(p).sub(near).multiplyScalar((ins?-1:1)/d);else{tri.getNormal(dir);if(ins)dir.negate();}
  const push=ins?d+radius:radius-d;if(push<=1e-7)return false;p.addScaledVector(dir,push+1e-5);return true;};
}
let seed=1827712;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let checked=0;
for(const g of [new THREE.BoxGeometry(4,7,6),makeBoulder(41.1,5)])for(const surfaceOnly of [false,true]){
 const fast=createMeshContactGuard(g,{surfaceOnly}),slow=reference(g,surfaceOnly);
 for(let i=0;i<2000;i++){
  const p=new THREE.Vector3((rand()-.5)*10,(rand()-.5)*10,(rand()-.5)*10),r=.1+rand()*2,a=p.clone(),b=p.clone();
  const x=fast.resolve(a,r),y=slow(b,r);assert.equal(x,y,`contact differs at ${p.toArray()}`);
  if(x)assert(a.distanceTo(b)<1e-5,`contact correction differs: ${a.toArray()} vs ${b.toArray()}`);checked++;
 }
}
console.log(`PASS: BVH contact matches brute-force visual triangles for ${checked} deterministic sphere probes, including interior recovery and surface-only mode.`);
