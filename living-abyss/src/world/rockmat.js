// -----------------------------------------------------------------------------
// THE LIVING ABYSS — rock material family
// One shader, five geological families, chosen per formation. A basalt trench
// wall and a limestone shelf no longer share a single grey value, but they are
// still lit by the same water, so the world stays coherent.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { GLSL_HEADER, withShared } from '../shaders/common.js?rev=37';

export const FAMILY = {
  limestone: 0,
  reef: 1,
  sandstone: 2,
  basalt: 3,
  mineral: 4,
};

export const ROCK_VS = /* glsl */`
attribute float aAO;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vAO;
void main(){
  vec4 local = vec4(position, 1.0);
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    // Correct for the non-uniform instance scales used by boulders/rubble.
    mat3 im = mat3(instanceMatrix);
    objectNormal /= vec3(dot(im[0],im[0]), dot(im[1],im[1]), dot(im[2],im[2]));
    objectNormal = im * objectNormal;
  #endif
  vec4 wp = modelMatrix * local;
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * objectNormal);
  vAO = aAO;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ROCK_FS = GLSL_HEADER + /* glsl */`
uniform float uDetail;
uniform float uDarken;
uniform float uCaveLit;      // 1 = surface rock, 0 = deep interior rock
uniform sampler2D uRockColorMap;
uniform sampler2D uRockNormalMap;
uniform sampler2D uRockRoughnessMap;
uniform sampler2D uRockColorMap2;
uniform sampler2D uRockNormalMap2;
uniform sampler2D uRockRoughnessMap2;
uniform float uRockMapsReady;
uniform float uRockMaps2Ready;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vAO;

void main(){
  vec3 N = normalize(vNrm);
  // procedural detail must not alias into moiré at distance
  float dcam = length(uCamPos - vWorld);
  float nf = 1.0 - smoothstep(24.0, 260.0, dcam);

  if(uQualityTier<.5){
    // Low-quality rock: bright, readable stone with layered noise for surface
    // detail. Family-specific palettes so limestone/reef/sandstone/basalt/mineral
    // all look like different rock, not the same grey blob.
    float n1=vnoise2(vWorld.xz*.045+vWorld.y*.014);
    float n2=vnoise2(vWorld.xz*.18+vWorld.y*.03+9.1);
    float n3=vnoise2(vWorld.xz*.62+vWorld.y*.08+23.4);
    vec3 albedo=mix(vec3(0.42, 0.39, 0.34), vec3(0.58, 0.54, 0.46), n1);
    if(uFamily>.5&&uFamily<1.5)albedo*=mix(vec3(1.05, 0.98, 0.88), vec3(0.86, 0.80, 0.70), n2);
    else if(uFamily>1.5&&uFamily<2.5)albedo*=mix(vec3(1.20, 1.00, 0.82), vec3(1.02, 0.82, 0.62), n2);
    else if(uFamily>2.5&&uFamily<3.5)albedo*=mix(vec3(0.50, 0.54, 0.60), vec3(0.36, 0.40, 0.46), n2);
    else if(uFamily>3.5)albedo*=mix(vec3(0.84, 0.92, 1.00), vec3(0.66, 0.74, 0.82), n2);
    // finer surface grain
    albedo *= 1.0 + 0.08 * (n3 - 0.5);
    // Wet film — subtle darkening on upward faces, not a black wash.
    float wet = 0.75 + 0.15 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    albedo *= mix(1.0, 0.90, uWetness * wet * 0.5);
    float rough=.72;
    if(uRockMapsReady>.5 && nf>.02 && (uFamily<2.5)){
      vec3 a=abs(N);vec2 uv=a.y>a.x&&a.y>a.z?vWorld.xz:(a.x>a.z?vWorld.yz:vWorld.xy);
      uv*=.48;
      vec3 tex=texture2D(uRockColorMap,uv).rgb;
      albedo*=mix(vec3(1.0),clamp(tex*1.7+.2,.45,1.5),.40*nf);
      rough=mix(.72,texture2D(uRockRoughnessMap,uv).r,.4*nf);
      vec3 t=texture2D(uRockNormalMap,uv).xyz*2.0-1.0;
      vec3 mapN=a.y>a.x&&a.y>a.z?vec3(t.x,t.z*sign(N.y),t.y):
        (a.x>a.z?vec3(t.z*sign(N.x),t.x,t.y):vec3(t.x,t.y,t.z*sign(N.z)));
      N=normalize(mix(N,normalize(mapN),.14*nf));
    }
    albedo=mix(albedo*vec3(0.78, 0.84, 0.90),albedo,uCaveLit);
    vec3 sun=sunlightAt(vWorld.y);float ndl=max(dot(N,uSunDir),0.0);
    vec3 col=albedo*(sun*(0.40+ndl*1.0)+ambientLight(vWorld.y)*1.35);
    col+=albedo*sun*caveOpeningLight(vWorld)*0.50*max(ndl,0.15);
    float depth=max(-vWorld.y,0.0);
    if(depth<100.0){float c=causticPattern(vWorld.xz*.72,uTime*.38)*(1.0-smoothstep(14.0,100.0,depth));col*=1.0+c*0.32*uCausticStrength;}
    float deep=smoothstep(120.0,360.0,depth);
    col+=albedo*vec3(0.12,0.18,0.26)*deep;
    // Lighter AO on low quality — crevices stay readable, not black.
    col*=uDarken*(0.68+0.42*clamp(vAO,0.0,1.0));
    gl_FragColor=vec4(applyWater(col,vWorld),1.0);return;
  }

  float detailH;
  vec3 albedo = rockAlbedo(vWorld, N, 1.0, nf, detailH);
  N = sandRippleNormal(vWorld, N, nf);

  // interior rock is darker and more mineral, with no sediment rain
  albedo = mix(albedo * vec3(0.66, 0.72, 0.80), albedo, uCaveLit);

  N = perturbNormal(vWorld, N, 0.42, uDetail * (0.38 + 0.30 * nf));
  if (nf > 0.02) {
    N = perturbNormal(vWorld, N, 1.8, uDetail * 0.16 * nf);
    N = perturbNormal(vWorld, N, 6.5, uDetail * 0.04 * nf);
  }

  float roughness = 0.72;
  // CC0 rock scans: triplanar projection avoids UV stretching on the original
  // irregular geometry. Rock 022 carries limestone, reef rock and sandstone;
  // Rock 3 (pitted, CC0 Poly Haven) carries the dark basalt family. Existing
  // family palettes, erosion, lighting and procedural relief remain in place.
  float mappedFamily = uFamily < 2.5 ? 1.0 : 0.0;
  float mappedFamily2 = uFamily > 2.5 && uFamily < 3.5 ? 1.0 : 0.0;
  if ((uRockMapsReady > 0.5 || uRockMaps2Ready > 0.5) && (mappedFamily > 0.5 || mappedFamily2 > 0.5) && nf > 0.02) {
    vec3 w = pow(abs(normalize(vNrm)), vec3(4.0));
    w /= max(w.x + w.y + w.z, 0.0001);
    vec3 q = vWorld * 0.48;
    vec3 colX = texture2D(uRockColorMap, q.yz).rgb;
    vec3 colY = texture2D(uRockColorMap, q.xz).rgb;
    vec3 colZ = texture2D(uRockColorMap, q.xy).rgb;
    vec3 mapped = colX * w.x + colY * w.y + colZ * w.z;
    albedo *= mix(vec3(1.0), clamp(mapped * 1.8 + 0.25, 0.45, 1.6), 0.48 * nf * mappedFamily);

    vec3 nx = texture2D(uRockNormalMap, q.yz).xyz * 2.0 - 1.0;
    vec3 ny = texture2D(uRockNormalMap, q.xz).xyz * 2.0 - 1.0;
    vec3 nz = texture2D(uRockNormalMap, q.xy).xyz * 2.0 - 1.0;
    vec3 baseN = normalize(vNrm);
    vec3 texN = normalize(vec3(nx.z * sign(baseN.x), nx.x, nx.y) * w.x
                        + vec3(ny.x, ny.z * sign(baseN.y), ny.y) * w.y
                        + vec3(nz.x, nz.y, nz.z * sign(baseN.z)) * w.z);
    N = normalize(mix(N, texN, 0.20 * nf * mappedFamily));

    float r = texture2D(uRockRoughnessMap, q.yz).r * w.x
            + texture2D(uRockRoughnessMap, q.xz).r * w.y
            + texture2D(uRockRoughnessMap, q.xy).r * w.z;
    roughness = mix(roughness, clamp(r, 0.35, 0.96), 0.65 * nf * mappedFamily);

    // ---- Rock 3 second map set: dark pitted basalt -----------------------
    vec3 col2X = texture2D(uRockColorMap2, q.yz * 0.62).rgb;
    vec3 col2Y = texture2D(uRockColorMap2, q.xz * 0.62).rgb;
    vec3 col2Z = texture2D(uRockColorMap2, q.xy * 0.62).rgb;
    vec3 mapped2 = col2X * w.x + col2Y * w.y + col2Z * w.z;
    albedo *= mix(vec3(1.0), clamp(mapped2 * 1.6 + 0.30, 0.40, 1.5), 0.42 * nf * mappedFamily2);

    vec3 m2x = texture2D(uRockNormalMap2, q.yz * 0.62).xyz * 2.0 - 1.0;
    vec3 m2y = texture2D(uRockNormalMap2, q.xz * 0.62).xyz * 2.0 - 1.0;
    vec3 m2z = texture2D(uRockNormalMap2, q.xy * 0.62).xyz * 2.0 - 1.0;
    vec3 texN2 = normalize(vec3(m2x.z * sign(baseN.x), m2x.x, m2x.y) * w.x
                        + vec3(m2y.x, m2y.z * sign(baseN.y), m2y.y) * w.y
                        + vec3(m2z.x, m2z.y, m2z.z * sign(baseN.z)) * w.z);
    N = normalize(mix(N, texN2, 0.18 * nf * mappedFamily2));

    float r2 = texture2D(uRockRoughnessMap2, q.yz * 0.62).r * w.x
             + texture2D(uRockRoughnessMap2, q.xz * 0.62).r * w.y
             + texture2D(uRockRoughnessMap2, q.xy * 0.62).r * w.z;
    roughness = mix(roughness, clamp(r2, 0.30, 0.98), 0.55 * nf * mappedFamily2);
  }
  vec3 col = litSurface(albedo, N, vWorld, roughness, clamp(vAO, 0.0, 1.0), 1.0);
  col+=albedo*sunlightAt(vWorld.y)*caveOpeningLight(vWorld)*.42*max(dot(N,uSunDir),.15);
  col *= uDarken;
  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Asset is loaded once and shared by every rock material. Node-based geometry
// tests have no DOM and simply keep the original procedural shader fallback.
// A download failure keeps the procedural material; it never blocks boot.
const rockMaps = {
  uRockColorMap: { value: null }, uRockNormalMap: { value: null },
  uRockRoughnessMap: { value: null }, uRockMapsReady: { value: 0 },
  uRockColorMap2: { value: null }, uRockNormalMap2: { value: null },
  uRockRoughnessMap2: { value: null }, uRockMaps2Ready: { value: 0 },
};
if (typeof document !== 'undefined') {
  const loader = new THREE.TextureLoader();
  let loaded = 0, loaded2 = 0;
  const load = (uniform, root, file, srgb, ready) => {
    const tex = loader.load(root + file, () => {
      if (++loaded === 3) rockMaps.uRockMapsReady.value = 1;
      if (ready) if (++loaded2 === 3) rockMaps.uRockMaps2Ready.value = 1;
    }, undefined, (error) => console.warn('Rock texture could not be loaded; retaining procedural material.', error));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    uniform.value = tex;
  };
  const root = './assets/textures/rock022/';
  load(rockMaps.uRockColorMap, root, 'Rock022_1K-JPG_Color.jpg', true);
  load(rockMaps.uRockNormalMap, root, 'Rock022_1K-JPG_NormalGL.jpg', false);
  load(rockMaps.uRockRoughnessMap, root, 'Rock022_1K-JPG_Roughness.jpg', false);
  // Rock 3: CC0 pitted rock from Poly Haven; dark, porous basalt family.
  const root2 = './assets/textures/rock_3/';
  load(rockMaps.uRockColorMap2, root2, 'diff.webp', true, true);
  load(rockMaps.uRockNormalMap2, root2, 'nor_gl.webp', false, true);
  load(rockMaps.uRockRoughnessMap2, root2, 'rough.webp', false, true);
}

const cache = new Map();

/**
 * @param {object} opts family: 'limestone'|'reef'|'sandstone'|'basalt'|'mineral'
 */
export function createRockMaterial(opts = {}) {
  const fam = opts.family ?? 'limestone';
  const key = [
    fam, opts.detail ?? 1, opts.darken ?? 1, opts.caveLit ?? 1,
    opts.wetness ?? 0.6, opts.mineral ?? 0, opts.side ?? 'front',
  ].join('|');
  if (!opts.unique && cache.has(key)) return cache.get(key);

  const mat = new THREE.ShaderMaterial({
    uniforms: withShared({
      ...rockMaps,
      uDetail: { value: opts.detail ?? 1.0 },
      uDarken: { value: opts.darken ?? 1.0 },
      uCaveLit: { value: opts.caveLit ?? 1.0 },
      uFamily: { value: FAMILY[fam] ?? 0 },
      uWetness: { value: opts.wetness ?? 0.6 },
      uMineral: { value: opts.mineral ?? 0 },
    }),
    vertexShader: ROCK_VS,
    fragmentShader: ROCK_FS,
    side: opts.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!opts.transparent,
  });
  mat.name = 'rock_' + fam;
  cache.set(key, mat);
  return mat;
}

export const rockMaterial = createRockMaterial({ family: 'limestone', detail: 1.0 });
