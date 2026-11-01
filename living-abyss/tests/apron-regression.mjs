import assert from 'node:assert/strict';
import {TerrainField,WORLD} from '../src/world/geography.js?rev=09';
import {buildApron} from '../src/world/terrain.js?rev=09';
const apron=buildApron(new TerrainField().build()),g=apron.geometry,p=g.attributes.position,ind=g.index;
const inside=k=>p.getX(k)>=WORLD.minX&&p.getX(k)<=WORLD.maxX&&p.getZ(k)>=WORLD.minZ&&p.getZ(k)<=WORLD.maxZ;
for(let i=0;i<ind.count;i+=3)assert(!(inside(ind.getX(i))&&inside(ind.getX(i+1))&&inside(ind.getX(i+2))),'interior apron triangle can poke through seabed');
assert(ind.count>0,'outer apron preserved');
console.log(`PASS: outer apron retains ${ind.count/3} triangles and has no wholly interior triangles; edge seams still require visual QA.`);
