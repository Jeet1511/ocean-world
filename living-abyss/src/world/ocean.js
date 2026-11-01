// -----------------------------------------------------------------------------
// THE LIVING ABYSS — sky dome + the ocean surface
// The surface is a single mesh with two different shadings: what you see from
// the air, and what you see from below (Snell's window + total internal
// reflection). One continuous body of water, no separate regions.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { SKY_UNIFORMS, GLSL_SKY_FUNCS, SKY_VS, SKY_FS } from '../shaders/sky.js?rev=37';
import { GLSL_NOISE, GLSL_MEDIUM, GLSL_LIGHT, GLSL_ROCK, withShared } from '../shaders/common.js?rev=37';

export function buildSky() {
  const geo = new THREE.SphereGeometry(16000, 48, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: withShared({
      uUnderwater: { value: 0 },
      uWaterFar: { value: new THREE.Vector3(0.05, 0.2, 0.25) },
    }),
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Ocean surface
// ---------------------------------------------------------------------------
const OCEAN_VS = /* glsl */`
uniform float uTime;
uniform vec2 uCurrent;          // gentle surface drift (metres per second, x/z)
varying vec3 vWorld;
varying vec3 vWaves;
varying float vFoam;
varying vec2 vP;                // surface position for advected surface detail

// swell: height, analytic slope and crest foam potential
vec3 swell(vec2 p, vec2 dir, float len, float amp, float speed, float t){
  float k = 6.2831853 / len;
  vec2 d = normalize(dir);
  float a = dot(d, p) * k + t * speed * k;
  float h = amp * sin(a);
  float dh = amp * k * cos(a);
  return vec3(h, dh * d.x, dh * d.y);
}

void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float t = uTime;

  // Long ocean swell sets the underline; shorter wind waves and a cross sea
  // give the surface texture without making it chaotic.
  vec3 s  = swell(p, vec2( 1.00, -0.30), 260.0, 0.70, 0.45, t);   // long ground swell
  vec3 s2 = swell(p, vec2( 0.70,  1.00), 110.0, 0.30, 0.80, t);   // wind sea
  vec3 s3 = swell(p, vec2(-0.85, -0.55),  50.0, 0.14, 1.40, t);   // short chop
  vec3 s4 = swell(p, vec2( 1.00,  0.90),  28.0, 0.06, 2.10, t);   // capillary ripples

  wp.y += s.x + s2.x + s3.x + s4.x;

  float dx = s.y + s2.y + s3.y + s4.y;
  float dz = s.z + s2.z + s3.z + s4.z;
  vWaves = vec3(-dx, 1.0, -dz);
  // Foam potential: sharp crests (steep analytic slope) throw spray.
  float crest = abs(s.y) + abs(s2.y) + abs(s3.y);
  vFoam = pow(clamp(crest * 1.6 - 0.35, 0.0, 1.0), 2.0);
  vWorld = wp.xyz;
  vP = wp.xz + uCurrent * (t * 0.5);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const OCEAN_FS_BODY = /* glsl */`
varying vec3 vWorld;
varying vec3 vWaves;
varying float vFoam;
varying vec2 vP;

void main(){
  vec3 wp = vWorld;
  vec3 N = normalize(vWaves);
  // high-frequency chop, faded with distance to avoid shimmer. Chop is advected
  // with the surface current so the water looks like it is moving, not just
  // oscillating in place.
  float dist0 = length(uCamPos - wp);
  float chopFade = 1.0 - smoothstep(120.0, 1400.0, dist0);
  vec3 chopN = vec3(
    vnoise2(vP * 0.55) - 0.5,
    0.0,
    vnoise2(vP * 0.55 + 12.7) - 0.5
  ) * 1.1;
  N = normalize(N + chopN * chopFade * chopFade);

  // Crest foam where the swell is sharp — thin spray on the tops of waves.
  float foam = vFoam * chopFade;
  vec3 foamCol = vec3(0.90, 0.94, 0.98);

  // Branch on where the eye is, not on triangle winding: at grazing angles the
  // projected winding of a 35 m quad flips and paints black bands on the horizon.
  if (uCamPos.y > 0.0) {
    // ---------------- seen from the air ----------------
    vec3 V = normalize(uCamPos - wp);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    float fres = 0.020 + 0.980 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    vec3 sky = skyRadiance(R);
    vec3 deep = vec3(0.0055, 0.052, 0.088);
    vec3 col = mix(deep, sky, clamp(0.22 + 0.78 * fres, 0.0, 1.0));

    // sub-surface glow where the sun passes through thin crests
    float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
    col += vec3(0.04, 0.28, 0.30) * back * 0.55;

    // glitter path
    float spec = pow(max(dot(R, uSunDir), 0.0), 420.0) * 14.0;
    float glit = pow(max(dot(R, uSunDir), 0.0), 42.0) * 0.9;
    col += uSunColor * (spec + glit) * (0.5 + 0.5 * chopFade + 0.5);

    // aerial perspective toward the horizon
    float hz = smoothstep(2000.0, 15000.0, dist0);
    col = mix(col, skyRadiance(normalize(vec3(R.x, 0.02, R.z))), hz * 0.85);

    // Foam on crests: only where the wave is actually breaking steeply.
    col = mix(col, foamCol, foam * 0.55);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // ---------------- seen from below ----------------
  vec3 rayDir = normalize(wp - uCamPos);   // up toward the surface
  N = normalize(vec3(-N.x, 1.0, -N.z));
  vec3 nUp = normalize(vec3(N.x, -1.0, N.z));
  float cosT = clamp(dot(rayDir, nUp), 0.0, 1.0);
  float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  const float IOR = 1.333;
  float critical = 1.0 / IOR;              // 0.75 -> Snell's window edge

  // Snell's window: inside it you see the sky, outside it is a mirror
  float win = 1.0 - smoothstep(critical * 0.90, critical * 1.02, sinT);

  vec3 refr = refract(rayDir, nUp, 1.0 / IOR);
  if (length(refr) < 0.001) refr = nUp;
  vec3 through = skyRadiance(normalize(refr));

  // Total internal reflection: the underside mirrors whatever is below it.
  // Over shallow reefs that mirror is bright sand and sunlit water — never a
  // black lid across the horizon.
  float shallowW = smoothstep(-70.0, -2.0, uCamPos.y);
  vec3 mirrored = mix(waterAmbient(uCamPos.y) * 0.85, waterAmbient(0.0) * 1.25 + vec3(0.16, 0.30, 0.30), shallowW);
  mirrored += vec3(0.10, 0.28, 0.30) * pow(max(dot(rayDir, uSunDir), 0.0), 3.0);
  // the ceiling's structure detail must fade with range: a 3 m noise feature
  // seen at 400 m is pure aliasing, and it was painting grain over the sky
  mirrored *= 1.0 + 0.30 * (0.5 + 0.5 * vnoise2(wp.xz * 0.35 + uTime * 0.2) - 0.5)
            * (1.0 - smoothstep(30.0, 260.0, dist0));

  vec3 col = mix(mirrored, through * 0.62, win * (1.0 - 0.55 * pow(sinT, 8.0)));
  col += uSunColor * pow(max(dot(refr, uSunDir), 0.0), 300.0) * 6.0 * win;

  // surface shimmer: a detail that must die with distance or it aliases into
  // a field of crawling grain across the whole ceiling
  col *= 0.90 + 0.20 * vnoise2(wp.xz * 0.42 + uTime * 0.45)
       * (1.0 - smoothstep(50.0, 240.0, dist0));

  // Foam visible through Snell's window as bright crest lines.
  col = mix(col, foamCol * 0.6, foam * 0.4);

  // Whatever the far field computes, at range the underside of the surface is
  // just the water column seen edge-on. Clamp it so no distant artefact can
  // paint a dark band across the horizon.
  float farField = smoothstep(110.0, 620.0, dist0);
  col = mix(col, waterAmbient(uCamPos.y), farField);

  // Below the photic zone the surface is simply not visible: the ceiling of the
  // world has to dissolve into the water column, not hang above the player as a
  // bright lid. This also kills the hard horizon band seen from deep water.
  float deepFade = smoothstep(30.0, 110.0, -uCamPos.y);
  col = mix(col, inscatter(normalize(rayDir), uCamPos.y), deepFade);

  col = applyWater(col, wp);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildOcean() {
  const group = new THREE.Group();
  group.name = 'ocean';

  // One surface, no ring: the old near plane + far annulus pair intersected
  // wherever a swell dropped the plane through the annulus, which drew a jagged
  // black seam across the horizon. A single large plane cannot seam.
  const size = 24000;
  const geo = new THREE.PlaneGeometry(size, size, 150, 150);
  geo.rotateX(-Math.PI / 2);

  const uniforms = withShared({
    uCurrent: { value: new THREE.Vector2(0.08, 0.04) },
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VS,
    fragmentShader: GLSL_NOISE + GLSL_MEDIUM + GLSL_LIGHT + GLSL_SKY_FUNCS + OCEAN_FS_BODY,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  group.add(mesh);


  group.userData.material = mat;
  group.userData.follow = true;
  return group;
}
