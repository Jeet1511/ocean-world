// -----------------------------------------------------------------------------
// THE LIVING ABYSS — the dolphin
// A 2.4 m bottlenose body built from spine rings: melon, rostrum, dorsal fin,
// pectoral flippers and a two-lobed fluke. Swimming is a travelling wave along
// the spine driven by real velocity and turn rate, plus fin and fluke motion.
// Third-person camera is spring-followed and terrain-aware.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';

const DOLPHIN_VS = /* glsl */`
uniform float uPhase;
uniform float uUndulate;
uniform float uBank;
uniform float uFlipper;
attribute float aS;        // 0 = nose, 1 = fluke
attribute float aPart;     // 0 body, 1 dorsal, 2 flipperL, 3 flipperR, 4 fluke
varying vec3 vWorld;
varying vec3 vNrm;
varying float vS;
varying float vPart;

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }

void main(){
  vec3 p = position;
  vec3 n = normal;

  // --- travelling wave down the spine (lateral, +z) ---
  float amp = uUndulate * pow(clamp(aS, 0.0, 1.0), 1.7);
  float wave = sin(clamp(aS, 0.0, 1.0) * 5.4 - uPhase);
  p.z += wave * amp;
  n.z += wave * amp * 0.35;

  // --- fluke: pitch about its own root ---
  if (aPart > 3.5) {
    float ang = sin(-uPhase + 1.1) * 0.55 * (0.35 + uUndulate);
    vec2 d = vec2(p.x + 0.95, p.y);
    p.x = -0.95 + d.x * cos(ang) - d.y * sin(ang);
    p.y = d.x * sin(ang) + d.y * cos(ang);
    n = rotZ(ang) * n;
  }
  // --- pectoral flippers: walking beat + steering ---
  else if (aPart > 1.5 && aPart < 3.5) {
    float side = (aPart > 2.5) ? -1.0 : 1.0;
    float beat = sin(uPhase * 0.85 + side * 1.6) * uFlipper;
    float ang = side * (0.22 + 0.30 * beat) + uBank * 0.35 * side;
    p.y = p.y * cos(ang) - p.z * side * sin(ang);
    p.z = side * (p.y * 0.0) + p.z * cos(ang) + p.y * sin(ang) * side;
    n = rotX(ang * side) * n;
  }

  // --- whole body banks into turns ---
  p = rotX(uBank) * p;
  n = rotX(uBank) * n;

  vec3 lp = p;
  vec4 wp = modelMatrix * vec4(lp, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * n);
  vS = aS;
  vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DOLPHIN_FS = GLSL_MEDIUM + GLSL_LIGHT + /* glsl */`
uniform vec3 uDorsal;
uniform vec3 uBelly;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vS;
varying float vPart;

void main(){
  vec3 N = normalize(vNrm);
  if (!gl_FrontFacing) N = -N;

  // counter-shaded hide: dark above, pale below, hard-ish transition
  float up = smoothstep(-0.32, 0.22, N.y);
  vec3 albedo = mix(uBelly, uDorsal, up);
  // subtle mottling along the flank
  albedo *= 0.94 + 0.10 * smoothstep(0.15, 0.75, vS);

  vec3 sun = sunlightAt(vWorld.y);
  float ndl = clamp(dot(N, uSunDir), 0.0, 1.0);
  vec3 amb = ambientLight(vWorld.y) * 0.9 * (0.5 + 0.5 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = albedo * (sun * (ndl * 0.9 + 0.14) + amb * 1.15);

  // wet, rubbery highlight
  vec3 V = normalize(uCamPos - vWorld);
  vec3 H = normalize(uSunDir + V);
  float nh = clamp(dot(N, H), 0.0, 1.0);
  float spec = pow(nh, 90.0) * 1.6 + pow(nh, 12.0) * 0.22;
  col += sun * spec * 0.55;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  col += waterAmbient(vWorld.y) * fres * 0.5;

  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

function buildDolphinGeometry() {
  const pos = [], nrm = [], aS = [], aPart = [];
  const idx = [];
  const RINGS = 44, RADIAL = 18;
  const LEN = 2.45;

  // spine profile: melon -> shoulders -> peduncle
  const profile = (s) => {
    // s: 0 nose .. 1 fluke root
    if (s < 0.06) {
      const t = s / 0.06;
      return { r: 0.035 + 0.075 * Math.sin(t * Math.PI * 0.5), w: 1.0, h: 1.0, y: 0.02 };
    }
    if (s < 0.2) {
      const t = (s - 0.06) / 0.14;
      return { r: 0.10 + 0.115 * Math.sin(t * Math.PI * 0.75), w: 1.0, h: 1.06, y: -0.01 + t * 0.0 };
    }
    if (s < 0.45) {
      const t = (s - 0.2) / 0.25;
      return { r: 0.215 - 0.02 * t, w: 1.0, h: 1.02, y: 0 };
    }
    if (s < 0.75) {
      const t = (s - 0.45) / 0.30;
      return { r: 0.195 * (1 - t * 0.55), w: 0.80 - 0.15 * t, h: 1.30 + 0.25 * t, y: 0.01 };
    }
    const t = (s - 0.75) / 0.25;
    return { r: 0.087 * (1 - t * 0.72), w: 0.55 - 0.2 * t, h: 1.9 + 0.7 * t, y: 0.02 };
  };

  const ringIndex = [];
  for (let i = 0; i <= RINGS; i++) {
    const s = i / RINGS;
    const pr = profile(s);
    const x = (0.5 - s) * LEN;             // nose at +x
    ringIndex.push(pos.length / 3);
    for (let j = 0; j <= RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // superellipse cross-section: slightly flat belly, keeled back
      const e = 1.35;
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
      const yy = sy * pr.r * pr.h + pr.y;
      const zz = sx * pr.r * pr.w;
      pos.push(x, yy, zz);
      nrm.push(0, sy, sx);
      aS.push(s);
      aPart.push(0);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = ringIndex[i] + j, b = a + 1;
      const c = ringIndex[i + 1] + j, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // ---- dorsal fin ----
  const addFin = (part, verts, tris, sVal) => {
    const base = pos.length / 3;
    for (const v of verts) {
      pos.push(v[0], v[1], v[2]);
      nrm.push(v[3] ?? 0, v[4] ?? 1, v[5] ?? 0);
      aS.push(sVal);
      aPart.push(part);
    }
    for (const t of tris) idx.push(base + t[0], base + t[1], base + t[2]);
  };

  // dorsal: swept-back blade on the back, from s=0.36 to 0.58
  addFin(1, [
    [0.16, 0.20, 0.0], [-0.10, 0.235, 0.0], [-0.30, 0.13, 0.0],
    [-0.02, 0.52, -0.012], [-0.10, 0.36, 0.0],
    [-0.02, 0.52, 0.012], [-0.10, 0.36, 0.004], [-0.30, 0.13, 0.004],
  ], [
    [0, 3, 1], [1, 3, 4], [4, 2, 1],
    [0, 1, 5], [1, 6, 5], [6, 2, 5],
    [3, 5, 4], [4, 5, 6],
  ], 0.48);

  // pectoral flippers (left/right), swept back and down
  for (const side of [1, -1]) {
    const p = side > 0 ? 2 : 3;
    const zs = 0.13 * side;
    addFin(p, [
      [0.30, -0.06, zs], [0.14, -0.12, zs + 0.02 * side], [0.02, -0.16, zs + 0.04 * side],
      [0.12, -0.30, zs + 0.34 * side], [-0.02, -0.24, zs + 0.30 * side],
    ], [
      [0, 1, 3], [1, 4, 3], [4, 2, 3], [1, 2, 4], [0, 3, 2],
    ], 0.30);
  }

  // fluke: two horizontal lobes at the tail
  addFin(4, [
    [-1.22, 0.0, 0.0], [-1.10, 0.02, 0.10], [-0.98, 0.0, 0.42],
    [-1.06, 0.0, 0.46], [-1.22, -0.01, 0.18],
    [-1.10, 0.02, -0.10], [-0.98, 0.0, -0.42], [-1.06, 0.0, -0.46], [-1.22, -0.01, -0.18],
  ], [
    [0, 1, 2], [0, 2, 3], [0, 3, 4],
    [0, 5, 6], [0, 6, 7], [0, 7, 8],
  ], 1.0);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(aPart, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export class Dolphin {
  constructor(scene, field, controller) {
    this.field = field;
    this.controller = controller;
    this.active = false;
    this.phase = 0;
    this.undulate = 0.06;
    this.flipper = 0.25;
    this.bank = 0;
    this.heading = controller.yaw;
    this.pitchSm = controller.pitch;
    this.quat = new THREE.Quaternion();
    this.camPos = new THREE.Vector3().copy(controller.pos);
    this.camLook = new THREE.Vector3().copy(controller.pos);
    this.prevYaw = controller.yaw;

    const geo = buildDolphinGeometry();
    // The body is modelled along X; the world's forward is +Z, so the animal
    // would otherwise swim broadside. Yaw the mesh onto the forward axis.
    geo.rotateY(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: withShared({
        uPhase: { value: 0 },
        uUndulate: { value: 0.06 },
        uBank: { value: 0 },
        uFlipper: { value: 0.25 },
        uDorsal: { value: new THREE.Vector3(0.115, 0.135, 0.155) },
        uBelly: { value: new THREE.Vector3(0.72, 0.735, 0.72) },
      }),
      vertexShader: DOLPHIN_VS,
      fragmentShader: DOLPHIN_FS,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'dolphin';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.material = mat;

    this.tmpV = new THREE.Vector3();
  }

  setActive(v) {
    this.active = v;
    this.mesh.visible = v;
    if (v) {
      // settle the camera behind the animal on entry
      this.camPos.copy(this.controller.pos).add(new THREE.Vector3(
        Math.sin(this.controller.yaw) * -7, 2.2, Math.cos(this.controller.yaw) * -7));
    }
  }

  update(dt, camera, active) {
    const c = this.controller;
    const speed = c.vel.length();
    this.phase += dt * (2.2 + speed * 0.62);
    // undulation amplitude follows thrust, not time
    const targetUnd = 0.045 + Math.min(0.30, speed * 0.016);
    this.undulate += (targetUnd - this.undulate) * Math.min(1, dt * 4.5);
    this.flipper = 0.18 + Math.min(0.5, speed * 0.02);

    // banking from turn rate
    const dYaw = ((c.yaw - this.prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.prevYaw = c.yaw;
    const targetBank = THREE.MathUtils.clamp(-dYaw / Math.max(dt, 1e-3) * 0.42, -0.85, 0.85);
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 3.2);

    this.material.uniforms.uPhase.value = this.phase;
    this.material.uniforms.uUndulate.value = this.undulate;
    this.material.uniforms.uBank.value = this.bank;
    this.material.uniforms.uFlipper.value = this.flipper;

    // --- pose the body along the swim direction, smoothly ---
    this.heading += (((c.yaw - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 7);
    this.pitchSm += (c.pitch - this.pitchSm) * Math.min(1, dt * 6);
    const pitch = this.pitchSm * 0.75;
    const e = new THREE.Euler(0, this.heading, 0, 'YXZ');
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.55, this.heading, 0, 'YXZ'));
    // gentle roll into turns, plus a slow idle roll from the fluke beat
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.bank * 0.55);
    this.quat.slerp(q.multiply(rollQ), Math.min(1, dt * 6));

    this.mesh.position.copy(c.pos);
    this.mesh.quaternion.copy(this.quat);

    if (!active) return;

    // --- third-person camera: chase from behind and above, looking past the
    // animal's head so the world ahead always fills the frame ---
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    const want = c.pos.clone().addScaledVector(fwd, -(4.6 + speed * 0.07)).addScaledVector(up, 1.75);
    // keep the camera out of the rock: shorten if terrain blocks the line
    const f = this.field;
    let allowed = want.clone();
    for (let t = 0.35; t <= 1.0; t += 0.1) {
      const p = c.pos.clone().lerp(want, t);
      if (p.y < f.heightAt(p.x, p.z) + 1.6) {
        allowed = c.pos.clone().lerp(want, Math.max(0.3, t - 0.12));
        break;
      }
    }
    const minY = f.heightAt(allowed.x, allowed.z) + 1.5;
    if (allowed.y < minY) allowed.y = minY;
    if (allowed.y > -0.35) allowed.y = -0.35;

    this.camPos.lerp(allowed, Math.min(1, dt * 6.5));
    this.camLook.lerp(c.pos.clone().addScaledVector(fwd, 6.0).addScaledVector(up, 0.45), Math.min(1, dt * 8));

    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }
}
