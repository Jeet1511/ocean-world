// CC0 Khronos/Microsoft barramundi, re-rigged in Blender for shallow water.
// Non-solid individual fish; the existing 17 instanced schools are untouched.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { clone } from '../../vendor/jsm/utils/SkeletonUtils.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';

const VS = `
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
const FS = GLSL_MEDIUM + GLSL_LIGHT + `
uniform sampler2D uColorMap; uniform sampler2D uNormalMap; uniform sampler2D uArmMap;
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main(){
 vec3 N=normalize(vNormal); if(!gl_FrontFacing)N=-N;
 vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);vec2 duv1=dFdx(vUv),duv2=dFdy(vUv);
 vec3 T=normalize(dp1*duv2.y-dp2*duv1.y);
 vec3 B=normalize(-dp1*duv2.x+dp2*duv1.x);
 vec3 mapped=texture2D(uNormalMap,vUv).xyz*2.0-1.0;
 N=normalize(mix(N,normalize(mat3(T,B,N)*mapped),0.45));
 vec3 albedo=texture2D(uColorMap,vUv).rgb;
 float rough=texture2D(uArmMap,vUv).g;
 // Soft coastal fill keeps the unlit side of the textured animal legible.
 vec3 col=litSurface(albedo,N,vWorld,rough,0.75,0.3) + albedo*vec3(0.24,0.31,0.33);
 gl_FragColor=vec4(applyWater(col,vWorld),1.0);
}`;

export async function addBarramundi(scene,field,colliders){
 const gltf=await new GLTFLoader().loadAsync('./assets/models/barramundi/barramundi_swim.glb');
 let original;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)original=o;});
 if(!original || !gltf.animations.length || !original.material.map || !original.material.normalMap || !original.material.roughnessMap)
  throw new Error('Rigged barramundi or PBR maps missing');
 const material=new THREE.ShaderMaterial({uniforms:withShared({uColorMap:{value:original.material.map},uNormalMap:{value:original.material.normalMap},uArmMap:{value:original.material.roughnessMap}}),vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide});
 const random=mulberry32(78231), group=new THREE.Group(), fish=[];
 group.name='shallow_coastal_barramundi';
 // Small patrol envelopes, sampled against terrain and conservative rock AABBs.
 // Not a general wildlife navigation/roof-intersection solution.
 for(let tries=0;tries<1200 && fish.length<5;tries++){
  const a=random()*Math.PI*2, r=24+random()*125, x=Math.cos(a)*r,z=720+Math.sin(a)*r;
  const floor=field.surfaceHeightAt(x,z), y=Math.min(-4.5,floor+3.8),radius=2.2+random()*1.3;
  if(floor < -25 || floor > -7.5 || y-floor<2.8)continue;
  let safe=true;
  for(let k=0;k<16&&safe;k++){
   const angle=k*Math.PI/8,px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
   if(field.surfaceHeightAt(px,pz)>y-1.8){safe=false;break;}
   if(colliders.some(c=>{const b=c.visualBounds,margin=1.3;return b&&px>b.min[0]-margin&&px<b.max[0]+margin&&y>b.min[1]-margin&&y<b.max[1]+margin&&pz>b.min[2]-margin&&pz<b.max[2]+margin;}))safe=false;
  }
  if(!safe || fish.some(f=>Math.hypot(f.x-x,f.z-z)<16))continue;
  const model=clone(gltf.scene);model.traverse(o=>{if(o.isSkinnedMesh){o.material=material;o.frustumCulled=false;}});
  const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(gltf.animations[0]);action.play();mixer.setTime(random()*gltf.animations[0].duration);
  const speed=.18+random()*.08,phase=random()*Math.PI*2;group.add(model);
  fish.push({model,mixer,x,y,z,radius,speed,phase});
 }
 scene.add(group);
 const update=(dt,time)=>{
  for(const f of fish){const a=f.phase+time*f.speed;
   f.model.position.set(f.x+Math.cos(a)*f.radius,f.y+Math.sin(time*.48+f.phase)*.12,f.z+Math.sin(a)*f.radius);
   // Source head points local -Z after glTF Y-up conversion.
   f.model.rotation.y=Math.atan2(Math.sin(a),-Math.cos(a));
   f.mixer.update(dt);
  }
 };
 // LOD-aware per-fish step called by the SimulationLOD singleton.
 function fishLodStep(f,dt,tier,aiCost,camera){
  const fct=[1,.35,.1,0][tier]||0;
  const d=f.model.position.distanceTo(camera);
  if(d>160){f.model.visible=false;return;}
  f.model.visible=true;
  const step=Math.min(dt,.1)*fct;
  f.phase+=step*f.speed;
  f._animTime=(f._animTime||0)+step*0.48;
  const a=f.phase;
  f.model.position.set(f.x+Math.cos(a)*f.radius,f.y+Math.sin(f._animTime+a)*.12,f.z+Math.sin(a)*f.radius);
  f.model.rotation.y=Math.atan2(Math.sin(a),-Math.cos(a));
  if(f.model.visible)f.mixer.update(step);
 }
 update(0,0);
 group.userData.fish=fish;
 return {group,fish,update,
  lodEntities:fish.map((f,i)=>({
   id:`barramundi-${i}`,
   getPosition:()=>f.model.position,
   getRadius:()=>8,
   update:(dt,tier,aiCost,cam)=>fishLodStep(f,dt,tier,aiCost,cam),
  }))};
}
