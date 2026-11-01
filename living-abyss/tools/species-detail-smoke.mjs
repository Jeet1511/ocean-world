// Browser verification: model load, simulated motion/pause and close-up captures.
// This is not a full-path animal collision or target-device performance test.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='/home/user/preservation/visual-audit/species-pass-11';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:480,height:270}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const read=()=>page.evaluate(()=>{let list=[];window.ABYSS.scene.traverse(o=>{if(o.userData.species&&o.userData.simulation){let s=o.userData.simulation;list.push({species:o.userData.species,visual:o.userData.visual,count:o.count,center:s.center.toArray(),time:s.time,first:[s.center.x+s.positions[0],s.center.y+s.positions[1],s.center.z+s.positions[2]]});}});return list;});
try {
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY===true && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 let fish=await read();assert.deepEqual(fish.map(q=>q.species),['palette_surgeonfish','palette_surgeonfish','bluefin_tuna']);assert(fish.every(q=>q.count===8&&q.visual.startsWith('textured_')));
 for(const species of ['palette_surgeonfish','bluefin_tuna']){
  let f=(await read()).find(q=>q.species===species),t=f.first;
  await page.evaluate(({t,species})=>{const r=species==='bluefin_tuna'?3:1.3;window.ABYSS.teleport(t[0]+r,t[1]+r*.2,t[2]+r,0,0);window.ABYSS.lookAt(...t);},{t,species});
  await page.waitForTimeout(1500);f=(await read()).find(q=>q.species===species);const prev=f.time;
  await page.waitForFunction(({species,prev})=>{let found;window.ABYSS.scene.traverse(o=>{if(!found&&o.userData.species===species&&o.userData.simulation)found=o.userData.simulation.time>prev;});return !!found;},{species,prev},{timeout:120000});
  await page.keyboard.press('KeyP');await page.waitForTimeout(600);const paused=(await read()).find(q=>q.species===species).time;await page.waitForTimeout(600);assert.equal((await read()).find(q=>q.species===species).time,paused,'pause freezes simulation');
  await page.screenshot({path:`${out}/${species}.png`,timeout:120000});await page.keyboard.press('KeyP');
 }
 assert.deepEqual(errors,[]);assert(!warnings.some(w=>w.includes('Detailed species asset unavailable')));
 writeFileSync(`${out}/report.json`,JSON.stringify({fish,errors,warnings},null,2));console.log('PASS: two surgeonfish groups and one tuna group load, swim and pause; no model errors.');
} finally {await browser.close();}
