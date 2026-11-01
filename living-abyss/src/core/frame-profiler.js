// Low-allocation runtime frame profiler. Keeps a bounded ring buffer so long
// sessions do not grow the heap. Reports frame-time percentiles, 1%/0.1% lows,
// subsystem CPU times, renderer workload, memory and Long Animation Frames.
const SECTIONS=['controller','lod','atmosphere','flora','geology','hud','render'];
const percentile=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p)))]||0;
export class FrameProfiler{
 constructor(capacity=1800){
  this.capacity=capacity;this.frames=new Float32Array(capacity);this.index=0;this.count=0;
  this.sections={};this.starts={};for(const k of SECTIONS)this.sections[k]=new Float32Array(capacity);
  this.longFrames=[];this.lastWorkload={calls:0,triangles:0,points:0,geometries:0,textures:0,programs:0};
  this.frameStart=performance.now();this.enabled=true;
  if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame')){
   this.observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){
    this.longFrames.push({start:+e.startTime.toFixed(1),duration:+e.duration.toFixed(1),blocking:+e.blockingDuration.toFixed(1)});
    if(this.longFrames.length>64)this.longFrames.shift();
   }});this.observer.observe({type:'long-animation-frame',buffered:true});
  }
 }
 beginFrame(now=performance.now()){if(!this.enabled)return;this.frameStart=now;}
 begin(name){if(this.enabled)this.starts[name]=performance.now();}
 end(name){if(!this.enabled||this.starts[name]===undefined)return;this.sections[name][this.index]=performance.now()-this.starts[name];}
 endFrame(renderer,now=performance.now()){
  if(!this.enabled)return;this.frames[this.index]=now-this.frameStart;
  const info=renderer.info;
  this.lastWorkload={calls:info.render.calls,triangles:info.render.triangles,points:info.render.points,
   geometries:info.memory.geometries,textures:info.memory.textures,programs:info.programs?.length||0};
  this.index=(this.index+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);
 }
 reset(){this.index=0;this.count=0;this.longFrames.length=0;this.frames.fill(0);for(const a of Object.values(this.sections))a.fill(0);}
 report(){
  const vals=Array.from(this.frames.slice(0,this.count)).filter(Number.isFinite).sort((a,b)=>a-b);
  const n=vals.length,sum=vals.reduce((a,b)=>a+b,0),avg=n?sum/n:0;
  const section={};for(const [k,a] of Object.entries(this.sections)){
   const v=Array.from(a.slice(0,this.count));section[k]=+(v.reduce((x,y)=>x+y,0)/(v.length||1)).toFixed(3);
  }
  const heap=performance.memory?{usedMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1),
   totalMB:+(performance.memory.totalJSHeapSize/1048576).toFixed(1),limitMB:+(performance.memory.jsHeapSizeLimit/1048576).toFixed(1)}:null;
  const p99=percentile(vals,.99),p999=percentile(vals,.999);
  return {samples:n,frameMs:{avg:+avg.toFixed(2),median:+percentile(vals,.5).toFixed(2),p95:+percentile(vals,.95).toFixed(2),
   p99:+p99.toFixed(2),p999:+p999.toFixed(2),worst:+(vals[n-1]||0).toFixed(2)},
   fps:{average:+(avg?1000/avg:0).toFixed(1),low1:+(p99?1000/p99:0).toFixed(1),low01:+(p999?1000/p999:0).toFixed(1)},
   cpuSectionAvgMs:section,workload:this.lastWorkload,heap,longAnimationFrames:this.longFrames.slice(-10)};
 }
 async capture(seconds=10){this.reset();await new Promise(r=>setTimeout(r,Math.max(.25,seconds)*1000));return this.report();}
}
