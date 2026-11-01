import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const p=await browser.newPage({viewport:{width:640,height:360}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
try{
 await p.goto('http://127.0.0.1:8000');await p.waitForFunction('window.__READY===true',{timeout:240000});await p.evaluate(()=>ABYSS.quality('low'));
 const info=await p.evaluate(()=>{const d=ABYSS.collisionInfo();return {count:d.colliders.length,roof:d.roofs,radius:d.radius,debugPresent:!!ABYSS.scene.getObjectByName('developer_collision_overlay')}});console.log('INFO',JSON.stringify(info));
 await p.keyboard.press('`');await p.waitForTimeout(3000);console.log('DEBUG ON',await p.evaluate(()=>ABYSS.scene.getObjectByName('developer_collision_overlay')?.visible));await p.screenshot({path:'/home/user/preservation/visual-audit/collision-debug.png',timeout:120000});
 await p.keyboard.press('`');console.log('DEBUG OFF',await p.evaluate(()=>ABYSS.scene.getObjectByName('developer_collision_overlay')?.visible));
 await p.evaluate(()=>ABYSS.hideUI());await p.evaluate(()=>{ABYSS.teleport(520,-22,360,0,0);ABYSS.lookAt(520,-22,280)});await p.waitForTimeout(3000);await p.screenshot({path:'/home/user/preservation/visual-audit/collision-pass-verdant.png',timeout:120000});
 console.log('ERRORS',JSON.stringify(errors)); if(errors.length)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1}finally{await browser.close()}
