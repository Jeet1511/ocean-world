import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='/home/user/preservation/visual-audit/reference-shafts';mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:400,height:225}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const frames=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try {
 await p.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await p.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});await p.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});
 const info=await p.evaluate(()=>{const g=window.ABYSS.scene.getObjectByName('light_shafts'),v=window.ABYSS.camera.position.constructor;let x=g.children.find(m=>m.position.z>500&&m.position.z<850&&m.position.y>-45);if(!x)return null;let center=x.position.clone(),target=center.clone().add(new v(0,8,0));let eye=center.clone().add(new v(20,4,22));window.ABYSS.teleport(eye.x,eye.y,eye.z,0,0);window.ABYSS.lookAt(target.x,target.y,target.z);return {center:center.toArray(),eye:eye.toArray(),target:target.toArray(),count:g.children.length};});
 if(!info)throw Error('No shallow shaft');await frames();await p.keyboard.press('KeyP');await frames();await p.screenshot({path:`${out}/shafts-on.png`,timeout:120000});
 await p.evaluate(()=>window.ABYSS.scene.getObjectByName('light_shafts').children.forEach(o=>{o.userData.savedIntensity=o.userData.baseIntensity;o.userData.baseIntensity=0;}));await frames();await p.screenshot({path:`${out}/shafts-off.png`,timeout:120000});
 writeFileSync(`${out}/report.json`,JSON.stringify({info,errors},null,2));console.log(info,'errors',errors);
}finally{await b.close();}
