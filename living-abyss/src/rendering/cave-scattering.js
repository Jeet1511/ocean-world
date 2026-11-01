// Bounded, half-resolution single-scattering approximation for the real Nave
// skylight. It ray-marches along each view ray up to the opaque scene depth and
// tests whether sunlight reaches each sample through the opening. This is not a
// production shadow-map / multiple-scattering solution: the aperture casts a
// shadow, but smaller objects along the sun ray do not. Disabled on low quality.
import * as THREE from '../../vendor/three.module.js';
import { Pass, FullScreenQuad } from '../../vendor/jsm/postprocessing/Pass.js';
import { shared } from '../shaders/common.js?rev=37';

const VS=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const VOLUME_FS=`
uniform sampler2D tDepth;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec4 uOpening;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;
void main(){
 float depth=texture2D(tDepth,vUv).x;
 vec4 clip=vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
 vec4 view=uInvProjection*clip;view/=max(view.w,.00001);
 vec3 endpoint=(uCameraWorld*vec4(view.xyz,1.0)).xyz;
 vec3 delta=endpoint-uCameraPos;float rayLength=min(length(delta),155.0);
 vec3 dir=delta/max(length(delta),.00001);
 float jitter=fract(sin(dot(floor(vUv*uResolution),vec2(12.9898,78.233)))*43758.5453);
 float stepLength=rayLength/8.0,scatter=0.0;
 for(int i=0;i<8;i++){
  float t=(float(i)+.22+.56*jitter)*stepLength;
  vec3 p=uCameraPos+dir*t;
  if(p.y<uOpening.y && p.y>uOpening.y-100.0){
   float rise=(uOpening.y-p.y)/max(uSunDir.y,.01);
   vec2 hit=(p+uSunDir*rise).xz;
   float radius=length(hit-uOpening.xz);
   float inside=1.0-smoothstep(uOpening.w*.55,uOpening.w*.98,radius);
   // Quiet surface-wave breakup rather than opaque striped cones.
   float wave=.78+.22*sin(hit.x*.36+hit.y*.27+uTime*.58);
   scatter+=inside*wave*exp(-(uOpening.y-p.y)*.014);
  }
 }
 vec3 radiance=vec3(.30,.64,.70)*scatter*stepLength*.018;
 gl_FragColor=vec4(radiance,1.0);
}`;
const COMPOSE_FS=`
uniform sampler2D tDiffuse;uniform sampler2D tScatter;varying vec2 vUv;
void main(){vec4 c=texture2D(tDiffuse,vUv);c.rgb+=texture2D(tScatter,vUv).rgb;gl_FragColor=c;}`;

export class CaveScatteringPass extends Pass{
 constructor(camera){
  super();this.camera=camera;this.enabled=false;
  this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false,
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  this.volumeMaterial=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:VOLUME_FS,depthTest:false,depthWrite:false,
   uniforms:{tDepth:{value:null},uInvProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},
    uCameraPos:{value:new THREE.Vector3()},uSunDir:shared.uSunDir,uOpening:shared.uCaveOpening,
    uResolution:{value:new THREE.Vector2(1,1)},uTime:shared.uTime}});
  this.composeMaterial=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:COMPOSE_FS,depthTest:false,depthWrite:false,
   uniforms:{tDiffuse:{value:null},tScatter:{value:this.target.texture}}});
  this.quad=new FullScreenQuad(this.volumeMaterial);
 }
 setSize(width,height){
  const w=Math.max(1,Math.floor(width*.5)),h=Math.max(1,Math.floor(height*.5));
  this.target.setSize(w,h);this.volumeMaterial.uniforms.uResolution.value.set(w,h);
 }
 render(renderer,writeBuffer,readBuffer){
  const u=this.volumeMaterial.uniforms;u.tDepth.value=readBuffer.depthTexture;
  u.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
  u.uCameraWorld.value.copy(this.camera.matrixWorld);u.uCameraPos.value.setFromMatrixPosition(this.camera.matrixWorld);
  this.quad.material=this.volumeMaterial;renderer.setRenderTarget(this.target);renderer.clear();this.quad.render(renderer);
  this.composeMaterial.uniforms.tDiffuse.value=readBuffer.texture;this.quad.material=this.composeMaterial;
  renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
 }
 dispose(){this.target.dispose();this.volumeMaterial.dispose();this.composeMaterial.dispose();this.quad.dispose();}
}
