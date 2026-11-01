// -----------------------------------------------------------------------------
// THE LIVING ABYSS — TELEPORTER PORTALS
//
// One portal stands at the edge of each of the seven places, facing the centre of
// the world. Swim into the ring and a travel dial opens listing all seven places;
// choose one and you arrive at that place's own portal, facing into it.
//
// The ring is real geometry: a stone torus with a lit inner membrane, drifting
// motes and a ground plinth — so it reads as an object built into the landscape,
// not a UI marker.
// -----------------------------------------------------------------------------
import * as THREE from '../../vendor/three.module.js';
import { GLSL_NOISE, GLSL_MEDIUM, GLSL_LIGHT, withShared } from '../shaders/common.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';
import { WORLD, PORTALS, LOCATIONS, REGIONS } from './geography.js?rev=37';

// ---------------------------------------------------------------------------
// portal membrane shader
// ---------------------------------------------------------------------------
const PORTAL_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PORTAL_FS = GLSL_NOISE + GLSL_MEDIUM + /* glsl */`
uniform vec3 uColor;
uniform float uOpen;      // 0 = dormant, 1 = awake
uniform float uActive;    // 1 while the player is inside
varying vec2 vUv;
varying vec3 vWorld;

void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // concentric caustic rings drifting outward from the centre
  float ang = atan(p.y, p.x);
  float ripple = sin(r * 22.0 - uTime * 2.2 + sin(ang * 5.0 + uTime * 0.8) * 1.6) * 0.5 + 0.5;
  float veil = fbm2(vec2(ang * 2.2 + uTime * 0.25, r * 4.0 - uTime * 0.55), 4);
  veil = pow(veil, 1.6);

  float core = pow(1.0 - r, 2.2);
  float edge = (1.0 - smoothstep(0.80, 1.0, r));

  vec3 col = uColor * (0.35 + 1.5 * core) * (0.55 + 0.75 * veil) * (0.35 + 0.65 * ripple);
  col += uColor * core * 0.8;
  float alpha = edge * (0.30 + 0.62 * core + 0.25 * veil) * (0.35 + 0.65 * uOpen);
  alpha *= 1.0 + 0.35 * uActive;

  col = applyWater(col, vWorld);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
}
`;

const MOTE_VS = /* glsl */`
uniform float uTime;
uniform float uRadius;
attribute float aPhase;
attribute float aSize;
varying float vFade;
void main(){
  float t = uTime * 0.35 + aPhase;
  float a = aPhase * 6.2831;
  vec3 p = position;
  p.x += sin(t * 1.1 + a) * uRadius * 0.14;
  p.y += cos(t * 0.9 + a * 1.7) * uRadius * 0.10;
  p.z += sin(t * 0.7 + a * 2.3) * uRadius * 0.10;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * 260.0 / max(-mv.z, 1.0), 1.0, 7.0);
  vFade = 0.5 + 0.5 * sin(t * 2.4 + a * 3.0);
}
`;

const MOTE_FS = /* glsl */`
uniform vec3 uColor;
varying float vFade;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * (0.25 + 0.75 * vFade);
  gl_FragColor = vec4(uColor * (0.7 + 0.8 * vFade), a * 0.85);
}
`;

// ---------------------------------------------------------------------------
/**
 * A gate may not be embedded in a rock. Walk outward along the line from the
 * place to the world centre and take the first spot that is (a) clear of every
 * collision volume and (b) roughly level, so the ring always stands free.
 */
function clearSpot(field, loc, colliders, yaw, surfaces = []) {
  const RING_Y = 9, CLEAR = 12.5;
  const floorAt = (x,z) => field.surfaceHeightAt ? field.surfaceHeightAt(x,z) : field.heightAt(x,z);
  const tryAt = (x, z) => {
    // Reserve room for the ring, approaches and the arrival pose inside the
    // playable chart; terrain sampling outside the chart otherwise clamps.
    if (x < WORLD.minX + 28 || x > WORLD.maxX - 28 || z < WORLD.minZ + 28 || z > WORLD.maxZ - 28) return null;
    const floor = floorAt(x, z), cy = floor + RING_Y;
    // A geometrically clear gate must still be in its destination's water
    // column; otherwise a deep-basin gate can land hundreds of metres above it.
    if (cy > loc.depth[0] + 40 || cy < loc.depth[1] - 40) return null;
    if (field.steepness(x,z) > .32) return null;
    // Check the full ring height and a horizontal apron against actual visual
    // geometry bounds, including boulders, shelves, walls and large scree.
    // Broad bounds can reject good sites, but cannot certify mesh clearance.
    for (const solid of surfaces) {
      const b = solid.bounds;
      if (x+CLEAR>b.min.x && x-CLEAR<b.max.x && z+CLEAR>b.min.z && z-CLEAR<b.max.z && cy+10>b.min.y && cy-10<b.max.y) return null;
    }
    for (const c of colliders) {
      if (c.type==='cyl' && Math.hypot(x-c.x,z-c.z)<c.r+CLEAR && cy+10>c.yBase && cy-10<c.yTop) return null;
      if (c.type==='ell' && Math.hypot((x-c.x)/(c.rx+CLEAR),(z-c.z)/(c.rz+CLEAR))<1 && Math.abs(cy-c.y)<c.ry+10) return null;
    }
    for(const [dx,dz] of [[-8,0],[8,0],[0,-8],[0,8]])
      if(Math.abs(floorAt(x+dx,z+dz)-floor)>4) return null;
    return {x,z,floor,centreY:cy,clearanceVerified:surfaces.length>0};
  };
  // Prefer original location; search modestly outward only when it is buried.
  const dists=[150,144,156,135,165,125,175,110,190,100,95,205,220,230,240,80,70,60,50,40];
  const swings=[0,.07,-.07,.14,-.14,.25,-.25,.4,-.4,.6,-.6,.85,-.85,.872664625997,-.872664625997,1.1,-1.1,1.4,-1.4,1.8,-1.8,2.3,-2.3,Math.PI,...Array.from({length:48},(_,i)=>i*Math.PI/24)];
  for (const d of dists) for(const swing of swings){
    const a=yaw+swing,x=loc.x+Math.cos(a)*d,z=loc.z+Math.sin(a)*d;
    const hit=tryAt(x,z); if(hit)return hit;
  }
  const x=loc.x+Math.cos(yaw)*150,z=loc.z+Math.sin(yaw)*150,floor=floorAt(x,z);
  console.warn(`No clear portal site found for ${loc.id}; original site retained`);
  return {x,z,floor,centreY:floor+RING_Y,clearanceVerified:false};
}

// Azure's original gate bowl is genuinely flat, but very large arch/wall AABBs
// overlap it even when their visible triangles do not. After reserving its
// approach in geology, check actual surfaces rather than rejecting the bowl
// merely because it lies inside an arch's empty bounding box.
function preferredAzureSpot(field,loc,yaw,surfaces){
  if(!surfaces.length)return null;
  const x=loc.x+Math.cos(yaw)*150,z=loc.z+Math.sin(yaw)*150;
  const floorAt=(a,b)=>field.surfaceHeightAt?field.surfaceHeightAt(a,b):field.heightAt(a,b);
  const floor=floorAt(x,z),cy=floor+9,ux=(loc.x-x)/150,uz=(loc.z-z)/150;
  if(cy>loc.depth[0]+40||cy<loc.depth[1]-40||field.steepness(x,z)>.25)return null;
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    if(Math.abs(floorAt(x+Math.cos(a)*10,z+Math.sin(a)*10)-floor)>2.5)return null;
  }
  const guards=new Map();
  function clear(px,py,pz,r){
    const point=new THREE.Vector3(px,py,pz);
    for(const solid of surfaces){
      const b=solid.bounds;
      if(px+r<b.min.x||px-r>b.max.x||py+r<b.min.y||py-r>b.max.y||pz+r<b.min.z||pz-r>b.max.z)continue;
      if(!guards.has(solid))guards.set(solid,solid.createGuard());
      if(guards.get(solid).resolve(point.clone(),r))return false;
    }
    return true;
  }
  if(!clear(x,cy,z,14))return null; // ring + plinth, conservatively enclosed
  for(let t=-30;t<=30;t+=3){
    const px=x+ux*t,pz=z+uz*t,py=cy+2;
    if(py-floorAt(px,pz)<2||!clear(px,py,pz,1.5))return null;
  }
  return {x,z,floor,centreY:cy,clearanceVerified:true,clearanceMethod:'triangle-and-approach'};
}

export function buildPortals(field, colliders = [], surfaces = []) {
  const group = new THREE.Group();
  group.name = 'portals';
  const rng = mulberry32(777);
  const entries = [];

  const stoneMat = new THREE.ShaderMaterial({
    uniforms: withShared({}),
    vertexShader: /* glsl */`
      attribute float aAO;
      varying vec3 vWorld;
      varying vec3 vNrm;
      varying float vAO;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNrm = normalize(mat3(modelMatrix) * normal);
        vAO = aAO;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: GLSL_NOISE + GLSL_MEDIUM + GLSL_LIGHT + /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNrm;
      varying float vAO;
      void main(){
        vec3 N = normalize(vNrm);
        // carved mineral stone, veined with light where the portals are
        float n = fbm3(vWorld * 0.35, 3);
        float vein = pow(clamp(1.0 - abs(n * 2.0 - 1.0), 0.0, 1.0), 8.0);
        vec3 albedo = mix(vec3(0.20, 0.235, 0.265), vec3(0.32, 0.35, 0.37), n);
        albedo += vec3(0.10, 0.30, 0.34) * vein * 1.6;
        vec3 col = litSurface(albedo, N, vWorld, 0.55, clamp(vAO, 0.0, 1.0), 0.0);
        col += vec3(0.05, 0.20, 0.22) * vein;
        col = applyWater(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  for (const p of PORTALS) {
    const loc = LOCATIONS.find((l) => l.id === p.from);
    const region = REGIONS.find((r) => r.id === loc.region);
    const spot = (p.id==='azurespan' ? preferredAzureSpot(field,loc,p.yaw,surfaces) : null)
      || clearSpot(field, loc, colliders, p.yaw, surfaces);
    p.x = spot.x; p.z = spot.z;
    const floorY = spot.floor;
    const centreY = spot.centreY;
    const R = p.radius;

    const g = new THREE.Group();
    g.position.set(p.x, centreY, p.z);
    g.rotation.y = Math.PI / 2 - p.yaw;   // ring normal points at the world centre
    g.name = 'portal_' + p.id;

    // ---- stone ring (closed torus, carved, with a plinth) ----------------
    const ring = new THREE.TorusGeometry(R, R * 0.085, 12, 40);
    const ao = new Float32Array(ring.attributes.position.count).fill(0.9);
    ring.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    const ringMesh = new THREE.Mesh(ring, stoneMat);
    ringMesh.name = 'portal_ring';
    g.add(ringMesh);

    // plinth: a low stepped base so the ring is built into the ground
    const plinth = new THREE.CylinderGeometry(R * 1.25, R * 1.55, R * 0.16, 24, 1);
    plinth.translate(0, -R * 1.0 + R * 0.08, 0);
    const pao = new Float32Array(plinth.attributes.position.count).fill(0.85);
    plinth.setAttribute('aAO', new THREE.BufferAttribute(pao, 1));
    g.add(new THREE.Mesh(plinth, stoneMat));

    // ---- membrane -------------------------------------------------------
    const membrane = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.94, 48),
      new THREE.ShaderMaterial({
        uniforms: withShared({
          uColor: { value: new THREE.Color(region.tone) },
          uOpen: { value: 1 },
          uActive: { value: 0 },
        }),
        vertexShader: PORTAL_VS,
        fragmentShader: PORTAL_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    membrane.name = 'portal_membrane';
    membrane.renderOrder = 5;
    g.add(membrane);

    // ---- drifting motes -------------------------------------------------
    const N = 220;
    const mpos = new Float32Array(N * 3);
    const mphase = new Float32Array(N);
    const msize = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2;
      const rr = R * (0.25 + rng() * 0.9);
      mpos[i * 3] = Math.cos(a) * rr;
      mpos[i * 3 + 1] = Math.sin(a) * rr;
      mpos[i * 3 + 2] = (rng() - 0.5) * R * 0.35;
      mphase[i] = rng();
      msize[i] = 0.5 + rng() * 1.6;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(mphase, 1));
    moteGeo.setAttribute('aSize', new THREE.BufferAttribute(msize, 1));
    const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
      uniforms: withShared({
        uColor: { value: new THREE.Color(region.tone) },
        uRadius: { value: R },
      }),
      vertexShader: MOTE_VS,
      fragmentShader: MOTE_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    motes.name = 'portal_motes';
    motes.renderOrder = 6;
    g.add(motes);

    group.add(g);

    entries.push({
      ...p, loc, region, floorY, centreY, group: g, membrane, motes,
      clearanceVerified:spot.clearanceVerified,
      clearanceMethod:spot.clearanceMethod || 'conservative-bounds',
      name: loc.name, tone: region.tone,
    });
  }

  // -------------------------------------------------------------------------
  // interaction: proximity detection + arrival placement
  // -------------------------------------------------------------------------
  const state = { inside: null, cooldown: 0 };

  group.userData.portals = entries;

  /** Returns the portal the swimmer is inside, if any. */
  group.userData.inside = (pos) => {
    let best = null, bestD = 1e9;
    for (const p of entries) {
      const dx = pos.x - p.x, dz = pos.z - p.z, dy = pos.y - p.centreY;
      // inside the ring aperture, allowing for the ring's own thickness
      const lateral = Math.hypot(dx, dz);
      // generous aperture: a player swimming at speed must not have to thread a
      // 13 m ring dead-centre to trigger the gate
      if (Math.abs(dy) < p.radius * 1.5 && lateral < p.radius * 1.55) {
        const d = Math.hypot(dx, dz, dy);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    return best;
  };

  group.userData.update = (dt, time, camPos) => {
    if (state.cooldown > 0) state.cooldown -= dt;
    const inside = group.userData.inside(camPos);
    for (const p of entries) {
      const active = inside === p ? 1 : 0;
      p.membrane.material.uniforms.uActive.value = active;
      p.membrane.material.uniforms.uTime.value = time;
      p.motes.material.uniforms.uTime.value = time;
      // gently pulse the ring of whichever portal you are nearest
      const d = Math.hypot(camPos.x - p.x, camPos.z - p.z);
      p.membrane.material.uniforms.uOpen.value = 0.55 + 0.45 * Math.min(1, 1 - d / 120);
    }
    group.userData.current = inside;
    return inside;
  };

  return group;
}
