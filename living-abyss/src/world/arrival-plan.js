// Preserve the existing portal sites and gate network. Two arrivals are offset
// sideways into clear water because the straight-ahead pose looked directly at
// a near rock face; their headings still follow the authored destination axis.
// These are composed arrival poses, not a certificate of an unobstructed route.
export function planArrival(portal,field=null){
 const {loc}=portal,dx=loc.x-portal.x,dz=loc.z-portal.z,d=Math.hypot(dx,dz)||1;
 const ux=dx/d,uz=dz/d,side=portal.id==='roseglass'||portal.id==='aurel'?28:0;
 const x=portal.x+ux*30-uz*side,z=portal.z+uz*30+ux*side;
 // Approach reef and basin at swimming height, not far above the organisms.
 const groundOffset=portal.id==='roseglass'?4.2:portal.id==='abyssalbowl'?5.5:null;
 let y;
 if(groundOffset!==null && field){
   const h=field.surfaceHeightAt(x,z);
   y=Math.min(-4,(isFinite(h)?h:portal.centreY)+groundOffset);
 } else {
   y=portal.centreY+2;
 }
 // Fallback: never teleport to NaN or out-of-bounds coordinates.
 if(!isFinite(x)||!isFinite(y)||!isFinite(z)){x=portal.x;y=portal.centreY;z=portal.z;}
 const pitch=portal.id==='roseglass'?-.16:portal.id==='abyssalbowl'?-.12:-.02;
 return {x,y,z,yaw:Math.atan2(-ux,-uz),pitch};
}
