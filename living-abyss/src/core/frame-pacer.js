// Bounded rendering cadence. This limits submitted frames, not GPU work per
// frame or device temperature; actual frame rate depends on the hardware.
export class FramePacer {
 constructor(){this.next=0;this.lastQuality=null;}
 shouldRender(now,quality){
  const interval=1000/(quality==='low'?30:60);
  if(this.lastQuality!==quality){this.lastQuality=quality;this.next=0;}
  if(this.next && now<this.next-.25)return false;
  if(!this.next || now-this.next>interval*2)this.next=now+interval;
  else this.next+=interval;
  return true;
 }
}
