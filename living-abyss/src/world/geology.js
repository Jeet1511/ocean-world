// -----------------------------------------------------------------------------
// THE LIVING ABYSS — monumental geology (art-directed, sealed solids)
//
// Every formation in this file is a CLOSED, outward-facing solid. The original
// generators relied on their open ends being buried in the seabed; wherever a
// player could see one, the rock read as a hollow shell. Here:
//
//   towers    → lathe body + base cap + closed broken crown
//   arches    → swept superellipse tube, both ends capped below ground
//   shelves   → closed lens (top surface, soffit, shared rim)
//   walls     → swept polyline solid with capped ends and an overhanging lip
//   boulders  → displaced icosahedra (closed by construction)
//
// Families are authored per location, so no two hero places share a silhouette.
// `tools/validate_meshes.mjs` welds and measures every one of them.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { mulberry32, fbm3, clamp, lerp } from '../core/noise.js?rev=37';
import { WORLD, CANYONS, LOCATIONS, MASSIFS, PORTALS } from './geography.js?rev=37';
import { createRockMaterial } from './rockmat.js?rev=37';
import { createMeshContactGuard } from '../player/mesh-contact.js?rev=37';
import { InstanceFrustumCompactor, InstanceFrustumView } from '../rendering/instance-frustum.js?rev=37';

const ssJS = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
function bakeRockAO(geo, opts = {}) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const ao = new Float32Array(pos.count);
  const { seed = 0, floorDark = 0.5, heightNorm = 1, cavity = 0.34 } = opts;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const hMin = box.min.y, hMax = box.max.y;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = heightNorm > 0 ? clamp((y - hMin) / Math.max(1e-3, hMax - hMin), 0, 1) : 0.5;
    const cav = fbm3(x * 0.16 + seed, y * 0.16, z * 0.16 - seed, 3);
    const up = nrm ? clamp(nrm.getY(i), 0, 1) : 0.5;
    let a = floorDark + (1 - floorDark) * (0.30 + 0.70 * Math.pow(t, 0.75));
    a *= 0.66 + 0.46 * cav;
    // downwards-facing surfaces (soffits, overhangs) sit in their own shade
    a *= 1 - cavity * (1 - up) * 0.5;
    ao[i] = clamp(a, 0.14, 1);
  }
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  return geo;
}

class GeoWriter {
  constructor() { this.pos = []; this.uv = []; this.idx = []; }
  v(x, y, z, u = 0, w = 0) { this.pos.push(x, y, z); this.uv.push(u, w); return this.pos.length / 3 - 1; }
  /** Duplicate a vertex so a hard crease (cap meets wall) shades as a crease. */
  dup(i) { return this.v(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.uv[i * 2], this.uv[i * 2 + 1]); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, c, b, b, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---------------------------------------------------------------------------
// 1 · STRATIFIED LIMESTONE TOWER / MONUMENTAL PILLAR
// Profile is authored in metres: a wide flared base, a pinched waist, shoulders,
// a broken crown. Rings are lathed with per-vertex erosion noise.
// ---------------------------------------------------------------------------
export function makeTower(rng, opts = {}) {
  const height = opts.height ?? 120;
  const radius = opts.radius ?? 26;
  const radial = opts.radial ?? 34;
  const rings = opts.rings ?? 54;
  const seed = (opts.seed ?? rng() * 90) + 0.5;
  const flare = opts.flare ?? 1.85;         // base skirt multiplier
  const waist = opts.waist ?? 0.62;         // narrowest point as a fraction
  const crown = opts.crown ?? 'broken';
  const lean = opts.lean ?? 0.10;

  const leanX = (rng() - 0.5) * lean * 2, leanZ = (rng() - 0.5) * lean * 2;
  const w = new GeoWriter();
  const ringIndex = [];

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // --- profile: flare → waist → shoulders → crown ---
    const base = lerp(flare, 1.0, ssJS(0.0, 0.18, t));
    const waistK = 1.0 - (1.0 - waist) * Math.sin(Math.PI * clamp((t - 0.16) / 0.46, 0, 1));
    const shoulder = 1 + 0.20 * Math.sin(Math.PI * clamp((t - 0.55) / 0.34, 0, 1));
    const taper = 1 - 0.34 * Math.pow(clamp((t - 0.62) / 0.38, 0, 1), 1.5);
    const strat = 1 + 0.055 * Math.sin(t * height * 0.55 + seed) * (0.35 + 0.65 * t);
    const prof = base * waistK * shoulder * taper * strat;
    const y = t * height;
    const cx = leanX * height * Math.pow(t, 1.6);
    const cz = leanZ * height * Math.pow(t, 1.6);
    ringIndex.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // fluting: vertical erosion channels, stronger toward the base
      const flute = 1
        + 0.10 * Math.sin(a * 7 + seed) * (1.1 - t * 0.5)
        + 0.055 * Math.sin(a * 13 - seed * 1.7)
        + 0.035 * Math.sin(a * 23 + seed * 0.7);
      const rx = ca * prof * flute, rz = sa * prof * flute;
      const px = cx + rx * radius, pz = cz + rz * radius;
      // 3D erosion noise on the world-space position
      const n = fbm3(px * 0.028 + seed, y * 0.022, pz * 0.028 - seed, 3) * 0.26
              + fbm3(px * 0.09, y * 0.08, pz * 0.09, 3) * 0.09;
      const k = 1 + n;
      // never let erosion invert the silhouette
      const py = y + Math.sin(a * 3 + seed) * radius * 0.05 * (1 - t);
      ringIndex[i].push(w.v(cx + rx * radius * k, py, cz + rz * radius * k, j / radial, t));
    }
  }

  // side walls
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      w.quad(ringIndex[i][j], ringIndex[i][j + 1], ringIndex[i + 1][j], ringIndex[i + 1][j + 1]);
    }
  }

  // --- BASE CAP: a buried disc, so the tower is a solid, not a tube ---------
  // duplicated ring => the wall/cap junction is a real crease, not a smoothed
  // smear that reads as a dark halo around every tower base
  const baseRing = [];
  for (let j = 0; j <= radial; j++) baseRing.push(w.dup(ringIndex[0][j]));
  const baseCentre = w.v(leanX * 0, -height * 0.02, leanZ * 0, 0.5, 0);
  for (let j = 0; j < radial; j++) {
    w.tri(baseCentre, baseRing[j + 1], baseRing[j]);
  }

  // --- CROWN: broken top, closed with a fan to one off-centre apex ----------
  const topRing = ringIndex[rings];
  let apexY = height, apexI = 0;
  const apexPos = [];
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    const notch = 0.55 + 0.45 * Math.abs(Math.sin(a * 3.7 + seed));
    apexPos.push(notch);
    if (notch > 0.985) { apexY = height + radius * 0.42 * notch; apexI = j; }
  }
  apexY = Math.max(apexY, height + radius * 0.18);
  const apex = w.v(leanX * height + (rng() - 0.5) * radius * 0.25, apexY, leanZ * height + (rng() - 0.5) * radius * 0.25, 0.5, 1);
  // intermediate jagged ring so the crown is a ridge line, not a cone
  const crownRing = [];
  const topRingDup = [];
  for (let j = 0; j <= radial; j++) topRingDup.push(w.dup(topRing[j % radial]));
  for (let j = 0; j <= radial; j++) {
    const jj = j % radial;
    const a = (jj / radial) * Math.PI * 2;   // wrap so the seam vertex coincides
    const p0 = topRing[jj];
    const x = w.pos[p0 * 3], y = w.pos[p0 * 3 + 1], z = w.pos[p0 * 3 + 2];
    const notch = 0.55 + 0.45 * Math.abs(Math.sin(a * 3.7 + seed));
    crownRing.push(w.v(
      lerp(x, w.pos[apex * 3], 0.42),
      y + (apexY - y) * 0.42 * notch,
      lerp(z, w.pos[apex * 3 + 2], 0.42),
      j / radial, 1,
    ));
  }
  for (let j = 0; j < radial; j++) {
    w.quad(topRingDup[j], topRingDup[j + 1], crownRing[j], crownRing[j + 1]);
    w.tri(crownRing[j], crownRing[j + 1], apex);
  }

  const geo = w.build();
  bakeRockAO(geo, { seed, floorDark: 0.40, cavity: 0.42 });
  return geo;
}

// ---------------------------------------------------------------------------
// 2 · NATURAL ARCH — swept superellipse tube spanning two real shoulders
// ---------------------------------------------------------------------------
export function makeArch(spec, field) {
  const { x1, z1, x2, z2, thickness = 30, seed = 1 } = spec;
  const y1 = field.heightAt(x1, z1);
  const y2 = field.heightAt(x2, z2);

  // the span must clear its own valley, or it is a hill with a hole painted on
  let hMax = -1e9;
  for (let i = 1; i < 24; i++) {
    const t = i / 24;
    hMax = Math.max(hMax, field.heightAt(lerp(x1, x2, t), lerp(z1, z2, t)));
  }
  const clearance = 34 + thickness * 1.1;
  const crownY = Math.min(-10, hMax + clearance);
  const pts = [];
  const SEG = 26;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const x = lerp(x1, x2, t), z = lerp(z1, z2, t);
    const baseY = lerp(y1, y2, t);
    const rise = ssJS(0.0, 0.16, t) * ssJS(0.0, 0.16, 1 - t);
    const y = baseY + (crownY - baseY) * rise;
    const into = Math.max(0, 1 - Math.min(t, 1 - t) * 6.2);
    pts.push(new THREE.Vector3(x, y - into * (30 + thickness * 1.7), z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.22);
  const segs = 96, radial = 26;
  const frames = curve.computeFrenetFrames(segs, false);
  const seedN = seed * 13.7;
  const w = new GeoWriter();
  const rings = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    const Nf = frames.normals[Math.min(i, segs)];
    const Bf = frames.binormals[Math.min(i, segs)];
    const pier = Math.pow(Math.abs(t - 0.5) * 2, 3.0);
    const halfW = thickness * (1.05 + 1.55 * (1 - pier));   // horizontal
    const halfT = thickness * (0.50 + 0.95 * pier);         // vertical
    rings.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const e = 2.7;                                        // flat deck + flat soffit
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
      const flute = 1 + 0.085 * Math.sin(a * 6 + t * 12 + seedN) + 0.045 * Math.sin(a * 11 - t * 5);
      let x = P.x + (Nf.x * sx * halfW + Bf.x * sy * halfT) * flute;
      let y = P.y + (Nf.y * sx * halfW + Bf.y * sy * halfT) * flute;
      let z = P.z + (Nf.z * sx * halfW + Bf.z * sy * halfT) * flute;
      const n = fbm3(x * 0.024 + seedN, y * 0.020, z * 0.024, 3) * thickness * 0.34
              + fbm3(x * 0.085, y * 0.075, z * 0.085, 3) * thickness * 0.13;
      const out = Math.hypot(x - P.x, y - P.y, z - P.z) || 1;
      x += (x - P.x) / out * n; y += (y - P.y) / out * n; z += (z - P.z) / out * n;
      rings[i].push(w.v(x, y, z, j / radial, t));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      w.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j], rings[i + 1][j + 1]);
    }
  }
  // --- END CAPS: both ends are below ground, but they are still closed -------
  for (const end of [0, segs]) {
    const c = curve.getPointAt(end === 0 ? 0 : 1);
    const ci = w.v(c.x, c.y, c.z, 0.5, end === 0 ? 0 : 1);
    const ring = rings[end].map((ix) => w.dup(ix));
    for (let j = 0; j < radial; j++) {
      if (end === 0) w.tri(ci, ring[j + 1], ring[j]);
      else w.tri(ci, ring[j], ring[j + 1]);
    }
  }

  const geo = w.build();
  bakeRockAO(geo, { seed: seedN, floorDark: 0.44, cavity: 0.5 });
  return { geo, curve };
}

// ---------------------------------------------------------------------------
// 3 · OVERHANGING SHELF — a closed lens: deck, soffit, shared rim
// ---------------------------------------------------------------------------
export function makeShelf(rng, opts = {}) {
  const L = opts.length ?? 220, Wd = opts.width ?? 170, T = opts.thickness ?? 20;
  const nu = opts.nu ?? 48, nv = opts.nv ?? 34;
  const seed = rng() * 80 + 1;
  const w = new GeoWriter();
  const top = [], bot = [];
  const shape = (u, v) => {
    // superellipse footprint with noisy rim
    const a = u * Math.PI * 2;
    const rx = 0.5 * L, rz = 0.5 * Wd;
    const rim = 1 + 0.14 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 7 - seed * 1.3);
    return [Math.cos(a) * rx * v * rim, Math.sin(a) * rz * v * rim, a, v];
  };
  // rings from centre (v=0) to rim (v=1)
  for (let iv = 0; iv <= nv; iv++) {
    const v = iv / nv;
    top.push([]); bot.push([]);
    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu;
      const [x, z, a, vv] = shape(u, v);
      // deck: gently domed, eroded
      const dome = 1 - vv * vv;
      const deckY = T * 0.42 * dome
        + fbm3(x * 0.02 + seed, 3.1, z * 0.02, 3) * T * 0.16
        + fbm3(x * 0.08, 7.7, z * 0.08, 3) * T * 0.05;
      // soffit: deep bowl underneath, deepest in the middle
      const soffitY = -T * (0.62 + 0.55 * dome) * (0.82 + 0.3 * fbm3(x * 0.018 - seed, 1.1, z * 0.018, 3));
      const tilt = (x / L) * T * 0.18;
      top[iv].push(w.v(x, deckY + tilt, z, u, v));
      bot[iv].push(w.v(x, soffitY + tilt, z, u, v));
    }
  }
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      w.quad(top[iv][iu], top[iv][iu + 1], top[iv + 1][iu], top[iv + 1][iu + 1]);
      w.quad(bot[iv + 1][iu], bot[iv + 1][iu + 1], bot[iv][iu], bot[iv][iu + 1]);
    }
  }
  // the rim ring is shared by both surfaces: weld indices so there is no crack
  for (let iu = 0; iu < nu; iu++) {
    const a = top[nv][iu], b = top[nv][iu + 1];
    const c = bot[nv][iu], d = bot[nv][iu + 1];
    w.quad(c, d, a, b);
  }
  // centre poles (v = 0 ring collapses to a point; replace with a fan)
  const geo = w.build();
  bakeRockAO(geo, { seed, floorDark: 0.42, cavity: 0.55 });
  return geo;
}

// ---------------------------------------------------------------------------
// 4 · STRATIFIED WALL — long cliff band swept along a polyline
// ---------------------------------------------------------------------------
export function makeWall(spec, field) {
  const { pts, height = 70, thickness = 22, seed = 3, overhang = 0.28 } = spec;
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, field.heightAt(x, z), z)), false, 'catmullrom', 0.3);
  const segs = Math.max(24, Math.round(curve.getLength() / 18));
  const radial = 14;
  const w = new GeoWriter();
  const rings = [];
  const frames = curve.computeFrenetFrames(segs, false);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    const Nf = frames.normals[Math.min(i, segs)];
    const Bf = frames.binormals[Math.min(i, segs)];
    const hh = height * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 9.1 + seed)))
             * (0.7 + 0.6 * fbm3(t * 6 + seed, 2.2, 1.1, 2));
    rings.push([]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const e = 3.2;
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e);
      const hw = thickness * (1 + overhang * Math.max(0, sy));
      const hh2 = hh * 0.5;
      let x = P.x + Nf.x * sx * hw + Bf.x * sy * hh2;
      let y = P.y + hh2 + Nf.y * sx * hw + Bf.y * sy * hh2;
      let z = P.z + Nf.z * sx * hw + Bf.z * sy * hh2;
      const n = 1 + (fbm3(x * 0.03 + seed, y * 0.026, z * 0.03, 3) - 0.5) * 0.28;
      x = P.x + (x - P.x) * n;
      z = P.z + (z - P.z) * n;
      rings[i].push(w.v(x, y, z, j / radial, t));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) w.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j], rings[i + 1][j + 1]);
  }
  for (const end of [0, segs]) {
    const P = curve.getPointAt(end === 0 ? 0 : 1);
    const ci = w.v(P.x, P.y, P.z, 0.5, 0);
    const ring = rings[end].map((ix) => w.dup(ix));
    for (let j = 0; j < radial; j++) {
      if (end === 0) w.tri(ci, ring[j + 1], ring[j]); else w.tri(ci, ring[j], ring[j + 1]);
    }
  }
  const geo = w.build();
  bakeRockAO(geo, { seed, floorDark: 0.46, cavity: 0.45 });
  return geo;
}

// ---------------------------------------------------------------------------
// 5 · BOULDER — displaced icosahedron, always closed
// ---------------------------------------------------------------------------
// IcosahedronGeometry is non-indexed, so computeVertexNormals alone gives
// every triangle a separate flat normal. Average coincident corners without
// changing positions or indices: the visible surface and collision triangles
// stay identical while weathered rock no longer looks like a low-poly crystal.
export function smoothBoulderNormals(geo){
  const pos=geo.attributes.position,n=geo.attributes.normal,groups=new Map(),keys=new Array(pos.count);
  for(let i=0;i<pos.count;i++){
    const key=`${Math.round(pos.getX(i)*1e5)},${Math.round(pos.getY(i)*1e5)},${Math.round(pos.getZ(i)*1e5)}`;
    keys[i]=key;let sum=groups.get(key);if(!sum){sum=[0,0,0];groups.set(key,sum);}
    sum[0]+=n.getX(i);sum[1]+=n.getY(i);sum[2]+=n.getZ(i);
  }
  for(let i=0;i<pos.count;i++){
    const s=groups.get(keys[i]),len=Math.hypot(...s)||1;n.setXYZ(i,s[0]/len,s[1]/len,s[2]/len);
  }
  n.needsUpdate=true;return geo;
}

export function makeBoulder(seed, detail = 3) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n1 = fbm3(v.x * 1.35 + seed, v.y * 1.35, v.z * 1.35 - seed, 3);
    const n2 = fbm3(v.x * 4.2, v.y * 4.2 + seed, v.z * 4.2, 2);
    const n3 = fbm3(v.x * 11.0, v.y * 11.0 - seed, v.z * 11.0, 2);
    // stratified knuckles: the low-frequency term carries the mass, the mid and
    // high terms give it ledges, then rubble. A smooth ellipsoid is not a rock.
    const strata = Math.sin(v.y * 7.5 + n1 * 4.0) * 0.09;
    const k = 0.72 + n1 * 0.52 + n2 * 0.20 + n3 * 0.07 + strata;
    v.multiplyScalar(k);
    v.y *= 0.68;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  smoothBoulderNormals(geo);
  bakeRockAO(geo, { seed, floorDark: 0.44, heightNorm: 1, cavity: 0.3 });
  return geo;
}

// Fit an inscribed ellipsoid to a transformed boulder, rather than assuming
// its irregular surface fills a fixed fraction of its bounding box. Every
// triangle is measured in ellipsoid-normalised space, so the core does not
// protrude through the visible surface. The procedural boulder is radial about
// the generation centre. This is intentionally conservative: outer ledges may
// be penetrable, but empty water must not acquire giant invisible barriers.
export function fitBoulderCore(geo, centre) {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const rx = Math.max(0.001, Math.max(centre.x - box.min.x, box.max.x - centre.x) * 0.72);
  const ry = Math.max(0.001, Math.max(centre.y - box.min.y, box.max.y - centre.y) * 0.72);
  const rz = Math.max(0.001, Math.max(centre.z - box.min.z, box.max.z - centre.z) * 0.72);
  const p = geo.attributes.position, idx = geo.index;
  const tri = new THREE.Triangle(), origin = new THREE.Vector3(), nearest = new THREE.Vector3();
  let minSq = Infinity;
  const count = idx ? idx.count : p.count;
  const setVertex = (v, i) => v.set((p.getX(i)-centre.x)/rx, (p.getY(i)-centre.y)/ry, (p.getZ(i)-centre.z)/rz);
  for (let i=0; i+2<count; i+=3) {
    setVertex(tri.a, idx ? idx.getX(i) : i);
    setVertex(tri.b, idx ? idx.getX(i+1) : i+1);
    setVertex(tri.c, idx ? idx.getX(i+2) : i+2);
    tri.closestPointToPoint(origin, nearest);
    minSq = Math.min(minSq, nearest.lengthSq());
  }
  const fit = Math.min(1, Math.sqrt(minSq) * 0.98);
  return { rx:rx*fit, ry:ry*fit, rz:rz*fit, fit };
}

// ---------------------------------------------------------------------------
// merge helper
// ---------------------------------------------------------------------------
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    // Both GeoWriter meshes (indexed) and Three.js icosahedra
    // (non-indexed) must contribute triangles to the merged geometry.
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const ao = new Float32Array(vCount);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal;
    const a = g.attributes.aAO, t = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (n) nrm.set(n.array, vo * 3);
    if (a) ao.set(a.array, vo); else ao.fill(0.8, vo, vo + p.count);
    if (t) uv.set(t.array, vo * 2);
    const gi = g.index;
    if (gi) {
      for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
      io += gi.count;
    } else {
      // Non-indexed input consists of sequential triangle vertices. Its
      // vertices were formerly copied but never referenced, so all bommies
      // disappeared while their collider volumes remained active.
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
    g.dispose?.();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// AUTHORED HERO PLANS — one per named location that should be monumental
// ---------------------------------------------------------------------------
const loc = (id) => LOCATIONS.find((l) => l.id === id);

const HERO = [
  // Z1 · Glass Horizon — low ribs and one drowned reef knuckle field
  { loc: 'glasshorizon', kind: 'pinnacles', family: 'limestone', count: 11, h: [8, 22] },

  // Z2 Roseglass uses the terrain terraces and scanned reef colonies. The old
  // tower generator produced mushroom-shaped floating slabs, so it is removed
  // rather than cosmetically recolored.
  // Z3 · Verdant Cathedral — a rock wall behind the forest, one pinnacle in it
  { loc: 'verdant', kind: 'wall', family: 'reef', h: 62, len: 320 },
  { loc: 'verdant', kind: 'twins', family: 'limestone', sep: 210, h: [70, 96] },
  // Z4 · The Pillars of Aurel — colonnade plus broken outer court masses.
  { loc: 'aurel', kind: 'pillarRing', family: 'limestone', count: 9, ring: 132, h: [72, 118], r: [13, 19] },
  { loc: 'aurel', kind: 'crags', family: 'limestone', count: 7, spread: 225, h: [34, 68], r: [11, 22] },
  // Z5 · The Azure Span — bridge, shoulders, canyon wall and distant buttresses.
  { loc: 'azurespan', kind: 'arch', family: 'limestone', span: [-590, -300, -370, -390], thickness: 26 },
  { loc: 'azurespan', kind: 'wall', family: 'sandstone', h: 96, len: 340 },
  { loc: 'azurespan', kind: 'crags', family: 'sandstone', count: 8, spread: 215, h: [58, 112], r: [15, 30] },
  // Z6 · The Flooded Nave — restrained mineral columns inside the real vault.
  { loc: 'floodednave', kind: 'pillarRing', family: 'mineral', count: 5, ring: 78, h: [26, 46], r: [6, 10] },
  // Z7 · The Abyssal Bowl — gate towers, descending ring and irregular rim teeth.
  { loc: 'abyssalbowl', kind: 'twins', family: 'basalt', sep: 230, h: [150, 190] },
  { loc: 'abyssalbowl', kind: 'pillarRing', family: 'basalt', count: 6, ring: 210, h: [80, 140], r: [16, 26] },
  { loc: 'abyssalbowl', kind: 'crags', family: 'basalt', count: 10, spread: 270, h: [72, 148], r: [20, 40] },
];


// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
// Sink each lower part of a tower into the *rendered triangular terrain*.
// The old flat base disc sat above the seabed along parts of its wide rim.
// Drape the lower rings gradually, leaving the upper silhouette unchanged.
export function groundTowerBase(geo,field,baseY,height,radius){
  const p=geo.attributes.position, origin=baseY-height*.06;
  const baseVariation=radius*.05, blend=Math.max(1.5,height*.16);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),y=p.getY(i);
    const local=Math.max(0,y-origin-baseVariation);
    if(local>=blend)continue;
    const floor=field.surfaceHeightAt(x,z);
    const sink=Math.max(0,origin+baseVariation-floor+.45);
    const t=Math.max(0,Math.min(1,local/blend));
    const weight=1-t*t*(3-2*t);
    p.setY(i,y-sink*weight);
  }
  p.needsUpdate=true;geo.computeVertexNormals();
  geo.computeBoundingBox();geo.computeBoundingSphere();
}

export function buildGeology(field, controller) {
  const group = new THREE.Group();
  group.name = 'geology';
  const rng = mulberry32(20261030);
  const colliders = controller ? controller.colliders : null;
  const addCollider = (c, guard = null) => {
    if (colliders) {
      // Keep the retained source mesh out of diagnostic JSON and debug overlays.
      if (guard) Object.defineProperty(c, 'meshGuard', {value: guard, enumerable: false});
      c.debugId = `rock-collider-${colliders.length}`;
      colliders.push(c);
    }
  };

  const mats = {
    limestone: createRockMaterial({ family: 'limestone', detail: 1.0 }),
    reef: createRockMaterial({ family: 'reef', detail: 1.05 }),
    sandstone: createRockMaterial({ family: 'sandstone', detail: 1.0 }),
    basalt: createRockMaterial({ family: 'basalt', detail: 1.15, wetness: 0.85 }),
    mineral: createRockMaterial({ family: 'mineral', detail: 0.9, mineral: 0.8, wetness: 0.9 }),
  };
  const buckets = { limestone: [], reef: [], sandstone: [], basalt: [], mineral: [] };
  const stats = { formations: 0, arches: [], towers: [], walls: [], shelves: 0 };

  // Keep the source geometry for collision and gate placement. Guards are built
  // only when a player reaches the corresponding visual bounds.
  const surfaceSolids = controller ? controller.surfaceSolids : [];
  const registerSurface = (geo, source, matrix = null) => {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bounds=geo.boundingBox.clone();
    if(matrix) bounds.applyMatrix4(matrix);
    const worldMatrix=matrix ? matrix.clone() : null;
    surfaceSolids.push({bounds,source,geometry:geo,matrix:worldMatrix,createGuard:() => {
      const worldGeo=worldMatrix ? geo.clone().applyMatrix4(worldMatrix) : geo;
      return createMeshContactGuard(worldGeo);
    }});
  };
  const put = (family, geo, source = null) => { buckets[family].push(geo); stats.formations++; registerSurface(geo, source || `formation:${family}:${stats.formations}`); };

  // ---------------- towers ------------------------------------------------
  // The seven gate bowls must stay clear: a teleporter embedded in a rock is
  // not a teleporter.
  const nearGate = (x, z) => PORTALS.some((p) => Math.hypot(x - p.x, z - p.z) < 62);
  const tower = (x, z, h, r, family, opts = {}) => {
    if (nearGate(x, z)) return null;
    const baseY = field.surfaceHeightAt(x, z);
    h = Math.max(5, Math.min(h, -baseY * 0.92));
    // A 7 m high shallow pinnacle previously had a 20 m radius and a 1.5x
    // base flare: it read as a floating horizontal slab over the swimming area.
    // Keep shallow formations vertically proportioned rather than giant discs.
    if(baseY > -28) r=Math.min(r,Math.max(2.0,h*.70));
    const geo = makeTower(rng, { height: h, radius: r, ...opts });
    geo.translate(x, baseY - h * 0.06, z);
    groundTowerBase(geo,field,baseY,h,r);
    const visualBounds = { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() };
    put(family, geo);
    stats.towers.push({ x, z, y: baseY, h, r });
    // Derive the collision cores from the actual deformed rings, including
    // the lean of this specific tower. The former vertical cylinders ignored
    // lean and used an unrelated taper, extending into open water at the waist.
    const radial = opts.radial ?? 34, rings = opts.rings ?? 54, steps = 6;
    const pos = geo.attributes.position;
    for (let s = 0; s < steps; s++) {
      const lo = Math.floor(s * rings / steps), hi = Math.floor((s + 1) * rings / steps);
      const mid = Math.floor((lo + hi) / 2);
      let cx = 0, cz = 0;
      for (let j = 0; j < radial; j++) {
        const i = mid * (radial + 1) + j;
        cx += pos.getX(i); cz += pos.getZ(i);
      }
      cx /= radial; cz /= radial;
      let minRadius = Infinity, yBase = Infinity, yTop = -Infinity;
      for (let ring = lo; ring <= hi; ring++) {
        for (let j = 0; j < radial; j++) {
          const i = ring * (radial + 1) + j;
          minRadius = Math.min(minRadius, Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz));
          yBase = Math.min(yBase, pos.getY(i)); yTop = Math.max(yTop, pos.getY(i));
        }
      }
      addCollider({ type: 'cyl', x: cx, z: cz, yBase, yTop,
        r: Math.max(0.5, minRadius * 0.90), source: `tower:${family}:${x.toFixed(1)},${z.toFixed(1)}`, visualBounds });
    }
    return { x, z, y: baseY, h, r };
  };

  for (const plan of HERO) {
    const L = loc(plan.loc);
    if (!L) continue;
    const baseY = field.heightAt(L.x, L.z);

    if (plan.kind === 'pillarRing') {
      for (let i = 0; i < plan.count; i++) {
        const a = (i / plan.count) * Math.PI * 2 + rng() * 0.4;
        const rad = plan.ring * (0.75 + rng() * 0.55);
        const x = L.x + Math.cos(a) * rad, z = L.z + Math.sin(a) * rad;
        const h = lerp(plan.h[0], plan.h[1], rng());
        const r = lerp(plan.r[0], plan.r[1], rng());
        tower(x, z, Math.max(40, Math.min(h, -field.heightAt(x, z) - 12)), r, plan.family);
      }
      // a low podium ring so the columns grow out of a broken platform
      const pod = makeShelf(rng, { length: plan.ring * 2.1, width: plan.ring * 1.9, thickness: 9 });
      pod.translate(L.x, baseY + 6, L.z);
      if (plan.loc === 'floodednave') {
        // This huge artificial disc floated across the cavern entrance as a
        // straight dark slab. Keep the columns but remove that specific slab
        // and its surface registration, so visual and collision stay aligned.
        pod.dispose();
      } else { put(plan.family, pod); stats.shelves++; }
    }

    if (plan.kind === 'twins') {
      tower(L.x - plan.sep * 0.5, L.z - 30, Math.min(plan.h[0], -baseY - 14), 34, plan.family, { flaw: 1 });
      tower(L.x + plan.sep * 0.5, L.z + 40, Math.min(plan.h[1], -baseY - 14), 44, plan.family, {
        waist: 0.5, flare: 1.5, crown: 'flat',
      });
    }

    if (plan.kind === 'crags') {
      // A reef crag field: chunky, leaning towers of different heights packed
      // into a loose group, so every view has a near, a mid and a far mass.
      for (let i = 0; i < plan.count; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * (plan.spread ?? 120);
        const x = L.x + Math.cos(a) * rad, z = L.z + Math.sin(a) * rad;
        const depth = -field.heightAt(x, z);
        if (depth < 8) continue;
        const h = Math.min(lerp(plan.h[0], plan.h[1], Math.pow(rng(), 1.3)), depth * 0.88);
        const r = lerp(plan.r[0], plan.r[1], rng());
        tower(x, z, h, r, plan.family, {
          flare: 1.25 + rng() * 0.5, waist: 0.55 + rng() * 0.3,
          crown: rng() > 0.5 ? 'broken' : 'flat', flaw: rng(),
        });
      }
    }

    if(plan.kind==='reefCorridor'){
      // Authored paired spurs: high masses stay outside the navigable centre,
      // step down toward the player, and overlap in depth instead of forming a
      // procedural ring. Heights are clamped to the actual shallow water.
      const masses=[[-78,42,18,22],[-62,-6,15,20],[-92,-58,12,18],[-48,-104,10,16],
                    [76,55,19,23],[60,4,15,20],[96,-52,13,19],[50,-112,9,15],
                    [-132,92,14,20],[130,105,15,21]];
      for(let i=0;i<masses.length;i++){
        const [dx,dz,wantH,r]=masses[i],x=L.x+dx,z=L.z+dz,depth=-field.heightAt(x,z);
        if(depth<7)continue;
        tower(x,z,Math.max(6,Math.min(wantH,depth*.82)),r,plan.family,{
          flare:1.45+(i%3)*.12,waist:.60+(i%2)*.12,crown:i%2?'broken':'flat',flaw:.35+i*.047
        });
      }
    }

    if (plan.kind === 'pinnacles') {
      for (let i = 0; i < plan.count; i++) {
        const a = rng() * Math.PI * 2, rad = 120 + rng() * 260;
        const x = L.x + Math.cos(a) * rad, z = L.z + Math.sin(a) * rad;
        const depth = -field.heightAt(x, z);
        // a pinnacle can never be taller than the water it stands in — the old
        // clamp went negative on the shallow shelf and emitted inverted towers
        const h = Math.max(6, Math.min(lerp(plan.h[0], plan.h[1], rng()), depth * 0.86));
        if (depth < 7) continue;
        tower(x, z, h, 8 + rng() * 12, plan.family,
          { flare: 1.5, waist: 0.75, radial: 20, rings: 30 });
      }
    }

    if (plan.kind === 'arch') {
      const [x1, z1, x2, z2] = plan.span;
      const { geo, curve } = makeArch({ x1, z1, x2, z2, thickness: plan.thickness, seed: stats.arches.length + 3 }, field);
      geo.computeBoundingBox();
      const visualBounds = { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() };
      put(plan.family, geo);
      stats.arches.push({
        p0: curve.getPointAt(0.5).toArray(), span: Math.hypot(x2 - x1, z2 - z1),
        crown: curve.getPointAt(0.5).y, thickness: plan.thickness,
      });
      const steps = 12;
      const contactGuard = colliders ? createMeshContactGuard(geo) : null;
      for (let s = 0; s < steps; s++) {
        const a = curve.getPointAt(s / steps), b = curve.getPointAt((s + 1) / steps);
        addCollider({
          type: 'cap', x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z,
          r: plan.thickness * 0.92, source: `arch:${plan.loc}`, visualBounds,
        }, contactGuard);
      }
      // the piers themselves need mass, or the bridge has nothing to stand on
      tower(x1, z1, Math.max(60, -field.heightAt(x1, z1) - 10), plan.thickness * 1.5, plan.family, { flare: 1.7 });
      tower(x2, z2, Math.max(60, -field.heightAt(x2, z2) - 10), plan.thickness * 1.4, plan.family, { flare: 1.6 });
    }

    if (plan.kind === 'shelfStack') {
      for (let i = 0; i < plan.count; i++) {
        const y = baseY + 34 + i * (plan.th + 22);
        const geo = makeShelf(rng, { length: plan.len * (1 - i * 0.12), width: plan.wid * (1 - i * 0.1), thickness: plan.th });
        geo.rotateY(rng() * Math.PI * 2);
        geo.translate(L.x + (rng() - 0.5) * 60, y, L.z + (rng() - 0.5) * 60);
        put(plan.family, geo); stats.shelves++;
        addCollider({
          type: 'cyl', x: L.x, z: L.z, yBase: y - plan.th, yTop: y + plan.th * 0.5,
          r: Math.min(plan.len, plan.wid) * 0.42,
        });
      }
    }

    if (plan.kind === 'wallPair') loadWalls(plan, L, baseY);
    if (plan.kind === 'wall') loadWalls({ ...plan, count: 1 }, L, baseY);
    if (plan.kind === 'wallStack') {
      for (let i = 0; i < plan.count; i++) {
        const y = baseY + 10 + i * 26;
        const geo = makeShelf(rng, { length: 340 - i * 26, width: 260 - i * 20, thickness: 16 });
        geo.translate(L.x + (rng() - 0.5) * 40, y, L.z + (rng() - 0.5) * 40);
        put(plan.family, geo); stats.shelves++;
      }
    }
  }

  function loadWalls(plan, L, baseY) {
    const n = plan.count ?? 2;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * (plan.gap ?? 240);
      const len = (plan.len ?? 400) * 0.5;
      const pts = [];
      for (let i = -2; i <= 2; i++) {
        pts.push([L.x + off + i * len * 0.5, L.z + Math.sin(i * 1.7 + k) * 40]);
      }
      const geo = makeWall({ pts, height: plan.h ?? 130, thickness: 26, seed: rng() * 50 + k }, field);
      geo.computeBoundingBox();
      const visualBounds = { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() };
      put(plan.family, geo);
      stats.walls.push({ x: L.x + off, z: L.z, h: plan.h });
      // Follow the same curved centreline as the rendered wall. The previous
      // straight z=L.z cylinders often stood in visibly empty water.
      const path = new THREE.CatmullRomCurve3(
        pts.map(([x, z]) => new THREE.Vector3(x, field.heightAt(x, z), z)),
        false, 'catmullrom', 0.3);
      const segments = Math.max(4, Math.ceil(path.getLength() / 36));
      const contactGuard = colliders ? createMeshContactGuard(geo) : null;
      for (let i = 0; i <= segments; i++) {
        const p = path.getPointAt(i / segments);
        addCollider({ type: 'cyl', x: p.x, z: p.z,
          yBase: field.heightAt(p.x, p.z),
          yTop: field.heightAt(p.x, p.z) + (plan.h ?? 130) * 0.60,
          r: 17, source: `wall:${plan.loc || L.id}`, visualBounds,
        }, contactGuard);
      }
    }
  }

  // ---------------- massif rim walls (the shelf edges of the reference) ----
  // A cliff band around the higher massifs: these are what read as the stacked
  // geological shelves at distance.
  for (const m of MASSIFS) {
    if (!m.wall) continue;
    const pts = [];
    const rot = m.rot || 0;
    for (let i = -3; i <= 3; i++) {
      const t = i / 3;
      const x = m.x + Math.cos(rot) * t * m.rx * 1.05 - Math.sin(rot) * m.rz * 0.9;
      const z = m.z + Math.sin(rot) * t * m.rx * 1.05 + Math.cos(rot) * m.rz * 0.9;
      pts.push([x, z]);
    }
    const geo = makeWall({ pts, height: Math.abs(m.y) * 0.5 + 40, thickness: 30, seed: m.x * 0.01 }, field);
    put(m.rock === 'reef' ? 'reef' : 'limestone', geo);
  }

  // ---------------- canyon-rim pinnacles ----------------------------------
  for (const cn of CANYONS) {
    for (let k = 0; k < cn.pts.length - 1; k++) {
      const a = cn.pts[k], b = cn.pts[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const count = Math.max(1, Math.round(len / 150));
      for (let i = 0; i < count; i++) {
        if (rng() > 0.5) continue;
        const t = (i + 0.5) / count;
        const side = rng() > 0.5 ? 1 : -1;
        const off = cn.width[1] * (1.1 + rng() * 0.7) * side;
        const x = a[0] + dx * t + nx * off;
        const z = a[1] + dz * t + nz * off;
        if (x < WORLD.minX + 60 || x > WORLD.maxX - 60 || z < WORLD.minZ + 60 || z > WORLD.maxZ - 60) continue;
        const h = 26 + rng() * 74;
        tower(x, z, Math.min(h, -field.heightAt(x, z) - 10), 7 + rng() * 14,
          rng() > 0.6 ? 'sandstone' : 'limestone',
          { flare: 1.4, radial: 20, rings: 26, waist: 0.7 });
      }
    }
  }

  // ---------------- reef bommies ------------------------------------------
  // Coral has to attach to something. These are the mid-scale rock heads of the
  // photic zone: 6–30 m limestone and reef-rock knuckles that break the sand and
  // carry the gardens. Without them the reef is decoration on a flat plain.
  const BOMMIE_ZONES = [
    { loc: 'glasshorizon', n: 26, r: [4, 13] },
    { loc: 'roseglass', n: 40, r: [6, 20] },
    { loc: 'verdant', n: 26, r: [6, 18] },
    { loc: 'aurel', n: 20, r: [12, 30] },
    { loc: 'azurespan', n: 18, r: [14, 34] },
    { loc: 'floodednave', n: 14, r: [8, 22] },
    { loc: 'abyssalbowl', n: 14, r: [16, 40] },
  ];

  let bommies = 0,azureRelocated = 0;
  // Reserve an actual swimming corridor through the original Azure gate bowl.
  // The previous random bommies could occupy the bowl even though tower
  // placement avoided it; the gate finder then moved the ring to a steep slope.
  const azureGate=PORTALS.find(p=>p.id==='azurespan'),azureLoc=loc('azurespan');
  const gateDX=azureLoc.x-azureGate.x,gateDZ=azureLoc.z-azureGate.z,gateD=Math.hypot(gateDX,gateDZ)||1;
  const gateUX=gateDX/gateD,gateUZ=gateDZ/gateD;
  const corridorDistance=(x,z)=>{
    const along=(x-azureGate.x)*gateUX+(z-azureGate.z)*gateUZ;
    const t=clamp(along,-45,75);
    return Math.hypot(x-(azureGate.x+gateUX*t),z-(azureGate.z+gateUZ*t));
  };
  for (const z of BOMMIE_ZONES) {
    const L = loc(z.loc);
    if (!L) continue;
    for (let i = 0; i < z.n * 3; i++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 190;
      let x = L.x + Math.cos(a) * rad;
      let zb = L.z + Math.sin(a) * rad;
      // Move this one shallow boulder off the repeatedly reported approach
      // corridor; retain its geometry and collider in the same habitat.
      if (z.loc === 'glasshorizon' && i === 61) x += 25;
      const size = lerp(z.r[0] * 1.5, z.r[1] * 1.7, Math.pow(rng(), 1.6)) * (z.loc === 'glasshorizon' && i === 19 ? 1 : 0.78);
      const protectedRock = z.loc === 'glasshorizon' && i === 19;
      const omitted=!protectedRock&&(i%3===0||Math.hypot(x-L.x,zb-L.z)<35+size*.5);
      // Relocate, do not delete, boulders that would cover the Azure gate or
      // its approach. The choice is deterministic and consumes no world RNG.
      if(z.loc==='azurespan' && !omitted && corridorDistance(x,zb)<size*1.35+20){
        for(let k=0;k<24;k++){
          const angle=i*2.3999632297+k*.91,r=190+(i%4)*18;
          const nx=L.x+Math.cos(angle)*r,nz=L.z+Math.sin(angle)*r;
          if(nx<WORLD.minX+60||nx>WORLD.maxX-60||nz<WORLD.minZ+60||nz>WORLD.maxZ-60)continue;
          if(corridorDistance(nx,nz)<size*1.55+32)continue;
          const floor=field.surfaceHeightAt(nx,nz);
          if(floor>-115||floor<-360)continue;
          x=nx;zb=nz;azureRelocated++;break;
        }
      }
      const y = field.surfaceHeightAt(x, zb);
      // Consume the same seeded random draws for every candidate, even those
      // omitted, so changing density does not reshuffle unrelated geology.
      const seed = rng() * 90 + i;
      const sy = rng() > 0.5 ? 1.0 : 1.5;
      const sz = 0.9 + rng() * 0.3;
      const rot = rng() * 6.28;
      const fam = rng() > 0.45 ? 'reef' : 'limestone';
      // Leave breathing room around the authored destination itself rather
      // than filling every view with oversized randomly placed bommies. Keep
      // the independently audited shallow rock 19 as a regression baseline.
      if (omitted) continue;
      const geo = makeBoulder(seed, size > 18 ? 5 : 4);
      geo.scale(size, size * sy, size * sz);
      geo.rotateY(rot);
      geo.translate(x, y + size * 0.16, zb);
      put(fam, geo, `boulder:${z.loc}:${i}`);
      // The old full-height cylinder protruded well beyond sloping boulder
      // surfaces. Fit a conservative ellipsoid to this actual transformed
      // rock instead, retaining a solid core without blocking empty water.
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      const centre = new THREE.Vector3(x, y + size * 0.16, zb);
      const core = fitBoulderCore(geo, centre);
      addCollider({ type: 'ell', x: centre.x, y: centre.y, z: centre.z,
        rx: core.rx, ry: core.ry, rz: core.rz,
        source: `boulder:${z.loc}:${i}`, visualBounds: { min: box.min.toArray(), max: box.max.toArray() } });
      bommies++;
    }
  }
  stats.bommies = bommies;
  stats.azureRelocatedBoulders = azureRelocated;

  // Spatially merge complete formations instead of merging every formation in
  // the entire world into one uncullable family mesh. Never cut a formation:
  // its entire bounds remain in its tile, so long walls/arches stay visible.
  const tileKey = (x,z) => `${Math.floor(x/640)}_${Math.floor(z/640)}`;
  for (const [family, geos] of Object.entries(buckets)) {
    const tiles=new Map();
    for(const geo of geos){
      if(!geo.boundingBox)geo.computeBoundingBox();
      const c=geo.boundingBox.getCenter(new THREE.Vector3()), key=tileKey(c.x,c.z);
      if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(geo);
    }
    for(const [key,parts] of tiles){
      const merged=mergeGeos(parts);merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mats[family]);
      mesh.name = `geology_${family}_${key}`;
      group.add(mesh);
    }
  }

  // ---------------- boulders & scree --------------------------------------
  const boulderGeos = [];
  for (let i = 0; i < 6; i++) boulderGeos.push(makeBoulder(rng() * 50 + i * 11, i < 3 ? 3 : 2));
  const BOULDER_TOTAL = 1500;
  const variants = boulderGeos.map((g, i) => ({ geo: g, list: [], family: i % 2 ? 'basalt' : 'limestone' }));
  let placed = 0;
  for (let i = 0; i < BOULDER_TOTAL * 4 && placed < BOULDER_TOTAL; i++) {
    const x = WORLD.minX + rng() * (WORLD.maxX - WORLD.minX);
    const z = WORLD.minZ + rng() * (WORLD.maxZ - WORLD.minZ);
    const y = field.surfaceHeightAt(x, z);
    const depth = -y;
    const slope = field.steepness(x, z);
    let p = 0.14 + slope * 0.8;
    if (depth < 26) p *= 0.55;                 // keep the open sand open
    if (depth > 320) p *= 0.5;
    p *= 0.55 + 0.9 * (fbm3(x * 0.004, 0.5, z * 0.004, 3) * 0.5 + 0.5);
    if (rng() > p) continue;
    const size = 1.0 + Math.pow(rng(), 2.7) * (4 + Math.min(24, depth * 0.05));
    const v = variants[Math.floor(rng() * variants.length)];
    v.list.push({ x, y: y + size * 0.16, z, size, rot: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.5 });
    placed++;
  }
  for (const v of variants) {
    if (!v.list.length) continue;
    const tiles=new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    v.list.forEach((b, i) => {
      e.set(b.tilt, b.rot, b.tilt * 0.6);
      q.setFromEuler(e);
      s.set(b.size * (0.85 + 0.45 * rng()), b.size * (0.7 + 0.4 * rng()), b.size * (0.85 + 0.45 * rng()));
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, s);
      const key=tileKey(b.x,b.z);
      if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(m.clone());
      // Preserve exactly the original solid/visual transforms.
      if(b.size >= 2.0) registerSurface(v.geo, `scree:${v.family}:${i}`, m);
    });
    for(const [key,matrices] of tiles){
      const inst = new THREE.InstancedMesh(v.geo, mats[v.family], matrices.length);
      matrices.forEach((matrix,i)=>inst.setMatrixAt(i,matrix));
      inst.instanceMatrix.needsUpdate = true;
      inst.name = `boulders_${v.family}_${key}`;
      inst.computeBoundingSphere();
      if(matrices.length>=3 && matrices.length*(v.geo.index?v.geo.index.count:v.geo.attributes.position.count)/3>=5000)
        inst.userData.visibilityCompactor=new InstanceFrustumCompactor(inst);
      group.add(inst);
    }
    stats.boulders = (stats.boulders || 0) + v.list.length;
  }

  // ---------------- rubble & shell debris ---------------------------------
  // Bare sediment at close range needs something between "sand grain" and
  // "boulder", or the scale collapses and the seabed reads as a flat plane.
  const RUBBLE = [
    { loc: 'glasshorizon', n: 2600 }, { loc: 'roseglass', n: 2200 },
    { loc: 'verdant', n: 1500 }, { loc: 'aurel', n: 1200 },
    { loc: 'azurespan', n: 900 }, { loc: 'floodednave', n: 850 },
    { loc: 'abyssalbowl', n: 700 },
  ];

  const rubbleVariants = [];
  for (let i = 0; i < 4; i++) rubbleVariants.push({ geo: makeBoulder(rng() * 70 + i * 13, 1), list: [] });
  for (const zone of RUBBLE) {
    const L = loc(zone.loc);
    if (!L) continue;
    for (let i = 0; i < zone.n; i++) {
      const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * 210;
      const x = L.x + Math.cos(a) * rad, z = L.z + Math.sin(a) * rad;
      const y = field.surfaceHeightAt(x, z);
      const size = 0.14 + Math.pow(rng(), 2.2) * 1.1;
      const v = rubbleVariants[Math.floor(rng() * rubbleVariants.length)];
      v.list.push({ x, y: y + size * 0.12, z, size, rot: rng() * 6.28, tilt: (rng() - 0.5) * 0.7 });
    }
  }
  for (const v of rubbleVariants) {
    if (!v.list.length) continue;
    const tiles=new Map();
    const m = new THREE.Matrix4(), q2 = new THREE.Quaternion(), e2 = new THREE.Euler(), s2 = new THREE.Vector3();
    v.list.forEach((b) => {
      e2.set(b.tilt, b.rot, b.tilt * 0.5); q2.setFromEuler(e2);
      s2.set(b.size * (0.8 + rng() * 0.5), b.size * (0.55 + rng() * 0.4), b.size * (0.8 + rng() * 0.5));
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q2, s2);
      const key=tileKey(b.x,b.z);
      if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(m.clone());
    });
    for(const [key,matrices] of tiles){
      const inst = new THREE.InstancedMesh(v.geo, mats.limestone, matrices.length);
      matrices.forEach((matrix,i)=>inst.setMatrixAt(i,matrix));
      inst.instanceMatrix.needsUpdate = true;
      inst.name = `rubble_${key}`;
      inst.computeBoundingSphere();
      if(matrices.length>=3 && matrices.length*(v.geo.index?v.geo.index.count:v.geo.attributes.position.count)/3>=5000)
        inst.userData.visibilityCompactor=new InstanceFrustumCompactor(inst);
      group.add(inst);
    }
    stats.rubble = (stats.rubble || 0) + v.list.length;
  }

  const instanced=group.children.filter(o=>o.userData.visibilityCompactor),view=new InstanceFrustumView();
  let instanceCulling=true,quality='high',cullCursor=0;
  group.userData.setQuality=(q)=>{quality=q;view.invalidate();};
  group.userData.setInstanceCulling=(on=true)=>{
    instanceCulling=!!on;view.invalidate();
    if(!instanceCulling)for(const o of instanced){o.userData.visibilityCompactor.restore();o.visible=true;}
  };
  group.userData.update = (dt,time,camera) => {
    const changed=instanceCulling && view.update(camera);
    if(!changed||!instanced.length)return;
    // Recompacting every geological instance group on one movement frame caused
    // destination-entry stalls. Software mode processes four groups per frame.
    const budget=quality==='low'?4:instanced.length;
    for(let n=0;n<budget;n++){
      const o=instanced[cullCursor%instanced.length];cullCursor++;
      if(view.frustum.intersectsObject(o))o.userData.visibilityCompactor.compact(view.frustum);
      else o.count=0;
      o.visible=o.count>0;
    }
  };
  group.userData.stats = stats;
  group.userData.surfaceSolids = surfaceSolids;
  group.userData.arches = stats.arches;
  group.userData.towers = stats.towers;
  group.userData.materials = mats;
  return group;
}
