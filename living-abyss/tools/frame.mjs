// Auto-frame QC: place the camera at a good distance from real structures.
import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:600} });
page.on('pageerror', e=>console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction('window.__READY===true',{timeout:300000});
await page.evaluate(()=>{document.getElementById('hud').style.display='none';document.getElementById('startNote').style.display='none';});
const geo = await page.evaluate(()=>{
  const g = window.ABYSS.geology();
  return { arches: g.arches.slice(0,14), towers: g.towers.slice(0,12), field: null };
});
console.log('arches:', geo.arches.length, 'towers:', geo.towers.length);
// sort arches by span, take the big ones
const big = geo.arches.slice().sort((a,b)=>b.span-a.span).slice(0,4);
const shots = [];
big.forEach((a,i)=>{
  const [cx,cy,cz] = a.p0;
  const d = Math.max(150, a.span*0.9);
  shots.push({name:`f${i}_arch_side`, x: cx+d, y: cy+18, z: cz+d*0.35, look:[cx,cy,cz], wait:1600});
  shots.push({name:`f${i}_arch_under`, x: cx+8, y: cy+4, z: cz+70, look:[cx,cy+30,cz], wait:1600});
});
const towers = geo.towers.slice().sort((a,b)=>b.h-a.h).slice(0,3);
towers.forEach((t,i)=>{
  const d = Math.max(120, t.h*0.8);
  shots.push({name:`g${i}_tower`, x: t.x+d*0.75, y: t.y+t.h*0.45, z: t.z+d*0.75, look:[t.x, t.y+t.h*0.5, t.z], wait:1600});
});
for (const s of shots){
  await page.evaluate(([x,y,z,look])=>{ window.ABYSS.teleport(x,y,z,0,0); window.ABYSS.lookAt(look[0],look[1],look[2]); }, [s.x,s.y,s.z,s.look]);
  await page.waitForTimeout(s.wait);
  await page.screenshot({path:`/tmp/shots/${s.name}.png`});
  console.log('·', s.name);
}
console.log(JSON.stringify(big.map(a=>({span:a.span, crown:a.crown, p0:a.p0}))));
await browser.close();
