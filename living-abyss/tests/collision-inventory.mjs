// Offline audit of actual active collision definitions. Bounding-box checks
// identify candidates, not proof of exact mesh correspondence or route safety.
import fs from 'node:fs';
import {TerrainField, LOCATIONS, WORLD} from '../src/world/geography.js';
import {SwimController} from '../src/player/controller.js';
import {buildGeology} from '../src/world/geology.js';
import {buildCaverns} from '../src/world/caverns.js';
import {buildPortals} from '../src/world/portals.js';
const field=new TerrainField().build(), controller=new SwimController(field);
buildGeology(field,controller); const caves=buildCaverns(field,controller), portals=buildPortals(field,controller.colliders);
const gates=portals.userData.portals;
// Match the application's current aperture filtering exactly.
controller.colliders=controller.colliders.filter(c=>!gates.some(g=>{
 const d=Math.hypot(c.x-g.x,c.z-g.z);
 if(c.type==='cyl')return d<c.r+g.radius+6 && g.centreY>c.yBase-8 && g.centreY<c.yTop+8;
 if(c.type==='ell')return d<c.rx+g.radius+6;
 return false;
}));
const bbox=c=>c.type==='cyl'?{min:[c.x-c.r,c.yBase,c.z-c.r],max:[c.x+c.r,c.yTop,c.z+c.r]}:
 c.type==='ell'?{min:[c.x-c.rx,c.y-c.ry,c.z-c.rz],max:[c.x+c.rx,c.y+c.ry,c.z+c.rz]}:
 {min:[Math.min(c.x1,c.x2)-c.r,Math.min(c.y1,c.y2)-c.r,Math.min(c.z1,c.z2)-c.r],max:[Math.max(c.x1,c.x2)+c.r,Math.max(c.y1,c.y2)+c.r,Math.max(c.z1,c.z2)+c.r]};
const rows=[], duplicates=[], seen=new Map();
for(const c of controller.colliders){
 const b=bbox(c), centre=b.min.map((x,i)=>(x+b.max[i])/2);
 const nearest=LOCATIONS.reduce((a,l)=>Math.hypot(l.x-centre[0],l.z-centre[2])<Math.hypot(a.x-centre[0],a.z-centre[2])?l:a,LOCATIONS[0]);
 let maxOverhang=null;
 if(c.visualBounds)maxOverhang=Math.max(...b.min.map((v,i)=>c.visualBounds.min[i]-v),...b.max.map((v,i)=>v-c.visualBounds.max[i]),0);
 const signature=JSON.stringify([c.type,...b.min.map(x=>+x.toFixed(4)),...b.max.map(x=>+x.toFixed(4))]);
 if(seen.has(signature))duplicates.push([seen.get(signature),c.debugId]);else seen.set(signature,c.debugId);
 rows.push({id:c.debugId,source:c.source||null,type:c.type,location:nearest.name,centre:centre.map(x=>+x.toFixed(2)),bounds:{min:b.min.map(x=>+x.toFixed(2)),max:b.max.map(x=>+x.toFixed(2))},visualBounds:c.visualBounds||null,maxAabbOverhang:maxOverhang===null?null:+maxOverhang.toFixed(2)});
}
let max=0,worst=null, sum=0,n=0;
for(let z=WORLD.minZ;z<WORLD.maxZ;z+=16)for(let x=WORLD.minX;x<WORLD.maxX;x+=16){
 const xx=x+2,zz=z+2,delta=Math.abs(field.heightAt(xx,zz)-field.surfaceHeightAt(xx,zz));
 if(delta>max){max=delta;worst=[xx,zz]}sum+=delta;n++;
}
const missing=rows.filter(r=>!r.source||!r.visualBounds), over=rows.filter(r=>r.maxAabbOverhang>2);
const audit={generated:new Date().toISOString(),world:WORLD,activeColliders:rows.length,counts:rows.reduce((a,c)=>(a[c.type]=(a[c.type]||0)+1,a),{}),roofs:controller.roofs.map(o=>({name:o.name,visible:o.visible,triangles:o.geometry.index.count/3})),portalTriggers:gates.map(g=>({id:g.id,centre:[g.x,g.centreY,g.z],horizontalRadius:g.radius*1.55,verticalHalfHeight:g.radius*1.5})),missingProvenance:missing.map(r=>r.id),aabbOverhangCandidates:over.map(r=>({id:r.id,source:r.source,location:r.location,centre:r.centre,metres:r.maxAabbOverhang})),exactDuplicateBounds:duplicates,terrainInterpolation:{gridSamples:n,meanDifference:+(sum/n).toFixed(3),maxDifference:+max.toFixed(3),worstPosition:worst},limitations:['Bounds overlap is a broad-phase candidate, not a mesh-to-collider fit test.','Nearby colliders may legitimately overlap; only exact duplicate bounds are flagged.','Not an exhaustive test of passages, caves, arches, all visible geometry, or dolphin clearance.','Only controller collision sources are listed; debug picking does not participate in movement.'],colliders:rows};
fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/collision_inventory.json',JSON.stringify(audit,null,2));
console.log('Active colliders',rows.length,JSON.stringify(audit.counts),'roofs',audit.roofs.length,'triggers',gates.length);
console.log('Missing provenance',missing.length,'AABB overhang candidates >2m',over.length,'exact duplicate bounds',duplicates.length);
console.log('Terrain bilinear-vs-rendered mismatch',JSON.stringify(audit.terrainInterpolation));
console.log('Wrote docs/collision_inventory.json');
