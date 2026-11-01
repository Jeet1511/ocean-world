// Real specimen-derived coral geometry, modified for a game reef. Source scans
// depict dry skeletons; runtime pigment is an artistic treatment, not measured
// living tissue. Habitat-limited, instanced, and non-solid like existing flora.
import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { planScanColonies } from './reef-scan-plan.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';
import { retryableAsset } from '../core/retryable-asset.js?rev=37';

const VS=`
attribute vec3 aPigment;
varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;varying vec3 vPigment;
void main(){
 vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=wp.xyz;vUv=uv;vPigment=aPigment;
 vNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);
 gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const FS=GLSL_MEDIUM+GLSL_LIGHT+`
uniform sampler2D uMap;uniform sampler2D uNormalMap;uniform sampler2D uAOMap;
varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;varying vec3 vPigment;
void main(){
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 // Cotangent frame from screen derivatives preserves the scan's normal detail
 // without adding a tangent buffer to every repeated coral instance.
 vec3 q1=dFdx(vWorld),q2=dFdy(vWorld);vec2 st1=dFdx(vUv),st2=dFdy(vUv);
 vec3 tangent=q1*st2.y-q2*st1.y,bitangent=-q1*st2.x+q2*st1.x;
 if(dot(tangent,tangent)>.000001&&dot(bitangent,bitangent)>.000001){
  tangent=normalize(tangent);bitangent=normalize(bitangent);
  vec3 mapN=texture2D(uNormalMap,vUv).xyz*2.0-1.0;
  vec3 detail=normalize(mat3(tangent,bitangent,n)*mapN);
  n=normalize(mix(n,detail,uQualityTier<.5?.18:.40));
 }
 vec3 scan=texture2D(uMap,vUv).rgb;
 // The museum specimens are dry skeletons. Retain their photographic value
 // variation, but use art-directed pigment rather than presenting bleached
 // skeletal surfaces as measured living tissue.
 float surfaceDetail=dot(scan,vec3(.24,.66,.10));
 vec3 albedo=mix(scan*.82,vPigment*(.42+surfaceDetail*.72),.46);
 // Fine corallite-scale breakup from the real scan maps; restrained so wet
 // skeleton detail remains visible instead of collapsing to flat pigment.
 albedo*=.88+.20*surfaceDetail;
 float ao=mix(.65,1.0,texture2D(uAOMap,vUv).r);
 vec3 col;
 if(uQualityTier<.5){
   vec3 sun=sunlightAt(vWorld.y);float ndl=max(dot(n,uSunDir),0.0);
   col=albedo*(sun*(.32+.68*ndl)+ambientLight(vWorld.y)*1.15+vec3(.10))*ao;
 }else col=litSurface(albedo,n,vWorld,.82,ao,.55)+albedo*.08;
 float shallow=1.0-smoothstep(24.0,90.0,-vWorld.y);
 col+=albedo*vec3(.17,.10,.07)*shallow;
 float deep=smoothstep(200.0,450.0,-uCamPos.y)*(1.0-smoothstep(12.0,80.0,length(vWorld-uCamPos)));
 col+=albedo*vec3(.28,.36,.42)*deep;
 gl_FragColor=vec4(applyWater(col,vWorld),1.0);
}`;

export async function addReefScans(scene,field,portals,colliders=[]){
 const plan=planScanColonies(field,portals,colliders),loader=new GLTFLoader();
 const kinds=['branching','boulder','foliose','staghorn','table','deep'],assets={},requests=new Map();
 const group=new THREE.Group();group.name='real_coral_scans';scene.add(group);
 const palettes=[
  [.66,.30,.25],[.72,.48,.27],[.43,.32,.50],[.28,.49,.43],[.72,.64,.48],
 ];
 const meshes=[],counts={},loaded=[],dummy=new THREE.Object3D();
 const plannedCounts={};for(const p of plan.placements)plannedCounts[p.habitat]=(plannedCounts[p.habitat]||0)+1;
 const locations=Object.fromEntries(LOCATIONS.map(l=>[l.id,l]));

 function addKindMeshes(kind,asset){
  for(const habitat of ['glasshorizon','roseglass','abyssalbowl']){
   const points=plan.placements.filter(p=>p.habitat===habitat&&p.kind===kind);
   if(!points.length)continue;
   const geometry=asset.geometry.clone(),colors=new Float32Array(points.length*3);
   const material=new THREE.ShaderMaterial({uniforms:withShared({uMap:{value:asset.color},uNormalMap:{value:asset.normal},uAOMap:{value:asset.ao}}),
    vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide});
   const mesh=new THREE.InstancedMesh(geometry,material,points.length);mesh.name=`coral_scan_${kind}_${habitat}`;
   points.forEach((p,i)=>{
    dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    colors.set(palettes[p.tint],i*3);
   });
   geometry.setAttribute('aPigment',new THREE.InstancedBufferAttribute(colors,3));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
   mesh.visible=false;group.add(mesh);meshes.push({mesh,habitat});counts[habitat]=(counts[habitat]||0)+points.length;
  }
 }
 function loadKind(kind,force=false){
  if(!requests.has(kind))requests.set(kind,retryableAsset(async()=>{
    const gltf=await loader.loadAsync(`./assets/models/coral_scans/${kind}.glb`);gltf.scene.updateMatrixWorld(true);
    let part;gltf.scene.traverse(o=>{if(!part&&o.isMesh&&o.material?.map)part=o;});
    if(!part||!part.material.normalMap||!part.material.aoMap)throw new Error('Expected colour, normal and occlusion maps');
    const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld);geometry.computeBoundingBox();
    const box=geometry.boundingBox,centre=box.getCenter(new THREE.Vector3());
    const width=Math.max(box.max.x-box.min.x,box.max.z-box.min.z);
    if(width<1e-7)throw new Error('Invalid scan bounds');
    geometry.translate(-centre.x,-box.min.y,-centre.z);geometry.scale(1/width,1/width,1/width);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();geometry.computeBoundingSphere();
    assets[kind]={geometry,color:part.material.map,normal:part.material.normalMap,ao:part.material.aoMap};
    addKindMeshes(kind,assets[kind]);loaded.splice(0,loaded.length,...kinds.filter(k=>assets[k]));return true;
  },{onError:error=>console.warn('Coral scan unavailable: '+kind,error)}));
  return requests.get(kind)(force);
 }
 // The first four also appear in the starting shallows. Table coral is only
 // used in Roseglass and deep coral only in the Bowl: keep their full models
 // unloaded until their habitat is approached or selected at a portal.
 await Promise.all(['branching','boulder','foliose','staghorn'].map(loadKind));
 const ensureHabitat=(id,force=false)=>id==='roseglass'?loadKind('table',force):id==='abyssalbowl'?loadKind('deep',force):Promise.resolve(true);
 return {group,counts,plannedCounts,loaded,sites:plan.sites,ensureHabitat,
  prepareGpu(renderer,scene,camera){
   // Invisible destination meshes are skipped by WebGLRenderer.compile(), so
   // their first visible frame formerly compiled shaders and uploaded scan
   // textures during portal arrival. Warm every material/texture under loader.
   const visibility=meshes.map(({mesh})=>mesh.visible);
   for(const {mesh} of meshes){
    mesh.visible=true;mesh.frustumCulled=false;
    for(const u of Object.values(mesh.material.uniforms||{}))if(u.value?.isTexture)renderer.initTexture(u.value);
   }
   renderer.compile(scene,camera);
   // Keep resident destination batches enabled permanently. Three.js frustum
   // culls their habitat bounds, avoiding first-frame visibility activation.
   meshes.forEach(({mesh})=>{mesh.visible=true;mesh.frustumCulled=true;});
  },
  update(camera,quality='high'){
   // Medium and High use the same complete scan library. Destination-only
   // models are warmed before gameplay, so visibility changes never trigger
   // parsing, texture decode, shader creation, or GPU upload during travel.
   // Batches remain enabled; renderer frustum culling handles submission. No
   // destination-entry visibility switch or first-visible GPU work occurs.
   for(const {mesh} of meshes)mesh.visible=true;
  }
 };
}
