import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1280,height:760} });
page.on('pageerror', e=>console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction('window.__READY===true',{timeout:300000});
await page.waitForTimeout(2500);
await page.screenshot({path:'/tmp/shots/u1_hud.png'});
// dolphin mode, swimming
await page.evaluate(()=>{ window.ABYSS.teleport(-1000,-14,760,0.5,0.02); window.ABYSS.setMode('dolphin'); });
await page.waitForTimeout(1200);
await page.keyboard.down('w'); await page.waitForTimeout(2200); await page.keyboard.up('w');
await page.screenshot({path:'/tmp/shots/u2_dolphin.png'});
// big map
await page.evaluate(()=>{ window.ABYSS.setMode('swim'); });
await page.waitForTimeout(400);
await page.keyboard.press('m');
await page.waitForTimeout(1600);
await page.screenshot({path:'/tmp/shots/u3_map.png'});
console.log('done');
await browser.close();
