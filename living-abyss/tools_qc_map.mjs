import { TerrainField, WORLD, REGIONS, CANYONS, CHAMBERS } from './src/world/geography.js';
import fs from 'fs';
const t0 = Date.now();
const f = new TerrainField().build();
console.log('grid', f.vx, 'x', f.vz, '=', (f.vx*f.vz/1e6).toFixed(2)+'M verts', 'build ms', (Date.now()-t0), 'minY', f.minY.toFixed(1), 'maxY', f.maxY.toFixed(1));
// raw dump for python rendering
const buf = Buffer.alloc(f.heights.length*4);
for (let i=0;i<f.heights.length;i++) buf.writeFloatLE(f.heights[i], i*4);
fs.writeFileSync('/tmp/heights.bin', buf);
fs.writeFileSync('/tmp/meta.json', JSON.stringify({vx:f.vx, vz:f.vz, cell:f.cell, minX:WORLD.minX, minZ:WORLD.minZ, minY:f.minY, maxY:f.maxY}));
