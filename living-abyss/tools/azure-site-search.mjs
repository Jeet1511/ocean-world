// Candidate search for a visibly accessible Azure gate; offline diagnostic.
import * as THREE from '../vendor/three.module.js';import {TerrainField,LOCATIONS,WORLD} from '../src/world/geography.js';import {SwimController} from '../src/player/controller.js';import {buildGeology} from '../src/world/geology.js';import {buildCaverns} from '../src/world/caverns.js';
const f=new TerrainField().build(),c=new SwimController(f);buildGeology(f,c);buildCaverns(f,c);const L=LOCATIONS.find(x=>x.id==='azurespan');
const results=[];
for(let x=-760;x<=-180;x+=8)for(let z=-620;z<=-80;z+=8){
 const d=Math.hypot(x-L.x,z-L.z);if(d<100||d>240||x<WORLD.minX+40||x>WORLD.maxX-40||z<WORLD.minZ+40||z>WORLD.maxZ-40)continue;
 const y=f.surfaceHeightAt(x,z),cy=y+9;if(cy>L.depth[0]+40||cy<L.depth[1]-40||f.steepness(x,z)>.27)continue;
 let spread=0,low=Infinity,high=-Infinity;
 for(const rad of [4,8,12])for(let i=0;i<12;i++){const a=i*Math.PI/6,h=f.surfaceHeightAt(x+Math.cos(a)*rad,z+Math.sin(a)*rad);low=Math.min(low,h);high=Math.max(high,h);}
 spread=high-low;if(spread>3)continue;
 if(c.surfaceSolids.some(s=>{const b=s.bounds;return x+13>b.min.x&&x-13<b.max.x&&z+13>b.min.z&&z-13<b.max.z&&cy+10>b.min.y&&cy-10<b.max.y;}))continue;
 const ux=(L.x-x)/d,uz=(L.z-z)/d;
 let lineClear=true,minLine=Infinity,maxObstacle=0;
 for(const side of [-1,1])for(let t=1;t<=40;t+=2){
  const xx=x+ux*t*side,zz=z+uz*t*side,yy=cy+2,clear=yy-f.surfaceHeightAt(xx,zz);
  minLine=Math.min(minLine,clear);if(clear<2){lineClear=false;break;}
  if(c.surfaceSolids.some(s=>{const b=s.bounds;return xx+1.3>b.min.x&&xx-1.3<b.max.x&&zz+1.3>b.min.z&&zz-1.3<b.max.z&&yy+1.3>b.min.y&&yy-1.3<b.max.y;}))maxObstacle++;
 }
 if(!lineClear)continue;
 const score=Math.abs(d-170)*.1+spread*2+maxObstacle*3+Math.abs(cy+180)*.03;
 results.push({x,z,floor:y,cy,d,spread,minLine,obstacles:maxObstacle,arrival:[x+ux*30,cy+2,z+uz*30],score});
}
results.sort((a,b)=>a.score-b.score);console.log('CANDIDATES',results.length);console.log(JSON.stringify(results.slice(0,35),null,2));
