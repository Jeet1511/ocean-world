// Seven arrival views and targeted cave/quality diagnostics; not full route QA.
// SwiftShader is a software renderer: numbers are submission diagnostics only.
// Optional QA dependency: use a local Playwright install, with the sandbox fallback.
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/ecosystem-current';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning'&&warnings.length<30)warnings.push(m.text())});
const waitFrames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const list=[];for(const id of ['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl']){
  await page.evaluate(id=>window.ABYSS.travel(id),id);await waitFrames();
  const v=await page.evaluate(()=>({position:window.ABYSS.camera.position.toArray(),frame:window.ABYSS.frame(),inventory:window.ABYSS.renderInventory()}));
  await page.screenshot({path:`${out}/${id}.png`,timeout:120000});list.push({id,...v});console.log(id,JSON.stringify({position:v.position,frame:v.frame,systems:v.inventory.bySystem}));
 }
 await page.evaluate(()=>{window.ABYSS.teleport(430,-72,-290,0,0);window.ABYSS.lookAt(485,-64,-348);});await waitFrames();
 await page.screenshot({path:`${out}/nave-interior-low.png`,timeout:120000});
 const caveLow=await page.evaluate(()=>({pos:window.ABYSS.camera.position.toArray(),frame:window.ABYSS.frame()}));
 await page.evaluate(()=>window.ABYSS.quality('high'));await waitFrames();
 const caveHigh=await page.evaluate(()=>({pos:window.ABYSS.camera.position.toArray(),frame:window.ABYSS.frame()}));
 await page.screenshot({path:`${out}/nave-interior-high.png`,timeout:120000});
 const eco=await page.evaluate(()=>window.ABYSS.ecosystem());
 writeFileSync(`${out}/report.json`,JSON.stringify({list,caveLow,caveHigh,eco,errors,warnings},null,2));
 console.log('CAVE',caveLow,caveHigh);console.log('errors',errors,'warnings',warnings);if(errors.length)process.exitCode=1;
}finally{await browser.close();}
