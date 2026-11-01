import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildGeology, makeBoulder} from '../src/world/geology.js';
const boulder=makeBoulder(11,4);assert.equal(boulder.index,null,'regression case must be non-indexed');
const field=new TerrainField().build(),c=new SwimController(field),group=buildGeology(field,c);
let total=0,unused=0;
for(const mesh of group.children.filter(o=>o.name.startsWith('geology_'))){
 const g=mesh.geometry,used=new Uint8Array(g.attributes.position.count);
 for(let i=0;i<g.index.count;i++)used[g.index.getX(i)]=1;
 let missing=used.reduce((n,v)=>n+(v===0),0);total+=used.length;unused+=missing;
 console.log(mesh.name,'vertices',used.length,'unreferenced',missing,'triangles',g.index.count/3);
}
assert(unused/total < .005,`geometry merge has ${unused}/${total} unreferenced vertices`);
const rock=c.colliders.find(q=>q.source==='boulder:glasshorizon:19');assert(rock,'known boulder collider exists');
const origin=new THREE.Vector3(rock.x+rock.rx*2.5,rock.y,rock.z), dir=new THREE.Vector3(-1,0,0);
const ray=new THREE.Raycaster(origin,dir,0,rock.rx*4);group.updateMatrixWorld(true);
const hits=ray.intersectObjects(group.children.filter(o=>o.name.startsWith('geology_')),false);
assert(hits.length>0,'visible rock geometry must be raycastable at the reported obstacle');
console.log('PASS: non-indexed boulder vertices are included in visible merged triangles; geometry exists at the reported area.');
