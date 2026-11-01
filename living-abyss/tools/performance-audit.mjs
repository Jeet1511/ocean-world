// Reproducible sampled performance audit. SwiftShader render time is NOT target
// hardware FPS. The fixed camera/quality captures support same-scene comparisons.
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/performance/baseline';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
const frame=()=>page.evaluate(()=>new Promise(r=>{const n=window.ABYSS.renderer.info.render.frame;function check(){if(window.ABYSS.renderer.info.render.frame>n)r();else requestAnimationFrame(check);}requestAnimationFrame(check);}));
try{
 const start=Date.now();await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY === true',{timeout:300000});
 const bootMs=Date.now()-start;
 const bootResources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/')).map(e=>({name:e.name.split('/assets/')[1],encoded:e.encodedBodySize,transfer:e.transferSize,duration:e.duration})));
 await page.evaluate(()=>{window.ABYSS.state.paused=true;});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const samples=[];
 for(const [id,q] of [['glasshorizon','low'],['roseglass','low'],['verdant','low'],['roseglass','high']]){
  await page.evaluate(async ([id,q])=>{window.ABYSS.quality(q);await window.ABYSS.travel(id);},[id,q]);await frame();
  const data=await page.evaluate(()=>({frame:window.ABYSS.frame(),inventory:window.ABYSS.renderInventory(),camera:window.ABYSS.camera.position.toArray()}));
  await page.screenshot({path:`${out}/${id}-${q}.png`,timeout:180000});samples.push({id,quality:q,...data});
  console.log(id,q,'draws',data.frame.calls,'triangles',data.frame.tris,'flora',data.inventory.bySystem.flora,'geology',data.inventory.bySystem.geology,'schools',data.inventory.bySystem.atmosphere);
 }
 const sim=await page.evaluate(()=>{
  const schools=window.ABYSS.scene.getObjectByName('atmosphere').children.filter(o=>o.userData.simulation),times=[];
  for(let repeat=0;repeat<5;repeat++){const start=performance.now();for(const s of schools)s.userData.simulation.step(.125,null,[]);times.push(performance.now()-start);}
  return {groups:schools.length,fish:schools.reduce((n,s)=>n+s.count,0),timesMs:times};
 });
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/')).map(e=>({name:e.name.split('/assets/')[1],encoded:e.encodedBodySize,transfer:e.transferSize,duration:e.duration})));
 writeFileSync(`${out}/report.json`,JSON.stringify({bootMs,samples,sim,bootResources,resources,errors,warnings},null,2));
 console.log('boot ms',bootMs,'sim ms',sim.timesMs,'boot asset requests',bootResources.length,'bytes',bootResources.reduce((n,r)=>n+r.encoded,0),'after-view requests',resources.length);
 console.log('browser errors',errors,'warnings',warnings);if(errors.length)process.exitCode=1;
}finally{await browser.close();}
