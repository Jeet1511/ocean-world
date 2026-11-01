import { TerrainField, REGIONS, LANDMARKS, CHAMBERS, CANYONS } from './src/world/geography.js';
const f = new TerrainField().build();
console.log('=== depth at region anchors ===');
for (const r of REGIONS) console.log(r.id.padEnd(11), '(', r.anchor[0], ',', r.anchor[1], ')  ->', f.heightAt(r.anchor[0],r.anchor[1]).toFixed(0), '  design', r.depth.join('..'));
console.log('\n=== depth grid (rows z=1800..-1800 step 300; cols x=-2400..2400 step 400) ===');
let hdr = '      ';
for (let x=-2400;x<=2400;x+=400) hdr += String(x).padStart(7);
console.log(hdr);
for (let z=1800; z>=-1800; z-=300){
  let row = String(z).padStart(6);
  for (let x=-2400;x<=2400;x+=400) row += f.heightAt(x,z).toFixed(0).padStart(7);
  console.log(row);
}
console.log('\n=== chamber floors ===');
for (const c of CHAMBERS) console.log(c.name.padEnd(22), f.heightAt(c.x,c.z).toFixed(0));
