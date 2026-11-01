// A small number of non-solid, animated marine visitors. These are bounded
// patrols, not a general-purpose animal AI or a certified navigation system.
// Each species uses its own model: manta.glb for mantas/eagle rays,
// shark.glb for reef sharks/whale sharks. Blue whales are handled by whale.js.
// Source / attribution and the modified-asset chain: assets/ASSET_MANIFEST.md.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { clone } from '../../vendor/jsm/utils/SkeletonUtils.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { planMarinePatrols } from './marine-patrols.js?rev=37';
import { SIM_TIER } from '../core/simulation-lod.js?rev=37';

export const MARINE_VS = `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main(){
 vUv=uv;
 vec3 transformed=vec3(position);
 vec3 objectNormal=vec3(normal);
 #include <skinbase_vertex>
 #include <skinnormal_vertex>
 #include <skinning_vertex>
 vec4 wp=modelMatrix*vec4(transformed,1.0);
 vWorld=wp.xyz; vNormal=normalize(mat3(modelMatrix)*objectNormal);
 gl_Position=projectionMatrix*viewMatrix*wp;
}`;
export const MARINE_FS = GLSL_MEDIUM + GLSL_LIGHT + `
uniform sampler2D uMap; uniform vec3 uBase; uniform float uMapped;
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main(){
 vec3 n=normalize(vNormal); if(!gl_FrontFacing)n=-n;
 vec3 albedo=uBase * mix(vec3(1.0),texture2D(uMap,vUv).rgb,uMapped);
 vec3 color=litSurface(albedo,n,vWorld,0.68,0.88,0.25)+albedo*vec3(.18,.23,.24);
 gl_FragColor=vec4(applyWater(color,vWorld),1.0);
}`;

// Model + base colour per species. Eagle rays and whale sharks reuse the
// manta / shark geometry at different scales; their base colours differ.
const SPECIES = {
  manta:      { model:'manta',      base: [0.20, 0.22, 0.26], yaw: Math.PI/2 },
  eagle_ray:  { model:'manta',      base: [0.45, 0.30, 0.20], yaw: Math.PI/2, scaleBias: 0.60 },
  shark:      { model:'shark',      base: [0.30, 0.32, 0.34], yaw: Math.PI },
  whale_shark:{ model:'shark',      base: [0.55, 0.60, 0.45], yaw: Math.PI, scaleBias: 2.10 },
};

// How much of the model's local scale the `size` uniform represents. The
// patrol planner already multiplies by `size`; this bias lets us reuse one
// asset for multiple species.
export async function addLargeMarine(scene,field,colliders,schoolHints=[],quality='high'){
  const loader=new GLTFLoader();
  const modelNames=[...new Set(Object.values(SPECIES).map(s=>s.model))];
  const loaded=await Promise.allSettled(modelNames.map(n=>loader.loadAsync(`./assets/models/large_marine/${n}.glb`)));
  const assets={};
  loaded.forEach((result,i)=>{
    if(result.status==='fulfilled')assets[modelNames[i]]=result.value;
    else console.warn('Marine asset unavailable: '+modelNames[i],result.reason);
  });
  const group=new THREE.Group(), animals=[];
  group.name='large_marine_visitors';
  const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
  white.needsUpdate=true;
  const materials=new Map();
  const routes=planMarinePatrols(field,colliders,schoolHints,quality);
  for(const route of routes){
    const spec=SPECIES[route.kind];
    if(!spec)continue;
    const asset=assets[spec.model];
    if(!asset || !asset.animations.length)continue;
    // Effective scale: the route `size` already expresses metres; apply the
    // species bias so eagle rays are small and whale sharks are large.
    const effectiveSize=route.size*(spec.scaleBias||1.0);
    const model=clone(asset.scene);
    const orient=new THREE.Group();orient.rotation.y=spec.yaw;orient.add(model);
    const mixer=new THREE.AnimationMixer(model),clip=asset.animations[0];
    mixer.clipAction(clip).play();mixer.update(0);
    orient.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(orient), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.x)||size.x<.001)throw new Error('Invalid marine model bounds: '+route.kind);
    orient.position.copy(center).multiplyScalar(-1);
    const rig=new THREE.Group();rig.add(orient);rig.scale.setScalar(effectiveSize/size.x);
    const host=new THREE.Group();host.name=route.kind+'_visitor';host.add(rig);
    model.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      const original=o.material;
      if(!materials.has(original)){
        const base=new THREE.Color(...spec.base);
        materials.set(original,new THREE.ShaderMaterial({
          uniforms:withShared({uMap:{value:original.map||white},uBase:{value:base},uMapped:{value:original.map?1:0}}),
          vertexShader:MARINE_VS,fragmentShader:MARINE_FS,side:THREE.DoubleSide,
        }));
      }
      o.material=materials.get(original);
      o.frustumCulled=false;
    });
    // Give each animal its own vertical phase so animals on the same route
    // don't rise and fall in lockstep.
    route.verticalPhase=Math.random()*Math.PI*2;
    route.verticalAmp=route.verticalAmp||5;
    mixer.setTime(route.phase/Math.PI*clip.duration);
    const bodyCollider={type:'cap',x1:route.x,y1:route.y,z1:route.z,x2:route.x,y2:route.y,z2:route.z,
      r:Math.max(.45,effectiveSize*((route.kind==='manta'||route.kind==='eagle_ray')?.18:.12)),source:route.kind};
    colliders.push(bodyCollider);
    const temperament=Math.abs(Math.sin(route.phase*13.17+route.x*.031));
    const preyTarget=route.kind==='shark'?schoolHints.filter(h=>h.habitat===route.place&&h.consumePrey)
      .sort((a,b)=>Math.hypot(a.center.x-route.x,a.center.z-route.z)-Math.hypot(b.center.x-route.x,b.center.z-route.z))[0]:null;
    group.add(host);animals.push({...route,host,mixer,bodyCollider,effectiveSize,preyTarget,
      hunger:.35+temperament*.55,attackCooldown:6+temperament*9,kills:0,
      personality:{boldness:temperament,energy:.65+.3*Math.abs(Math.cos(route.phase*7.1)),social:route.kind.includes('ray')?.72:.28},behavior:'cruise'});
  }
  scene.add(group);
  // Keep a body-aligned capsule synchronized with each animated visitor.
  const syncBodyCollider=a=>{
    const f=new THREE.Vector3(0,0,-1).applyQuaternion(a.host.quaternion),p=a.host.position;
    const half=a.effectiveSize*((a.kind==='manta'||a.kind==='eagle_ray')?.32:.38),c=a.bodyCollider;
    c.x1=p.x-f.x*half;c.y1=p.y-f.y*half;c.z1=p.z-f.z*half;
    c.x2=p.x+f.x*half;c.y2=p.y+f.y*half;c.z2=p.z+f.z*half;
  };
  // Per-animal LOD-aware update. tier: SIM_TIER.NEAR|MEDIUM|FAR|OFF
  function animalUpdate(a, dt, tier, aiCost, cameraPosition){
    const dx=cameraPosition.x-a.host.position.x,dy=cameraPosition.y-a.host.position.y,dz=cameraPosition.z-a.host.position.z;
    const dist2=dx*dx+dy*dy+dz*dz;
    const distance=Math.sqrt(dist2);let speedFactor=a.personality.energy;
    a.attackCooldown=Math.max(0,a.attackCooldown-dt);a.hunger=Math.min(1,a.hunger+dt*.004);
    if(a.behavior==='feed'&&a.attackCooldown<12)a.behavior='patrol';
    if(a.kind==='shark'&&a.preyTarget&&a.hunger>.58){
      const pd=a.host.position.distanceTo(a.preyTarget.center);
      if(pd<18&&a.attackCooldown<=0){
        a.behavior='strike';speedFactor=1.65;
        if(a.preyTarget.consumePrey(a.host.position,performance.now()/1000)){
          a.kills++;a.hunger=.12;a.attackCooldown=18+a.personality.boldness*16;a.behavior='feed';
        }else a.attackCooldown=4;
      }else if(pd<55){a.behavior=pd<26?'pursuit':'stalk';speedFactor=pd<26?1.38:.72;}
    }
    if(distance<a.effectiveSize*1.4){a.behavior='evade';speedFactor=1.35-a.personality.boldness*.35;}
    else if(a.kind==='shark'&&distance<35&&a.personality.boldness>.55){a.behavior='investigate';speedFactor=.48;}
    else if((a.kind==='manta'||a.kind==='eagle_ray')&&distance<24){a.behavior='yield';speedFactor=.62;}
    else if(Math.sin(a.phase*.17+a.verticalPhase)<-.9){a.behavior='rest';speedFactor=.35;}
    else if(!['strike','feed','pursuit','stalk'].includes(a.behavior))a.behavior=a.kind==='shark'?'patrol':a.personality.social>.6?'social-cruise':'cruise';

    // Off-screen: advance phase only, no position or animation updates.
    if(tier===SIM_TIER.OFF){
      a.phase+=Math.min(dt,.1)*a.speed*0.1;
      a.host.visible=false;
      return;
    }

    // Far: minimal animation, no mixer update.
    if(tier===SIM_TIER.FAR){
      a.phase+=Math.min(dt,.1)*a.speed*speedFactor*0.3;
      const t=a.phase;
      const vertical=Math.sin(t*0.7+a.verticalPhase)*a.verticalAmp;
      a.host.position.set(a.x+Math.cos(t)*a.radius,a.y+vertical,a.z+Math.sin(t)*a.radius);
      const farPitch=-Math.atan2(Math.cos(t*.7+a.verticalPhase)*a.verticalAmp*.7,a.speed*a.radius*.9+.01);
      a.host.quaternion.setFromEuler(new THREE.Euler(farPitch,Math.atan2(-Math.cos(t),-Math.sin(t)),-Math.cos(t)*.22,'YXZ'));
      syncBodyCollider(a);a.host.visible=dist2<240*240;
      if(a.host.visible)a.mixer.update(dt*.18);
      return;
    }

    // Medium: reduced animation rate.
    if(tier===SIM_TIER.MEDIUM){
      a.phase+=Math.min(dt,.1)*a.speed*speedFactor*0.6;
      const t=a.phase;
      const vertical=Math.sin(t*0.7+a.verticalPhase)*a.verticalAmp;
      const x=a.x+Math.cos(t)*a.radius;
      const z=a.z+Math.sin(t)*a.radius;
      const y=a.y+vertical;
      a.host.position.set(x,y,z);syncBodyCollider(a);
      const vertSpeed=Math.cos(t*0.7+a.verticalPhase)*a.verticalAmp*0.7;
      const pitch=-Math.atan2(vertSpeed,a.speed*a.radius*0.9+0.01);
      const bank=-Math.cos(t)*0.5;
      const q=new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(pitch,Math.atan2(-Math.cos(t),-Math.sin(t)),bank,'YXZ'));
      a.host.quaternion.copy(q);
      a.host.visible=dist2<200*200;
      if(a.host.visible)a.mixer.update(dt*speedFactor*0.5);
      return;
    }

    // Near: full update.
    a.phase+=Math.min(dt,.1)*a.speed*speedFactor;
    const t=a.phase;
    const vertical=Math.sin(t*0.7+a.verticalPhase)*a.verticalAmp;
    const x=a.x+Math.cos(t)*a.radius;
    const z=a.z+Math.sin(t)*a.radius;
    const y=a.y+vertical;
    a.host.position.set(x,y,z);syncBodyCollider(a);
    const vertSpeed=Math.cos(t*0.7+a.verticalPhase)*a.verticalAmp*0.7;
    const pitch=-Math.atan2(vertSpeed,a.speed*a.radius*0.9+0.01);
    const bank=-Math.cos(t)*0.5;
    const q=new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(pitch,Math.atan2(-Math.cos(t),-Math.sin(t)),bank,'YXZ'));
    a.host.quaternion.copy(q);
    a.host.visible=dist2<180*180;
    if(a.host.visible)a.mixer.update(dt*speedFactor);
  }

  function update(dt,tier,aiCost,cameraPosition){
    for(const a of animals){
      animalUpdate(a,dt,tier,aiCost,cameraPosition);
    }
  }

  for(const a of animals){
    a.host.position.set(a.x+Math.cos(a.phase)*a.radius,a.y+Math.sin(a.phase*0.7+a.verticalPhase)*a.verticalAmp,a.z+Math.sin(a.phase)*a.radius);
  }
  return {
    group,animals,update,
    // LOD registration helpers: one entry per animal
    lodEntities: animals.map((a,idx)=>({
      id:`marine_${idx}`,
      update:(dt,tier,aiCost,cam)=>animalUpdate(a,dt,tier,aiCost,cam),
      getPosition:()=>a.host.position,
      getRadius:()=>a.radius||8,
      tier:SIM_TIER.NEAR,
    })),
  };
}
