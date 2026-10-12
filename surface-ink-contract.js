// Shared by the offline baker and runtime: bind paint to its actual carrier meshes.
export async function inkSHA(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function carrierSHA(view){
 const chunks=[],header={node:view.piece.node||view.piece.id,dir:view.piece.dir,matrix:view.group.matrixWorld.toArray(),meshes:[]};
 for(const mesh of view.meshes){const row={paint:!!mesh.userData.decal_surface,matrix:mesh.matrixWorld.toArray(),attributes:[]};
  for(const name of ['position','normal','uv']){const a=mesh.geometry.attributes[name];if(!a)throw Error('Missing ink carrier attribute');const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);chunks.push(bytes);row.attributes.push({name,type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,bytes:bytes.byteLength});}header.meshes.push(row);
 }
 const encoded=new TextEncoder().encode(JSON.stringify(header)),all=new Uint8Array(encoded.length+chunks.reduce((n,c)=>n+c.length,0));all.set(encoded);let offset=encoded.length;for(const c of chunks){all.set(c,offset);offset+=c.length;}return inkSHA(all);
}
export function serialMarks(marks){return marks.map(m=>{const row={...m};for(const key of ['normalLocal','anchor','tip','tail'])row[key]=m[key].toArray();row.inkPoints=m.inkPoints.map(p=>p.toArray());return row;});}
