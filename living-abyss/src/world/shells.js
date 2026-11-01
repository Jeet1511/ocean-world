// Photogrammetric shallow-water shell detail, CC0 Kuutti Siitonen / Poly Haven.
// Decorative and non-solid. Uses the world's water lighting rather than adding
// global Three.js lights or changing existing materials.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';

const VS = `
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main(){
 vec4 wp=modelMatrix * instanceMatrix * vec4(position,1.0);
 vWorld=wp.xyz; vNormal=normalize(mat3(modelMatrix * instanceMatrix)*normal); vUv=uv;
 gl_Position=projectionMatrix * viewMatrix * wp;
}`;
const FS = GLSL_MEDIUM + GLSL_LIGHT + `
uniform sampler2D uColorMap; uniform sampler2D uNormalMap; uniform sampler2D uArmMap;
varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv;
void main(){
 vec3 N=normalize(vNormal); if(!gl_FrontFacing) N=-N;
 vec3 dp1=dFdx(vWorld), dp2=dFdy(vWorld);
 vec2 duv1=dFdx(vUv),duv2=dFdy(vUv);
 vec3 T=normalize(dp1*duv2.y-dp2*duv1.y);
 vec3 B=normalize(-dp1*duv2.x+dp2*duv1.x);
 vec3 mapped=texture2D(uNormalMap,vUv).xyz*2.0-1.0;
 N=normalize(mix(N,normalize(mat3(T,B,N)*mapped),0.55));
 vec3 albedo=texture2D(uColorMap,vUv).rgb;
 float rough=texture2D(uArmMap,vUv).g;
 vec3 col=litSurface(albedo,N,vWorld,rough,0.9,0.6);
 gl_FragColor=vec4(applyWater(col,vWorld),1.0);
}`;
export async function addShallowShells(scene, field) {
 const gltf=await new GLTFLoader().loadAsync('./assets/models/lambis_shell/lambis_shell_1k.gltf');
 let source; gltf.scene.traverse(o=>{if(o.isMesh && !source)source=o;});
 if(!source || !source.material.map || !source.material.normalMap || !source.material.roughnessMap) throw new Error('Lambis shell model missing geometry or maps');
 const mat=new THREE.ShaderMaterial({uniforms:withShared({uColorMap:{value:source.material.map},uNormalMap:{value:source.material.normalMap},uArmMap:{value:source.material.roughnessMap}}),vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide});
 const rng=mulberry32(12271), placements=[];
 // Reef and sunlit-shelf substrate only; no deep-water shells or colliders.
 for(const id of ['glasshorizon','roseglass']){
  const l=LOCATIONS.find(l=>l.id===id);
  for(let tries=0;tries<500 && placements.filter(p=>p.id===id).length<45;tries++){
   const r=Math.sqrt(rng())*155, a=rng()*Math.PI*2, x=l.x+Math.cos(a)*r,z=l.z+Math.sin(a)*r;
   const y=field.surfaceHeightAt(x,z), n=field.normalAt(x,z);
   if(y>-2 || y<-32 || n.y<0.94)continue;
   placements.push({x,y,z,id,angle:rng()*Math.PI*2,scale:0.85+rng()*0.65,n});
  }
 }
 // Tile tiny shell props so a shell on the far side of the map is not
 // drawn at full photogrammetry detail. All placements remain intact.
 const tiles=new Map(), tileSize=80;
 for(const p of placements){const key=`${Math.floor(p.x/tileSize)}_${Math.floor(p.z/tileSize)}`;
  if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(p);}
 const group=new THREE.Group();group.name='shallow_photogrammetry_shells';
 const m=new THREE.Matrix4(),align=new THREE.Quaternion(),spin=new THREE.Quaternion(),scl=new THREE.Vector3();
 for(const [key,list] of tiles){
  const instances=new THREE.InstancedMesh(source.geometry,mat,list.length);
  list.forEach((p,i)=>{
   align.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(p.n.x,p.n.y,p.n.z).normalize());
   spin.setFromAxisAngle(new THREE.Vector3(0,1,0),p.angle);align.multiply(spin);scl.setScalar(p.scale);
   m.compose(new THREE.Vector3(p.x,p.y+0.005,p.z),align,scl);instances.setMatrixAt(i,m);
  });
  instances.name='shell_tile_'+key;instances.instanceMatrix.needsUpdate=true;
  instances.computeBoundingSphere();instances.frustumCulled=true;instances.userData.count=list.length;
  group.add(instances);
 }
 group.userData.placements=placements;
 group.userData.update=(camera,quality)=>{
  const range=quality==='medium'?110:140;
  for(const tile of group.children){const sphere=tile.boundingSphere,limit=range+sphere.radius;
   tile.visible=sphere.center.distanceToSquared(camera.position)<limit*limit;}
 };
 scene.add(group);return group;
}
