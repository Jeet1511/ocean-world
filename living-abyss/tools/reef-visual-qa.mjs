// Focused in-browser checks of scan loading, composition and low-quality cost.
// SwiftShader captures and triangle submissions are not target-device FPS tests.
// Optional QA dependency: use a local Playwright install, with the sandbox fallback.
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/reef-detail';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:400,height:225}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 await page.evaluate(()=>Promise.all([window.ABYSS.preload('roseglass'),window.ABYSS.preload('abyssalbowl')]));
 const scans=await page.evaluate(()=>window.ABYSS.ecosystem().scannedCorals);
 assert.equal(scans.loaded.length,6);assert(scans.counts.roseglass>=45);assert(scans.counts.abyssalbowl>0);
 await page.evaluate(()=>window.ABYSS.travel('roseglass'));await frames();
 const data=await page.evaluate(async()=>{
  const api=window.ABYSS, inv=api.renderInventory(),scene=api.scene,camera=api.camera,T=await import('/vendor/three.module.js');
  const matrix=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse), frustum=new T.Frustum().setFromProjectionMatrix(matrix),categories={};
  scene.traverse(o=>{if(!o.isInstancedMesh||!o.visible||!o.userData.species||!frustum.intersectsObject(o))return;
   const n=o.userData.species,key=n.startsWith('kelp_')?'kelp':n.includes('branching')?'branching':n.startsWith('coral_')?'other-coral':n.startsWith('feature_')?'feature':'other';
   const g=o.geometry,tri=(g.index?g.index.count:g.attributes.position.count)/3*o.count;categories[key]=(categories[key]||0)+tri;
  });
  return {frame:api.frame(),inventory:inv,categories};
 });
 await page.screenshot({path:`${out}/arrival.png`,timeout:120000});
 // Same camera, same low-quality instance counts, same shader: temporarily
 // compare the full branch/kelp meshes against the actual low-poly meshes.
 // This isolates submitted geometry; it is not a GPU timing benchmark.
 await page.evaluate(()=>{const a=window.ABYSS;a.state.paused=true;
  for(const o of a.scene.getObjectByName('flora').children)if(o.userData.fullGeometry)o.geometry=o.userData.fullGeometry;});await frames();
 const fullGeometry=await page.evaluate(()=>({frame:window.ABYSS.frame(),flora:window.ABYSS.renderInventory().bySystem.flora}));
 await page.evaluate(()=>{const a=window.ABYSS;
  for(const o of a.scene.getObjectByName('flora').children)if(o.userData.lowGeometry)o.geometry=o.userData.lowGeometry;a.state.paused=false;});await frames();
 const lowGeometry=await page.evaluate(()=>({frame:window.ABYSS.frame(),flora:window.ABYSS.renderInventory().bySystem.flora}));
 assert(fullGeometry.flora>lowGeometry.flora,'full geometry must cost more at identical instance counts');
 // A second, local view of the authored scan patch. This is a photo position,
 // not a claim that a full swimming route to it has been certified.
 await page.evaluate(()=>{const a=window.ABYSS;a.teleport(-479,-18.8,405);a.lookAt(-490,-20.6,395);});await frames();
 await page.screenshot({path:`${out}/scan-patch.png`,timeout:120000});
 await page.evaluate(()=>{const a=window.ABYSS;a.teleport(-485.5,-20.8,402.5,0,0);a.lookAt(-489,-21.6,397);});await frames();
 await page.screenshot({path:`${out}/scan-close-native.png`,timeout:120000});
 // Debug-only isolated view confirms the real scan geometry is present; the
 // preceding image is the unmodified in-game view, not an isolated showcase.
 await page.evaluate(()=>{window.ABYSS.scene.getObjectByName('flora').visible=false;});await frames();
 await page.screenshot({path:`${out}/scan-close-isolated.png`,timeout:120000});
 await page.evaluate(()=>{const a=window.ABYSS;a.scene.getObjectByName('flora').visible=true;a.travel('abyssalbowl');});await frames();
 await page.screenshot({path:`${out}/abyss.png`,timeout:120000});
 writeFileSync(`${out}/report.json`,JSON.stringify({scans,data,fullGeometry,lowGeometry,errors,warnings},null,2));
 console.log('Scan counts',scans);console.log('Submitted',data.frame,'systems',data.inventory.bySystem,'flora categories',data.categories);
 console.log('Same counts, full/low flora triangles',fullGeometry.flora,lowGeometry.flora);
 console.log('Browser errors',errors,'warnings',warnings);assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
}finally{await browser.close();}
