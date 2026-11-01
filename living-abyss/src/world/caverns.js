// -----------------------------------------------------------------------------
// THE LIVING ABYSS — the Veiled Caverns
// Each hall is a sunken chamber in the seabed roofed by a real rock vault whose
// rim merges into the surrounding ground, with a cut gate so the hall is always
// enterable. Interiors are baked dark, with light bleeding in from the gate.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { CHAMBERS } from './geography.js?rev=37';
import { mulberry32, fbm3, fbm2, noise3, clamp, lerp, smoothstep } from '../core/noise.js?rev=37';
import { createRockMaterial } from './rockmat.js?rev=37';
import { createMeshContactGuard } from '../player/mesh-contact.js?rev=37';

const TAU = Math.PI * 2;

/**
 * A rock vault: a thick, noise-eroded shell arched over a chamber bowl.
 * The outer rim is sampled from the actual terrain so it always meets the
 * ground; one azimuth sector is left open as the gate.
 */
function makeVault(field, chamber, rng, opts) {
  const { x, z, r } = chamber;
  const rimR = r * (opts.rimScale || 1.35);
  const gate = chamber.gateAngle;
  const gateHalf = opts.gateHalf || 0.55;      // radians of open sector
  const squash = opts.squash || 0.55;

  const rings = 22, segs = 64;
  // A real open skylight in the principal hall, with actual geometry and
  // collision missing above it. The smaller second hall remains enclosed.
  const holeRing = chamber.name === 'The Flooded Nave' ? 3 : 0;
  const a0 = gate + gateHalf;
  const a1 = gate + TAU - gateHalf;

  // rim elevation sampled from the terrain all the way round
  const rimY = [];
  for (let j = 0; j <= segs; j++) {
    const a = lerp(a0, a1, j / segs);
    const rx = x + Math.cos(a) * rimR;
    const rz = z + Math.sin(a) * rimR;
    rimY.push(field.surfaceHeightAt(rx, rz));
  }
  // The terrain around a chamber may plunge hundreds of metres over a few
  // samples. Interpolating that raw jagged rim all the way to the middle made
  // sharp, hanging triangular roof walls. Smooth only the interior design
  // curve, then bury the actual edge into the sampled terrain below.
  let smoothRim = rimY.slice();
  for(let pass=0;pass<6;pass++){
    const next=smoothRim.slice();
    for(let j=1;j<segs;j++)next[j]=smoothRim[j-1]*.25+smoothRim[j]*.5+smoothRim[j+1]*.25;
    smoothRim=next;
  }
  const centreFloor=field.surfaceHeightAt(x,z);
  const peak=Math.max(centreFloor+chamber.roofFrom+10,Math.min(-8,Math.max(...smoothRim)+r*squash*.80));

  const top = [], bot = [], idxT = [], idxB = [];
  const aoT = [], aoB = [];
  const seed = rng() * 100;

  const surfY = (i, j, a, radiusFrac) => {
    // blend terrain rim -> arch peak, with noise erosion
    const t = radiusFrac;                        // 0 centre, 1 rim
    const arch = Math.pow(1 - t * t, 0.75);
    const base = lerp(peak, smoothRim[j], Math.pow(t, 0.85));
    // Sample erosion in world-scale coordinates rather than one noise cell
    // per metre: the old unscaled X/Z values produced independent jagged
    // triangles. Fade detail to zero at the terrain rim to avoid a lifted seam.
    const n = fbm3(
      (x + Math.cos(a) * rimR * t) * 0.018 + seed,
      (base - y0) * 0.025,
      (z + Math.sin(a) * rimR * t) * 0.018 - seed, 3) * r * 0.08;
    const rimFade = 1 - smoothstep(0.72, 1.0, t);
    return base + arch * r * 0.06 + n * rimFade;
  };
  const y0 = Math.min(...rimY);

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rad = t * rimR;
    for (let j = 0; j <= segs; j++) {
      const a = lerp(a0, a1, j / segs);
      const openingInfluence=holeRing ? Math.max(0,1-Math.abs(i-holeRing)/3) : 0;
      const irregular=1+openingInfluence*(.09*Math.sin(a*3.0+seed)+.045*Math.sin(a*7.0-seed));
      const px = x + Math.cos(a) * rad * irregular;
      const pz = z + Math.sin(a) * rad * irregular;
      const floor=field.surfaceHeightAt(px,pz);
      // Match the actual floor at the buried rim; keep usable clearance in
      // the hall rather than allowing low-hanging triangular curtains.
      const thick = (opts.thickness || 26) * (0.15 + 0.95 * Math.pow(t, 0.6)) * (1 - Math.pow(t, 6));
      const rimBlend=smoothstep(.82,1.0,t);
      const inner=surfY(i,j,a,t);
      const desired=lerp(inner,floor-1.5,rimBlend);
      const open=1-smoothstep(.72,1.0,t);
      const minBottom=floor + open*(chamber.roofFrom*.55+4) - (1-open)*1.5;
      const yTop=Math.max(desired,minBottom+thick);
      const yBot = yTop - thick;
      top.push(px, yTop, pz);
      bot.push(px, yBot, pz);
      // interior occlusion: dark, brighter near the gate
      const gateDist = Math.min(
        Math.abs(((a - a0) + TAU) % TAU), Math.abs(((a - a1) + TAU) % TAU));
      const lit = smoothstep(0.9, 0.05, gateDist) * (0.35 + 0.65 * t);
      aoB.push(clamp(0.10 + 0.55 * lit, 0.08, 0.8));
      aoT.push(clamp(0.55 + 0.45 * (1 - t), 0.3, 1));
    }
  }
  const stride = segs + 1;
  const n = top.length / 3;
  for (let i = holeRing; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
      idxT.push(a, b, c, b, d, c);          // top faces up
      idxB.push(a + n, c + n, b + n, b + n, c + n, d + n); // bottom faces down
    }
  }
  // stitch the two cut edges (the gate walls) and the ground rim
  for (let i = holeRing; i < rings; i++) {
    const a = i * stride, c = a + stride;
    idxT.push(a, a + n, c, c, a + n, c + n);
    const b = i * stride + segs, d = b + stride;
    idxT.push(b, d, b + n, b + n, d, d + n);
  }
  for (let j = 0; j < segs; j++) {
    const a = rings * stride + j, b = a + 1;
    idxT.push(a, b, a + n, b, b + n, a + n);
  }
  // Rock thickness around the ragged skylight makes it a real aperture,
  // rather than an invisible circular hole cut only in one side of a mesh.
  if(holeRing) for(let j=0;j<segs;j++){
    const a=holeRing*stride+j,b=a+1;
    idxT.push(a,a+n,b,b,a+n,b+n);
  }

  const pos = top.concat(bot);
  const ao = aoT.concat(aoB);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  geo.setIndex(idxT.concat(idxB));
  geo.computeVertexNormals();
  geo.userData.skylightRadius=holeRing ? holeRing/rings*rimR : 0;
  return geo;
}

/** Stalactite / stalagmite: a noise-displaced cone, never a primitive. */
function makeSpike(rng, height, radius, down) {
  const rings = 12, radial = 12;
  const seed = rng() * 60;
  const pos = [], idx = [], ao = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = down ? -t * height : t * height;
    const rad = radius * Math.pow(1 - t, 0.55) + 0.03;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const n = fbm3(Math.cos(a) * rad * 2 + seed, y * 0.3, Math.sin(a) * rad * 2, 3);
      const rr = rad * (1 + n * 0.45);
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      ao.push(clamp(0.18 + 0.6 * t, 0.12, 0.9));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + 1, c = a + radial + 1, d = c + 1;
      if (down) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildCaverns(field, controller) {
  const group = new THREE.Group();
  group.name = 'caverns';
  const rng = mulberry32(555777);
  const exteriorMat = createRockMaterial({ detail: 1.0, caveLit: 1.0 });
  const interiorMat = createRockMaterial({ detail: 1.0, caveLit: 0.0, darken: 0.92 });

  for (const ch of CHAMBERS) {
    const rimR = ch.r * 1.35;
    const geo = makeVault(field, ch, rng, {
      rimScale: 1.35,
      gateHalf: 0.5,
      squash: 0.42,
      thickness: 22 + ch.r * 0.10,
    });
    // The player views the Nave shell from below. Use a dedicated two-sided
    // material there so imperfect winding or a grazing camera angle can never
    // reveal the outside world through an apparently solid wall.
    const vaultMat=ch.name==='The Flooded Nave'?exteriorMat.clone():exteriorMat;
    if(ch.name==='The Flooded Nave')vaultMat.side=THREE.DoubleSide;
    const vault = new THREE.Mesh(geo, vaultMat);
    vault.name = 'vault_' + ch.name;
    group.add(vault);

    // Interior formations attach to the actual vault, not an invented height
    // above the floor. Double-sided ray sampling also respects the open gate.
    const roofProbe = new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    roofProbe.updateMatrixWorld(true);
    const probeRay = new THREE.Raycaster();
    const placements = [];
    const spikes = [];
    // The former 12–21 giant Nave spikes intersected the vault and appeared as
    // screen-spanning triangular walls. Use a few human-readable formations.
    const isNave=ch.name==='The Flooded Nave';
    const nSpikes = isNave ? 5 : 12 + Math.floor(rng() * 10);
    for (let i = 0; i < nSpikes; i++) {
      const a = rng() * TAU;
      const rad = rng() * ch.r * 0.75;
      const px = ch.x + Math.cos(a) * rad;
      const pz = ch.z + Math.sin(a) * rad;
      const down = rng() > 0.45;
      const h = isNave ? 5+rng()*8 : 6 + rng() * (ch.r * 0.28);
      const rr = isNave ? 1.2+rng()*1.8 : 1.6 + rng() * 4.5;
      const g = makeSpike(rng, h, rr, down);
      const floorY = field.surfaceHeightAt(px, pz);
      let baseY=floorY-.25;
      if(down){
        probeRay.set(new THREE.Vector3(px,floorY+.3,pz),new THREE.Vector3(0,1,0));
        const hit=probeRay.intersectObject(roofProbe,false).find(q=>q.point.y>floorY+1);
        if(!hit){g.dispose();continue;} // a gate opening cannot support a stalactite
        baseY=hit.point.y+.25;
      }
      g.translate(px,baseY,pz);
      placements.push({x:px,z:pz,y:baseY,floor:floorY,down});
      spikes.push(g);
    }
    // merge the spikes into one mesh
    if (spikes.length) {
      const merged = mergeSpikeGeos(spikes);
      const m = new THREE.Mesh(merged, interiorMat);
      m.name = 'formations_' + ch.name;
      m.userData.placements = placements;
      group.add(m);
      // These spires were previously visual-only. Use the rendered triangles
      // as an open-surface guard, avoiding a fictitious enclosing volume.
      if(controller){
        merged.computeBoundingBox();
        // Keep the merged broad bound for existing portal selection and endpoint
        // checks, but retain per-spire bounds for bounded swept movement. This
        // avoids testing every triangle in the whole chamber at every substep.
        const sweptPieces=spikes.map((spike,i)=>{
          spike.computeBoundingBox();
          return {source:`${m.name}:${i}`,bounds:spike.boundingBox.clone(),
            createGuard:()=>createMeshContactGuard(spike,{surfaceOnly:true})};
        });
        controller.surfaceSolids.push({source:m.name,bounds:merged.boundingBox.clone(),sweptPieces,
          createGuard:()=>createMeshContactGuard(merged,{surfaceOnly:true})});
      }
    }

    // Use the actual shell for roof collision: the old concentric flat bands
    // extended into empty water and could hold swimmers below invisible roofs.
    // The portal sector remains an actual opening in this mesh.
    if (controller) {
      vault.updateMatrixWorld(true);
      geo.computeBoundingBox();
      vault.userData.contactBounds=geo.boundingBox.clone();
      vault.userData.contactGuard=createMeshContactGuard(geo,{surfaceOnly:true});
      controller.roofs.push(vault);
    }
  }
  return group;
}

function mergeSpikeGeos(geos) {
  let vc = 0, ic = 0;
  for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), ao = new Float32Array(vc);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    ao.set(g.attributes.aAO.array, vo);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    io += g.index.count; vo += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
