export function levelFromCertificate(data) {
  if(data.pieces.length!==15 || data.pathDistance!==6 || !/^[a-f0-9]{64}$/.test(data.assetSHA256)) throw Error('Invalid native mesh certificate');
  return {...data,parts:15,reaction:'Чай готов. Чайник улетел.',pieces:data.pieces.map(p=>({...p,dir:Object.freeze([...p.dir]),pathBlockers:Object.freeze(p.pathBlockers.map(b=>Object.freeze({...b})))}))};
}
