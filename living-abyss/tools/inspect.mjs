import { chromium } from '/home/user/tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args:['--no-sandbox','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1000,height:600} });
page.on('pageerror', e=>console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:8099/index.html');
await page.waitForFunction('window.__READY===true',{timeout:300000});
await page.evaluate(()=>{document.getElementById('hud').style.display='none';document.getElementById('startNote').style.display='none';});

// solves a camera position with a clear line of sight to a target point
await page.evaluate(()=>{
  window.solveCam = (tx, ty, tz, R, minUp=6) => {
    const f = window.ABYSS.field;
    let best = null, bestScore = -1e9;
    for (let i=0;i<260;i++){
      const th = Math.random()*Math.PI*2;
      const ph = (Math.random()*0.75-0.18);        // mostly level, slight above/below
      const r = R*(0.72+Math.random()*0.55);
      const cx = tx + Math.cos(th)*Math.cos(ph)*r;
      const cz = tz + Math.sin(th)*Math.cos(ph)*r;
      let cy = ty + Math.sin(ph)*r;
      const gy = f.heightAt(cx,cz);
      if (cy < gy + minUp) cy = gy + minUp;
      if (cy > -4) cy = -4;
      // line of sight: how much rock is in the way?
      let blocked = 0, steps = 22;
      for (let s=1;s<steps;s++){
        const t = s/steps;
        const px = cx+(tx-cx)*t, pz = cz+(tz-cz)*t, py = cy+(ty-cy)*t;
        const h = f.heightAt(px,pz);
        if (h > py) blocked += (h-py);
      }
      // prefer open water behind the camera and a level-ish angle
      const score = -blocked/Math.max(1,steps) * 8 - Math.abs(cy-ty)*0.02 + Math.random()*2;
      if (score > bestScore){ bestScore = score; best = [cx,cy,cz,blocked]; }
    }
    return best;
  };
});

async function shoot(name, tx, ty, tz, R, fog=1, pitchBias=0){
  const cam = await page.evaluate(([tx,ty,tz,R,fog])=>{
    const c = window.solveCam(tx,ty,tz,R);
    window.ABYSS.setFog(fog);
    window.ABYSS.teleport(c[0],c[1],c[2],0,0);
    window.ABYSS.lookAt(tx,ty,tz);
    return c;
  }, [tx,ty,tz,R,fog]);
  await page.waitForTimeout(1400);
  await page.screenshot({path:`/tmp/shots/${name}.png`});
  console.log('·',name,'cam',cam.map(v=>Math.round(v)).join(','));
}

const g = await page.evaluate(()=>{const g=window.ABYSS.geology(); return {arches:g.arches, towers:g.towers};});
const big = g.arches.slice().sort((a,b)=>b.span-a.span)[0];
console.log('biggest arch span', big.span, 'crown', big.crown);
await shoot('k1_arch', big.p0[0], big.crown-25, big.p0[2], Math.max(180,big.span*0.55));
await shoot('k2_arch_clear', big.p0[0], big.crown-25, big.p0[2], Math.max(180,big.span*0.55), 0.10);
const t = g.towers.sort((a,b)=>b.h-a.h)[0];
await shoot('k3_tower', t.x, t.y+t.h*0.55, t.z, Math.max(140, t.h*1.1));
await shoot('k4_tower_clear', t.x, t.y+t.h*0.55, t.z, Math.max(140, t.h*1.1), 0.10);
await browser.close();
