// Small art-directed reef shoals. Paths use sampled terrain and broad rock
// bounds, not exact animated-fish-to-mesh collision.
import {LOCATIONS, START_POSE} from './geography.js?rev=37';
import {mulberry32} from '../core/noise.js?rev=37';

export function planReefShoals(field,colliders,portals){
 const rng=mulberry32(765832),routes=[];
 const glass=LOCATIONS.find(l=>l.id==='glasshorizon'),reef=LOCATIONS.find(l=>l.id==='roseglass');
 const gate=id=>portals.find(p=>p.id===id);
 const specs=[
  {place:'glasshorizon',anchor:[START_POSE.x-18,START_POSE.z-18],search:30},
  {place:'glasshorizon',anchor:[gate('glasshorizon')?.x??glass.x,gate('glasshorizon')?.z??glass.z],search:70},
  {place:'roseglass',anchor:[gate('roseglass')?.x??reef.x,gate('roseglass')?.z??reef.z],search:70},
  {place:'roseglass',anchor:[reef.x,reef.z],search:90},
 ];
 for(const spec of specs){
  for(let attempt=0;attempt<1000;attempt++){
   const angle=rng()*Math.PI*2,r=Math.sqrt(rng())*spec.search;
   const x=spec.anchor[0]+Math.cos(angle)*r,z=spec.anchor[1]+Math.sin(angle)*r;
   // Keep the encounter near the starting shelf, but not on top of the player.
   if(spec===specs[0] && Math.hypot(x-START_POSE.x,z-START_POSE.z)<20)continue;
   let highest=-Infinity,lowest=Infinity;
   // Allow for the full animated shoal and its tiny orbit, not just its centre.
   for(let i=0;i<20;i++){
    const a=i*Math.PI/10, floor=field.surfaceHeightAt(x+Math.cos(a)*6,z+Math.sin(a)*6);
    highest=Math.max(highest,floor);lowest=Math.min(lowest,floor);
   }
   const y=highest+2.7;
   if(y>-2.1||lowest < -46 || highest> -5.0)continue;
   let safe=true;
   // Animation bounds are sampled separately; this conservative envelope
   // does not guarantee exact intersection-free behavior over every frame.
   for(const c of colliders){const b=c.visualBounds,m=5.3;
    if(b&&x>b.min[0]-m&&x<b.max[0]+m&&y>b.min[1]-m&&y<b.max[1]+m&&z>b.min[2]-m&&z<b.max[2]+m){safe=false;break;}}
   if(!safe||routes.some(q=>Math.hypot(q.x-x,q.z-z)<26))continue;
   routes.push({...spec,x,y,z,radius:1.1+rng()*.5,phase:rng()*Math.PI*2,speed:.065+rng()*.025});break;
  }
 }
 return routes;
}
