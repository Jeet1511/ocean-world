import assert from 'node:assert/strict';
import {FramePacer} from '../src/core/frame-pacer.js';
for(const hz of [60,120,144])for(const [quality,target] of [['low',30],['medium',60],['high',60]]){
 const p=new FramePacer();let renders=0;
 for(let i=0;i<hz*10;i++)if(p.shouldRender(1000*i/hz,quality))renders++;
 assert(Math.abs(renders-target*10)<=2,`${hz} Hz display ${quality} pacing: ${renders}/10s`);
}
const p=new FramePacer();assert(p.shouldRender(1000,'low'));assert(!p.shouldRender(1002,'low'));assert(p.shouldRender(1003,'high'),'quality change immediately resets cap');
assert(p.shouldRender(5000,'high'),'long rendering pauses do not stall the loop');
console.log('PASS: low mode targets a 30 FPS ceiling, medium/high target 60 FPS, quality changes and long stalls recover.');
console.log('LIMIT: frame cap cannot guarantee device temperature or sustainable FPS.');
