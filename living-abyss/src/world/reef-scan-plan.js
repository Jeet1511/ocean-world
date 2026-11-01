// Small authored colonies using modified Smithsonian CC0 specimen scans.
// This is a composition plan, not an ecological census. The scan geometry is
// of dry specimens and its runtime colour is an artistic living-reef treatment.
import { mulberry32 } from '../core/noise.js?rev=37';
import { planArrival } from './arrival-plan.js?rev=37';

export function planScanColonies(field,portals,colliders=[]){
 const rng=mulberry32(664329),out=[],sites=[];
 const blocked=(x,y,z,margin=1)=>colliders.some(c=>{
  const b=c.visualBounds;
  return b && x>b.min[0]-margin&&x<b.max[0]+margin&&y>b.min[1]-margin&&y<b.max[1]+margin&&z>b.min[2]-margin&&z<b.max[2]+margin;
 });
 const regions=[
  // Photogrammetry is triangle-heavy even when instanced. Keep a small number
  // of large authored hero colonies instead of submitting hundreds of scan
  // instances when a destination becomes visible.
  {id:'roseglass',depth:[8,52],centres:[[18,-14],[24,16],[38,-24],[44,23],[59,-16],[67,18],[84,-27],[96,27],[112,-16],[122,18]],per:6},
  {id:'glasshorizon',depth:[6,40],centres:[[30,-17],[42,19],[58,-23],[70,23],[88,-18],[104,20]],per:5},
  {id:'abyssalbowl',depth:[400,700],centres:[[25,-11],[38,14],[52,-15],[67,12],[14,12],[26,18],[38,18],[8,-8]],per:5},
 ];
 for(const region of regions){
  const gate=portals.find(p=>p.id===region.id);if(!gate)continue;
  const pose=planArrival(gate,field),ux=-Math.sin(pose.yaw),uz=-Math.cos(pose.yaw);
  for(let ci=0;ci<region.centres.length;ci++){
   const [forward,side]=region.centres[ci],cx=pose.x+ux*forward-uz*side,cz=pose.z+uz*forward+ux*side;
   const before=out.length;
   for(let k=0;k<region.per;k++){
    const a=rng()*Math.PI*2,r=Math.sqrt(rng())*4.0;
    const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=field.surfaceHeightAt(x,z),depth=-y;
    // Broad geological collider boxes cover entire irregular formations and
    // formerly rejected nearly every deep colony. Benthic scans are non-solid;
    // allow them near geology, while keeping the player approach corridor open.
    if(depth<region.depth[0]||depth>region.depth[1]||field.steepness(x,z)>.46)continue;
    // The approach centre remains open; clusters occur to either side of it.
    const across=-(x-pose.x)*uz+(z-pose.z)*ux;if(Math.abs(across)<5.0)continue;
    let kind;
    if(region.id==='abyssalbowl')kind='deep';
    else {
      // The expensive 18k-triangle plate scan is a rare focal specimen.
      const choices=['branching','boulder','foliose','staghorn','branching','boulder','foliose','staghorn','table'];
      kind=choices[(ci*region.per+k)%choices.length];
      if(kind==='table' && (ci%2 || region.id==='glasshorizon'))kind='foliose';
    }
    const size=region.id==='abyssalbowl' ? 1.0+rng()*1.0 : kind==='table'?1.9+rng()*1.0: 1.35+rng()*1.65;
    out.push({habitat:region.id,kind,x,y:y-.04,z,scale:size,rotation:rng()*Math.PI*2,tint:Math.floor(rng()*5)});
   }
   if(out.length>before)sites.push({habitat:region.id,x:cx,z:cz,count:out.length-before});
  }
 }
 return {placements:out,sites};
}
