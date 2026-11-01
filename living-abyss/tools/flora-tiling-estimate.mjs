// Compare conservative finer instance buckets at fixed views. All original
// matrices, quality-selected instances and geometry remain unchanged.
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';import {buildFlora} from '../src/world/flora.js?rev=09';import {planArrival} from '../src/world/arrival-plan.js?rev=09';
const f=new TerrainField().build(),ctrl=new SwimController(f);buildGeology(f,ctrl);buildCaverns(f,ctrl);
const portals=buildPortals(f,ctrl.colliders,ctrl.surfaceSolids).userData.portals,flora=buildFlora(f,{quality:'high'},ctrl.colliders,portals);
const camera=new THREE.PerspectiveCamera(62,16/9,.2,40000),m=new THREE.Matrix4(),s=new THREE.Sphere();
for(const q of ['low','high'])for(const id of ['glasshorizon','roseglass','verdant']){
 const p=planArrival(portals.find(x=>x.id===id),f);ctrl.setPose(p.x,p.y,p.z,p.yaw,p.pitch);ctrl.update(.016,camera);camera.updateMatrixWorld(true);
 flora.userData.setQuality(q);flora.userData.update(0,0,camera);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 let oldTris=0,oldDraws=0,tests={};for(const cell of [40,60,80,100,140])tests[cell]={triangles:0,draws:0};
 for(const o of flora.children){if(!o.isInstancedMesh||!o.visible||!frustum.intersectsObject(o))continue;
  const geo=o.geometry,tri=(geo.index?geo.index.count:geo.attributes.position.count)/3;oldTris+=o.count*tri;oldDraws++;
  if(!geo.boundingSphere)geo.computeBoundingSphere();const bins={};for(const c in tests)bins[c]=new Map();
  // Bounds include all allocated instances, even ones not currently selected.
  for(let i=0;i<o.userData.count;i++){
   o.getMatrixAt(i,m);s.copy(geo.boundingSphere).applyMatrix4(m);s.radius+=5;
   for(const cell in bins){const key=Math.floor(m.elements[12]/cell)+'_'+Math.floor(m.elements[14]/cell),b=bins[cell].get(key);
    if(!b)bins[cell].set(key,{sphere:s.clone(),count:i<o.count?1:0});else{b.sphere.union(s);if(i<o.count)b.count++;}}
  }
  for(const cell in bins)for(const b of bins[cell].values())if(b.count&&frustum.intersectsSphere(b.sphere)){tests[cell].draws++;tests[cell].triangles+=b.count*tri;}
 }
 console.log(q,id,'before',oldTris,oldDraws,'sizes',JSON.stringify(tests));
}
