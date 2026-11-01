// Diagnostic approximation of the reported shallow-shelf pose, read from the
// user's chart: x=-23,z=718, depth~7 m; heading/pitch were not provided.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/grounding-before';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:320,height:180}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY===true',{timeout:240000});
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 const records=[];
 for(let i=0;i<8;i++){
  const yaw=i*Math.PI/4;
  await p.evaluate(yaw=>window.ABYSS.teleport(-23,-7,718,yaw,-.25),yaw);
  await p.waitForTimeout(1000);
  const data=await p.evaluate(()=>({cam:window.ABYSS.camera.position.toArray(),pick0:window.ABYSS.pick(0,0),pickTop:window.ABYSS.pick(0,.55),pickBottom:window.ABYSS.pick(0,-.55)}));
  await p.screenshot({path:`${out}/heading-${i}.png`,timeout:120000});records.push({i,yaw,...data});console.log(i,JSON.stringify(data));
 }
 writeFileSync(`${out}/report.json`,JSON.stringify({records,errors},null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
