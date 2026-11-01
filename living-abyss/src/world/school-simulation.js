// Bounded local schooling for the existing instanced fish. Reynolds-inspired
// separation, alignment and cohesion plus a home-range constraint, terrain
// clearance and swimmer avoidance. Not a species-accurate ecological model.
import { SIM_TIER } from '../core/simulation-lod.js?rev=37';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Signed approximate clearance from the same conservative rock cores used by
// movement. These are NOT exact visible mesh or cavern-roof queries.
// Conservative broad phase for the *existing* approximate distance function.
// It may admit extra objects but never rejects a core whose distance is below
// the requested threshold. In particular, the ellipsoid's approximation uses
// its minimum radius, so its expanded axes must scale by threshold/minRadius.
export function obstacleMayBeNear(c,x,y,z,threshold){
 if(c.type==='ell'){
  const min=Math.min(c.rx,c.ry,c.rz),f=1+threshold/min;
  return Math.abs(x-c.x)<=c.rx*f && Math.abs(y-c.y)<=c.ry*f && Math.abs(z-c.z)<=c.rz*f;
 }
 if(c.type==='cyl'){
  const r=c.r+threshold;
  return Math.abs(x-c.x)<=r && y>=c.yBase-threshold && y<=c.yTop+threshold && Math.abs(z-c.z)<=r;
 }
 if(c.type==='cap'){
  const r=c.r+threshold;
  return x>=Math.min(c.x1,c.x2)-r && x<=Math.max(c.x1,c.x2)+r &&
         y>=Math.min(c.y1,c.y2)-r && y<=Math.max(c.y1,c.y2)+r &&
         z>=Math.min(c.z1,c.z2)-r && z<=Math.max(c.z1,c.z2)+r;
 }
 return true;
}
// Reuse one result object per simulation instead of allocating thousands of
// short-lived vectors during each fixed school step.
function obstacleDistance(c,x,y,z,out){
 let dx,dy,dz,r;
 if(c.type==='ell'){
  dx=x-c.x;dy=y-c.y;dz=z-c.z;
  const d=Math.hypot(dx/c.rx,dy/c.ry,dz/c.rz),min=Math.min(c.rx,c.ry,c.rz);
  let nx=dx/(c.rx*c.rx),ny=dy/(c.ry*c.ry),nz=dz/(c.rz*c.rz),n=Math.hypot(nx,ny,nz);
  if(n<1e-9){out.dist=-min;out.x=1;out.y=0;out.z=0;return out;}
  out.dist=(d-1)*min;out.x=nx/n;out.y=ny/n;out.z=nz/n;return out;
 }
 if(c.type==='cyl'){
  dx=x-c.x;dz=z-c.z;const h=Math.hypot(dx,dz)||1e-9;
  const vertical=y<c.yBase?y-c.yBase:y>c.yTop?y-c.yTop:0, radial=h-c.r;
  if(vertical!==0 && radial<0){out.dist=Math.abs(vertical);out.x=0;out.y=Math.sign(vertical);out.z=0;return out;}
  if(vertical!==0 && radial>=0){let d=Math.hypot(radial,vertical);out.dist=d;out.x=dx/h*radial/d;out.y=vertical/d;out.z=dz/h*radial/d;return out;}
  out.dist=radial;out.x=dx/h;out.y=0;out.z=dz/h;return out;
 }
 if(c.type==='cap'){
  const ax=c.x1,ay=c.y1,az=c.z1,bx=c.x2-ax,by=c.y2-ay,bz=c.z2-az;
  const t=clamp(((x-ax)*bx+(y-ay)*by+(z-az)*bz)/(bx*bx+by*by+bz*bz||1),0,1);
  dx=x-ax-t*bx;dy=y-ay-t*by;dz=z-az-t*bz;r=c.r;
  const d=Math.hypot(dx,dy,dz);if(d<1e-9){out.dist=-r;out.x=1;out.y=0;out.z=0;return out;}
  out.dist=d-r;out.x=dx/d;out.y=dy/d;out.z=dz/d;return out;
 }
 out.dist=Infinity;out.x=0;out.y=0;out.z=0;return out;
}
export class SchoolSimulation {
 constructor(field, center, offsets, phases, random, colliders = [], profile = {}) {
  this.field=field;this.center=center;this.positions=offsets;this.previous=new Float32Array(offsets);
  this.velocities=new Float32Array(offsets.length);this.previousVelocities=new Float32Array(offsets.length);this.nextPositions=new Float32Array(offsets.length);
  this.nextVelocities=new Float32Array(offsets.length);this.phases=phases;this.count=phases.length;
  const plannedRadius=profile.radius ?? 15;
  // Multi-fish schools need room to roam through the habitat, not orbit inside
  // a tiny 10–20 m bubble. Solitary residents retain their authored territory.
  this.radius=this.count>2&&plannedRadius>=9?plannedRadius*2.25:plannedRadius;
  const authoredSpeed=profile.maxSpeed ?? 1.15;
  // Older values up to 2.6 m/s were escape/sprint speeds mistakenly used as
  // continuous cruising speeds for small fish. Scale those to routine cruise.
  this.maxSpeed=authoredSpeed>1.35?authoredSpeed*.48:authoredSpeed;
  this.cohesion=profile.cohesion ?? .10;this.alignment=profile.alignment ?? .55;
  this.clearance=1.1;this.ceiling=6.0;this.time=0;
  // Depth-keeping state machine: cruising / diving / ascending / bottoming.
  // Fish deliberately leave the centre plane and travel through the full
  // water column of their home range instead of hovering in a thin band.
  // `ceiling` is how many metres above the school centre a fish may rise.
  this.depthMode='cruising';
  this.depthModeTime=0;
  this.targetDepth=0;
  this.depthHold=random() > 0.5;
  // Coherent school-level cruise route. Individuals still flock and avoid
  // obstacles, but the group follows one broad turning path rather than each
  // fish wandering independently like particles.
  this.cruiseAngle=random()*Math.PI*2;
  this.cruiseDirection=random()<.5?-1:1;
  this.cruiseRadius=this.radius*(.50+random()*.22);
  // Correlated-wander guide: persistent heading with slowly changing curvature.
  // It is not a leader fish; it is a low-frequency group intent used alongside
  // local attraction/repulsion. This avoids both straight rails and fixed loops.
  this.guideX=0;this.guideZ=0;this.guideHeading=this.cruiseAngle;
  this.guideTurn=(random()-.5)*.18;this.guideDecision=2+random()*4;
  this.collectiveState='polarized';this.collectiveTimer=12+random()*16;
  this.random=random;
  // Gentle underwater current (metres per second, x/z) that drifts the whole
  // school, giving the water a sense of flow beneath the surface.
  this.currentX=0.05;this.currentZ=0.02;
  this.neighborChecks=0;this._obstacleResult={dist:Infinity,x:0,y:0,z:0};
  this.activityEnabled=!!profile.activity;
  this.bottomActivity=!!profile.bottomActivity;
  this.activityState='cruising';this.activityFactor=1;
  // Per-fish momentum: fish carry their heading for a few seconds instead of
  // snapping to the steering vector, which makes the school glide and turn
  // like a real body of water instead of a particle swarm.
  this.momentum=new Float32Array(offsets.length);
  for(let i=0;i<this.count;i++)this.momentum[i]=0.55+random()*.30;
  this.obstacles=colliders.filter(c=>{
   let x,z,reach;
   if(c.type==='ell'){x=c.x;z=c.z;reach=Math.max(c.rx,c.rz);}
   else if(c.type==='cyl'){x=c.x;z=c.z;reach=c.r;}
   else if(c.type==='cap'){x=(c.x1+c.x2)/2;z=(c.z1+c.z2)/2;reach=c.r+Math.hypot(c.x2-c.x1,c.z2-c.z1)/2;}
   else return false;
   return Math.hypot(center.x-x,center.z-z)<reach+this.radius+12;
  });
  this.unresolvedSpawns=0;
  for(let i=0;i<this.count;i++){
   // A school begins polarized: neighboring fish share a broad heading with
   // small individual variation. The previous 0–360° random headings made the
   // net group velocity cancel, so fish milled incoherently around the spawn.
   const j=i*3, a=this.guideHeading+(random()-.5)*.34;
   const speed=this.maxSpeed*(.52+random()*.18);
   this.velocities[j]=Math.cos(a)*speed;this.velocities[j+1]=(random()-.5)*.06;this.velocities[j+2]=Math.sin(a)*speed;
   this.constrain(j, 0, 0);
   // Seek nearby free water without deleting or relocating the school itself.
   for(let attempt=0;attempt<64 && this.inObstacle(j);attempt++){
    this.positions[j]=(random()-.5)*28;this.positions[j+2]=(random()-.5)*28;
    this.positions[j+1]=(random()-.5)*6;
    this.constrain(j,0,0);
   }
   if(this.inObstacle(j))this.unresolvedSpawns++;
  }
  this.previous.set(this.positions);this.previousVelocities.set(this.velocities);
 }
 inObstacle(j){
  const p=this.positions,c=this.center,x=c.x+p[j],y=c.y+p[j+1],z=c.z+p[j+2];
  return this.obstacles.some(o=>obstacleMayBeNear(o,x,y,z,.5)&&obstacleDistance(o,x,y,z,this._obstacleResult).dist<.5);
 }
 floor(x,z){
   const h=this.field.surfaceHeightAt ? this.field.surfaceHeightAt(x,z):this.field.heightAt(x,z);
   // Guard against NaN from out-of-bounds or uninitialized terrain — fall back
   // to the school centre depth so fish never get NaN positions.
   return isFinite(h) ? h : this.center.y;
 }
 constrain(j, oldX, oldZ){
  const p=this.positions,c=this.center;
  let floor=this.floor(c.x+p[j],c.z+p[j+2])+this.clearance;
  // Ceiling is relative to the school centre: fish may rise up to this.ceiling
  // metres above it, but never closer than 2 m to the surface.
  const absCeil=Math.min(c.y+this.ceiling,-2.0);
  // Fish may rise well above the centre now — only the seabed and the ceiling
  // bound them. A school that dives and ascends reads as a living body, not a
  // horizontal carpet. If seabed+clearance is deeper than the ceiling (water
  // too shallow for this school), keep the fish at the seabed.
  if(floor>absCeil){p[j]=oldX;p[j+2]=oldZ;floor=this.floor(c.x+oldX,c.z+oldZ)+this.clearance;}
  let yLo=floor;
  if(floor>absCeil)yLo=floor;
  p[j+1]=clamp(c.y+p[j+1],yLo,absCeil)-c.y;
 }
 step(dt, player, predators = []) {
  dt=clamp(dt,0,0.25); if(!dt)return;
  const p=this.positions,v=this.velocities,c=this.center,n=this.count;
  const nextP=this.nextPositions,nextV=this.nextVelocities;
  this.previous.set(p);this.previousVelocities.set(v);this.time+=dt;
  // Spatial bins preserve the same 5 m neighbourhood but avoid comparing
  // every fish to every other fish. This is rebuilt once per fixed step.
  const cells=new Map(), cellSize=5;
  for(let i=0;i<n;i++){
   const k=i*3, cx=Math.floor(p[k]/cellSize), cz=Math.floor(p[k+2]/cellSize);
   const key=cx+','+cz; let cell=cells.get(key);
   if(!cell){cell=[];cells.set(key,cell);} cell.push(i);
  }
  this.neighborChecks=0;
  // Cheap broad-phase: only predators close enough to this school's home
  // range reach the individual-fish avoidance loop. This is a behavioral
  // approximation, not a simulation of hunting or food-web population change.
  const nearbyPredators=[];
  const reach=this.radius+22;
  for(const threat of predators){
   if(!threat || !Number.isFinite(threat.x+threat.y+threat.z))continue;
   const dx=threat.x-c.x,dy=threat.y-c.y,dz=threat.z-c.z;
   if(dx*dx+dy*dy+dz*dz<reach*reach)nearbyPredators.push(threat);
  }
  this.nearbyPredatorCount=nearbyPredators.length;
  // A slow, independently phased cruise / foraging / resting cycle modulates
  // movement continuously; nearby predators override it with an alert state.
  // It is a visual behavior model, not a simulated food web or life cycle.
  if(this.activityEnabled){
   const cycle=(this.time+(this.phases[0]||0)*13.7)%88;
   this.activityState=nearbyPredators.length?'alert':cycle<52?'cruising':cycle<73?'foraging':'resting';
   const target=this.activityState==='alert'?1:this.activityState==='resting'?.42:this.activityState==='foraging'?.70:1;
   this.activityFactor+=(target-this.activityFactor)*Math.min(1,dt*.65);
  }
  const speedLimit=Math.max(.15,this.maxSpeed*this.activityFactor);
  // Bounded correlated random walk for group intent. Curvature persists for
  // several seconds, then changes gradually; near the home-range edge the guide
  // turns inward. This produces arcs, S-curves and occasional milling—not rails.
  this.guideDecision-=dt;this.collectiveTimer-=dt;
  if(this.guideDecision<=0){
   this.guideDecision=2.5+this.random()*5.5;
   this.guideTurn=clamp(this.guideTurn+(this.random()-.5)*.32,-.34,.34);
  }
  if(this.collectiveTimer<=0){
   this.collectiveTimer=10+this.random()*20;
   const r=this.random();this.collectiveState=r<.18?'milling':r<.30?'loose':'polarized';
   if(r<.12)this.guideTurn*=-1;
  }
  const gd=Math.hypot(this.guideX,this.guideZ);
  if(gd>this.radius*.72){
   const home=Math.atan2(-this.guideZ,-this.guideX);
   let diff=Math.atan2(Math.sin(home-this.guideHeading),Math.cos(home-this.guideHeading));
   this.guideTurn=clamp(this.guideTurn+diff*dt*.8,-.45,.45);
  }
  if(this.collectiveState==='milling')this.guideTurn=this.cruiseDirection*.30;
  this.guideHeading+=this.guideTurn*dt;
  const guideSpeed=speedLimit*(this.collectiveState==='loose'?.38:.62);
  this.guideX+=Math.cos(this.guideHeading)*guideSpeed*dt;
  this.guideZ+=Math.sin(this.guideHeading)*guideSpeed*dt;
  const routeX=this.guideX,routeZ=this.guideZ;
  const tangentX=Math.cos(this.guideHeading),tangentZ=Math.sin(this.guideHeading);
  this.depthModeTime-=dt;
  if(this.depthModeTime<=0){
   this.depthModeTime=7+this.random()*11;
   const roll=this.random();
   if(this.depthHold && roll<.22){this.depthMode='diving';this.targetDepth=-(3+this.random()*4);}
   else if(roll<.44){this.depthMode='ascending';this.targetDepth=-(.7+this.random()*1.8);}
   else {this.depthMode='cruising';this.targetDepth=-(1.2+this.random()*2.2);}
  }
  for(let i=0;i<n;i++){ 

   const k=i*3,x=p[k],y=p[k+1],z=p[k+2],vx=v[k],vy=v[k+1],vz=v[k+2];
   let sepX=0,sepY=0,sepZ=0,cohX=0,cohY=0,cohZ=0,aliX=0,aliY=0,aliZ=0,near=0;
   const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize);
   for(let gx=cx-1;gx<=cx+1;gx++)for(let gz=cz-1;gz<=cz+1;gz++){
    const cell=cells.get(gx+','+gz);if(!cell)continue;
    for(const j of cell){
     if(j===i)continue;this.neighborChecks++;
     const q=j*3,dx=p[q]-x,dy=p[q+1]-y,dz=p[q+2]-z,d2=dx*dx+dy*dy+dz*dz;
     if(d2<25 && d2>1e-6){near++;cohX+=p[q];cohY+=p[q+1];cohZ+=p[q+2];aliX+=v[q];aliY+=v[q+1];aliZ+=v[q+2];
      if(d2<2.25){const t=(1.5-Math.sqrt(d2))/Math.sqrt(d2);sepX-=dx*t;sepY-=dy*t;sepZ-=dz*t;}}
    }
   }
   let ax=sepX*1.4,ay=sepY*1.1,az=sepZ*1.4;
   if(near){
    // Polarization must overcome small avoidance corrections; the previous
    // alignment gain was too weak, allowing headings to cancel within seconds.
    const alignGain=this.alignment*2.2;
    ax+=(cohX/near-x)*this.cohesion+(aliX/near-vx)*alignGain;
    ay+=(cohY/near-y)*this.cohesion*.8+(aliY/near-vy)*alignGain*.55;
    az+=(cohZ/near-z)*this.cohesion+(aliZ/near-vz)*alignGain;
   }
   const d=Math.hypot(x,z);if(d>this.radius){const pull=(d-this.radius)*.24;ax-=x/d*pull;az-=z/d*pull;}
   // Low-frequency group intent biases—not dictates—local interactions.
   // Loose shoals weaken polarization; milling strengthens curved motion.
   const intent=this.collectiveState==='loose'?.22:this.collectiveState==='milling'?.42:.48;
   ax+=(routeX-x)*.022+(tangentX*speedLimit*.62-vx)*intent;
   az+=(routeZ-z)*.022+(tangentZ*speedLimit*.62-vz)*intent;
   // --- depth-keeping state machine: fish dive, ascend, hold depth ----------
   let depthAy=0;
   const depthErr=(this.targetDepth-y);
   if(this.depthMode==='diving')depthAy=clamp(depthErr*.10,-.22,.22);
   else if(this.depthMode==='ascending')depthAy=clamp(depthErr*.10,-.22,.22);
   else depthAy=-y*.05;                    // weak centre-plane hold while cruising
   ay+=depthAy;
   if(this.bottomActivity && this.activityState==='foraging'){
    const target=this.floor(c.x+x,c.z+z)+1.8;
    ay+=clamp((target-(c.y+y))*.13,-.25,.25);
   }
   // Approximate avoidance of nearby analytic cores. Outer ledges and
   // cavern roofs still need exact geometry checks and remain a QA caveat.
   for(const obstacle of this.obstacles){
    const wx=c.x+x,wy=c.y+y,wz=c.z+z;
    if(!obstacleMayBeNear(obstacle,wx,wy,wz,4))continue;
    const q=obstacleDistance(obstacle,wx,wy,wz,this._obstacleResult);
    if(q.dist<4){const force=Math.min(8,(4-q.dist)*.8);ax+=q.x*force;ay+=q.y*force;az+=q.z*force;}
   }
   if(player){const dx=c.x+x-player.x,dy=c.y+y-player.y,dz=c.z+z-player.z,dd=Math.hypot(dx,dy,dz);
     if(dd<7 && dd>.001){const push=(7-dd)*.42/dd;ax+=dx*push;ay+=dy*push;az+=dz*push;}}
   for(const threat of nearbyPredators){
     const dx=c.x+x-threat.x,dy=c.y+y-threat.y,dz=c.z+z-threat.z,dd=Math.hypot(dx,dy,dz);
     if(dd<15 && dd>.001){const push=(15-dd)*.62/dd;ax+=dx*push;ay+=dy*push*.65;az+=dz*push;}
   }
   // Momentum: blend the new steering with the carried heading so fish turn
   // in a sweeping arc rather than snapping. Stronger steering (predators,
   // obstacles) briefly overrides momentum for an escape dart.
   // Underwater current gently carries the school downstream.
   let nx=vx+ax*dt+this.currentX*dt,ny=clamp(vy+ay*dt,-.9,.9),nz=vz+az*dt+this.currentZ*dt;
   const steer=Math.hypot(ax,ay,az);const mt=this.momentum[i];
   const blend=Math.max(0,Math.min(1,1-mt*(0.45+0.25*Math.min(1,steer/6))));
   nx=vx*blend+nx*(1-blend);ny=vy*blend+ny*(1-blend);nz=vz*blend+nz*(1-blend);
   let speed=Math.hypot(nx,ny,nz);
   if(speed>speedLimit){let s=speedLimit/speed;nx*=s;ny*=s;nz*=s;speed=speedLimit;}
   // Maintain a natural cruise speed without injecting phase-random impulses.
   // The old boost and per-frame pulse made headings wobble and speeds surge.
   const cruise=Math.max(.35,speedLimit*.58);
   // Self-propelled speed regulation. Steering forces choose direction; they
   // must not accidentally cancel propulsion and leave fish hovering. Relax
   // toward cruise speed, or toward sprint speed during predator avoidance.
   const targetSpeed=nearbyPredators.length?speedLimit*.92:cruise;
   const regulated=speed+(targetSpeed-speed)*Math.min(1,dt*1.8);
   if(speed>1e-4){const q=regulated/speed;nx*=q;ny*=q;nz*=q;}
   else {nx=tangentX*regulated;ny=0;nz=tangentZ*regulated;}
   speed=regulated;
   // Biomechanical turn-rate limit: preserve the previous heading and rotate
   // toward the desired heading by at most ~60 deg/s (faster during escape).
   const oldH=Math.hypot(vx,vz),newH=Math.hypot(nx,nz);
   if(oldH>.08&&newH>.08){
    const oldA=Math.atan2(vz,vx),wantA=Math.atan2(nz,nx);
    const delta=Math.atan2(Math.sin(wantA-oldA),Math.cos(wantA-oldA));
    const maxTurn=(nearbyPredators.length?1.75:1.05)*dt;
    const a=oldA+clamp(delta,-maxTurn,maxTurn);
    nx=Math.cos(a)*newH;nz=Math.sin(a)*newH;
   }
   const ox=x+nx*dt,oz=z+nz*dt;let yAbs=c.y+y+ny*dt;
   const floor=this.floor(c.x+ox,c.z+oz)+this.clearance;
   const absCeil=Math.min(c.y+this.ceiling,-2.0);
   // A step is only valid if there is water between the seabed and the
   // ceiling. Otherwise the fish would be pushed below the bottom.
   if(floor>absCeil){nextP[k]=x;nextP[k+2]=z;nx=-vx*.6;nz=-vz*.6;yAbs=c.y+y;}
   else {nextP[k]=ox;nextP[k+2]=oz;}
   // Resample at the stored coordinates. Clamp first to the seabed, then to
   // the ceiling — but only when the seabed is above the ceiling.
   const safeFloor=this.floor(c.x+nextP[k],c.z+nextP[k+2])+this.clearance;
   if(yAbs<safeFloor){yAbs=safeFloor;ny=Math.abs(ny)*.3;}
   if(safeFloor<=absCeil && yAbs>absCeil){yAbs=absCeil;ny=-Math.abs(ny)*.3;}
   // Small pitch: fish nose slightly up when climbing and down when diving,
   // giving a readable swim attitude instead of a level bullet.
   // Refuse steps entering an analytic rock core; fish already inside may
   // still move outward. Mesh outlines and cavern roofs remain separate QA.
   for(const obstacle of this.obstacles){
    const wx=c.x+nextP[k],wz=c.z+nextP[k+2];
    if(!obstacleMayBeNear(obstacle,wx,yAbs,wz,.3))continue;
    const next=obstacleDistance(obstacle,wx,yAbs,wz,this._obstacleResult).dist;
    if(next<.3){
      const old=obstacleDistance(obstacle,c.x+x,c.y+y,c.z+z,this._obstacleResult).dist;
      if(next<old){nextP[k]=x;nextP[k+2]=z;yAbs=c.y+y;nx=-vx*.4;ny=-vy*.4;nz=-vz*.4;break;}
    }
   }
   // Pitch is derived visually from velocity in the vertex shader. Never add
   // pitch back into velocity: that positive-feedback bug amplified vertical
   // speed every frame until fish dove/climbed almost vertically.
   nextP[k+1]=yAbs-c.y;nextV[k]=nx;nextV[k+1]=ny;nextV[k+2]=nz;
   // Never allow a bad terrain/obstacle result to enter the persistent arrays.
   // One non-finite coordinate can poison the school and stall software GL.
   if(!Number.isFinite(nextP[k])||!Number.isFinite(nextP[k+1])||!Number.isFinite(nextP[k+2])||
      !Number.isFinite(nextV[k])||!Number.isFinite(nextV[k+1])||!Number.isFinite(nextV[k+2])){
    nextP[k]=Number.isFinite(x)?x:0;nextP[k+1]=Number.isFinite(y)?y:0;nextP[k+2]=Number.isFinite(z)?z:0;
    nextV[k]=0;nextV[k+1]=0;nextV[k+2]=0;
   }
  }
  p.set(nextP);v.set(nextV);
 }

 // --- LOD-aware simulation entry point ---------------------------------------
 // tier: SIM_TIER.NEAR | MEDIUM | FAR | OFF
 // aiCost: 0..1 fraction of full AI budget to consume
 lodStep(dt, tier, aiCost, camera) {
  // Always advance simulation time so creatures never appear frozen.
  this.time += dt;

  if (tier === SIM_TIER.OFF) {
   // Off-screen: maintain state, no per-frame movement. Just age the school.
   return;
  }

  // Far: minimal AI — just drift and maintain home range, no neighbor queries.
  if (tier === SIM_TIER.FAR) {
   this._farStep(dt);
   return;
  }

  // Medium: reduced AI cost — skip predator checks, fewer obstacle queries.
  if (tier === SIM_TIER.MEDIUM) {
   this._mediumStep(dt, aiCost, camera);
   return;
  }

  // Near: full simulation.
  this.step(dt, camera, []);
 }

 // Minimal far-distance update: gentle drift toward centre, no boid math.
 _farStep(dt) {
  const p=this.positions,v=this.velocities,c=this.center,n=this.count;
  const speedLimit=this.maxSpeed*0.25;
  for(let i=0;i<n;i++){
   const k=i*3,x=p[k],y=p[k+1],z=p[k+2];
   // Gentle pull toward home centre
   const dx=-x,dz=-z,d=Math.hypot(dx,dz);
   if(d>0.1){
    const pull=Math.min(0.05*dt,d);
    v[k]+=(dx/d)*pull;v[k+2]+=(dz/d)*pull;
   }
   // Weak vertical drift
   v[k+1]+=Math.sin(this.time*0.5+i)*0.01*dt;
   let speed=Math.hypot(v[k],v[k+1],v[k+2]);
   if(speed>speedLimit){const s=speedLimit/speed;v[k]*=s;v[k+1]*=s;v[k+2]*=s;}
   // Integrate
   const nx=x+v[k]*dt,ny=y+v[k+1]*dt,nz=z+v[k+2]*dt;
   const floor=this.floor(c.x+nx,c.z+nz)+this.clearance;
   const ceil=Math.min(c.y+this.ceiling,-2.0);
   if(floor>ceil){v[k]*=-0.5;v[k+2]*=-0.5;}
   else {
    p[k]=nx;p[k+2]=nz;
    p[k+1]=clamp(ny,Math.min(floor,ceil),ceil)-c.y;
   }
  }
 }

 // Medium-distance update: reduced AI, skip predator/obstacle complexity.
 _mediumStep(dt, aiCost, camera) {
  const predators = []; // skip predator checks at medium tier
  // Run full step but with reduced cost: skip player avoidance, limit obstacles
  const origObstacles = this.obstacles;
  this.obstacles = aiCost > 0.3 ? origObstacles : [];
  this.step(dt, camera, predators);
  this.obstacles = origObstacles;
 }

 getCenter(){return this.center;}
 getRadius(){return this.radius;}
}
