// Local in-world model, skin and two-stroke check. SwiftShader is not hardware QA.
// Optional QA dependency: use a local Playwright install, with the sandbox fallback.
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const out=process.env.REVIEW_DIR||'/home/user/preservation/visual-audit/turtle';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:400,height:225}}),errors=[],warnings=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text())});
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});await page.waitForFunction('window.__READY && window.ABYSS.state.time>0',{timeout:240000});
 await page.addStyleTag({content:'#hud,#startNote,#placeCard,#loader{display:none!important}'});
 await page.evaluate(()=>window.ABYSS.travel('roseglass'));await frames();
 const turtles=await page.evaluate(()=>window.ABYSS.turtles());assert.equal(turtles.length,2);assert(turtles.some(t=>t.habitat==='roseglass'));
 const initial=await page.evaluate(()=>{
  const a=window.ABYSS,t=a.turtles().find(x=>x.habitat==='roseglass'),p=t.position;
  a.state.paused=true;a.teleport(p[0]+2.5,p[1]+1.1,p[2]+3.5,0,0);a.lookAt(...p);
  return {turtle:t,camera:a.camera.position.toArray(),frame:a.frame(),inventory:a.renderInventory().bySystem};
 });
 const sample=async time=>{
  await page.evaluate(t=>window.ABYSS.turtleTime('roseglass',t),time);await frames();
  const result=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),root=window.ABYSS.scene.getObjectByName('turtle_roseglass');root.updateMatrixWorld(true);
   let body;root.traverse(o=>{if(o.isSkinnedMesh&&o.name.includes('game_body'))body=o;});
   if(!body)return {error:'skinned body missing'};
   const g=body.geometry,pos=g.attributes.position,idx=g.attributes.skinIndex,w=g.attributes.skinWeight;
   const joint=body.skeleton.bones.findIndex(x=>x.name==='front_L');let best=-1,far=-1;
   for(let i=0;i<pos.count;i++)for(let k=0;k<4;k++){
    const j=idx.array[i*idx.itemSize+k],v=w.array[i*w.itemSize+k];
    if(j===joint&&v>.8&&Math.abs(pos.getX(i))>far){best=i;far=Math.abs(pos.getX(i));}
   }
   if(best<0)return {error:'weighted flipper vertex missing',joint};
   const vertex=new T.Vector3().fromBufferAttribute(pos,best);body.applyBoneTransform(best,vertex);body.localToWorld(vertex);
   return {joint,vertex:vertex.toArray(),mesh:body.name,bones:body.skeleton.bones.map(x=>x.name)};
  });
  await page.screenshot({path:`${out}/stroke-${time}.png`,timeout:120000});return result;
 };
 const up=await sample(.05),down=await sample(.45);
 await page.evaluate(()=>{const a=window.ABYSS,t=a.turtles().find(x=>x.habitat==='roseglass'),p=t.position,c=t.centre;
  const dx=-(p[2]-c[2])/t.radius,dz=(p[0]-c[0])/t.radius;
  a.teleport(p[0]+dx*3.5,p[1]+1,p[2]+dz*3.5,0,0);a.lookAt(...p);});await frames();
 await page.screenshot({path:`${out}/front-in-world.png`,timeout:120000});
 assert(!up.error&&!down.error,JSON.stringify({up,down}));
 const delta=Math.hypot(...up.vertex.map((x,i)=>x-down.vertex[i]));assert(delta>.05,`flipper did not visibly move: ${delta}`);
 // Approach the non-solid animal with simulation resumed; its small spring
 // offset should respond rather than the animal standing rigidly in the player.
 await page.evaluate(()=>{const a=window.ABYSS,t=a.turtles().find(x=>x.habitat==='roseglass'),p=t.position;
  a.teleport(p[0]+1.5,p[1],p[2],0,0);a.state.paused=false;});await frames();
 const response=await page.evaluate(()=>window.ABYSS.turtles().find(x=>x.habitat==='roseglass'));
 assert(Math.hypot(...response.avoidance)>.01,'turtle responds to a nearby swimmer');
 writeFileSync(`${out}/report.json`,JSON.stringify({turtles,initial,up,down,delta,response,errors,warnings},null,2));
 console.log('Turtles',turtles,'local frame',initial.frame,'flora',initial.inventory.flora,'flipper delta',delta);
 console.log('Browser errors',errors,'warnings',warnings);assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
}finally{await browser.close();}
