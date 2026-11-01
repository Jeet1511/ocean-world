// Browser integration checks for the world ecosystem pass. Uses software WebGL
// in the sandbox; frame timings are NOT representative of the user's GPU.
// Optional QA dependency: use a local Playwright install, with the sandbox fallback.
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/ecosystem-qa';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning'&&warnings.length<20)warnings.push(m.text())});
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const eco=await page.evaluate(()=>window.ABYSS.ecosystem());
 assert(eco?.groups>=50,`expected existing and added schools, saw ${eco?.groups}`);
 assert(eco.benthic?.anemones>0,'anemones loaded');
 assert(Object.values(eco.benthic?.seaStars||{}).reduce((a,b)=>a+b,0)>0,'sea-star model loaded');
 assert.equal(Object.keys(eco.reports).length,7);
 for(const [id,r] of Object.entries(eco.reports)){
  assert(r.total>=r.minimum && r.total<=r.maximum,`${id}: ${r.total} outside ${r.minimum}–${r.maximum}`);
  assert.deepEqual(r.missingAssets,[],`${id} missing named assets`);
 }
 const species=[...new Set(eco.detail.map(x=>x.species).filter(Boolean))];
 assert(species.includes('clownfish')&&species.includes('seahorse')&&species.includes('anglerfish'),`unexpected detailed species: ${species}`);
 await page.evaluate(()=>window.ABYSS.travel('roseglass'));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const low=await page.evaluate(()=>({frame:window.ABYSS.frame(),position:window.ABYSS.camera.position.toArray()}));
 await page.screenshot({path:`${out}/roseglass-low.png`,timeout:120000});
 await page.evaluate(()=>window.ABYSS.quality('high'));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const high=await page.evaluate(()=>window.ABYSS.frame());
 await page.screenshot({path:`${out}/roseglass-high.png`,timeout:120000});
 await page.evaluate(()=>window.ABYSS.quality('low'));
 const result={eco,low,high,errors,warnings};writeFileSync(`${out}/report.json`,JSON.stringify(result,null,2));
 console.log('Population totals:',Object.fromEntries(Object.entries(eco.reports).map(([id,r])=>[id,r.total])));
 console.log('Fish groups',eco.groups,'fish',eco.fish,'named species',species,'benthic',eco.benthic);
 console.log('Software frames low/high:',low.frame,high);console.log('Browser errors',errors,'warnings',warnings);
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
