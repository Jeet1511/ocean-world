// Browser check: culling preserves all shell matrices and restores them when
// the viewer comes back; not a target-device performance benchmark.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 const r=await p.evaluate(()=>{
  const group=window.ABYSS.scene.getObjectByName('shallow_photogrammetry_shells');
  const pos=window.ABYSS.camera.position,copy=pos.clone();
  const all=group.children.reduce((n,t)=>n+t.count,0),total=group.userData.placements.length;
  pos.set(10000,0,10000);group.userData.update(window.ABYSS.camera,'low');const far=group.children.filter(t=>t.visible).length;
  const q=group.userData.placements[0];pos.set(q.x,q.y+3,q.z);group.userData.update(window.ABYSS.camera,'low');
  const near=group.children.filter(t=>t.visible).length;
  const restored=group.children.reduce((n,t)=>n+t.count,0),bounded=group.children.every(t=>t.frustumCulled&&t.boundingSphere&&t.boundingSphere.radius>0);
  pos.copy(copy);group.userData.update(window.ABYSS.camera,'low');return {all,total,far,near,restored,bounded,tiles:group.children.length};
 });
 assert.equal(r.all,90);assert.equal(r.total,90);assert.equal(r.restored,90);assert.equal(r.far,0);assert(r.near>0&&r.near<r.tiles);assert(r.bounded);
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);console.log('PASS: 90 original shallow shells in bounded distance/frustum tiles, cull at distance and reappear nearby:',JSON.stringify(r));
}finally{await b.close()}
