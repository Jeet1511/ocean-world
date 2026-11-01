// Targeted browser test of existing sharks interacting with live schools.
// Teleport positions the viewer; it is not a continuous route/playthrough test.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='/home/user/preservation/visual-audit/connected-ecology';mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 let sharks=await p.evaluate(()=>window.ABYSS.largeMarine().filter(a=>a.kind==='shark'));assert.equal(sharks.length,3);
 const shark=sharks.find(s=>s.place==='glasshorizon');
 await p.evaluate(a=>{const v=a.position;window.ABYSS.teleport(v[0]+13,v[1]+4,v[2]+13,0,0);window.ABYSS.lookAt(...v);},shark);
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const result=await p.evaluate(async()=>{
  let min=Infinity,active=0,near=0;
  for(let f=0;f<25;f++){
   await new Promise(r=>requestAnimationFrame(r));
   let threats=window.ABYSS.largeMarine().filter(a=>a.kind==='shark').map(a=>a.position);
   window.ABYSS.scene.traverse(o=>{
    let s=o.userData.simulation;if(!s)return;active=Math.max(active,s.nearbyPredatorCount||0);
    for(let i=0;i<s.positions.length;i+=3)for(const t of threats){let d=Math.hypot(s.center.x+s.positions[i]-t[0],s.center.y+s.positions[i+1]-t[1],s.center.z+s.positions[i+2]-t[2]);min=Math.min(min,d);if(d<15)near++;}
   });
  }
  return {min,active,near};
 });
 assert(result.active>0,'live school receives a nearby shark position');assert(result.min<15,'a real shark patrol approaches an actual fish');
 await p.screenshot({path:`${out}/shark-and-school.png`,timeout:120000});assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
 writeFileSync(`${out}/report.json`,JSON.stringify({result,errors,warnings},null,2));console.log('PASS: live predator position enters school steering range and an actual fish approaches within 15 m:',JSON.stringify(result));
}finally{await b.close()}
