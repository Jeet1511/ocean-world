import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField,CHAMBERS} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildCaverns} from '../src/world/caverns.js';
import {buildGeology} from '../src/world/geology.js';
import {buildPortals} from '../src/world/portals.js';
import {planArrival} from '../src/world/arrival-plan.js';
const field=new TerrainField().build(),controller=new SwimController(field);
buildGeology(field,controller);const caverns=buildCaverns(field,controller);
const nave=CHAMBERS.find(c=>c.name==='The Flooded Nave');
const roof=caverns.children.find(m=>m.name==='vault_'+nave.name);
const ray=new THREE.Raycaster(new THREE.Vector3(nave.x,0,nave.z),new THREE.Vector3(0,-1,0),0,80);
assert.equal(ray.intersectObject(roof,false).length,0,'opening is a real hole in the roof, not an effect through a solid');
ray.set(new THREE.Vector3(nave.x+50,0,nave.z),new THREE.Vector3(0,-1,0));
assert(ray.intersectObject(roof,false).length>0,'roof remains around the opening');
controller.setPose(nave.x,-45,nave.z,0,0);const next=new THREE.Vector3(nave.x,-5,nave.z);
controller.resolveRoofMovement(next);assert.equal(next.y,-5,'swept roof contact leaves the skylight passage open');
const gates=buildPortals(field,controller.colliders,controller.surfaceSolids).userData.portals;
for(const gate of gates){
 const p=planArrival(gate,field);controller.keys.clear();controller.setPose(p.x,p.y,p.z,p.yaw,p.pitch);
 const before=controller.pos.clone();controller.update(.016);
 assert(controller.pos.distanceTo(before)<.75,`${gate.id} arrival is pushed by nearby geometry`);
 assert(controller.pos.y < -1.2 && controller.pos.y>=field.surfaceHeightAt(controller.pos.x,controller.pos.z)+controller.radius-.01,`${gate.id} arrival is outside swimmable water`);
}
console.log('PASS: real Nave skylight, surrounding roof, open swept passage, and seven collision-resolved arrival poses.');
console.log('LIMIT: local vertical and single-pose samples do not prove a continuous route or all cave collisions.');
