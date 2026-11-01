// Plans open-water routes for multiple blue whales across the deep regions.
// Each route is a helical patrol centre with a radius and speed. Clearance is
// sampled against terrain and conservative rock bounds. This is deliberately
// not a continuous collision-certified animal AI.
import {mulberry32} from '../core/noise.js?rev=37';
import { LOCATIONS } from './geography.js?rev=37';

export function planWhaleRoutes(field,colliders=[]){
  const rng=mulberry32(53124), routes=[];
  const DEEP_PLACES=[
    {place:'azurespan', cx:-480, cz:-340, depth:[130,300], radius:[32,48], speed:[.055,.085], size:30, amp:[8,14]},
    {place:'abyssalbowl', cx:0, cz:-700, depth:[420,680], radius:[28,42], speed:[.045,.070], size:34, amp:[12,18]},
    {place:'aurel', cx:0, cz:20, depth:[90,170], radius:[28,40], speed:[.060,.090], size:28, amp:[6,10]},
  ];
  let perPlace=0;
  for(const spec of DEEP_PLACES){
    // Visible regional pods rather than isolated single animals. These remain
    // confined to the three deep-water habitats where their 28–34 m bodies fit.
    // Mixed ecology: one travelling pod in Azure Span, solitary adults in the
    // other deep habitats. This avoids the implausible crowding of ten whales.
    const count=1;
    for(let w=0;w<count;w++){
      let route=null;
      for(let attempt=0;attempt<3000&&!route;attempt++){
        const a=rng()*Math.PI*2,r=Math.sqrt(rng())*180;
        const x=spec.cx+Math.cos(a)*r,z=spec.cz+Math.sin(a)*r;
        const patrolRadius=spec.radius[0]+rng()*(spec.radius[1]-spec.radius[0]);
        let highest=-Infinity;
        for(let k=0;k<24;k++){
          const ang=k*Math.PI/12;
          for(const [u,v] of [[0,0],[12,0],[-12,0],[0,12],[0,-12]]){
            highest=Math.max(highest,field.surfaceHeightAt(x+Math.cos(ang)*patrolRadius+u,z+Math.sin(ang)*patrolRadius+v));
          }
        }
        const [dMin,dMax]=spec.depth;
        if(highest>-dMin+10)continue;
        const y=Math.min(-dMin-5,highest+30);
        if(y>-dMin-2||y<-dMax-10)continue;
        let safe=true;
        for(let k=0;k<24&&safe;k++){
          const ang=k*Math.PI/12,px=x+Math.cos(ang)*patrolRadius,pz=z+Math.sin(ang)*patrolRadius;
          if(colliders.some(c=>{const b=c.visualBounds,m=14;return b&&px>b.min[0]-m&&px<b.max[0]+m&&y>b.min[1]-m&&y<b.max[1]+m&&pz>b.min[2]-m&&pz<b.max[2]+m;}))safe=false;
        }
        if(!safe)continue;
        // Keep full-sized bodies and patrol envelopes separated. Previously the
        // four Azure animals could occupy nearly identical circles, producing
        // the intersecting multi-body silhouette seen in close screenshots.
        if(routes.some(q=>q.place===spec.place&&Math.hypot(q.x-x,q.z-z)<55))continue;
        route={
          kind:'blue_whale',place:spec.place,x,y,z,radius:patrolRadius,
          size:spec.size,phase:rng()*Math.PI*2,
          speed:spec.speed[0]+rng()*(spec.speed[1]-spec.speed[0]),
          verticalAmp:spec.amp[0]+rng()*(spec.amp[1]-spec.amp[0]),
          verticalPhase:rng()*Math.PI*2,
        };
      }
      if(route)routes.push(route);
    }
  }
  // Azure pod members share a broad migration corridor but remain quarter-cycle
  // apart, giving coordinated travel without intersecting bodies.
  const leader=routes.find(r=>r.place==='azurespan');
  if(leader)for(let i=1;i<4;i++)routes.push({...leader,phase:leader.phase+i*Math.PI*.5,size:leader.size*(.92+i*.025),verticalPhase:leader.verticalPhase+i*.7});
  return routes;
}

// Keep the old single-route name working for any callers that still reference it.
export function planWhaleRoute(field,colliders=[]){
  const routes=planWhaleRoutes(field,colliders);
  return routes.length?routes[0]:null;
}
