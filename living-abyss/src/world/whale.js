// Multiple licensed animated blue whales on open-water helical patrols.
// Non-solid, sampled clearance only; no claim of real migration or
// collision-certified AI.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/jsm/loaders/GLTFLoader.js';
import {clone} from '../../vendor/jsm/utils/SkeletonUtils.js';
import {withShared} from '../shaders/common.js?rev=37';
import {MARINE_VS,MARINE_FS} from './large-marine.js?rev=37';

const whaleCache={};
async function loadWhaleAsset(){
  if(whaleCache.promise)return whaleCache.promise;
  whaleCache.promise=new GLTFLoader().loadAsync('./assets/models/marine_pass12/blue-whale.glb')
    .then(asset=>{whaleCache.asset=asset;return asset;});
  return whaleCache.promise;
}

export async function addBlueWhales(scene,field,colliders,plannedRoutes=null){
  const routes=plannedRoutes||planWhaleRoutes(field,colliders);
  if(!routes.length)return null;
  const asset=await loadWhaleAsset();
  if(!asset.animations.length)throw new Error('Blue-whale animation missing');
  const group=new THREE.Group();group.name='blue_whales';scene.add(group);
  const states=[],white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
  white.needsUpdate=true;
  const materials=new Map();
  for(const route of routes){
    const model=clone(asset.scene),orient=new THREE.Group();orient.rotation.y=Math.PI/2;orient.add(model);
    const mixer=new THREE.AnimationMixer(model),swimAction=mixer.clipAction(asset.animations[0]);
    // The source clip has an extreme full-weight spinal bend. Blend it against
    // the intact bind pose so the tail moves without folding the torso into a U.
    swimAction.setEffectiveWeight(.32).setEffectiveTimeScale(.72).play();mixer.update(0);
    orient.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(orient),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.x)||size.x<.01)throw new Error('Invalid whale model bounds');
    orient.position.copy(center).multiplyScalar(-1);
    const rig=new THREE.Group();rig.add(orient);rig.scale.setScalar(route.size/size.x);
    const host=new THREE.Group();host.name='blue_whale_visitor';host.add(rig);
    model.traverse(o=>{
      if(!o.isMesh)return;
      const old=o.material;
      if(!materials.has(old))materials.set(old,new THREE.ShaderMaterial({
        uniforms:withShared({uMap:{value:old.map||white},uBase:{value:old.color?.clone()||new THREE.Color(1,1,1)},uMapped:{value:old.map?1:0}}),
        vertexShader:MARINE_VS,fragmentShader:MARINE_FS,side:THREE.DoubleSide,
      }));
      o.material=materials.get(old);o.frustumCulled=false;
    });
    mixer.setTime(route.phase/Math.PI*asset.animations[0].duration);
    group.add(host);
    const seed=(Math.sin(route.phase*91.73+route.x*.017+route.z*.013)*43758.5453)%1;
    const state={...route,host,mixer,personality:{
      curiosity:.15+Math.abs(seed)*.45,
      caution:.35+Math.abs(Math.sin(seed*17))* .5,
      energy:.72+Math.abs(Math.cos(seed*11))* .24,
      social:route.place==='azurespan'?.75:.25,
    },behavior:'cruise'};
    state.lodStep=(dt,tier,aiCost,camera)=>stepState(state,dt,tier,camera);
    state.host.position.set(route.x+Math.cos(route.phase)*route.radius,route.y+Math.sin(route.phase*0.5+route.verticalPhase)*route.verticalAmp,route.z+Math.sin(route.phase)*route.radius);
    states.push(state);
  }
  function update(dt,camera){
    for(const state of states){
      const d2=state.host.position.distanceToSquared(camera),factor=d2<400?.5:1;
      state.phase+=Math.min(dt,.1)*state.speed*factor;
      const a=state.phase;
      const vertical=Math.sin(a*0.5+state.verticalPhase)*state.verticalAmp;
      const x=state.x+Math.cos(a)*state.radius;
      const z=state.z+Math.sin(a)*state.radius;
      const y=state.y+vertical;
      state.host.position.set(x,y,z);
      const vertSpeed=Math.cos(a*0.5+state.verticalPhase)*state.verticalAmp*0.5;
      const pitch=-Math.atan2(vertSpeed,state.speed*state.radius*0.9+0.01);
      const bank=-Math.cos(a)*0.35;
      const q=new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(pitch,Math.atan2(-Math.cos(a),-Math.sin(a)),bank,'YXZ'));
      state.host.quaternion.copy(q);
      state.host.visible=state.host.position.distanceToSquared(camera)<260*260;
      if(state.host.visible)state.mixer.update(dt*factor);
    }
  }
  function stepState(state,dt,tier,camera){
    // SimulationLOD tiers are numeric; the old string-key lookup selected OFF
    // for every whale, leaving animation and patrol phase permanently frozen.
    const limits=[
      {range:300,mix:1,factor:1},
      {range:300,mix:.82,factor:.55},
      {range:300,mix:.58,factor:.24},
      {range:300,mix:.35,factor:.10},
    ];
    const lim=limits[Math.max(0,Math.min(3,tier|0))]||limits[3];
    const d=state.host.position.distanceTo(camera);
    if(d>lim.range){state.host.visible=false;return;}
    state.host.visible=true;
    const t=Math.min(dt,.1);
    // Individual responses: cautious whales accelerate smoothly out of close
    // encounters; curious animals slow for a distant inspection, while resting
    // phases conserve energy. Collision remains the final safety boundary.
    const personal=state.personality;
    let response=personal.energy;
    if(d<state.size*.72){state.behavior='avoid';response=1.25+personal.caution*.55;}
    else if(d<75&&personal.curiosity>.35){state.behavior='inspect';response=.48+personal.curiosity*.28;}
    else if(Math.sin(state.phase*.11+state.verticalPhase)<-.82){state.behavior='rest';response=.38;}
    else state.behavior=personal.social>.6?'pod-cruise':'cruise';
    state.phase+=t*state.speed*lim.factor*response;
    const a=state.phase;
    const vertical=Math.sin(a*.5+state.verticalPhase)*state.verticalAmp*lim.mix;
    state.host.position.set(state.x+Math.cos(a)*state.radius,state.y+vertical,state.z+Math.sin(a)*state.radius);
    const vertSpeed=Math.cos(a*.5+state.verticalPhase)*state.verticalAmp*.5*lim.mix;
    const pitch=-Math.atan2(vertSpeed,state.speed*state.radius*.9+.01),bank=-Math.cos(a)*.22*lim.mix;
    state.host.quaternion.setFromEuler(new THREE.Euler(pitch,Math.atan2(-Math.cos(a),-Math.sin(a)),bank,'YXZ'));
    // Update the physical body capsule after the visual pose. The capsule spans
    // the torso but leaves fins and tail non-solid, which avoids snagging while
    // still preventing the camera from passing through the whale.
    if(state.dynamicCollider){
      const f=new THREE.Vector3(0,0,-1).applyQuaternion(state.host.quaternion);
      const half=state.size*.34,c=state.dynamicCollider,p=state.host.position;
      c.x1=p.x-f.x*half;c.y1=p.y-f.y*half;c.z1=p.z-f.z*half;
      c.x2=p.x+f.x*half;c.y2=p.y+f.y*half;c.z2=p.z+f.z*half;
    }
    state.mixer.update(t*Math.max(.28,lim.factor));
  }
  function lodStep(dt,tier,camera){for(const state of states)stepState(state,dt,tier,camera);}
  return {states,update,lodStep,lodEntities:states.map(s=>s.host)};
}

// Backward-compatible single-route wrapper used by older callers.
export async function addBlueWhale(scene,field,colliders,plannedRoute=null){
  const result=await addBlueWhales(scene,field,colliders,plannedRoute?[plannedRoute]:null);
  if(!result)return null;
  const w=result.states[0];
  return {state:w,update:(dt,camera)=>result.update(dt,camera)};
}
