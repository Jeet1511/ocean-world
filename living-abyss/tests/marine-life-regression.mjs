import assert from 'node:assert/strict';
import { TerrainField, WORLD } from '../src/world/geography.js';
import { buildAtmosphere } from '../src/world/atmosphere.js';
const field=new TerrainField().build();
const atmosphere=buildAtmosphere(field,{quality:'high'});
const schools=[];
atmosphere.group.traverse(o=>{ if(o.name==='fish_school') schools.push(o); });
assert.equal(schools.length,17,'all existing schools remain');
for(const school of schools){
 const c=school.material.uniforms.uCenter.value, floor=field.heightAt(c.x,c.z);
 assert(c.y < WORLD.seaLevel, `school above surface at ${c.toArray()}`);
 assert(c.y > floor, `school centre below terrain at ${c.toArray()}, terrain=${floor}`);
}
console.log('PASS: all 17 existing fish school centres lie below the surface and above their local seabed.');
console.log('NOTE: this does not certify every animated fish avoids terrain, rocks or cave roofs.');
