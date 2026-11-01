// Exercise real browser load failure/retry and the 15-second portal timeout.
// Network abort errors and asset warnings below are intentional test inputs.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/performance/streaming-failure';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];let table=0,whale=0;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
let releaseDeep,seenDeep;const barrier=new Promise(r=>releaseDeep=r),deepRequested=new Promise(r=>seenDeep=r);
await page.route('**/assets/models/coral_scans/table.glb',async route=>{table++;if(table===1)await route.abort('failed');else await route.continue();});
await page.route('**/assets/models/marine_pass12/blue-whale.glb',async route=>{whale++;if(whale===1)await route.abort('failed');else await route.continue();});
await page.route('**/assets/models/coral_scans/deep.glb',async route=>{seenDeep();await barrier;await route.continue();});
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:300000});
 const first=await page.evaluate(async()=>{const a=window.ABYSS,ok=await a.travel('roseglass');return {ok,toast:document.querySelector('#toast .t2').textContent,scans:a.ecosystem().scannedCorals,position:a.camera.position.toArray()};});
 assert.equal(first.ok,false,'failed coral must not deadlock travel');assert(first.toast.includes('could not load yet'));assert(!first.scans.loaded.includes('table'));
 const retry=await page.evaluate(async()=>({ok:await window.ABYSS.preload('roseglass'),scans:window.ABYSS.ecosystem().scannedCorals}));
 assert(retry.ok&&retry.scans.loaded.includes('table'),'explicit retry restores full coral');assert.equal(table,2);
 const whaleFirst=await page.evaluate(()=>window.ABYSS.preload('azurespan'));assert.equal(whaleFirst,false);
 const whaleRetry=await page.evaluate(async()=>({ok:await window.ABYSS.preload('azurespan'),whale:!!window.ABYSS.whale()}));
 assert(whaleRetry.ok&&whaleRetry.whale,'explicit retry restores full whale');assert.equal(whale,2);
 await page.evaluate(()=>{window.__deepStarted=performance.now();window.__deepDone=null;window.ABYSS.travel('abyssalbowl').then(ok=>{window.__deepDone={ok,elapsed:performance.now()-window.__deepStarted,toast:document.querySelector('#toast .t2').textContent,position:window.ABYSS.camera.position.toArray()};});});
 await Promise.race([deepRequested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('deep request not seen')),120000))]);
 await page.waitForFunction('window.__deepDone !== null',{timeout:120000});const timeout=await page.evaluate(()=>window.__deepDone);
 assert.equal(timeout.ok,false);assert(timeout.elapsed>=14900,'must give the request its 15-second window');assert(timeout.toast.includes('could not load yet'));
 assert(Math.hypot(timeout.position[0]+120,timeout.position[2]+640)<250,'timeout proceeds to the destination');
 releaseDeep();await page.waitForFunction('window.ABYSS.ecosystem().scannedCorals.loaded.includes("deep")',{timeout:120000});
 const deep=await page.evaluate(()=>window.ABYSS.ecosystem().scannedCorals);assert.equal(deep.counts.abyssalbowl,deep.planned.abyssalbowl,'late detail restores full planned count');
 assert.equal(table,2);assert.equal(whale,2);assert(warnings.some(x=>x.includes('Coral scan unavailable: table')));assert(warnings.some(x=>x.includes('Blue whale unavailable')));
 assert(errors.every(x=>x.includes('net::ERR_FAILED')),`unexpected errors ${JSON.stringify(errors)}`);
 writeFileSync(`${out}/report.json`,JSON.stringify({first,retry,whaleFirst,whaleRetry,timeout,deep,table,whale,errors,warnings},null,2));
 console.log('PASS: transient coral and whale failures warn and retry successfully; a held deep scan times out, travel proceeds, and full detail arrives later.');
}finally{releaseDeep();await browser.close();}
