// Captures individual planned gardens; diagnostic teleport, not navigation QA.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='/home/user/preservation/visual-audit/reference-gardens';mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:400,height:225}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});
 const sites=await p.evaluate(()=>window.ABYSS.scene.getObjectByName('flora').userData.featureGardenSites);
 for(const id of (process.env.REVIEW_IDS?.split(',')||['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl'])){
  let site=sites.find(s=>s.id===id);if(!site){console.log('missing',id);continue;}
  const pose=await p.evaluate(s=>{let y=window.ABYSS.field.surfaceHeightAt(s.x,s.z);window.ABYSS.teleport(s.x+10,y+4,s.z+12,0,0);window.ABYSS.lookAt(s.x,y+1,s.z);return {target:[s.x,y,s.z],camera:window.ABYSS.camera.position.toArray()};},site);
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:`${out}/${id}.png`,timeout:120000});console.log(id,site,pose);
 }
 writeFileSync(`${out}/report.json`,JSON.stringify({sites,errors},null,2));if(errors.length)process.exitCode=1;
}finally{await b.close()}
