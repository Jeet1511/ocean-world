import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:640,height:360}}); let errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404')) errs.push(m.text());});
await p.goto('http://127.0.0.1:8000/');await p.waitForFunction('window.__READY === true',{timeout:240000}); await p.addStyleTag({content:'#hud,#startNote,#placeCard{display:none !important}'});await p.evaluate(()=>ABYSS.quality('low'));
for(const s of [['kelp-refined-matched',520,-22,360,520,280],['kelp-refined-low',510,-27,340,520,280]]) {
 const [name,x,y,z,lx,lz]=s; await p.evaluate(([x,y,z,lx,lz])=>{ABYSS.teleport(x,y,z,0,0);ABYSS.lookAt(lx,y,lz)},[x,y,z,lx,lz]);await p.waitForTimeout(3500);await p.screenshot({path:`/home/user/preservation/visual-audit/${name}.png`,timeout:120000});console.log('capture',name);
}
console.log('flora stats',JSON.stringify(await p.evaluate(()=>ABYSS.stats().flora)));console.log('errors',JSON.stringify(errs));await b.close();
