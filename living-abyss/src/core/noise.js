// -----------------------------------------------------------------------------
// THE LIVING ABYSS — noise + math core
// Deterministic, dependency-free, shared by JS generation and (mirrored in) GLSL.
// -----------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const mix = lerp;
export const saturate = clamp01;

// ---------------------------------------------------------------------------
// Perlin gradients
// ---------------------------------------------------------------------------
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const PERM = new Uint8Array(512);
const PERM12 = new Uint8Array(512);
(function buildPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 20240613;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 16807) + 7) % 2147483647;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    PERM12[i] = PERM[i] % 12;
  }
})();

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Classic Perlin noise, 2D. Range ~[-1,1]. */
export function noise2(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const X = fx & 255, Y = fy & 255;
  const xf = x - fx, yf = y - fy;
  const u = fade(xf), v = fade(yf);
  const px0 = PERM[X], px1 = PERM[X + 1];
  const aa = PERM12[px0 + Y], ba = PERM12[px1 + Y];
  const ab = PERM12[px0 + Y + 1], bb = PERM12[px1 + Y + 1];
  const g00 = GRAD3[aa * 3] * xf + GRAD3[aa * 3 + 1] * yf;
  const g10 = GRAD3[ba * 3] * (xf - 1) + GRAD3[ba * 3 + 1] * yf;
  const g01 = GRAD3[ab * 3] * xf + GRAD3[ab * 3 + 1] * (yf - 1);
  const g11 = GRAD3[bb * 3] * (xf - 1) + GRAD3[bb * 3 + 1] * (yf - 1);
  const x1 = g00 + (g10 - g00) * u;
  const x2 = g01 + (g11 - g01) * u;
  return (x1 + (x2 - x1) * v) * 1.4;
}

/** Classic Perlin noise, 3D. Range ~[-1,1]. */
export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  const xf = x - fx, yf = y - fy, zf = z - fz;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const g = (h, dx, dy, dz) => {
    const i = PERM12[h] * 3;
    return GRAD3[i] * dx + GRAD3[i + 1] * dy + GRAD3[i + 2] * dz;
  };
  const l1 = g(AA, xf, yf, zf) + (g(BA, xf - 1, yf, zf) - g(AA, xf, yf, zf)) * u;
  const l2 = g(AB, xf, yf - 1, zf) + (g(BB, xf - 1, yf - 1, zf) - g(AB, xf, yf - 1, zf)) * u;
  const l3 = g(AA + 1, xf, yf, zf - 1) + (g(BA + 1, xf - 1, yf, zf - 1) - g(AA + 1, xf, yf, zf - 1)) * u;
  const l4 = g(AB + 1, xf, yf - 1, zf - 1) + (g(BB + 1, xf - 1, yf - 1, zf - 1) - g(AB + 1, xf, yf - 1, zf - 1)) * u;
  const m1 = l1 + (l2 - l1) * v;
  const m2 = l3 + (l4 - l3) * v;
  return (m1 + (m2 - m1) * w) * 1.2;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise2(x * f, y * f);
    norm += a;
    a *= gain; f *= lacunarity;
  }
  return sum / norm;
}

export function fbm3(x, y, z, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise3(x * f, y * f, z * f);
    norm += a;
    a *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal — sharp crests, good for rock spines and canyon rims. */
export function ridged2(x, y, octaves = 4, lacunarity = 2.07, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * f, y * f));
    sum += a * n * n;
    norm += a;
    a *= gain; f *= lacunarity;
  }
  return (sum / norm) * 2 - 1;
}

/** Domain-warped fBm — organic, non-repetitive geology. */
export function warpedFbm2(x, y, warp = 0.6, octaves = 4) {
  const wx = fbm2(x * 0.5 + 11.3, y * 0.5 - 4.7, 3);
  const wy = fbm2(x * 0.5 - 7.1, y * 0.5 + 9.2, 3);
  return fbm2(x + wx * warp, y + wy * warp, octaves);
}

/** Quantise into terraces: the signature stratified-shelf look. */
export function terrace(y, step, sharpness = 0.55) {
  const q = Math.round(y / step) * step;
  return lerp(y, q, sharpness);
}

/** Distance from point to a 2D polyline (used for canyon carving). */
export function distToPolyline(px, pz, pts) {
  let best = 1e18;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1];
    const bx = pts[i + 1][0], bz = pts[i + 1][1];
    const abx = bx - ax, abz = bz - az;
    const apx = px - ax, apz = pz - az;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? (apx * abx + apz * abz) / len2 : 0;
    t = clamp01(t);
    const dx = apx - abx * t, dz = apz - abz * t;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

/** Smooth 1D keyframe track: [[t,y],...] monotone-ish Catmull-Rom. */
export function sampleTrack(track, t) {
  const n = track.length;
  if (t <= track[0][0]) return track[0][1];
  if (t >= track[n - 1][0]) return track[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > track[i + 1][0]) i++;
  const t0 = track[i][0], t1 = track[i + 1][0];
  const u = (t - t0) / (t1 - t0);
  const p0 = track[Math.max(0, i - 1)][1];
  const p1 = track[i][1];
  const p2 = track[i + 1][1];
  const p3 = track[Math.min(n - 1, i + 2)][1];
  // Catmull-Rom
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Gaussian blob: 1 at centre, 0 outside radius (smooth). */
export function blob(dx, dz, rx, rz) {
  const q = Math.sqrt((dx / rx) * (dx / rx) + (dz / rz) * (dz / rz));
  return 1 - smoothstep(0.35, 1.0, q);
}
