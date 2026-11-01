// Textured animated reef-fish shoals, adapted from LasquetiSpice (CC BY 4.0).
// Attribution and the asset-processing chain are in assets/ASSET_MANIFEST.md.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/jsm/loaders/GLTFLoader.js';
import {clone} from '../../vendor/jsm/utils/SkeletonUtils.js';
import {withShared} from '../shaders/common.js?rev=37';
import {MARINE_VS,MARINE_FS} from './large-marine.js?rev=37';
import {planReefShoals} from './reef-shoal-plan.js?rev=37';

// Conservative envelope sampled from 42 equally spaced poses across the 41 s
// source clip. It is a sample, not an exact continuous animation bound.
const ANIM_CENTRE=new THREE.Vector3(.72,1.081,-.096);
export async function addReefShoals(scene,field,colliders,portals){
 const asset=await new GLTFLoader().loadAsync('./assets/models/marine_pass10/tropical-shoal.glb');
 if(!asset.animations.length)throw new Error('Tropical shoal animation missing');
 const group=new THREE.Group(),shoals=[],mats=new Map();group.name='textured_reef_shoals';
 for(const route of planReefShoals(field,colliders,portals)){
  const model=clone(asset.scene);
  model.position.copy(ANIM_CENTRE).multiplyScalar(-1);
  model.traverse(o=>{
   if(!o.isSkinnedMesh)return;
   const original=o.material;
   if(!original.map)throw new Error('Tropical shoal base color texture missing');
   if(!mats.has(original))mats.set(original,new THREE.ShaderMaterial({
    uniforms:withShared({uMap:{value:original.map},uBase:{value:original.color?.clone()||new THREE.Color(1,1,1)},uMapped:{value:1}}),
    vertexShader:MARINE_VS,fragmentShader:MARINE_FS,side:THREE.DoubleSide,
   }));
   o.material=mats.get(original);o.frustumCulled=false;
  });
  const host=new THREE.Group();host.name='reef_shoal_'+route.place;host.add(model);
  const mixer=new THREE.AnimationMixer(model);mixer.clipAction(asset.animations[0]).play();
  mixer.setTime(route.phase/(Math.PI*2)*asset.animations[0].duration);
  host.position.set(route.x+Math.cos(route.phase)*route.radius,route.y,route.z+Math.sin(route.phase)*route.radius);
  group.add(host);shoals.push({...route,host,mixer});
 }
 scene.add(group);
 function update(dt,camera){
  for(const a of shoals){
   const dist2=a.host.position.distanceToSquared(camera);
   a.phase+=Math.min(dt,.1)*a.speed*(dist2<64?.35:1);
   a.host.position.set(a.x+Math.cos(a.phase)*a.radius,a.y,a.z+Math.sin(a.phase)*a.radius);
   a.host.visible=dist2<135*135;
   if(a.host.visible)a.mixer.update(dt*(dist2<64?.35:1));
  }
 }
 // LOD-aware per-shoal step called by the SimulationLOD singleton.
 // dt is pre-scaled by the tier update period so phase stays locked to
 // real time; animation slows with distance but never freezes.
 function shoalLodStep(a,dt,tier,aiCost,camera){
  const f=[1,.35,.1,0][tier]||0;
  const d=a.host.position.distanceTo(camera);
  if(d>135){a.host.visible=false;return;}
  a.host.visible=true;
  const step=Math.min(dt,.1)*f*(d<64?.35:1);
  a.phase+=step*a.speed;
  a.host.position.set(a.x+Math.cos(a.phase)*a.radius,a.y,a.z+Math.sin(a.phase)*a.radius);
  if(a.host.visible)a.mixer.update(step);
 }
 return {group,shoals,update,
  lodEntities:shoals.map((a,i)=>({
   id:`reef-shoal-${a.place||i}`,
   getPosition:()=>a.host.position,
   getRadius:()=>20,
   update:(dt,tier,aiCost,cam)=>shoalLodStep(a,dt,tier,aiCost,cam),
  }))};
}
