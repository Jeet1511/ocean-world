import assert from 'node:assert/strict';
import { TerrainField, LOCATIONS, WORLD, macroHeight } from '../src/world/geography.js?rev=09';
import { SwimController } from '../src/player/controller.js?rev=09';
import { buildGeology } from '../src/world/geology.js?rev=09';
import { buildCaverns } from '../src/world/caverns.js?rev=09';
import { buildPortals } from '../src/world/portals.js?rev=09';
import { buildAtmosphere } from '../src/world/atmosphere.js?rev=09';
const f = new TerrainField().build();
// The two previously measured worst seam regions must not make an almost
// vertical multi-hundred-metre jump in a single 4 m terrain cell.
for(const [x,z] of [[0,-512],[-868,-380]]){
  const diff=Math.abs(f.surfaceHeightAt(x,z)-f.surfaceHeightAt(x,z+4));
  assert(diff<65, `terrain seam at ${x},${z}: ${diff}`);
  const fine=Math.abs(macroHeight(x,z)-macroHeight(x,z+.01));
  assert(fine<1, `macro height has a discontinuity at ${x},${z}: ${fine}`);
}
for(const l of LOCATIONS){
 const y=f.heightAt(l.x,l.z);
 assert(y<=l.depth[0]+6 && y>=l.depth[1]-8, `${l.id} retains its original authored depth`);
}
const c=new SwimController(f),geo=buildGeology(f,c),caves=buildCaverns(f,c);
assert(geo.userData.stats.bommies<450 && geo.userData.stats.bommies>200, 'rock reduction retains substantial geology');
const portals=buildPortals(f,c.colliders,c.surfaceSolids).userData.portals;
for(const p of portals){
 assert(p.clearanceVerified,`${p.id} requires a verified portal site`);
 assert(p.x>WORLD.minX+27 && p.x<WORLD.maxX-27 && p.z>WORLD.minZ+27 && p.z<WORLD.maxZ-27,`${p.id} must stay inside the world`);
 assert(p.centreY<=p.loc.depth[0]+40 && p.centreY>=p.loc.depth[1]-40,`${p.id} must stay near its destination depth`);
}
const atm=buildAtmosphere(f,{quality:'low'},c.colliders,null,portals);
const schools=atm.group.children.filter(o=>o.name==='fish_school');
for(const p of portals){
 const wantX=p.x*.55+p.loc.x*.45,wantZ=p.z*.55+p.loc.z*.45;
 assert(schools.some(s=>s.userData.habitat===p.id && Math.hypot(s.userData.simulation.center.x-wantX,s.userData.simulation.center.z-wantZ)<1e-4),`${p.id} needs a school along its arrival sightline`);
}
assert.equal(schools.length,17,'preserve existing schools');
for(const roof of caves.children.filter(o=>o.name.startsWith('vault_'))){
 const p=roof.geometry.attributes.position;assert(p && p.count>2000);
 assert(c.roofs.includes(roof),'new visible cave roof remains a collision roof');
}
console.log(`PASS: targeted terrain seams, seven depth-bounded gates, ${geo.userData.stats.bommies} bommies, seven entrance-school anchors and visible roof collision.`);
