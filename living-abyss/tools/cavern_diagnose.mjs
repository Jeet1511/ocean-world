// Compare individually hidden systems at the Flooded Nave gate arrival.
import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync} from 'node:fs';
const dir=process.env.DIAG_DIR || '/tmp/abyss-cavern';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:8000/');await page.waitForFunction('window.__READY === true',{timeout:240000});
await page.addStyleTag({content:'#hud, #startNote, #placeCard, #loader { display:none !important; }'});
await page.evaluate(()=>window.ABYSS.travel('floodednave'));
await page.waitForTimeout(1500);
for(const which of (process.env.DIAG_ONLY ? [process.env.DIAG_ONLY] : ['all','caverns','geology','terrain','apron'])){
 if(which!=='all')await page.evaluate(what=>window.ABYSS.toggle(what,false),which);
 await page.waitForTimeout(600);
 await page.screenshot({path:`${dir}/${which}.png`,timeout:120000});
 if(which!=='all')await page.evaluate(what=>window.ABYSS.toggle(what,true),which);
 console.log(which);
}
console.log('ray top',JSON.stringify(await page.evaluate(()=>[-.7,0,.7].map(x=>window.ABYSS.pick(x,.6)))));
console.log('errors',JSON.stringify(errors));await browser.close();
