import assert from 'node:assert/strict';
import {retryableAsset} from '../src/core/retryable-asset.js';
let now=0,attempts=0,errors=0,release;
const ensure=retryableAsset(async()=>{attempts++;if(attempts===1)throw new Error('transient');await new Promise(r=>release=r);return true;},
 {retryDelayMs:5000,now:()=>now,onError:()=>errors++});
const first=ensure(),shared=ensure();assert.equal(first,shared,'concurrent requests share one attempt');
assert.equal(await first,false);assert.equal(attempts,1);assert.equal(errors,1);
assert.equal(await ensure(),false);assert.equal(attempts,1,'automatic retries respect the cooldown');
const forced=ensure(true),alsoShared=ensure();assert.equal(forced,alsoShared,'explicit retry is shared');
await Promise.resolve();assert.equal(attempts,2);release();assert.equal(await forced,true);
now+=100000;assert.equal(await ensure(),true);assert.equal(attempts,2,'success remains cached');
let attempts2=0;now=0;
const automatically=retryableAsset(()=>++attempts2>1,{retryDelayMs:5000,now:()=>now});
assert.equal(await automatically(),false);now=4999;assert.equal(await automatically(),false);assert.equal(attempts2,1);
now=5000;assert.equal(await automatically(),true);assert.equal(attempts2,2,'nearby prefetch can retry after cooldown');
console.log('PASS: asset attempts are shared, successful detail is cached, temporary failures back off and both automatic/explicit retries recover.');
