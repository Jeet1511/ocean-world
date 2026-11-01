// -----------------------------------------------------------------------------
// THE LIVING ABYSS — atmosphere & marine life
// Suspended particles, volumetric sun shafts in the photic zone and through
// cavern gates, and small schools of fish that orbit their home ground.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { GLSL_NOISE, GLSL_MEDIUM, GLSL_LIGHT, withShared, shared } from '../shaders/common.js?rev=37';
import { mulberry32, fbm2, clamp } from '../core/noise.js?rev=37';
import { WORLD, CHAMBERS, LOCATIONS } from './geography.js?rev=37';
import { SchoolSimulation } from './school-simulation.js?rev=37';
import { HABITATS } from './habitat-profiles.js?rev=37';
import { planSpeciesSchools } from './species-school-plan.js?rev=37';
import { planEcosystem } from './ecosystem-plan.js?rev=37';

// ---------------------------------------------------------------------------
// Marine snow / suspended sediment
// ---------------------------------------------------------------------------
const SNOW_VS = /* glsl */`
uniform float uTime;
uniform vec3 uCamPos;
uniform float uBox;
uniform float uPixelScale;
attribute float aSize;
attribute float aPhase;
varying float vFade;
varying float vDepth;
varying vec3 vWorld;

void main(){
  vec3 p = position;
  // drift + slow settle, wrapped in a box that follows the camera
  p.x += sin(uTime * 0.21 + aPhase) * 2.4;
  p.y += sin(uTime * 0.14 + aPhase * 1.7) * 1.6 - mod(uTime * 0.22 + aPhase * 3.0, uBox);
  p.z += cos(uTime * 0.19 + aPhase * 1.3) * 2.4;

  vec3 rel = p - uCamPos;
  rel.x = mod(rel.x + uBox * 0.5, uBox) - uBox * 0.5;
  rel.y = mod(rel.y + uBox * 0.5, uBox) - uBox * 0.5;
  rel.z = mod(rel.z + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = uCamPos + rel;
  vWorld = wp;
  vDepth = -wp.y;

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float dist = length(mv.xyz);
  vFade = smoothstep(uBox * 0.5, uBox * 0.12, dist);
  gl_Position = projectionMatrix * mv;
  // aSize is a real diameter in metres
  gl_PointSize = clamp(aSize * uPixelScale / max(dist, 1.0), 0.8, 9.0);
}
`;

const SNOW_FS = /* glsl */`
uniform float uTime;
uniform vec3 uCamPos;
varying float vFade;
varying float vDepth;
varying vec3 vWorld;

void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = (1.0 - smoothstep(0.05, 0.5, d));

  // particles catch the little light there is; they thin out with depth
  float dens = mix(0.55, 0.16, smoothstep(0.0, 900.0, vDepth));
  vec3 tint = mix(vec3(0.75, 0.95, 1.0), vec3(0.55, 0.75, 1.0), smoothstep(0.0, 600.0, vDepth));
  float lum = (0.25 + 0.75 * (1.0 - smoothstep(0.0, 700.0, vDepth)));
  vec3 col = tint * lum;
  float a = soft * vFade * dens;
  gl_FragColor = vec4(col, a);
}
`;

// One batched environmental bioluminescence layer for the Nave and Abyss.
// Color and pulse vary per point; distance fade prevents neon-looking fog.
const BIO_VS=/* glsl */`
uniform float uTime;uniform float uPixelScale;
attribute float aSize;attribute float aPhase;attribute vec3 aColor;
varying vec3 vColor;varying float vAlpha;
void main(){
 vec3 p=position;p.y+=sin(uTime*.22+aPhase)*.18;
 vec4 mv=modelViewMatrix*vec4(p,1.0);float d=length(mv.xyz);
 float pulse=.62+.38*sin(uTime*(.45+fract(aPhase)*.35)+aPhase);
 vColor=aColor*pulse;vAlpha=(1.0-smoothstep(35.0,210.0,d))*pulse;
 gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixelScale/max(d,1.0),1.0,7.0);
}`;
const BIO_FS=/* glsl */`
varying vec3 vColor;varying float vAlpha;
void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;
 float core=1.0-smoothstep(.05,.5,r);gl_FragColor=vec4(vColor,core*vAlpha*.72);}`;

// ---------------------------------------------------------------------------
// Volumetric sun shafts
// ---------------------------------------------------------------------------
const SHAFT_VS = /* glsl */`
varying vec3 vWorld;
varying vec3 vLocal;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHAFT_FS = GLSL_NOISE + /* glsl */`
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uIntensity;
varying vec3 vWorld;
varying vec3 vLocal;

void main(){
  // CylinderGeometry spans -0.5..+0.5 in local Y. The earlier shader
  // treated its radius in metres as a 0..1 coordinate, making radial fade
  // identically zero over nearly the whole mesh. Use the actual angle and
  // height to form a few soft, time-varying curtains of scattered light.
  float h = clamp(0.5 - vLocal.y, 0.0, 1.0);
  float angle = atan(vLocal.z, vLocal.x);
  float stripes = pow(0.5 + 0.5 * sin(angle * 5.0 + h * 3.0 + uTime * .11), 3.2);
  float drift = fbm2(vec2(angle * 2.3 + uTime * .035, h * 3.4 - uTime * .08), 3);
  float fade = pow(1.0 - h, 1.35) * smoothstep(0.01, 0.12, h);
  fade *= (0.16 + 0.84 * stripes) * (0.45 + 0.55 * drift);
  float dist = length(vWorld - uCamPos);
  fade *= smoothstep(5.0, 24.0, dist);
  // A modest additive contribution, not an opaque cone or a white screen.
  vec3 col = vec3(0.36, 0.70, 0.76) * fade * uIntensity * 0.36;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------
const FISH_VS = /* glsl */`
uniform float uTime;
uniform float uSwimTime;
uniform vec3 uCenter;
attribute vec3 aOffset;
attribute vec3 aPrevious;
attribute vec3 aVelocity;
attribute vec3 aPreviousVelocity;
uniform float uSchoolBlend;
uniform float uSwimStyle;
attribute float aPhase;
attribute float aRadius;
attribute float aSpeed;
attribute float aScale;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vFade;
varying vec2 vFishUv;
varying float vFishPhase;

void main(){
  vFishUv = uv;
  vFishPhase = aPhase;
  // Positions and velocities are computed by the bounded school simulation;
  // interpolate consecutive fixed steps to keep motion smooth at display rate.
  vec3 p = uCenter + mix(aPrevious, aOffset, uSchoolBlend);
  // Render heading from a short velocity average. Position remains current,
  // while orientation cannot snap to every tiny steering correction.
  vec3 velocity = mix(aPreviousVelocity, aVelocity, 0.28);
  // Align the model to its real 3D travel direction, including a restrained
  // climb/dive pitch. Robust fallbacks prevent a zero cross product.
  float speed3 = length(velocity);
  vec3 fwd = speed3 > 0.001 ? normalize(velocity) : vec3(1.0, 0.0, 0.0);
  // Fish should not point almost vertically even during avoidance manoeuvres.
  fwd.y = clamp(fwd.y, -0.32, 0.32);
  fwd = normalize(fwd);
  vec3 rightRaw = cross(vec3(0.0, 1.0, 0.0), fwd);
  vec3 right = length(rightRaw) > 0.001 ? normalize(rightRaw) : vec3(0.0, 0.0, -1.0);
  vec3 up = normalize(cross(fwd, right));
  mat3 basis = mat3(fwd, up, right);

  vec3 lp = position * aScale;
  // Fish swim styles are intentionally distinct. Normal fish use a traveling
  // body/tail wave; upright seahorses flutter subtly; sunfish move their tall
  // dorsal/anal fins; flatfish ripple their edges. These are shader-based
  // approximations, not substitutes for individually authored skeletal rigs.
  // Carangiform envelope: the head/anterior trunk stay stable and lateral
  // amplitude rises nonlinearly through the posterior third toward the tail.
  float posterior = clamp((0.24 - position.x) / 1.24, 0.0, 1.0);
  float tailAmp = 0.15 * posterior * posterior * aScale;
  if (uSwimStyle > 3.5) {
    // seahorse-style: small upright flutter
    lp.y += sin(uSwimTime * 4.0 + aPhase - position.x * 3.2) * abs(position.z) * 0.18 * aScale;
  } else if (uSwimStyle > 2.5) {
    // sunfish-style: tall fin undulation
    lp.z += sin(uSwimTime * 2.6 + aPhase - position.y * 1.4) * pow(abs(position.y), 1.5) * 0.30 * aScale;
  } else if (uSwimStyle > 1.5) {
    // ray-style: side-to-side ripple
    lp.z += sin(uSwimTime * 5.5 + aPhase + position.y * 4.0) * 0.035 * aScale;
  } else {
    // Beat frequency follows actual travel speed: cruising fish sweep slowly,
    // while accelerating/escaping fish beat faster. Only the caudal region bends.
    float beatRate = mix(4.2, 8.0, clamp(speed3 / 2.6, 0.0, 1.0));
    lp.z += sin(uSwimTime * beatRate + aPhase - position.x * 2.4) * tailAmp;
  }

  vec3 wp = p + basis * lp;
  vWorld = wp;
  vNrm = normalize(basis * normal);
  float dist = length(wp - cameraPosition);
  vFade = (1.0 - smoothstep(135.0, 205.0, dist));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FISH_FS = GLSL_MEDIUM + /* glsl */`
uniform vec3 uBodyCol;
uniform vec3 uBellyCol;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vFade;
varying vec2 vFishUv;
varying float vFishPhase;

void main(){
  // Ordered screen-door fade keeps fish depth-writing and avoids the abrupt
  // school pop that previously occurred at the distance-culling boundary.
  float dither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
  if (vFade < dither) discard;
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;
  float belly = (1.0 - smoothstep(-0.7, 0.1, N.y));
  vec3 albedo = mix(uBodyCol, uBellyCol, belly);
  // Faint flank pattern and a small eye on either side of the generic fish.
  float pattern = .5 + .5*sin(vFishUv.x*64.0 + sin(vFishUv.y*22.0)*.8 + vFishPhase);
  albedo *= .92 + pattern*.10;
  float eyeL=length((vFishUv-vec2(.84,.25))*vec2(2.0,1.0));
  float eyeR=length((vFishUv-vec2(.84,.75))*vec2(2.0,1.0));
  float eye=min(eyeL,eyeR);
  albedo=mix(albedo,vec3(.012,.019,.022),1.0-smoothstep(.014,.027,eye));
  float fres = pow(1.0 - abs(dot(N, normalize(uCamPos - vWorld))), 2.5);
  vec3 sun = sunlightAt(vWorld.y);
  vec3 col = albedo * (sun * (clamp(dot(N, uSunDir), 0.0, 1.0) * 0.9 + 0.15)
                     + ambientLight(vWorld.y) * 0.8);
  col += vec3(0.55, 0.75, 0.85) * fres * 0.35;
  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Textured fish LOD from the CC0 Microsoft/Khronos barramundi asset.
// The base-color texture is from the original asset; the existing water model supplies lighting and haze.
const TEXTURED_FISH_FS = GLSL_MEDIUM + `
uniform sampler2D uFishTexture;
varying vec3 vWorld; varying vec3 vNrm; varying vec2 vFishUv; varying float vFade;
void main(){
 float dither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
 if(vFade<dither)discard;
 vec3 N=normalize(vNrm); if(!gl_FrontFacing)N=-N;
 vec3 albedo=texture2D(uFishTexture,vFishUv).rgb;
 vec3 sun=sunlightAt(vWorld.y);
 float diffuse=clamp(dot(N,uSunDir)*.5+.5,0.0,1.0);
 vec3 col=albedo*(sun*(.30+.72*diffuse)+ambientLight(vWorld.y)*1.2+vec3(.20));
 float edge=pow(1.0-abs(dot(N,normalize(uCamPos-vWorld))),3.0);
 col+=vec3(.22,.30,.32)*edge*.15;
 gl_FragColor=vec4(applyWater(col,vWorld),1.0);
}`;

function makeFishGeo() {
  // streamlined body: lathe of a few rings + caudal fin
  const pos = [], idx = [], nrm = [], uvs = [];
  const rings = 11, radial = 12;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const x = (t - 0.5) * 2.0;                       // -1 tail .. 1 snout
    const r = Math.sin(Math.pow(1 - t, 0.75) * Math.PI) * 0.34 + 0.02;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r * 1.25);
      nrm.push(0, Math.cos(a), Math.sin(a));
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // caudal fin
  const base = pos.length / 3;
  const tailX = -1.0;
  pos.push(tailX, 0, 0, tailX - 0.34, 0.30, 0, tailX - 0.26, 0, 0,
           tailX - 0.34, -0.30, 0);
  for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); uvs.push(0.02, k / 4); }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  // dorsal fin
  const b2 = pos.length / 3;
  pos.push(0.1, 0.20, 0, -0.3, 0.34, 0, -0.35, 0.12, 0);
  for (let k = 0; k < 3; k++) { nrm.push(0, 1, 0); uvs.push(.42 + k*.04, 0.0); }
  idx.push(b2, b2 + 1, b2 + 2);
  // Paired pectoral fins and a small ventral fin give the original generic
  // schools a readable silhouette rather than a simple featureless spindle.
  for (const side of [-1,1]) {
    const b=pos.length/3;
    pos.push(.35,-.05,side*.21, .06,-.20,side*.53, -.08,-.09,side*.18);
    for(let k=0;k<3;k++){nrm.push(0,1,0);uvs.push(.58+k*.03,side>0?.25:.75);}
    idx.push(b,b+1,b+2);
  }
  const b3=pos.length/3;
  pos.push(.04,-.18,0,-.33,-.34,0,-.46,-.10,0);
  for(let k=0;k<3;k++){nrm.push(0,1,0);uvs.push(.35+k*.03,.5);}
  idx.push(b3,b3+1,b3+2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// The fish shader places instances in world space rather than applying their
// instance matrices, so Three.js cannot infer school bounds automatically.
// Enclose both fixed-step endpoints plus the largest complete fish and its
// procedural tail/fin deformation; interpolation remains inside this sphere.
export function updateSchoolBounds(mesh){
  const sim=mesh.userData.simulation,positions=sim.positions,previous=sim.previous;
  let farthest=0;
  for(let i=0;i<positions.length;i+=3){
    const a=positions[i]*positions[i]+positions[i+1]*positions[i+1]+positions[i+2]*positions[i+2];
    const b=previous[i]*previous[i]+previous[i+1]*previous[i+1]+previous[i+2]*previous[i+2];
    farthest=Math.max(farthest,a,b);
  }
  mesh.boundingSphere.center.copy(sim.center);
  mesh.boundingSphere.radius=Math.sqrt(farthest)+mesh.userData.fishShapeBound;
  // GPU attributes share the same Float32Array as the sim's arrays (built
  // from `off` at construction). sim.step() modifies positions in place, so
  // the GPU buffer already has fresh data — just flag it for upload.
  const aOffset=mesh.geometry.getAttribute('aOffset');
  const aPrevious=mesh.geometry.getAttribute('aPrevious');
  const aVelocity=mesh.geometry.getAttribute('aVelocity');
  const aPrevVel=mesh.geometry.getAttribute('aPreviousVelocity');
  if(aOffset)aOffset.needsUpdate=true;
  if(aPrevious)aPrevious.needsUpdate=true;
  if(aVelocity)aVelocity.needsUpdate=true;
  if(aPrevVel)aPrevVel.needsUpdate=true;
}
function fishShapeBound(geo,scales){
  if(!geo.boundingSphere)geo.computeBoundingSphere();if(!geo.boundingBox)geo.computeBoundingBox();
  const box=geo.boundingBox,maxY=Math.max(Math.abs(box.min.y),Math.abs(box.max.y)),
    maxZ=Math.max(Math.abs(box.min.z),Math.abs(box.max.z));
  const wave=Math.max(.145,.018,.20*Math.pow(maxY,1.5),.12*maxZ);
  let scale=0;for(const s of scales)scale=Math.max(scale,s);
  return (geo.boundingSphere.center.length()+geo.boundingSphere.radius+wave)*scale+.1;
}

// ---------------------------------------------------------------------------
export function buildAtmosphere(field, state, colliders = [], schoolAsset = null, portals = [], speciesAssets = {}) {
  // On software-rendered (no-GPU) devices, drastically cut creature counts so
  // each frame is cheap to rasterize. CPU rendering cannot handle the same
  // density as a GPU.
  const countMult = state.quality === 'medium' ? 0.90 : 1.0;
  const mc = (n) => Math.max(1, Math.floor(n * countMult));
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const rng = mulberry32(4242);

  // ---------------- suspended particles ----------------
  const COUNT = 9000;
  const BOX = 150;
  const pos = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (rng() - 0.5) * BOX;
    pos[i * 3 + 1] = (rng() - 0.5) * BOX;
    pos[i * 3 + 2] = (rng() - 0.5) * BOX;
    size[i] = 0.012 + Math.pow(rng(), 2.0) * 0.075;
    phase[i] = rng() * 100;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  snowGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  snowGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const snowMat = new THREE.ShaderMaterial({
    uniforms: withShared({ uBox: { value: BOX }, uPixelScale: { value: 520 } }),
    vertexShader: SNOW_VS,
    fragmentShader: SNOW_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.name = 'marine_snow';
  group.add(snow);

  // ---------------- batched living lights ----------------
  const bioPos=[],bioSize=[],bioPhase=[],bioColor=[];
  const addBioField=(locId,count,radius,colors,minLift,maxLift)=>{
    const l=LOCATIONS.find(q=>q.id===locId);if(!l)return;
    for(let i=0;i<count;i++){
      const a=rng()*Math.PI*2,r=Math.sqrt(rng())*radius;
      const x=l.x+Math.cos(a)*r,z=l.z+Math.sin(a)*r,floor=field.surfaceHeightAt(x,z);
      if(!Number.isFinite(floor))continue;
      const lift=minLift+rng()*(maxLift-minLift),y=Math.min(-3,floor+lift);
      bioPos.push(x,y,z);bioSize.push(.10+rng()*.34);bioPhase.push(rng()*50);
      const c=colors[Math.floor(rng()*colors.length)];bioColor.push(c[0],c[1],c[2]);
    }
  };
  addBioField('floodednave',520,125,[[.18,.95,.78],[.25,.62,1.0],[.65,1.0,.76]],1.2,18);
  addBioField('abyssalbowl',680,235,[[.12,.50,1.0],[.42,.20,1.0],[.10,1.0,.72]],1.0,28);
  const bioGeo=new THREE.BufferGeometry();
  bioGeo.setAttribute('position',new THREE.Float32BufferAttribute(bioPos,3));
  bioGeo.setAttribute('aSize',new THREE.Float32BufferAttribute(bioSize,1));
  bioGeo.setAttribute('aPhase',new THREE.Float32BufferAttribute(bioPhase,1));
  bioGeo.setAttribute('aColor',new THREE.Float32BufferAttribute(bioColor,3));
  const bioMat=new THREE.ShaderMaterial({uniforms:withShared({uPixelScale:{value:520}}),vertexShader:BIO_VS,
    fragmentShader:BIO_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const livingLights=new THREE.Points(bioGeo,bioMat);livingLights.name='living_bioluminescence';
  livingLights.frustumCulled=true;group.add(livingLights);

  // ---------------- sun shafts ----------------
  const shaftGeo = new THREE.CylinderGeometry(0.55, 1.0, 1, 14, 1, true);

  const shafts = new THREE.Group();
  shafts.name = 'light_shafts';
  const SUN_TILT = shared.uSunDir.value.clone().negate();
  const addShaft = (x, y, z, len, rad, intensity, kind = 'ordinary') => {
    const mat = new THREE.ShaderMaterial({
      uniforms: withShared({ uIntensity: { value: intensity } }),
      vertexShader: SHAFT_VS,
      fragmentShader: SHAFT_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(shaftGeo, mat);
    // The top is the chosen surface source; center follows the light's tilt.
    m.position.set(x + SUN_TILT.x * len * .5, y + SUN_TILT.y * len * .5, z + SUN_TILT.z * len * .5);
    m.scale.set(rad, len, rad);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), SUN_TILT);
    m.frustumCulled = true;
    m.userData.baseIntensity = intensity;
    m.userData.kind = kind;
    shafts.add(m);
    return m;
  };

  // Shafts exist only where light can reach: the three photic arenas plus the
  // shallow lips of the archways. Coordinates come from the seven places, never
  // from hard-coded world positions.
  const SHAFT_SITES = [];
  const SHAFT_ARENAS = ['glasshorizon', 'roseglass', 'verdant', 'azurespan'];
  for (const id of SHAFT_ARENAS) {
    const l = LOCATIONS.find((q) => q.id === id);
    if (!l) continue;
    const n = id === 'glasshorizon' ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 200;
      const x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r;
      const y = field.heightAt(x, z);
      if (-y > 90) continue;
      const originalLen = 60 + rng() * 120, radius = 12 + rng() * 26, intensity = 0.30 + rng() * 0.45;
      SHAFT_SITES.push([x, -0.6, z, Math.min(originalLen, Math.max(18,(-y+15)*1.4)), radius, intensity]);
    }
  }
  for (const ch of CHAMBERS) {
    // light bleeding in through each cavern gate
    const gx = ch.x + Math.cos(ch.gateAngle) * ch.r * 1.6;
    const gz = ch.z + Math.sin(ch.gateAngle) * ch.r * 1.6;
    const gy = field.heightAt(gx, gz);
    // Shallow entrances can receive surface light; deep halls do not get
    // a fictitious overhead sunbeam shining through their ceiling.
    if (gy > -90) SHAFT_SITES.push([gx, -0.6, gz, Math.min(110,(-gy+10)*1.4), 26, 0.35]);
  }
  // A cheap fallback beam follows the true opening's sunlight direction. On
  // medium/high a depth-clipped scattering pass supplies the richer volume.
  const open=shared.uCaveOpening.value, sun=shared.uSunDir.value;
  const rise=(Math.abs(open.y)-.6)/sun.y;
  SHAFT_SITES.push([open.x+sun.x*rise,-.6,open.z+sun.z*rise,125,18,.64,'cave']);
  // A few intentionally composed shafts accompany the shallow approach
  // gardens. They start at the real surface and fade in deeper water.
  for(const portal of portals){
    if(!['glasshorizon','roseglass','verdant'].includes(portal.id))continue;
    const dx=portal.loc.x-portal.x,dz=portal.loc.z-portal.z,d=Math.hypot(dx,dz)||1;
    for(const [forward,side] of [[45,-22],[75,22]]){
      const x=portal.x+dx/d*forward-dz/d*side,z=portal.z+dz/d*forward+dx/d*side;
      const bottom=field.surfaceHeightAt(x,z);
      if(bottom < -65 || bottom > -4)continue;
      SHAFT_SITES.push([x,-.6,z,Math.min(90,(-bottom+12)*1.4),20,.62]);
    }
  }
  for (const s of SHAFT_SITES) addShaft(...s);
  group.add(shafts);

  // ---------------- fish schools ----------------
  const fishGeo = makeFishGeo();
  const schools = [];
  // Every place gets its own schools, sized to the arena.
  const SCHOOL_SITES = [];
  const SCHOOL_PLAN = {
    glasshorizon: [3, 90, 16], roseglass: [3, 110, 20], verdant: [3, 100, 24],
    aurel: [2, 80, -30], azurespan: [2, 70, -40], floodednave: [2, 60, -20],
    abyssalbowl: [2, 50, -60],
  };
  for (const l of LOCATIONS) {
    const [n, count, lift] = SCHOOL_PLAN[l.id] || [1, 60, 0];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.7;
      const r = 60 + rng() * 120;
      let x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r;
      // One existing school per place is composed along the entrance-to-
      // landmark sightline, instead of all life being arbitrarily far away.
      // Its height and obstacle-safe spawn still use the real local field.
      const gate = portals.find(p => p.id === l.id);
      if (k === 0 && gate) { x = gate.x * .55 + l.x * .45; z = gate.z * .55 + l.z * .45; }
      SCHOOL_SITES.push([x, z, lift - rng() * 18, mc(count), l.id]);
    }
  }
  // Two lightweight supplemental groups per destination fill the long empty
  // gaps around arrivals and landmarks. These are generic fish, not new
  // named species. Original 17 schools and their seeded layouts remain intact.
  for(const l of LOCATIONS){
    const gate=portals.find(p=>p.id===l.id),gx=gate?.x??l.x,gz=gate?.z??l.z;
    const dx=l.x-gx,dz=l.z-gz,d=Math.hypot(dx,dz)||1;
    for(let k=0;k<2;k++){
      const t=k===0?.23:.80,side=k===0?-17:17;
      let x=gx+dx*t-dz/d*side,z=gz+dz*t+dx/d*side;
      // A nearby life encounter at the initial shelf, not only at its gate.
      if(l.id==='glasshorizon'&&k===1){x=8;z=696;}
      SCHOOL_SITES.push([x,z,0,mc(28),l.id,true]);
    }
  }
  // Layer the starting shelf with two broad mid-water shoals visible from the
  // arrival camera; instance count increases do not add draw calls.
  SCHOOL_SITES.push([-34,664,0,mc(58),'glasshorizon',true]);
  SCHOOL_SITES.push([42,642,0,mc(64),'glasshorizon',true]);

  // Small, recognisable species groups are separate from the generic schools.
  // If a model failed to load, do not falsely label procedural fallback fish.
  for(const p of planSpeciesSchools(field,colliders)) {
    if(speciesAssets[p.species]?.length) SCHOOL_SITES.push([p.x,p.z,0,mc(p.count),p.habitat,true,p.species]);
  }
  const baselineCounts = {};
  for (const site of SCHOOL_SITES) baselineCounts[site[4]] = (baselineCounts[site[4]] || 0) + site[3];
  const population = planEcosystem(field, portals, colliders, baselineCounts, new Set(Object.keys(speciesAssets)));
  for (const p of population.plans) SCHOOL_SITES.push([p.x,p.z,0,mc(p.count),p.habitat,true,p.species,p]);

  for (const s of SCHOOL_SITES) {
    const [sx, sz, sy, count, habitat, auxiliary=false, species=null, ecology=null] = s;
    // Formerly -sy put all schools with a negative depth plan ABOVE sea level.
    // Place their centre in the water column relative to the local seabed.
    // CRITICAL: surfaceHeightAt() can return NaN for out-of-bounds coordinates
    // when the player travels far from spawn. NaN here cascades into NaN fish
    // positions which freeze the renderer. Guard with finite fallback.
    const seabedRaw = field.surfaceHeightAt(sx, sz);
    const seabed = isFinite(seabedRaw) ? seabedRaw : -40.0;
    const depth = Math.max(2, -seabed);
    const lift=auxiliary && habitat==='floodednave' ? Math.min(depth*.25,12) : Math.min(depth*.48,35);
    const centreY = ecology && isFinite(ecology.y) ? ecology.y : Math.min(-3.5, seabed + lift);
    const waterRoom = Math.max(0.25, Math.min(ecology?.bottom ? .45 : 3.0, -centreY - 1.5, centreY - seabed - 1.0));
    const palettes = {
      glasshorizon: [[0.28,0.40,0.45],[0.68,0.70,0.60]],
      roseglass: [[0.57,0.31,0.16],[0.80,0.66,0.39]],
      verdant: [[0.35,0.45,0.23],[0.70,0.70,0.47]],
      aurel: [[0.27,0.38,0.47],[0.55,0.64,0.65]],
      azurespan: [[0.22,0.32,0.44],[0.49,0.56,0.64]],
      floodednave: [[0.21,0.38,0.37],[0.53,0.64,0.58]],
      abyssalbowl: [[0.12,0.22,0.34],[0.34,0.43,0.51]],
    };
    const palette = palettes[habitat] || palettes.aurel;
    // All shallow Glass Horizon schools, including the two newer nearby
    // groups, use the textured coastal LOD rather than featureless placeholders.
    // Use the recognisable surgeonfish asset for a subset of existing reef
    // schools; leave other generic groups generic instead of inventing labels.
    const inferredSpecies = !species && habitat === 'roseglass' && speciesAssets.palette_surgeonfish?.length
      && Math.abs(Math.floor(sx + sz)) % 2 === 0 ? 'palette_surgeonfish' : null;
    const renderedSpecies = species || inferredSpecies;
    // Do not turn an entire habitat into a barramundi monoculture. Only one in
    // three unnamed Glass Horizon shoals uses that model; the others retain a
    // distinct small-bodied silhouette, while named ecosystem plans use their
    // actual territorial species assets.
    const schoolHash=Math.abs(Math.floor(sx*13+sz*7));
    const useBarramundi=habitat==='glasshorizon'&&schoolHash%3===0;
    const schoolParts = renderedSpecies ? speciesAssets[renderedSpecies]
      : (useBarramundi && schoolAsset?.length ? schoolAsset : null);
    const geo = schoolParts ? schoolParts[0].geometry.clone() : fishGeo.clone();
    const off = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const rad = new Float32Array(count);
    const spd = new Float32Array(count);
    const scl = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const spread=ecology?.spread ?? 16;
      off[i * 3] = (rng() - 0.5) * spread;
      off[i * 3 + 1] = (rng() - 0.5) * 2 * waterRoom;
      off[i * 3 + 2] = (rng() - 0.5) * spread;
      ph[i] = rng() * 6.283;
      rad[i] = 5 + rng() * 16;
      spd[i] = 0.14 + rng() * 0.2;
      // Assets are normalized to length 2. Surgeonfish are ~20–31 cm;
      // tuna are larger and remain a small, open-water group.
      scl[i] = ecology?.scale ? ecology.scale[0]+rng()*(ecology.scale[1]-ecology.scale[0])
        : renderedSpecies==='palette_surgeonfish' ? .105+rng()*.045
        : renderedSpecies==='bluefin_tuna' ? .45+rng()*.25 : 0.16+rng()*0.22;
    }
    const simProfile={...HABITATS[habitat]?.school,...ecology?.swim,activity:true,
      bottomActivity:!!ecology?.bottom};
    const simulation = new SchoolSimulation(field, new THREE.Vector3(sx, centreY, sz), off, ph, rng, colliders, simProfile);
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPrevious', new THREE.InstancedBufferAttribute(simulation.previous, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(simulation.velocities, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPreviousVelocity', new THREE.InstancedBufferAttribute(simulation.previousVelocities, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    geo.setAttribute('aRadius', new THREE.InstancedBufferAttribute(rad, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(spd, 1));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scl, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: withShared({
        uCenter: { value: new THREE.Vector3(sx, centreY, sz) },
        uSchoolBlend: { value: 1 },
        uSwimTime: { value: 0 },
        uSwimStyle: { value: ecology?.style ?? 0 },
        uBodyCol: { value: new THREE.Vector3(...palette[0]) },
        uBellyCol: { value: new THREE.Vector3(...palette[1]) },
        uFishTexture: { value: schoolParts ? schoolParts[0].map : null },
      }),
      vertexShader: FISH_VS,
      fragmentShader: schoolParts ? TEXTURED_FISH_FS : FISH_FS,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { m.identity(); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = true;
    mesh.name = ecology ? 'fish_school_ecosystem' : auxiliary ? 'fish_school_ambient' : 'fish_school';
    mesh.userData.simulation = simulation;
    mesh.userData.fishShapeBound=fishShapeBound(geo,scl);
    mesh.boundingSphere=new THREE.Sphere();updateSchoolBounds(mesh);
    mesh.userData.habitat = habitat;
    mesh.userData.visual = renderedSpecies ? 'textured_'+renderedSpecies : schoolParts ? 'textured_barramundi_lod' : 'procedural_fish';
    mesh.userData.role = ecology?.role || 'existing school';
    // Predator-facing population interface. Captured fish disappear from the
    // live instance buffer and recover only after an off-camera recruitment
    // interval, providing observable successful attacks without allocating.
    const baseScales=Float32Array.from(scl),recoverAt=new Float64Array(count);
    mesh.userData.consumePrey=(world,time)=>{
      let pick=-1,best=Infinity;
      for(let i=0;i<count;i++){
        if(scl[i]<=0)continue;
        const dx=simulation.offsets[i*3]+simulation.center.x-world.x;
        const dy=simulation.offsets[i*3+1]+simulation.center.y-world.y;
        const dz=simulation.offsets[i*3+2]+simulation.center.z-world.z;
        const d=dx*dx+dy*dy+dz*dz;if(d<best){best=d;pick=i;}
      }
      if(pick<0||best>18*18)return false;
      scl[pick]=0;recoverAt[pick]=time+75+pick%46;
      geo.attributes.aScale.needsUpdate=true;return true;
    };
    mesh.userData.updatePopulation=time=>{
      let changed=false;
      for(let i=0;i<count;i++)if(scl[i]<=0&&recoverAt[i]&&time>=recoverAt[i]){
        scl[i]=baseScales[i];recoverAt[i]=0;changed=true;
      }
      if(changed)geo.attributes.aScale.needsUpdate=true;
    };
    if(renderedSpecies)mesh.userData.species=renderedSpecies;
    if (schoolParts) {
      // If a future model has multiple complementary parts, share simulation
      // attributes so the pieces move in exact lockstep.
      for (const part of schoolParts.slice(1)) {
        const partGeo = part.geometry.clone();
        for (const name of ['aOffset','aPrevious','aVelocity','aPreviousVelocity','aPhase','aRadius','aSpeed','aScale'])
          partGeo.setAttribute(name, geo.getAttribute(name));
        const partMat = mat.clone();
        partMat.uniforms = { ...mat.uniforms, uFishTexture: {value:part.map} };
        const partMesh = new THREE.InstancedMesh(partGeo, partMat, count);
        for (let i=0;i<count;i++) partMesh.setMatrixAt(i,m);
        partMesh.instanceMatrix.needsUpdate = true;
        // Any extra parts share the same interpolated fish positions. Include
        // their own shape size in the enclosing school sphere as well.
        mesh.userData.fishShapeBound=Math.max(mesh.userData.fishShapeBound,fishShapeBound(partGeo,scl));
        updateSchoolBounds(mesh);partMesh.boundingSphere=mesh.boundingSphere;
        partMesh.frustumCulled = true;
        partMesh.name = 'fish_school_detail';
        mesh.add(partMesh);
      }
    }
    group.add(mesh);
    schools.push(mesh);
  }

    let quality = state.quality;
  let schoolTick = 0;
  // Fixed-rate swim clock: body/tail wave advances at a steady 60 FPS-equivalent
  // pace regardless of actual frame dt. Using raw uTime (which accumulates
  // variable dt) makes the tail/body snap between extremes at low FPS — the
  // "whole body jiggling" — because sin(uTime*9) can jump by >90° per frame.
  let swimTime = 0;
  group.userData = { populationReports: population.reports };

  return {
    group, populationPlan: population.plans, populationReports: population.reports,
    setQuality(q) {
      quality = q;
      // On software-rendered (no-GPU) devices, thin marine snow aggressively
      // so each frame costs less CPU.
      const f = q === 'low' ? 0.02 : q === 'medium' ? 0.6 : 1.0;
      snow.geometry.setDrawRange(0, Math.floor(COUNT * f));
    },
    update(dt, camera, time, predators = []) {
      // particles follow the camera so the water always has body
      snowMat.uniforms.uCamPos.value.copy(camera.position);
      snowMat.uniforms.uPixelScale.value = window.innerHeight * 0.82;
      bioMat.uniforms.uPixelScale.value = window.innerHeight * 0.82;
      snow.position.copy(camera.position);
      // shafts only make sense while submerged, and fade with depth
      const depth = Math.max(0, -camera.position.y);
      const nave=CHAMBERS.find(c=>c.name==='The Flooded Nave');
      const inNave=nave&&Math.hypot(camera.position.x-nave.x,camera.position.z-nave.z)<nave.r*1.45;
      // Mesh cones cannot be depth-shadowed by the cavern shell and produced
      // screen-sized wedges there. Keep them only in genuinely open water.
      shafts.visible = camera.position.y < 2 && !inNave;
      if (shafts.visible) {
        const fade = 1 - Math.min(1, Math.max(0, (depth - 40) / 160));
        for (const m of shafts.children) {
          m.visible = m.position.distanceToSquared(camera.position) < 220 * 220;
          m.material.uniforms.uCamPos.value.copy(camera.position);
          m.material.uniforms.uIntensity.value = m.userData.baseIntensity * fade * (m.userData.kind==='cave' && quality!=='low' ? .35 : 1);
        }
      }
      // Advance with bounded real time. A fixed 1/60 increment made animation
      // run at half speed on the 30 FPS software-rendering mode. The clamp
      // prevents a long stalled frame from jumping the tail phase.
      swimTime += Math.min(Math.max(dt, 0), 1 / 30);
      // Step every school every tick so fish move smoothly every frame.
      // sim.step() modifies positions in place; GPU attributes share memory
      // with the sim arrays, so needsUpdate=true uploads fresh data each tick.
      // uSchoolBlend=1 renders at aOffset (current positions after step) —
      // no interpolation, no snap-back, no jiggling. Distant schools alternate
      // ticks to bound CPU cost on no-GPU devices.
      schoolTick++;
      for(const school of schools)school.userData.updatePopulation?.(time);
      // Guard camera position — NaN here would infect every school stepped this tick.
      const camX=camera.position.x, camY=camera.position.y, camZ=camera.position.z;
      const camOk = isFinite(camX) && isFinite(camY) && isFinite(camZ);
      const camSafe = camOk ? camera.position : new THREE.Vector3(0, -5, 0);
      // Visible/near schools step every frame for smooth movement. Remote,
      // invisible schools alternate ticks to keep software-rendering CPU cost
      // bounded without affecting anything the player can currently see.
      for (let i=0;i<schools.length;i++) {
        const school=schools[i];
        const sim=school.userData.simulation;
        const range=240;
        const near=sim.center.distanceToSquared(camSafe)<range*range;
        // Remote invisible schools are staggered across six frames. Updating
        // every remote school every other frame created CPU spikes during travel.
        const remotePeriod=6;
        if(!near && (schoolTick+i)%remotePeriod!==0)continue;
        const stepDt = Math.min(Math.max(dt, 0), 0.1) * (near ? 1 : remotePeriod);
        // The detailed solver intentionally clamps to 0.25 s for stability.
        // Age the inactive state by the remainder without extra neighbor scans.
        sim.step(Math.min(stepDt,0.25), camSafe, predators);
        if(stepDt>0.25)sim.time+=stepDt-0.25;
        // NaN guard: if step() produced NaN positions/velocities (e.g. from
        // bad terrain queries out of bounds), reset the school to its centre
        // so it doesn't freeze the renderer. This is the #1 cause of hard
        // freezes when leaving spawn into uncharted water.
        const pos=sim.positions,vel=sim.velocities;
        let nanFound=false;
        for(let q=0;q<pos.length;q+=3){
          if(!isFinite(pos[q])||!isFinite(pos[q+1])||!isFinite(pos[q+2])||
             !isFinite(vel[q])||!isFinite(vel[q+1])||!isFinite(vel[q+2])){
            nanFound=true;break;}
        }
        if(nanFound){
          for(let q=0;q<pos.length;q+=3){pos[q]=0;pos[q+1]=0;pos[q+2]=0;}
          sim.previous.set(pos);sim.velocities.fill(0);sim.previousVelocities.fill(0);
        }
        updateSchoolBounds(school);
        for (const attr of ['aOffset','aPrevious','aVelocity','aPreviousVelocity']) school.geometry.getAttribute(attr).needsUpdate = true;
      }
      for (const s of schools) {
        const range=240;
        s.visible = s.material.uniforms.uCenter.value.distanceToSquared(camera.position) < range * range;
        s.material.uniforms.uCamPos.value.copy(camera.position);
        s.material.uniforms.uSchoolBlend.value = 1;
        s.material.uniforms.uSwimTime.value = swimTime;
      }
    },
  };
}
