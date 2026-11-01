// The high-quality rock shader only uses crack distances <0.16. Compare the
// original 27-cell search with the conservative bounded search over many
// deterministic coordinates, including negative world positions.
import assert from 'node:assert/strict';
const fract=x=>x-Math.floor(x),smooth=x=>{x=Math.max(0,Math.min(1,x/.16));return x*x*(3-2*x);};
function hash(x,y,z){x=fract(x*.1031);y=fract(y*.1031);z=fract(z*.1031);let d=x*(z+31.32)+y*(y+31.32)+z*(x+31.32);x+=d;y+=d;z+=d;return fract((x+y)*z);}
function mask(qx,qy,qz,bounded){
 const ix=Math.floor(qx),iy=Math.floor(qy),iz=Math.floor(qz),fx=fract(qx),fy=fract(qy),fz=fract(qz);let best=bounded?.0256:8,hashed=0;
 for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
  if(bounded){const ax=Math.max(x-fx,fx-(x+1),0),ay=Math.max(y-fy,fy-(y+1),0),az=Math.max(z-fz,fz-(z+1),0);
   if(ax*ax+ay*ay+az*az>best+.00001)continue;}
  hashed++;
  const px=ix+x,py=iy+y,pz=iz+z;
  const dx=x+hash(px,py,pz)-fx,dy=y+hash(px+7.1,py+7.1,pz+7.1)-fy,dz=z+hash(px+13.7,py+13.7,pz+13.7)-fz;
  best=Math.min(best,dx*dx+dy*dy+dz*dz);
 }
 return {mask:bounded&&best>=.0256?0:1-smooth(Math.sqrt(best)),hashed};
}
let seed=2416809,total=0,hit=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<50000;i++){
 const x=(random()-.5)*500,y=(random()-.5)*500,z=(random()-.5)*500,a=mask(x,y,z,false),b=mask(x,y,z,true);
 assert(Math.abs(a.mask-b.mask)<1e-12,`crack mismatch at ${x},${y},${z}`);total+=b.hashed;if(b.mask>0)hit++;
}
assert(hit>0,'exercise actual cracks, not just empty cells');
console.log(`PASS: 50,000 exact crack masks, including ${hit} crack hits; bounded search hashes ${(total/50000).toFixed(2)} cells on average instead of 27.`);
console.log('LIMIT: equivalent values/operation counts do not establish GPU frame-time gains.');
