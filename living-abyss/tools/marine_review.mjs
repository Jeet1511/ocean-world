// Targeted update 09 browser check. Teleports do not certify continuous routes.
import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
import { mkdirSync,writeFileSync } from 'node:fs';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/marine-pass-09';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY===true',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});
 const animals=await page.evaluate(()=>window.ABYSS.largeMarine());
 console.log('animals',JSON.stringify(animals));
 for(const kind of ['manta','shark']){
  const animal=animals.find(a=>a.kind===kind);
  if(!animal){errors.push('No '+kind+' patrol');continue;}
  await page.keyboard.press('KeyP');
  await page.evaluate(a=>{let p=a.position;window.ABYSS.teleport(p[0]+7,p[1]+2,p[2]+8,0,0);window.ABYSS.lookAt(...p);},animal);
  await page.waitForTimeout(2500);
  await page.screenshot({timeout:120000,path:`${out}/${kind}.png`});
  console.log(kind,JSON.stringify(await page.evaluate(()=>({frame:window.ABYSS.frame(),camera:window.ABYSS.camera.position.toArray(),animals:window.ABYSS.largeMarine()}))));
  await page.keyboard.press('KeyP');
 }
 await page.evaluate(()=>{window.ABYSS.teleport(-145,-579,-640,0,0);window.ABYSS.lookAt(-115,-585,-640);});
 await page.waitForTimeout(2000);
 await page.screenshot({timeout:120000,path:`${out}/cold-coral.png`});
 writeFileSync(`${out}/report.json`,JSON.stringify({animals,errors,warnings},null,2));
 console.log('errors',JSON.stringify(errors),'warnings',JSON.stringify(warnings));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
