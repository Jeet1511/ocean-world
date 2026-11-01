// Habitat-specific, deterministic supplemental population plan for the
// existing continuous world. Counts are game-design targets, not census data.
// No animals are spawned or deleted as the player moves: every accepted group
// has a persistent home region, and quality settings alter simulation/rendering
// cost rather than the ecological distribution.
import { LOCATIONS, WORLD } from './geography.js?rev=37';
import { mulberry32 } from '../core/noise.js?rev=37';

// minimum/maximum count includes the pre-existing schools. `density` is a
// relative planning weight, not fish per square metre. Species models are
// optional: a missing model is reported and never mislabeled as another animal.
export const ECOSYSTEM_PROFILES = Object.freeze({
  glasshorizon: {
    min: 380, max: 480, density: 0.78, floorDepth: [5, 110],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'coastal shoal', count:40, groups:2, regions:['arrival','flank'], spread:15, swim:{radius:19,maxSpeed:2.4} },
      { species:'ocean_sunfish', role:'open-water visitor', count:1, groups:1, regions:['outer'], spread:1, depth:[30,150], lift:12, scale:[.65,.82], style:3, swim:{radius:12,maxSpeed:1.1} },
      { species:'swordfish', role:'pelagic visitor', count:1, groups:1, regions:['outer'], spread:1, depth:[35,170], lift:14, scale:[1.05,1.30], swim:{radius:18,maxSpeed:2.5} },
    ],
  },
  roseglass: {
    min: 455, max: 560, density: 1.0, floorDepth: [8, 65],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'reef shoal', count:36, groups:2, regions:['arrival','flank'], spread:14, swim:{radius:13,maxSpeed:2.05} },
      { species:'clownfish', role:'anemone resident', count:2, groups:3, regions:['interior','flank','arrival'], spread:2.3, depth:[8,45], bottom:true, scale:[.085,.115], swim:{radius:3.5,maxSpeed:.72,cohesion:.18} },
      { species:'lionfish', role:'reef predator', count:1, groups:2, regions:['interior','flank'], spread:1, depth:[12,65], bottom:true, scale:[.18,.25], swim:{radius:6,maxSpeed:.65} },
      { species:'mandarinfish', role:'reef-floor browser', count:1, groups:2, regions:['flank','interior'], spread:1, depth:[8,45], bottom:true, scale:[.085,.12], swim:{radius:4,maxSpeed:.55} },
      { species:'seahorse', role:'sheltered seahorse', count:1, groups:2, regions:['interior','flank'], spread:1, depth:[8,45], bottom:true, scale:[.10,.14], style:2, swim:{radius:2.6,maxSpeed:.32} },
    ],
  },
  verdant: {
    min: 405, max: 500, density: 0.88, floorDepth: [10, 85],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'kelp shoal', count:32, groups:2, regions:['arrival','flank'], spread:13, swim:{radius:11,maxSpeed:1.8} },
      { species:'seahorse', role:'kelp understory', count:1, groups:3, regions:['arrival','interior','flank'], spread:1, depth:[10,50], bottom:true, scale:[.10,.14], style:2, swim:{radius:2.6,maxSpeed:.32} },
      { species:'flounder', role:'sandy-bottom fish', count:1, groups:2, regions:['arrival','flank'], spread:1, depth:[10,55], bottom:true, scale:[.20,.27], style:4, swim:{radius:5,maxSpeed:.55} },
    ],
  },
  aurel: {
    min: 260, max: 330, density: 0.65, floorDepth: [60, 185],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'column shoal', count:28, groups:2, regions:['arrival','flank'], spread:16, swim:{radius:17,maxSpeed:2.05} },
      { species:'ocean_sunfish', role:'open-water visitor', count:1, groups:1, regions:['outer'], spread:1, depth:[60,180], lift:18, scale:[.7,.9], style:3, swim:{radius:14,maxSpeed:1.1} },
    ],
  },
  azurespan: {
    min: 250, max: 330, density: 0.72, floorDepth: [120, 320],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'canyon pelagic shoal', count:35, groups:2, regions:['arrival','flank'], spread:19, swim:{radius:20,maxSpeed:2.5} },
      { species:'swordfish', role:'pelagic visitor', count:1, groups:1, regions:['outer'], spread:1, depth:[130,300], lift:30, scale:[1.10,1.45], swim:{radius:20,maxSpeed:2.6} },
      { species:'ocean_sunfish', role:'open-water visitor', count:1, groups:1, regions:['flank'], spread:1, depth:[130,290], lift:25, scale:[.8,1.05], style:3, swim:{radius:14,maxSpeed:1.15} },
    ],
  },
  floodednave: {
    min: 220, max: 290, density: 0.60, floorDepth: [40, 165],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'cavern-mouth shoal', count:26, groups:2, regions:['arrival','flank'], spread:12, swim:{radius:10,maxSpeed:1.6} },
      { species:'lionfish', role:'sheltered rocky-reef predator', count:1, groups:2, regions:['arrival','flank'], spread:1, depth:[40,140], bottom:true, scale:[.20,.27], swim:{radius:5,maxSpeed:.6} },
    ],
  },
  abyssalbowl: {
    min: 195, max: 250, density: 0.42, floorDepth: [400, 700],
    simulation: { nearHz: 8, farHz: 4 },
    groups: [
      { role:'twilight shoal', count:24, groups:2, regions:['arrival','flank'], spread:19, swim:{radius:19,maxSpeed:1.45} },
      { species:'anglerfish', role:'solitary twilight predator', count:1, groups:2, regions:['arrival','flank'], spread:1, depth:[400,700], lift:10, scale:[.22,.30], swim:{radius:8,maxSpeed:.65} },
    ],
  },
});

function blocked(x,y,z,colliders,margin=3) {
  return colliders.some(c=>{
    const b=c.visualBounds;
    return b && x>b.min[0]-margin && x<b.max[0]+margin &&
      y>b.min[1]-margin && y<b.max[1]+margin && z>b.min[2]-margin && z<b.max[2]+margin;
  });
}

/**
 * Finds water around each existing portal-to-landmark corridor, plus side
 * clearings. Candidate centres are checked against the rendered seabed and
 * conservative visible-rock bounds. Animated paths and cave roofs are not an
 * exact continuous collision certificate.
 */
export function planEcosystem(field, portals, colliders = [], baseline = {}, available = null) {
  const rng=mulberry32(950271), plans=[], reports={};
  const floorAt=(x,z)=>field.surfaceHeightAt ? field.surfaceHeightAt(x,z) : field.heightAt(x,z);
  for(const loc of LOCATIONS){
    const cfg=ECOSYSTEM_PROFILES[loc.id],gate=portals.find(p=>p.id===loc.id);
    const report={minimum:cfg.min,maximum:cfg.max,density:cfg.density,baseline:baseline[loc.id]||0,
      added:0,groups:0,missingAssets:[],unplaced:[]};
    reports[loc.id]=report;
    if(!gate){report.unplaced.push('portal unavailable');continue;}
    const dx=loc.x-gate.x,dz=loc.z-gate.z,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
    const regionBase={arrival:[Math.min(49,d*.42),-13],interior:[d*.76,18],
      flank:[d*.55,48],outer:[d*.16,-64]};
    let groupIndex=0;
    for(const spec of cfg.groups){
      if(spec.species && available && !available.has(spec.species)){
        report.missingAssets.push(spec.species);continue;
      }
      for(let g=0;g<spec.groups;g++,groupIndex++){
        if(report.baseline+report.added+spec.count>cfg.max){report.unplaced.push(`${spec.role}: budget`);continue;}
        const region=spec.regions[g%spec.regions.length],base=regionBase[region];
        let hit=null;
        for(let attempt=0;attempt<220;attempt++){
          const angle=rng()*Math.PI*2, wide=attempt>=150;
          const r=wide ? 35+Math.sqrt(rng())*155 : Math.sqrt(rng())*(attempt<80?20:48);
          const side=base[1]+(g%2? -14:0);
          // If a corridor is hemmed in by an arch or wall, search other
          // clear water inside this same destination instead of burying fish.
          const x=wide ? loc.x+Math.cos(angle)*r : gate.x+ux*base[0]-uz*side+Math.cos(angle)*r;
          const z=wide ? loc.z+Math.sin(angle)*r : gate.z+uz*base[0]+ux*side+Math.sin(angle)*r;
          if(x<WORLD.minX+12 || x>WORLD.maxX-12 || z<WORLD.minZ+12 || z>WORLD.maxZ-12)continue;
          const floor=floorAt(x,z),depth=-floor,range=spec.depth||cfg.floorDepth;
          if(depth<range[0] || depth>range[1] || (field.steepness && field.steepness(x,z)>.7))continue;
          const sampleR=Math.max(2,Math.min(8,spec.spread*.45));
          let highest=floor;
          for(let k=0;k<8;k++){
            const a=k*Math.PI/4;highest=Math.max(highest,floorAt(x+Math.cos(a)*sampleR,z+Math.sin(a)*sampleR));
          }
          const requested=spec.bottom?1.9:(spec.lift??Math.min(depth*.40,25));
          const y=Math.max(floor+requested,highest+1.7);
          if(y>-3.2 || y-floor<1.5)continue;
          if(blocked(x,y,z,colliders,spec.bottom?2.5:4))continue;
          if(plans.some(p=>p.habitat===loc.id && Math.hypot(x-p.x,z-p.z)<(spec.count>1?20:7)))continue;
          hit={x,y,z,floor,habitat:loc.id,region,species:spec.species||null,role:spec.role,
            count:spec.count,spread:spec.spread,scale:spec.scale,style:spec.style||0,swim:spec.swim||{},
            bottom:!!spec.bottom};break;
        }
        if(hit){plans.push(hit);report.added+=hit.count;report.groups++;}
        else report.unplaced.push(spec.role);
      }
    }
    report.total=report.baseline+report.added;
    report.meetsMinimum=report.total>=report.minimum;
  }
  return {plans,reports};
}
