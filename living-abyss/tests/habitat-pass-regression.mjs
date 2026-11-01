import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/world/geography.js?rev=09';
import { HABITATS, sampleHabitat } from '../src/world/habitat-profiles.js?rev=09';
import { SchoolSimulation } from '../src/world/school-simulation.js?rev=09';

assert.equal(Object.keys(HABITATS).length, LOCATIONS.length);
for (const l of LOCATIONS) {
  const p=sampleHabitat(l.x,l.z);
  assert(p.weights[l.id] > .99, `${l.id} dominates at its centre`);
  assert(p.tint.every(x=>Number.isFinite(x)&&x>.7&&x<1.3));
  assert(p.density>.8 && p.density<1.2);
}
const far=sampleHabitat(10000,10000);
assert.deepEqual(far.tint,[1,1,1]); assert.equal(far.density,1);
for(let x=-900;x<900;x+=5){
  const a=sampleHabitat(x,300),b=sampleHabitat(x+5,300);
  assert(Math.max(...a.tint.map((v,i)=>Math.abs(v-b.tint[i])))<.01,'spatial blend is continuous');
}
// Distant fish in a large distribution do not pay for all-pairs checks.
const field={heightAt:()=>-100}, n=100, pos=new Float32Array(n*3), phases=new Float32Array(n);
for(let i=0;i<n;i++){pos[i*3]=(i%10)*5;pos[i*3+2]=Math.floor(i/10)*5;phases[i]=i*.1;}
const sim=new SchoolSimulation(field,{x:0,y:-10,z:0},pos,phases,()=>.5,[],HABITATS.glasshorizon.school);
sim.step(.125,null);
assert(sim.neighborChecks < n*(n-1)/5, `spatial bins checked ${sim.neighborChecks}`);
assert.equal(sim.radius,18); assert.equal(sim.maxSpeed,2.45);
// A fish directed into an analytic collider must not cross into its core.
const p=new Float32Array([2.55,0,0]), one=new SchoolSimulation(field,{x:0,y:-10,z:0},p,new Float32Array([0]),()=>.5,
  [{type:'cyl',x:0,z:0,r:2,yBase:-20,yTop:0}]);
one.velocities.set([-2,0,0]);
for(let i=0;i<8;i++)one.step(.125,null);
assert(!one.inObstacle(0),'fish stays outside core in controlled approach');
console.log(`PASS: seven blended habitats, continuity, ${sim.neighborChecks} / ${n*(n-1)} neighbour checks, bounded rock-core approach.`);
