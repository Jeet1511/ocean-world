import {SPECIES_REGISTRY} from './species-registry.js?rev=37';
const HABITATS=['glasshorizon','roseglass','verdant','aurel','azurespan','floodednave','abyssalbowl'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class EcologyRuntime{
 constructor(seed=417){this.seed=seed;this.acc=0;this.clock=0;this.events=[];this.habitats={};
  for(const h of HABITATS)this.habitats[h]={plankton:h==='abyssalbowl'?.34:.72,algae:['glasshorizon','roseglass','verdant'].includes(h)?.78:.18,detritus:.35,coral:h==='roseglass'?.9:h==='glasshorizon'?.5:.12,pressure:0,populations:{}};
 }
 register(id,habitat,count,capacity=count*1.35){const h=this.habitats[habitat],bio=SPECIES_REGISTRY[id];if(!h||!bio)return null;return h.populations[id]??={adults:count,juveniles:0,eggs:0,capacity,energy:.72,health:1,births:0,deaths:0};}
 consume(habitat,id,n=1){const p=this.habitats[habitat]?.populations[id];if(!p)return false;const take=Math.min(n,p.adults+p.juveniles);if(!take)return false;const j=Math.min(p.juveniles,take);p.juveniles-=j;p.adults-=take-j;p.deaths+=take;this.event('predation',{habitat,id,count:take});return true;}
 event(type,data){this.events.push({time:this.clock,type,...data});if(this.events.length>128)this.events.shift();}
 update(dt){this.acc+=Math.min(dt,1);while(this.acc>=10){this.acc-=10;this.step(10);}}
 step(seconds){this.clock+=seconds;for(const [hid,h] of Object.entries(this.habitats)){
   h.plankton=clamp(h.plankton+(.006-h.pressure*.002),0,1);h.algae=clamp(h.algae+(.004-h.pressure*.003),0,1);h.detritus=clamp(h.detritus+.002,0,1);
   let consumers=0;
   for(const [id,p] of Object.entries(h.populations)){const b=SPECIES_REGISTRY[id],resource=b.diet.some(x=>/algae|seagrass/.test(x))?h.algae:b.diet.some(x=>/plankton|krill/.test(x))?h.plankton:clamp((h.detritus+.5)/1.5,0,1);
    const total=p.adults+p.juveniles,ratio=total/Math.max(1,p.capacity);p.energy=clamp(p.energy+(resource-.48)*.015,0,1);p.health=clamp(p.health+(p.energy-.28)*.006,0,1);consumers+=total/p.capacity;
    // Aggregate distant life cycle: slow, bounded recruitment with juvenile lag.
    if(p.adults>=2&&p.energy>.62&&ratio<.9){const eggs=p.adults*.0008*seconds;p.eggs+=eggs;}
    const hatch=Math.min(p.eggs,p.eggs*.018);p.eggs-=hatch;p.juveniles+=hatch;
    const mature=Math.min(p.juveniles,p.juveniles*.006);p.juveniles-=mature;p.adults+=mature;p.births+=mature;
    if(p.health<.18||ratio>1.08){const loss=Math.min(total,total*.002*seconds);const j=Math.min(p.juveniles,loss);p.juveniles-=j;p.adults-=loss-j;p.deaths+=loss;}
   }
   h.pressure=clamp(consumers/Math.max(1,Object.keys(h.populations).length),0,1.5);
  }}
 snapshot(){return JSON.parse(JSON.stringify({clock:this.clock,habitats:this.habitats,events:this.events}));}
}
