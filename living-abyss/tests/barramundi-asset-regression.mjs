// Structural check of locally generated glTF, not a visual or ecology test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=new URL('../assets/models/barramundi/barramundi_swim.glb',import.meta.url);
const data=fs.readFileSync(path);
assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(4),2);
assert.equal(data.readUInt32LE(8),data.length);
const size=data.readUInt32LE(12),j=JSON.parse(data.toString('utf8',20,20+size));
assert.equal(j.skins.length,1);assert.equal(j.skins[0].joints.length,6);
assert.equal(j.animations.length,1);assert(j.animations[0].channels.length>=6);
const primitive=j.meshes[0].primitives[0];
for(const key of ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])assert(key in primitive.attributes,key);
assert.equal(j.images.length,3);assert(j.accessors[primitive.indices].count>=11000);
console.log('PASS: textured barramundi GLB: six-joint skin, animation, weighted vertices, three embedded maps. Visual quality and habitat are not proven by this test.');
