import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const url = 'http://127.0.0.1:8099/index.html';
const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:600} });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errs.push('ERR: '+m.text().slice(0,300)); });
await page.goto(url);
await page.waitForFunction('window.__READY===true', {timeout:300000});
await page.evaluate(()=>{ document.getElementById('hud').style.display='none'; document.getElementById('startNote').style.display='none'; });
import fs from 'fs';
const shots = JSON.parse(fs.readFileSync(process.argv[2] || 'tools/shots.json','utf8'));
for (const s of shots){
  await page.evaluate(([x,y,z,yaw,pitch])=>window.ABYSS.teleport(x,y,z,yaw,pitch),[s.x,s.y,s.z,s.yaw||0,s.pitch||0]);
  await page.waitForTimeout(s.wait||1500);
  await page.screenshot({path:`/tmp/shots/${s.name}.png`});
  console.log('·', s.name);
}
const perf = await page.evaluate(()=>window.ABYSS.frame());
console.log('PERF', JSON.stringify(perf));
if (errs.length) console.log(errs.slice(0,8).join('\n'));
await browser.close();
