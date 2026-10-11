export function levelFromCertificate(data) {
  if(!Array.isArray(data.pieces)||data.pieces.length<3||data.pieces.length>128||data.pathDistance!==6||!/^[a-f0-9]{64}$/.test(data.assetSHA256)) throw Error('Invalid native mesh certificate');
  if(data.schema===2&&(!data.mechanicalProof||data.mechanicalProof.deadlocks!==0||data.mechanicalProof.earlyCore!==0||data.mechanicalProof.allAxesPairs!==data.pieces.length*(data.pieces.length-1)*6||data.mechanicalProof.triangleSource!=='Actual GLB reimport'))throw Error('Missing full extraction proof');
  return {...data,parts:data.pieces.length,reaction:data.reaction||'Чай готов. Чайник улетел.',pieces:data.pieces.map(p=>({...p,dir:Object.freeze([...p.dir]),pathBlockers:Object.freeze(p.pathBlockers.map(b=>Object.freeze({...b})))}))};
}
export function libraryFromCertificate(data){if(data.schema!==2||!Array.isArray(data.levels)||data.levels.length<1||data.levels.length>8||new Set(data.levels.map(l=>l.id)).size!==data.levels.length)throw Error('Invalid bounded puzzle library');const levels=data.levels.map(levelFromCertificate);if(levels.some(l=>l.assetSHA256!==data.assetSHA256))throw Error('Mixed geometry certificates');return levels;}
