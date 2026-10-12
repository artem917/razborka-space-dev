import * as THREE from 'three';
import {INK_CACHE} from './surface-ink-manifest.js';
import {inkSHA,carrierSHA} from './surface-ink-contract.js';
let pending;
const Types={Float32Array,Uint32Array};
function fail(message){throw Error('Проверенный кеш стрелок: '+message);}
export function validateInkCache(data,buffer,expected=INK_CACHE){
 if(data.schema!==1||data.assetSHA256!==expected.assetSHA256||data.librarySHA256!==expected.librarySHA256||data.algorithmSHA256!==expected.algorithmSHA256||data.marksSHA256!==expected.marksSHA256||buffer.byteLength!==expected.binaryBytes)fail('несогласованный источник');
 const parts=new Map();
 for(const row of data.parts){const key=row.level+':'+row.id;if(parts.has(key))fail('повтор детали');
  if(!Array.isArray(row.dir)||row.dir.length!==3||row.dir.filter(v=>v!==0).length!==1||!row.dir.every(v=>[-1,0,1].includes(v)))fail('направление');
  if(!/^[a-f0-9]{64}$/.test(row.carrierSHA256)||Object.keys(row.attributes).sort().join(',')!=='normal,position,uv')fail('геометрия носителя');
  for(const [name,a]of [...Object.entries(row.attributes),['index',row.index]]){const Type=Types[a.type];if(!Type||a.type!==(name==='index'?'Uint32Array':'Float32Array')||a.itemSize!==(name==='uv'?2:name==='index'?1:3)||a.normalized!==false||![a.offset,a.bytes].every(Number.isSafeInteger)||a.offset<0||a.offset%4||a.bytes<4||a.bytes%(4*a.itemSize)||a.offset+a.bytes>buffer.byteLength)fail('границы буфера');}
  const count=row.attributes.position.bytes/12;if(row.attributes.normal.bytes/12!==count||row.attributes.uv.bytes/8!==count||row.index.bytes/4!==count)fail('размер буфера');
  let end=0;for(const m of row.marks){if(m.start!==end||!Number.isSafeInteger(m.count)||m.count<3||m.count%3||m.start+m.count>count||m.uvFixed!==true||m.ownSamples!==19||m.inkPoints.length!==19||JSON.stringify(m.vectorBasis)!==JSON.stringify(row.dir))fail('разметка');
   for(const v of [m.normalLocal,m.anchor,m.tip,m.tail,...m.inkPoints])if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))fail('координаты разметки');end+=m.count;
  }if(end!==count)fail('неполная разметка');parts.set(key,row);
 }return {data,buffer,parts};
}
export function loadInkCache(){
 if(!pending)pending=(async()=>{const urls=['./assets/surface-ink.json.gz','./assets/surface-ink.bin.gz'];const [json,binary]=await Promise.all(urls.map(async (path,i)=>{const r=await fetch(new URL(path,import.meta.url));if(!r.ok)fail('не удалось загрузить '+path);const zipped=await r.arrayBuffer(),prefix=i?'binary':'json';if(zipped.byteLength!==INK_CACHE[prefix+'GzipBytes']||await inkSHA(zipped)!==INK_CACHE[prefix+'GzipSHA256'])fail('SHA-256 сжатого буфера');return new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}));
  if(json.byteLength!==INK_CACHE.jsonBytes||await inkSHA(json)!==INK_CACHE.jsonSHA256||await inkSHA(binary)!==INK_CACHE.binarySHA256)fail('SHA-256');return validateInkCache(JSON.parse(new TextDecoder().decode(json)),binary);
 })().catch(e=>{pending=undefined;throw e;});return pending;
}
export async function prepareInkCache(cache,level,views){
 if(level.assetSHA256!==INK_CACHE.assetSHA256)fail('GLB SHA-256');
 const rows=[...views.values()];if(cache.data.parts.filter(p=>p.level===level.id).length!==rows.length)fail('состав сборки');
 await Promise.all(rows.map(async view=>{const row=cache.parts.get(level.id+':'+view.piece.id);if(!row||row.node!==(view.piece.node||view.piece.id)||JSON.stringify(row.dir)!==JSON.stringify(view.piece.dir)||await carrierSHA(view)!==row.carrierSHA256)fail('реальная поверхность '+view.piece.id);}));return cache;
}
export function cachedSurfaceInk(view,atlas,cache,levelID){
 const row=cache.parts.get(levelID+':'+view.piece.id);if(!row)fail('нет детали');const geometry=new THREE.BufferGeometry();
 const attr=a=>{const Type=Types[a.type],copy=new Type(cache.buffer.slice(a.offset,a.offset+a.bytes));return new THREE.BufferAttribute(copy,a.itemSize,a.normalized).setUsage(a.usage);};
 for(const [name,a]of Object.entries(row.attributes))geometry.setAttribute(name,attr(a));
 // Visibility changes the index every camera pose; each load owns its array.
 geometry.setIndex(attr(row.index));const mesh=new THREE.Mesh(geometry,atlas.clone());Object.assign(mesh.userData,{piece:view.piece.id,decal_surface:true,marking:true});
 view.marks=row.marks.map(m=>{const mark={...m};for(const key of ['normalLocal','anchor','tip','tail'])mark[key]=new THREE.Vector3().fromArray(m[key]);mark.inkPoints=m.inkPoints.map(p=>new THREE.Vector3().fromArray(p));return mark;});
 view.group.add(mesh);view.arrowMesh=mesh;return mesh;
}
