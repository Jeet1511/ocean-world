import assert from 'node:assert/strict';
import { SwimController } from '../src/player/controller.js';
const flat = {heightAt:()=>-100};
const obstacle = {type:'ell', x:0,y:-10,z:-4,rx:2,ry:2,rz:2,source:'boulder:trace-test',visualBounds:{min:[-2,-12,-6],max:[2,-8,-2]}};
function swim(trace) {
 const c=new SwimController(flat); c.colliders.push(obstacle); c.traceCollisions=trace;
 c.setPose(0,-10,0,0,0); c.addKey('KeyW',true);
 for(let i=0;i<60;i++) c.update(.05);
 return c;
}
const a=swim(false), b=swim(true);
assert.deepEqual(a.pos.toArray(),b.pos.toArray(),'tracing changes collision physics');
assert.equal(a.collisionTrace.length,0);
assert(b.collisionTrace.length && b.collisionTrace.length<=200);
assert.equal(b.collisionTrace[0].source,'boulder:trace-test');
assert.deepEqual(b.collisionTrace[0].collider.visualBounds, obstacle.visualBounds);
assert(b.collisionTrace[0].keys.includes('KeyW'));
const terrain=new SwimController({heightAt:()=>0}); terrain.traceCollisions=true; terrain.setPose(0,0,0); terrain.update(.05);
assert(terrain.collisionTrace.some(x=>x.kind==='terrain'));
console.log('PASS: opt-in contact trace identifies solids/terrain and does not alter physics');
