const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='/home/user/preservation/visual-audit/reference-pass-whale';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:400,height:225}}),errors=[],warnings=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const frames=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY===true && window.ABYSS.state.time>0',{timeout:240000});
 await p.evaluate(()=>window.ABYSS.preload('azurespan'));
 let w=await p.evaluate(()=>window.ABYSS.whale());assert(w,'blue whale loaded on demand');
 await p.evaluate(w=>{let v=w.position;window.ABYSS.teleport(v[0]+25,v[1]+7,v[2]+25,0,0);window.ABYSS.lookAt(...v);},w);
 await frames();let a=await p.evaluate(()=>window.ABYSS.whale());await frames();let b=await p.evaluate(()=>window.ABYSS.whale());assert(b.visible&&b.time>a.time,'nearby whale animates');
 await p.keyboard.press('KeyP');await frames();let frozen=await p.evaluate(()=>window.ABYSS.whale().time);await frames();assert.equal(await p.evaluate(()=>window.ABYSS.whale().time),frozen,'pause freezes whale');
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});await p.screenshot({path:`${dir}/blue-whale.png`,timeout:120000});
 await p.keyboard.press('KeyP');await p.evaluate(()=>window.ABYSS.travel('glasshorizon'));await frames();assert(!(await p.evaluate(()=>window.ABYSS.whale().visible)),'distant whale culled');
 await p.keyboard.press('KeyM');await p.locator('#assetCredits summary').click();assert((await p.locator('#assetCredits').innerText()).includes('Bohdan Lvov'),'license credit in chart');
 assert.deepEqual(errors,[]);assert(!warnings.some(x=>x.includes('Blue whale unavailable')));writeFileSync(`${dir}/report.json`,JSON.stringify({whale:w,errors,warnings},null,2));
 console.log('PASS: whale loads, animates nearby, pauses, distance-culls and has visible attribution; no browser errors.');
}finally{await browser.close();}
