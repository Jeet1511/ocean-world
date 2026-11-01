import { mulberry32 } from '../core/noise.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';

// One patrol entry per large marine animal. `kind` drives model selection:
//   manta      → manta.glb        (giant manta ray)
//   eagle_ray  → manta.glb x0.60  (smaller eagle ray)
//   shark      → shark.glb        (reef shark, ~3 m)
//   whale_shark→ shark.glb x2.1   (whale shark, ~9 m)
// `size` is a uniform scale applied to the model's longest axis.
// `verticalAmp` is the helical patrol amplitude in metres.
// `depthBand` [min, max] restricts where the centre may be placed.
const BASE_SPECS = [
  // ---- Z1 Glass Horizon: shallow sunlit shelf -------------------------------
  {kind:'manta',      place:'glasshorizon',offset:[-90,-60 ],size:4.2,verticalAmp:6,depthBand:[10,45]},
  {kind:'manta',      place:'glasshorizon',offset:[ 70,-90 ],size:3.8,verticalAmp:5,depthBand:[10,45]},
  {kind:'eagle_ray',  place:'glasshorizon',offset:[ 30,-40 ],size:2.6,verticalAmp:4,depthBand:[6,30]},
  {kind:'eagle_ray',  place:'glasshorizon',offset:[-60,-20 ],size:2.4,verticalAmp:3,depthBand:[6,30]},
  {kind:'shark',      place:'glasshorizon',offset:[ 50,-100],size:3.2,verticalAmp:5,depthBand:[12,50]},
  {kind:'shark',      place:'glasshorizon',offset:[-80,-70 ],size:2.9,verticalAmp:4,depthBand:[12,50]},
  // ---- Z2 Roseglass Reef: warm coral terraces -------------------------------
  {kind:'manta',      place:'roseglass',   offset:[ 40, 10 ],size:4.0,verticalAmp:6,depthBand:[18,50]},
  {kind:'eagle_ray',  place:'roseglass',   offset:[-35,-55 ],size:2.5,verticalAmp:4,depthBand:[14,45]},
  {kind:'shark',      place:'roseglass',   offset:[-50,-40 ],size:3.0,verticalAmp:5,depthBand:[16,55]},
  {kind:'shark',      place:'roseglass',   offset:[ 25, 60 ],size:2.8,verticalAmp:4,depthBand:[16,55]},
  // ---- Z3 Verdant Cathedral: kelp forest -----------------------------------
  {kind:'manta',      place:'verdant',     offset:[ 20, 40 ],size:4.1,verticalAmp:7,depthBand:[20,60]},
  {kind:'eagle_ray',  place:'verdant',     offset:[-45,-30 ],size:2.7,verticalAmp:5,depthBand:[18,50]},
  {kind:'shark',      place:'verdant',     offset:[ 60, 15 ],size:3.1,verticalAmp:6,depthBand:[22,65]},
  {kind:'whale_shark',place:'verdant',     offset:[-70, 90 ],size:2.1,verticalAmp:8,depthBand:[30,80]},
  // ---- Z4 Pillars of Aurel: drowned colonnade ------------------------------
  {kind:'manta',      place:'aurel',       offset:[ 30,-40 ],size:3.9,verticalAmp:6,depthBand:[70,140]},
  {kind:'shark',      place:'aurel',       offset:[-45, 25 ],size:3.0,verticalAmp:5,depthBand:[75,150]},
  {kind:'whale_shark',place:'aurel',       offset:[ 90,-60 ],size:2.0,verticalAmp:9,depthBand:[80,160]},
  // ---- Z5 Azure Span: arch over canyon -------------------------------------
  {kind:'manta',      place:'azurespan',   offset:[-30,-50 ],size:4.3,verticalAmp:8,depthBand:[130,250]},
  {kind:'eagle_ray',  place:'azurespan',   offset:[ 60,-20 ],size:2.8,verticalAmp:6,depthBand:[120,220]},
  {kind:'shark',      place:'azurespan',   offset:[ 20, 70 ],size:3.2,verticalAmp:7,depthBand:[140,260]},
  {kind:'whale_shark',place:'azurespan',   offset:[-85, 40 ],size:2.2,verticalAmp:9,depthBand:[150,280]},
  {kind:'blue_whale', place:'azurespan',   offset:[  0,  0 ],size:1.0,verticalAmp:12,depthBand:[130,290]},
  // ---- Z6 Flooded Nave: enclosed hall -------------------------------------
  {kind:'manta',      place:'floodednave', offset:[-20, 30 ],size:3.7,verticalAmp:5,depthBand:[45,110]},
  {kind:'eagle_ray',  place:'floodednave', offset:[ 40,-15 ],size:2.4,verticalAmp:4,depthBand:[40,90]},
  {kind:'shark',      place:'floodednave', offset:[-55, 45 ],size:2.9,verticalAmp:5,depthBand:[50,120]},
  // ---- Z7 Abyssal Bowl: deep basin ----------------------------------------
  {kind:'whale_shark',place:'abyssalbowl', offset:[ 30, 40 ],size:2.0,verticalAmp:10,depthBand:[420,650]},
  {kind:'shark',      place:'abyssalbowl', offset:[-40,-30 ],size:3.0,verticalAmp:7,depthBand:[400,620]},
  {kind:'blue_whale', place:'abyssalbowl', offset:[  0,  0 ],size:1.0,verticalAmp:14,depthBand:[430,680]},
];
// Medium and High both keep the complete fauna. A second independently placed
// visitor for each ray/shark specification creates readable groups while the
// distance-tier manager bounds animation cost. Blue whales use whale-route.js.
const SPECS=[...BASE_SPECS,...BASE_SPECS.filter(s=>s.kind!=='blue_whale').map(s=>({...s,offset:[-s.offset[0],-s.offset[1]]}))];

// For each route sample the complete patrol path and reject proximity to
// approximate large visual bounds. Small rocks and the curved space between
// samples are NOT certified; tests expose precisely what is being checked.
export function planMarinePatrols(field,colliders,schoolHints=[],quality='high'){
  const random=mulberry32(523472), routes=[];
  for(const spec of SPECS){
    const loc=LOCATIONS.find(l=>l.id===spec.place);
    const hints=spec.kind==='shark'?schoolHints.filter(s=>s.habitat===spec.place):[];
    for(let attempt=0;attempt<1500;attempt++){
      const nearHint=hints.length>0&&attempt<600;
      const hint=nearHint?hints[attempt%hints.length]:null;
      const a=random()*Math.PI*2,r=Math.sqrt(random())*(nearHint?22:110);
      const x=(hint?hint.center.x:loc.x+spec.offset[0])+Math.cos(a)*r;
      const z=(hint?hint.center.z:loc.z+spec.offset[1])+Math.sin(a)*r;
      const radius=7+random()*5;
      let highest=-Infinity,lowest=Infinity;
      for(let k=0;k<24;k++){
        const angle=k*Math.PI/12;
        const floor=field.surfaceHeightAt(x+Math.cos(angle)*radius,z+Math.sin(angle)*radius);
        highest=Math.max(highest,floor);lowest=Math.min(lowest,floor);
      }
      const [dMin,dMax]=spec.depthBand;
      // Centre must sit in the species' depth band with room above and below.
      const y=highest+6;
      const depth=-y;
      if(depth<dMin-3 || depth>dMax+15)continue;
      // Headroom: shallowest terrain under the patrol must stay above the animal.
      if(highest>y-3)continue;
      // Seabed clearance: deepest terrain must stay below the animal.
      if(lowest>y-8)continue;
      if(hint && Math.abs(y-hint.center.y)>14)continue;
      let safe=true;
      for(let k=0;k<24&&safe;k++){
        const angle=k*Math.PI/12,px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
        const margin=spec.kind==='blue_whale'?14:spec.kind==='whale_shark'?10:4.5;
        if(colliders.some(c=>{const b=c.visualBounds,m=margin;return b&&px>b.min[0]-m&&px<b.max[0]+m&&y>b.min[1]-m&&y<b.max[1]+m&&pz>b.min[2]-m&&pz<b.max[2]+m;}))safe=false;
      }
      if(!safe || routes.some(q=>Math.hypot(q.x-x,q.z-z)<34))continue;
      routes.push({...spec,x,y,z,radius,phase:random()*Math.PI*2,
        speed:(spec.kind==='manta'?.10:spec.kind==='eagle_ray'?.12:spec.kind==='blue_whale'?.04:.14)+random()*.02});
      break;
    }
  }
  // On low quality (software rendering), cut patrol density so each frame
  // is cheaper to simulate and rasterize.
  if(quality==='low') routes = routes.filter(()=>Math.random()<0.35);
  return routes;
}
