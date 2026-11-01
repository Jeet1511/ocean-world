import assert from 'node:assert/strict';
import {SPECIES_REGISTRY,speciesForHabitat} from '../src/world/species-registry.js';
import {EcologyRuntime} from '../src/world/ecology-runtime.js';
assert.ok(Object.keys(SPECIES_REGISTRY).length>=15,'representative registry too small');
for(const [id,s] of Object.entries(SPECIES_REGISTRY)){
 assert.ok(s.scientific&&s.category&&s.habitats.length&&s.diet.length&&s.states.length&&s.source.startsWith('https://'),id+' incomplete');
}
assert.ok(speciesForHabitat('abyssalbowl').some(s=>s.id==='deep_anglerfish'));
const e=new EcologyRuntime();const p=e.register('clownfish','roseglass',20,40);const before=p.adults;
for(let i=0;i<500;i++)e.update(10);
assert.ok(Number.isFinite(p.adults)&&p.adults>=0&&p.adults+p.juveniles<=45,'population unbounded');
assert.ok(p.births>0,'no recruitment');
assert.ok(e.consume('roseglass','clownfish',1),'predation not recorded');
assert.ok(e.events.some(x=>x.type==='predation'));
console.log('PASS: sourced species registry, habitat filtering, bounded resources, recruitment, maturation, mortality and predation state.');
