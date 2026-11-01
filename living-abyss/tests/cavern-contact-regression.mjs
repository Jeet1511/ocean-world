import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {SwimController} from '../src/player/controller.js';
import {createMeshContactGuard} from '../src/player/mesh-contact.js';
// Vertical wall at x=0 with a separate opening, world-space geometry as vaults use.
const geometry=new THREE.PlaneGeometry(10,10);geometry.rotateY(Math.PI/2);geometry.computeBoundingBox();
const wall=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());wall.userData.contactBounds=geometry.boundingBox;wall.userData.contactGuard=createMeshContactGuard(geometry,{surfaceOnly:true});
const c=new SwimController({heightAt:()=>-100});c.roofs.push(wall);c.setPose(-5,0,0,0,0);
let target=new THREE.Vector3(5,0,0);c.resolveRoofMovement(target);
assert(target.x < -c.radius+0.01,`lateral swept contact must stop on starting side: ${target.x}`);
c.setPose(-5,0,9,0,0);target.set(5,0,9);c.resolveRoofMovement(target);
assert.equal(target.x,5,'empty water beside wall must remain traversable');
const surface=createMeshContactGuard(geometry,{surfaceOnly:true});let p=new THREE.Vector3(10,0,0);assert.equal(surface.resolve(p,1),false,'open triangles must not define an enclosing volume');
console.log('PASS: swept lateral roof contact blocks the actual surface, while open water remains clear.');
