// CPU-only diagnostic: compare currently submitted flora instances with a
// conservative per-instance frustum bound. Not GPU time or a performance claim.
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';
import {buildFlora} from '../src/world/flora.js?rev=09';
import {planArrival} from '../src/world/arrival-plan.js?rev=09';
const f=new TerrainField().build(),ctrl=new SwimController(f);buildGeology(f,ctrl);buildCaverns(f,ctrl);
const portals=buildPortals(f,ctrl.colliders,ctrl.surfaceSolids).userData.portals,flora=buildFlora(f,{quality:'high'},ctrl.colliders,portals);
const camera=new THREE.PerspectiveCamera(62,16/9,.2,40000),matrix=new THREE.Matrix4(),s=new THREE.Sphere();
for(const q of ['low','high'])for(const id of ['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl']){
 const p=planArrival(portals.find(x=>x.id===id),f);ctrl.setPose(p.x,p.y,p.z,p.yaw,p.pitch);ctrl.update(.016,camera);camera.updateMatrixWorld(true);
 flora.userData.setQuality(q);flora.userData.update(0,0,camera);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 let submitted=0,potential=0,draws=0,objects=0;
 for(const o of flora.children){if(!o.isInstancedMesh||!o.visible||!frustum.intersectsObject(o))continue;draws++;
  const tri=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;submitted+=o.count*tri;
  const geo=o.geometry;if(!geo.boundingSphere)geo.computeBoundingSphere();
  for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);s.copy(geo.boundingSphere).applyMatrix4(matrix);
   s.radius+=6; // generously encompass animated plant sway
   if(frustum.intersectsSphere(s)){potential+=tri;objects++;}
  }
 }
 console.log(`${q.padEnd(5)} ${id.padEnd(13)} submitted=${Math.round(submitted)} potential=${Math.round(potential)} ratio=${(potential/submitted).toFixed(3)} draws=${draws} instances=${objects}`);
}
