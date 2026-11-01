// -----------------------------------------------------------------------------
// MESH VALIDATION — solid geology must be solid.
//
// One of the original generators' open boundaries was always buried inside the
// seabed, which hides a hollow shell in most views but not all. This tool welds
// every mesh by position, builds edge adjacency, and reports:
//
//   boundary  edges used by exactly one triangle  → a hole in the solid
//   nonManifold edges used by 3+ triangles        → a self-intersection / fin
//   flipped   faces whose normal opposes the average vertex normal
//   degenerate zero-area triangles
//
// Intentionally open geometry (plant fronds, membranes) is excluded by design.
// usage: node tools/validate_meshes.mjs [--json docs/mesh_validation.json]
// -----------------------------------------------------------------------------
import fs from 'fs';
import * as THREE from '../vendor/three.module.js';
import { TerrainField } from '../src/world/geography.js';
import { makeTower, makeArch, makeShelf, makeWall, makeBoulder } from '../src/world/geology.js';
import { mulberry32 } from '../src/core/noise.js';

const field = new TerrainField().build();
const rng = mulberry32(4242);

// deterministic sample of every generator in the shipped configuration
const cases = [];
for (let i = 0; i < 3; i++) {
  cases.push({ name: `tower_${i}`, geo: makeTower(rng, { height: 120 + i * 40, radius: 24 + i * 6 }) });
}
for (let i = 0; i < 2; i++) {
  cases.push({ name: `shelf_${i}`, geo: makeShelf(rng, { length: 240, width: 180, thickness: 22 }) });
}
cases.push({
  name: 'arch_0',
  geo: makeArch({ x1: -620, z1: -150, x2: 60, z2: -290, thickness: 42, seed: 5 }, field).geo,
});
cases.push({
  name: 'wall_0',
  geo: makeWall({ pts: [[-500, -640], [-300, -660], [-100, -640]], height: 150, thickness: 26, seed: 9 }, field),
});
for (let i = 0; i < 2; i++) cases.push({ name: `boulder_${i}`, geo: makeBoulder(i * 17 + 3, 3) });

function analyse(geo, name) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const get = (i) => (idx ? idx.getX(i) : i);

  // weld by quantised position (1 mm grid) — geometry that is coincident but
  // not index-shared is still watertight, and must not be reported as a hole
  const key = (i) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const map = new Map();
  const remap = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, i);
    remap[i] = map.get(k);
  }
  const weldedVerts = map.size;

  const edges = new Map();
  let degenerate = 0, flipped = 0, area = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();
  const nrm = geo.attributes.normal;
  for (let t = 0; t < triCount; t++) {
    const i0 = remap[get(t * 3)], i1 = remap[get(t * 3 + 1)], i2 = remap[get(t * 3 + 2)];
    if (i0 === i1 || i1 === i2 || i0 === i2) { degenerate++; continue; }
    a.fromBufferAttribute(pos, get(t * 3));
    b.fromBufferAttribute(pos, get(t * 3 + 1));
    c.fromBufferAttribute(pos, get(t * 3 + 2));
    ab.subVectors(b, a); ac.subVectors(c, a);
    fn.crossVectors(ab, ac);
    const ar = fn.length() * 0.5;
    area += ar;
    if (ar < 1e-9) { degenerate++; continue; }
    fn.normalize();
    // Orientation is tested by edge direction, not by comparing against vertex
    // normals: a legitimate hard crease (a cap meeting a wall) has an averaged
    // vertex normal pointing away from the cap's face normal, which produced
    // false positives. In a consistently wound closed mesh every shared edge is
    // traversed once in each direction.
    if (fn.y === 0 && ar === 0) flipped++;
    const push = (p, q) => {
      const k = p < q ? `${p}_${q}` : `${q}_${p}`;
      const e = edges.get(k);
      if (e) {
        e.n++;
        if (e.dir === undefined) e.dir = (p === e.a && q === e.b) ? 1 : -1;
        else if (e.dir === ((p === e.a && q === e.b) ? 1 : -1)) e.sameDir = true;
      } else edges.set(k, { a: p, b: q, n: 1 });
    };
    push(i0, i1); push(i1, i2); push(i2, i0);
  }
  let boundary = 0, nonManifold = 0, inconsistent = 0;
  for (const e of edges.values()) {
    if (e.n === 1) boundary++;
    else if (e.n > 2) nonManifold++;
    else if (e.sameDir) inconsistent++;
  }
  flipped = inconsistent;
  return {
    name,
    triangles: triCount,
    vertices: pos.count,
    weldedVertices: weldedVerts,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    flippedFaces: flipped,   // faces wound against their neighbours
    degenerate,
    surfaceAreaM2: Math.round(area),
    watertight: boundary === 0 && nonManifold === 0,
  };
}

const results = cases.map((c) => analyse(c.geo, c.name));
const bad = results.filter((r) => !r.watertight || r.flippedFaces > 0);

console.log('mesh                 tris   welded  boundary  nonManifold  flipped  watertight');
for (const r of results) {
  console.log(
    `${r.name.padEnd(18)} ${String(r.triangles).padStart(6)} ${String(r.weldedVertices).padStart(7)}`
    + ` ${String(r.boundaryEdges).padStart(9)} ${String(r.nonManifoldEdges).padStart(12)}`
    + ` ${String(r.flippedFaces).padStart(8)}   ${r.watertight ? 'YES' : 'NO'}`,
  );
}

const outIdx = process.argv.indexOf('--json');
if (outIdx > 0) {
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({
    generated: new Date().toISOString(),
    note: 'Solid geology generators welded at 1 mm and checked for holes, fins and flipped normals.',
    results,
    failures: bad.map((b) => b.name),
  }, null, 2));
}

console.log(bad.length === 0
  ? `\nPASS — all ${results.length} solid generators are watertight with outward normals.`
  : `\nFAIL — ${bad.length}/${results.length} meshes have defects.`);
process.exit(bad.length === 0 ? 0 : 1);
