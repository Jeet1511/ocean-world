// -----------------------------------------------------------------------------
// THE LIVING ABYSS — sky radiance (function only; uniforms come from the
// including material, so nothing is ever declared twice)
// -----------------------------------------------------------------------------
import { GLSL_NOISE, GLSL_MEDIUM } from './common.js?rev=37';

export const SKY_UNIFORMS = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
`;

export const GLSL_SKY_FUNCS = /* glsl */`
vec3 skyRadiance(vec3 dir){
  float up = clamp(dir.y, -1.0, 1.0);

  vec3 zenith  = vec3(0.075, 0.255, 0.640);
  vec3 mid     = vec3(0.330, 0.560, 0.860);
  vec3 horizon = vec3(0.760, 0.815, 0.870);
  vec3 col = mix(horizon, mid, pow(clamp(up, 0.0, 1.0), 0.62));
  col = mix(col, zenith, smoothstep(0.12, 0.98, up));
  col = mix(col, vec3(0.86, 0.87, 0.88), pow(1.0 - clamp(up, 0.0, 1.0), 14.0) * 0.85);
  col = mix(col, vec3(0.30, 0.42, 0.50), (1.0 - smoothstep(-0.30, 0.0, up)));

  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(sd, 2200.0) * 26.0;          // solar disc
  col += uSunColor * pow(sd, 26.0) * 0.70;            // tight glow
  col += uSunColor * pow(sd, 4.0) * 0.13;             // wide bloom

  if (up > 0.005) {
    vec2 cp = dir.xz / (up + 0.16);
    float c1 = fbm2(cp * 0.42 + vec2(uTime * 0.0035, uTime * 0.0016), 5);
    c1 = smoothstep(0.50, 0.86, c1);
    float c2 = fbm2(cp * 1.25 - vec2(uTime * 0.005, uTime * 0.002), 4);
    float cover = c1 * (0.55 + 0.75 * c2);
    float lit = 0.35 + 0.65 * pow(sd, 6.0) + 0.35 * c2;
    vec3 cloudCol = mix(vec3(0.62, 0.67, 0.76), vec3(1.02, 1.00, 0.97), clamp(lit, 0.0, 1.0));
    col = mix(col, cloudCol, clamp(cover, 0.0, 1.0) * smoothstep(0.0, 0.22, up) * 0.9);
  }
  return col;
}
`;

export const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.999999;
}
`;

export const SKY_FS = GLSL_NOISE + GLSL_MEDIUM + GLSL_SKY_FUNCS + /* glsl */`
uniform float uUnderwater;
uniform vec3 uWaterFar;
varying vec3 vDir;
void main(){
  vec3 col = skyRadiance(normalize(vDir));
  // Underwater the dome is not a sky at all: it stands in for the body of water
  // beyond the last triangulated surface. It must match the water exactly, or
  // every thin gap between the surface mesh and the seabed shows up as a dark
  // band lying across the horizon.
  // 0.80 is the fog's own inscatter weight for a level view (up = 0)
  // The dome stands in for the water beyond the last triangulated surface, so
  // it has to use the SAME inscatter expression as applyWater — including its
  // view dependence — or a hard band appears exactly at the horizon.
  // Same expression as applyWater, so the dome and the fog can never disagree.
  vec3 under = inscatter(normalize(vDir), uCamPos.y);
  gl_FragColor = vec4(mix(col, under, uUnderwater), 1.0);
}
`;
