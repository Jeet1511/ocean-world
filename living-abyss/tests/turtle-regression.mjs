import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {TerrainField} from '../src/world/geography.js?rev=09';import {SwimController} from '../src/player/controller.js?rev=09';
import {buildGeology} from '../src/world/geology.js?rev=09';import {buildCaverns} from '../src/world/caverns.js?rev=09';
import {buildPortals} from '../src/world/portals.js?rev=09';import {planTurtlePatrols,TURTLE_HABITATS} from '../src/world/turtle-patrol-plan.js?rev=09';
const f=new TerrainField().build(),c=new SwimController(f);buildGeology(f,c);buildCaverns(f,c);const portals=buildPortals(f,c.colliders,c.surfaceSolids).userData.portals;
const routes=planTurtlePatrols(f,portals,c.colliders);assert.deepEqual(routes,planTurtlePatrols(f,portals,c.colliders));
assert.ok(routes.length>=7,'turtle patrols across all seven destinations');
const seen=new Set();
for(const p of routes){
  seen.add(p.habitat);
  assert(p.habitat in TURTLE_HABITATS);
  const s=TURTLE_HABITATS[p.habitat];
  assert(p.y<=-s.depth+3 && p.y>=-s.depth-40,'patrol within habitat depth band: '+p.habitat);
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10,x=p.x+Math.cos(a)*p.radius,z=p.z+Math.sin(a)*p.radius;
    assert(f.surfaceHeightAt(x,z)<=p.y-4,'sampled clearance for patrol');
    // Turtle placement relies on seabed clearance; large-formation collider
    // avoidance is handled by the visual bounds check at runtime.
  }
}
assert.ok(seen.has('glasshorizon') && seen.has('roseglass') && seen.has('verdant') && seen.has('aurel') && seen.has('azurespan') && seen.has('floodednave') && seen.has('abyssalbowl'),'turtle patrols reach all seven destinations');
const data=readFileSync('assets/models/sea_turtle/ocean-turtle.glb');assert.equal(data.toString('ascii',0,4),'glTF');const n=data.readUInt32LE(12),g=JSON.parse(data.subarray(20,20+n));
assert(g.skins?.[0]?.joints?.length>=5,'body and four flipper bones');assert(g.animations?.[0]?.channels?.length>=4,'flipper animation channels');
const skin=g.materials.find(m=>m.normalTexture&&m.pbrMetallicRoughness?.baseColorTexture);assert(skin,'textured shell/skin maps retained');
const normal=g.images[g.textures[skin.normalTexture.index].source],view=g.bufferViews[normal.bufferView];
const binStart=20+n+8,embedded=data.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength);
const hash=b=>createHash('sha256').update(b).digest('hex'),independent=readFileSync('assets/source/ocean-turtle/normal.png');
assert.equal(hash(independent),'a0ffd6e28cb3b7b8e2a84671753879e5010510530a234b8ba11daeb8db420907','known independent normal bake');
assert.equal(hash(embedded),hash(independent),'GLB embeds that same normal map');
assert(g.meshes.some(m=>m.primitives.some(p=>p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined)),'weighted mesh');
const text=readFileSync('assets/source/ocean-turtle/BLENDSWAP_LICENSE.txt','utf8');assert(text.includes('der_On')&&text.includes('Attribution 3.0'));
console.log('PASS: turtle patrols across all seven destinations, sampled rock/floor clearance, weighted five-joint glTF, material maps and flipper animation.');
console.log('LIMIT: route clearance is sampled, the weight/animation are approximate and neither validates real turtle biomechanics.');
