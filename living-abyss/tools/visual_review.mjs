// Diagnostic screenshots at the seven existing gate arrivals. This is not a
// continuous traversal or target-GPU performance benchmark. Requires Playwright
// installed in /home/user/tools and a running local dev server.
import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const output=process.env.REVIEW_DIR || '/home/user/preservation/visual-audit/habitat-pass';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push('page: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
await page.waitForFunction('window.__READY === true',{timeout:240000});
await page.addStyleTag({content:'#hud, #startNote, #placeCard { display:none !important; }'});
const ids=await page.evaluate(()=>window.ABYSS.locations.map(l=>l.id));
const data=[];
for(const id of ids){
 await page.evaluate(id=>window.ABYSS.travel(id),id);
 await page.waitForTimeout(2000);
 const info=await page.evaluate(()=>({frame:window.ABYSS.frame(),quality:window.ABYSS.state.quality,position:window.ABYSS.camera.position.toArray(),gpu:window.ABYSS.gpu}));
 await page.screenshot({timeout:120000,path:`${output}/${id}.png`});
 data.push({id,...info}); console.log(id,JSON.stringify(info));
}
writeFileSync(`${output}/report.json`,JSON.stringify({data,errors},null,2));
console.log('Errors:',JSON.stringify(errors));
await browser.close();
if(errors.length)process.exitCode=1;
