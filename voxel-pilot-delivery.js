import {PILOT} from './voxel-pilot-manifest.js';import {levelFromCertificate} from './levels.js';import {validateLevel} from './puzzle.js';import {inkSHA} from './surface-ink-contract.js';
import {loadBytes,decompressBytes,loadError} from './load-trace.js?v=android-readiness-v1';
let certificate,certificatePending,modelPending,verified,inkModule;
export function resetPilotDelivery(){certificatePending=undefined;modelPending=undefined;inkModule?.resetPilotInk();}
export async function pilotCertificate(task,{retry=false}={}){
 if(certificate)return certificate;if(certificatePending?.task===task)return certificatePending.promise;const entry={task};certificatePending=entry;
 entry.promise=(async()=>{try{const b=await loadBytes(new URL('./assets/voxel-arch02.json',import.meta.url),task,'pilot-certificate-fetch',{retry,timeoutMs:15000});return await task.run('pilot-certificate-sha',async()=>{if(b.byteLength!==PILOT.certificateBytes||await inkSHA(b)!==PILOT.certificateSHA256)throw loadError('PILOT_CERTIFICATE_SHA','pilot-certificate-sha');const cert=levelFromCertificate(JSON.parse(new TextDecoder().decode(b)));if(cert.id!==PILOT.id||cert.assetSHA256!==PILOT.rawSHA256||cert.pieces.length!==18||cert.mechanicalProof.gateSHA256!==PILOT.nativeGateSHA256||validateLevel(cert).length)throw loadError('PILOT_CERTIFICATE_INVALID','pilot-certificate-sha');task.check();certificate={...cert,asset:'./assets/voxel-arch02.glb'};return certificate;});}finally{if(certificatePending===entry)certificatePending=undefined;}})();return entry.promise;
}
async function delivered(task,{retry=false}={}){if(verified)return verified;if(modelPending?.task===task)return modelPending.promise;const entry={task};modelPending=entry;
 entry.promise=(async()=>{try{const zip=await loadBytes(new URL('./assets/voxel-arch02.glb.gz',import.meta.url),task,'glb-fetch',{retry,timeoutMs:15000});await task.run('glb-zip-sha',async()=>{if(zip.byteLength!==PILOT.gzipBytes||await inkSHA(zip)!==PILOT.gzipSHA256)throw loadError('PILOT_TRANSPORT_SHA','glb-zip-sha');});const bytes=await decompressBytes(zip,task,'glb-decompress');await task.run('glb-raw-sha',async()=>{if(bytes.byteLength!==PILOT.rawBytes||await inkSHA(bytes)!==PILOT.rawSHA256)throw loadError('PILOT_SOURCE_SHA','glb-raw-sha');});task.check();verified=bytes;return bytes;}finally{if(modelPending===entry)modelPending=undefined;}})();return entry.promise;
}
export async function loadPilotDelivered(view,level,{task,retry=false,...options}){
 if(level.assetSHA256!==PILOT.rawSHA256)throw loadError('PILOT_CERTIFICATE_BINDING','glb-raw-sha');inkModule=await task.run('module-import',()=>import('./voxel-pilot-ink.js'),{timeoutMs:15000});task.check();const config={...options,task,retry,inkLoader:inkModule.loadPilotInk,inkPrepare:inkModule.preparePilotInk,attributes:['color']};
 if(view.cachedFamily?.digest===level.assetSHA256)return view.load(level,config);
 const bytes=await delivered(task,{retry});task.check();const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));try{const result=await view.load({...level,asset:url},config);verified=undefined;return result;}finally{URL.revokeObjectURL(url);}
}
