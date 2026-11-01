// -----------------------------------------------------------------------------
// THE LIVING ABYSS — seabed geometry
// Built from the single geography field, split into frustum-culled chunks, with
// baked horizon occlusion so cliffs read with real depth. Plus a coarse outer
// apron so the horizon never shows the edge of the world.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { WORLD, CHAMBERS, distantHeight } from './geography.js?rev=37';
import { GLSL_HEADER, GLSL_MEDIUM, withShared, shared } from '../shaders/common.js?rev=37';

export const TERRAIN_VS = /* glsl */`
attribute float aAO;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vAO;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * vec3(normal));
  vAO = aAO;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const TERRAIN_FS = GLSL_HEADER + /* glsl */`
uniform float uDetail;
uniform sampler2D uSandColor;
uniform sampler2D uSandNormal;
uniform sampler2D uSandRough;
uniform sampler2D uReefColor;
uniform sampler2D uReefNormal;
uniform sampler2D uReefRough;
uniform sampler2D uGravelColor;
uniform sampler2D uGravelNormal;
uniform sampler2D uGravelRough;
uniform sampler2D uRockColor;
uniform sampler2D uRockNormal;
uniform sampler2D uRockRough;
uniform float uGroundMapsReady;
uniform float uRockMapsReady;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vAO;

void main(){
  vec3 N = normalize(vNrm);
  float detailH;
  float dist = length(uCamPos - vWorld);
  float nearF = 1.0 - smoothstep(30.0, 220.0, dist);
  float shallow=1.0-smoothstep(50.0,115.0,-vWorld.y);
  float flatness=smoothstep(.50,.92,N.y);
  float reef=1.0-smoothstep(130.0,310.0,length(vWorld.xz-vec2(-520.0,300.0)));
  float mapWeight=nearF*shallow*flatness*(uGroundMapsReady+uRockMapsReady);
  vec2 groundUv=vWorld.xz*.50;
  vec3 groundColor=vec3(.55);
  vec3 groundNormal=vec3(.5,.5,1.0);
  float groundRough=.7;
  if(mapWeight>.01){
    vec3 sandCol=texture2D(uSandColor,groundUv).rgb;
    // A rotated, much larger sample suppresses the obvious tiled carpet seen
    // in the arrival screenshot without random hue shifts.
    vec2 macroUv=mat2(.80,-.60,.60,.80)*groundUv*.115+vec2(17.3,6.1);
    vec3 sandMacro=texture2D(uSandColor,macroUv).rgb;
    // Keep photographic grain and value drift, but not the source capture's
    // distinctive repeated ripple rings across every two-metre tile.
    vec3 sedimentBase=vec3(.43,.38,.29);
    sandCol=mix(sedimentBase,sandCol,.28)*(.90+.18*dot(sandMacro,vec3(.333)));
    vec3 sandNrm=texture2D(uSandNormal,groundUv).xyz;
    float sandRough=texture2D(uSandRough,groundUv).r;
    vec3 reefCol=texture2D(uReefColor,groundUv*.42).rgb;
    vec3 reefNrm=texture2D(uReefNormal,groundUv*.42).xyz;
    float reefRough=texture2D(uReefRough,groundUv*.42).r;
    vec3 gravelCol=texture2D(uGravelColor,groundUv*.72).rgb;
    vec3 gravelNrm=texture2D(uGravelNormal,groundUv*.72).xyz;
    float gravelRough=texture2D(uGravelRough,groundUv*.72).r;
    float gravelBand=smoothstep(.48,.68,vnoise2(vWorld.xz*.025+13.7))*(1.0-flatness*.35)*(1.0-reef*.55);
    sandCol=mix(sandCol,gravelCol,gravelBand*.62);
    sandNrm=mix(sandNrm,gravelNrm,gravelBand*.55);
    sandRough=mix(sandRough,gravelRough,gravelBand*.65);
    // Sand settles on flat ground; steeper raised ground exposes the rocky
    // substrate, so near-field cliffs read as rock with sand in the hollows.
    float substrate = (1.0 - flatness) * smoothstep(0.0, 0.6, N.y * 1.8 - 0.4);
    substrate *= 1.0 - smoothstep(-60.0, -4.0, vWorld.y); // photic shelf only
    vec3 rockCol = texture2D(uRockColor, groundUv * 0.62).rgb;
    vec3 rockNrm = texture2D(uRockNormal, groundUv * 0.62).xyz;
    float rockRough = texture2D(uRockRough, groundUv * 0.62).r;
    groundColor = mix(mix(sandCol, reefCol, reef), rockCol, substrate);
    groundNormal = mix(mix(sandNrm, reefNrm, reef), rockNrm, substrate);
    groundRough = mix(mix(sandRough, reefRough, reef), rockRough, substrate);
    // Thin encrusting algae on shallow photic rock: green fuzz on sheltered
    // flats, pink crust on vertical reef faces. Shallow shelf habitats only.
    float algaeGreen = flatness * (1.0 - smoothstep(-48.0, -5.0, vWorld.y)) * 0.5;
    float algaePink = (1.0 - flatness) * smoothstep(-42.0, -8.0, vWorld.y) * 0.5;
    groundColor += vec3(0.08, 0.12, 0.06) * algaeGreen + vec3(0.10, 0.05, 0.06) * algaePink;
  }
  // Lower-cost material that still looks like a real seabed — bright,
  // colorful, and clearly readable even on low detail. Layered noise gives
  // surface detail, slope drives sand-vs-rock, and depth tints the colour.
  if(uQualityTier<.5){
    float n1=vnoise2(vWorld.xz*.055);
    float n2=vnoise2(vWorld.xz*.21+7.3);
    float n3=vnoise2(vWorld.xz*.85+21.7);
    // Sand on flats, rock on steep banks — slope-driven substrate.
    float sandMask = flatness * (0.55 + 0.45 * n2);
    float rockMask = 1.0 - sandMask;
    vec3 sand = mix(vec3(0.42, 0.36, 0.26), vec3(0.56, 0.48, 0.34), n1);
    vec3 rock = mix(vec3(0.34, 0.32, 0.28), vec3(0.46, 0.44, 0.38), n1);
    vec3 albedo = mix(sand, rock, rockMask);
    // Depth tint: shallower water is lighter, deeper water pulls toward blue.
    float depth = max(-vWorld.y, 0.0);
    float depthTint = smoothstep(0.0, 60.0, depth);
    albedo = mix(albedo, albedo * vec3(0.82, 0.90, 0.96), depthTint * 0.35);
    // Fine grain for near-field detail.
    albedo *= 1.0 + 0.10 * (n3 - 0.5) * flatness * (1.0 - smoothstep(30.0, 120.0, dist));
    albedo *= mix(vec3(1.0), clamp(groundColor*1.5+0.20,.42,1.45), mapWeight*.65);
    vec3 t=groundNormal*2.0-1.0;
    vec3 texN=normalize(vec3(t.x,t.z,t.y));
    N=normalize(mix(N,texN,mapWeight*.18));
    // Subtle ripple normal on flats.
    if(flatness > 0.5 && nearF > 0.02){
      float ripple = sin(dot(vWorld.xz, vec2(0.8,0.6)) * 4.0 + n2 * 6.0) * 0.08;
      N = normalize(N + vec3(ripple, 0.35, ripple * 0.6));
    }
    vec3 sun=sunlightAt(vWorld.y);
    float ndl=max(dot(N,uSunDir),0.0);
    // Brighter, less shadowy lighting on low quality so nothing looks like a void.
    vec3 col=albedo*(sun*(0.45+ndl*0.95)+ambientLight(vWorld.y)*1.3);
    col+=albedo*sun*caveOpeningLight(vWorld)*0.58*max(N.y,0.15);
    if(depth<100.0){
      float caust=causticPattern(vWorld.xz*.72,uTime*.38)*(1.0-smoothstep(14.0,100.0,depth));
      col*=1.0+caust*0.16*uCausticStrength;
    }
    float deepFill=smoothstep(180.0,450.0,-uCamPos.y)*(1.0-smoothstep(15.0,100.0,dist));
    col+=albedo*vec3(0.22,0.28,0.34)*deepFill;
    // Lighter AO on low quality so crevices don't swallow the colour.
    col*=0.70+0.40*clamp(vAO,0.0,1.0);
    gl_FragColor=vec4(applyWater(col,vWorld),1.0);return;
  }
  vec3 albedo = rockAlbedo(vWorld, N, 1.0, nearF, detailH);
  albedo*=mix(vec3(1.0),clamp(groundColor*1.5+0.20,.42,1.45),mapWeight*.48);
  vec3 tn=groundNormal*2.0-1.0;
  N=normalize(mix(N,normalize(vec3(tn.x,tn.z,tn.y)),mapWeight*.14));
  N = sandRippleNormal(vWorld, N, nearF);

  // procedural bump: coarse geological relief always, fine grain up close
  // relief is layered, not noisy: coarse geology, one mid band, and a faint
  // grain. The old stack of three strong high-frequency bumps read as TV static.
  N = perturbNormal(vWorld, N, 0.34, uDetail * (0.60 + 0.4 * nearF));
  if (nearF > 0.02) {
    N = perturbNormal(vWorld, N, 1.6, uDetail * 0.26 * nearF);
    N = perturbNormal(vWorld, N, 6.0, uDetail * 0.09 * nearF);
  }

  float ao = clamp(vAO, 0.0, 1.0);
  float roughness=mix(.66,clamp(groundRough,.35,.95),mapWeight*.60);
  vec3 col = litSurface(albedo, N, vWorld, roughness, 0.35 + 0.65 * ao, 1.0);
  col+=albedo*sunlightAt(vWorld.y)*caveOpeningLight(vWorld)*.58*max(N.y,.15);
  // Subtle art-directed fill near the swimmer in the dark basin, so actual
  // terrain relief remains readable. Not a physical lamp or bioluminescence.
  float deepFill = smoothstep(180.0, 450.0, -uCamPos.y) * (1.0-smoothstep(15.0, 100.0, dist));
  col += albedo * vec3(.15, .20, .25) * deepFill;

  // Suspended sediment glow near the seabed in the shallows (adds air/water body)
  float seabedProx = (1.0 - smoothstep(0.0, 14.0, dist));
  col += waterAmbient(vWorld.y) * 0.10 * seabedProx;

  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

const smoothstepLocal = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ridged fractal noise in JS — the shape of distant mountain/reef country. */
function ridged(x, z, freq, octaves) {
  let sum = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const f = freq * Math.pow(2.03, o);
    const n = 1 - Math.abs(Math.sin(x * f * 1.7 + o * 2.1) * Math.cos(z * f * 1.31 - o * 1.7));
    sum += n * n * amp; tot += amp; amp *= 0.55;
  }
  return sum / tot;
}

const CHUNKS_X = 6;                    // must divide WORLD.nx cleanly (450 / 6 = 75)
const CHUNKS_Z = 6;

/** Bake approximate sky/water occlusion per vertex from the height grid. */
function bakeAO(field) {
  const { vx, vz, heights } = field;
  const ao = new Float32Array(vx * vz);
  const dirs = 8;
  const radii = [26, 70, 160];
  const H = heights;
  // These 24 ray offsets are identical at every terrain vertex. Compute the
  // trigonometry/rounding once rather than millions of times at world boot.
  const offsetX=new Int16Array(dirs*radii.length),offsetZ=new Int16Array(dirs*radii.length);
  for(let d=0;d<dirs;d++){
    const a=(d/dirs)*Math.PI*2,dx=Math.cos(a),dz=Math.sin(a);
    for(let r=0;r<radii.length;r++){
      const k=d*radii.length+r;
      offsetX[k]=Math.round(dx*radii[r]/field.cell);
      offsetZ[k]=Math.round(dz*radii[r]/field.cell);
    }
  }
  for (let j = 0; j < vz; j++) {
    for (let i = 0; i < vx; i++) {
      const h0 = H[j * vx + i];
      let horizon = 0;
      for (let d = 0; d < dirs; d++) {
        let maxTan = 0;
        for (let r = 0; r < radii.length; r++) {
          const rr = radii[r], k=d*radii.length+r;
          const si = i + offsetX[k];
          const sj = j + offsetZ[k];
          if (si < 0 || si >= vx || sj < 0 || sj >= vz) continue;
          const dh = H[sj * vx + si] - h0;
          const t = dh / rr;
          if (t > maxTan) maxTan = t;
        }
        horizon += maxTan > 0 ? Math.min(1, maxTan * 1.8) : 0;
      }
      horizon /= dirs;
      // cavity term: convex bumps get more light, hollows less
      let lap = 0, n = 0;
      if (i > 1 && i < vx - 2 && j > 1 && j < vz - 2) {
        lap = (H[j * vx + i - 2] + H[j * vx + i + 2] + H[(j - 2) * vx + i] + H[(j + 2) * vx + i]) * 0.25 - h0;
        n = 1;
      }
      const cavity = n ? Math.max(0, Math.min(1, 0.5 + lap * 0.10)) : 0.6;
      let a = Math.max(0.18, Math.min(1, (1 - horizon * 0.85) * (0.55 + 0.45 * cavity)));
      // flooded halls sit in permanent shade: darken the seabed under each vault,
      // letting light back in along the gate direction
      const wx = WORLD.minX + i * field.cell, wz = WORLD.minZ + j * field.cell;
      for (let k = 0; k < CHAMBERS.length; k++) {
        const ch = CHAMBERS[k];
        const dx = wx - ch.x, dz = wz - ch.z;
        const d = Math.hypot(dx, dz);
        if (d > ch.r * 1.5) continue;
        const inside = 1 - smoothstepLocal(ch.r * 0.55, ch.r * 1.45, d);
        let da = Math.atan2(dz, dx) - ch.gateAngle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const gateLight = Math.max(0, 1 - Math.abs(da) / 1.1);
        const shade = 1 - inside * (0.78 - 0.55 * gateLight);
        a *= shade;
      }
      ao[j * vx + i] = a;
    }
  }
  return ao;
}

// Two CC0 scanned PBR surfaces. Node geometry tests have no DOM and retain
// the procedural fallback; failed browser downloads do not block the world.
const groundMaps={
  uSandColor:{value:null},uSandNormal:{value:null},uSandRough:{value:null},
  uReefColor:{value:null},uReefNormal:{value:null},uReefRough:{value:null},
  uGravelColor:{value:null},uGravelNormal:{value:null},uGravelRough:{value:null},
  uRockColor:{value:null},uRockNormal:{value:null},uRockRough:{value:null},
  uGroundMapsReady:{value:0},uRockMapsReady:{value:0},
};
if(typeof document!=='undefined'){
  const loader=new THREE.TextureLoader();let loaded=0,loadedRock=0;
  for(const [key,dir,file,srgb] of [
    ['uSandColor','polyhaven/sand_03','diff',true],['uSandNormal','polyhaven/sand_03','nor_gl',false],['uSandRough','polyhaven/sand_03','rough',false],
    ['uReefColor','polyhaven/coast_sand_rocks_02','diff',true],['uReefNormal','polyhaven/coast_sand_rocks_02','nor_gl',false],['uReefRough','polyhaven/coast_sand_rocks_02','rough',false],
    ['uGravelColor','polyhaven/sandy_gravel','diff',true],['uGravelNormal','polyhaven/sandy_gravel','nor_gl',false],['uGravelRough','polyhaven/sandy_gravel','rough',false],
  ]){
    const tex=loader.load(`./assets/textures/${dir}/${file}.jpg`,()=>{if(++loaded===9)groundMaps.uGroundMapsReady.value=1;},undefined,
      ()=>console.warn('Ground texture unavailable; retaining procedural seabed.'));
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;if(srgb)tex.colorSpace=THREE.SRGBColorSpace;groundMaps[key].value=tex;
  }
  // Rock 3 CC0 PBR maps (Poly Haven): rocky substrate that shows through where
  // sand does not accumulate — steep banks, raised shelves and reef edges.
  for(const [key,file,srgb] of [
    ['uRockColor','diff.jpg',true],['uRockNormal','nor_gl.jpg',false],['uRockRough','rough.jpg',false],
  ]) {
    const tex=loader.load(`./assets/textures/polyhaven/seaside_rock/${file}`, ()=>{if(++loadedRock===3)groundMaps.uRockMapsReady.value=1;},undefined,
      ()=>console.warn('Rock substrate texture unavailable; retaining sand/reef ground.'));
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;if(srgb)tex.colorSpace=THREE.SRGBColorSpace;groundMaps[key].value=tex;
  }
}

export function buildTerrain(field) {
  const material = new THREE.ShaderMaterial({
    uniforms: withShared({ ...groundMaps, uDetail: { value: 1.0 } }),
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
    side: THREE.FrontSide,
  });

  const ao = bakeAO(field);
  const group = new THREE.Group();
  group.name = 'seabed';

  const { vx, heights, cell } = field;
  // ceiling + clamping: a non-divisible grid must never emit half-built chunks
  const cx = Math.ceil(field.nx / CHUNKS_X);   // cells per chunk
  const cz = Math.ceil(field.nz / CHUNKS_Z);

  const nrm = { x: 0, y: 1, z: 0 };

  for (let cj = 0; cj < CHUNKS_Z; cj++) {
    for (let ci = 0; ci < CHUNKS_X; ci++) {
      const i0 = ci * cx, j0 = cj * cz;
      const w = cx + 1, h = cz + 1;
      const pos = new Float32Array(w * h * 3);
      const nor = new Float32Array(w * h * 3);
      const aoA = new Float32Array(w * h);
      const idx = new Uint32Array(cx * cz * 6);

      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const gi = i0 + i, gj = j0 + j;
          const k = j * w + i;
          const x = WORLD.minX + gi * cell;
          const z = WORLD.minZ + gj * cell;
          pos[k * 3] = x;
          pos[k * 3 + 1] = heights[gj * vx + gi];
          pos[k * 3 + 2] = z;
          // analytic normal from the grid (identical across chunk borders)
          const hl = heights[gj * vx + Math.max(0, gi - 1)];
          const hr = heights[gj * vx + Math.min(vx - 1, gi + 1)];
          const hd = heights[Math.max(0, gj - 1) * vx + gi];
          const hu = heights[Math.min(field.vz - 1, gj + 1) * vx + gi];
          nrm.x = hl - hr; nrm.y = 2 * cell; nrm.z = hd - hu;
          const l = Math.hypot(nrm.x, nrm.y, nrm.z) || 1;
          nor[k * 3] = nrm.x / l; nor[k * 3 + 1] = nrm.y / l; nor[k * 3 + 2] = nrm.z / l;
          aoA[k] = ao[gj * vx + gi];
        }
      }
      let o = 0;
      for (let j = 0; j < cz; j++) {
        for (let i = 0; i < cx; i++) {
          const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
          idx[o++] = a; idx[o++] = c; idx[o++] = b;
          idx[o++] = b; idx[o++] = c; idx[o++] = d;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('aAO', new THREE.BufferAttribute(aoA, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      // generous bounds so big formations never pop at the frustum edge
      geo.boundingSphere.radius *= 1.3;

      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `seabed_${ci}_${cj}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  group.userData.material = material;
  return group;
}

const APRON_VS = /* glsl */`
varying vec3 vWorld;
varying vec3 vNrm;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const APRON_FS = GLSL_HEADER + /* glsl */`
varying vec3 vWorld;
varying vec3 vNrm;
void main(){
  vec3 N = normalize(vNrm);
  // The apron is only ever seen at 300 m+ through blue water: deliberately
  // simple shading, but it must still show RIDGES, or the horizon is a flat
  // painted band. Broad strata bands plus a strong up-facing term give the
  // layered blue silhouettes the reference frames are built on.
  float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  float band = 0.5 + 0.5 * sin(vWorld.y * 0.045 + fbm3(vWorld * 0.0016, 2) * 5.0);
  float n = fbm3(vWorld * 0.004, 2);
  vec3 rock = vec3(0.150, 0.190, 0.185) * (0.55 + 0.85 * n);
  rock *= 0.62 + 0.55 * up;
  rock *= 0.86 + 0.28 * band;
  vec3 col = rock * ambientLight(vWorld.y) * 1.35;
  col = mix(col, waterAmbient(vWorld.y) * 0.96, 0.42);
  col = applyWater(col, vWorld);
  // Very distant coarse triangles are background only. Fade them into the
  // water before their extreme deep-blue edges can cut through the horizon.
  float opacity = 1.0 - smoothstep(180.0, 480.0, length(vWorld-uCamPos));
  gl_FragColor = vec4(col, opacity);
}
`;

/**
 * Coarse apron beyond the charted world: the same geological function sampled
 * sparsely, overlapped inward and sunk slightly, so there is never a visible
 * edge or void — the ocean floor simply continues into the haze.
 */
/** Height of the coarse outer apron at a point — one definition, used by both
 *  the vertex pass and its normals. */
function apronY(field, x, z) {
  const insideX = x > WORLD.minX && x < WORLD.maxX;
  const insideZ = z > WORLD.minZ && z < WORLD.maxZ;
  if (insideX && insideZ) {
    let mn = 1e9;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) mn = Math.min(mn, field.heightAt(x + a * 55, z + b * 55));
    }
    return mn - 18;
  }
  const ex = Math.max(0, Math.max(WORLD.minX - x, x - WORLD.maxX));
  const ez = Math.max(0, Math.max(WORLD.minZ - z, z - WORLD.maxZ));
  const e = Math.hypot(ex, ez);
  const amp = Math.min(300, 26 + e * 0.30) * smoothstepLocal(40, 380, e);
  return distantHeight(x, z) - 26 - e * 0.045 + ridged(x, z, 0.0013, 5) * amp;
}

export function buildApron(field) {
  const OUT = 3200;                    // metres beyond the world bounds
  const STEP = 110;
  const x0 = WORLD.minX - OUT, x1 = WORLD.maxX + OUT;
  const z0 = WORLD.minZ - OUT, z1 = WORLD.maxZ + OUT;
  const nx = Math.ceil((x1 - x0) / STEP), nz = Math.ceil((z1 - z0) / STEP);

  const pos = [], nor = [], aoA = [], idx = [];
  const n = { x: 0, y: 1, z: 0 };
  const map = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      let x = x0 + i * STEP, z = z0 + j * STEP;
      // overlap inward so the coarse mesh never reveals a crack
      const insideX = x > WORLD.minX && x < WORLD.maxX;
      const insideZ = z > WORLD.minZ && z < WORLD.maxZ;
      const y = apronY(field, x, z);   // buried inside the chart, ridged outside
      pos.push(x, y, z);
      map.push(idx.length / 3);
      // cheap normals, sampled on the same surface we just displaced
      const e = 30;
      const hx = apronY(field, x + e, z) - apronY(field, x - e, z);
      const hz = apronY(field, x, z + e) - apronY(field, x, z - e);
      const nxv = -hx, nzv = -hz, nyv = 2 * e;
      const l = Math.hypot(nxv, nyv, nzv) || 1;
      nor.push(nxv / l, nyv / l, nzv / l);
      aoA.push(0.62);
    }
  }
  const w = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      // The distant apron is coarser than the navigable terrain. Interior
      // apron triangles can interpolate above the real seabed, producing dark
      // triangular wedges through the floor. Keep only boundary/outside faces.
      const inside = k => pos[k*3] >= WORLD.minX && pos[k*3] <= WORLD.maxX &&
                          pos[k*3+2] >= WORLD.minZ && pos[k*3+2] <= WORLD.maxZ;
      if (!(inside(a) && inside(c) && inside(b))) idx.push(a,c,b);
      if (!(inside(b) && inside(c) && inside(d))) idx.push(b,c,d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(aoA, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  // The apron exists only to hide the edge of the charted world. Shaded like
  // rock it read as a hard dark band lying across the horizon; here it simply
  // dissolves into the water column it lives in.
  const mat = new THREE.ShaderMaterial({
    uniforms: withShared({}),
    vertexShader: APRON_VS,
    fragmentShader: APRON_FS,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'distant_seabed';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
