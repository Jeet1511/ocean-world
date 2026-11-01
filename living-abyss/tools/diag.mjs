import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:600} });
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction('window.__READY===true',{timeout:300000});
await page.evaluate(()=>{document.getElementById('hud').style.display='none';document.getElementById('startNote').style.display='none';});
await page.evaluate(()=>{ window.ABYSS.setFog(0.10); window.ABYSS.teleport(-162,-542,-965,0,0); window.ABYSS.lookAt(-7.5,-546,-1074); });
await page.waitForTimeout(1200);
for (const [n,fn] of [['d1_all',null],['d2_noocean','ocean'],['d3_nosky','sky'],['d4_noterrain','terrain']]){
  await page.evaluate((fn)=>{ if(fn) window.ABYSS.toggle(fn,false); else {window.ABYSS.toggle('ocean',true);window.ABYSS.toggle('sky',true);window.ABYSS.toggle('terrain',true);} }, fn);
  await page.waitForTimeout(900);
  await page.screenshot({path:`/tmp/shots/${n}.png`});
  console.log('·',n);
}
await browser.close();
