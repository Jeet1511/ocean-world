// Actual browser check for on-demand habitat assets, approach prefetch and
// portal readiness. The temporary network gate tests slow-load behavior.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/performance/streaming';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
let signalRequest,releaseRequest;const requested=new Promise(r=>signalRequest=r),barrier=new Promise(r=>releaseRequest=r);
await page.route('**/assets/models/coral_scans/table.glb',async route=>{signalRequest();await barrier;await route.continue();});
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:300000});
 // Staying at the untouched starting spawn must not immediately trigger a
 // nearby habitat's prefetch. Wait for another rendered frame and idle time.
 const startFrame=await page.evaluate(()=>window.ABYSS.renderer.info.render.frame);
 await page.waitForTimeout(1500);
 await page.waitForFunction(f=>window.ABYSS.renderer.info.render.frame>f,startFrame,{timeout:120000});
 const boot=await page.evaluate(()=>({quality:window.ABYSS.state.quality,scans:window.ABYSS.ecosystem().scannedCorals,
  assets:performance.getEntriesByType('resource').map(e=>e.name)}));
 assert.equal(boot.quality,'low');
 assert(!boot.assets.some(x=>x.includes('/coral_scans/table.glb')),'table scan is not a startup download');
 assert(!boot.assets.some(x=>x.includes('/coral_scans/deep.glb')),'deep scan is not a startup download');
 assert(!boot.assets.some(x=>x.includes('/blue-whale.glb')),'distant whale is not a startup download');
 assert.equal(boot.scans.loaded.length,4,'starting shallows retain their four required detailed scans');
 const gate=await page.evaluate(()=>window.ABYSS.portals().find(x=>x.id==='glasshorizon'));
 // 480 m from Roseglass centre: within the 500 m prefetch radius but well
 // outside its 240 m visibility envelope.
 await page.evaluate(()=>window.ABYSS.teleport(-40,-10,300,0,0));
 await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('approach did not prefetch the table scan')),120000))]);
 await page.evaluate(p=>window.ABYSS.teleport(p.x,p.y,p.z,0,0),gate);
 await page.waitForFunction('window.ABYSS.portalInside() === "glasshorizon"',{timeout:120000});
 await page.keyboard.press('KeyE');await page.locator('#travelDial').waitFor({state:'visible',timeout:120000});
 await page.locator('#dialGrid button').filter({hasText:'Roseglass Reef'}).click({timeout:120000});
 await page.waitForTimeout(3000);
 const pending=await page.evaluate(()=>({position:window.ABYSS.camera.position.toArray(),toast:document.querySelector('#toast').className,title:document.querySelector('#toast .t1').textContent}));
 assert(Math.hypot(pending.position[0]+520,pending.position[2]-300)>250,'portal waits at origin while full-quality asset is pending');
 assert(pending.toast.includes('on')&&pending.title==='Preparing destination','loading feedback stays visible during the wait');
 releaseRequest();
 await page.waitForFunction('Math.hypot(window.ABYSS.camera.position.x+520,window.ABYSS.camera.position.z-300)<250',{timeout:120000});
 const rose=await page.evaluate(()=>({position:window.ABYSS.camera.position.toArray(),quality:window.ABYSS.state.quality,scans:window.ABYSS.ecosystem().scannedCorals}));
 assert(rose.scans.loaded.includes('table'));assert.equal(rose.scans.counts.roseglass,rose.scans.planned.roseglass);
 assert.equal(rose.quality,boot.quality,'streaming never changes quality');
 await page.evaluate(()=>window.ABYSS.travel('abyssalbowl'));
 const deep=await page.evaluate(()=>window.ABYSS.ecosystem().scannedCorals);
 assert(deep.loaded.includes('deep'));assert.equal(deep.counts.abyssalbowl,deep.planned.abyssalbowl);
 const whaleReady=await page.evaluate(async()=>({ready:await window.ABYSS.preload('azurespan'),whale:!!window.ABYSS.whale()}));
 assert(whaleReady.ready,`whale preload did not complete within its timeout: ${JSON.stringify(whaleReady)}`);
 assert(whaleReady.whale,`whale missing after successful preload: ${JSON.stringify(whaleReady)}`);
 const urls=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));
 for(const suffix of ['/coral_scans/table.glb','/coral_scans/deep.glb','/blue-whale.glb'])assert.equal(urls.filter(x=>x.includes(suffix)).length,1,`${suffix} fetched once`);
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 writeFileSync(`${out}/report.json`,JSON.stringify({boot,rose,deep,errors,warnings},null,2));
 console.log('PASS: 3 far assets deferred, approach prefetched, portal waited for gated scan, all 6 scan types and whale loaded once at unchanged quality.');
}finally{releaseRequest();await browser.close();}
