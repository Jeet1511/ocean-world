import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:480,height:270}}), errs=[];p.on('pageerror',e=>errs.push('page '+e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push('console '+m.text());});
try {
 await p.goto('http://127.0.0.1:8000/'); await p.waitForFunction('window.__READY === true',{timeout:240000}); await p.evaluate(()=>ABYSS.quality('low'));
 await p.waitForTimeout(1000); await p.evaluate(()=>ABYSS.hideUI());
 const gates=await p.evaluate(()=>ABYSS.portals()); console.log('gates',gates.length);
 await p.mouse.click(240,135); await p.waitForTimeout(500); console.log('pointer lock entered',await p.evaluate(()=>!!document.pointerLockElement));
 for(let i=0;i<gates.length;i++){
  const g=gates[i], target=gates[(i+1)%gates.length];
  await p.evaluate(g=>ABYSS.teleport(g.x,g.y,g.z,0,0),g);
  await p.waitForFunction(id=>ABYSS.portalInside()===id,g.id,{timeout:90000});
  await p.keyboard.press('e'); await p.waitForFunction(()=>document.querySelector('#travelDial')?.style.display==='flex',{timeout:30000});
  if(i===0){console.log('lock after opening',await p.evaluate(()=>!!document.pointerLockElement));await p.keyboard.press('Escape');console.log('escape closes',await p.evaluate(()=>document.querySelector('#travelDial').style.display==='none')); await p.waitForTimeout(500); await p.keyboard.press('e'); await p.waitForFunction(()=>document.querySelector('#travelDial')?.style.display==='flex',{timeout:30000});}
  await p.locator('#dialGrid button').filter({hasText:target.name}).click({timeout:30000});
  const result=await p.evaluate(()=>({pos:ABYSS.portalProbe().ctrl,dial:document.querySelector('#travelDial').style.display}));
  const d=Math.hypot(result.pos[0]-target.x,result.pos[2]-target.z);
  if(result.dial!=='none'||d>55) throw Error(`arrival failure ${g.id}->${target.id}: ${JSON.stringify(result)} distance ${d}`);
  console.log('PASS',g.id,'->',target.id,'distance to gate',d.toFixed(1));
 }
 await p.evaluate(()=>{ABYSS.teleport(520,-22,360,0,0);ABYSS.lookAt(520,-22,280)}); await p.waitForTimeout(3500); await p.screenshot({path:'/home/user/preservation/visual-audit/kelp-texture-pass.png',timeout:120000});
 console.log('errors',JSON.stringify(errs));
} catch(e){console.log('FAILED',e.stack);process.exitCode=1} finally {await b.close()}
