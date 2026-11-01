// Compare the old full 27-cell crack search with the new mathematically
// bounded search in the same paused, high-quality scene. Software WebGL times
// are diagnostic only; they are not target-GPU measurements.
import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/performance/shader-ab';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const rendered=()=>page.evaluate(()=>new Promise(r=>{const n=window.ABYSS.renderer.info.render.frame;function check(){if(window.ABYSS.renderer.info.render.frame>n)r();else requestAnimationFrame(check);}requestAnimationFrame(check);}));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY === true',{timeout:300000});
 await page.evaluate(async()=>{const a=window.ABYSS;a.state.paused=true;a.quality('high');await a.travel('roseglass');});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});await rendered();
 const count=await page.evaluate(()=>{
  const found=new Set();window.ABYSS.scene.traverse(o=>{
   for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat?.isShaderMaterial&&mat.fragmentShader.includes('float crackMask = crackMaskWithin(wp, 0.16);'))found.add(mat);
  });
  window.__shaderAudit=[...found].map(m=>({material:m,fast:m.fragmentShader,
   slow:m.fragmentShader.replace('float crackMask = crackMaskWithin(wp, 0.16);','float crackMask = 1.0 - smoothstep(0.0, 0.16, crackField(wp, 0.16));')}));
  return found.size;
 });assert(count>0);
 const results={materials:count,errors};
 for(const type of ['slow','fast']){
  await page.evaluate(type=>{for(const item of window.__shaderAudit){item.material.fragmentShader=item[type];item.material.needsUpdate=true;}},type);
  await rendered();await page.screenshot({path:`${out}/${type}.png`,timeout:180000});
  const timing=await page.evaluate(()=>{
   const a=window.ABYSS,gl=a.renderer.getContext(),values=[];
   for(let i=0;i<2;i++){const t=performance.now();a.composer.render();gl.finish();values.push(performance.now()-t);}
   return values;
  });
  results[type]=timing;console.log(type,'software render+finish ms',timing);
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify(results,null,2));
}finally{await browser.close();}
