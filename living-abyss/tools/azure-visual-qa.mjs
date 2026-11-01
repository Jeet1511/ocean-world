// Azure portal and arrival snapshots in the actual game. Diagnostic cameras
// are not a substitute for continuous player traversal or hardware profiling.
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/azure-before';mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await b.newPage({viewport:{width:480,height:270}}),errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
const frame=()=>page.evaluate(()=>new Promise(r=>{const n=ABYSS.renderer.info.render.frame;function c(){if(ABYSS.renderer.info.render.frame>n)r();else requestAnimationFrame(c);}requestAnimationFrame(c);}));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY && ABYSS.state.time>0',{timeout:300000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader,#toast{display:none!important}'});
 await page.evaluate(async()=>{ABYSS.state.paused=true;await ABYSS.travel('azurespan');});await frame();
 const entry=await page.evaluate(()=>({portal:ABYSS.portals().find(p=>p.id==='azurespan'),position:ABYSS.camera.position.toArray(),forward:ABYSS.pick(0,0),geology:ABYSS.geology().stats.arches,frame:ABYSS.frame()}));
 await page.screenshot({path:`${out}/arrival.png`,timeout:120000});
 const shots=[];
 for(const [name,dx,dz] of [['west',-1,0],['east',1,0],['north',0,-1],['south',0,1]]){
  await page.evaluate(({p,dx,dz})=>{ABYSS.teleport(p.x+dx*28,p.y+3,p.z+dz*28,0,0);ABYSS.lookAt(p.x,p.y,p.z);},{p:entry.portal,dx,dz});await frame();
  const data=await page.evaluate(()=>({position:ABYSS.camera.position.toArray(),pick:ABYSS.pick(0,0)}));
  await page.screenshot({path:`${out}/gate-${name}.png`,timeout:120000});shots.push({name,...data});
 }
 writeFileSync(`${out}/report.json`,JSON.stringify({entry,shots,errors,warnings},null,2));console.log(JSON.stringify({entry,shots,errors,warnings},null,2));
}finally{await b.close();}
