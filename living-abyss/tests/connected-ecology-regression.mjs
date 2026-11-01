import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {TerrainField} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildGeology} from '../src/world/geology.js';
import {buildCaverns} from '../src/world/caverns.js';
import {buildPortals} from '../src/world/portals.js';
import {buildAtmosphere} from '../src/world/atmosphere.js';
import {planMarinePatrols} from '../src/world/marine-patrols.js';
import {SchoolSimulation} from '../src/world/school-simulation.js';
const flat={heightAt:()=>-100}, one=()=>new SchoolSimulation(flat,{x:0,y:-10,z:0},new Float32Array([0,0,0]),new Float32Array([1]),()=>.5);
const neutral=one(),threatened=one(),far=one();
neutral.step(.125,null);threatened.step(.125,null,[{x:5,y:-10,z:0}]);far.step(.125,null,[{x:1000,y:-10,z:0}]);
assert(threatened.velocities[0]<neutral.velocities[0],'a nearby shark-shaped threat produces avoidance');
assert.equal(far.nearbyPredatorCount,0,'distant threats are rejected at school broad phase');
assert.deepEqual([...far.velocities],[...neutral.velocities],'far threats do not alter fish movement');
const field=new TerrainField().build(),c=new SwimController(field);buildGeology(field,c);buildCaverns(field,c);const portals=buildPortals(field,c.colliders,c.surfaceSolids).userData.portals;
const a=buildAtmosphere(field,{quality:'low'},c.colliders,null,portals),schools=a.group.children.filter(o=>o.userData.simulation);
const hints=schools.map(s=>({habitat:s.userData.habitat,center:s.userData.simulation.center}));
const routes=planMarinePatrols(field,c.colliders,hints),sharks=routes.filter(r=>r.kind==='shark');assert.ok(routes.length>=6,'expanded marine visitor patrols');assert.ok(sharks.length>=3,'shark patrols across destinations');
// At least two actual routes overlap a local school's neighborhood; older
// routes were all too far from schools for their threat response ever to fire.
const close=sharks.filter(q=>hints.some(h=>h.habitat===q.place&&Math.hypot(h.center.x-q.x,h.center.y-q.y,h.center.z-q.z)-q.radius<25));assert(close.length>=2);
for(const route of routes){
 for(let k=0;k<24;k++){
  const angle=k*Math.PI/12,x=route.x+Math.cos(angle)*route.radius,z=route.z+Math.sin(angle)*route.radius;
  assert(route.y>=field.surfaceHeightAt(x,z)+4.99,'sampled predator or ray is above the terrain');
  assert(!c.colliders.some(o=>{const b=o.visualBounds,m=3.5;return b&&x>b.min[0]-m&&x<b.max[0]+m&&route.y>b.min[1]-m&&route.y<b.max[1]+m&&z>b.min[2]-m&&z<b.max[2]+m;}),'sampled patrol avoids conservative rock bounds');
 }
}

let fish=schools[0],sim=fish.userData.simulation,others=schools.at(-1),remote=others.userData.simulation;let n=0,m=0;
const f=sim.step.bind(sim),g=remote.step.bind(remote);sim.step=(...args)=>{n++;return f(...args)};remote.step=(...args)=>{m++;return g(...args)};
globalThis.window={innerHeight:800};
const camera={position:sim.center.clone()},start=remote.time;
for(let i=0;i<40;i++)a.update(.1,camera,i*.1,[]);
assert(n>m && m>0,`remote schools step less often, but do not freeze: near=${n},far=${m}`);
assert(Math.abs(remote.time-start-4)<.3,`remote school time approximately tracks simulation: ${remote.time-start}`);
console.log(`PASS: predator response, ${close.length} sampled nearby shark patrols, remote fish advance at reduced frequency (near ${n}, far ${m}).`);
console.log('LIMIT: this is avoidance, not actual predation, feeding, reproduction or a validated food web.');
