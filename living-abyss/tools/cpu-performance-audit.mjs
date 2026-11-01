// Synthetic CPU audit for terrain creation and fish simulation; does not
// measure GPU time, in-game FPS, or device thermals.
import * as THREE from '../vendor/three.module.js';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {TerrainField} from '../src/world/geography.js?rev=09';import {buildTerrain} from '../src/world/terrain.js?rev=09';
import {SwimController} from '../src/player/controller.js?rev=09';import {buildGeology} from '../src/world/geology.js?rev=09';
import {buildCaverns} from '../src/world/caverns.js?rev=09';import {buildPortals} from '../src/world/portals.js?rev=09';
import {buildAtmosphere} from '../src/world/atmosphere.js?rev=09';
const f=new TerrainField().build();let terrainTimes=[],terrainHash;
for(let r=0;r<3;r++){let t=performance.now();const terrain=buildTerrain(f);terrainTimes.push(performance.now()-t);
 const h=createHash('sha256');for(const o of terrain.children){for(const name of ['position','normal','aAO'])h.update(Buffer.from(o.geometry.attributes[name].array.buffer));h.update(Buffer.from(o.geometry.index.array.buffer));}const result=h.digest('hex');if(r&&terrainHash!==result)throw Error('terrain non-deterministic');terrainHash=result;}
const c=new SwimController(f);buildGeology(f,c);buildCaverns(f,c);let portals=buildPortals(f,c.colliders,c.surfaceSolids).userData.portals;
const atmosphere=buildAtmosphere(f,{quality:'high'},c.colliders,null,portals),schools=atmosphere.group.children.filter(x=>x.userData.simulation);
const player=new THREE.Vector3(-470,-14,390),predators=[new THREE.Vector3(-475,-18,388),new THREE.Vector3(500,-70,0)];let fishTimes=[];
// Same deterministic seeded initial state: fixed sequence of 20 simulated steps.
for(let k=0;k<20;k++){const t=performance.now();for(const s of schools)s.userData.simulation.step(.125,player,predators);fishTimes.push(performance.now()-t);}
const h=createHash('sha256');for(const s of schools){h.update(Buffer.from(s.userData.simulation.positions.buffer));h.update(Buffer.from(s.userData.simulation.velocities.buffer));}
console.log(JSON.stringify({terrainMs:terrainTimes,terrainHash,schools:schools.length,fish:schools.reduce((n,s)=>n+s.count,0),fishMs:fishTimes,fishHash:h.digest('hex')},null,2));
