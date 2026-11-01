import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const url = process.env.URL || 'http://127.0.0.1:8099/index.html';
const shots = JSON.parse(process.env.SHOTS || '[]');
const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W||1100), height: Number(process.env.H||640) }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => logs.push(m.type()+': '+m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto(url, { waitUntil:'domcontentloaded' });
try { await page.waitForFunction('window.__READY === true', { timeout: 240000 }); }
catch(e) { console.log('NOT READY'); }
const gpu = await page.evaluate(() => window.ABYSS ? window.ABYSS.gpu : 'n/a');
console.log('GPU:', gpu);
await page.waitForTimeout(2500);
for (const s of shots) {
  await page.evaluate(([x,y,z,yaw,pitch,look]) => {
    window.ABYSS.teleport(x,y,z,yaw,pitch);
    if (look) window.ABYSS.lookAt(look[0],look[1],look[2]);
  }, [s.x,s.y,s.z,s.yaw||0,s.pitch||0,s.look]);
  await page.waitForTimeout(s.wait||1800);
  await page.screenshot({ path: `/tmp/shots/${s.name}.png` });
  console.log('shot', s.name);
}
const perf = await page.evaluate(() => window.ABYSS.frame());
console.log('PERF', JSON.stringify(perf));
console.log('--- console ---');
console.log(logs.slice(0,40).join('\n'));
await browser.close();
