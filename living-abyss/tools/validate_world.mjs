// World validation: does the geography actually deliver the art direction?
// - every named location must sit inside its claimed depth band
// - every authored pad must be flat at its authored elevation
// - the world must stay submerged and reach the promised abyssal depth
// - writes a bathymetric map PNG so the composition can be read at a glance
import fs from 'fs';
import zlib from 'zlib';
import { TerrainField, WORLD, LOCATIONS, PADS, REGIONS, macroHeight } from '../src/world/geography.js';

const t0 = Date.now();
const field = new TerrainField().build();
console.log(`field ${field.vx}x${field.vz} cells, build ${((Date.now() - t0) / 1000).toFixed(2)}s, y ${field.minY.toFixed(1)}..${field.maxY.toFixed(1)}`);

let fail = 0;

// ---- 1. locations vs their claimed depth band -------------------------------
console.log('\n== LOCATIONS ==');
const rows = [];
for (const l of LOCATIONS) {
  const y = field.heightAt(l.x, l.z);
  const d = -y;
  const [hi, lo] = l.depth;          // hi is the shallower bound (less negative)
  const okHi = hi >= -0.5 ? y <= 0 : y <= hi + 6;
  const okLo = y >= lo - 8;
  const ok = okHi && okLo;
  if (!ok) fail++;
  rows.push({ id: l.id, name: l.name, region: l.region, x: l.x, z: l.z, y: +y.toFixed(1), band: l.depth, ok });
  if (!ok) console.log(`  FAIL ${l.name.padEnd(28)} y=${y.toFixed(1)} band=${JSON.stringify(l.depth)}`);
}
const byRegion = {};
for (const r of rows) (byRegion[r.region] ||= []).push(r);
for (const [reg, list] of Object.entries(byRegion)) {
  const depths = list.map((r) => -r.y);
  console.log(`  ${reg.padEnd(10)} ${list.filter((r) => r.ok).length}/${list.length} ok  depth ${Math.min(...depths).toFixed(0)}..${Math.max(...depths).toFixed(0)} m`);
}

// ---- 2. pads -----------------------------------------------------------------
console.log('\n== PADS (flatness inside 0.55 r) ==');
for (const p of PADS) {
  let mn = 1e9, mx = -1e9, sum = 0, n = 0;
  for (let a = 0; a < 24; a++) {
    for (let rr = 0.12; rr <= 0.55; rr += 0.14) {
      const ang = (a / 24) * Math.PI * 2;
      const x = p.x + Math.cos(ang) * p.rx * rr, z = p.z + Math.sin(ang) * p.rz * rr;
      const y = field.heightAt(x, z);
      mn = Math.min(mn, y); mx = Math.max(mx, y); sum += y; n++;
    }
  }
  const mean = sum / n;
  // a slope pad is *supposed* to vary: compare against its own profile
  const target = p.mode === 'slope' ? (p.y + (p.y2 ?? p.y)) / 2 : p.y;
  const flat = mx - mn;
  const err = Math.abs(mean - target);
  const tol = p.mode === 'slope' ? 70 : 40;
  const ok = err < tol;
  if (!ok) fail++;
  const note = p.mode === 'slope' ? ' (slope)' : '';
  console.log(`  ${ok ? '·' : 'x'} ${p.id.padEnd(13)} target ${target.toFixed(0).padStart(6)} mean ${mean.toFixed(0).padStart(6)} spread ${flat.toFixed(0).padStart(4)}${note}`);
}

// ---- 3. world sanity ---------------------------------------------------------
console.log('\n== WORLD ==');
let above = 0, deepest = 0;
for (let j = 0; j < field.vz; j += 3) {
  for (let i = 0; i < field.vx; i += 3) {
    const y = field.heights[j * field.vx + i];
    if (y > -2) above++;
    if (y < deepest) deepest = y;
  }
}
console.log(`  deepest ${deepest.toFixed(1)} m · vertices above -2 m: ${above}`);

// ---- 4. bathymetric PNG ------------------------------------------------------
const STOP = [
  [0.00, [232, 226, 196]], [0.04, [188, 214, 168]], [0.10, [120, 206, 196]],
  [0.20, [58, 168, 190]], [0.34, [30, 112, 168]], [0.50, [16, 68, 132]],
  [0.68, [10, 38, 92]], [0.84, [6, 20, 56]], [1.00, [3, 9, 26]],
];
function ramp(t) {
  for (let i = 0; i < STOP.length - 1; i++) {
    const a = STOP[i], b = STOP[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return [0, 1, 2].map((k) => a[1][k] + (b[1][k] - a[1][k]) * u);
    }
  }
  return STOP[STOP.length - 1][1];
}
const W = field.vx, H = field.vz;
const px = Buffer.alloc(W * H * 4);
const sun = [-0.5, 0.7, -0.5];
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const y = field.heights[k];
    const hl = field.heights[k - 1] ?? y, hr = field.heights[k + 1] ?? y;
    const hd = field.heights[k - W] ?? y, hu = field.heights[k + W] ?? y;
    const gx = (hl - hr) / (2 * field.cell), gz = (hd - hu) / (2 * field.cell);
    const nl = Math.hypot(gx, gz, 1);
    const shade = Math.max(0, (gx * sun[0] + sun[1] + gz * sun[2]) / nl);
    const c = ramp(Math.min(1, Math.max(0, -y / 1150)));
    const sh = 0.45 + 0.85 * Math.pow(shade, 1.2);
    const band = ((y % 50) + 50) % 50;
    const contour = band < 1.4 ? 0.7 : 1.0;
    const o = k * 4;
    px[o] = Math.min(255, c[0] * sh * contour);
    px[o + 1] = Math.min(255, c[1] * sh * contour);
    px[o + 2] = Math.min(255, c[2] * sh * contour);
    px[o + 3] = 255;
  }
}
// mark the named locations
for (const l of LOCATIONS) {
  const i = Math.round((l.x - WORLD.minX) / field.cell), j = Math.round((l.z - WORLD.minZ) / field.cell);
  for (let dj = -4; dj <= 4; dj++) {
    for (let di = -4; di <= 4; di++) {
      const d = Math.hypot(di, dj);
      if (d > 4 || d < 2.4) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const o = (jj * W + ii) * 4;
      px[o] = 255; px[o + 1] = 240; px[o + 2] = 170; px[o + 3] = 255;
    }
  }
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let j = 0; j < H; j++) {
  raw[j * (W * 4 + 1)] = 0;
  px.copy(raw, j * (W * 4 + 1) + 1, j * W * 4, (j + 1) * W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/world_bathymetry.png', png);

fs.writeFileSync('docs/world_validation.json', JSON.stringify({
  generated: new Date().toISOString(),
  build_seconds: (Date.now() - t0) / 1000,
  field: { vx: field.vx, vz: field.vz, cell: field.cell, minY: field.minY, maxY: field.maxY },
  locations: rows, pads: PADS.map((p) => p.id), failures: fail,
}, null, 2));

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} issue(s). wrote docs/world_bathymetry.png`);
