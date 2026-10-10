// Continuous translating-triangle SAT. Native gate axes and tolerances.
// Projected hash is broad phase only. No frame sampling or box solid proxies.
export const MESH_EPS=1e-6,TRAVEL=6;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
const triangle=(data,i)=>[Array.from(data.subarray(i*9,i*9+3)),Array.from(data.subarray(i*9+3,i*9+6)),Array.from(data.subarray(i*9+6,i*9+9))],edges=t=>[sub(t[1],t[0]),sub(t[2],t[1]),sub(t[0],t[2])];
function bary(p,t){const u=sub(t[1],t[0]),v=sub(t[2],t[0]),w=sub(p,t[0]),uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),wu=dot(w,u),wv=dot(w,v),den=uu*vv-uv*uv;if(den<1e-24)return[-1,-1,-1];const a=(wu*vv-wv*uv)/den,b=(wv*uu-wu*uv)/den;return[1-a-b,a,b];}
function proper(a,b){
 const na=unit(cross(sub(a[1],a[0]),sub(a[2],a[0]))),nb=unit(cross(sub(b[1],b[0]),sub(b[2],b[0])));
 if(Math.abs(dot(na,nb))>1-1e-9){if(Math.abs(dot(sub(a[0],b[0]),nb))>MESH_EPS)return false;
  const drop=na.map(Math.abs).indexOf(Math.max(...na.map(Math.abs))),ax=[0,1,2].filter(i=>i!==drop),cr=(u,v)=>u[0]*v[1]-u[1]*v[0],su=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  let poly=a.map(p=>ax.map(i=>p[i]));const clip=b.map(p=>ax.map(i=>p[i])),orientation=cr(su(clip[1],clip[0]),su(clip[2],clip[0]))>0?1:-1;
  for(let i=0;i<3;i++){const p=clip[i],q=clip[(i+1)%3],next=[];if(!poly.length)return false;for(let j=0;j<poly.length;j++){const s=poly[j],e=poly[(j+1)%poly.length],ds=orientation*cr(su(q,p),su(s,p)),de=orientation*cr(su(q,p),su(e,p));if(ds>=-1e-12)next.push(s);if((ds<0)!==(de<0))next.push(s.map((v,k)=>v+(e[k]-v)*ds/(ds-de)));}poly=next;}
  return poly.length>=3&&Math.abs(poly.reduce((n,p,i)=>n+cr(p,poly[(i+1)%poly.length]),0))/2>1e-10;
 }
 const points=[];for(const[t,o,n]of[[a,b,nb],[b,a,na]]){const values=t.map(p=>dot(sub(p,o[0]),n));for(let i=0;i<3;i++){const j=(i+1)%3,s=values[i],e=values[j];if(Math.abs(s)<1e-10&&Math.min(...bary(t[i],o))>=-1e-7)points.push(t[i]);if(s*e<0){const p=add(t[i],mul(sub(t[j],t[i]),s/(s-e)));if(Math.min(...bary(p,o))>=-1e-7)points.push(p);}}}
 if(points.length<2)return false;const line=unit(cross(na,nb));points.sort((p,q)=>dot(p,line)-dot(q,line));if(dot(sub(points.at(-1),points[0]),line)<MESH_EPS)return false;const middle=mul(add(points[0],points.at(-1)),.5);return Math.min(...bary(middle,a))>1e-7&&Math.min(...bary(middle,b))>1e-7;
}
export function triangleContact(a,b,d){
 const ea=edges(a),eb=edges(b),na=unit(cross(ea[0],ea[1])),nb=unit(cross(eb[0],eb[1])),coplanar=Math.abs(dot(na,nb))>1-1e-8&&Math.abs(dot(sub(b[0],a[0]),na))<1e-8,vn=dot(d,na);
 if(coplanar&&Math.abs(vn)<1e-10)return Infinity;let enter=-Infinity,exit=Infinity;
 const axes=[na,nb,...ea.flatMap(e=>eb.map(f=>cross(e,f))),...ea.map(e=>cross(na,e)),...eb.map(e=>cross(nb,e))];
 for(let axis of axes){const length=norm(axis);if(length<=1e-11)continue;axis=mul(axis,1/length);const pa=a.map(p=>dot(axis,p)),pb=b.map(p=>dot(axis,p)),amin=Math.min(...pa),amax=Math.max(...pa),bmin=Math.min(...pb),bmax=Math.max(...pb),v=dot(axis,d),margin=Math.min(amax-amin,bmax-bmin)>1e-9?MESH_EPS:0;
  if(Math.abs(v)<1e-11){if(amax<bmin+margin||bmax<amin+margin)return Infinity;continue;}const t0=(bmin+margin-amax)/v,t1=(bmax-margin-amin)/v;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));if(exit<Math.max(enter,0)-1e-9||enter>=TRAVEL-1e-8)return Infinity;
 }
 const into=coplanar&&dot(na,nb)<-.999999&&vn>1e-10&&enter<=1e-8&&exit>=-1e-8;if(!(into||(exit>=Math.max(enter,0)-1e-9&&exit>1e-8&&enter<TRAVEL-1e-8)))return Infinity;
 const start=Math.max(enter,0),at=into?start:(start+Math.min(TRAVEL,exit))/2;return proper(a.map(p=>add(p,mul(d,at))),b)?start:Infinity;
}
export class TriangleMesh{
 constructor(data){this.data=data;this.count=data.length/9;this.lo=new Float64Array(this.count*3);this.hi=new Float64Array(this.count*3);this.min=[Infinity,Infinity,Infinity];this.max=[-Infinity,-Infinity,-Infinity];this.hashes=new Map();for(let n=0;n<this.count;n++)for(let a=0;a<3;a++){const values=[data[n*9+a],data[n*9+3+a],data[n*9+6+a]],lo=Math.min(...values),hi=Math.max(...values);this.lo[n*3+a]=lo;this.hi[n*3+a]=hi;this.min[a]=Math.min(this.min[a],lo);this.max[a]=Math.max(this.max[a],hi);}}
 index(axis){if(this.hashes.has(axis))return this.hashes.get(axis);const other=[0,1,2].filter(i=>i!==axis),grid=new Map();for(let n=0;n<this.count;n++){const lo=other.map(a=>Math.floor(this.lo[n*3+a]/.14)),hi=other.map(a=>Math.floor(this.hi[n*3+a]/.14));for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(n);}}const r={other,grid};this.hashes.set(axis,r);return r;}
}
export function meshContact(a,b,d){
 const axis=d.findIndex(v=>v!==0),other=[0,1,2].filter(i=>i!==axis);if(other.some(i=>a.max[i]<=b.min[i]+MESH_EPS||b.max[i]<=a.min[i]+MESH_EPS))return null;
 if([0,1,2].some(i=>Math.max(a.max[i],a.max[i]+d[i]*TRAVEL)<b.min[i]-MESH_EPS||Math.min(a.min[i],a.min[i]+d[i]*TRAVEL)>b.max[i]+MESH_EPS))return null;
 const{grid}=b.index(axis);
 for(let i=0;i<a.count;i++){const lo=[0,1,2].map(k=>a.lo[i*3+k]),hi=[0,1,2].map(k=>a.hi[i*3+k]);if([0,1,2].some(k=>Math.max(hi[k],hi[k]+d[k]*TRAVEL)<b.min[k]-MESH_EPS||Math.min(lo[k],lo[k]+d[k]*TRAVEL)>b.max[k]+MESH_EPS))continue;
  const qlo=other.map(k=>Math.floor(lo[k]/.14)),qhi=other.map(k=>Math.floor(hi[k]/.14)),ids=new Set();for(let x=qlo[0];x<=qhi[0];x++)for(let y=qlo[1];y<=qhi[1];y++)for(const id of grid.get(x+','+y)||[])ids.add(id);
  let ta;for(const j of ids){if([0,1,2].some(k=>b.hi[j*3+k]<Math.min(lo[k],lo[k]+d[k]*TRAVEL)-MESH_EPS||b.lo[j*3+k]>Math.max(hi[k],hi[k]+d[k]*TRAVEL)+MESH_EPS))continue;ta||=triangle(a.data,i);if(norm(cross(sub(ta[1],ta[0]),sub(ta[2],ta[0])))<=1e-11)continue;const tb=triangle(b.data,j);if(norm(cross(sub(tb[1],tb[0]),sub(tb[2],tb[0])))<=1e-11)continue;const distance=triangleContact(ta,tb,d);if(Number.isFinite(distance))return{distance,movingTriangle:i,obstacleTriangle:j};}
 }return null;
}
export function meshGraph(parts,progress=()=>{}){const meshes=new Map(parts.map(p=>[p.id,new TriangleMesh(p.triangles)])),graph={};let pairs=0;for(let i=0;i<parts.length;i++){const p=parts[i];graph[p.id]=[];for(const q of parts){if(p.id===q.id)continue;pairs++;if(meshContact(meshes.get(p.id),meshes.get(q.id),p.dir))graph[p.id].push(q.id);}progress(i+1,parts.length);}return{graph,pairs};}
