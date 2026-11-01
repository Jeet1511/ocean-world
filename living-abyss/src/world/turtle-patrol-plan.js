// Sea turtle patrols across the seven destinations. These are bounded samples,
// not a continuous swimming-route proof or a model of turtle migration.
import {planArrival} from './arrival-plan.js?rev=37';

export const TURTLE_HABITATS={
 glasshorizon:{minimum:2,maximum:3,depth:8,radius:8,speed:.055,phase:2.7,verticalAmp:3},
 roseglass:{minimum:2,maximum:3,depth:14,radius:9,speed:.045,phase:2.3,verticalAmp:4},
 verdant:{minimum:2,maximum:3,depth:20,radius:10,speed:.050,phase:1.9,verticalAmp:5},
 aurel:{minimum:2,maximum:2,depth:90,radius:12,speed:.040,phase:3.1,verticalAmp:6},
 azurespan:{minimum:2,maximum:3,depth:170,radius:14,speed:.035,phase:2.8,verticalAmp:7},
 floodednave:{minimum:2,maximum:2,depth:60,radius:10,speed:.045,phase:1.5,verticalAmp:5},
 abyssalbowl:{minimum:2,maximum:2,depth:520,radius:18,speed:.030,phase:0.9,verticalAmp:9},
};
export function planTurtlePatrols(field,portals,colliders=[],quality='high'){
 const routes=[];
 for(const [id,s] of Object.entries(TURTLE_HABITATS)){
  const gate=portals.find(p=>p.id===id);if(!gate)continue;
  const pose=planArrival(gate,field),ux=-Math.sin(pose.yaw),uz=-Math.cos(pose.yaw);
  const count=s.maximum;
  for(let t=0;t<count;t++){
   let found;
   const startAngle=(t/count)*Math.PI*2;
   for(const forward of [25,35,45,55,65,75,85,95]){
    for(const side of [14,-14,24,-24,34,-34,44,-44,54,-54]){
     const x=pose.x+ux*forward-uz*side,z=pose.z+uz*forward+ux*side,y=-s.depth;
     let clear=true;
     for(let i=0;i<20&&clear;i++){
      const a=i*Math.PI/10,px=x+Math.cos(a)*s.radius,pz=z+Math.sin(a)*s.radius;
      const floor=field.surfaceHeightAt(px,pz);
      // Seabed must be at least 4m below the turtle; no upper bound on depth.
      if(floor>y-4){clear=false;break;}
     }
     if(clear){found={habitat:id,x,y,z,radius:s.radius,speed:s.speed,phase:s.phase+startAngle,size:1.6,verticalAmp:s.verticalAmp};break;}
    }
    if(found)break;
   }
   if(found)routes.push(found);
  }
 }
 if(quality==='low') routes = routes.filter(()=>Math.random()<0.4);
 return routes;
}
