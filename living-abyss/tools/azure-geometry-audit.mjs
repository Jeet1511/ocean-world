// Diagnose the actual Azure gate, planned arrival and collision-enabled approaches.
import * as THREE from '../vendor/three.module.js';import {TerrainField} from '../src/world/geography.js';import {SwimController} from '../src/player/controller.js';import {buildGeology} from '../src/world/geology.js';import {buildCaverns} from '../src/world/caverns.js';import {buildPortals} from '../src/world/portals.js';import {planArrival} from '../src/world/arrival-plan.js';
const field=new TerrainField().build(),c=new SwimController(field);const g=buildGeology(field,c);buildCaverns(field,c);
const portals=buildPortals(field,c.colliders,c.surfaceSolids),gate=portals.userData.portals.find(p=>p.id==='azurespan'),pose=planArrival(gate,field);
const arrival=new THREE.Vector3(pose.x,pose.y,pose.z),gatePos=new THREE.Vector3(gate.x,gate.centreY,gate.z);
console.log('GATE',gatePos.toArray(),'floor',gate.floorY,'verified',gate.clearanceVerified,'location',gate.loc.x,gate.loc.z);
console.log('POSE',pose,'terrain floor',field.surfaceHeightAt(pose.x,pose.z),'dist-to-gate',arrival.distanceTo(gatePos));
let overlaps=[];for(const s of c.surfaceSolids){const b=s.bounds,r=c.radius;if(arrival.x+r<b.min.x||arrival.x-r>b.max.x||arrival.y+r<b.min.y||arrival.y-r>b.max.y||arrival.z+r<b.min.z||arrival.z-r>b.max.z)continue;
 const test=arrival.clone();if(s.createGuard().resolve(test,r))overlaps.push({source:s.source,push:test.distanceTo(arrival),pushed:test.toArray()});}
console.log('ARRIVAL OVERLAPS',JSON.stringify(overlaps));
c.setPose(...arrival.toArray(),pose.yaw,pose.pitch);c.update(.016);console.log('POST COLLISION',c.pos.toArray(),'displacement',c.pos.distanceTo(arrival));
for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
 const start=new THREE.Vector3(gate.x+dx*40,gate.centreY,gate.z+dz*40);c.setPose(...start.toArray(),Math.atan2(dx,dz),0);c.keys.clear();c.addKey('KeyW',true);c.traceCollisions=true;c.collisionTrace=[];let entered=false;
 for(let i=0;i<160;i++){c.update(.05);if(portals.userData.inside(c.pos)?.id===gate.id){entered=true;break;}}
 console.log('APPROACH',dx,dz,'entered',entered,'end',c.pos.toArray(),'contacts',c.collisionTrace.length,c.collisionTrace.slice(-1).map(x=>x.kind+':'+x.source));
}
// Ring vertices vs the rendered terrain surface: a clear centre alone can
// still leave its lower arc hidden by rising terrain or a near approach rock.
gate.group.updateMatrixWorld(true);const ring=gate.group.getObjectByName('portal_ring'),p=ring.geometry.attributes.position,v=new THREE.Vector3();let buried=0,lowest=Infinity;
for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(ring.matrixWorld);const clearance=v.y-field.surfaceHeightAt(v.x,v.z);if(clearance<0)buried++;lowest=Math.min(lowest,clearance);}
console.log('RING TERRAIN',buried,'/',p.count,'vertices buried; minimum clearance',lowest.toFixed(3));
console.log('ARCHES',g.userData.stats.arches);
