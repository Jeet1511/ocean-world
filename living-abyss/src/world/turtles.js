// Textured, weighted sea-turtle visitors. Animated flippers and lightweight
// avoidance are an authored approximation, not a complete animal AI.
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/jsm/loaders/GLTFLoader.js';
import {clone} from '../../vendor/jsm/utils/SkeletonUtils.js';
import {GLSL_MEDIUM,GLSL_LIGHT,withShared} from '../shaders/common.js?rev=37';
import {MARINE_VS} from './large-marine.js?rev=37';
import {planTurtlePatrols,TURTLE_HABITATS} from './turtle-patrol-plan.js?rev=37';
import {SIM_TIER} from '../core/simulation-lod.js?rev=37';

const FS=GLSL_MEDIUM+GLSL_LIGHT+`
uniform sampler2D uMap;uniform sampler2D uNormalMap;uniform vec3 uBase;
uniform float uMapped;uniform float uNormalMapped;uniform float uFade;
varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 if(uNormalMapped>.5){
  vec3 q1=dFdx(vWorld),q2=dFdy(vWorld);vec2 st1=dFdx(vUv),st2=dFdy(vUv);
  vec3 t=q1*st2.y-q2*st1.y,b=-q1*st2.x+q2*st1.x;
  if(dot(t,t)>.000001&&dot(b,b)>.000001){
   vec3 d=normalize(mat3(normalize(t),normalize(b),n)*(texture2D(uNormalMap,vUv).xyz*2.0-1.0));
   n=normalize(mix(n,d,.36));
  }
 }
 vec3 albedo=uBase*mix(vec3(1.0),texture2D(uMap,vUv).rgb,uMapped);
 vec3 color=litSurface(albedo,n,vWorld,.73,.92,.3)+albedo*vec3(.18,.23,.24);
 gl_FragColor=vec4(applyWater(color,vWorld),uFade);
}`;

export async function addTurtles(scene,field,portals,colliders,quality='high'){
 const paths=planTurtlePatrols(field,portals,colliders,quality);
 const asset=await new GLTFLoader().loadAsync('./assets/models/sea_turtle/ocean-turtle.glb');
 if(!asset.animations.length)throw new Error('Turtle swim animation missing');
 const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;
 const flat=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);flat.needsUpdate=true;
 const group=new THREE.Group();group.name='sea_turtle_visitors';scene.add(group);
 const animals=[];
 for(let i=0;i<paths.length;i++){
  const route=paths[i],model=clone(asset.scene),mixer=new THREE.AnimationMixer(model);
  const clip=asset.animations[0];mixer.clipAction(clip).play();mixer.setTime(i*.68);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const extent=Math.max(size.x,size.z);if(!Number.isFinite(extent)||extent<.01)throw new Error('Invalid turtle model');
  model.position.sub(center);const rig=new THREE.Group();rig.add(model);rig.scale.setScalar(route.size/extent);
  const host=new THREE.Group();host.name=`turtle_${route.habitat}`;host.add(rig);group.add(host);
  const mats=[];
  model.traverse(o=>{
   if(!o.isMesh)return;const old=o.material;
   const mat=new THREE.ShaderMaterial({uniforms:withShared({uMap:{value:old.map||white},uNormalMap:{value:old.normalMap||flat},
    uBase:{value:old.color?.clone()||new THREE.Color(1,1,1)},uMapped:{value:old.map?1:0},uNormalMapped:{value:old.normalMap?1:0},uFade:{value:1}}),
    vertexShader:MARINE_VS,fragmentShader:FS,side:THREE.DoubleSide,transparent:true,depthWrite:true});
   o.material=mat;o.frustumCulled=false;mats.push(mat);
  });
  const a={...route,host,mixer,mats,offset:new THREE.Vector3(),verticalAmp:3+Math.random()*4};
  a.host.position.set(a.x+Math.cos(a.phase)*a.radius,a.y+Math.sin(a.phase*0.6)*a.verticalAmp,a.z+Math.sin(a.phase)*a.radius);
  a.host.rotation.y=Math.atan2(Math.sin(a.phase),-Math.cos(a.phase));animals.push(a);
 }
 const goal=new THREE.Vector3(),away=new THREE.Vector3(),desired=new THREE.Vector3();
 const target=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 function update(dt,camera){
  for(const a of animals){
   const t=Math.min(dt,.1);a.phase+=t*a.speed;
   // 3D helical patrol: the turtle circles while rising and falling more
   // strongly, then pitches and banks into its turns.
   const vertical=Math.sin(a.phase*0.6)*a.verticalAmp;
   const vertSpeed=Math.cos(a.phase*0.6)*a.verticalAmp*0.6;
   const pitch=-Math.atan2(vertSpeed,a.speed*a.radius*0.9+0.01);
   const bank=-Math.cos(a.phase)*0.4;
   const q=new THREE.Quaternion();
   q.setFromEuler(new THREE.Euler(pitch,Math.atan2(Math.sin(a.phase),-Math.cos(a.phase)),bank,'YXZ'));
   a.host.quaternion.slerp(q,1-Math.exp(-t*2.4));
   goal.set(a.x+Math.cos(a.phase)*a.radius,a.y+vertical,a.z+Math.sin(a.phase)*a.radius);
   away.copy(goal).sub(camera);const dist=away.length();desired.set(0,0,0);
   if(dist<5 && dist>.001){away.y*=.25;away.normalize();desired.copy(away).multiplyScalar((5-dist)*.45);}
   a.offset.lerp(desired,1-Math.exp(-t*1.8));goal.add(a.offset);a.host.position.copy(goal);
   const d=a.host.position.distanceTo(camera),fade=1-THREE.MathUtils.smoothstep(d,130,185);
   a.host.visible=fade>.001;for(const mat of a.mats)mat.uniforms.uFade.value=fade;
   if(a.host.visible)a.mixer.update(t);
  }
 }

 // LOD-aware per-turtle step called by the SimulationLOD singleton.
 // dt is already scaled by the tier update period, so phase advances stay
 // locked to real time; animation slows with distance but never freezes.
 function turtleLodStep(a,dt,tier,aiCost,camera){
  const f=[1,.35,.1,0][tier]||0;
  const d=a.host.position.distanceTo(camera);
  const fade=1-THREE.MathUtils.smoothstep(d,130,185);
  a.host.visible=fade>.001 && f>0;
  for(const mat of a.mats)mat.uniforms.uFade.value=fade;
  if(!a.host.visible)return;
  const t=Math.min(dt,.1)*f;
  a.phase+=t*a.speed;
  const vertical=Math.sin(a.phase*0.6)*a.verticalAmp;
  const vertSpeed=Math.cos(a.phase*0.6)*a.verticalAmp*0.6;
  const pitch=-Math.atan2(vertSpeed,a.speed*a.radius*0.9+0.01);
  const bank=-Math.cos(a.phase)*0.4;
  const q=new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(pitch,Math.atan2(Math.sin(a.phase),-Math.cos(a.phase)),bank,'YXZ'));
  a.host.quaternion.slerp(q,1-Math.exp(-t*2.4));
  goal.set(a.x+Math.cos(a.phase)*a.radius,a.y+vertical,a.z+Math.sin(a.phase)*a.radius);
  away.copy(goal).sub(camera);const dist=away.length();desired.set(0,0,0);
  if(dist<5 && dist>.001){away.y*=.25;away.normalize();desired.copy(away).multiplyScalar((5-dist)*.45);}
  a.offset.lerp(desired,1-Math.exp(-t*1.8));goal.add(a.offset);a.host.position.copy(goal);
  if(a.host.visible)a.mixer.update(t);
 }
 return {group,animals,update,limits:TURTLE_HABITATS,
  lodEntities:animals.map((a,i)=>({
   id:`turtle-${a.habitat||i}`,
   getPosition:()=>a.host.position,
   getRadius:()=>10,
   update:(dt,tier,aiCost,cam)=>turtleLodStep(a,dt,tier,aiCost,cam),
  }))};
}