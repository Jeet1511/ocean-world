import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {InstanceFrustumCompactor,InstanceFrustumView} from '../src/rendering/instance-frustum.js?rev=09';
import {TerrainField} from '../src/world/geography.js?rev=09';import {buildFlora} from '../src/world/flora.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';import {buildPortals} from '../src/world/portals.js?rev=09';
import {buildAtmosphere,updateSchoolBounds} from '../src/world/atmosphere.js?rev=09';

// Small controlled mesh: exact order, reversible selection, camera rotations,
// and a generous displacement bound for a moving vertex near the view edge.
const geometry=new THREE.BoxGeometry(2,2,2),mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),5);
const m=new THREE.Matrix4();for(const [i,p] of [[0,[0,0,-8]],[1,[100,0,-8]],[2,[0,0,8]],[3,[2,0,-10]],[4,[-100,0,-8]]]){m.makeTranslation(...p);mesh.setMatrixAt(i,m);}
mesh.computeBoundingSphere();const original=Array.from(mesh.instanceMatrix.array),comp=new InstanceFrustumCompactor(mesh,{variants:[{geometry,margin:3}]});
const cam=new THREE.PerspectiveCamera(60,16/9,.2,1000);cam.position.set(0,0,0);cam.lookAt(0,0,-1);cam.updateMatrixWorld(true);
const view=new InstanceFrustumView();assert(view.update(cam));comp.compact(view.frustum);
assert.equal(mesh.count,2,'only the two complete objects in front are submitted');
for(let i=0;i<mesh.count;i++)assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(i*16,i*16+16)),original.slice(comp.currentIndices[i]*16,comp.currentIndices[i]*16+16));
cam.lookAt(0,0,1);assert(view.update(cam));comp.compact(view.frustum);assert.equal(mesh.count,1,'backwards view retains the object behind');
comp.select(3);comp.restore();assert.equal(mesh.count,3);assert.deepEqual(Array.from(mesh.instanceMatrix.array),original,'quality selection restores all source transforms');
comp.select(5);assert.equal(mesh.count,5);assert.deepEqual(Array.from(mesh.instanceMatrix.array),original,'full selection restores every transform');
comp.compact(view.frustum);assert.equal(mesh.count,1);const version=mesh.instanceMatrix.version;
comp.select(0);assert.equal(mesh.count,0);assert(mesh.instanceMatrix.version>version,'zero selection still marks the restored source for upload');
assert(mesh.instanceMatrix.updateRanges.some(r=>r.start===0&&r.count===original.length),'the whole restored buffer is uploaded');
comp.select(5);assert.equal(mesh.count,5);assert.deepEqual(Array.from(mesh.instanceMatrix.array),original,'zero-to-full selection cannot expose stale matrices');

// All generated flora bounds must contain both full and low geometry after
// the worst-case sway used by the shader. This covers every stored instance.
const field=new TerrainField().build(),ctrl=new SwimController(field),geology=buildGeology(field,ctrl);buildCaverns(field,ctrl);
const portals=buildPortals(field,ctrl.colliders,ctrl.surfaceSolids).userData.portals,flora=buildFlora(field,{quality:'high'},ctrl.colliders,portals);
let checked=0;const sphere=new THREE.Sphere(),point=new THREE.Vector3();
function margin(g,mat){const a=g.getAttribute('aStiff');let max=0;if(a)for(let i=0;i<a.count;i++)max=Math.max(max,Math.abs(a.getX(i)));return max*(2*Math.abs(mat.uniforms.uSwayAmp.value)+.1);}
for(const o of flora.children){const c=o.userData.visibilityCompactor;if(!c)continue;
 const variants=[o.userData.fullGeometry||o.geometry];if(o.userData.lowGeometry)variants.push(o.userData.lowGeometry);
 for(const g of variants){if(!g.boundingSphere)g.computeBoundingSphere();const extra=margin(g,o.material);
  for(let i=0;i<c.total;i++){
   m.fromArray(c.source,i*16);sphere.copy(g.boundingSphere).applyMatrix4(m);sphere.radius+=extra*m.getMaxScaleOnAxis();
   const j=i*4;point.set(c.spheres[j],c.spheres[j+1],c.spheres[j+2]);
   assert(point.distanceTo(sphere.center)+sphere.radius<=c.spheres[j+3]+.01,'animated plant bound contains full geometry and sway');checked++;
  }
 }
}
assert(checked>10000);
// Exercise selection and turn-away/return across the actual scene.
const worldCamera=new THREE.PerspectiveCamera(62,16/9,.2,40000);worldCamera.position.set(-476,-18,415);worldCamera.lookAt(-520,-20,300);worldCamera.updateMatrixWorld(true);
flora.userData.update(.016,0,worldCamera);const altered=flora.children.filter(o=>o.userData.visibilityCompactor&&o.count<o.userData.qualityCount).length;
assert(altered>0,'actual reef compacts offscreen instances');
worldCamera.lookAt(-400,-15,500);worldCamera.updateMatrixWorld(true);flora.userData.update(.016,0,worldCamera);
flora.userData.setInstanceCulling(false);flora.userData.update(.016,0,worldCamera);
for(const o of flora.children){const c=o.userData.visibilityCompactor;if(c){assert.equal(o.count,o.userData.qualityCount);assert.deepEqual(Array.from(o.instanceMatrix.array),Array.from(c.source));}}
flora.userData.setInstanceCulling(true);flora.userData.setQuality('low');flora.userData.update(.016,0,worldCamera);flora.userData.setQuality('high');flora.userData.setInstanceCulling(false);
for(const o of flora.children){const c=o.userData.visibilityCompactor;if(c)assert.equal(o.count,o.userData.count,'high quality restores all instances');}
const atmosphere=buildAtmosphere(field,{quality:'high'},ctrl.colliders,null,portals),schools=atmosphere.group.children.filter(o=>o.userData.simulation);
for(const school of schools){
 const sim=school.userData.simulation;sim.step(.125,null);updateSchoolBounds(school);assert(school.frustumCulled);
 for(const p of [sim.positions,sim.previous])for(let i=0;i<p.length;i+=3)
  assert(Math.hypot(p[i],p[i+1],p[i+2])+school.userData.fishShapeBound<=school.boundingSphere.radius+1e-6,'interpolated fish endpoints and shape remain inside culling sphere');
}
console.log(`PASS: reversible instance compaction, view changes, ${checked} sway-inclusive plant bounds and ${schools.length} dynamically bounded schools.`);
console.log('LIMIT: mathematical bounds and sampled views do not replace full traversal or target-hardware profiling.');
