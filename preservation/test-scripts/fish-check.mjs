import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}}), errs=[]; p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push(m.text())});
try{await p.goto('http://127.0.0.1:8000/');await p.waitForFunction('window.__READY===true',{timeout:240000});await p.evaluate(()=>ABYSS.quality('low')); await p.addStyleTag({content:'#hud,#startNote,#placeCard{display:none!important}'});
 const schools=await p.evaluate(()=>{let a=[];ABYSS.scene.traverse(o=>{if(o.name==='fish_school')a.push(o.material.uniforms.uCenter.value.toArray())});return a});console.log('school centres',JSON.stringify(schools));
 const c=schools[4];await p.evaluate(([x,y,z])=>{ABYSS.teleport(x,y,z+25,0,0);ABYSS.lookAt(x,y,z)},c);await p.waitForTimeout(4500);await p.screenshot({path:'/home/user/preservation/visual-audit/fish-placement-pass.png',timeout:120000});console.log('shader/page errors',JSON.stringify(errs));if(errs.length)process.exitCode=1;
}catch(e){console.log('FAIL',e.stack);process.exitCode=1}finally{await b.close()}
