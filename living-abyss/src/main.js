// =============================================================================
// THE LIVING ABYSS
// One continuous 1.8 km x 1.8 km ocean world; traversal QA is ongoing.
// Built in production passes, in the order a real environment team would work:
//   seabed -> distant water -> sky/surface -> geology -> reef -> vegetation ->
//   coral -> caverns -> life -> light & chart.
// =============================================================================
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

import { TerrainField, WORLD, START_POSE, REGIONS, LANDMARKS, LOCATIONS, PORTALS } from './world/geography.js?rev=37';
import { SIM_TIER, getSimulationLOD } from './core/simulation-lod.js?rev=37';
import { EcologyRuntime } from './world/ecology-runtime.js?rev=37';
import { SPECIES_REGISTRY, speciesForHabitat } from './world/species-registry.js?rev=37';
import { buildTerrain, buildApron } from './world/terrain.js?rev=37';
import { buildSky, buildOcean } from './world/ocean.js?rev=37';
import { buildGeology } from './world/geology.js?rev=37';
import { buildFlora } from './world/flora.js?rev=37';
import { addReefScans } from './world/reef-scans.js?rev=37';
import { buildCaverns } from './world/caverns.js?rev=37';
import { buildAtmosphere } from './world/atmosphere.js?rev=37';
import { buildPortals } from './world/portals.js?rev=37';
import { planArrival } from './world/arrival-plan.js?rev=37';
import { addShallowShells } from './world/shells.js?rev=37';
import { addJellies } from './world/jellies.js?rev=37';
import { addBenthic } from './world/benthic.js?rev=37';
import { addBarramundi } from './world/barramundi.js?rev=37';
import { addLargeMarine } from './world/large-marine.js?rev=37';
import { addReefShoals } from './world/reef-shoals.js?rev=37';
import { addBlueWhales } from './world/whale.js?rev=37';
import { planWhaleRoutes } from './world/whale-route.js?rev=37';
import { addTurtles } from './world/turtles.js?rev=37';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { SwimController } from './player/controller.js?rev=37';
import { createCollisionDebug } from './player/collision-debug.js?rev=37';
import { Dolphin } from './player/dolphin.js?rev=37';
import { initHUD, updateHUD, toggleBigMap, bigMapOpen, hideHUD, setPerf, showToast, discoveredCount,
  openTravelDial, closeTravelDial, travelDialOpen, showPortalPrompt, hidePortalPrompt } from './ui/hud.js?rev=37';
import { shared } from './shaders/common.js?rev=37';
import { sampleHabitat } from './world/habitat-profiles.js?rev=37';
import { FramePacer } from './core/frame-pacer.js?rev=37';
import { FrameProfiler } from './core/frame-profiler.js?rev=37';
import { retryableAsset } from './core/retryable-asset.js?rev=37';
import { CaveScatteringPass } from './rendering/cave-scattering.js?rev=37';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const state = {
  // Hardware starts on the authored presentation path; confirmed software
  // renderers are downgraded below after capability detection.
  quality: 'high',
  ready: false,
  paused: false,
  mode: 'free',
  time: 0,
  fps: 0,
};

const app = $('app');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.84;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// software renderers (no GPU) get a dramatically lighter profile:
// force 1:1 pixel ratio (integrated/software screens often run at 2x DPI,
// which costs 4x fill rate on the CPU), disable all post-processing passes,
// thin out particles and creatures so each frame is cheap to rasterize.
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
const isSoftware = /swiftshader|llvmpipe|software/i.test(gpuName);
const capabilities = Object.freeze({
  gpuName,
  maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
  hardwareConcurrency: navigator.hardwareConcurrency || 0,
  deviceMemoryGB: navigator.deviceMemory || 0,
  astc: !!gl.getExtension('WEBGL_compressed_texture_astc'),
  etc: !!gl.getExtension('WEBGL_compressed_texture_etc'),
  s3tc: !!gl.getExtension('WEBGL_compressed_texture_s3tc'),
  timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
  software: isSoftware,
});
// Capability detection chooses only an initial rendering cost. Runtime frame
// timing below remains authoritative because browser GPU strings and reported
// memory are not reliable performance measurements.
if (isSoftware || capabilities.maxTextureSize < 8192 ||
    (capabilities.deviceMemoryGB && capabilities.deviceMemoryGB <= 4) ||
    (capabilities.hardwareConcurrency && capabilities.hardwareConcurrency <= 4)) {
  state.quality = 'medium';
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 40000);
// Single LOD manager for every creature system: staggers AI by distance so
// nothing freezes, teleports, or simulates at full cost off-screen.
const simulationLod = getSimulationLOD(camera);

// ---------------------------------------------------------------------------
// Post-processing chain
// ---------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.24 },
    uAberration: { value: 0.00055 },
    uGrain: { value: 0.0035 },
    uTime: { value: 0 },
    uSaturation: { value: 1.06 },
    uLift: { value: 0.004 },
    uDepthUnder: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette, uAberration, uGrain, uTime, uSaturation, uLift, uDepthUnder;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // subtle lens aberration, stronger underwater
      float ab = uAberration * (0.5 + 2.0 * r2) * (1.0 + uDepthUnder * 0.6);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // vignette
      float vig = (1.0 - smoothstep(0.28, 1.05, r2 * 2.0));
      col *= mix(1.0, vig, uVignette);

      // tone curve: water is a low-contrast medium, so the grade has to restore
      // separation between the lit surfaces and the haze behind them
      col = pow(max(col, 0.0), vec3(1.06));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.42);   // gentle S-curve

      // saturation + lift
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col += uLift * vec3(0.55, 0.85, 1.0);

      // film grain, finer underwater
      float g = hash(uv * vec2(1920.0, 1080.0) + uTime * 37.0) - 0.5;
      col += g * uGrain * (0.5 + 0.6 * uDepthUnder) * (0.35 + 0.65 * (1.0 - l));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

renderer.info.autoReset = false;
// The opaque scene depth bounds the local cave volume. Both ping-pong targets
// carry depth attachments because their roles swap across composer frames.
const sceneTarget=new THREE.WebGLRenderTarget(window.innerWidth,window.innerHeight,{
  type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,
});
sceneTarget.depthTexture=new THREE.DepthTexture(window.innerWidth,window.innerHeight,THREE.UnsignedIntType);
const composer = new EffectComposer(renderer,sceneTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const caveScattering = new CaveScatteringPass(camera);
composer.addPass(caveScattering);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.26, 0.9, 1.12);
composer.addPass(bloom);

const grade = new ShaderPass(GradeShader);
composer.addPass(grade);

const output = new OutputPass();
composer.addPass(output);

// ---------------------------------------------------------------------------
// Loading UI helpers
// ---------------------------------------------------------------------------
const passList = [];
function logPass(text) {
  passList.push(text);
  const node = $('pass');
  node.innerHTML = passList.map((t, i) =>
    `<div class="${i === passList.length - 1 ? 'now' : 'done'}">${i === passList.length - 1 ? '▸' : '✓'} ${t}</div>`
  ).slice(-7).join('');
  $('barIn').style.width = `${Math.min(100, (passList.length / 12) * 100)}%`;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// World build
// ---------------------------------------------------------------------------
let field, controller, dolphin, ocean, sky, terrainGroup, geologyGroup, floraGroup, cavernsGroup, atm, portalGroup, apronGroup;
let collisionDebug, barramundi, largeMarine, reefShoals, blueWhales, shallowShells, benthic, reefScans, turtles;
let sharkPredators = [],whaleRoutes=[],whaleLoader=null;
const ecology=new EcologyRuntime();
// Register bounded aggregate populations. Visible entities remain controlled by
// their render systems; this layer preserves births, mortality and resources
// while habitats are distant.
for(const habitat of ['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl']){
  for(const species of speciesForHabitat(habitat))ecology.register(species.id,habitat,
    species.category==='mammal'?2:species.category==='fish'?24:8);
}

// Stream rare, far-away assets before their visibility range. They remain at
// full quality; completed requests are shared between proximity and portals.
async function requestBlueWhales(force=false){
  if(!whaleRoutes.length)return Promise.resolve(true);
  if(!whaleLoader)whaleLoader=retryableAsset(async()=>{
    const w=await addBlueWhales(scene,field,controller.colliders,whaleRoutes);
    if(w){
      blueWhales=w.states;
      for(const s of blueWhales){
        s.phase+=state.time*s.speed;
        // A body-aligned capsule is updated by whale.js every simulation step.
        // It prevents the player/camera from entering the torso while avoiding
        // an expensive animated-triangle collision test.
        const c={type:'cap',x1:s.x,y1:s.y,z1:s.z,x2:s.x,y2:s.y,z2:s.z,r:s.size*.115,source:'blue whale'};
        s.dynamicCollider=c;controller.colliders.push(c);
      }
      for(const s of blueWhales)s.lodStep(0,0,1,camera.position);
      // Hand the whales to the LOD manager once their models are in memory.
      for(const s of blueWhales){
        simulationLod.register({
          id:`blue-whale-${s.habitat||'open'}`,
          getPosition:()=>s.host.position,
          getRadius:()=>60,
          update:(dt,tier,aiCost,cam)=>s.lodStep(dt,tier,aiCost,cam),
        });
      }
    }
    return !!w;
  },{onError:error=>console.warn('Blue whales unavailable:',error)});
  return whaleLoader(force);
}
async function preloadHabitat(id){
  // Medium and High share the complete asset set. Requests are normally already
  // resolved by startup warm-up; this remains an idempotent safety net.
  const tasks=[];
  // Never force-reload cached GLBs during travel. `force=true` bypassed the
  // retryable-asset cache and repeated parse/texture-upload work at every gate.
  if(reefScans)tasks.push(reefScans.ensureHabitat(id,false));
  if(id==='azurespan')tasks.push(requestBlueWhales(false));
  if(!tasks.length)return true;
  // Do not trap a player indefinitely on a failed or very slow connection.
  let timer;
  try{return await Promise.race([
    Promise.all(tasks).then(values=>values.every(Boolean)),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(false),15000);}),
  ]);}finally{clearTimeout(timer);}
}
function prefetchNearby(cameraPosition){
  // Safety net only: normal gameplay has already warmed these assets before the
  // loader is dismissed. Never launch several decodes in the same frame.
  if(whaleRoutes.length&&!blueWhales){
    const nearest=whaleRoutes.reduce((best,r)=>{
      const d=Math.hypot(cameraPosition.x-r.x,cameraPosition.z-r.z);
      return d<best.d?{r,d}:best;
    },{r:null,d:Infinity});
    // `d` is already a linear distance. Comparing it with 700² caused whale
    // decoding almost everywhere and could stall the main thread during travel.
    if(nearest.r&&nearest.d<700)void requestBlueWhales();
  }
}

const speciesFiles={
  palette_surgeonfish:'marine_pass11/blue-tang', bluefin_tuna:'marine_pass11/tuna',
  clownfish:'ecosystem/01_clownfish', lionfish:'ecosystem/03_lionfish',
  anglerfish:'ecosystem/04_anglerfish', swordfish:'ecosystem/13_swordfish',
  seahorse:'ecosystem/20_seahorse', ocean_sunfish:'ecosystem/21_ocean_sunfish',
  flounder:'ecosystem/22_flounder', mandarinfish:'ecosystem/23_mandarinfish',
};
async function loadSchoolAssets(){
  const loader=new GLTFLoader(),speciesAssets={};let schoolAsset=null;
  const normalizeFishGeometry=(geometry)=>{
    geometry.computeBoundingBox();const b=geometry.boundingBox,size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
    const length=Math.max(size.x,size.z);if(!Number.isFinite(length)||length<1e-5)throw new Error('Invalid fish bounds');
    geometry.translate(-center.x,-center.y,-center.z);geometry.scale(2/length,2/length,2/length);
    geometry.computeBoundingSphere();return geometry;
  };
  const school=loader.loadAsync('./assets/models/barramundi_school/school.glb?rev=37').then(model=>{
    const parts=[];model.scene.updateMatrixWorld(true);model.scene.traverse(o=>{if(o.isMesh&&o.material.map){
      const geometry=normalizeFishGeometry(o.geometry.clone().applyMatrix4(o.matrixWorld));
      parts.push({geometry,map:o.material.map});
    }});
    if(parts.length!==1)throw new Error('Expected one textured school fish mesh');
    schoolAsset=parts;
  }).catch(error=>console.warn('Textured school asset unavailable:',error));
  const species=Object.entries(speciesFiles).map(async ([id,file])=>{
    try{
      const asset=await loader.loadAsync(`./assets/models/${file}.glb`),parts=[];asset.scene.updateMatrixWorld(true);
      asset.scene.traverse(o=>{
        if(o.isMesh&&o.material?.map){
          const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
          if(id!=='flounder')geometry.rotateY(Math.PI/2);
          normalizeFishGeometry(geometry);
          if(!geometry.attributes.normal)geometry.computeVertexNormals();
          parts.push({geometry,map:o.material.map});
        }
      });
      if(parts.length!==1)throw new Error('Expected one textured fish mesh');
      speciesAssets[id]=parts;
    }catch(error){console.warn('Detailed species asset unavailable: '+id,error);}
  });
  await Promise.all([school,...species]);
  return {schoolAsset,speciesAssets,ready:!!schoolAsset&&Object.keys(speciesAssets).length===Object.keys(speciesFiles).length};
}

async function buildWorld() {
  const t0 = performance.now();

  logPass('Baking master bathymetry — 1.8 × 1.8 km continuous seabed');
  await nextFrame(); await nextFrame();
  field = new TerrainField().build();
  window.ABYSS.field = field;
  // Begin independent starting-habitat downloads while geometry is built.
  const shellTask=addShallowShells(scene,field).catch(error=>{console.warn('Shell detail unavailable:',error);return null;});
  const fishTask=loadSchoolAssets();

  logPass('Forming terraced shelves, archways and abyssal trenches');
  await nextFrame();
  terrainGroup = buildTerrain(field);
  scene.add(terrainGroup);
  const apron = buildApron(field);
  scene.add(apron);
  apronGroup = apron;
  await nextFrame();

  logPass('Raising the sky dome and the sea surface');
  sky = buildSky();
  scene.add(sky);
  ocean = buildOcean();
  scene.add(ocean);
  await nextFrame();

  logPass('Sculpting monumental geology — sealed towers, shelves, arches, walls');
  geologyGroup = buildGeology(field, controller = new SwimController(field));
  scene.add(geologyGroup);
  await nextFrame();

  logPass('Seeding reef boulders, sediment and seabed debris');
  await nextFrame();

  logPass('Populating the coral gardens');
  // Optional, locally hosted CC0 photogrammetric shell detail. Failure does
  // not block the preserved world from loading.
  shallowShells = await shellTask;
  await nextFrame();

  logPass('Carving the Veiled Caverns and their connecting passages');
  cavernsGroup = buildCaverns(field, controller);
  scene.add(cavernsGroup);
  await nextFrame();

  logPass('Raising the seven teleporter gates');
  portalGroup = buildPortals(field, controller ? controller.colliders : [], controller ? controller.surfaceSolids : []);
  scene.add(portalGroup);
  // Do not remove collision volumes around gates: gate sites are chosen against
  // rendered rock bounds, and solids must remain solid everywhere.
  await nextFrame();

  logPass('Growing habitat gardens, seagrass and kelp along the seven approaches');
  // Start full scan downloads before the CPU-heavy procedural garden build.
  const reefTask=addReefScans(scene,field,portalGroup.userData.portals,controller.colliders)
    .catch(error=>{console.warn('Coral scan colonies unavailable:',error);return null;});
  floraGroup = buildFlora(field, state, controller.colliders, portalGroup.userData.portals);
  scene.add(floraGroup);
  reefScans=await reefTask;
  await nextFrame();

  logPass('Releasing marine life and suspended particles');
  const {schoolAsset,speciesAssets,ready:fishAssetsReady}=await fishTask;
  const buildStatus = $('buildStatus');
  buildStatus.textContent = fishAssetsReady
    ? 'LIVING WORLD · INTEGRATION IN PROGRESS'
    : 'MARINE ASSET MISSING · FALLBACK ACTIVE';
  buildStatus.classList.toggle('failed', !fishAssetsReady);
  // Wrapped in try/catch: a NaN in school placement must not kill the whole
  // world build. On failure, fall back to an empty atmosphere so the game
  // still loads and the player can swim.
  try {
    atm = buildAtmosphere(field, state, controller.colliders, schoolAsset, portalGroup.userData.portals, speciesAssets);
    scene.add(atm.group);
    addJellies(scene, field, controller.colliders);
  } catch (error) {
    console.warn('Atmosphere unavailable:', error);
    const emptyGroup = new THREE.Group();
    emptyGroup.name = 'atmosphere';
    scene.add(emptyGroup);
    atm = { group: emptyGroup, populationPlan: [], populationReports: {}, setQuality(){}, update(){}, schoolAccumulator: 0 };
  }
  const schoolHints=atm.group.children.filter(o=>o.userData.simulation).map(o=>({habitat:o.userData.habitat,
    center:o.userData.simulation.center,consumePrey:o.userData.consumePrey}));
  // These independent full-quality assets used to wait for one another over
  // the network. Fetch/decode them concurrently, but keep them boot-critical
  // because they can be visible in the starting habitat.
  const optional=(label,promise,assign)=>promise.then(assign).catch(error=>console.warn(label,error));
  await Promise.all([
    optional('Benthic habitats unavailable:',addBenthic(scene,field,controller.colliders,atm.populationPlan),x=>{benthic=x;}),
    optional('Barramundi detail unavailable:',addBarramundi(scene,field,controller.colliders),x=>{barramundi=x;}),
    optional('Large marine visitors unavailable:',addLargeMarine(scene,field,controller.colliders,schoolHints,state.quality),x=>{
      largeMarine=x;sharkPredators=x.animals.filter(a=>a.kind==='shark').map(a=>a.host.position);
    }),
    optional('Reef shoals unavailable:',addReefShoals(scene,field,controller.colliders,portalGroup.userData.portals),x=>{reefShoals=x;}),
    optional('Sea turtles unavailable:',addTurtles(scene,field,portalGroup.userData.portals,controller.colliders,state.quality),x=>{turtles=x;}),
  ]);
  // ---- Register every creature system with the simulation LOD manager ----
  // Updates are then distance-staggered: full cost near the player, minimal
  // cost far away, and no freezing or teleporting at tier boundaries.
  function registerCreature(system) {
    if (!system || !system.lodEntities) return;
    for (const desc of system.lodEntities) simulationLod.register(desc);
  }
  registerCreature(largeMarine);
  registerCreature(reefShoals);
  registerCreature(turtles);
  registerCreature(barramundi);
  if (benthic) {
    const centers = benthic.reefLocs || [];
    simulationLod.register({
      id: 'benthic',
      getPosition: () => {
        let best = null, bd = Infinity;
        for (const c of centers) {
          const d = camera.position.distanceTo(c);
          if (d < bd) { bd = d; best = c; }
        }
        return best || new THREE.Vector3();
      },
      getRadius: () => 50,
      update: (dt, tier, aiCost, cam) => {
        if (tier !== SIM_TIER.OFF) benthic.update(dt, cam);
      },
    });
  }
  // Schools are stepped directly by atmosphere.update(); no LOD registration
  // needed here. The LOD manager handles large marine, turtles, and other
  // creature systems where distance-based staggering is more effective.
  if (atm) {
    // Mark schools as NOT LOD-managed so atmosphere.update() steps them directly.
    atm.group.children.filter(o => o.userData.simulation).forEach(school => {
      school.userData.__lodManaged = false;
    });
  }

  // Plan now but defer the open-water whales' models/textures until nearby.
  whaleRoutes=planWhaleRoutes(field,controller.colliders);
  await nextFrame();

  logPass('Charting the seven places — bathymetry, depths, portals');
  initHUD(field);
  await nextFrame();

  controller.setPose(START_POSE.x, START_POSE.y, START_POSE.z, START_POSE.yaw, START_POSE.pitch);

  dolphin = new Dolphin(scene, field, controller);

  // Decode and upload destination-only assets while the startup loader is still
  // visible. Sequential requests avoid simultaneous GLB parse/decode spikes;
  // portal entry then performs no first-use model work.
  logPass('Warming destination assets — coral scans and pelagic visitors');
  if(reefScans){
    await reefScans.ensureHabitat('roseglass'); await nextFrame();
    await reefScans.ensureHabitat('abyssalbowl'); await nextFrame();
  }
  await requestBlueWhales(); await nextFrame();
  if(reefScans){reefScans.prepareGpu(renderer,scene,camera);await nextFrame();}

  // WebGLRenderer.compile() creates programs but does not guarantee geometry
  // buffers are uploaded. Render one tiny hidden frame from every destination
  // while the loader is visible, forcing terrain chunks, instance matrices,
  // scan geometry, and textures resident before any portal can expose them.
  logPass('Uploading all seven destinations to the GPU');
  const savedSize=renderer.getSize(new THREE.Vector2()),savedRatio=renderer.getPixelRatio();
  const warmCamera=new THREE.PerspectiveCamera(camera.fov,1,camera.near,camera.far);
  renderer.setPixelRatio(1);renderer.setSize(64,64,false);
  for(const l of LOCATIONS){
    const y=field.surfaceHeightAt(l.x,l.z)+Math.max(5,Math.min(18,-field.surfaceHeightAt(l.x,l.z)*.08));
    warmCamera.position.set(l.x,y,l.z+28);warmCamera.lookAt(l.x,y,l.z);warmCamera.updateMatrixWorld(true);
    renderer.render(scene,warmCamera);await nextFrame();
  }
  renderer.setPixelRatio(savedRatio);renderer.setSize(savedSize.x,savedSize.y,false);
  await nextFrame();
  logPass(`World loaded — ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  // final warm-up compile so the first swim never stutters.
  // Skip on low quality (software rendering) — compiling every material on
  // a CPU renderer can take minutes and block the world from ever appearing.
  if (state.quality !== 'low') {
    try { renderer.compile(scene, camera); } catch (_) {}
  }
  state.ready = true;
  window.__READY = true;
  await sleep(260);
  $('loader').classList.add('hidden');
  $('hud').classList.add('on');
  $('startNote').classList.remove('hidden');
  setTimeout(() => showToast('The Living Abyss', 'Swim north into the deep'), 1400);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const canvas = renderer.domElement;
let dragging = false;

canvas.addEventListener('mousedown', (e) => {
  if (bigMapOpen() || travelDialOpen()) return;
  dragging = true;
  if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
    canvas.requestPointerLock();
  }
});
window.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) $('startNote').classList.add('hidden');
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas && !dragging) return;
  const s = 0.0022;
  controller.yaw -= e.movementX * s;
  controller.pitch -= e.movementY * s;
  controller.pitch = Math.max(-1.45, Math.min(1.45, controller.pitch));
  if (document.pointerLockElement !== canvas && dragging) {
    // fallback gently rotates at half rate for trackpads
  }
});

// touch look
let lastTouch = null;
canvas.addEventListener('touchstart', (e) => { lastTouch = e.touches[0]; }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (lastTouch) {
    controller.yaw -= (t.clientX - lastTouch.clientX) * 0.005;
    controller.pitch -= (t.clientY - lastTouch.clientY) * 0.005;
    controller.pitch = Math.max(-1.45, Math.min(1.45, controller.pitch));
  }
  lastTouch = t;
}, { passive: true });

window.addEventListener('keydown', (e) => {
  // The dial is an interactive UI, not a movement surface. In particular,
  // Escape must close it as promised and movement must not continue behind it.
  if (travelDialOpen()) {
    if (e.code === 'Escape') { closeTravelDial(); travel.busy = false; }
    e.preventDefault();
    return;
  }
  if (bigMapOpen() && ['SELECT', 'BUTTON'].includes(document.activeElement?.tagName) && e.code !== 'Escape' && e.code !== 'KeyM') return;
  // E also controls upward swimming. Only consume it when interacting with
  // an existing gate; otherwise pass it through to the swim controller.
  if (e.code === 'KeyE' && !bigMapOpen() && (travel.inside || travel.busy)) {
    if (!e.repeat) tryTravel();
    e.preventDefault();
    return;
  }
  if (e.code === 'Backquote' && state.ready) {
    if (!collisionDebug) collisionDebug = createCollisionDebug(scene, controller, portalGroup.userData.portals);
    collisionDebug.toggle(); e.preventDefault(); return;
  }
  if (e.code === 'KeyM') { if (!e.repeat) { controller.keys.clear(); toggleBigMap(); } return; }
  if (e.code === 'KeyH') { hideHUD(); return; }
  if (e.code === 'KeyF') { toggleMode(); return; }
  if (e.code === 'KeyP') { state.paused = !state.paused; return; }
  if (e.code === 'KeyR') { cycleQuality(); return; }
  if (e.code === 'Escape') { toggleBigMap(false); }
  controller.addKey(e.code, true);
  if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => controller.addKey(e.code, false));
// A keyup can be lost when the preview iframe loses focus.
window.addEventListener('blur', () => { if (controller) controller.keys.clear(); });

function toggleMode() {
  state.mode = state.mode === 'free' ? 'dolphin' : 'free';
  controller.mode = state.mode;
  dolphin.setActive(state.mode === 'dolphin');
  showToast(state.mode === 'dolphin' ? 'Dolphin' : 'Free swim',
            state.mode === 'dolphin' ? 'Third-person exploration' : 'First-person exploration');
}

// ---------------------------------------------------------------------------
// Portal travel
// ---------------------------------------------------------------------------
const travel = { inside: null, cooldown: 0, busy: false, loading: false };
const transitionDiagnostics=[];
let activeTransition=null;
if(typeof PerformanceObserver!=='undefined')try{
  const observer=new PerformanceObserver(list=>{
    if(!activeTransition)return;
    for(const e of list.getEntries())activeTransition.longTasks.push({start:e.startTime,duration:e.duration});
  });
  observer.observe({type:'longtask',buffered:true});
}catch(_){}

async function arriveAtPortal(id, options={}) {
  const p = portalGroup && portalGroup.userData.portals.find((q) => q.id === id);
  const loc = LOCATIONS.find((q) => q.id === id);
  if (!p || !loc) return false;
  // Cinematic travel starts preload earlier and passes its result here.
  const ready=options.skipPreload ? (options.ready ?? true) : await preloadHabitat(id);
  const pose=planArrival(p,field);
  // Guard against NaN/invalid pose from terrain queries — never teleport to
  // an invalid coordinate, which would freeze the renderer.
  if(!isFinite(pose.x)||!isFinite(pose.y)||!isFinite(pose.z)){
    console.warn('Invalid arrival pose for',id,'using portal fallback');
    pose.x=p.x;pose.y=p.centreY;pose.z=p.z;
  }
  controller.setPose(pose.x,pose.y,pose.z,pose.yaw,pose.pitch);
  controller.update(0.016, camera);
  travel.cooldown = 1.6;
  showToast(loc.name, ready ? 'Arrived through the portal' : 'Some habitat detail could not load yet');
  return ready;
}

const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function cinematicPortalTravel(id){
  const diag={id,start:performance.now(),arriveStart:performance.now(),arriveEnd:0,end:0,longTasks:[],
    before:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}};
  activeTransition=diag;transitionDiagnostics.push(diag);
  if(transitionDiagnostics.length>20)transitionDiagnostics.shift();
  // No transition overlay, timeout, preload, forced layout, or frame wait. The
  // player is moved synchronously into the already-resident continuous world.
  const ready=await arriveAtPortal(id,{skipPreload:true,ready:true});
  diag.arriveEnd=performance.now();diag.arriveMs=diag.arriveEnd-diag.arriveStart;
  // Keep diagnostics active across the first two rendered seconds after the
  // jump—the earlier probe ended before the actual freeze frame occurred.
  setTimeout(()=>{
    diag.end=performance.now();diag.totalMs=diag.end-diag.start;
    diag.after={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
    diag.adaptive={emaMs:adaptiveTiming.ema,scale:adaptiveScale,pixelRatio:renderer.getPixelRatio()};
    diag.maxLongTaskMs=diag.longTasks.reduce((m,e)=>Math.max(m,e.duration),0);
    activeTransition=null;
    // Same-origin diagnostic beacon appears in the development-server log, so
    // transition evidence can be inspected without asking for DevTools output.
    const q=new URLSearchParams({id:diag.id,total:diag.totalMs.toFixed(1),arrive:diag.arriveMs.toFixed(1),
      long:diag.maxLongTaskMs.toFixed(1),calls:String(diag.after.calls),tris:String(diag.after.triangles),
      ema:diag.adaptive.emaMs.toFixed(1),scale:diag.adaptive.scale.toFixed(2)});
    fetch('/__transition_probe?'+q,{cache:'no-store'}).catch(()=>{});
  },2000);
  return ready;
}

function tryTravel() {
  if (!travel.inside || travel.busy) return;
  travel.busy = true;
  // Pointer lock hides the cursor and prevents choosing a destination.
  // Release it explicitly; clicking the canvas afterwards re-enters swim look.
  dragging = false;
  controller.keys.clear();
  controller.vel.set(0, 0, 0);
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  openTravelDial(travel.inside.id, async (id) => {
    travel.loading=true;
    hidePortalPrompt();closeTravelDial();
    try { await cinematicPortalTravel(id); }
    finally { travel.loading=false;travel.busy=false; }
  });
  const iv = setInterval(() => {
    if (!travelDialOpen()) { if(!travel.loading)travel.busy=false; clearInterval(iv); }
  }, 250);
}

function cycleQuality() {
  const order = ['medium', 'high'];
  const i = order.indexOf(state.quality);
  applyQuality(order[(Math.max(0,i) + 1) % order.length]);
  showToast('Quality', state.quality.toUpperCase() + ' · COMPLETE WORLD · 60 FPS TARGET');
}

let adaptiveScale=1;
const adaptiveTiming={samples:new Float32Array(240),cursor:0,count:0,lastChange:0,ema:16.67};
function basePixelRatio(q){
  return isSoftware ? (q==='medium'?.78:.86)
    : (q==='medium'?1.05:Math.min(devicePixelRatio,1.25));
}
function applyAdaptiveResolution(){
  const ratio=Math.max(.62,basePixelRatio(state.quality)*adaptiveScale);
  if(Math.abs(renderer.getPixelRatio()-ratio)<.015)return;
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  composer.setSize(window.innerWidth,window.innerHeight);
}
function updateAdaptiveRenderer(dt,now){
  if(travel.loading||!state.ready||document.hidden||dt>.25)return;
  const ms=dt*1000,a=adaptiveTiming;a.ema+=.035*(ms-a.ema);
  a.samples[a.cursor++%a.samples.length]=ms;a.count=Math.min(a.count+1,a.samples.length);
  if(a.count<a.samples.length||now-a.lastChange<10000)return;
  const sorted=Array.from(a.samples).sort((x,y)=>x-y),p95=sorted[Math.floor(sorted.length*.95)];
  // Resolution is the only automatic emergency control: world content, hero
  // scans, geology, creatures, materials, and simulations remain intact.
  if((a.ema>18.2||p95>24)&&adaptiveScale>.70){
    adaptiveScale=Math.max(.70,adaptiveScale-.08);a.lastChange=now;applyAdaptiveResolution();
  }else if(a.ema<14.2&&p95<17&&adaptiveScale<1){
    adaptiveScale=Math.min(1,adaptiveScale+.04);a.lastChange=now;applyAdaptiveResolution();
  }
}

function applyQuality(q) {
  q = q === 'high' ? 'high' : 'medium';
  state.quality = q;
  adaptiveScale=1;
  adaptiveTiming.count=0;
  adaptiveTiming.cursor=0;
  adaptiveTiming.ema=16.67;
  shared.uQualityTier.value = 1;
  bloom.enabled = !isSoftware;
  bloom.strength = q === 'high' ? 0.26 : 0.20;
  // Pixel workload scales quadratically. Former oversized internal targets
  // could freeze at destination transitions. Preserve effects and detail,
  // but cap internal resolution to sustainable values.
  applyAdaptiveResolution();
  // On software WebGL, High keeps its lighting/post/material features but uses
  // medium world density and staggered geology. This avoids memory exhaustion
  // while still looking materially better than Low.
  const worldTier=isSoftware?'medium':q;
  if (atm) atm.setQuality(worldTier);
  if (floraGroup) floraGroup.userData.setQuality(worldTier);
  if (geologyGroup) geologyGroup.userData.setQuality?.(worldTier);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const framePacer = new FramePacer();
const frameProfiler = new FrameProfiler();
const runtimeFaults=[];
function guardedFrameStep(name,fn){
  try{return fn();}catch(error){
    const fault={name,time:performance.now(),message:String(error?.message||error),stack:String(error?.stack||'').slice(0,1200)};
    runtimeFaults.push(fault);if(runtimeFaults.length>30)runtimeFaults.shift();
    console.error('Frame subsystem failed:',name,error);
    const q=new URLSearchParams({name,message:fault.message,transition:activeTransition?.id||'none'});
    fetch('/__runtime_fault?'+q,{cache:'no-store'}).catch(()=>{});
    return undefined;
  }
}
window.addEventListener('error',e=>guardedFrameStep('window.error',()=>{throw e.error||new Error(e.message);}));
window.addEventListener('unhandledrejection',e=>guardedFrameStep('unhandledrejection',()=>{throw e.reason||new Error('Unhandled rejection');}));
let fpsAccum = 0, fpsFrames = 0, camDepth = 0;

function tick(timestamp = performance.now()) {
  requestAnimationFrame(tick);
  if (!state.ready || !framePacer.shouldRender(timestamp, state.quality)) return;
  frameProfiler.beginFrame(performance.now());
  const realDt = clock.getDelta();
  // Do not make swimming almost stop when rendering drops below 20 FPS.
  // Cap long stalls and substep controller motion below to preserve collisions.
  const dt = Math.min(realDt, 0.25);
  if (!state.ready) return;
  updateAdaptiveRenderer(realDt,timestamp);
  // Render-loop safety net: if camera or player position ever becomes NaN
  // (e.g. after a teleport to uninitialized terrain), reset to a safe pose
  // instead of letting the renderer draw NaN and freeze.
  if (!isFinite(camera.position.x) || !isFinite(camera.position.y) || !isFinite(camera.position.z)) {
    camera.position.set(0, -6, 720);
    camera.lookAt(0, -6, 721);
  }
  if (controller && controller.pos && (!isFinite(controller.pos.x) || !isFinite(controller.pos.y) || !isFinite(controller.pos.z))) {
    controller.pos.set(0, -6, 720);
    controller.vel.set(0, 0, 0);
    controller.lastSafe.copy(controller.pos);
  }
  // sample last frame's cost before we start this one
  fpsAccum += realDt; fpsFrames++;
  renderer.info.reset();

  if (!state.paused) state.time += dt;

  // shared medium uniforms
  shared.uTime.value = state.time;
  shared.uCamPos.value.copy(camera.position);
  grade.uniforms.uTime.value = state.time;

  frameProfiler.begin('controller');
  if (!travelDialOpen() && !travel.loading && !state.paused) {
    let remaining = dt;
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 0.05);
      controller.update(step, camera);
      remaining -= step;
    }
  }
  frameProfiler.end('controller');

  const y = controller.pos.y;
  camDepth = Math.max(0, -y);
  const underwater = y < 0.4;
  // A single spatially blended water profile drives every medium shader,
  // including the sky dome, to avoid discontinuities at biome transitions.
  const habitatWater = sampleHabitat(controller.pos.x, controller.pos.z);
  shared.uWaterTint.value.set(...habitatWater.tint);
  shared.uFogScale.value = (state.fogOverride ?? 1) * habitatWater.density * (underwater ? 1.0 : 0.34);
  shared.uCausticStrength.value = underwater ? 0.48 : 0.0;
  shared.uShaftStrength.value = underwater ? (camDepth < 320 ? 1.0 : 0.55) : 0.25;
  grade.uniforms.uDepthUnder.value = THREE.MathUtils.clamp(camDepth / 120, 0, 1);
  grade.uniforms.uAberration.value = underwater ? 0.00045 + Math.min(0.0007, camDepth * 1.5e-6) : 0.00025;
  // Preserve highlights while restoring the darker blue hierarchy seen in real
  // underwater photography. The former shallow exposure flattened reef, sand
  // and distant water into one cyan value.
  renderer.toneMappingExposure = underwater ? 0.76 + Math.min(0.22, camDepth / 3200) : 0.70;

  // keep the sky and the surface centred on the camera so neither ever clips
  if (sky) {
    sky.position.copy(camera.position);
    const m = sky.material.uniforms;
    m.uUnderwater.value = underwater ? 1 : 0;
    // the colour of water at infinity, matching the medium's own falloff
    const d = Math.min(camDepth, 1200);
    const k = 1.0;
    m.uWaterFar.value.set(
      0.095 * Math.exp(-d * 0.0075) * 0.55,
      0.395 * Math.exp(-d * 0.0055) * 0.55,
      0.470 * Math.exp(-d * 0.0042) * 0.60,
    );
  }
  if (ocean) ocean.position.set(camera.position.x, 0, camera.position.z);
  if (ocean && ocean.userData.material) {
    // Gentle, constant surface drift: gives the surface a direction of flow
    // independent of the swell oscillation.
    ocean.userData.material.uniforms.uCurrent.value.set(0.08, 0.04);
  }

  // portals: proximity prompt + travel
  if (portalGroup) {
    if (travel.cooldown > 0) travel.cooldown -= dt;
    const inside = portalGroup.userData.update(dt, state.time, controller.pos);
    travel.inside = inside;
    if (inside && travel.cooldown <= 0 && !travelDialOpen() && !travel.loading) {
      showPortalPrompt(inside.loc.name);
      if (!state._autoPrompted) { state._autoPrompted = true; }
    } else {
      hidePortalPrompt();
    }
  }

  if (collisionDebug) guardedFrameStep('collisionDebug',()=>collisionDebug.update());
  if (dolphin) guardedFrameStep('dolphin',()=>dolphin.update(dt, camera, state.mode === 'dolphin'));
  // Distance-staggered creature simulation: full AI near the player, minimal
  // AI far away, and interpolated, never-frozen movement at every tier.
  frameProfiler.begin('lod');
  guardedFrameStep('simulationLod',()=>{
    simulationLod.beginFrame();
    // Every visible creature receives a lightweight pose step each frame.
    // The former 10/14 hard cap rotated animals through frozen frames and made
    // swimming visibly stop and restart. Tier AI multipliers still bound costly
    // decision work without interrupting body motion.
    simulationLod.update(state.paused ? 0 : dt, camera.position, Infinity);
  });
  frameProfiler.end('lod');
  if (reefScans) guardedFrameStep('reefScans',()=>reefScans.update(camera.position, state.quality));
  guardedFrameStep('prefetch',()=>prefetchNearby(camera.position));
  frameProfiler.begin('atmosphere');
  if (atm) guardedFrameStep('atmosphere',()=>atm.update(state.paused ? 0 : dt, camera, state.time, sharkPredators));
  guardedFrameStep('ecology',()=>ecology.update(state.paused?0:dt));
  frameProfiler.end('atmosphere');
  frameProfiler.begin('flora');
  if (floraGroup) guardedFrameStep('flora',()=>floraGroup.userData.update(dt, state.time, camera));
  if (shallowShells) guardedFrameStep('shells',()=>shallowShells.userData.update(camera, state.quality));
  frameProfiler.end('flora');
  frameProfiler.begin('geology');
  if (geologyGroup) guardedFrameStep('geology',()=>geologyGroup.userData.update?.(dt, state.time, camera));
  frameProfiler.end('geology');

  frameProfiler.begin('hud');
  guardedFrameStep('hud',()=>updateHUD({ pos: controller.pos, yaw: controller.yaw, depth: camDepth, mode: state.mode }, dt));
  frameProfiler.end('hud');

  // The half-resolution ray-marched volume is local to the real skylight and
  // opt-in with medium/high quality; low retains its inexpensive shaft mesh.
  const caveOffset=Math.hypot(camera.position.x-shared.uCaveOpening.value.x,
    camera.position.z-shared.uCaveOpening.value.z);
  // Disabled until the volume has proper temporal filtering and wall shadowing.
  // The eight-sample half-resolution pass produced pixel bursts and leaked
  // through the Nave walls, which is worse than omitting the optional effect.
  caveScattering.enabled=false;
  // Render first: renderer.info was reset at frame start and is empty until now.
  // On software-rendered (no-GPU) devices, bypass the multi-pass EffectComposer
  // (bloom + grade + output) and render directly — each composer pass is a full
  // screen quad pass that dominates CPU time under SwiftShader.
  frameProfiler.begin('render');
  guardedFrameStep('render',()=>{
    if (isSoftware) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  });
  frameProfiler.end('render');
  frameProfiler.endFrame(renderer);

  // Use unclamped wall time for the actual FPS rather than simulation delta.
  if (fpsAccum > 0.5) {
    state.fps = fpsFrames / fpsAccum;
    const info = renderer.info;
    setPerf(`${state.fps.toFixed(0)} FPS · ${info.render.calls} draws<br>` +
            `${(info.render.triangles / 1e6).toFixed(2)}M tris · ${state.quality}`);
    fpsAccum = 0; fpsFrames = 0;
  }

}

// ---------------------------------------------------------------------------
// Debug / QC hooks
// ---------------------------------------------------------------------------
window.ABYSS = {
  state, scene, camera, renderer, composer, capabilities,
  transitionReport(){return transitionDiagnostics.map(x=>({...x,longTasks:x.longTasks.slice()}));},
  runtimeFaults(){return runtimeFaults.slice();},
  adaptiveGraphics(){
    const a=adaptiveTiming,values=Array.from(a.samples.slice(0,a.count)).sort((x,y)=>x-y);
    return {preset:state.quality,scale:adaptiveScale,pixelRatio:renderer.getPixelRatio(),
      emaMs:a.ema,p95Ms:values.length?values[Math.floor(values.length*.95)]:null,
      completeWorld:true,capabilities};
  },
  debugCollision(on) {
    if (!controller || !portalGroup) return false;
    if (!collisionDebug) collisionDebug = createCollisionDebug(scene, controller, portalGroup.userData.portals);
    return on === undefined ? collisionDebug.toggle() : collisionDebug.setVisible(on);
  },
  // Developer-only bounded contact trace, disabled by default. Read after
  // reproducing an obstruction without altering the swimmer's collisions.
  traceCollisions(on = true, clear = true) {
    if (!controller) return false;
    if (clear) controller.collisionTrace.length = 0;
    controller.traceCollisions = !!on;
    return controller.traceCollisions;
  },
  collisionTrace() {
    if (!controller) return null;
    return { enabled: controller.traceCollisions, position: controller.pos.toArray(),
      yaw: controller.yaw, pitch: controller.pitch, radius: controller.radius,
      contacts: controller.collisionTrace.slice() };
  },
  collisionInfo() {
    return controller ? { colliders: controller.colliders, roofs: controller.roofs.map(r => r.name), radius: controller.radius } : null;
  },
  teleport(x, y, z, yaw, pitch) {
    controller.setPose(x, y, z, yaw, pitch);
    controller.update(0.016, camera);
  },
  lookAt(x, y, z) {
    const dx = x - controller.pos.x, dy = y - controller.pos.y, dz = z - controller.pos.z;
    controller.yaw = Math.atan2(-dx, -dz);
    controller.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    controller.update(0.016, camera);
  },
  setMode(m) { state.mode = m; controller.mode = m; dolphin.setActive(m === 'dolphin'); },
  quality(q) { applyQuality(q); },
  get gpu() { return gpuName; },

  pixel(x, y) {
    const gl2 = renderer.getContext();
    const px = new Uint8Array(4);
    gl2.readPixels(x, renderer.domElement.height - y, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
    return Array.from(px);
  },
  frame() { return { fps: state.fps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, caveScattering:caveScattering.enabled }; },
  performanceReport() { return frameProfiler.report(); },
  benchmark(seconds=10) { return frameProfiler.capture(seconds); },
  resetPerformance() { frameProfiler.reset(); return true; },
  async benchmarkTour(secondsPerPlace=3) {
    const results=[];
    for(const l of LOCATIONS){
      this.place(l.id);await wait(500);
      results.push({place:l.id,report:await frameProfiler.capture(secondsPerPlace)});
    }
    return {quality:state.quality,gpu:gpuName,results};
  },
  // Approximate currently submitted 3D triangles by owning system; post passes
  // and fragment/GPU time are not measured by this diagnostic.
  renderInventory() {
    const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(matrix),bySystem={},largest=[];
    scene.traverseVisible(o=>{
      if(!o.isMesh || !o.geometry || (o.frustumCulled && !frustum.intersectsObject(o)))return;
      const g=o.geometry,index=g.index,base=(index?index.count:g.attributes.position.count)/3;
      const triangles=Math.floor(base*(o.isInstancedMesh?o.count:1));
      let parent=o;while(parent.parent && parent.parent!==scene)parent=parent.parent;
      const system=parent.name||parent.type;
      bySystem[system]=(bySystem[system]||0)+triangles;
      if(triangles>50000)largest.push({name:o.name,system,triangles});
    });
    largest.sort((a,b)=>b.triangles-a.triangles);
    return {bySystem,largest:largest.slice(0,15),memory:renderer.info.memory};
  },
  ecosystem() {
    if(!atm)return null;
    const schools=atm.group.children.filter(o=>o.userData.simulation);
    return {reports:atm.populationReports,benthic:benthic?.counts||null,scannedCorals:reefScans?{counts:reefScans.counts,planned:reefScans.plannedCounts,loaded:reefScans.loaded}:null,groups:schools.length,
      fish:schools.reduce((n,o)=>n+o.count,0),
      detail:schools.map(o=>({habitat:o.userData.habitat,role:o.userData.role,species:o.userData.species||null,
        count:o.count,visible:o.visible,behavior:o.userData.simulation.activityState,
        centre:o.userData.simulation.center.toArray()}))};
  },
  geology() { return geologyGroup ? geologyGroup.userData : null; },
  turtles() { return turtles ? turtles.animals.map(a=>({habitat:a.habitat,position:a.host.position.toArray(),centre:[a.x,a.y,a.z],radius:a.radius,time:a.mixer.time,visible:a.host.visible,avoidance:a.offset.toArray()})) : []; },
  turtleTime(habitat,seconds) { const a=turtles?.animals.find(x=>x.habitat===habitat);if(!a)return false;a.mixer.setTime(seconds);return true; },
  whales() { return blueWhales ? blueWhales.map(s=>({position:s.host.position.toArray(),centre:[s.x,s.y,s.z],radius:s.radius,time:s.mixer.time,visible:s.host.visible,place:s.place,behavior:s.behavior,personality:s.personality})) : []; },
  speciesRegistry() { return SPECIES_REGISTRY; },
  ecologyState() { return ecology.snapshot(); },
  reefShoals() { return reefShoals ? reefShoals.shoals.map(a=>({place:a.place,position:a.host.position.toArray(),centre:[a.x,a.y,a.z],time:a.mixer.time,visible:a.host.visible})) : []; },
  largeMarine() { return largeMarine ? largeMarine.animals.map(a => ({ kind:a.kind, place:a.place, position:a.host.position.toArray(), centre:[a.x,a.y,a.z], radius:a.radius, time:a.mixer.time, visible:a.host.visible })) : []; },
  barramundi() { return barramundi ? barramundi.fish.map(f => ({position:f.model.position.toArray(), centre:[f.x,f.y,f.z], radius:f.radius, time:f.mixer.time})) : []; },
  pick(nx, ny) {
    // nx, ny in -1..1 clip space; returns the name of the frontmost object
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
    rc.far = 40000;
    const hits = rc.intersectObjects(scene.children, true);
    return hits.slice(0, 4).map(h => ({
      name: h.object.name || h.object.type,
      parent: h.object.parent ? h.object.parent.name : '',
      dist: Math.round(h.distance),
      y: +h.point.y.toFixed(1),
    }));
  },
  setFog(v) { state.fogOverride = v; },
  counts() {
    let inst = 0, meshes = 0, verts = 0;
    scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        meshes++;
        const g = o.geometry;
        const v = g && g.attributes.position ? g.attributes.position.count : 0;
        verts += v * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh) inst += o.count;
      }
    });
    return { meshes, inst, verts };
  },
  regions: REGIONS,
  landmarks: LANDMARKS,
  locations: LOCATIONS,
  world: WORLD,
  /** jump to a named place (QC + debugging; the map itself only sets waypoints) */
  place(id, opts = {}) {
    const l = LOCATIONS.find((q) => q.id === id);
    if (!l) return null;
    const y = l.depth[0] + (opts.drop ?? 6);
    this.teleport(l.x + (opts.dx || 0), y, l.z + (opts.dz || 0), opts.yaw || 0, opts.pitch || 0);
    if (opts.look) this.lookAt(opts.look[0], opts.look[1], opts.look[2]);
    return { id: l.id, name: l.name, x: l.x, y, z: l.z, depth: l.depth };
  },
  stats() {
    return {
      geology: geologyGroup && geologyGroup.userData.stats,
      flora: floraGroup && floraGroup.userData.stats,
      terrain: { minY: field && field.minY, maxY: field && field.maxY, buildMs: field && field.buildTime },
      discovered: discoveredCount(),
      places: LOCATIONS.length,
      fps: state.fps,
    };
  },
  setSun(az, el) {
    shared.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  },
  travel(id) { return arriveAtPortal(id); },
  preload(id) { return preloadHabitat(id); },
  map(on) { toggleBigMap(on); },
  portalInside() { return travel.inside ? travel.inside.id : null; },
  portalProbe() {
    const c = camera.position, p = controller.pos;
    const direct = portalGroup.userData.inside(p);
    return {
      cam: c.toArray().map((v) => +v.toFixed(2)),
      ctrl: p.toArray().map((v) => +v.toFixed(2)),
      direct: direct ? direct.id : null,
      radii: portalGroup.userData.portals.map((q) => [q.id, q.radius, +q.centreY.toFixed(1)]),
      paused: state.paused, time: +state.time.toFixed(2),
    };
  },
  portalDistances() {
    const c = camera.position;
    return (portalGroup ? portalGroup.userData.portals : []).map((p) => ({
      id: p.id, d: +Math.hypot(c.x - p.x, c.z - p.z, c.y - p.centreY).toFixed(2),
    })).sort((a, b) => a.d - b.d).slice(0, 3);
  },
  /** QC/diagnostic: hide individual systems to find an artefact's owner */
  toggle(what, on) {
    if (what === 'bloom') { bloom.enabled = on !== false; return true; }
    if (what === 'grade') { grade.enabled = on !== false; return true; }
    if (what === 'post') { bloom.enabled = on !== false; grade.enabled = on !== false; return true; }
    const map = { terrain: terrainGroup, geology: geologyGroup, flora: floraGroup,
      caverns: cavernsGroup, portals: portalGroup, atm: atm && atm.group, coralScans:reefScans?.group, sky, ocean,
      apron: apronGroup };
    const g = map[what];
    if (g && g.visible !== undefined) g.visible = on !== false;
    else if (g && g.mesh) g.mesh.visible = on !== false;
    return !!g;
  },
  hideCard(on) {
    const el = document.getElementById('placeCard');
    if (el) el.style.display = on === false ? '' : 'none';
  },
  portals() {
    const list = portalGroup ? portalGroup.userData.portals : [];
    return list.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.centreY, z: p.z, radius: p.radius }));
  },
  hideUI(on) {
    for (const id of ['hud', 'startNote', 'loader', 'placeCard']) {
      const el = document.getElementById(id);
      if (el) el.style.display = on === false ? '' : 'none';
    }
  },
};

buildWorld().then(() => {
  applyQuality(state.quality);
  tick();
}).catch((err) => {
  console.error(err);
  $('loadHint').textContent = 'generation error: ' + err.message;
});

window.addEventListener('error', (e) => {
  $('loadHint').textContent = 'error: ' + e.message;
});
