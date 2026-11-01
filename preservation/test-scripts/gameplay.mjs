import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:480,height:270}});p.on('pageerror',e=>console.log('PAGE ERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text())});
await p.goto('http://127.0.0.1:8000/'); await p.waitForFunction('window.__READY === true',{timeout:240000}); await p.evaluate(()=>ABYSS.quality('low')); console.log('ready');
await p.keyboard.press('m'); console.log('map opens',await p.locator('#bigmap').evaluate(e=>e.classList.contains('on'))); await p.keyboard.press('m');
await p.keyboard.press('f'); console.log('dolphin mode',await p.evaluate(()=>ABYSS.state.mode)); await p.keyboard.press('f');
await p.evaluate(()=>ABYSS.teleport(0,-20,350,0,0)); await p.waitForTimeout(1500); const before=await p.evaluate(()=>ABYSS.portalProbe()); await p.keyboard.down('e'); await p.waitForTimeout(4000); await p.keyboard.up('e'); const after=await p.evaluate(()=>ABYSS.portalProbe()); console.log('E ascent before/after',JSON.stringify({before,after,delta:after.ctrl[1]-before.ctrl[1]}));
const gate=await p.evaluate(()=>ABYSS.portals()[0]); await p.evaluate(g=>ABYSS.teleport(g.x,g.y,g.z,0,0),gate); await p.waitForTimeout(3000); console.log('portal detection',JSON.stringify(await p.evaluate(()=>ABYSS.portalProbe()))); await p.keyboard.press('e'); console.log('gate dial',await p.locator('#travelDial').count(),await p.locator('#travelDial').evaluate(e=>getComputedStyle(e).display).catch(()=>''));
await b.close();
