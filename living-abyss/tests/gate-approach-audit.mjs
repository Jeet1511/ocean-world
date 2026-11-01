import {TerrainField} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildGeology} from '../src/world/geology.js';
import {buildCaverns} from '../src/world/caverns.js';
import {buildPortals} from '../src/world/portals.js';
const field=new TerrainField().build(), c=new SwimController(field);
buildGeology(field,c); buildCaverns(field,c); const g=buildPortals(field,c.colliders,c.surfaceSolids); const gates=g.userData.portals;

let all=true;
for(const gate of gates){
 let passes=[];
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  c.setPose(gate.x+dx*30,gate.centreY,gate.z+dz*30,Math.atan2(dx,dz),0);c.keys.clear();c.addKey('KeyW',true);
  let reached=false;
  for(let i=0;i<180;i++){ c.update(0.05); if(g.userData.inside(c.pos)?.id===gate.id){reached=true;break;} }
  if(reached) passes.push([dx,dz]);
 }
 console.log(gate.id,'reachable approaches',passes.length,'/4',JSON.stringify(passes));
 if(!passes.length) all=false;
}
if(!all) process.exitCode=1;
