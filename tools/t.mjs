import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
await p.setContent('<canvas id=c width=64 height=64></canvas><script>const gl=document.getElementById("c").getContext("webgl2");document.title = gl ? "WEBGL2 OK "+gl.getParameter(gl.VERSION) : "NO WEBGL";</script>');
console.log(await p.title());
await b.close();
