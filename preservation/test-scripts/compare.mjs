import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const spots=[['glass-horizon',0,-6,690,0,620],['roseglass-reef',-520,-18,380,-520,300],['verdant-cathedral',520,-22,360,520,280],['pillars-of-aurel',0,-95,140,0,20],['azure-span',-480,-160,-240,-480,-340],['flooded-nave',500,-52,-250,500,-360],['abyssal-bowl',0,-500,-590,0,-700]];
for(const [label,port] of [['before',8001],['after',8000]]) {
 const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});
 page.on('pageerror',e=>console.log(label,'PAGEERROR',e.message)); page.on('response',r=>{if(r.status()>=400)console.log(label,'HTTP',r.status(),r.url())});
 await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction('window.__READY === true',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard{display:none !important}'});
 await page.evaluate(()=>window.ABYSS.quality('low')); console.log(label,'READY');
 for(const [name,x,y,z,lx,lz] of spots){
  await page.evaluate(([x,y,z,lx,lz])=>{ABYSS.teleport(x,y,z,0,0); ABYSS.lookAt(lx,y,lz)},[x,y,z,lx,lz]); await page.waitForTimeout(3000);
  await page.screenshot({path:`/home/user/preservation/visual-audit/${label}-${name}.png`,timeout:120000}); console.log(label,name);
 }
 console.log(label,'world',JSON.stringify(await page.evaluate(()=>ABYSS.world))); console.log(label,'counts',JSON.stringify(await page.evaluate(()=>ABYSS.counts())));
 await page.close();
}
await browser.close();
