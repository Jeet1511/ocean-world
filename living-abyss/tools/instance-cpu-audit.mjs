// CPU-only cost of culling while the camera turns/moves; no GPU timing.
import * as THREE from '../vendor/three.module.js';import {performance} from 'node:perf_hooks';
import {TerrainField} from '../src/world/geography.js?rev=09';import {SwimController} from '../src/player/controller.js?rev=09';import {buildGeology} from '../src/world/geology.js?rev=09';import {buildCaverns} from '../src/world/caverns.js?rev=09';import {buildPortals} from '../src/world/portals.js?rev=09';import {buildFlora} from '../src/world/flora.js?rev=09';import {planArrival} from '../src/world/arrival-plan.js?rev=09';
const f=new TerrainField().build(),ctrl=new SwimController(f),geology=buildGeology(f,ctrl);buildCaverns(f,ctrl);const portals=buildPortals(f,ctrl.colliders,ctrl.surfaceSolids).userData.portals;
const flora=buildFlora(f,{quality:'high'},ctrl.colliders,portals),p=planArrival(portals.find(x=>x.id==='roseglass'),f),camera=new THREE.PerspectiveCamera(62,16/9,.2,40000);
function run(enabled){flora.userData.setInstanceCulling(enabled);geology.userData.setInstanceCulling(enabled);const ts=[];
 for(let i=0;i<180;i++){
  const yaw=p.yaw+Math.sin(i*.035)*.45;camera.position.set(p.x+Math.sin(i*.02)*3,p.y,p.z+Math.cos(i*.02)*3);camera.lookAt(camera.position.x-Math.sin(yaw),camera.position.y-.1,camera.position.z-Math.cos(yaw));camera.updateMatrixWorld();
  const t=performance.now();flora.userData.update(.016,i*.016,camera);geology.userData.update(.016,i*.016,camera);const d=performance.now()-t;if(i>=30)ts.push(d);
 }
 ts.sort((a,b)=>a-b);return {median:ts[Math.floor(ts.length*.50)],p95:ts[Math.floor(ts.length*.95)],max:ts.at(-1)};
}
console.log(JSON.stringify({unculled:run(false),culled:run(true)},null,2));
