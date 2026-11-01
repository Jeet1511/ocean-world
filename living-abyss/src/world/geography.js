// -----------------------------------------------------------------------------
// THE LIVING ABYSS — MASTER GEOGRAPHY (7-ZONE EDITION)
//
// Seven places, not forty. The world is now a compact 1.8 km x 1.8 km basin with
// seven authored arenas in a ring, each 150–260 m across, linked by teleporter
// portals. Everything is hand-placed: every zone has one idea, one silhouette,
// one lighting set-up, and enough open water around it to be impressive rather
// than crowded.
//
//   Z1  The Glass Horizon    sunlit sand shelf            −6 … −16 m
//   Z2  Roseglass Reef       coral garden terraces        −16 … −34 m
//   Z3  Verdant Cathedral    kelp forest                  −20 … −46 m
//   Z4  The Pillars of Aurel monumental limestone court   −80 … −150 m
//   Z5  The Azure Span       natural arch over a canyon   −150 … −290 m
//   Z6  The Flooded Nave     enclosed cavern + light shaft −40 … −130 m
//   Z7  The Abyssal Bowl     deep basin, bioluminescence   −480 … −700 m
//
// One height field, one coordinate system, one water medium.
// -----------------------------------------------------------------------------

import {
  fbm2, ridged2, terrace, distToPolyline, clamp, clamp01, lerp, smoothstep as ss, blob,
} from '../core/noise.js?rev=37';

export const WORLD = {
  minX: -900, maxX: 900,
  minZ: -900, maxZ: 900,
  cell: 4.0,           // metres per terrain cell (finer grid, smaller world)
  seaLevel: 0,
  maxDepth: 700,
  radius: 900,
};

WORLD.nx = Math.round((WORLD.maxX - WORLD.minX) / WORLD.cell);
WORLD.nz = Math.round((WORLD.maxZ - WORLD.minZ) / WORLD.cell);

// -----------------------------------------------------------------------------
// THE SEVEN ZONES
// -----------------------------------------------------------------------------
export const REGIONS = [
  {
    id: 'shelf', name: 'Z1 · THE GLASS HORIZON', short: 'Glass Horizon',
    anchor: [0, 620], radius: 300, depth: [-4, -20], tone: '#9fe8ef',
    blurb: 'Pale sand, moving caustics, the surface overhead.',
  },
  {
    id: 'reef', name: 'Z2 · ROSEGLASS REEF', short: 'Roseglass Reef',
    anchor: [-520, 300], radius: 280, depth: [-12, -40], tone: '#ff9f86',
    blurb: 'Warm coral terraces stacked on limestone shelves.',
  },
  {
    id: 'kelp', name: 'Z3 · VERDANT CATHEDRAL', short: 'Verdant Cathedral',
    anchor: [520, 280], radius: 280, depth: [-14, -52], tone: '#a8d96b',
    blurb: 'A forest of light and shadow, stipes lost overhead.',
  },
  {
    id: 'cathedral', name: 'Z4 · THE PILLARS OF AUREL', short: 'Pillars of Aurel',
    anchor: [0, 20], radius: 320, depth: [-60, -170], tone: '#c9b6ff',
    blurb: 'Nine columns standing in ranks on a drowned plateau.',
  },
  {
    id: 'archways', name: 'Z5 · THE AZURE SPAN', short: 'Azure Span',
    anchor: [-480, -340], radius: 320, depth: [-130, -300], tone: '#8fb8ff',
    blurb: 'A rock bridge over a canyon that falls out of the light.',
  },
  {
    id: 'caverns', name: 'Z6 · THE FLOODED NAVE', short: 'Flooded Nave',
    anchor: [500, -360], radius: 300, depth: [-30, -140], tone: '#7fd4c8',
    blurb: 'An enclosed hall, one shaft of daylight, a lit centrepiece.',
  },
  {
    id: 'abyss', name: 'Z7 · THE ABYSSAL BOWL', short: 'Abyssal Bowl',
    anchor: [0, -700], radius: 340, depth: [-460, -700], tone: '#3f63c9',
    blurb: 'The floor of the world: silence, scale, blue-black water.',
  },
];

// -----------------------------------------------------------------------------
// PADS — the authored floor of each arena. Depth identity is true by design.
// -----------------------------------------------------------------------------
export const PADS = [
  { id: 'glasshorizon', x: 0, z: 620, rx: 230, rz: 190, y: -8.5, mode: 'bench', edge: 150 },
  { id: 'roseglass', x: -520, z: 300, rx: 200, rz: 170, y: -24, mode: 'bench', edge: 140 },
  { id: 'verdant', x: 520, z: 280, rx: 200, rz: 175, y: -30, mode: 'bench', edge: 140 },
  { id: 'aurel', x: 0, z: 20, rx: 235, rz: 200, y: -112, mode: 'basin', edge: 155 },
  { id: 'azurespan', x: -480, z: -340, rx: 220, rz: 185, y: -212, mode: 'basin', edge: 150 },
  { id: 'floodednave', x: 500, z: -360, rx: 210, rz: 180, y: -78, mode: 'bench', edge: 145 },
  { id: 'abyssalbowl', x: 0, z: -700, rx: 250, rz: 215, y: -560, mode: 'basin', edge: 170 },
  // linking thresholds between the arenas (shorter, shallower, no dead ground)
  { id: 'link_ne', x: 300, z: 470, rx: 160, rz: 150, y: -18, mode: 'slope', y2: -26, edge: 130 },
  { id: 'link_nw', x: -280, z: 470, rx: 160, rz: 150, y: -14, mode: 'slope', y2: -20, edge: 130 },
  { id: 'link_c', x: 0, z: 180, rx: 170, rz: 150, y: -46, mode: 'slope', y2: -80, edge: 130 },
  { id: 'link_sw', x: -250, z: -170, rx: 170, rz: 150, y: -150, mode: 'slope', y2: -190, edge: 130 },
  { id: 'link_se', x: 250, z: -180, rx: 170, rz: 150, y: -140, mode: 'slope', y2: -110, edge: 130 },
  { id: 'trench_mouth', x: 0, z: -470, rx: 190, rz: 150, y: -330, mode: 'slope', y2: -480, edge: 140 },
  { id: 'deepest', x: -150, z: -800, rx: 105, rz: 90, y: -692, mode: 'basin', edge: 90, pri: 2.0 },
  // GATE CIRCLES — one sunk bowl per place, exactly where its teleporter stands.
  // The ring has to be fully underwater in every arena, including the 8 m shelf,
  // so each gate sits in its own depression rather than on open sand.
  { id: 'gate_glasshorizon', x: 0, z: 470, rx: 46, rz: 46, y: -25, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_roseglass', x: -390, z: 225, rx: 46, rz: 46, y: -40, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_verdant', x: 388, z: 209, rx: 46, rz: 46, y: -46, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_aurel', x: 0, z: -130, rx: 46, rz: 46, y: -128, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_azurespan', x: -358, z: -253, rx: 46, rz: 46, y: -228, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_floodednave', x: 378, z: -272, rx: 46, rz: 46, y: -94, mode: 'basin', edge: 52, pri: 1.55 },
  { id: 'gate_abyssalbowl', x: 0, z: -550, rx: 46, rz: 46, y: -576, mode: 'basin', edge: 52, pri: 1.55 },
];

// -----------------------------------------------------------------------------
// CANYONS — two, short, and both swimmable end to end
// -----------------------------------------------------------------------------
export const CANYONS = [
  { // under the Azure Span, running south-west to the deep
    pts: [[-480, -180], [-520, -330], [-450, -470], [-300, -560], [-100, -610], [40, -690]],
    width: [100, 190], depth: [70, 150], wall: 0.40,
  },
  { // the eastern channel past the cavern ridge
    pts: [[500, -430], [430, -540], [300, -620], [150, -680]],
    width: [85, 150], depth: [55, 110], wall: 0.42,
  },
];

// -----------------------------------------------------------------------------
// HERO MASSIFS — the silhouettes each arena is composed around
// -----------------------------------------------------------------------------
export const MASSIFS = [
  // Z1 shelf: low limestone ribs that break the sand
  { x: -230, z: 700, rx: 190, rz: 150, y: -5.5, side: 90, rot: 0.3, rock: 'limestone' },
  { x: 250, z: 690, rx: 170, rz: 140, y: -6.0, side: 85, rot: -0.4, rock: 'limestone' },
  { x: 40, z: 800, rx: 300, rz: 120, y: -9.0, side: 100, rot: 0.05, rock: 'limestone', wall: true },
  // Z2 reef: raised terraces either side of the garden
  { x: -680, z: 380, rx: 190, rz: 160, y: -14, side: 70, rot: 0.5, rock: 'reef' },
  { x: -380, z: 200, rx: 170, rz: 150, y: -17, side: 75, rot: -0.3, rock: 'reef' },
  { x: -560, z: 470, rx: 200, rz: 120, y: -19, side: 80, rot: 0.1, rock: 'reef', wall: true },
  // Z3 kelp: a wall behind the forest, open water in front
  { x: 660, z: 360, rx: 180, rz: 160, y: -18, side: 75, rot: 0.2, rock: 'reef' },
  { x: 400, z: 130, rx: 175, rz: 150, y: -20, side: 80, rot: -0.5, rock: 'reef' },
  // Z4 cathedral: the plateau the colonnade stands on
  { x: 0, z: 20, rx: 330, rz: 280, y: -84, side: 95, rot: 0.05, rock: 'limestone' },
  { x: -300, z: 120, rx: 180, rz: 160, y: -70, side: 85, rot: 0.6, rock: 'limestone' },
  { x: 300, z: -90, rx: 190, rz: 165, y: -78, side: 88, rot: -0.45, rock: 'limestone' },
  // Z5 archways: the two shoulders the span bridges
  { x: -590, z: -300, rx: 175, rz: 150, y: -158, side: 70, rot: 0.25, rock: 'limestone' },
  { x: -370, z: -390, rx: 165, rz: 145, y: -168, side: 70, rot: -0.3, rock: 'limestone' },
  { x: -700, z: -450, rx: 180, rz: 150, y: -140, side: 85, rot: 0.4, rock: 'sandstone' },
  // Z6 caverns: the ridge the halls are cut into
  { x: 620, z: -300, rx: 200, rz: 175, y: -56, side: 70, rot: 0.15, rock: 'reef' },
  { x: 380, z: -450, rx: 180, rz: 155, y: -66, side: 78, rot: -0.4, rock: 'reef' },
  // Z7 abyss: descending walls that frame the bowl
  { x: -260, z: -700, rx: 190, rz: 170, y: -470, side: 110, rot: 0.2, rock: 'basalt' },
  { x: 270, z: -720, rx: 190, rz: 170, y: -490, side: 110, rot: -0.25, rock: 'basalt' },
  { x: 0, z: -860, rx: 320, rz: 150, y: -520, side: 150, rot: 0.05, rock: 'basalt', wall: true },
];

// -----------------------------------------------------------------------------
// CAVE CHAMBERS — Z6. Carved halls with real gates.
// -----------------------------------------------------------------------------
export const CHAMBERS = [
  { x: 500, z: -360, r: 130, depth: 62, roofFrom: 46, gateAngle: 2.6, elong: 1.5, name: 'The Flooded Nave' },
  { x: 640, z: -230, r: 95, depth: 44, roofFrom: 40, gateAngle: 3.4, elong: 1.6, name: 'The Whispering Vault' },
];

// -----------------------------------------------------------------------------
// THE SEVEN PLACES
// -----------------------------------------------------------------------------
const L = (o) => o;
export const LOCATIONS = [
  L({
    id: 'glasshorizon', name: 'The Glass Horizon', region: 'shelf', x: 0, z: 620,
    pad: 'glasshorizon', depth: [-6, -16],
    geology: 'Pale bioclastic sand over low limestone ribs',
    flora: 'Seagrass meadows, algae crusts, scattered shell debris',
    light: 'Full sun, moving caustics, bright turquoise water',
    landmark: 'The surface itself: a rippling silver ceiling you can reach',
    desc: 'Where the world begins. Sand in long ripples, rock ribs breaking through, water like glass.',
    entries: ['South, toward the pillars'], map: 'north',
  }),
  L({
    id: 'roseglass', name: 'Roseglass Reef', region: 'reef', x: -520, z: 300,
    pad: 'roseglass', depth: [-18, -34],
    geology: 'Layered reef limestone in stacked terraces',
    flora: 'Branching, table, fan, massive and sponge coral families',
    light: 'Warm bounce off dense coral, softened by two terrace shelves',
    landmark: 'A coral wall split by a sand gutter, topped by table colonies',
    desc: 'Colour at scale: coral colonies stacked on limestone terraces, sand paths between.',
    entries: ['East through the gutter'], map: 'north-west',
  }),
  L({
    id: 'verdant', name: 'Verdant Cathedral', region: 'kelp', x: 520, z: 280,
    pad: 'verdant', depth: [-22, -46],
    geology: 'Kelp-shelf limestone with sediment pockets',
    flora: 'Giant kelp to 38 m in three canopy storeys, plus understory',
    light: 'Green-gold, filtered through a canopy you cannot see the top of',
    landmark: 'A dense stand of stipes rising out of sight',
    desc: 'A forest the size of a town square, its canopy lost overhead.',
    entries: ['West, along the aisle'], map: 'north-east',
  }),
  L({
    id: 'aurel', name: 'The Pillars of Aurel', region: 'cathedral', x: 0, z: 20,
    pad: 'aurel', depth: [-95, -150],
    geology: 'Nine stratified limestone columns, 70–120 m tall, broken crowns',
    flora: 'Encrusting sponge and cold fans on the windward faces',
    light: 'Shafts of light between columns, deep blue behind',
    landmark: 'The colonnade itself — ranks of giants on a drowned plateau',
    desc: 'The monumental place: nine columns standing in ranks out of a broken court.',
    entries: ['Any gap between the columns'], map: 'centre',
  }),
  L({
    id: 'azurespan', name: 'The Azure Span', region: 'archways', x: -480, z: -340,
    pad: 'azurespan', depth: [-170, -260],
    geology: 'A 300 m rock bridge joining two shoulders over a canyon',
    flora: 'Sea fans on the soffit, crusts on the deck',
    light: 'The span cuts the water into bands of light and shadow',
    landmark: 'The bridge: 40 m of rock overhead, open blue beneath',
    desc: 'A rock bridge across a blue valley; below it, the canyon leaves the light.',
    entries: ['Under the span in both directions'], map: 'centre-west',
  }),
  L({
    id: 'floodednave', name: 'The Flooded Nave', region: 'caverns', x: 500, z: -360,
    pad: 'floodednave', depth: [-50, -130], inside: true,
    geology: 'A carved hall 260 m across with a pendentive roof and a lit shaft',
    flora: 'Luminous algae on the vault, pale sponges',
    light: 'One shaft of daylight, everything else self-lit',
    landmark: 'The light shaft falling onto a mineral column at the centre',
    desc: 'An enclosed hall with a wide gate, a vaulted roof and one column of sun.',
    entries: ['The gate, west', 'The shaft from above'], map: 'centre-east',
  }),
  L({
    id: 'abyssalbowl', name: 'The Abyssal Bowl', region: 'abyss', x: 0, z: -700,
    pad: 'abyssalbowl', depth: [-520, -640],
    geology: 'A vast irregular basin ringed by descending walls',
    flora: 'Bioluminescent films, sparse cold fans, no plants',
    light: 'Almost none: silhouettes, scale, and living lights',
    landmark: 'The rim, visible as a faint ring in every direction',
    desc: 'The bottom of the world. Walls fade upward into blue; the floor glows faintly.',
    entries: ['North, up the trench mouth'], map: 'south',
  }),
];

export const LANDMARKS = LOCATIONS.map((l) => ({
  name: l.name, x: l.x, z: l.z, y: (l.depth[0] + l.depth[1]) / 2, region: l.region, id: l.id,
}));

// -----------------------------------------------------------------------------
// PORTALS — one ring per place, standing at the edge of its arena facing the
// world centre. Each ring links to every other place (a hub you can see).
// -----------------------------------------------------------------------------
export const PORTALS = LOCATIONS.map((l, i) => {
  const toCentre = Math.atan2(-l.z, -l.x);
  const dist = Math.min(l.pad ? 150 : 140, 150);
  return {
    id: l.id,
    from: l.id,
    x: l.x + Math.cos(toCentre) * dist,
    z: l.z + Math.sin(toCentre) * dist,
    // standing on the arena floor, ring axis pointing at the world centre
    yaw: toCentre,
    depthOffset: 9,           // metres above the gate-bowl floor
    radius: 8,                // ring radius in metres
    targets: LOCATIONS.filter((o) => o.id !== l.id).map((o) => o.id),
  };
});

// -----------------------------------------------------------------------------
// the field
// -----------------------------------------------------------------------------
function canyonField(x, z) {
  let carve = 0, depth = 0, wsum = 0;
  for (let c = 0; c < CANYONS.length; c++) {
    const cn = CANYONS[c];
    const d = distToPolyline(x, z, cn.pts);
    const w = cn.width[0] + (cn.width[1] - cn.width[0]) * 0.6;
    if (d > w * 1.5) continue;
    let f = 1 - ss(w * 0.32, w * 1.05, d);
    f = Math.pow(f, 0.85 + cn.wall * 1.6);
    if (f > carve) { carve = f; depth = cn.depth[1] * (0.3 + 0.7 * f); wsum = w; }
  }
  return { carve, depth, width: wsum };
}

export function padWeight(x, z, p) {
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx / p.rx, dz / p.rz);
  const edge = (p.edge || 140) / Math.max(p.rx, p.rz);
  const w = 1 - ss(1.0 - edge * 0.55, 1.0 + edge * 0.85, d);
  return { w: clamp01(w), d };
}

/** Global ramp between the arenas: the shape of the basin itself. */
function spine(z) {
  // shallow north, deep south, with a broad shoulder in the middle
  const t = clamp01((700 - z) / 1500);
  const base = lerp(-7, -640, Math.pow(t, 1.35));
  return base;
}

export function macroHeight(x, z) {
  const px = x, pz = z;

  // --- 1. basin spine + macro relief --------------------------------------
  let h = spine(pz);
  const depth0 = -h;
  h += fbm2(px * 0.0016 + 4.7, pz * 0.0016 - 9.4, 3) * (3.0 + depth0 * 0.035);
  h += fbm2(px * 0.0060 - 2.2, pz * 0.0060 + 12.6, 3) * (1.2 + depth0 * 0.012);
  h += ridged2(px * 0.0012 + 6.6, pz * 0.0012 - 14.2, 4) * (3.0 + depth0 * 0.045);
  // long sand waves, so even the shelf has form
  h += ridged2(px * 0.0030 + 3.3, pz * 0.0030 - 7.7, 3) * (2.4 + depth0 * 0.03);

  // --- 2. reef spines in the photic zone ---------------------------------
  if (depth0 < 90) {
    const reefMask = clamp01((0.5 + 0.5 * fbm2(px * 0.0042 + 31.7, pz * 0.0042 - 12.4, 2) - 0.44) * 3.4);
    if (reefMask > 0.01) {
      const rr = ridged2(px * 0.011 + 9.1, pz * 0.011 - 4.4, 3);
      const spines = Math.pow(clamp01((rr - 0.42) * 2.4), 1.5);
      h += spines * (10 + depth0 * 0.30) * reefMask * (1 - ss(60, 90, depth0));
    }
  }

  // --- 3. hero massifs ----------------------------------------------------
  for (let i = 0; i < MASSIFS.length; i++) {
    const m = MASSIFS[i];
    const ca = Math.cos(m.rot || 0), sa = Math.sin(m.rot || 0);
    const dx = px - m.x, dz = pz - m.z;
    const rx = dx * ca - dz * sa, rz = dx * sa + dz * ca;
    const ang = Math.atan2(rz / m.rz, rx / m.rx);
    const lobe = 1 + 0.13 * Math.sin(ang * 3.0 + i * 1.7)
               + 0.09 * Math.sin(ang * 5.0 - i * 2.2)
               + 0.10 * (fbm2(px * 0.011 + i * 4.7, pz * 0.011 - i * 2.3, 3));
    const nd = Math.hypot(rx / (m.rx * lobe), rz / (m.rz * lobe));
    if (nd > 1.9) continue;
    const sideN = m.side / Math.max(m.rx, m.rz);
    const rise = 1 - ss(1.0 - sideN * 0.5, 1.0 + sideN * 0.5, nd);
    if (rise <= 0.002) continue;
    const top = m.y + (0.5 + 0.5 * fbm2(px * 0.005 + i * 7.7, pz * 0.005 - i * 3.1, 3) - 0.5) * Math.abs(m.y) * 0.06;
    if (top > h) {
      const stepped = lerp(h, top, rise);
      const t = terrace(stepped, 8 + Math.min(22, Math.abs(top) * 0.06), 0.55);
      h = lerp(stepped, t, 0.42 * rise * (1 - rise) * 3.2);
    }
  }

  // --- 4. canyons ---------------------------------------------------------
  const cf = canyonField(px, pz);
  if (cf.carve > 0.002) {
    h = lerp(h, h - cf.depth, cf.carve);
    h += fbm2(px * 0.011 + cf.width, pz * 0.011, 3) * 3.0 * cf.carve;
  }

  // --- 5. cave halls ------------------------------------------------------
  for (let i = 0; i < CHAMBERS.length; i++) {
    const c = CHAMBERS[i];
    const dx = px - c.x, dz = pz - c.z;
    const ang = Math.atan2(dz, dx);
    const lobe = 1 + 0.3 * Math.sin(ang * 3 + i * 1.7) + 0.2 * Math.cos(ang * 5 - i);
    const ca = Math.cos(c.gateAngle), sa = Math.sin(c.gateAngle);
    const ex = (dx * ca + dz * sa) * c.elong, ez = (-dx * sa + dz * ca);
    const dd = Math.hypot(ex, ez) / lobe
             + fbm2(px * 0.02 + i * 3.3, pz * 0.02 - i * 1.9, 3) * c.r * 0.5;
    if (dd > c.r * 2.2) continue;
    const bowl = 1 - ss(c.r * 0.30, c.r * 1.45, dd);
    h -= c.depth * Math.pow(clamp01(bowl), 1.25);
    // a real gate: the entrance channel is carved outward from the hall
    const gx = c.x + Math.cos(c.gateAngle) * c.r, gz = c.z + Math.sin(c.gateAngle) * c.r;
    const gd = distToPolyline(px, pz, [[c.x, c.z], [gx, gz],
      [gx + Math.cos(c.gateAngle) * 120, gz + Math.sin(c.gateAngle) * 120]]);
    const gw = 1 - ss(24, 74, gd);
    if (gw > 0) h -= c.depth * 0.5 * gw * (1 - ss(c.r * 1.2, c.r * 2.4, dd));
  }

  // --- 6. abyssal bowl ----------------------------------------------------
  const bowl = blob(px, pz + 700, 460, 330);
  if (bowl > 0) h -= 70 * Math.pow(bowl, 1.2);

  // --- 7. authored pads: continuous weighted blending -------------------
  // Hard winner-takes-all switches between pads can jump hundreds of metres
  // where two equal scores have different elevations. A steep power retains
  // the stronger local authoring while making those crossings continuous.
  let bestScore = 0, targetWeight = 0, targetSum = 0;
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    if (Math.abs(px - p.x) > p.rx * 2.4 || Math.abs(pz - p.z) > p.rz * 2.4) continue;
    const { w, d } = padWeight(px, pz, p);
    if (w <= 0.001) continue;
    let target = p.y;
    if (p.mode === 'slope') {
      const t = clamp01((d - 0.15) / 1.0);
      target = lerp(p.y, p.y2 ?? p.y - 30, t * 0.9);
    }
    const relief = (0.5 + 0.5 * fbm2(px * 0.012 + i * 3.3, pz * 0.012 - i * 1.7, 3) - 0.5)
                 * (p.mode === 'basin' ? 5.0 : 2.2);
    const score = w * (p.pri || 1) * (1.0 - 0.3 * Math.min(d, 1.2));
    const blendWeight = Math.pow(score, 8);
    targetWeight += blendWeight;
    targetSum += (target + relief) * blendWeight;
    if (score > bestScore) bestScore = score;
  }
  if (bestScore > 0.001 && targetWeight > 0) h = lerp(h, targetSum / targetWeight, clamp01(bestScore));

  // --- 8. limits ----------------------------------------------------------
  h = Math.min(h, -4.0);
  h = Math.max(h, -700);
  return h;
}

function detailHeight(x, z, base) {
  const d = -base;
  const amp = 0.30 + Math.min(3.4, d * 0.020);
  let n = fbm2(x * 0.021 + 4.4, z * 0.021 - 2.2, 4) * amp;
  n += fbm2(x * 0.055 - 1.1, z * 0.055 + 5.5, 3) * amp * 0.32;
  n += ridged2(x * 0.010 + 8.8, z * 0.010 - 6.6, 3) * amp * 0.42;
  return n;
}

/** The world beyond the charted basin: distant ridges, no visible edge. */
export function distantHeight(x, z) {
  const ex = Math.max(0, Math.max(WORLD.minX - x, x - WORLD.maxX));
  const ez = Math.max(0, Math.max(WORLD.minZ - z, z - WORLD.maxZ));
  const e = Math.hypot(ex, ez);
  const ridge = ridged2(x * 0.0022 + 5.1, z * 0.0022 - 3.7, 4);
  const edgeY = macroHeight(clamp(x, WORLD.minX + 30, WORLD.maxX - 30),
                            clamp(z, WORLD.minZ + 30, WORLD.maxZ - 30));
  return edgeY - e * 0.10 - ridge * (60 + e * 0.22);
}

// -----------------------------------------------------------------------------
export class TerrainField {
  constructor() {
    this.nx = WORLD.nx; this.nz = WORLD.nz;
    this.vx = this.nx + 1; this.vz = this.nz + 1;
    this.cell = WORLD.cell;
    this.heights = new Float32Array(this.vx * this.vz);
  }

  xAt(i) { return WORLD.minX + i * this.cell; }
  zAt(j) { return WORLD.minZ + j * this.cell; }

  build() {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const { vx, vz, heights, cell } = this;
    for (let j = 0; j < vz; j++) {
      const z = WORLD.minZ + j * cell;
      for (let i = 0; i < vx; i++) {
        const x = WORLD.minX + i * cell;
        const m = macroHeight(x, z);
        heights[j * vx + i] = m + detailHeight(x, z, m);
      }
    }
    // Relax grid-scale spikes without replacing the authored terrain. Repeated
    // small Gaussian passes spread abrupt transitions over roughly one terrain
    // tile while preserving large-scale basins, shelves and landmark positions.
    // Geometry, collision, flora and the chart all read this same filtered grid.
    const scratch = new Float32Array(heights.length);
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
        const k = j * vx + i;
        const left = j * vx + Math.max(0, i - 1), right = j * vx + Math.min(vx - 1, i + 1);
        const down = Math.max(0, j - 1) * vx + i, up = Math.min(vz - 1, j + 1) * vx + i;
        scratch[k] = heights[k] * .5 + (heights[left] + heights[right] + heights[down] + heights[up]) * .125;
      }
      heights.set(scratch);
    }
    // Limit the worst grid-scale cliff artifacts without flattening the
    // larger authored shelves and bowls. Conservative, pairwise diffusion
    // moves height only where a 4 m grid edge exceeds 20 m; each adjustment
    // is balanced by its neighbor and therefore preserves average elevation.
    // It reduces spikes, not a guarantee that the whole world is walkable.
    const limit = 20;
    const flow = d => d > limit ? (d-limit)*.16 : d < -limit ? (d+limit)*.16 : 0;
    for (let pass = 0; pass < 80; pass++) {
      for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
        const k = j * vx + i, y = heights[k];
        let delta = 0;
        const left = j * vx + Math.max(0, i - 1), right = j * vx + Math.min(vx - 1, i + 1);
        const down = Math.max(0, j - 1) * vx + i, up = Math.min(vz - 1, j + 1) * vx + i;
        delta=flow(heights[left]-y)+flow(heights[right]-y)
             +flow(heights[down]-y)+flow(heights[up]-y);
        scratch[k]=y+delta;
      }
      heights.set(scratch);
    }
    this.buildTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    let mn = 1e9, mx = -1e9;
    for (let k = 0; k < heights.length; k++) { const v = heights[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
    this.minY = mn; this.maxY = mx;
    return this;
  }

  heightAt(x, z) {
    const fx = (x - WORLD.minX) / this.cell;
    const fz = (z - WORLD.minZ) / this.cell;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > this.nx - 1) i = this.nx - 1;
    if (j < 0) j = 0; else if (j > this.nz - 1) j = this.nz - 1;
    const tx = clamp01(fx - i), tz = clamp01(fz - j);
    const vx = this.vx, h = this.heights;
    const h00 = h[j * vx + i], h10 = h[j * vx + i + 1];
    const h01 = h[(j + 1) * vx + i], h11 = h[(j + 1) * vx + i + 1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Match the two triangles actually rendered for each terrain grid cell.
   * heightAt is intentionally retained for existing placement and map logic;
   * collision uses this method to avoid a bilinear/mesh mismatch on slopes.
   */
  surfaceHeightAt(x, z) {
    // A non-finite world coordinate must never reach grid indexing. Returning a
    // conservative floor keeps collision, creature placement, and navigation
    // finite instead of propagating NaN into the renderer.
    if (!Number.isFinite(x) || !Number.isFinite(z)) return -40;
    const fx = (x - WORLD.minX) / this.cell;
    const fz = (z - WORLD.minZ) / this.cell;
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.floor(fz)));
    const tx = clamp01(fx - i), tz = clamp01(fz - j);
    const h = this.heights, v = this.vx;
    const a = h[j * v + i], b = h[j * v + i + 1];
    const c = h[(j + 1) * v + i], d = h[(j + 1) * v + i + 1];
    return tx + tz <= 1
      ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = this.cell;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    const nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.x = nx / len; out.y = ny / len; out.z = nz / len;
    return out;
  }

  slopeAt(x, z) { return Math.acos(clamp(this.normalAt(x, z).y, -1, 1)); }
  steepness(x, z) { return 1 - this.normalAt(x, z).y; }
  depthAt(x, z) { return -this.heightAt(x, z); }

  regionAt(x, y, z) {
    let best = null, bestScore = 1e18;
    for (const r of REGIONS) {
      const d = Math.hypot(x - r.anchor[0], z - r.anchor[1]);
      const inDepth = y <= r.depth[0] + 20 && y >= r.depth[1] - 80;
      const score = d / r.radius + (inDepth ? 0 : 0.8);
      if (score < bestScore) { bestScore = score; best = r; }
    }
    return best || REGIONS[0];
  }

  /** Nearest named place, if the swimmer is inside one. */
  locationAt(x, y, z) {
    let best = null, bestD = 1e18;
    for (const l of LOCATIONS) {
      const d = Math.hypot(x - l.x, z - l.z);
      const inBand = y >= l.depth[1] - 55 && y <= l.depth[0] + 55;
      const reach = l.inside ? 200 : 260;
      if (d < reach && (inBand || d < reach * 0.5)) {
        if (d < bestD) { bestD = d; best = l; }
      }
    }
    return best;
  }
}

export const START_POSE = { x: 0, y: -6, z: 720, yaw: 0.02, pitch: -0.12 };
