// Limited browser smoke: map, dolphin toggle, pause, one real portal UI flow.
// Diagnostic teleport positions the player at a portal; this is not route QA.
// Optional QA dependency: use a local Playwright install, with the sandbox fallback.
const {chromium}=await import('playwright').catch(()=>import('/home/user/tools/node_modules/playwright/index.mjs'));
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction('window.__READY === true',{timeout:240000});
 await page.keyboard.press('KeyM');assert(await page.locator('#bigmap').evaluate(e=>e.classList.contains('on')),'map opens');
 await page.keyboard.press('Escape');assert(!(await page.locator('#bigmap').evaluate(e=>e.classList.contains('on'))),'map closes');
 await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>window.ABYSS.state.mode),'dolphin');
 await page.keyboard.press('KeyF');assert.equal(await page.evaluate(()=>window.ABYSS.state.mode),'free');
 await page.keyboard.press('KeyP');assert.equal(await page.evaluate(()=>window.ABYSS.state.paused),true);
 await page.keyboard.press('KeyP');assert.equal(await page.evaluate(()=>window.ABYSS.state.paused),false);
 const p=await page.evaluate(()=>window.ABYSS.portals().find(p=>p.id==='glasshorizon'));
 await page.evaluate(p=>window.ABYSS.teleport(p.x,p.y,p.z,0,0),p);
 await page.waitForFunction('window.ABYSS.portalInside() === "glasshorizon"',{timeout:120000});
 await page.keyboard.press('KeyE');
 await page.locator('#travelDial').waitFor({state:'visible',timeout:120000});
 assert.equal(await page.locator('#dialGrid button').count(),7);
 await page.locator('#dialGrid button').filter({hasText:'Roseglass Reef'}).click({timeout:120000});
 await page.waitForFunction('document.querySelector("#travelDial").style.display === "none"',{timeout:120000});
 await page.waitForFunction('Math.hypot(window.ABYSS.camera.position.x+520,window.ABYSS.camera.position.z-300)<250',{timeout:120000});
 const position=await page.evaluate(()=>window.ABYSS.camera.position.toArray());
 assert(Math.hypot(position[0]+520,position[2]-300)<250,'portal arrival is in target area');
 assert.deepEqual(errors,[]);
 console.log('PASS: map open/close, dolphin and pause toggles, seven-choice portal and Roseglass arrival.');
 console.log('Browser errors:',JSON.stringify(errors),'arrival:',position);
} finally { await browser.close(); }
