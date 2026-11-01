import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:'/tmp/omni-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});const p=await b.newPage({viewport:{width:640,height:360}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
try{await p.goto('http://127.0.0.1:8000');await p.waitForFunction('window.__READY===true',{timeout:240000});await p.evaluate(()=>ABYSS.quality('low'));await p.addStyleTag({content:'#hud,#startNote,#placeCard{display:none!important}'});
const spot=await p.evaluate(()=>{const c=ABYSS.collisionInfo().colliders.find(q=>q.source?.startsWith('tower:limestone:')&&q.yTop-q.yBase>3);return c});console.log('tower',JSON.stringify(spot));
await p.evaluate(c=>{const y=(c.yBase+c.yTop)/2;ABYSS.teleport(c.x+c.r+10,y,c.z,0,0);ABYSS.lookAt(c.x,y,c.z);ABYSS.state.paused=true},spot);await p.waitForTimeout(3000);
for(const [tag,value] of [['procedural',0],['photogrammetry',1]]){await p.evaluate(v=>ABYSS.scene.getObjectByName('geology_limestone').material.uniforms.uRockMapsReady.value=v,value);await p.waitForTimeout(2500);await p.screenshot({path:`/home/user/preservation/visual-audit/rock-material-${tag}.png`,timeout:120000});console.log('captured',tag)}console.log('errors',JSON.stringify(errors));if(errors.length)process.exitCode=1;
}catch(e){console.log('FAIL',e.stack);process.exitCode=1}finally{await b.close()}
