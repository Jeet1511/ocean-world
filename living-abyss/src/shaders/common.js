// -----------------------------------------------------------------------------
// THE LIVING ABYSS — GLSL library
// One water medium, one lighting model, one rock language. Every material in the
// world includes these chunks, so the whole ocean reads as a single place.
//
// Rewritten for the visual overhaul:
//   · wavelength-dependent extinction with a real photic zone (red dies first)
//   · depth-graded inscatter + directional (view-dependent) scattering
//   · sun shafts approximated as in-scatter anisotropy, not a fog hack
//   · rock language with per-family palettes, true strata, sediment, minerals
//   · finer, crisper caustics that fade before they can alias
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';

// ---------------------------------------------------------------------------
// Shared uniforms — the same objects are injected into every material, so one
// update per frame drives the entire world.
// ---------------------------------------------------------------------------
export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.42, 0.72, -0.55).normalize() },
  uSunColor: { value: new THREE.Vector3(1.0, 0.94, 0.84) },
  uCamPos: { value: new THREE.Vector3() },
  uSurfaceY: { value: 0 },
  uFogScale: { value: 1.0 },
  uCurrent: { value: new THREE.Vector2(0.08, 0.04) },
  uWaterTint: { value: new THREE.Vector3(1, 1, 1) },
  uCausticStrength: { value: 1.0 },
  uShaftStrength: { value: 1.0 },
  uExposure: { value: 1.0 },
  uQualityTier: { value: 0 },
  // principal cave skylight centre, approximate roof elevation, radius
  uCaveOpening: { value: new THREE.Vector4(500, -24, -360, 23.9) },
};

// ---------------------------------------------------------------------------
// Noise toolkit
// ---------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */`
float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; return fract(p*p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }

float vnoise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  float n000 = hash13(i+vec3(0.0,0.0,0.0)), n100 = hash13(i+vec3(1.0,0.0,0.0));
  float n010 = hash13(i+vec3(0.0,1.0,0.0)), n110 = hash13(i+vec3(1.0,1.0,0.0));
  float n001 = hash13(i+vec3(0.0,0.0,1.0)), n101 = hash13(i+vec3(1.0,0.0,1.0));
  float n011 = hash13(i+vec3(0.0,1.0,1.0)), n111 = hash13(i+vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float vnoise2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  float a = hash12(i), b = hash12(i+vec2(1.0,0.0));
  float c = hash12(i+vec2(0.0,1.0)), d = hash12(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm3(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= oct) break;
    s += a * vnoise3(p); n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.4); a *= 0.5;
  }
  return s / max(n, 1e-4);
}
float fbm2(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= oct) break;
    s += a * vnoise2(p); n += a;
    p = p * 2.03 + vec2(3.1, 7.7); a *= 0.5;
  }
  return s / max(n, 1e-4);
}
float ridge3(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++){
    if (i >= oct) break;
    float v = 1.0 - abs(vnoise3(p)*2.0-1.0);
    s += a * v * v; n += a;
    p = p * 2.11 + vec3(5.2, 1.3, 8.8); a *= 0.5;
  }
  return s / max(n, 1e-4);
}
// cellular-ish cracks: cheap Worley approximation via min of hash points
float crackField(vec3 p, float scale){
  vec3 q = p * scale;
  vec3 i = floor(q), f = fract(q);
  float d = 8.0;
  for (int z = -1; z <= 1; z++){
    for (int y = -1; y <= 1; y++){
      for (int x = -1; x <= 1; x++){
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = vec3(hash13(i+g), hash13(i+g+7.1), hash13(i+g+13.7));
        vec3 r = g + o - f;
        d = min(d, dot(r, r));
      }
    }
  }
  return sqrt(d);
}

// The rock shader only uses the crack distance below 0.16; farther points
// contribute exactly zero. A neighbour cell whose closest possible point is
// already farther than the best candidate cannot affect that result. Skip its
// three expensive hashes, without changing the retained crack pattern.
float crackMaskWithin(vec3 p, float scale){
  vec3 q=p*scale, i=floor(q), f=fract(q);
  float best=0.0256;
  for(int z=-1;z<=1;z++){
    for(int y=-1;y<=1;y++){
      for(int x=-1;x<=1;x++){
        vec3 g=vec3(float(x),float(y),float(z));
        vec3 lower=max(max(g-f, f-(g+vec3(1.0))),vec3(0.0));
        // Small conservative allowance covers floating-point rounding.
        if(dot(lower,lower)>best+0.00001)continue;
        vec3 o=vec3(hash13(i+g),hash13(i+g+7.1),hash13(i+g+13.7));
        vec3 r=g+o-f;best=min(best,dot(r,r));
      }
    }
  }
  if(best>=0.0256)return 0.0;
  return 1.0-smoothstep(0.0,0.16,sqrt(best));
}
`;

// ---------------------------------------------------------------------------
// The water medium
// ---------------------------------------------------------------------------
export const GLSL_WATER_AMBIENT = /* glsl */`
// Shared habitat tint is applied equally to fog, sky and underwater materials.
uniform vec3 uWaterTint;
// Ambient colour of the water body as a function of elevation (top-lit world).
vec3 waterAmbient(float y){
  float d = max(-y, 0.0);
  vec3 c = vec3(0.050, 0.235, 0.300);                                   // 0 m
  c = mix(c, vec3(0.038, 0.196, 0.290), smoothstep(0.0, 22.0, d));      // turquoise
  c = mix(c, vec3(0.020, 0.120, 0.245), smoothstep(22.0, 70.0, d));     // reef blue
  c = mix(c, vec3(0.012, 0.072, 0.190), smoothstep(70.0, 190.0, d));    // open blue
  c = mix(c, vec3(0.007, 0.040, 0.125), smoothstep(190.0, 430.0, d));   // cobalt
  c = mix(c, vec3(0.003, 0.018, 0.070), smoothstep(430.0, 800.0, d));   // deep
  c = mix(c, vec3(0.0015, 0.008, 0.032), smoothstep(800.0, 1200.0, d)); // abyss
  return c * uWaterTint;
}
`;

export const GLSL_MEDIUM = GLSL_WATER_AMBIENT + /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCamPos;
uniform float uSurfaceY;
uniform float uFogScale;
uniform float uCausticStrength;
uniform float uShaftStrength;
uniform float uQualityTier;
uniform vec4 uCaveOpening;

// Extinction per metre. Clear ocean water: red is gone within ~30 m, blue runs
// for hundreds. The whole world's depth reading depends on this one constant.
const vec3 WATER_SIGMA = vec3(0.0295, 0.0138, 0.0082);

// Diffuse irradiance at elevation y — the ambient hemispherical light.
vec3 ambientLight(float y){
  float d = max(-y, 0.0);
  float boost = 1.0 + 1.45 * pow(smoothstep(30.0, 640.0, d), 0.70);
  return waterAmbient(y) * boost;
}

// Direct sunlight remaining at elevation y.
vec3 sunlightAt(float y){
  float d = max(-y, 0.0);
  vec3 att = exp(-vec3(0.0215, 0.0104, 0.0062) * d);
  att *= 1.0 - 0.42 * smoothstep(380.0, 1100.0, d);
  return uSunColor * att * 1.18;
}

// Approximate direct-light footprint below the real Nave roof aperture. It is
// not a full sun-shadow map: the roof opening clips the light, while smaller
// obstacles within the hall are not separately shadowed.
float caveOpeningLight(vec3 p){
  if(p.y>uCaveOpening.y || p.y<uCaveOpening.y-100.0 ||
     abs(p.x-uCaveOpening.x)>110.0 || abs(p.z-uCaveOpening.z)>110.0)return 0.0;
  float rise=(uCaveOpening.y-p.y)/max(uSunDir.y,.01);
  vec2 openingHit=(p+uSunDir*rise).xz;
  float r=length(openingHit-uCaveOpening.xz);
  return (1.0-smoothstep(uCaveOpening.w*.56,uCaveOpening.w*.96,r))*exp(-rise*.004);
}

// Medium density. Coastal water is visibly turbid in the top 30 m, clears below
// the thermocline, and thickens again in the abyss with suspended sediment.
float fogDensity(float y){
  float d = max(-y, 0.0);
  // Coastal water is not clear: 40-70 m of useful visibility in the photic
  // zone. That is also what closes the horizon into a blue glow instead of
  // letting the player see a flat plane meeting the surface.
  return uFogScale * (1.18 - 0.62 * smoothstep(10.0, 120.0, d)
                            + 0.16 * smoothstep(600.0, 1100.0, d));
}

// THE inscatter of the medium. This is the colour of distant water, and it is
// shared by every surface AND by the sky dome, because the moment two of them
// disagree the difference appears as a hard band lying along the horizon.
vec3 inscatter(vec3 dir, float midY){
  vec3 amb = waterAmbient(midY);
  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  // photic glow: the top tens of metres are bright with multiple scattering
  float lit = (1.0 - smoothstep(0.0, 130.0, -midY));
  vec3 ins = amb * (0.78 + 0.52 * up * up) * (1.0 + 0.80 * lit);
  // sun shafts: forward scattering toward the light direction
  float sf = pow(clamp(dot(dir, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 2.2);
  ins += uSunColor * sf * 0.11 * uShaftStrength * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 200.0, -midY)));
  // shallow surface glare band
  float shallow = smoothstep(-16.0, -0.5, midY);
  ins += vec3(0.05, 0.13, 0.15) * shallow * up * up * up;
  return ins;
}

// Applies absorption + inscattering to a surface colour.
vec3 applyWater(vec3 color, vec3 wp){
  vec3 V = wp - uCamPos;
  float dist = length(V);
  vec3 dir = V / max(dist, 1e-4);
  float midY = 0.5 * (wp.y + uCamPos.y);
  vec3 sigma = WATER_SIGMA * fogDensity(midY);
  vec3 T = exp(-sigma * dist);
  return color * T + inscatter(dir, midY) * (1.0 - T);
}
`;

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
export const GLSL_LIGHT = /* glsl */`
float causticHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float causticNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(causticHash(i), causticHash(i + vec2(1.0, 0.0)), u.x),
             mix(causticHash(i + vec2(0.0, 1.0)), causticHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Caustic web. Two interference trains domain-warped into filaments. The spatial
// frequency is the whole point: too coarse and the seabed reads as a lava lamp.
float causticPattern(vec2 p, float t){
  vec2 q = p;
  q += 0.55 * vec2(causticNoise(p * 0.75 + vec2(t * 0.20, 0.0)),
                   causticNoise(p * 0.75 + vec2(0.0, -t * 0.17) + 17.0));
  float a = sin(q.x * 3.4 + t * 1.05) * sin(q.y * 3.1 - t * 0.92);
  float b = sin((q.x + q.y) * 2.3 - t * 1.32) * sin((q.x - q.y) * 2.6 + t * 1.01);
  float r = 1.0 - abs(a * 0.58 + b * 0.55);
  return pow(clamp(r, 0.0, 1.0), 14.0);
}

float causticsAt(vec3 wp, vec3 N){
  float d = -wp.y;
  float fade = 1.0 - smoothstep(20.0, 260.0, d);
  if (fade <= 0.001) return 0.0;
  float facing = clamp(N.y, 0.0, 1.0);
  float c = causticPattern(wp.xz * 1.10, uTime * 0.55);
  // Lower quality retains one animated light pattern but avoids two additional
  // warped noise evaluations on every shaded surface pixel.
  if (uQualityTier > 0.5) {
    c += 0.45 * causticPattern(wp.xz * 0.62 + 7.3, uTime * 0.40);
    c += 0.18 * causticPattern(wp.xz * 2.00 - 3.1, uTime * 0.75);
  }
  return min(c, 1.9) * fade * (0.18 + 0.82 * facing) * uCausticStrength;
}

// Sun + ambient lighting for a rock / sand / reef surface.
vec3 litSurface(vec3 albedo, vec3 N, vec3 wp, float rough, float ao, float causticMul){
  vec3 sun = sunlightAt(wp.y);
  float ndl = dot(N, uSunDir);
  float direct = clamp(ndl, 0.0, 1.0);
  // wrapped diffuse: rock is not a Lambertian matte, and totally black crevices
  // are a defect, not a mood
  float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
  float caus = causticsAt(wp, N) * causticMul;
  // ambient is deliberately weak and strongly oriented: the sun is the key
  vec3 ambient = ambientLight(wp.y);
  vec3 amb = ambient * 0.66 * pow(clamp(N.y * 0.5 + 0.5, 0.0, 1.0), 0.85);
  vec3 col = albedo * (sun * (direct * 1.22 + wrap * 0.30) * (1.0 + caus * 1.15) + amb);

  // upwards-facing surfaces near the surface get extra skylight
  float skylight = smoothstep(-34.0, 0.0, wp.y) * 0.10;
  col += albedo * ambientLight(0.0) * skylight;

  // wet specular sheen (rock is wet; this is the whole look of a lit cliff)
  vec3 V = normalize(uCamPos - wp);
  vec3 H = normalize(uSunDir + V);
  float a = max(rough * rough, 0.0020);
  float nh = max(dot(N, H), 0.0);
  float D = (a * a) / (3.14159 * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
  float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(V, H), 0.0, 1.0), 5.0);
  col += sun * D * F * 0.60 * clamp(ndl + 0.25, 0.0, 1.0);

  // rim: every silhouette picks up the water's glow, separating form from haze
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += albedo * ambient * rim * 1.45;

  // Deep-water readability floor: below the photic zone the only light is
  // scattered ambient, and a place you cannot see is not a place. Lift the
  // shadow end toward the medium colour so form still reads as form.
  float deep = smoothstep(60.0, 260.0, -wp.y);
  col += albedo * waterAmbient(wp.y) * deep * 0.55;
  // Soft, depth-dependent environmental bounce keeps basalt and cave-facing
  // surfaces legible without changing sunlight, geometry, or water levels.
  // It is deliberately cool and modest rather than emissive neon.
  col += albedo * vec3(0.10, 0.18, 0.27) * deep;

  return col * (0.46 + 0.54 * clamp(ao, 0.0, 1.0));
}
`;

// ---------------------------------------------------------------------------
// Geological surface language
// Families: 0 limestone · 1 reef limestone · 2 sandstone · 3 basalt · 4 mineral
// ---------------------------------------------------------------------------
export const GLSL_ROCK = /* glsl */`
uniform float uFamily;
uniform float uWetness;
uniform float uMineral;

// Stratified, sediment-dusted rock. Returns albedo; writes a detail height used
// for normal perturbation so the surface has relief without a texture sampler.
vec3 rockAlbedo(vec3 wp, vec3 N, float detailScale, float detailFade, out float detailH){
  float depth = max(-wp.y, 0.0);

  float n1 = fbm3(wp * 0.0075, 4);         // ~130 m geological bodies
  float n2 = fbm3(wp * 0.058, 3);          // ~17 m broken rock
  float n3 = fbm3(wp * 0.42, 3);           // ~2.4 m surface grain
  float n4 = fbm3(wp * 1.9, 2);            // ~0.5 m grit

  // --- bedding planes: tilted, warped, with hard and soft beds -------------
  float tilt = wp.x * 0.0042 + wp.z * 0.0028;
  float bedPhase = (wp.y + tilt * 40.0) * 0.42 + n1 * 6.5;
  float bed = sin(bedPhase);
  float hard = smoothstep(-0.10, 0.55, bed);            // resistant beds stand proud
  float thin = smoothstep(0.86, 1.0, sin(bedPhase * 5.3 + n2 * 3.0)); // thin marls

  // --- family palettes -----------------------------------------------------
  vec3 limestone = mix(vec3(0.520, 0.492, 0.436), vec3(0.352, 0.330, 0.288), n1);
  vec3 reefRock  = mix(vec3(0.455, 0.392, 0.330), vec3(0.268, 0.240, 0.208), n2);
  vec3 sandstone = mix(vec3(0.545, 0.432, 0.318), vec3(0.352, 0.268, 0.196), n1);
  vec3 basalt    = mix(vec3(0.155, 0.158, 0.172), vec3(0.070, 0.074, 0.088), n2);
  vec3 mineral   = mix(vec3(0.300, 0.352, 0.395), vec3(0.170, 0.205, 0.250), n1);

  vec3 rock = limestone;
  float f = uFamily;
  if (f > 0.5 && f < 1.5) rock = reefRock;
  else if (f > 1.5 && f < 2.5) rock = sandstone;
  else if (f > 2.5 && f < 3.5) rock = basalt;
  else if (f > 3.5) rock = mineral;
  // natural province mixing so no formation is one flat colour
  rock = mix(rock, reefRock, smoothstep(0.62, 0.92, n1) * 0.35);
  rock = mix(rock, sandstone, smoothstep(0.66, 0.95, fbm3(wp * 0.0021 + 5.5, 2)) * 0.25);

  // --- bedding & erosion shading ------------------------------------------
  // Regular bedding lines became unnaturally repetitive on the deep steep
  // terrain. Reduce their contrast at depth without erasing shallow strata.
  float deepBeds = smoothstep(180.0, 440.0, depth);
  rock *= mix(0.80 + 0.34 * hard, 0.91 + 0.13 * hard, deepBeds);
  rock *= 1.0 - mix(0.12, 0.04, deepBeds) * thin;
  // fractures darken and collect silt
  float crackMask = crackMaskWithin(wp, 0.16);
  rock *= 1.0 - 0.42 * crackMask;

  // --- sediment ------------------------------------------------------------
  vec3 sandWarm = vec3(0.330, 0.284, 0.206);
  vec3 siltDeep = vec3(0.105, 0.104, 0.112);
  vec3 sediment = mix(sandWarm, siltDeep, (1.0 - smoothstep(-220.0, -16.0, wp.y)));
  sediment *= 0.90 + 0.22 * n3;
  float flatMask = smoothstep(0.40, 0.92, N.y);
  float sedimentMask = flatMask * (0.50 + 0.50 * smoothstep(0.28, 0.78, n2));
  sedimentMask *= 1.0 - 0.5 * hard * (1.0 - smoothstep(-140.0, -30.0, wp.y));
  rock *= vec3(1.12, 1.01, 0.90);      // warm bias: rock against cool water
  vec3 col = mix(rock, sediment, sedimentMask);

  // --- sand ripples --------------------------------------------------------
  vec2 rp = wp.xz;
  float ang = n1 * 6.2831;
  vec2 rd = vec2(cos(ang), sin(ang));
  float ripple = sin(dot(rp, rd) * 3.4 + n2 * 11.0);
  ripple += 0.52 * sin(dot(rp, vec2(rd.y, -rd.x)) * 5.4 + n3 * 7.0);
  ripple += 0.30 * sin(dot(rp, vec2(-rd.x, rd.y)) * 11.0 + n4 * 5.0);
  float rippleMask = flatMask * (1.0 - (1.0 - smoothstep(-190.0, -60.0, wp.y))) * smoothstep(0.28, 0.64, n2) * detailFade;
  col *= 1.0 + 0.10 * ripple * rippleMask;
  col *= 1.0 + 0.06 * (n4 - 0.5) * flatMask;

  // --- life crust in the photic zone --------------------------------------
  float crust = smoothstep(-52.0, -4.0, wp.y) * flatMask * smoothstep(0.32, 0.82, n2);
  col = mix(col, col * vec3(0.90, 0.98, 0.88), crust * 0.28);
  // coralline pink crust on vertical reef faces
  float coralCrust = smoothstep(-40.0, -6.0, wp.y) * smoothstep(0.45, 0.95, n3) * (1.0 - flatMask);
  col = mix(col, vec3(0.46, 0.28, 0.30), coralCrust * 0.22);

  // --- minerals ------------------------------------------------------------
  float vein = pow(clamp(1.0 - abs(n3 * 2.0 - 1.0), 0.0, 1.0), 26.0);
  float deepK = (1.0 - smoothstep(-700.0, -260.0, wp.y));
  col += vec3(0.10, 0.13, 0.18) * vein * deepK * (0.6 + uMineral);
  col += vec3(0.03, 0.05, 0.07) * uMineral * smoothstep(0.55, 0.95, n2) * (1.0 - smoothstep(-600.0, -120.0, wp.y));

  // --- large-scale colour provinces ---------------------------------------
  float macro = fbm3(wp * 0.0038 + 11.0, 2);
  float macro2 = fbm3(wp * 0.031 - 3.0, 3);
  vec3 warmProv = vec3(1.20, 0.98, 0.78);
  vec3 coolProv = vec3(0.84, 0.96, 1.08);
  col *= mix(coolProv, warmProv, smoothstep(0.36, 0.70, macro)) * (0.72 + 0.50 * macro + 0.20 * macro2);
  // pale mineral crusts along exposed bedding
  float crust2 = smoothstep(0.60, 0.95, macro2) * hard;
  col = mix(col, col * 1.36 + vec3(0.035, 0.033, 0.030), crust2 * 0.30);

  // cavity darkening
  col *= 0.80 + 0.34 * (n3 * 0.55 + n4 * 0.45);
  // wet film: darkens and saturates (rubble underwater is always wet)
  col *= mix(1.0, 0.82, uWetness * 0.7);

  detailH = (n3 * 0.55 + n4 * 0.45) * detailScale + hard * 0.25;
  return col;
}

// Analytic ripple normals: real shading relief, faded before it can alias.
vec3 sandRippleNormal(vec3 wp, vec3 N, float fade){
  float flatMask = smoothstep(0.55, 0.94, N.y);
  if (flatMask * fade < 0.01) return N;
  float dirSel = fbm3(vec3(wp.xz * 0.0016, 0.0), 2);
  vec2 rd = normalize(vec2(0.82, 0.57) + dirSel * 1.4);
  vec2 q = wp.xz;
  float warp = fbm3(vec3(q * 0.09, 0.0), 3) - 0.5;
  float warp2 = fbm3(vec3(q * 0.34, 3.1), 2) - 0.5;
  float phase = dot(q, rd) * 3.4 + warp * 7.0 + warp2 * 1.6;
  vec2 grad = cos(phase) * 3.4 * rd * 0.055;
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  return normalize(mix(N, n, flatMask * fade * 0.85));
}

// Perturb a normal with the procedural detail gradient (no tangents needed).
vec3 perturbNormal(vec3 wp, vec3 N, float scale, float strength){
  float e = 0.30 / scale;
  float h0 = fbm3(wp * scale, 3);
  vec3 g = vec3(
    fbm3((wp + vec3(e,0.0,0.0)) * scale, 3) - h0,
    fbm3((wp + vec3(0.0,e,0.0)) * scale, 3) - h0,
    fbm3((wp + vec3(0.0,0.0,e)) * scale, 3) - h0) / e;
  g -= N * dot(g, N);
  return normalize(N - g * strength);
}
`;

// Convenience concatenation used by most materials
export const GLSL_HEADER = GLSL_NOISE + GLSL_MEDIUM + GLSL_LIGHT + GLSL_ROCK;

/** Attach the shared uniforms to a material's uniform block. */
export function withShared(uniforms) {
  return Object.assign({}, shared, uniforms);
}
