// Browser check for visitor playback, distance culling, pause, and attribution.
// This does not certify pathfinding, continuous traversal, or GPU performance.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY===true',{timeout:240000});
 await page.waitForFunction('window.ABYSS.state.time>0',{timeout:240000});
 let animals=await page.evaluate(()=>window.ABYSS.largeMarine());
 assert.equal(animals.length,6);
 const manta=animals.find(a=>a.kind==='manta');
 await page.evaluate(a=>{const p=a.position;window.ABYSS.teleport(p[0]+5,p[1]+2,p[2]+5,0,0);window.ABYSS.lookAt(...p);},manta);
 await frames();const first=await page.evaluate(()=>window.ABYSS.largeMarine().find(a=>a.kind==='manta'));
 await frames();const second=await page.evaluate(()=>window.ABYSS.largeMarine().find(a=>a.kind==='manta'));
 assert(second.visible && second.time>first.time,'nearby animated model plays');
 await page.keyboard.press('KeyP');await frames();const frozen=await page.evaluate(()=>window.ABYSS.largeMarine().find(a=>a.kind==='manta').time);
 await frames();assert.equal(await page.evaluate(()=>window.ABYSS.largeMarine().find(a=>a.kind==='manta').time),frozen,'animation freezes on pause');
 await page.keyboard.press('KeyP');
 await page.evaluate(()=>window.ABYSS.travel('abyssalbowl'));await frames();
 animals=await page.evaluate(()=>window.ABYSS.largeMarine());
 assert(animals.every(a=>!a.visible),'distant visitors are culled');
 await page.keyboard.press('KeyM');assert(await page.locator('#bigmap').evaluate(e=>e.classList.contains('on')));
 await page.locator('#assetCredits summary').click();
 assert(await page.locator('#assetCredits').evaluate(e=>e.open));
 assert((await page.locator('#assetCredits').innerText()).includes('Optic_idealist'));
 assert.deepEqual(errors,[]);
 console.log('PASS: six visitors loaded; nearby animation advances, pause freezes it, distant visitors cull, and CC BY credit is visible in the chart.');
}finally{await browser.close();}
