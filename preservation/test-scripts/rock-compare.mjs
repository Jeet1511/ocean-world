import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
for(const [label,port] of [['before-boulder-merge',8001],['after-boulder-merge',8000]]){
 const page=await browser.newPage({viewport:{width:640,height:360}}), errors=[], assets=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});page.on('response',r=>{if(r.url().includes('rock022')) assets.push([r.status(),r.url()]);});
 try{
  await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction('window.__READY===true',{timeout:240000});await page.evaluate(()=>ABYSS.quality('low'));await page.addStyleTag({content:'#hud,#startNote,#placeCard{display:none!important}'});
  await page.evaluate(()=>{ABYSS.teleport(-40,-7,684,0,0);ABYSS.lookAt(-55,-4.7,691)});await page.waitForTimeout(4500);
  await page.screenshot({path:`/home/user/preservation/visual-audit/${label}.png`,timeout:120000});
  const test=await page.evaluate(()=>({position:ABYSS.portalProbe().ctrl,probe:ABYSS.pick(0,0),maps:(()=>{let m;ABYSS.scene.traverse(o=>{if(o.name==='geology_limestone')m=o.material});return m?.uniforms.uRockMapsReady?.value??null})()}));
  console.log(label,JSON.stringify(test),'assets',JSON.stringify(assets),'errors',JSON.stringify(errors));if(errors.length)process.exitCode=1;
 }catch(e){console.log('ERROR',label,e.stack);process.exitCode=1}finally{await page.close()}
}
await browser.close();
