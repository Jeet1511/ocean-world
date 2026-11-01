// Small composition-focused gardens beside the existing portal-to-landmark
// routes. They use real rendered terrain and conservative rock bounds; this is
// a placement sample, not a full collision/pathfinding certificate.
import {mulberry32} from '../core/noise.js?rev=37';
import {WORLD} from './geography.js?rev=37';
const OPTIONS={
 glasshorizon:{depth:[6,55],families:['massive','table','branching'],palettes:['amber','bone','rose'],scale:[.8,1.55]},
 roseglass:{depth:[8,58],families:['foliose','foliose','table','branching','fan','sponge','massive'],palettes:['rose','violet','amber','teal'],scale:[1.15,2.15]},
 verdant:{depth:[8,65],families:['fan','massive','sponge'],palettes:['teal','amber','violet'],scale:[.9,1.5]},
 aurel:{depth:[65,185],families:['fan','sponge'],palettes:['coldPale','coldRust'],scale:[1.35,2.0]},
 azurespan:{depth:[125,290],families:['fan','sponge'],palettes:['coldPale','coldRust'],scale:[1.35,2.0]},
 floodednave:{depth:[55,150],families:['fan','sponge'],palettes:['coldPale','coldRust'],scale:[1.0,1.6]},
 abyssalbowl:{depth:[260,690],families:['fan','sponge'],palettes:['coldPale','coldRust'],scale:[1.25,1.9]},
};
export function planFeatureGardens(field,portals,colliders=[]){
 const rng=mulberry32(910128),out=[],sites=[];
 for(const portal of portals){
  const spec=OPTIONS[portal.id];if(!spec)continue;
  const dx0=portal.loc.x-portal.x,dz0=portal.loc.z-portal.z,len=Math.hypot(dx0,dz0)||1,dx=dx0/len,dz=dz0/len;
  const distances=portal.id==='azurespan'?[45,60,75,90,105,120]:[38,65,92];
  const sides=portal.id==='azurespan'?[-65,-42,-20,20,42]:portal.id==='aurel'?[-42,-27,27,42]:[-27,27];
  for(const distance of distances)for(const side of sides){
   let center;
   for(let attempt=0;attempt<18;attempt++){
    const jitter=(rng()-.5)*14, along=distance+(rng()-.5)*12, across=side+jitter;
    const x=portal.x+dx*along-dz*across,z=portal.z+dz*along+dx*across;
    if(x<WORLD.minX+10||x>WORLD.maxX-10||z<WORLD.minZ+10||z>WORLD.maxZ-10)continue;
    const y=field.surfaceHeightAt(x,z),d=-y;
    if(d<spec.depth[0]||d>spec.depth[1]||field.steepness(x,z)>.50)continue;
    if(colliders.some(c=>{const b=c.visualBounds,m=2;return b&&x>b.min[0]-m&&x<b.max[0]+m&&y+1>b.min[1]-2&&y+1<b.max[1]+2&&z>b.min[2]-m&&z<b.max[2]+m;}))continue;
    center={x,z};break;
   }
   if(!center)continue;
   const start=out.length;
   const count=portal.id==='roseglass'?30:portal.id==='glasshorizon'?16:portal.id==='verdant'?16:12;
   for(let i=0;i<count;i++){
    const angle=rng()*Math.PI*2,r=Math.sqrt(rng())*(portal.id==='roseglass'?6.5:7.5),x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
    const y=field.surfaceHeightAt(x,z),depth=-y;
    if(depth<spec.depth[0]||depth>spec.depth[1]||field.steepness(x,z)>.50)continue;
    // Preserve a navigable central aisle and a clear teleport approach.
    const rx=x-portal.x,rz=z-portal.z,along=rx*dx+rz*dz,across=-rx*dz+rz*dx;
    if(Math.abs(across)<15||Math.hypot(rx,rz)<24||along<15)continue;
    if(colliders.some(c=>{const b=c.visualBounds,m=2;return b&&x>b.min[0]-m&&x<b.max[0]+m&&y+.8>b.min[1]-1&&y+.8<b.max[1]+1&&z>b.min[2]-m&&z<b.max[2]+m;}))continue;
    const kind=spec.families[Math.floor(rng()*spec.families.length)],pal=spec.palettes[Math.floor(rng()*spec.palettes.length)];
    const scale=spec.scale[0]+rng()*(spec.scale[1]-spec.scale[0]);
    out.push({id:portal.id,kind,pal,x,y,z,rot:rng()*Math.PI*2,scale});
   }
   if(out.length>start)sites.push({id:portal.id,x:center.x,z:center.z,count:out.length-start});
  }
 }
 return {placements:out,sites};
}
