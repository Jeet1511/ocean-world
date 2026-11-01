import {chromium} from '/home/user/tools/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/school-detail';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:480,height:270}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY===true && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader {display:none!important}'});
 const info=await page.evaluate(()=>{const list=[];window.ABYSS.scene.traverse(o=>{if(o.name==='fish_school_ambient'&&o.userData.habitat==='glasshorizon'){let s=o.userData.simulation;list.push({center:s.center.toArray(),visual:o.userData.visual,first:[s.positions[0]+s.center.x,s.positions[1]+s.center.y,s.positions[2]+s.center.z]});}});return list;});
 console.log(JSON.stringify(info));let school=info.find(q=>q.center[2]>600);let fish=school.first;
 await page.evaluate(f=>{window.ABYSS.teleport(f[0]+3,f[1]+.9,f[2]+3,0,0);window.ABYSS.lookAt(...f);},fish);await page.waitForTimeout(1200);await page.keyboard.press('KeyP');await page.waitForTimeout(700);await page.screenshot({path:`${dir}/glass-ambient.png`,timeout:120000});
 writeFileSync(`${dir}/report.json`,JSON.stringify({info,errors,warnings},null,2));console.log('errors',errors,'warnings',warnings);
} finally {await browser.close();}
