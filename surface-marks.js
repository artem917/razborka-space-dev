import * as THREE from 'three';
// Interpolate on actual clipped HOST triangles using the stencil UVs.
// Projector endpoints alone cannot prove the direction of curved painted ink.
export function pointAtUV(geometry,u,v,normal){
 const uv=geometry.attributes.uv,pos=geometry.attributes.position;
 let nearest=null,distance=-Infinity;
 for(let i=0;i+2<uv.count;i+=3){
  const ax=uv.getX(i),ay=uv.getY(i),bx=uv.getX(i+1),by=uv.getY(i+1),cx=uv.getX(i+2),cy=uv.getY(i+2),det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<1e-12)continue;
  const a=((by-cy)*(u-cx)+(cx-bx)*(v-cy))/det,b=((cy-ay)*(u-cx)+(ax-cx)*(v-cy))/det,c=1-a-b;
  if(Math.min(a,b,c)<-1e-6)continue;
  const point=new THREE.Vector3().fromBufferAttribute(pos,i).multiplyScalar(a).addScaledVector(new THREE.Vector3().fromBufferAttribute(pos,i+1),b).addScaledVector(new THREE.Vector3().fromBufferAttribute(pos,i+2),c);
  if(!normal)return point;if(point.dot(normal)>distance){distance=point.dot(normal);nearest=point;}
 }return nearest;
}
// One immutable stencil palette. Availability is deliberately NOT an input.
export function metalInk(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
 const path=new Path2D('M 102 215 L 154 215 L 154 112 L 205 112 L 128 34 L 51 112 L 102 112 Z');
 // Painted cream keyline stays legible on orange tubing and dark machinery.
 // It is ink on existing triangles, not a new plate or floating solid.
 c.strokeStyle='#fff2d4';c.lineWidth=30;c.lineJoin='round';c.stroke(path);c.fillStyle='#092630';c.fill(path);
 // Restrained constant paint chips. They do not encode blocking state.
 c.globalCompositeOperation='destination-out';for(const[x,y,w,h]of[[110,180,3,5],[145,140,3,3],[92,91,4,2]])c.fillRect(x,y,w,h);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 return new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.04,side:THREE.FrontSide,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
}
