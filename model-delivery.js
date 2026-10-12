import {MODEL_DELIVERY} from './model-delivery-manifest.js';
import {inkSHA} from './surface-ink-contract.js';
import {LoadTask,LOAD_LIMITS,loadBytes,decompressBytes,loadTrace,loadError} from './load-trace.js?v=android-readiness-v1';
let pending,verified;
// Delivery changes only. Original compressed and decompressed hashes remain
// mandatory; a stale attempt cannot replace the next attempt's promise.
export function resetModelDelivery(){pending=undefined;}
export function deliveredModel({task,retry=false}={}){
 if(verified){loadTrace.event('glb-cache','PASS',{cache:'verified',bytes:verified.byteLength});return Promise.resolve(verified);}
 if(pending&&(!task||pending.task===task))return pending.promise;
 const owned=!task;task||=new LoadTask('model-delivery',{timeoutMs:LOAD_LIMITS.network});const entry={task};pending=entry;
 entry.promise=(async()=>{try{
  const zip=await loadBytes(new URL('./assets/teapot.glb.gz',import.meta.url),task,'glb-fetch',{retry});
  await task.run('glb-zip-sha',async()=>{if(zip.byteLength!==MODEL_DELIVERY.gzipBytes||await inkSHA(zip)!==MODEL_DELIVERY.gzipSHA256)throw loadError('GLB_TRANSPORT_SHA','glb-zip-sha');});
  const bytes=await decompressBytes(zip,task,'glb-decompress');
  await task.run('glb-raw-sha',async()=>{if(bytes.byteLength!==MODEL_DELIVERY.rawBytes||await inkSHA(bytes)!==MODEL_DELIVERY.rawSHA256)throw loadError('GLB_SOURCE_SHA','glb-raw-sha');});
  task.check();verified=bytes;if(owned)task.finish();return bytes;
 }catch(e){if(owned){task.cancel('FAILED');task.finish('ERROR',e);}throw e;}finally{if(pending===entry)pending=undefined;}})();return entry.promise;
}
export async function loadDelivered(view,level,options={}){
 if(view.cachedFamily?.digest===level.assetSHA256)return view.load(level,options);
 const bytes=await deliveredModel(options);options.task?.check();if(level.assetSHA256!==MODEL_DELIVERY.rawSHA256)throw loadError('CERTIFICATE_SHA','glb-raw-sha');
 const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));try{const result=await view.load({...level,asset:url},options);verified=undefined;return result;}finally{URL.revokeObjectURL(url);}
}
