import {CASSETTE_ASSET} from './cassette-manifest.js';
import {levelFromCertificate} from './levels.js';import {validateLevel} from './puzzle.js';
import {inkSHA} from './surface-ink-contract.js';
import {LoadTask,LOAD_LIMITS,loadBytes,decompressBytes,loadError} from './load-trace.js?v=android-readiness-v1';
let certificate,pendingCertificate,verified,pending,inkModule;
export function resetCassetteDelivery(){pending=undefined;pendingCertificate=undefined;inkModule?.resetCassetteInk();}
export async function cassetteCertificate(task,{retry=false}={}){
 if(certificate)return certificate;if(pendingCertificate&&pendingCertificate.task===task)return pendingCertificate.promise;
 const entry={task};pendingCertificate=entry;
 entry.promise=(async()=>{try{const bytes=await loadBytes(new URL('./assets/cassette001.json',import.meta.url),task,'cassette-library-fetch',{retry,timeoutMs:LOAD_LIMITS.library});return await task.run('cassette-library-sha',async()=>{if(bytes.byteLength!==CASSETTE_ASSET.certificateBytes||await inkSHA(bytes)!==CASSETTE_ASSET.certificateSHA256)throw loadError('CASSETTE_CERTIFICATE_SHA','cassette-library-sha');const level=levelFromCertificate(JSON.parse(new TextDecoder().decode(bytes)));if(level.id!=='cassette001'||level.family!=='cassette001'||level.assetSHA256!==CASSETTE_ASSET.rawSHA256||validateLevel(level).length)throw loadError('CASSETTE_CERTIFICATE_INVALID','cassette-library-sha');task.check();certificate=level;return level;});}finally{if(pendingCertificate===entry)pendingCertificate=undefined;}})();return entry.promise;
}
function deliveredCassette({task,retry=false}={}){
 if(verified)return Promise.resolve(verified);if(pending&&pending.task===task)return pending.promise;
 const owned=!task;task||=new LoadTask('cassette-model',{timeoutMs:LOAD_LIMITS.network});const entry={task};pending=entry;
 entry.promise=(async()=>{try{
  const zip=await loadBytes(new URL('./assets/cassette001.glb.gz',import.meta.url),task,'glb-fetch',{retry});
  await task.run('glb-zip-sha',async()=>{if(zip.byteLength!==CASSETTE_ASSET.gzipBytes||await inkSHA(zip)!==CASSETTE_ASSET.gzipSHA256)throw loadError('CASSETTE_TRANSPORT_SHA','glb-zip-sha');});
  const bytes=await decompressBytes(zip,task,'glb-decompress');await task.run('glb-raw-sha',async()=>{if(bytes.byteLength!==CASSETTE_ASSET.rawBytes||await inkSHA(bytes)!==CASSETTE_ASSET.rawSHA256)throw loadError('CASSETTE_SOURCE_SHA','glb-raw-sha');});task.check();verified=bytes;if(owned)task.finish();return bytes;
 }catch(e){if(owned){task.cancel('FAILED');task.finish('ERROR',e);}throw e;}finally{if(pending===entry)pending=undefined;}})();return entry.promise;
}
export async function loadCassetteDelivered(view,level,options={}){
 if(level.family!=='cassette001'||level.assetSHA256!==CASSETTE_ASSET.rawSHA256)throw loadError('CASSETTE_CERTIFICATE_SHA','glb-raw-sha');
 // This import (and its Three.js dependency) belongs only to an accepted order.
 const load=()=>import('./cassette-ink.js?v=cassette-v1');
 inkModule=options.task?await options.task.run('module-import',load,{timeoutMs:LOAD_LIMITS.module}):await load();options.task?.check();
 const config={...options,inkLoader:inkModule.loadCassetteInk,inkPrepare:inkModule.prepareCassetteInk,attributes:['color']};
 if(view.cachedFamily?.digest===level.assetSHA256)return view.load(level,config);
 const bytes=await deliveredCassette(options);options.task?.check();const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
 try{const result=await view.load({...level,asset:url},config);verified=undefined;return result;}finally{URL.revokeObjectURL(url);}
}
