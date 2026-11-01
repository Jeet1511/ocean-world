// Cache a successful asset load and share any in-flight attempt. A temporary
// failure can recover without hammering the network every animation frame;
// an explicit portal request may override the cooldown. The factory resolves
// truthy only when the full-quality asset is ready, and may throw on failure.
export function retryableAsset(factory,{retryDelayMs=5000,now=()=>performance.now(),onError=()=>{}}={}){
 let request=null,retryAt=-Infinity;
 const coolingDown=Promise.resolve(false);
 return function ensure(force=false){
  if(request)return request;
  if(!force&&now()<retryAt)return coolingDown;
  request=Promise.resolve().then(factory).then(
   value=>!!value,
   error=>{onError(error);return false;},
  ).then(ok=>{
   if(!ok){retryAt=now()+retryDelayMs;request=null;}
   return ok;
  });
  return request;
 };
}
