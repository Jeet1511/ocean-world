// Targeted visual check near the largest previously measured terrain-grid step.
// Teleport capture only: not a swim-through or full collision test.
import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='/home/user/preservation/visual-audit/terrain-transition';mkdirSync(dir,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:320,height:180}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000/');await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 const info=await p.evaluate(()=>{window.ABYSS.teleport(240,-500,-580,0,0);window.ABYSS.lookAt(268,-420,-552);return {position:window.ABYSS.camera.position.toArray(),floor:window.ABYSS.field.surfaceHeightAt(240,-580)};});
 await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:`${dir}/deep-transition.png`,timeout:120000});
 writeFileSync(`${dir}/report.json`,JSON.stringify({info,errors},null,2));console.log(info,'errors',errors);if(errors.length)process.exitCode=1;
}finally{await b.close()}
