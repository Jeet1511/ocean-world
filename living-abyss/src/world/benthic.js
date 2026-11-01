// Shallow, persistent benthic habitats for the existing world. No collisions or
// proximity spawning are added. Animal densities are art direction, not field
// observations; a sea star's very slow turn is deliberately subtle.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';

function anemoneGeometry(){
 const pos=[],tip=[],idx=[];
 const vertex=(x,y,z,t)=>{pos.push(x,y,z);tip.push(t);return pos.length/3-1;};
 // A short fleshy column and twelve individually curved, tapered tentacles.
 const radial=10, rings=4;
 for(let i=0;i<=rings;i++)for(let j=0;j<=radial;j++){
  const h=i/rings, a=j/radial*Math.PI*2, r=.24+.10*h;
  vertex(Math.cos(a)*r,h*.35,Math.sin(a)*r,0);
 }
 for(let i=0;i<rings;i++)for(let j=0;j<radial;j++){
  const a=i*(radial+1)+j,b=a+1,c=a+radial+1,d=c+1;idx.push(a,c,b,b,c,d);
 }
 for(let k=0;k<12;k++){
  const a=k/12*Math.PI*2, inner=k%3===0, spread=inner?.10:.25, height=inner?.85:.65+(k%4)*.08;
  const base=pos.length/3, sides=6, segments=6;
  for(let i=0;i<=segments;i++)for(let j=0;j<=sides;j++){
   const t=i/segments,b=j/sides*Math.PI*2, r=.045*(1-.76*t);
   const out=spread+.22*t*t, x=Math.cos(a)*out,z=Math.sin(a)*out;
   vertex(x+Math.cos(b)*r,.30+height*t,z+Math.sin(b)*r,t);
  }
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
   const a=base+i*(sides+1)+j,b=a+1,c=a+sides+1,d=c+1;idx.push(a,c,b,b,c,d);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('aTip',new THREE.Float32BufferAttribute(tip,1));g.setIndex(idx);g.computeVertexNormals();return g;
}
const ANEMONE_VS=`
uniform float uTime;
attribute float aTip; attribute vec3 aTint; attribute float aPhase;
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vTint; varying float vTip;
void main(){
 vec3 p=position;float t=aTip*aTip;
 p.x+=sin(uTime*.9+aPhase+position.y*3.2)*.14*t;
 p.z+=cos(uTime*.72+aPhase+position.y*2.4)*.10*t;
 vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.0);
 vWorld=wp.xyz;vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);vTint=aTint;vTip=aTip;
 gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const ANEMONE_FS=GLSL_MEDIUM+GLSL_LIGHT+`
varying vec3 vWorld; varying vec3 vNormal; varying vec3 vTint; varying float vTip;
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 albedo=mix(vTint*.68,vTint*vec3(1.22,1.17,1.05),smoothstep(.2,1.,vTip));
 vec3 col;
 if(uQualityTier<.5){col=albedo*(ambientLight(vWorld.y)*1.2+sunlightAt(vWorld.y)*(.36+.52*max(dot(n,uSunDir),0.0)))+albedo*.10;}
 else col=litSurface(albedo,n,vWorld,.68,.95,.55)+albedo*.08;
 gl_FragColor=vec4(applyWater(col,vWorld),1.0);
}`;
const STAR_VS=`
varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;
void main(){
 vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=wp.xyz;vUv=uv;
 vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);
 gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const STAR_FS=GLSL_MEDIUM+GLSL_LIGHT+`
uniform sampler2D uMap;varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 vec3 albedo=texture2D(uMap,vUv).rgb;
 vec3 c;
 if(uQualityTier<.5)c=albedo*(ambientLight(vWorld.y)*1.2+sunlightAt(vWorld.y)*(.32+.62*max(dot(n,uSunDir),0.0)))+albedo*.1;
 else c=litSurface(albedo,n,vWorld,.76,.95,.35)+albedo*.08;
 gl_FragColor=vec4(applyWater(c,vWorld),1.0);
}`;

export async function addBenthic(scene,field,colliders=[],plans=[]){
 const random=mulberry32(516724), floor=(x,z)=>field.surfaceHeightAt?.(x,z) ?? field.heightAt(x,z);
 const clear=(x,z,y,margin=.55)=>{
  const p=new THREE.Vector3(x,y,z);
  return !colliders.some(c=>{
   const b=c.visualBounds;
   if(b && (x<b.min[0]-margin||x>b.max[0]+margin||y<b.min[1]-margin||y>b.max[1]+margin||z<b.min[2]-margin||z>b.max[2]+margin))return false;
   return c.signedDistance ? c.signedDistance(p)<margin : false;
  });
 };
 const anemones=[];
 // Clownfish residents share a few local anemone clusters. Their school
 // simulation remains independent; neither animal is parented to the player.
 for(const p of plans.filter(p=>p.species==='clownfish')){
  for(let k=0;k<3;k++){
   const a=k*Math.PI*2/3, r=k?1.25:0,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r,y=floor(x,z);
   if(y<-5&&y>-65&&clear(x,z,y+.65))anemones.push({x,y,z,scale:.75+random()*.5,phase:random()*6.28});
  }
 }
 const reef=LOCATIONS.find(l=>l.id==='roseglass');
 for(let tries=0;tries<500&&anemones.length<22;tries++){
  const a=random()*Math.PI*2,r=25+random()*110,x=reef.x+Math.cos(a)*r,z=reef.z+Math.sin(a)*r,y=floor(x,z);
  if(y>-6||y<-60||Math.abs(floor(x+1,z)-y)>.8||!clear(x,z,y+.65))continue;
  anemones.push({x,y,z,scale:.65+random()*.55,phase:random()*6.28});
 }
 const group=new THREE.Group();group.name='benthic_habitats';scene.add(group);
 const g=anemoneGeometry(),tints=new Float32Array(anemones.length*3),phases=new Float32Array(anemones.length);
 const colors=[new THREE.Color(.65,.29,.35),new THREE.Color(.76,.48,.34),new THREE.Color(.55,.43,.56),new THREE.Color(.63,.58,.38)];
 const mat=new THREE.ShaderMaterial({uniforms:withShared({}),vertexShader:ANEMONE_VS,fragmentShader:ANEMONE_FS,side:THREE.DoubleSide});
 const mesh=new THREE.InstancedMesh(g,mat,anemones.length),dummy=new THREE.Object3D();
 anemones.forEach((p,i)=>{
  dummy.position.set(p.x,p.y+.02,p.z);dummy.rotation.y=random()*6.28;dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  const c=colors[i%colors.length];tints.set([c.r,c.g,c.b],i*3);phases[i]=p.phase;
 });
 g.setAttribute('aTint',new THREE.InstancedBufferAttribute(tints,3));g.setAttribute('aPhase',new THREE.InstancedBufferAttribute(phases,1));
 mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.name='swaying_reef_anemones';group.add(mesh);

 const starGroups=[],starPlacements={};
 try{
  const asset=await new GLTFLoader().loadAsync('./assets/models/ecosystem/sea-star.glb');
  asset.scene.updateMatrixWorld(true);let part;
  asset.scene.traverse(o=>{if(!part&&o.isMesh&&o.material?.map)part=o;});
  if(!part)throw new Error('Expected a textured sea-star mesh');
  // Its scan has an arbitrary root rotation and origin. Apply that transform,
  // turn its thin X axis upright, normalize its width and put its base at y=0.
  const starGeo=part.geometry.clone().applyMatrix4(part.matrixWorld);starGeo.rotateZ(Math.PI/2);starGeo.center();
  starGeo.computeBoundingBox();let bb=starGeo.boundingBox;
  const width=Math.max(bb.max.x-bb.min.x,bb.max.z-bb.min.z);
  starGeo.scale(1/width,1/width,1/width);starGeo.computeBoundingBox();starGeo.translate(0,-starGeo.boundingBox.min.y,0);
  starGeo.computeVertexNormals();starGeo.computeBoundingSphere();
  const starMat=new THREE.ShaderMaterial({uniforms:withShared({uMap:{value:part.material.map}}),vertexShader:STAR_VS,fragmentShader:STAR_FS,side:THREE.DoubleSide});
  for(const id of ['glasshorizon','roseglass','verdant']){
   const loc=LOCATIONS.find(l=>l.id===id),points=[];
   for(let tries=0;tries<800&&points.length<18;tries++){
    const a=random()*6.28,r=18+random()*115,x=loc.x+Math.cos(a)*r,z=loc.z+Math.sin(a)*r,y=floor(x,z);
    if(y>-6||y<-65||Math.abs(floor(x+.4,z)-y)>.32||Math.abs(floor(x,z+.4)-y)>.32||!clear(x,z,y+.25,.3))continue;
    points.push({x,y,z,scale:.25+random()*.19,angle:random()*6.28,phase:random()*6.28});
   }
   const stars=new THREE.InstancedMesh(starGeo,starMat,points.length);stars.name='sea_stars_'+id;
   points.forEach((p,i)=>{dummy.position.set(p.x,p.y+.015,p.z);dummy.rotation.y=p.angle;dummy.scale.setScalar(p.scale);dummy.updateMatrix();stars.setMatrixAt(i,dummy.matrix);});
   stars.instanceMatrix.needsUpdate=true;stars.computeBoundingSphere();group.add(stars);
   starGroups.push({mesh:stars,points,loc});starPlacements[id]=points.length;
  }
 }catch(error){console.warn('Sea-star asset unavailable; anemone habitats remain active.',error);}
 let elapsed=0,lastStarUpdate=0;
 return {group,counts:{anemones:anemones.length,seaStars:starPlacements},
  reefLocs:starGroups.map(g=>g.loc).concat(reef?[{x:reef.x,y:reef.y,z:reef.z}]:[]),
  update(dt,camera){
   elapsed+=Math.min(dt,.1);mesh.visible=Math.hypot(camera.x-reef.x,camera.z-reef.z)<245;
   for(const g of starGroups)g.mesh.visible=Math.hypot(camera.x-g.loc.x,camera.z-g.loc.z)<220;
   // Actual sea stars move very slowly. This tiny, periodic turn suggests life
   // without making them slide rapidly across the substrate.
   if(elapsed-lastStarUpdate<3)return;lastStarUpdate=elapsed;
   for(const g of starGroups){if(!g.mesh.visible)continue;
    g.points.forEach((p,i)=>{dummy.position.set(p.x,p.y+.015,p.z);dummy.rotation.y=p.angle+Math.sin(elapsed*.02+p.phase)*.025;dummy.scale.setScalar(p.scale);dummy.updateMatrix();g.mesh.setMatrixAt(i,dummy.matrix);});
    g.mesh.instanceMatrix.needsUpdate=true;
   }
  }
 };
}
