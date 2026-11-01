// Bounded habitat selections for two distinguishable, textured fish types.
// These are sampled spawn regions, not exact continuous fish/mesh collision.
import {mulberry32} from '../core/noise.js?rev=37';

export function planSpeciesSchools(field, colliders = []) {
 const random=mulberry32(118056), results=[];
 const plans=[
  {species:'palette_surgeonfish',habitat:'roseglass',anchor:[-520,300],range:65,count:8,floor:[-40,-10],minY:-38,maxY:-3.5},
  {species:'palette_surgeonfish',habitat:'roseglass',anchor:[-490,340],range:65,count:8,floor:[-40,-10],minY:-38,maxY:-3.5},
  {species:'bluefin_tuna',habitat:'glasshorizon',anchor:[75,500],range:125,count:8,floor:[-110,-28],minY:-80,maxY:-5},
 ];
 for(const plan of plans){
  for(let attempt=0;attempt<1300;attempt++){
   const a=random()*Math.PI*2,r=Math.sqrt(random())*plan.range;
   const x=plan.anchor[0]+Math.cos(a)*r,z=plan.anchor[1]+Math.sin(a)*r;
   const floor=field.surfaceHeightAt(x,z);
   if(floor<plan.floor[0]||floor>plan.floor[1])continue;
   const y=Math.min(-3.5,floor+Math.min(-floor*.48,35));
   if(y<plan.minY||y>plan.maxY)continue;
   let ok=true;
   for(let i=0;i<16;i++){
    const q=i*Math.PI/8, f=field.surfaceHeightAt(x+Math.cos(q)*8,z+Math.sin(q)*8);
    if(f>y-2 || f<plan.floor[0]-10){ok=false;break;}
   }
   if(!ok)continue;
   // Conservative initial broad-phase clearance, not full animated path safety.
   if(colliders.some(c=>{let b=c.visualBounds,m=9;return b&&x>b.min[0]-m&&x<b.max[0]+m&&y>b.min[1]-2&&y<b.max[1]+2&&z>b.min[2]-m&&z<b.max[2]+m;}))continue;
   if(results.some(p=>Math.hypot(x-p.x,z-p.z)<25))continue;
   results.push({...plan,x,y,z});break;
  }
 }
 return results;
}
