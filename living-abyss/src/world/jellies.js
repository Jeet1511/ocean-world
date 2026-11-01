// Small animated mid-water jellyfish population. This original procedural
// addition is deliberately non-solid and does not replace existing wildlife.
import * as THREE from '../../vendor/three.module.js';
import { GLSL_MEDIUM, withShared } from '../shaders/common.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';

function jellyGeometry() {
 const pos=[], uv=[], part=[], idx=[];
 const v=(x,y,z,u,w,p)=>{pos.push(x,y,z);uv.push(u,w);part.push(p);return pos.length/3-1;};
 const rings=16, sides=32;
 for(let i=0;i<=rings;i++){
  const t=i/rings, theta=t*Math.PI/2;
  for(let j=0;j<=sides;j++){
   const a=j/sides*Math.PI*2, r=1.1*Math.sin(theta)*(1+0.045*Math.cos(a*8)*Math.pow(t,4));
   v(Math.cos(a)*r,Math.cos(theta)*0.95,Math.sin(a)*r,j/sides,t,0);
  }
 }
 for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
  let a=i*(sides+1)+j,b=a+1,c=a+sides+1,d=c+1;idx.push(a,c,b,b,c,d);
 }
 // Trailing, tapered ribbons: 12 fine marginal tentacles and four frilled arms.
 for(let k=0;k<16;k++){
  const inner=k>=12,a=k*Math.PI*2/(inner?4:12), rad=inner?.34:.9;
  const len=inner?2.7:3.7+(k%4)*.35, width=inner?.14:.028;
  let base=pos.length/3;
  for(let j=0;j<=18;j++){
   const t=j/18,w=width*(1-t*.85)*(inner?1+.28*Math.sin(t*25+k):1);
   const x=Math.cos(a)*rad,z=Math.sin(a)*rad;
   v(x-Math.sin(a)*w,-t*len,z+Math.cos(a)*w,0,t,1);
   v(x+Math.sin(a)*w,-t*len,z-Math.cos(a)*w,1,t,1);
  }
  for(let j=0;j<18;j++){let a=base+j*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,b,c,d);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aPart',new THREE.Float32BufferAttribute(part,1));
 g.setIndex(idx);g.computeVertexNormals();return g;
}
const VS=`
uniform float uTime;
attribute float aPart; varying float vPart; varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main(){
 vec3 p=position; float phase=instanceMatrix[3].x*.037+instanceMatrix[3].z*.051;
 float pulse=sin(uTime*1.3+phase);
 if(aPart<.5){p.xz*=1.0+.12*pulse*uv.y;p.y*=1.0-.10*pulse;}
 else {float t=uv.y;p.x+=sin(uTime*.85+phase-t*4.0)*t*.24;p.z+=cos(uTime*.7+phase-t*3.0)*t*.18;}
 p.y+=sin(uTime*.42+phase)*.55;
 vec4 wp=modelMatrix*instanceMatrix*vec4(p,1.0);vWorld=wp.xyz;
 vN=normalize(mat3(modelMatrix*instanceMatrix)*normal);vPart=aPart;vUv=uv;
 gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const FS=GLSL_MEDIUM+`
varying float vPart; varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main(){
 vec3 N=normalize(vN);float edge=pow(1.0-abs(dot(N,normalize(uCamPos-vWorld))),2.0);
 float ribs=pow(abs(sin(vUv.x*50.265)),9.0)*smoothstep(.2,.95,vUv.y);
 vec3 base=mix(vec3(.30,.69,.76),vec3(.74,.55,.80),vUv.y*.5);
 base+=vec3(.18,.28,.30)*ribs+vec3(.18,.25,.28)*edge;
 float alpha=vPart<.5 ? .20+.28*edge+.12*ribs : .42*(1.0-vUv.y*.4);
 vec3 lit=base*(ambientLight(vWorld.y)*1.0+sunlightAt(vWorld.y)*.33)+base*.20;
 gl_FragColor=vec4(applyWater(lit,vWorld),alpha);
}`;
export function addJellies(scene,field,colliders=[]){
 const random=mulberry32(67677), placements=[];
 for(const id of ['roseglass','verdant']){
  const l=LOCATIONS.find(x=>x.id===id);let count=0;
  for(let tries=0;tries<400&&count<14;tries++){
   let a=random()*Math.PI*2,r=45+random()*100,x=l.x+Math.cos(a)*r,z=l.z+Math.sin(a)*r;
   let floor=field.surfaceHeightAt(x,z),y=Math.min(-6,floor+14+random()*9);
   if(y-floor<9 || y>-5 || y<-95)continue;
   // Keep the whole creature and its bobbing envelope out of rock bounds.
   // Bounds are deliberately conservative; no collision is added to wildlife.
   const blocked=colliders.some(c=>{const b=c.visualBounds;if(!b)return false;const margin=4;
     return x>b.min[0]-margin && x<b.max[0]+margin && y>b.min[1]-margin && y<b.max[1]+margin && z>b.min[2]-margin && z<b.max[2]+margin;});
   if(blocked)continue;
   placements.push({x,y,z,scale:.65+random()*.5,id});count++;
  }
 }
 const mat=new THREE.ShaderMaterial({uniforms:withShared({}),vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide,transparent:true,depthWrite:false});
 const mesh=new THREE.InstancedMesh(jellyGeometry(),mat,placements.length),dummy=new THREE.Object3D();
 placements.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=random()*Math.PI*2;dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});
 mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.name='procedural_jellyfish';mesh.userData.placements=placements;scene.add(mesh);return mesh;
}
