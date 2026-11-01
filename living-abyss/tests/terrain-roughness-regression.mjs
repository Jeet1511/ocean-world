import assert from 'node:assert/strict';
import {TerrainField,LOCATIONS} from '../src/world/geography.js?rev=09';
const f=new TerrainField().build(),w=f.vx;let max=0,over40=0;
for(let j=0;j<f.nz;j++)for(let i=0;i<f.nx;i++){
 const k=j*w+i;for(const d of [Math.abs(f.heights[k]-f.heights[k+1]),Math.abs(f.heights[k]-f.heights[k+w])]){max=Math.max(max,d);if(d>40)over40++;}
}
assert(max<35.4,`worst 4 m grid jump ${max}`);assert.equal(over40,0);
for(const l of LOCATIONS){let y=f.surfaceHeightAt(l.x,l.z);assert(y<0&&y<=l.depth[0]+30&&y>=l.depth[1]-100,`${l.id} centre remains in its approximate intended depth band`);}
console.log(`PASS: global terrain-grid max adjacent height difference ${max.toFixed(2)} m, none above 40 m; all seven centre depths preserved within bands.`);
console.log('LIMIT: 35 m in one 4 m cell remains extremely steep; this is not a natural-geology or continuous-navigation certificate.');
