// A/B verification in the same paused game/camera: original full instance
// submissions versus conservative frustum-compacted submissions. Images can
// be pixel-compared; software WebGL timings do not represent target FPS.
import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/performance/frustum-ab';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const nextRendered=()=>page.evaluate(()=>new Promise(r=>{const n=window.ABYSS.renderer.info.render.frame;function check(){if(window.ABYSS.renderer.info.render.frame>n)r();else requestAnimationFrame(check);}requestAnimationFrame(check);}));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY === true',{timeout:300000});
 await page.evaluate(()=>window.ABYSS.state.paused=true);await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const results=[];
 for(const [id,q] of [['roseglass','low'],['roseglass','high'],['verdant','low'],['glasshorizon','low']]){
  await page.evaluate(async ([id,q])=>{const a=window.ABYSS;a.quality(q);await a.travel(id);for(const name of ['flora','geology'])a.scene.getObjectByName(name).userData.setInstanceCulling(false);for(const o of a.scene.getObjectByName('atmosphere').children)if(o.userData.simulation)o.traverse(x=>{if(x.isInstancedMesh)x.frustumCulled=false;});},[id,q]);
  await nextRendered();await page.screenshot({path:`${out}/${id}-${q}-full.png`,timeout:180000});
  const before=await page.evaluate(()=>({frame:window.ABYSS.frame(),inventory:window.ABYSS.renderInventory()}));
  await page.evaluate(()=>{const a=window.ABYSS;for(const name of ['flora','geology'])a.scene.getObjectByName(name).userData.setInstanceCulling(true);for(const o of a.scene.getObjectByName('atmosphere').children)if(o.userData.simulation)o.traverse(x=>{if(x.isInstancedMesh)x.frustumCulled=true;});});await nextRendered();
  await page.screenshot({path:`${out}/${id}-${q}-culled.png`,timeout:180000});
  const after=await page.evaluate(()=>({frame:window.ABYSS.frame(),inventory:window.ABYSS.renderInventory()}));
  assert(after.inventory.bySystem.flora<=before.inventory.bySystem.flora,'frustum compaction must not submit more flora');
  assert(after.inventory.bySystem.geology<=before.inventory.bySystem.geology,'frustum compaction must not submit more geology');
  assert(after.inventory.bySystem.atmosphere<=before.inventory.bySystem.atmosphere,'school frustum culling must not submit more fish');
  results.push({id,quality:q,before,after});console.log(id,q,'flora',before.inventory.bySystem.flora,'->',after.inventory.bySystem.flora,'geology',before.inventory.bySystem.geology,'->',after.inventory.bySystem.geology,'atmosphere',before.inventory.bySystem.atmosphere,'->',after.inventory.bySystem.atmosphere,'total',before.frame.tris,'->',after.frame.tris,'draws',before.frame.calls,'->',after.frame.calls);
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
