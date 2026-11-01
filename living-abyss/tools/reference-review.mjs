// Real browser captures at existing portals; teleport is not route QA.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/reference-pass';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const list=[];for(const id of ['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl']){
  await p.evaluate(id=>window.ABYSS.travel(id),id);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  let d=await p.evaluate(()=>({position:window.ABYSS.camera.position.toArray(),frame:window.ABYSS.frame()}));await p.screenshot({path:`${out}/${id}.png`,timeout:120000});list.push({id,...d});console.log(id,JSON.stringify(d));
 }
 writeFileSync(`${out}/report.json`,JSON.stringify({list,errors,warnings},null,2));console.log('errors',errors,'warnings',warnings);if(errors.length)process.exitCode=1;
}finally{await browser.close()}
