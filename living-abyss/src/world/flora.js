// -----------------------------------------------------------------------------
// THE LIVING ABYSS — marine ecology
//
// The old vegetation was one ribbon primitive repeated: every kelp the same
// width, the same colour, the same silhouette. This module grows actual plants.
//
//   KELP        four species with tapered stipes, pneumatocysts and blades on
//               alternating sides, in three canopy storeys.
//   SEAGRASS    tufted blades with real taper, curl and clustered roots.
//   CORAL       branching, table, fan, massive, tube sponge, vase sponge and
//               encrusting families — each its own generator and material.
//
// Everything is instanced, animated in the vertex shader by species-specific
// sway, and placed by depth / slope / substrate / region — never at random.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { mulberry32, fbm2, fbm3, clamp, lerp } from '../core/noise.js?rev=37';
import { WORLD, LOCATIONS } from './geography.js?rev=37';
import { GLSL_HEADER, withShared } from '../shaders/common.js?rev=37';
import { planFeatureGardens } from './feature-garden-plan.js?rev=37';
import { InstanceFrustumCompactor, InstanceFrustumView } from '../rendering/instance-frustum.js?rev=37';

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------
const PLANT_VS = /* glsl */`
attribute float aH;        // 0 root .. 1 tip
attribute float aPhase;    // per-instance phase
attribute float aStiff;    // how far this element travels
attribute vec3 aTint;      // species tint + variation
attribute vec3 aLeaf;      // blade-local width, length, and leaf mask
uniform float uTime;
uniform float uSwayAmp;
uniform float uWaveLen;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vH;
varying vec3 vTint;
varying float vDepthY;
varying vec3 vLeaf;

void main(){
  vec3 p = position;
  float t = uTime;
  float h = clamp(aH, 0.0, 1.0);
  float bend = pow(h, 1.75) * aStiff;

  // travelling swell: the whole forest breathes together, not per-plant
  float wave = sin(t * 0.55 - (instanceMatrix[3].x * 0.045 + instanceMatrix[3].z * 0.038));
  float sway = sin(t * 0.40 + aPhase + p.y * 0.045) * 0.62
             + sin(t * 0.19 + aPhase * 2.1 + p.y * 0.018) * 0.42
             + wave * 0.35;
  p.x += sway * bend * uSwayAmp;
  p.z += (sway * 0.66 - sin(t * 0.31 + aPhase) * 0.22) * bend * uSwayAmp;
  // small flutter along blades, strongest at the tips
  p.x += sin(t * 2.4 + p.y * 0.9 + aPhase) * 0.045 * h * aStiff;
  p.z += cos(t * 2.1 + p.y * 0.8 + aPhase) * 0.045 * h * aStiff;

  vec4 wp = instanceMatrix * vec4(p, 1.0);
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vDepthY = wp.y;
  vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vH = h;
  vLeaf = aLeaf;
  // per-plant variation, hashed from the instance origin: a forest where every
  // plant is the same green is a tell that says "procedural demo"
  float instRnd = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vTint = vec3(aTint.x + instRnd * 0.85, aTint.y * (0.72 + 0.55 * instRnd), instRnd);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PLANT_FS = GLSL_HEADER + /* glsl */`
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTranslucency;
uniform float uSpecular;
uniform float uCoral;
uniform sampler2D uBladeMap;
uniform float uBladeMapsReady;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vH;
varying vec3 vTint;
varying float vDepthY;
varying vec3 vLeaf;

void main(){
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;

  vec3 albedo = mix(uColorA, uColorB, clamp(fract(vTint.x), 0.0, 1.0));
  albedo *= 0.80 + 0.42 * vTint.y;
  // stipes are older and duller than new growth at the tips
  albedo = mix(albedo * 0.58, albedo, smoothstep(0.0, 0.62, vH));
  // Blade-local detail remains attached as the plant sways. Longitudinal
  // tissue, central rib and subdued mottling break up the flat green ribbons.
  if (vLeaf.z > 0.5) {
    vec2 uv = vLeaf.xy;
    float rib = 1.0 - smoothstep(0.025, 0.10, abs(uv.x - 0.5));
    float grain = vnoise2(vec2(uv.x * 12.0 + vTint.z * 7.0, uv.y * 38.0));
    float tissue = vnoise2(vec2(uv.x * 7.0, uv.y * 17.0 + vTint.z * 5.0));
    float edge = smoothstep(0.22, 0.50, abs(uv.x - 0.5));
    albedo *= 0.83 + 0.18 * grain + 0.16 * tissue;
    albedo *= 1.0 - 0.16 * rib - 0.08 * edge;
    albedo += vec3(0.018, 0.014, 0.004) * rib;
    // Real kelp tissue carried on every blade: close blades read as tissue,
    // not flat green plastic. 1 kpx AI-derived kelp tissue texture (CC0-like
    // locally licensed asset), used only as detail, never as the base colour.
    if (uBladeMapsReady > 0.5) {
      albedo *= 0.72 + 0.55 * texture2D(uBladeMap, uv).rgb;
      albedo = mix(albedo, albedo * vec3(0.90, 1.05, 0.95), texture2D(uBladeMap, uv).g * 0.5);
    }
  }
  // slow chromatic variation across a colony so it is not one flat colour
  if (uCoral > 0.5) {
    if(uQualityTier>.5){
      float n = fbm3(vWorld * 0.33, 3);
      albedo *= 1.02 * (0.84 + 0.34 * n);
      float polyp = fbm3(vWorld * 3.4, 2);
      albedo *= 0.74 + 0.52 * polyp;
      albedo *= 0.90 + 0.20 * fbm3(vWorld * 9.0, 2);
      N = perturbNormal(vWorld, N, 2.2, 0.30);
      N = perturbNormal(vWorld, N, 7.0, 0.16);
    } else {
      // One coherent mottled surface on low; no expensive 3D bump stack.
      albedo*=.88+.24*vnoise2(vWorld.xz*1.4+vWorld.y*.37);
    }
    // tips of coral are lighter (new polyps)
    albedo = mix(albedo, albedo * 1.35 + vec3(0.05, 0.045, 0.04), smoothstep(0.55, 1.0, vH) * 0.45);
  }

  vec3 sun = sunlightAt(vWorld.y);
  float ndl = clamp(dot(N, uSunDir), 0.0, 1.0);
  float back = clamp(dot(-N, uSunDir), 0.0, 1.0);
  float trans = pow(back, 2.0) * uTranslucency;
  vec3 amb = ambientLight(vWorld.y) * 0.92 * (0.55 + 0.45 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

  vec3 col = albedo * (sun * (ndl * 0.62 + trans * 1.30 + 0.10) + amb);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 H = normalize(uSunDir + V);
  col += sun * pow(clamp(dot(N, H), 0.0, 1.0), 28.0) * uSpecular;
  // biological rim: thin structures glow when backlit
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
  col += albedo * ambientLight(vWorld.y) * rim * (uCoral > 0.5 ? 0.22 : 0.85);

  // pigment fluorescence: reef colour has to survive 30 m of water or every
  // coral reads as the same blue-grey stick
  if (uCoral > 0.5) {
    col += albedo * 0.10 * ambientLight(vWorld.y);
    // pigment compensation: the eye (and the camera) reads reef colour through
    // 30 m of water, so push the warm end back before the medium eats it
    col *= vec3(1.08, 1.00, 0.98);
    // Reflected shallow-reef daylight retains natural pigment in nearby coral.
    float shallowBounce=1.0-smoothstep(30.0,90.0,-vWorld.y);
    col += albedo * vec3(.10,.065,.045) * shallowBounce;
  }
  // Daylight from the real Nave roof opening reaches nearby benthic growth.
  col+=albedo*sunlightAt(vWorld.y)*caveOpeningLight(vWorld)*.36;
  // Art-directed near-camera bounce for deep benthic organisms. It is not
  // claimed to be actual light from the animal or a physically measured lamp.
  float deepVisibility = smoothstep(180.0, 450.0, -uCamPos.y)
                       * (1.0 - smoothstep(14.0, 75.0, length(vWorld-uCamPos)));
  col += albedo * vec3(.29, .36, .42) * deepVisibility;
  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

const matCache = new Map();

// One shared kelp-tissue detail map; plant tests without a DOM keep the
// procedural tissue instead.
const bladeMaps = { uBladeMap: { value: null }, uBladeMapsReady: { value: 0 } };
if (typeof document !== 'undefined') {
  const tex = new THREE.TextureLoader().load('./assets/textures/kelp/kelp-blade.jpg', () => {
    bladeMaps.uBladeMapsReady.value = 1;
  }, undefined, () => console.warn('Kelp blade texture unavailable; retaining procedural tissue.'));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  bladeMaps.uBladeMap.value = tex;
}

function plantMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: withShared({
      ...bladeMaps,
      uSwayAmp: { value: opts.sway ?? 1.0 },
      uWaveLen: { value: opts.wave ?? 40 },
      uColorA: { value: new THREE.Vector3(...(opts.colorA || [0.13, 0.26, 0.10])) },
      uColorB: { value: new THREE.Vector3(...(opts.colorB || [0.40, 0.48, 0.16])) },
      uTranslucency: { value: opts.translucent ?? 0.85 },
      uSpecular: { value: opts.spec ?? 0.22 },
      uCoral: { value: opts.coral ? 1 : 0 },
    }),
    vertexShader: PLANT_VS,
    fragmentShader: PLANT_FS,
    side: THREE.DoubleSide,
  });
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// geometry builder
// ---------------------------------------------------------------------------
class Geo {
  constructor() {
    this.pos = []; this.nrm = []; this.h = []; this.ph = [];
    this.st = []; this.tint = []; this.leaf = []; this.idx = [];
  }
  get count() { return this.pos.length / 3; }
  push(p, n, h, ph, st, tint, leaf = null) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.h.push(h); this.ph.push(ph); this.st.push(st);
    this.tint.push(tint[0], tint[1], 0);
    this.leaf.push(...(leaf || [0, 0, 0]));
    return this.count - 1;
  }
  /** Tapered ribbon between two centreline points, with an optional twist. */
  blade(p0, p1, side, w0, w1, h0, h1, ph, st, tint, segs = 4) {
    const base = this.count;
    const along = new THREE.Vector3().subVectors(p1, p0).normalize();
    const nrm = new THREE.Vector3().crossVectors(along, side).normalize();
    // ruffles are generated ACROSS the ribbon as well as along it: a flat quad
    // is the single strongest "unfinished asset" signal in underwater plants
    const phase = ph * 3.1;
    const SUB = 3;                                  // across-blade subdivisions
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = p0.clone().lerp(p1, t);
      // A kelp blade emerges narrow at the stipe, broadens through its
      // middle, and tapers again at the tip. This avoids the triangular
      // pennant shape caused by starting at full width.
      const profile = Math.pow(Math.sin(Math.PI * t), 0.72);
      const w = w0 * (0.08 + 0.92 * profile) + w1 * t * 0.20;
      const hh = lerp(h0, h1, t);
      p.y += Math.sin(t * Math.PI) * p0.distanceTo(p1) * 0.08;
      p.addScaledVector(side, Math.sin(t * Math.PI) * w * 0.14);
      for (let k = 0; k <= SUB; k++) {
        const u = k / SUB;                        // 0 = one edge, 1 = the other
        const off = (u - 0.5) * w;
        const q = p.clone().addScaledVector(side, off);
        // corrugation: the blade buckles out of its own plane
        const ruf = Math.sin(u * Math.PI * 3.0 + t * 5.0 + phase) * w * 0.10
                  + Math.sin(t * 9.0 + phase) * w * 0.045;
        q.addScaledVector(nrm, ruf);
        // cupping toward the tip so the blade catches light along its length
        q.addScaledVector(nrm, -Math.pow(Math.abs(u - 0.5) * 2.0, 2.0) * w * 0.16);
        const nn = nrm.clone().addScaledVector(side, (u - 0.5) * 0.8).normalize();
        this.push(q, nn, hh, ph, st, tint, [u, t, 1]);
      }
    }
    const stride = SUB + 1;
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < SUB; k++) {
        const a = base + i * stride + k, b = a + 1;
        const c = a + stride, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    return base;
  }
  /** legacy single-quad ribbon (kept for grasses, which are thin enough) */
  bladeQuad(p0, p1, side, w0, w1, h0, h1, ph, st, tint, segs = 4) {
    const base = this.count;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = p0.clone().lerp(p1, t);
      const w = lerp(w0, w1, t) * (1 - 0.35 * t * t);
      const hh = lerp(h0, h1, t);
      p.addScaledVector(side, Math.sin(t * Math.PI) * w * 0.12);
      for (let k = -1; k <= 1; k += 2) {
        const q = p.clone().addScaledVector(side, (w * 0.5) * k);
        const n = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(p1, p0).normalize(), side).normalize();
        this.push(q, k > 0 ? n : n.clone().negate(), hh, ph, st, tint);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.idx.push(a, c, b, b, c, d);
    }
    return base;
  }
  /** Tapered closed tube along a polyline (stipes, coral branches, sponges). */
  tube(pts, radiusFn, radial, ph, st, tint, capStart = true, capEnd = true) {
    const base = this.count;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length; i++) {
      const t = pts.length > 1 ? i / (pts.length - 1) : 0;
      const p = pts[i];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const prev = pts[Math.max(0, i - 1)];
      const dir = new THREE.Vector3().subVectors(next, prev);
      if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
      dir.normalize();
      const side = new THREE.Vector3().crossVectors(dir, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
      const r = Math.max(0.002, radiusFn(t));
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const n = new THREE.Vector3(
          side.x * ca + fwd.x * sa, side.y * ca + fwd.y * sa, side.z * ca + fwd.z * sa);
        this.push(new THREE.Vector3(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r), n, t, ph, st, tint);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j, b = a + 1;
        const c = a + radial + 1, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    if (capStart) {
      const c = this.push(pts[0], new THREE.Vector3(0, -1, 0), 0, ph, st, tint);
      const ring = base;
      for (let j = 0; j < radial; j++) this.idx.push(c, ring + j + 1, ring + j);
    }
    if (capEnd) {
      const last = base + (pts.length - 1) * (radial + 1);
      const c = this.push(pts[pts.length - 1], new THREE.Vector3(0, 1, 0), 1, ph, st, tint);
      for (let j = 0; j < radial; j++) this.idx.push(c, last + j, last + j + 1);
    }
    return base;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(this.h, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.ph, 1));
    g.setAttribute('aStiff', new THREE.Float32BufferAttribute(this.st, 1));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leaf, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// KELP SPECIES
// ---------------------------------------------------------------------------
/**
 * Kelp, authored in METRES. Height is a real height; every proportion below is
 * derived from it, so a 28 m giant kelp has a 9 cm stipe and 3 m blades.
 * (The previous version was built at unit scale and stretched non-uniformly,
 * which turned every plant into a giant twig.)
 *   species 0 giant · 1 bull · 2 feather · 3 understory
 */
function makeKelp(rng, species, H = 26, lowDetail = false) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const stiff = species === 1 ? 0.60 : species === 3 ? 0.35 : 0.90;
  const tint = [rng(), rng() * 0.8 + 0.2];

  const stipeR = (species === 1 ? 0.075 : species === 3 ? 0.022 : 0.048) * (H / 26) ** 0.55;
  const bladeLen = (species === 1 ? 0.095 : species === 2 ? 0.075 : 0.115) * H;
  const bladeW = (species === 2 ? 0.016 : species === 1 ? 0.026 : 0.030) * H;
  const fullBlades = species === 1 ? 14 : species === 2 ? 24 : species === 3 ? 13 : 22;
  const blades = lowDetail ? Math.max(6,Math.round(fullBlades*.62)) : fullBlades;

  // stipe: a rising helix that leans with the current
  const pts = [];
  const nseg = species === 3 ? 5 : 8;
  const lean = (0.10 + rng() * 0.14) * H;
  const helix = rng() * 6.28;
  for (let i = 0; i <= nseg; i++) {
    const t = i / nseg;
    const bend = Math.pow(t, 1.5);
    pts.push(V3(
      Math.sin(t * 1.8 + helix) * lean * bend,
      t * H,
      Math.cos(t * 1.5 + helix) * lean * bend,
    ));
  }
  g.tube(pts, (t) => Math.max(0.006, stipeR * (1 - 0.45 * t)), species === 3 ? 4 : 5, ph, stiff, tint);

  for (let i = 0; i < blades; i++) {
    const t = 0.14 + (i / blades) * 0.84;
    // Attach continuously along the curved stipe rather than snapping several
    // blades to the same ring, which produces artificial radial whorls.
    const segment = t * nseg;
    const idx = Math.min(nseg - 1, Math.floor(segment));
    const p0 = pts[idx].clone().lerp(pts[idx + 1], segment - idx);
    const side = new THREE.Vector3(
      Math.cos(i * 2.4 + helix), 0, Math.sin(i * 2.4 + helix)).normalize();
    const len = bladeLen * (0.6 + rng() * 0.7) * (1 - 0.3 * t);
    const curl = (rng() - 0.35);
    // blades leave the stipe, arch outward and then DROOP — that droop is the
    // whole silhouette of a kelp forest; horizontal blades read as a wheatfield
    const p1 = p0.clone()
      .addScaledVector(side, len * (0.55 + rng() * 0.45))
      .add(V3(0, len * (0.05 + curl * 0.42) - len * 0.34 * t, 0));
    // the float at the blade base — the thing that holds the blade up
    if (species !== 2 && species !== 3) {
      const b = p0.clone();
      const br = stipeR * 2.2;
      g.tube([b, b.clone().add(V3(0, br * 1.8, 0))], (tt) => br * (1 - 0.55 * tt), 4, ph, stiff, tint, true, true);
    }
    // Width must run across the blade, not along its outward centreline.
    // The old basis was almost parallel to the centreline, collapsing the
    // ribbons into needle-like triangles and unstable normals. A slight tilt
    // gives alternating blades different orientations without changing their
    // attachment points, instance placements or random sequence.
    const bladeSide = V3(-side.z, 0.18 * Math.sin(i * 1.7 + ph), side.x).normalize();
    g.blade(p0, p1, bladeSide, bladeW * (0.85 + rng() * 0.4), bladeW * 0.30,
      t, Math.min(1, t + 0.10), ph, stiff, tint, lowDetail ? 3 : 5);
  }
  return g.build();
}

/** Seagrass tuft: 6–12 tapered, curling blades from one root. */
function makeSeagrass(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const n = 6 + Math.floor(rng() * 7);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = 0.35 + rng() * 0.55;
    const p0 = V3(Math.cos(a) * 0.02 * rng(), 0, Math.sin(a) * 0.02 * rng());
    const p1 = p0.clone().addScaledVector(dir, len * 0.55).add(V3(0, len, 0))
      .add(V3(dir.x * len * 0.25, -len * 0.12, dir.z * len * 0.25));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    g.bladeQuad(p0, p1, side, 0.046 + rng() * 0.026, 0.006, 0.02, 0.75 + rng() * 0.25,
      ph, 0.30 + rng() * 0.2, [rng(), rng()]);
  }
  return g.build();
}

/** Photic-zone algae tuft: short red/green blades clinging to shallow rock,
 *  2–20 m deep. Not kelp — no holdfasts, no canopy; the thin colour life on
 *  the sunlit shelf. */
function makePhoticAlgae(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const n = 4 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = 0.08 + rng() * 0.18;
    const p0 = V3(Math.cos(a) * 0.01 * rng(), 0, Math.sin(a) * 0.01 * rng());
    const p1 = p0.clone().addScaledVector(dir, len * 0.6).add(V3(0, len, 0))
      .add(V3(dir.x * len * 0.35, -len * 0.2, dir.z * len * 0.35));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const red = rng() > 0.45;
    g.bladeQuad(p0, p1, side, 0.025 + rng() * 0.018, 0.004, 0.02, 0.8 + rng() * 0.2,
      ph, 0.25 + rng() * 0.15, red ? [rng() * 0.4 + 0.4, rng() * 0.3, rng() * 0.25] : [rng() * 0.3 + 0.2, rng() * 0.4 + 0.3, rng() * 0.2]);
  }
  return g.build();
}

// ---------------------------------------------------------------------------
// CORAL FAMILIES
// ---------------------------------------------------------------------------
/** Branching coral: recursive, tapering, closing at every tip. */
function makeBranchingCoral(rng, lowDetail = false) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const st = 0.03;
  const tint = [rng(), rng()];
  const grow = (p, dir, len, rad, level, hBase) => {
    const segs = lowDetail ? 1 : 2;
    const pts = [p.clone()];
    let cur = p.clone();
    let d = dir.clone();
    for (let i = 0; i < segs; i++) {
      d = d.clone().add(V3((rng() - 0.5) * 0.5, rng() * 0.25, (rng() - 0.5) * 0.5)).normalize();
      cur = cur.clone().addScaledVector(d, len / segs);
      pts.push(cur.clone());
    }
    const terminal=level >= (lowDetail ? 2 : 3);
    g.tube(pts, (t) => rad * (1 - 0.55 * t), lowDetail ? 3 : 4, ph, st, tint, level === 0, lowDetail && terminal);
    if (terminal) {
      // Full quality adds closed polyp nubs; the low-detail tapered branch is
      // capped directly, retaining the three-level silhouette for far tiles.
      if(!lowDetail)g.tube([cur, cur.clone().add(V3(0, rad * 1.4, 0))], (t) => rad * (0.9 - 0.8 * t), 4, ph, st, tint, true, true);
      return;
    }
    const kids = 2 + (rng() > 0.55 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const nd = d.clone()
        .add(V3((rng() - 0.5) * 1.5, 0.5 + rng() * 0.7, (rng() - 0.5) * 1.5)).normalize();
      grow(cur, nd, len * (0.68 + rng() * 0.20), rad * 0.70, level + 1, hBase);
    }
  };
  const arms = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng();
    grow(V3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05),
      V3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(),
      0.44 + rng() * 0.2, 0.075 + rng() * 0.03, 0, 0);
  }
  return g.build();
}

/** Elkhorn: broad, flattened antler blades—not a recolored staghorn. */
function makeElkhornCoral(rng){
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()];
  const arms=4+Math.floor(rng()*3);
  for(let a=0;a<arms;a++){
    const az=(a/arms)*Math.PI*2+ph*.17,H=.62+rng()*.42,W=.13+rng()*.10;
    const pts=[V3(Math.cos(az)*.05,0,Math.sin(az)*.05),V3(Math.cos(az)*.12,H*.42,Math.sin(az)*.12),V3(Math.cos(az)*.22,H,Math.sin(az)*.22)];
    g.tube(pts,t=>W*(1-.48*t),6,ph,.018,tint,true,true);
    for(const side of[-1,1]){
      const p=pts[1],dir=V3(Math.cos(az+side*.58)*.55,.83,Math.sin(az+side*.58)*.55).normalize();
      g.tube([p,p.clone().addScaledVector(dir,H*.48)],t=>W*.68*(1-.62*t),6,ph,.018,tint,true,true);
    }
  }
  return g.build();
}

/** Finger/pillar colony: stout vertical lobes with rounded irregular heights. */
function makePillarCoral(rng){
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()],n=6+Math.floor(rng()*5);
  for(let i=0;i<n;i++){
    const a=rng()*6.283,r=Math.sqrt(rng())*.28,H=.34+rng()*.72,R=.07+rng()*.07;
    const b=V3(Math.cos(a)*r,0,Math.sin(a)*r);
    g.tube([b,b.clone().add(V3((rng()-.5)*.05,H*.52,(rng()-.5)*.05)),b.clone().add(V3((rng()-.5)*.08,H,(rng()-.5)*.08))],t=>R*(1-.32*t),7,ph,.026,tint,true,true);
  }
  return g.build();
}

/** Table / plate coral: a flared disc on a short stalk, with a thick rim. */
function makeTableCoral(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const tint = [rng(), rng()];
  const stalkH = 0.10 + rng() * 0.16;
  g.tube([V3(0, 0, 0), V3(0, stalkH, 0)], (t) => lerp(0.05, 0.028, t), 6, ph, 0.02, tint);
  // disc: rings from centre to rim, top and bottom, welded at the rim
  const R = 0.40 + rng() * 0.34;
  const radial = 18, rings = 4;
  const top = [], bot = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    top.push([]); bot.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const lob = 1 + 0.10 * Math.sin(a * 5 + ph) + 0.06 * Math.sin(a * 11);
      const r = R * t * lob;
      // concentric rugosity: a real table coral is corrugated, never a clean disc
      const ridge = Math.sin(t * 7.0 + Math.sin(a * 4.0 + ph) * 0.9) * 0.020 * t
                  + Math.sin(a * 9.0 + ph * 2.0) * 0.012 * t;
      const y = stalkH + (1 - t * t) * 0.06 + Math.sin(a * 3 + ph) * 0.014 + ridge;
      top[i].push(g.push(V3(Math.cos(a) * r, y, Math.sin(a) * r), V3(0, 1, 0), 0.4 + t * 0.6, ph, 0.02, tint));
      bot[i].push(g.push(V3(Math.cos(a) * r, y - 0.028 * (1 - t * 0.4), Math.sin(a) * r), V3(0, -1, 0), 0.3, ph, 0.02, tint));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      g.idx.push(top[i][j], top[i + 1][j], top[i][j + 1], top[i][j + 1], top[i + 1][j], top[i + 1][j + 1]);
      g.idx.push(bot[i][j], bot[i][j + 1], bot[i + 1][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]);
    }
  }
  // rim
  for (let j = 0; j < radial; j++) {
    g.idx.push(top[rings][j], bot[rings][j], top[rings][j + 1], top[rings][j + 1], bot[rings][j], bot[rings][j + 1]);
  }
  return g.build();
}

/** A rosette of overlapping foliose plates. Curved, corrugated surfaces and
 * staggered layers create broad reef silhouettes, rather than isolated sticks. */
function makeFolioseCoral(rng) {
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()];
  const plates=7,radial=7,angular=14;
  g.tube([V3(0,-.08,0),V3(0,.22,0)],t=>.16*(1-.5*t),7,ph,0,tint);
  for(let layer=0;layer<plates;layer++){
    const az=layer*Math.PI*2/plates+ph*.2,spread=.78+rng()*.30;
    const R=.75+rng()*.35,base=g.count;
    for(let i=0;i<=radial;i++){
      const t=i/radial;
      for(let j=0;j<=angular;j++){
        const u=j/angular,ang=az+(u-.5)*spread*2;
        const edge=1+.10*Math.sin(ang*9+ph)+.05*Math.sin(ang*17-ph);
        const rad=.08+t*R*edge;
        const lip=Math.pow(t,1.45)*(.36+.14*Math.sin(ang*4+layer));
        const ripple=(.045*Math.sin(ang*11+ph+t*5)+.025*Math.sin(t*14+ang*5))*t;
        const y=.12+layer*.035+lip+ripple;
        g.push(V3(Math.cos(ang)*rad,y,Math.sin(ang)*rad),V3(0,1,0),.3+.7*t,ph,0,tint);
      }
    }
    const stride=angular+1;
    for(let i=0;i<radial;i++)for(let j=0;j<angular;j++){
      const a=base+i*stride+j,b=a+1,c=a+stride,d=c+1;
      g.idx.push(a,c,b,b,c,d);
    }
  }
  const geo=g.build();geo.computeVertexNormals();return geo;
}

/** Sea fan: a planar lattice of branches in one plane — a real gorgonian. */
function makeFanCoral(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const tint = [rng(), rng()];
  const H = 0.85 + rng() * 0.7;
  const plane = new THREE.Vector3(Math.cos(ph), 0, Math.sin(ph));
  const perp = new THREE.Vector3(-plane.z, 0, plane.x);
  const grow = (p, ang, len, rad, level) => {
    const dir = new THREE.Vector3()
      .addScaledVector(perp, Math.cos(ang))
      .addScaledVector(V3(0, 1, 0), Math.sin(ang))
      .normalize();
    const p1 = p.clone().addScaledVector(dir, len);
    g.tube([p, p1], (t) => rad * (1 - 0.35 * t), 3, ph, 0.05, tint, level === 0, false);
    if (level >= 3) {
      g.tube([p1, p1.clone().addScaledVector(dir, len * 0.25)], (t) => rad * (0.9 - 0.85 * t), 4, ph, 0.05, tint, true, true);
      return;
    }
    const spread = 0.34 + rng() * 0.3;
    grow(p1, ang - spread, len * 0.78, rad * 0.7, level + 1);
    grow(p1, ang + spread, len * 0.78, rad * 0.7, level + 1);
  };
  grow(V3(0, 0, 0), Math.PI * 0.5, H * 0.42, 0.055, 0);
  // holdfast
  g.tube([V3(0, -0.03, 0), V3(0, 0.05, 0)], (t) => lerp(0.09, 0.04, t), 6, ph, 0.0, tint, true, true);
  return g.build();
}

/** Massive coral: a lobed dome (closed), brain-coral style ridges in the shader. */
function makeMassiveCoral(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const tint = [rng(), rng()];
  const radial = 20, rings = 12;
  const R = 0.35 + rng() * 0.35;
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const phi = v * Math.PI * 0.52;      // hemisphere-ish, flattened
    rows.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const lobe = 1 + 0.14 * Math.sin(a * 4 + ph) + 0.09 * Math.sin(a * 7 - ph);
      const r = Math.sin(phi) * R * lobe;
      const y = Math.cos(phi) * R * 0.72;
      const n = new THREE.Vector3(Math.cos(a) * Math.sin(phi), Math.cos(phi), Math.sin(a) * Math.sin(phi)).normalize();
      rows.push && rows[i].push(g.push(V3(Math.cos(a) * r, y, Math.sin(a) * r), n, v, ph, 0.0, tint));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      g.idx.push(rows[i][j], rows[i + 1][j], rows[i][j + 1], rows[i][j + 1], rows[i + 1][j], rows[i + 1][j + 1]);
    }
  }
  // bottom cap
  const c = g.push(V3(0, -0.02, 0), V3(0, -1, 0), 0, ph, 0, tint);
  for (let j = 0; j < radial; j++) g.idx.push(c, rows[rings][j + 1], rows[rings][j]);
  return g.build();
}

/** Tube sponge: a cluster of open cylinders. Double-sided interiors. */
function makeTubeSponge(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const tint = [rng(), rng()];
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, rr = rng() * 0.12;
    const H = 0.30 + rng() * 0.45;
    const R = 0.055 + rng() * 0.045;
    const base = V3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push(base.clone().add(V3(Math.sin(t * 2 + a) * 0.03, t * H, Math.cos(t * 2 + a) * 0.03)));
    }
    g.tube(pts, (t) => R * (0.82 + 0.34 * t), 9, ph, 0.10, tint, true, false);
    // inner wall, so the tube reads as hollow from above
    const inner = pts.map((p) => p.clone());
    const baseIdx = g.count;
    const up = V3(0, 1, 0);
    for (let k = 0; k < pts.length; k++) {
      const t = k / (pts.length - 1);
      const p = pts[k];
      const dir = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)]).normalize();
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();
      const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
      const r = R * (0.82 + 0.34 * t) * 0.72;
      for (let j = 0; j <= 9; j++) {
        const ang = (j / 9) * Math.PI * 2;
        const nn = new THREE.Vector3(side.x * Math.cos(ang) + fwd.x * Math.sin(ang),
          side.y * Math.cos(ang) + fwd.y * Math.sin(ang),
          side.z * Math.cos(ang) + fwd.z * Math.sin(ang)).negate();
        g.push(V3(p.x + nn.x * -r, p.y + nn.y * -r, p.z + nn.z * -r), nn, t, ph, 0.10, tint);
      }
    }
    for (let k = 0; k < pts.length - 1; k++) {
      for (let j = 0; j < 9; j++) {
        const a0 = baseIdx + k * 10 + j, b0 = a0 + 1;
        const c0 = a0 + 10, d0 = c0 + 1;
        g.idx.push(a0, b0, c0, b0, d0, c0);
      }
    }
  }
  return g.build();
}

/** Barrel/vase sponge with a flared asymmetric wall and visible cavity. */
function makeBarrelSponge(rng){
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()],rings=7,sides=14,H=.55+rng()*.65;
  const outer=[],inner=[];
  for(let i=0;i<=rings;i++){
    const t=i/rings,r=.18+Math.sin(t*Math.PI*.72)*(.13+rng()*.025)+t*.10;
    outer[i]=[];inner[i]=[];
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI*2,w=1+.08*Math.sin(a*3+ph)+.04*Math.sin(a*7-ph);
      const y=t*H+.025*Math.sin(a*4+ph)*t;
      outer[i].push(g.push(V3(Math.cos(a)*r*w,y,Math.sin(a)*r*w),V3(Math.cos(a),.12,Math.sin(a)).normalize(),t,ph,.12,tint));
      inner[i].push(g.push(V3(Math.cos(a)*r*w*.76,y-.02,Math.sin(a)*r*w*.76),V3(-Math.cos(a),-.08,-Math.sin(a)).normalize(),t,ph,.12,tint));
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
    const a=outer[i][j],b=outer[i+1][j],c=outer[i][j+1],d=outer[i+1][j+1];g.idx.push(a,b,c,c,b,d);
    const e=inner[i][j],f=inner[i][j+1],h=inner[i+1][j],k=inner[i+1][j+1];g.idx.push(e,f,h,f,k,h);
  }
  for(let j=0;j<sides;j++)g.idx.push(outer[rings][j],inner[rings][j],outer[rings][j+1],outer[rings][j+1],inner[rings][j],inner[rings][j+1]);
  const geo=g.build();geo.computeVertexNormals();return geo;
}

/** Tube anemone: low oral disc with many independently curved tentacles. */
function makeAnemone(rng){
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()],n=18+Math.floor(rng()*9);
  g.tube([V3(0,-.03,0),V3(0,.12,0)],t=>.20*(1-.25*t),10,ph,.04,tint,true,true);
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+rng()*.18,L=.28+rng()*.34,lean=.35+rng()*.45;
    const root=V3(Math.cos(a)*.10,.10,Math.sin(a)*.10);
    g.tube([root,V3(Math.cos(a)*L*.48,.18+L*.34,Math.sin(a)*L*.48),V3(Math.cos(a)*L*lean,.16+L*.62,Math.sin(a)*L*lean)],t=>.018*(1-.78*t),4,ph,.08,tint,true,true);
  }
  return g.build();
}

/** Sea pen for deep sediment: central rachis with paired polyp-bearing vanes. */
function makeSeaPen(rng){
  const g=new Geo(),ph=rng()*6.283,tint=[rng(),rng()],H=.8+rng()*.8;
  g.tube([V3(0,-.18,0),V3(0,H,0)],t=>.035*(1-.38*t),5,ph,.05,tint,true,true);
  for(let i=2;i<11;i++){
    const y=H*i/12,w=Math.sin(i/12*Math.PI)*(.18+rng()*.09);
    for(const s of[-1,1])g.tube([V3(0,y,0),V3(s*w,y+.05+(rng()-.5)*.05,.025*Math.sin(i+ph))],t=>.018*(1-.75*t),4,ph,.06,tint,true,true);
  }
  return g.build();
}

/** Encrusting mat: a low, lumpy closed plate that follows the rock. */
function makeEncrusting(rng) {
  const g = new Geo();
  const ph = rng() * 6.28;
  const tint = [rng(), rng()];
  const radial = 16, rings = 4;
  const R = 0.5 + rng() * 0.4;
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    rows.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const lob = 1 + 0.18 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 8);
      const r = R * t * lob;
      const y = (1 - t) * 0.10 + Math.sin(a * 4 + ph * 2) * 0.012 * t;
      rows[i].push(g.push(V3(Math.cos(a) * r, y, Math.sin(a) * r), V3(0, 1, 0), 0.2 + t * 0.4, ph, 0.0, tint));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      g.idx.push(rows[i][j], rows[i + 1][j], rows[i][j + 1], rows[i][j + 1], rows[i + 1][j], rows[i + 1][j + 1]);
    }
  }
  return g.build();
}

// ---------------------------------------------------------------------------
// PLACEMENT
// ---------------------------------------------------------------------------
const rnd = mulberry32(90210);

/** Distance-to-location falloff used to shape density. */
function nearLocation(x, z, loc, rx, rz) {
  const dx = (x - loc.x) / rx, dz = (z - loc.z) / rz;
  return Math.max(0, 1 - Math.hypot(dx, dz));
}

/**
 * Instances are bucketed into 220 m world tiles, one InstancedMesh per tile.
 * A single InstancedMesh covering a 4.8 km world can never be frustum-culled,
 * so every fern in the abyss is submitted while you look at the reef. Tiling
 * makes the renderer's own culling do the work: 20–40 draw calls per species,
 * but typically only 2–4 of them survive the frustum.
 */
const TILE = 220;
// Local displacement bound for the exact vertex sway/flutter in PLANT_VS.
// Multiplying by the instance scale encloses every time in the animation.
const swayBounds=new WeakMap();
function plantSwayBound(geo,material){
  const amp=Math.abs(material.uniforms.uSwayAmp.value),stiff=geo.getAttribute('aStiff');
  let entries=swayBounds.get(geo);if(!entries){entries=new Map();swayBounds.set(geo,entries);}
  if(entries.has(amp))return entries.get(amp);
  let max=0;if(stiff)for(let i=0;i<stiff.count;i++)max=Math.max(max,Math.abs(stiff.getX(i)));
  const bound=max*(2*amp+.10);entries.set(amp,bound);return bound;
}
function addInstanced(group, geo, mat, placements, name, opts = {}) {
  if (!placements.length) return null;
  const tiles = new Map();
  for (const p of placements) {
    const k = `${Math.floor(p.x / TILE)}_${Math.floor(p.z / TILE)}`;
    let arr = tiles.get(k);
    if (!arr) { arr = []; tiles.set(k, arr); }
    arr.push(p);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sv = new THREE.Vector3();
  const meshes = [];
  for (const [k, list] of tiles) {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    // Stable local shuffle distributes lower-quality instance budgets across
    // the tile instead of dropping the last authored colony wholesale. Does
    // not consume the world generator RNG or alter any placement.
    if (name.startsWith('coral_') || name.startsWith('feature_')) {
      const random = mulberry32([...name, ...k].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 2166136261));
      for (let i=list.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [list[i],list[j]]=[list[j],list[i]]; }
    }
    list.forEach((p, i) => {
      e.set(p.tilt || 0, p.rot, p.tilt2 || 0);
      q.setFromEuler(e);
      sv.set(p.sx, p.sy, p.sz);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, sv);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.name = `${name}_${k}`;
    inst.computeBoundingSphere();
    inst.userData.count = list.length;
    inst.userData.species = name;
    if(opts.lowGeometry){
      inst.userData.fullGeometry=geo;inst.userData.lowGeometry=opts.lowGeometry;
      // The low model has a slightly different silhouette. Conservative
      // enlarged bounds ensure a quality switch cannot cull its tips.
      if(inst.boundingSphere)inst.boundingSphere.radius*=1.18;
    }
    // Preserve the old range decision exactly, independently of the larger
    // shader-sway bounds used for conservative per-instance frustum culling.
    inst.userData.distanceSphere=inst.boundingSphere.clone();
    const triangles=(geo.index?geo.index.count:geo.attributes.position.count)/3;
    if(list.length>=3 && list.length*triangles>=5000){
      const variants=[{geometry:geo,margin:plantSwayBound(geo,mat)}];
      if(opts.lowGeometry)variants.push({geometry:opts.lowGeometry,margin:plantSwayBound(opts.lowGeometry,mat)});
      inst.userData.visibilityCompactor=new InstanceFrustumCompactor(inst,{variants});
    }
    group.add(inst);
    meshes.push(inst);
  }
  return meshes;
}

export function buildFlora(field, state, colliders = [], portals = []) {
  const group = new THREE.Group();
  group.name = 'flora';
  const L = (id) => LOCATIONS.find((l) => l.id === id);
  const stats = { kelp: 0, seagrass: 0, coral: 0 };

  // ---------------- species geometry --------------------------------------
  const KELP_H = { 0: [22, 34], 1: [16, 26], 2: [6, 10], 3: [2.4, 5] };
  const kelpHeights=[];
  const kelpGeo = [0, 1, 2, 3].map((sp) => {
    const variants = [];kelpHeights[sp]=[];
    for (let i = 0; i < 3; i++) {
      const height=lerp(KELP_H[sp][0], KELP_H[sp][1], rnd());kelpHeights[sp].push(height);
      variants.push(makeKelp(rnd, sp, height));
    }
    return variants;
  });
  // Independently seeded lower-poly geometry retains placement/density without
  // consuming the deterministic world generator sequence. Full geometry is
  // restored when leaving low quality.
  const kelpLow=kelpHeights.map((hs,sp)=>hs.map((height,i)=>makeKelp(mulberry32(57245+sp*101+i),sp,height,true)));
  const grassGeo = [0, 1, 2].map(() => makeSeagrass(rnd));
  const algaeGeo = [0, 1, 2].map(() => makePhoticAlgae(rnd));
  const coralGeo = {
    branching: [0, 1, 2].map(() => makeBranchingCoral(rnd)),
    elkhorn: [0,1].map(i=>makeElkhornCoral(mulberry32(62011+i))),
    pillar: [0,1].map(i=>makePillarCoral(mulberry32(62131+i))),
    // Independent seed preserves all pre-existing ecology placement sequences.
    foliose: [makeFolioseCoral(mulberry32(80817))],
    table: [0, 1].map(() => makeTableCoral(rnd)),
    fan: [0, 1, 2].map(() => makeFanCoral(rnd)),
    massive: [0, 1].map(() => makeMassiveCoral(rnd)),
    sponge: [0, 1].map(() => makeTubeSponge(rnd)),
    barrel: [0,1].map(i=>makeBarrelSponge(mulberry32(62251+i))),
    anemone: [0,1].map(i=>makeAnemone(mulberry32(62371+i))),
    seapen: [0,1].map(i=>makeSeaPen(mulberry32(62491+i))),
    encrusting: [0, 1].map(() => makeEncrusting(rnd)),
  };

  const branchLow=[0,1,2].map(i=>makeBranchingCoral(mulberry32(91813+i),true));

  // ---------------- materials ---------------------------------------------
  // Kelp is OLIVE-GOLD, not emerald: in real water the browns read as bronze and
  // the greens as jade. Four species, four palettes, all in the same family.
  const kelpMats = [
    plantMaterial({ colorA: [0.150, 0.170, 0.048], colorB: [0.560, 0.470, 0.130], sway: 1.15, translucent: 1.10, spec: 0.30 }),
    plantMaterial({ colorA: [0.180, 0.160, 0.055], colorB: [0.640, 0.500, 0.140], sway: 1.35, translucent: 1.20, spec: 0.26 }),
    plantMaterial({ colorA: [0.120, 0.185, 0.070], colorB: [0.430, 0.560, 0.190], sway: 0.85, translucent: 1.00, spec: 0.20 }),
    plantMaterial({ colorA: [0.160, 0.180, 0.070], colorB: [0.480, 0.480, 0.170], sway: 0.55, translucent: 0.75, spec: 0.16 }),
  ];
  const grassMat = plantMaterial({
    colorA: [0.130, 0.290, 0.110], colorB: [0.360, 0.490, 0.180],
    sway: 0.45, translucent: 0.9, spec: 0.12,
  });
  // Algae tufts carry their own thin tissue; no kelp-blade map is needed at
  // this scale — the blades are small enough that procedural tissue reads fine.
  const algaeMat = plantMaterial({
    colorA: [0.550, 0.140, 0.160], colorB: [0.190, 0.420, 0.200],
    sway: 0.35, translucent: 0.85, spec: 0.10,
  });
  // coral palettes: warm reef families, cool deep families
  const coralMats = {
    rose: plantMaterial({ colorA: [0.510, 0.075, 0.125], colorB: [0.950, 0.300, 0.315], coral: true, sway: 0.05, spec: 0.14, translucent: 0.25 }),
    amber: plantMaterial({ colorA: [0.560, 0.245, 0.065], colorB: [1.000, 0.650, 0.205], coral: true, sway: 0.06, spec: 0.14, translucent: 0.3 }),
    violet: plantMaterial({ colorA: [0.330, 0.105, 0.390], colorB: [0.720, 0.330, 0.760], coral: true, sway: 0.05, spec: 0.12, translucent: 0.3 }),
    teal: plantMaterial({ colorA: [0.055, 0.315, 0.300], colorB: [0.180, 0.700, 0.550], coral: true, sway: 0.04, spec: 0.12, translucent: 0.25 }),
    bone: plantMaterial({ colorA: [0.470, 0.415, 0.315], colorB: [0.920, 0.815, 0.625], coral: true, sway: 0.03, spec: 0.10, translucent: 0.15 }),
    deep: plantMaterial({ colorA: [0.210, 0.135, 0.165], colorB: [0.400, 0.235, 0.280], coral: true, sway: 0.03, spec: 0.10, translucent: 0.2 }),
    coldPale: plantMaterial({ colorA: [0.30, 0.37, 0.39], colorB: [0.65, 0.68, 0.61], coral: true, sway: 0.06, spec: 0.08, translucent: 0.16 }),
    coldRust: plantMaterial({ colorA: [0.32, 0.18, 0.13], colorB: [0.62, 0.37, 0.23], coral: true, sway: 0.045, spec: 0.08, translucent: 0.16 }),
  };

  // ---------------- KELP FORESTS ------------------------------------------
  // authored beds: the forest exists where the art direction says it does
  const KELP_BEDS = [
    // Z3 is THE kelp place: a dense, walkable forest, not a world-wide sprinkle
    { loc: 'verdant', rx: 155, rz: 140, n: 2400, species: [0, 0, 0, 1, 2], scale: [0.8, 1.35] },
    // Z1 and Z2 carry a little kelp at their edges, so the shelf has depth
    { loc: 'glasshorizon', rx: 190, rz: 150, n: 420, species: [3, 2], scale: [0.7, 1.1] },
    // no kelp on the deep monuments: a 20 m stipe at 110 m depth reads as a
    // bare stick, and bare sticks are exactly the "unfinished" tell
  ];

  const kelpBuckets = kelpGeo.map((sp) => sp.map(() => []));
  for (const bed of KELP_BEDS) {
    const l = L(bed.loc);
    if (!l) continue;
    let placed = 0, guard = 0;
    while (placed < bed.n && guard < bed.n * 12) {
      guard++;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      const x = l.x + Math.cos(a) * bed.rx * r;
      const z = l.z + Math.sin(a) * bed.rz * r;
      const y = field.surfaceHeightAt(x, z);
      const depth = -y;
      if (depth < 2 || depth > 120) continue;
      // kelp needs rock or firm ground, and cannot grow inside a wall
      const steep = field.steepness(x, z);
      if (steep > 0.70) continue;
      // clearings: the forest has lanes and glades, not a uniform carpet
      const clear = 0.5 + 0.5 * fbm2(x * 0.0045 + 12.3, z * 0.0045 - 6.1, 3);
      if (clear < 0.40) continue;
      const sp = bed.species[Math.floor(rnd() * bed.species.length)];
      const varI = Math.floor(rnd() * kelpGeo[sp].length);
      // geometry is already in metres, so this is a modest size variation only
      const k = (bed.scale?.[0] ?? 0.8) + rnd() * ((bed.scale?.[1] ?? 1.3) - (bed.scale?.[0] ?? 0.8));
      kelpBuckets[sp][varI].push({
        x, y: y - 0.15, z, rot: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.10,
        sx: k * (0.92 + rnd() * 0.16), sy: k * (0.85 + rnd() * 0.4), sz: k * (0.92 + rnd() * 0.16),
      });
      placed++;
    }
    stats.kelp += placed;
  }
  kelpBuckets.forEach((variants, sp) => {
    variants.forEach((list, i) => {
      addInstanced(group, kelpGeo[sp][i], kelpMats[sp], list, `kelp_${sp}_${i}`, {lowGeometry:kelpLow[sp][i]});
    });
  });

  // ---------------- SEAGRASS MEADOWS --------------------------------------
  const GRASS_BEDS = [
    { loc: 'glasshorizon', rx: 210, rz: 170, n: 4200 },
    { loc: 'roseglass', rx: 180, rz: 150, n: 1500 },
    { loc: 'verdant', rx: 160, rz: 140, n: 900 },
    { loc: 'floodednave', rx: 170, rz: 150, n: 500 },
  ];

  const grassBuckets = grassGeo.map(() => []);
  for (const bed of GRASS_BEDS) {
    const l = L(bed.loc);
    if (!l) continue;
    let placed = 0, guard = 0;
    while (placed < bed.n && guard < bed.n * 12) {
      guard++;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = l.x + Math.cos(a) * bed.rx * r;
      const z = l.z + Math.sin(a) * bed.rz * r;
      const y = field.surfaceHeightAt(x, z);
      const depth = -y;
      if (depth < 2 || depth > 60) continue;
      const steep = field.steepness(x, z);
      if (steep > 0.30) continue;          // grass grows on sand, not cliffs
      const patch = 0.5 + 0.5 * fbm2(x * 0.012 + 4.4, z * 0.012 - 8.8, 3);
      if (patch < 0.46) continue;          // irregular meadows, open sand between
      const v = Math.floor(rnd() * grassGeo.length);
      const sc = 0.8 + rnd() * 0.6;
      grassBuckets[v].push({
        x, y: y - 0.05, z, rot: rnd() * 6.28, tilt: 0,
        sx: sc, sy: sc * (0.8 + rnd() * 0.6), sz: sc,
      });
      placed++;
    }
    stats.seagrass += placed;
  }
  grassBuckets.forEach((list, i) => addInstanced(group, grassGeo[i], grassMat, list, `seagrass_${i}`));

  // ---------------- PHOTIC-ZONE ALGAE -------------------------------------
  // Short red and green algae clinging to shallow rock shelves (2–20 m),
  // beside the seagrass meadows. Real photic life: light reaches the bottom,
  // so the substrate carries a colour layer, not bare sand.
  const ALGAE_BEDS = [
    { loc: 'glasshorizon', rx: 200, rz: 160, n: 1600 },
    { loc: 'roseglass', rx: 170, rz: 140, n: 900 },
    { loc: 'verdant', rx: 140, rz: 120, n: 500 },
  ];
  const algaeBuckets = algaeGeo.map(() => []);
  for (const bed of ALGAE_BEDS) {
    const l = L(bed.loc);
    if (!l) continue;
    let placed = 0, guard = 0;
    while (placed < bed.n && guard < bed.n * 12) {
      guard++;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = l.x + Math.cos(a) * bed.rx * r;
      const z = l.z + Math.sin(a) * bed.rz * r;
      const y = field.surfaceHeightAt(x, z);
      const depth = -y;
      if (depth < 2 || depth > 20) continue;
      // algae needs light and something to hold to: flatter rock or sand
      if (field.steepness(x, z) > 0.45) continue;
      const patch = 0.5 + 0.5 * fbm2(x * 0.016 + 9.1, z * 0.016 - 7.4, 3);
      if (patch < 0.50) continue;
      const v = Math.floor(rnd() * algaeGeo.length);
      const sc = 0.6 + rnd() * 0.8;
      algaeBuckets[v].push({
        x, y: y - 0.02, z, rot: rnd() * 6.28, tilt: 0,
        sx: sc, sy: sc * (0.7 + rnd() * 0.8), sz: sc,
      });
      placed++;
    }
    stats.algae = (stats.algae || 0) + placed;
  }
  algaeBuckets.forEach((list, i) => addInstanced(group, algaeGeo[i], algaeMat, list, `algae_${i}`));

  // ---------------- CORAL GARDENS -----------------------------------------
  // Depth-zoned: tables and branching dominate the shallows, fans and sponges
  // the mid reef, encrusting mats and deep fans the cold water below 60 m.
  const CORAL_ZONES = [
    // Z2 · Roseglass Reef — the coral place. Everything else is a fraction of it.
    // Roseglass final coral is supplied by specimen scans; reject the old
    // procedural tube library visible in the reference screenshots.
    { loc: 'roseglass', rx: 185, rz: 160, n: 0, palette: ['rose', 'amber', 'violet', 'teal'] },
    // a shoulder of reef spilling into Z1 and Z3
    // Glass Horizon uses specimen-derived scan colonies; the former procedural
    // branch field is intentionally absent because it read as plastic trees.
    { loc: 'glasshorizon', rx: 190, rz: 150, n: 0, palette: ['amber', 'bone', 'rose'] },
    { loc: 'verdant', rx: 165, rz: 140, n: 700, palette: ['teal', 'bone', 'violet'] },
    // cold, sparse colonies on the monuments and the abyss rim
    { loc: 'aurel', rx: 200, rz: 170, n: 800, palette: ['bone', 'deep', 'violet'] },
    { loc: 'azurespan', rx: 190, rz: 160, n: 600, palette: ['deep', 'bone'] },
    { loc: 'floodednave', rx: 175, rz: 155, n: 700, palette: ['teal', 'deep'] },
    { loc: 'abyssalbowl', rx: 200, rz: 175, n: 260, palette: ['deep'] },
  ];

  const coralBuckets = {};
  const addCoral = (kind, varI, pal, p) => {
    (coralBuckets[kind] ||= {});
    const key = `${pal}|${varI}`;
    (coralBuckets[kind][key] ||= []).push(p);
  };
  // ambient reef scatter: fills the sand between the authored gardens, but only
  // inside the two photic arenas — the abyss has no coral and no business having
  // any
  const SCATTER = [


    { loc: 'verdant', rx: 190, rz: 170, tries: 5000 },
  ];
  for (const sc of SCATTER) {
    const l = L(sc.loc);
    if (!l) continue;
    for (let i = 0; i < sc.tries; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = l.x + Math.cos(a) * sc.rx * r;
      const z = l.z + Math.sin(a) * sc.rz * r;
      const y = field.surfaceHeightAt(x, z);
      const depth = -y;
      if (depth < 3 || depth > 60) continue;
      const steep = field.steepness(x, z);
      const zoneNoise = 0.5 + 0.5 * fbm2(x * 0.010 + 7.7, z * 0.010 - 3.3, 3);
      if (zoneNoise < 0.46) continue;
      const density = clamp(0.22 + steep * 2.0, 0, 0.92);
      if (rnd() > density) continue;
      const kind = steep > 0.4 ? (rnd() > 0.5 ? 'fan' : 'encrusting')
        : (rnd() > 0.6 ? 'branching' : rnd() > 0.32 ? 'table' : 'massive');
      const pal = sc.loc === 'roseglass'
        ? ['rose', 'amber', 'violet', 'teal'][Math.floor(rnd() * 4)]
        : ['amber', 'bone', 'teal'][Math.floor(rnd() * 3)];
      const scl = 0.55 + rnd() * 0.7;
      addCoral(kind, Math.floor(rnd() * coralGeo[kind].length), pal, {
        x, y: y + 0.02, z, rot: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.22,
        sx: scl, sy: scl * (0.8 + rnd() * 0.5), sz: scl,
      });
      stats.coral++;
    }
  }

  for (const zone of CORAL_ZONES) {
    const l = L(zone.loc);
    if (!l) continue;
    let placed = 0, guard = 0;
    while (placed < zone.n && guard < zone.n * 14) {
      guard++;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = l.x + Math.cos(a) * zone.rx * r;
      const z = l.z + Math.sin(a) * zone.rz * r;
      const y = field.surfaceHeightAt(x, z);
      const depth = -y;
      if (depth < 2 || depth > 240) continue;
      const steep = field.steepness(x, z);
      // coral attaches to rock: steeper ground holds more of it
      const colony = 0.5 + 0.5 * fbm2(x * 0.028 + 21.7, z * 0.028 - 11.1, 3);
      const density = clamp(0.42 + steep * 1.8, 0, 1.0) * clamp((colony - 0.26) * 3.0, 0, 1);
      if (rnd() > density) continue;
      // depth zonation of families
      let kind;
      const roll = rnd() + (depth > 70 ? 0.45 : 0) + (steep > 0.35 ? -0.25 : 0.1);
      if (steep > 0.42) kind = roll > 0.62 ? 'fan' : roll > 0.34 ? 'encrusting' : 'sponge';
      else if (depth < 24) kind = roll > 0.72 ? 'elkhorn' : roll > 0.48 ? 'branching' : roll > 0.27 ? 'pillar' : 'massive';
      else if (depth < 70) kind = roll > 0.62 ? 'branching' : roll > 0.34 ? 'massive' : roll > 0.18 ? 'fan' : 'encrusting';
      else kind = roll > 0.55 ? 'fan' : roll > 0.3 ? 'sponge' : 'encrusting';
      const geos = coralGeo[kind];
      const varI = Math.floor(rnd() * geos.length);
      const pal = zone.palette[Math.floor(rnd() * zone.palette.length)];
      const sc = kind === 'fan' ? 0.85 + rnd() * 0.9 : kind === 'table' ? 0.65 + rnd() * 0.5 : 0.55 + rnd() * 0.6;
      addCoral(kind, varI, pal, {
        x, y: y + 0.02, z, rot: rnd() * 6.28,
        tilt: steep > 0.3 ? (rnd() - 0.5) * 0.5 : (rnd() - 0.5) * 0.12,
        tilt2: (rnd() - 0.5) * 0.3,
        sx: sc * (0.85 + rnd() * 0.3), sy: sc * (0.75 + rnd() * 0.5), sz: sc * (0.85 + rnd() * 0.3),
      });
      placed++;
      stats.coral++;
    }
  }

  // ---------------- GLASS HORIZON HERO REEF -------------------------------
  // Overlapping coral-covered mounds replace the uniform field of isolated
  // sticks in the arrival view. The open centre remains a readable swim route.
  const heroRng=mulberry32(741903);
  // Replaced by the authored specimen-scan colonies in reef-scan-plan.js.
  const heroAnchors=[];
  const heroKinds=['massive','branching','elkhorn','pillar','table','foliose','fan','sponge','encrusting'];
  const heroPalettes=['bone','rose','amber','violet','teal'];
  for(const [cx,cz] of heroAnchors){
    const moundRadius=10+heroRng()*8,dominant=heroPalettes[Math.floor(heroRng()*heroPalettes.length)];
    for(let i=0;i<76;i++){
      const a=heroRng()*Math.PI*2,r=Math.pow(heroRng(),.68)*moundRadius;
      const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=field.surfaceHeightAt(x,z);
      if(!Number.isFinite(y)||-y<2||-y>34)continue;
      const kind=heroKinds[Math.floor(heroRng()*heroKinds.length)],geos=coralGeo[kind];
      const centre=1-r/moundRadius,sc=(.72+heroRng()*1.05)*(1+centre*.65);
      const pal=heroRng()<.66?dominant:heroPalettes[Math.floor(heroRng()*heroPalettes.length)];
      addCoral(kind,Math.floor(heroRng()*geos.length),pal,{
        x,y:y+.02,z,rot:heroRng()*6.283,tilt:(heroRng()-.5)*.25,tilt2:(heroRng()-.5)*.22,
        sx:sc*(.82+heroRng()*.38),sy:sc*(.76+heroRng()*.62),sz:sc*(.82+heroRng()*.38)
      });stats.coral++;
    }
  }

  // ---------------- SPECIALIST BENTHIC GUILDS -----------------------------
  // Substrate/depth-specific animals: reef and cave sponges/anemones remain on
  // hard shallower ground; sea pens occupy deep sediment, never tropical reef.
  const guildRng=mulberry32(519733);
  const GUILDS=[


    {loc:'verdant',kinds:['anemone','barrel'],n:100,r:150,min:12,max:72,pal:['teal','bone']},
    {loc:'floodednave',kinds:['barrel','sponge','anemone'],n:170,r:145,min:90,max:360,pal:['teal','deep','bone']},
    {loc:'azurespan',kinds:['seapen','barrel'],n:130,r:170,min:150,max:470,pal:['deep','bone']},
    {loc:'abyssalbowl',kinds:['seapen','barrel'],n:190,r:190,min:300,max:760,pal:['deep','coldPale']}
  ];
  for(const zone of GUILDS){
    const l=L(zone.loc);if(!l)continue;
    for(let tries=0,placed=0;tries<zone.n*12&&placed<zone.n;tries++){
      const a=guildRng()*6.283,r=Math.sqrt(guildRng())*zone.r;
      const x=l.x+Math.cos(a)*r,z=l.z+Math.sin(a)*r,y=field.surfaceHeightAt(x,z),depth=-y;
      if(!Number.isFinite(y)||depth<zone.min||depth>zone.max)continue;
      const steep=field.steepness(x,z),kind=zone.kinds[Math.floor(guildRng()*zone.kinds.length)];
      if(kind==='seapen'&&steep>.22)continue;
      if(kind!=='seapen'&&steep>.72)continue;
      const sc=kind==='seapen'?.75+guildRng()*.75:.65+guildRng()*1.0;
      const pal=zone.pal[Math.floor(guildRng()*zone.pal.length)],geos=coralGeo[kind];
      addCoral(kind,Math.floor(guildRng()*geos.length),pal,{x,y:y+.015,z,rot:guildRng()*6.283,
        tilt:kind==='seapen'?(guildRng()-.5)*.10:(guildRng()-.5)*.28,sx:sc,sy:sc*(.8+guildRng()*.5),sz:sc});
      placed++;stats.coral++;
    }
  }

  // ---------------- COLONY CLUSTERS ---------------------------------------
  // Uniform scatter is what makes a reef read as "confetti on sand". Real reefs
  // are CLUMPS: a head of branching coral with tables around it, sponge under
  // the overhang, then bare sand. These clusters are the visible reef structure.
  const CLUSTERS = [


    { loc: 'verdant', heads: 22, r: [7, 20], per: [12, 30] },
    { loc: 'aurel', heads: 18, r: [8, 22], per: [10, 24] },
    { loc: 'azurespan', heads: 14, r: [8, 20], per: [8, 20] },
    { loc: 'floodednave', heads: 16, r: [8, 22], per: [10, 22] },
    { loc: 'abyssalbowl', heads: 10, r: [10, 26], per: [6, 14] },
  ];
  for (const cl of CLUSTERS) {
    const l = L(cl.loc);
    if (!l) continue;
    const pal = (l.region === 'reef' || l.id === 'roseglass')
      ? ['rose', 'amber', 'violet', 'teal'] : ['bone', 'deep', 'teal', 'amber'];
    for (let h = 0; h < cl.heads; h++) {
      const a0 = rnd() * Math.PI * 2, r0 = Math.sqrt(rnd()) * 170;
      const cx = l.x + Math.cos(a0) * r0, cz = l.z + Math.sin(a0) * r0;
      const cr = lerp(cl.r[0], cl.r[1], rnd());
      const n = Math.round(lerp(cl.per[0], cl.per[1], rnd()));
      // one palette family per head: a single species dominates each colony
      const headPal = pal[Math.floor(rnd() * pal.length)];
      for (let i = 0; i < n; i++) {
        const aa = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * cr;
        const x = cx + Math.cos(aa) * rr, z = cz + Math.sin(aa) * rr;
        const y = field.surfaceHeightAt(x, z);
        const depth = -y;
        if (depth < 2 || depth > 240) continue;
        const steep = field.steepness(x, z);
        let kind;
        const roll = rnd() + (depth > 70 ? 0.4 : 0) + (steep > 0.35 ? -0.2 : 0.12);
        if (steep > 0.42) kind = roll > 0.6 ? 'fan' : roll > 0.32 ? 'encrusting' : 'sponge';
        else if (depth < 24) kind = roll > 0.70 ? 'elkhorn' : roll > 0.46 ? 'branching' : roll > 0.25 ? 'pillar' : 'massive';
        else if (depth < 70) kind = roll > 0.58 ? 'branching' : roll > 0.34 ? 'massive' : roll > 0.18 ? 'fan' : 'encrusting';
        else kind = roll > 0.52 ? 'fan' : roll > 0.28 ? 'sponge' : 'encrusting';
        const geos = coralGeo[kind];
        const usePal = rnd() < 0.72 ? headPal : pal[Math.floor(rnd() * pal.length)];
        const sc = (kind === 'fan' ? 0.8 + rnd() * 0.8 : kind === 'table' ? 0.7 + rnd() * 0.5 : 0.55 + rnd() * 0.55)
                 * (0.7 + 0.5 * (1 - rr / Math.max(cr, 0.001)));
        addCoral(kind, Math.floor(rnd() * geos.length), usePal, {
          x, y: y + 0.02, z, rot: rnd() * 6.28,
          tilt: (rnd() - 0.5) * 0.24, tilt2: (rnd() - 0.5) * 0.3,
          sx: sc * (0.85 + rnd() * 0.3), sy: sc * (0.8 + rnd() * 0.45), sz: sc * (0.85 + rnd() * 0.3),
        });
        stats.coral++;
      }
    }
  }

  // Cold-water coral and sponge groves: unlike the light-dependent reef
  // colonies above, deep octocoral-like fans do not require photosynthesis.
  // Four sparse authored clusters leave open swimming space in the basin.
  // These reuse existing geometry; they are not newly modelled named species.
  const coldRng = mulberry32(281953);
  const coldAnchors = [[-115,-635],[-75,-675],[50,-725],[115,-760]];
  const coldPlacements = [];
  for (const [cx,cz] of coldAnchors) {
    for(let tries=0, placed=0;tries<400 && placed<44;tries++) {
      const a=coldRng()*Math.PI*2, r=Math.sqrt(coldRng())*26;
      const x=cx+Math.cos(a)*r, z=cz+Math.sin(a)*r;
      const y=field.surfaceHeightAt(x,z), steep=field.steepness(x,z);
      if(y > -260 || y < -690 || steep > .68)continue;
      const kind=coldRng()<.78?'fan':'sponge';
      const size=kind==='fan'?1.7+coldRng()*1.4:1.15+coldRng()*.8;
      const pal=coldRng()<.68?'coldPale':'coldRust';
      const scaleY=size*(.85+coldRng()*.35);
      addCoral(kind,Math.floor(coldRng()*coralGeo[kind].length),pal,{
        x,y:y+.015,z,rot:coldRng()*Math.PI*2,tilt:(coldRng()-.5)*.18,
        sx:size,sy:scaleY,sz:size,
      });
      coldPlacements.push({x,y,z,kind});placed++;stats.coral++;
    }
  }
  stats.coldCoral = coldPlacements.length;
  group.userData.coldCoralPlacements = coldPlacements;

  // Sheltered and twilight-zone filter feeders: independent of sunlight and
  // deliberately grouped in patches rather than filling every metre of sand.
  const twilightRng=mulberry32(271284);
  const twilightZones=[
    {id:'aurel',anchors:[[105,45],[65,35],[25,15]],depth:[75,175]},
    {id:'azurespan',anchors:[[-590,-430],[-535,-390],[-480,-340]],depth:[145,280]},
    {id:'floodednave',anchors:[[425,-310],[475,-345],[535,-395]],depth:[55,130]},
  ];
  const twilightPlacements=[];
  for(const zone of twilightZones)for(const [cx,cz] of zone.anchors){
    for(let tries=0,placed=0;tries<250&&placed<32;tries++){
      const a=twilightRng()*Math.PI*2,r=Math.sqrt(twilightRng())*18;
      const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=field.surfaceHeightAt(x,z);
      if(-y<zone.depth[0]||-y>zone.depth[1]||field.steepness(x,z)>.6)continue;
      const kind=twilightRng()<.72?'fan':'sponge';
      const size=kind==='fan'?1.45+twilightRng()*1.1:1.1+twilightRng()*.8;
      const pal=twilightRng()<.70?'coldPale':'coldRust';
      addCoral(kind,Math.floor(twilightRng()*coralGeo[kind].length),pal,{
        x,y:y-.04,z,rot:twilightRng()*Math.PI*2,tilt:(twilightRng()-.5)*.12,
        sx:size,sy:size*(.85+twilightRng()*.3),sz:size,
      });
      twilightPlacements.push({id:zone.id,x,y,z,kind});placed++;stats.coral++;
    }
  }
  stats.twilightCoral=twilightPlacements.length;
  group.userData.twilightCoralPlacements=twilightPlacements;

  for (const [kind, byKey] of Object.entries(coralBuckets)) {
    for (const [key, list] of Object.entries(byKey)) {
      const [pal, vi] = key.split('|');
      const geo = coralGeo[kind][+vi];
      const mat = coralMats[pal] || coralMats.rose;
      addInstanced(group, geo, mat, list, `coral_${kind}_${pal}_${vi}`, kind==='branching'?{lowGeometry:branchLow[vi]}:{});
    }
  }

  // Composed habitat gardens beside the existing approaches. These instances
  // are separately budgeted so low quality does not erase the local landmarks.
  const featurePlan=planFeatureGardens(field,portals,colliders);
  const featureBuckets={};
  for(const p of featurePlan.placements){
    if(p.id==='glasshorizon'||p.id==='roseglass')continue;
    const key=p.kind+'|'+p.pal;(featureBuckets[key] ||= []).push({
      x:p.x,y:p.y-.08,z:p.z,rot:p.rot,tilt:0,tilt2:0,
      sx:p.scale,sy:p.scale,sz:p.scale,
    });
  }
  for(const [key,list] of Object.entries(featureBuckets)){
    const [kind,pal]=key.split('|');
    addInstanced(group,coralGeo[kind][0],coralMats[pal],list,`feature_${kind}_${pal}`,kind==='branching'?{lowGeometry:branchLow[0]}:{});
  }
  group.userData.featureGardenPlacements=featurePlan.placements;
  group.userData.featureGardenSites=featurePlan.sites;
  stats.featureGardens=featurePlan.placements.length;

  // ---------------- runtime hooks -----------------------------------------
  group.userData.stats = stats;
  group.userData.materials = { kelpMats, grassMat, coralMats };
  // Preserve every placement, but avoid submitting distant habitat tiles that
  // are behind the underwater haze. Bounds include all tile instances, so a
  // nearby plant is never culled merely because its tile centre is distant.
  const tiles = group.children.filter(o => o.isInstancedMesh),view=new InstanceFrustumView();
  let quality = state.quality,instanceCulling=true;
  group.userData.setQuality = (q) => {
    quality = q;
    // Reversible instance-density LOD. Full authored populations remain in
    // the source buffer and are restored on the complete-world presets without regenerating.
    for (const tile of tiles) {
      const branching = tile.userData.species.startsWith('coral_branching');
      const coral = tile.userData.species.startsWith('coral_');
      const kelp = tile.userData.species.startsWith('kelp_');
      const feature=tile.userData.species.startsWith('feature_');
      // Software rendering cannot sustain the former 58–90% instance density.
      // Keep representative silhouettes while preventing destination-entry spikes.
      const fraction = q === 'low' ? (feature ? .42 : branching ? .20 : coral ? .18 : kelp ? .28 : .22)
        : q === 'medium' ? (branching ? .72 : .86) : 1;
      if(tile.userData.lowGeometry) tile.geometry = q==='low' ? tile.userData.lowGeometry : tile.userData.fullGeometry;
      const selected=Math.max(1, Math.ceil(tile.userData.count * fraction));
      tile.userData.qualityCount=selected;
      if(tile.userData.visibilityCompactor)tile.userData.visibilityCompactor.select(selected);
      else tile.count=selected;
    }
    view.invalidate();
  };
  // Diagnostic toggle is also useful as a safe fallback on unusual hardware.
  group.userData.setInstanceCulling = (on=true) => {
    instanceCulling=!!on;view.invalidate();
    if(!instanceCulling)for(const tile of tiles)tile.userData.visibilityCompactor?.restore();
  };
  group.userData.setQuality(quality);
  const cullPos=new THREE.Vector3(Infinity,Infinity,Infinity),cullQuat=new THREE.Quaternion();
  let cullQueue=[],cullCursor=0;
  group.userData.update = (dt, time, camera) => {
    const range = quality === 'medium' ? 220 : 320;
    const moved=cullPos.distanceToSquared(camera.position);
    const cameraQuat=camera.quaternion;
    const turned=cameraQuat?1-Math.abs(cullQuat.dot(cameraQuat)):0;
    // The former implementation compacted every nearby instance buffer on every
    // camera frame. A portal jump therefore copied and uploaded many large
    // matrices at once. Snapshot a view only after meaningful movement, then
    // amortize at most four buffers per frame.
    const urgent=moved>2500;
    if(instanceCulling&&camera.isCamera&&(urgent||((cullCursor>=cullQueue.length)&&(moved>9||turned>.0012)))){
      view.update(camera);cullPos.copy(camera.position);if(cameraQuat)cullQuat.copy(cameraQuat);
      cullQueue=[];cullCursor=0;
      for(const tile of tiles){
        const sphere=tile.userData.distanceSphere||tile.boundingSphere;
        const limit=range+(sphere?sphere.radius:0);
        const near=!sphere||sphere.center.distanceToSquared(camera.position)<=limit*limit;
        if(near&&tile.userData.visibilityCompactor&&view.frustum.intersectsObject(tile))cullQueue.push(tile);
      }
    }
    let budget=4;
    while(budget--&&cullCursor<cullQueue.length)cullQueue[cullCursor++].userData.visibilityCompactor.compact(view.frustum);
    for (const tile of tiles) {
      const sphere = tile.userData.distanceSphere || tile.boundingSphere;
      const limit = range + (sphere ? sphere.radius : 0);
      const near = !sphere || sphere.center.distanceToSquared(camera.position) <= limit * limit;
      tile.visible = near && tile.count>0;
    }
  };
  return group;
}
