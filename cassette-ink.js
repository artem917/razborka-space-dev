import {CASSETTE_INK} from './cassette-ink-manifest.js';
import {CASSETTE_ASSET} from './cassette-manifest.js';
import {validateInkCache} from './surface-ink-cache.js?v=android-readiness-v1';
import {inkSHA,carrierSHA} from './surface-ink-contract.js';
import {LoadTask,LOAD_LIMITS,loadBytes,decompressBytes,loadError} from './load-trace.js?v=android-readiness-v1';
let pending;
export function resetCassetteInk(){if(!pending?.cache)pending=undefined;}
export function loadCassetteInk({task,retry=false}={}){
 if(pending?.cache)return Promise.resolve(pending.cache);if(pending&&pending.task===task)return pending.promise;
 const owned=!task;task||=new LoadTask('cassette-ink',{timeoutMs:LOAD_LIMITS.network});const entry={task};pending=entry;
 entry.promise=(async()=>{try{
  const values=await Promise.all(['json','binary'].map(async(prefix,i)=>{const url='./assets/cassette001-ink.'+(i?'bin':'json')+'.gz',z=await loadBytes(new URL(url,import.meta.url),task,'ink-'+prefix+'-fetch',{retry});await task.run('ink-'+prefix+'-zip-sha',async()=>{if(z.byteLength!==CASSETTE_INK[prefix+'GzipBytes']||await inkSHA(z)!==CASSETTE_INK[prefix+'GzipSHA256'])throw loadError('CASSETTE_INK_TRANSPORT_SHA','ink-'+prefix+'-zip-sha');});return decompressBytes(z,task,'ink-'+prefix+'-decompress');}));
  const cache=await task.run('ink-raw-sha',async()=>{const[json,binary]=values;if(json.byteLength!==CASSETTE_INK.jsonBytes||await inkSHA(json)!==CASSETTE_INK.jsonSHA256||await inkSHA(binary)!==CASSETTE_INK.binarySHA256)throw loadError('CASSETTE_INK_SOURCE_SHA','ink-raw-sha');return validateInkCache(JSON.parse(new TextDecoder().decode(json)),binary,CASSETTE_INK);});
  task.check();entry.cache=cache;if(owned)task.finish();return cache;
 }catch(e){if(pending===entry)pending=undefined;if(owned){task.cancel('FAILED');task.finish('ERROR',e);}throw e;}})();return entry.promise;
}
export async function prepareCassetteInk(cache,level,views){
 if(level.family!=='cassette001'||level.assetSHA256!==CASSETTE_ASSET.rawSHA256||level.assetSHA256!==CASSETTE_INK.assetSHA256||cache.data.librarySHA256!==CASSETTE_ASSET.certificateSHA256||cache.data.parts.filter(p=>p.level===level.id).length!==views.size)throw loadError('CASSETTE_INK_BINDING','ink-prepare');
 await Promise.all([...views.values()].map(async view=>{const row=cache.parts.get(level.id+':'+view.piece.id);if(!row||row.node!==(view.piece.node||view.piece.id)||JSON.stringify(row.dir)!==JSON.stringify(view.piece.dir)||await carrierSHA(view)!==row.carrierSHA256)throw loadError('CASSETTE_INK_CARRIER','ink-prepare');}));return cache;
}
