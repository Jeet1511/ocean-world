import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='/home/user/preservation/visual-audit/update10-shoal';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try {
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY===true && window.ABYSS.state.time>0',{timeout:240000});
 let shoals=await page.evaluate(()=>window.ABYSS.reefShoals());assert.equal(shoals.length,4,'four textured shoals loaded');
 const target=shoals[0];await page.evaluate(a=>{let p=a.position;window.ABYSS.teleport(p[0]+7,p[1]+2,p[2]+8,0,0);window.ABYSS.lookAt(...p);},target);
 await frames();const a=await page.evaluate(()=>window.ABYSS.reefShoals()[0]);await frames();const b=await page.evaluate(()=>window.ABYSS.reefShoals()[0]);
 assert(b.visible&&b.time>a.time,'nearby shoal animation plays');
 await page.keyboard.press('KeyP');await frames();const frozen=await page.evaluate(()=>window.ABYSS.reefShoals()[0].time);await frames();assert.equal(await page.evaluate(()=>window.ABYSS.reefShoals()[0].time),frozen,'pause freezes shoal');
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});
 await page.screenshot({path:`${dir}/shoal.png`,timeout:120000});
 await page.keyboard.press('KeyP');await page.evaluate(()=>window.ABYSS.travel('abyssalbowl'));await frames();shoals=await page.evaluate(()=>window.ABYSS.reefShoals());assert(shoals.every(s=>!s.visible),'distant shoals culled');
 assert.deepEqual(errors,[]);assert(!warnings.some(w=>w.includes('Reef shoals unavailable')),warnings.join('\n'));
 writeFileSync(`${dir}/report.json`,JSON.stringify({shoals,errors,warnings},null,2));
 console.log('PASS four reef shoals load, animate, pause, and cull; errors',JSON.stringify(errors),'warnings',JSON.stringify(warnings));
}finally{await browser.close();}
