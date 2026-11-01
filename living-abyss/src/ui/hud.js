// -----------------------------------------------------------------------------
// THE LIVING ABYSS — HUD, bathymetric chart, compass, discovery
// The map is generated from the same height field the world is built from, so
// what you read on the chart is exactly what you swim through.
// -----------------------------------------------------------------------------
import { WORLD, REGIONS, LOCATIONS, PORTALS } from '../world/geography.js?rev=37';

const LANDMARKS = LOCATIONS;

const el = (id) => document.getElementById(id);

let field = null;
let mapCanvas = null;       // offscreen bathymetry
let mini, miniCtx, big, bigCtx, compass, compassCtx;
let discovered = new Set();
let toastTimer = 0;
let lastRegion = null;
let lastMapState = null;
export const waypoint = { x: 0, z: 0, y: 0, active: false, name: '' };

const DEPTH_STOPS = [
  [0.00, [232, 226, 196]],
  [0.04, [188, 214, 168]],
  [0.10, [120, 206, 196]],
  [0.20, [58, 168, 190]],
  [0.34, [30, 112, 168]],
  [0.50, [16, 68, 132]],
  [0.68, [10, 38, 92]],
  [0.84, [6, 20, 56]],
  [1.00, [3, 9, 26]],
];

function depthColor(t) {
  for (let i = 0; i < DEPTH_STOPS.length - 1; i++) {
    const a = DEPTH_STOPS[i], b = DEPTH_STOPS[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return [a[1][0] + (b[1][0] - a[1][0]) * u,
              a[1][1] + (b[1][1] - a[1][1]) * u,
              a[1][2] + (b[1][2] - a[1][2]) * u];
    }
  }
  return DEPTH_STOPS[DEPTH_STOPS.length - 1][1];
}

/** Render the chart once: depth ramp + hillshade + contour bands. */
function buildBathymetry() {
  const w = field.vx, h = field.vz;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = field.heights;
  const cell = field.cell;
  const sun = [-0.55, 0.62, -0.56];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const y = H[k];
      const hl = H[k - 1] ?? y, hr = H[k + 1] ?? y;
      const hd = H[k - w] ?? y, hu = H[k + w] ?? y;
      const gx = (hl - hr) / (2 * cell), gz = (hd - hu) / (2 * cell);
      const nl = Math.hypot(gx, gz, 1);
      const shade = Math.max(0, (gx * sun[0] + sun[1] + gz * sun[2]) / nl);
      const t = Math.min(1, Math.max(0, -y / WORLD.maxDepth));
      let c = depthColor(t);
      const sh = 0.42 + 0.86 * Math.pow(shade, 1.15);
      // gentle contour banding every 50 m
      const band = ((y % 50) + 50) % 50;
      const contour = band < 1.6 ? 0.72 : 1.0;
      const o = k * 4;
      img.data[o] = Math.min(255, c[0] * sh * contour);
      img.data[o + 1] = Math.min(255, c[1] * sh * contour);
      img.data[o + 2] = Math.min(255, c[2] * sh * contour);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

const toMapX = (x, cw) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * cw;
const toMapY = (z, ch) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * ch;

function drawLandmarks(ctx, cw, ch, scale) {
  ctx.save();
  for (const lm of LANDMARKS) {
    const x = toMapX(lm.x, cw), y = toMapY(lm.z, ch);
    const known = discovered.has(lm.id);
    ctx.beginPath();
    ctx.arc(x, y, (known ? 2.4 : 1.8) * scale, 0, Math.PI * 2);
    ctx.fillStyle = known ? 'rgba(190,255,240,0.95)' : 'rgba(150,200,215,0.30)';
    ctx.fill();
    if (!known) {
      ctx.beginPath();
      ctx.arc(x, y, 3.6 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(160,215,230,0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (scale > 1.5 && known) {
      ctx.font = `${9 * scale}px Inter, sans-serif`;
      ctx.fillStyle = 'rgba(215,252,255,0.80)';
      ctx.fillText(lm.name, x + 5 * scale, y + 3 * scale);
    }
  }
  ctx.restore();
}

function drawPlayer(ctx, cw, ch, pos, yaw, scale) {
  const x = toMapX(pos.x, cw), y = toMapY(pos.z, ch);
  ctx.save();
  ctx.translate(x, y);
  // view cone
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // map north (-z) is up; heading yaw 0 looks north
  for (let a = -0.45; a <= 0.45; a += 0.09) {
    const ang = yaw + a;
    ctx.lineTo(-Math.sin(ang) * 22 * scale, -Math.cos(ang) * 22 * scale);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(150,255,235,0.16)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 3.2 * scale, 0, Math.PI * 2);
  ctx.fillStyle = '#eafcff';
  ctx.shadowColor = '#7ff3e4';
  ctx.shadowBlur = 8 * scale;
  ctx.fill();
  ctx.restore();
}

export function initHUD(terrainField) {
  field = terrainField;
  mapCanvas = buildBathymetry();
  mini = el('mapCv'); miniCtx = mini.getContext('2d');
  big = el('bigmapCv'); bigCtx = big.getContext('2d');
  compass = el('compassCv'); compassCtx = compass.getContext('2d');

  // region legend
  const leg = el('bigmapLeg');
  leg.innerHTML = REGIONS.map(r =>
    `<span><i style="background:${r.tone}"></i>${r.name}</span>`).join('');

  const select = el('mapDestination');
  for (const l of LOCATIONS) {
    const option = document.createElement('option'); option.value = l.id; option.textContent = l.name; select.appendChild(option);
  }
  const mark = (x, z, name) => {
    waypoint.x = x; waypoint.z = z; waypoint.active = true; waypoint.name = name;
    waypoint.y = field.heightAt(x, z);
    showToast('Tracking ' + name, `${Math.round(x)} · ${Math.round(z)}`);
    drawBigMap(lastMapState);
  };
  select.addEventListener('change', () => {
    const destination = LOCATIONS.find(l => l.id === select.value);
    if (destination) mark(destination.x, destination.z, destination.name);
    select.blur();
  });
  el('mapClear').addEventListener('click', () => {
    waypoint.active = false; select.value = ''; el('mapClear').blur(); drawBigMap(lastMapState);
  });
  el('mapClose').addEventListener('click', () => toggleBigMap(false));
  // clicking the chart sets a waypoint (it never teleports the player)
  big.addEventListener('click', (e) => {
    const r = big.getBoundingClientRect();
    const x = WORLD.minX + ((e.clientX - r.left) / r.width) * (WORLD.maxX - WORLD.minX);
    const z = WORLD.minZ + ((e.clientY - r.top) / r.height) * (WORLD.maxZ - WORLD.minZ);
    select.value = '';
    mark(x, z, 'Waypoint');
  });
}

export function toggleBigMap(force) {
  const node = el('bigmap');
  const on = force !== undefined ? force : !node.classList.contains('on');
  node.classList.toggle('on', on);
  if (on) {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    drawBigMap(lastMapState);
  }
  return on;
}

export function bigMapOpen() {
  return el('bigmap').classList.contains('on');
}

function drawTracking(ctx, cw, ch, pos, scale) {
  if (!waypoint.active || !pos) return;
  const px=toMapX(pos.x,cw), py=toMapY(pos.z,ch), wx=toMapX(waypoint.x,cw), wy=toMapY(waypoint.z,ch);
  ctx.save(); ctx.strokeStyle='#b7ffed'; ctx.globalAlpha=.9; ctx.lineWidth=1.5*scale;
  ctx.setLineDash([5*scale,4*scale]); ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(wx,wy); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(wx,wy,5*scale,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(wx,wy,1.7*scale,0,Math.PI*2); ctx.fillStyle='#e9fff9';ctx.fill();ctx.restore();
}

function drawBigMap(state) {
  if (!bigCtx) return;
  const label = el('mapTracking');
  if (label) {
    if (state && waypoint.active) {
      const dx=waypoint.x-state.pos.x, dz=waypoint.z-state.pos.z;
      const dist=Math.hypot(dx,dz), bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
      label.textContent = `${waypoint.name} · ${Math.round(dist)} m · ${Math.round(bearing)}° · straight-line guide, not a safe route`;
    } else if (waypoint.active) label.textContent = `${waypoint.name} · acquiring live position…`;
    else label.textContent = 'Click the map or choose a place to track · W/A/S/D to swim while the map is open';
  }
  const cw = big.width, ch = big.height;
  bigCtx.clearRect(0, 0, cw, ch);
  bigCtx.imageSmoothingEnabled = true;
  bigCtx.drawImage(mapCanvas, 0, 0, cw, ch);
  // region rings
  bigCtx.save();
  for (const r of REGIONS) {
    const x = toMapX(r.anchor[0], cw), y = toMapY(r.anchor[1], ch);
    bigCtx.beginPath();
    bigCtx.arc(x, y, (r.radius / (WORLD.maxX - WORLD.minX)) * cw, 0, Math.PI * 2);
    bigCtx.strokeStyle = r.tone + '55';
    bigCtx.lineWidth = 1.2;
    bigCtx.setLineDash([5, 7]);
    bigCtx.stroke();
    bigCtx.setLineDash([]);
    bigCtx.font = '11px Inter, sans-serif';
    bigCtx.fillStyle = r.tone + 'dd';
    bigCtx.fillText(r.short.toUpperCase(), x - 26, y - (r.radius / (WORLD.maxX - WORLD.minX)) * cw - 6);
  }
  bigCtx.restore();
  drawLandmarks(bigCtx, cw, ch, 2.4);
  if (state) {
    drawTracking(bigCtx, cw, ch, state.pos, 2.0);
    drawPlayer(bigCtx, cw, ch, state.pos, state.yaw, 2.4);
  }
}

function drawCompass(state) {
  if (!compassCtx) return;
  const cw = compass.width, ch = compass.height;
  compassCtx.clearRect(0, 0, cw, ch);
  const heading = (-state.yaw * 180 / Math.PI + 360) % 360;
  compassCtx.save();
  compassCtx.translate(cw / 2, ch / 2);
  compassCtx.font = '600 11px Inter, sans-serif';
  compassCtx.textAlign = 'center';
  const span = 100;
  for (let d = -span; d <= span; d += 5) {
    const deg = heading + d;
    const x = (d / span) * (cw / 2 - 6);
    const norm = ((deg % 360) + 360) % 360;
    const fade = 1 - Math.abs(d) / span;
    const cardinal = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const card = cardinal[Math.round(norm / 45) * 45 % 360];
    if (card && Math.abs(norm - Math.round(norm / 45) * 45) < 2.5) {
      compassCtx.fillStyle = `rgba(220,252,255,${0.35 + 0.65 * fade})`;
      compassCtx.fillText(card, x, 4);
    } else if (Math.abs(norm % 15) < 1.4) {
      compassCtx.fillStyle = `rgba(150,215,230,${0.12 + 0.4 * fade})`;
      compassCtx.fillRect(x, -4, 1, 8);
    }
  }
  compassCtx.restore();
  // centre marker
  compassCtx.fillStyle = 'rgba(234,252,255,0.95)';
  compassCtx.beginPath();
  compassCtx.moveTo(cw / 2, 3); compassCtx.lineTo(cw / 2 - 4, -5); compassCtx.lineTo(cw / 2 + 4, -5);
  compassCtx.closePath();
  compassCtx.fill();
}

export function showToast(t1, t2, ms = 2600) {
  const t = el('toast');
  t.querySelector('.t1').textContent = t1;
  t.querySelector('.t2').textContent = t2 || '';
  t.classList.add('on');
  toastTimer = ms;
}

let placeCard = null;
let placeTimer = 0;

function ensurePlaceCard() {
  if (placeCard) return placeCard;
  placeCard = document.createElement('div');
  placeCard.id = 'placeCard';
  placeCard.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:19%', 'transform:translateX(-50%)',
    'max-width:min(620px,80vw)', 'padding:14px 20px 15px', 'border-radius:12px',
    'background:linear-gradient(180deg,rgba(4,26,36,0.86),rgba(2,14,22,0.92))',
    'border:1px solid rgba(140,235,255,0.26)', 'box-shadow:0 10px 40px rgba(0,0,0,0.5)',
    'color:#dff7ff', 'font-family:Inter,system-ui,sans-serif', 'text-align:center',
    'opacity:0', 'transition:opacity .7s ease', 'pointer-events:none', 'z-index:30',
  ].join(';');
  placeCard.innerHTML = `<div id="pcName" style="font-size:15px;letter-spacing:.30em;text-transform:uppercase;color:#eafdff"></div>
    <div id="pcMeta" style="margin-top:5px;font-size:10.5px;letter-spacing:.20em;color:#7fd9d2;text-transform:uppercase"></div>
    <div id="pcDesc" style="margin-top:8px;font-size:12.5px;line-height:1.55;color:#a8cbd8"></div>`;
  document.body.appendChild(placeCard);
  return placeCard;
}

const discoveredPlaces = new Set();
export function discoverAt(pos) {
  const l = field.locationAt(pos.x, pos.y, pos.z);
  if (!l) return null;
  if (discoveredPlaces.has(l.id)) return null;
  discoveredPlaces.add(l.id);
  discovered.add(l.id);
  const card = ensurePlaceCard();
  card.querySelector('#pcName').textContent = l.name;
  const region = REGIONS.find((r) => r.id === l.region);
  card.querySelector('#pcMeta').textContent =
    `${region ? region.short : l.region} · ${Math.abs(l.depth[0])}–${Math.abs(l.depth[1])} m · DISCOVERED ${discoveredPlaces.size}/${LOCATIONS.length}`;
  card.querySelector('#pcDesc').textContent = l.desc;
  card.style.opacity = '1';
  placeTimer = 6.5;
  return l;
}

export function discoveredCount() { return discoveredPlaces.size; }

export function updateHUD(state, dt) {
  lastMapState = state;
  const region = field.regionAt(state.pos.x, state.pos.y, state.pos.z);
  el('regionName').textContent = region.name;
  el('regionBlurb').textContent = region.blurb;

  if (!discovered.has(region.id)) {
    discovered.add(region.id);
    if (lastRegion && discovered.size > 1) {
      showToast('Region discovered', region.name);
    }
    lastRegion = region.id;
  }

  const depth = Math.max(0, -state.pos.y);
  el('depth').textContent = Math.round(depth).toLocaleString();
  el('depthMark').style.left = `${Math.min(100, (depth / WORLD.maxDepth) * 100)}%`;
  el('posReadout').textContent = `X ${Math.round(state.pos.x)} · Z ${Math.round(state.pos.z)}`;

  // minimap
  if (miniCtx) {
    const cw = mini.width, ch = mini.height;
    miniCtx.clearRect(0, 0, cw, ch);
    miniCtx.drawImage(mapCanvas, 0, 0, cw, ch);
    drawLandmarks(miniCtx, cw, ch, 1.0);
    drawTracking(miniCtx, cw, ch, state.pos, 0.75);
    drawPlayer(miniCtx, cw, ch, state.pos, state.yaw, 1.6);
  }
  drawCompass(state);

  // named-place discovery
  if (field && field.locationAt) discoverAt(state.pos);
  if (placeTimer > 0) {
    placeTimer -= dt;
    if (placeTimer <= 0 && placeCard) placeCard.style.opacity = '0';
  }

  if (toastTimer > 0) {
    toastTimer -= dt * 1000;
    if (toastTimer <= 0) el('toast').classList.remove('on');
  }

  // waypoint guidance
  const wpEl = el('waypoint');
  if (waypoint.active) {
    const dx = waypoint.x - state.pos.x, dz = waypoint.z - state.pos.z;
    const dist = Math.hypot(dx, dz);
    const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const heading = (-state.yaw * 180 / Math.PI + 360) % 360;
    let rel = ((bearing - heading + 540) % 360) - 180;
    const arrow = rel > 12 ? '▸' : rel < -12 ? '◂' : '▴';
    wpEl.textContent = `${arrow} ${waypoint.name} ${Math.round(dist)} m · ${Math.round(bearing)}°`;
    wpEl.style.opacity = 0.9;
  } else {
    wpEl.style.opacity = 0;
  }
  if (bigMapOpen()) drawBigMap(state);
}

export function setPerf(text) {
  const p = el('perf');
  if (p) p.innerHTML = text;
}

export function hideHUD(force) {
  const hud = el('hud');
  const on = force !== undefined ? !force : hud.style.display !== 'none';
  hud.style.display = on ? 'none' : '';
}


// -----------------------------------------------------------------------------
// TRAVEL DIAL — opened by swimming into a portal ring
// -----------------------------------------------------------------------------
let dial = null;

function ensureDial() {
  if (dial) return dial;
  dial = document.createElement('div');
  dial.id = 'travelDial';
  dial.style.cssText = [
    'position:fixed', 'inset:0', 'display:none', 'align-items:center', 'justify-content:center',
    'background:radial-gradient(circle at 50% 50%, rgba(2,18,26,0.72), rgba(1,8,14,0.90))',
    'backdrop-filter:blur(3px)', 'z-index:60', 'font-family:Inter,system-ui,sans-serif',
  ].join(';');
  dial.innerHTML = `
    <div style="text-align:center;width:min(880px,88vw);max-height:90vh;overflow-y:auto;overscroll-behavior:contain;padding:12px 8px;box-sizing:border-box">
      <div id="dialTitle" style="font-size:13px;letter-spacing:.42em;text-transform:uppercase;color:#8ff3e4"></div>
      <div id="dialSub" style="margin-top:8px;font-size:11px;letter-spacing:.22em;color:#7fa9b8;text-transform:uppercase">Choose a destination · or press Esc</div>
      <div id="dialGrid" style="margin-top:26px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;width:100%"></div>
    </div>`;
  document.body.appendChild(dial);
  return dial;
}

export function openTravelDial(fromId, onPick, onClose) {
  const d = ensureDial();
  const grid = d.querySelector('#dialGrid');
  const from = LOCATIONS.find((l) => l.id === fromId);
  d.querySelector('#dialTitle').textContent = from ? `Portal · ${from.name}` : 'Portal';
  grid.innerHTML = '';
  for (const l of LOCATIONS) {
    const region = REGIONS.find((r) => r.id === l.region);
    const isHere = l.id === fromId;
    const card = document.createElement('button');
    card.style.cssText = [
      'text-align:left', 'padding:14px 16px', 'border-radius:10px', 'cursor:pointer',
      'background:linear-gradient(180deg,rgba(6,32,42,0.92),rgba(2,14,20,0.95))',
      'border:1px solid ' + (isHere ? 'rgba(120,240,220,0.55)' : 'rgba(140,235,255,0.22)'),
      'color:#dff7ff', 'font-family:inherit', 'transition:transform .15s ease,border-color .15s ease',
      isHere ? 'opacity:0.55' : '',
    ].join(';');
    card.innerHTML = `
      <div style="font-size:10.5px;letter-spacing:.24em;color:${region.tone};text-transform:uppercase">${region.short}</div>
      <div style="margin-top:6px;font-size:14px;letter-spacing:.06em">${l.name}${isHere ? ' · you are here' : ''}</div>
      <div style="margin-top:6px;font-size:11px;color:#7fa9b8">${Math.abs(l.depth[0])}–${Math.abs(l.depth[1])} m</div>`;
    card.onmouseenter = () => { if (!isHere) card.style.borderColor = 'rgba(150,255,235,0.75)'; };
    card.onmouseleave = () => { if (!isHere) card.style.borderColor = 'rgba(140,235,255,0.22)'; };
    card.onclick = () => { if (!isHere) { closeTravelDial(); onPick(l.id); } };
    grid.appendChild(card);
  }
  d.style.display = 'flex';
  d.dataset.onClose = '1';
  d.onclick = (e) => { if (e.target === d) { closeTravelDial(); onClose && onClose(); } };
}

export function closeTravelDial() {
  if (dial) dial.style.display = 'none';
}

export function travelDialOpen() {
  return !!dial && dial.style.display === 'flex';
}

/** Small prompt shown when the swimmer is inside a portal ring. */
let portalPrompt = null;
export function showPortalPrompt(name) {
  if (!portalPrompt) {
    portalPrompt = document.createElement('div');
    portalPrompt.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:12%', 'transform:translateX(-50%)',
      'padding:10px 18px', 'border-radius:999px', 'font-family:Inter,system-ui,sans-serif',
      'font-size:11px', 'letter-spacing:.24em', 'text-transform:uppercase',
      'color:#eafdff', 'background:rgba(3,24,32,0.82)',
      'border:1px solid rgba(140,235,255,0.35)', 'z-index:35', 'pointer-events:none',
      'transition:opacity .3s ease', 'opacity:0',
    ].join(';');
    document.body.appendChild(portalPrompt);
  }
  portalPrompt.textContent = name ? `Press E to travel · ${name}` : 'Press E to travel';
  portalPrompt.style.opacity = '1';
}
export function hidePortalPrompt() {
  if (portalPrompt) portalPrompt.style.opacity = '0';
}
