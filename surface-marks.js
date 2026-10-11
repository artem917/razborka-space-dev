import * as THREE from 'three';
import {DecalGeometry} from './vendor/geometries/DecalGeometry.js';
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],V=a=>new THREE.Vector3(...a);
// One immutable stencil palette. Availability is deliberately NOT an input.
export function metalInk(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
 const path=new Path2D('M 102 215 L 154 215 L 154 112 L 205 112 L 128 34 L 51 112 L 102 112 Z');
 c.strokeStyle='#efdfbc';c.lineWidth=16;c.lineJoin='round';c.stroke(path);c.fillStyle='#122f37';c.fill(path);
 // Restrained constant paint chips. They do not encode blocking state.
 c.globalCompositeOperation='destination-out';for(const[x,y,w,h]of[[110,180,3,5],[145,140,3,3],[92,91,4,2]])c.fillRect(x,y,w,h);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.35,side:THREE.FrontSide,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
}
export function surfaceMarks(view,ray,material){
 const d=V(view.piece.dir),box=view.box,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),shell=view.piece.stage==='shell';
 const baseLength=view.piece.id==='lid'?.18:view.piece.id==='base'?.16:view.piece.core?.16:shell?.34:.22;
 const inverse=view.group.matrixWorld.clone().invert(),geometries=[],marks=[],hosts=view.meshes.filter(m=>!m.userData.decal_surface);
 // Painted-panel anchors avoid energy glass, fasteners and the tall antenna.
 if(view.piece.id==='lid')center.set(0,2.64,0);
 if(view.piece.id==='upper'){center.y=2.09;center.x=-.23;}
 if(view.piece.id==='front'){center.y=1.48;center.x=.36;}
 if(view.piece.id==='base')center.y=.21;
 if(view.piece.id==='left'){center.x=-.72;center.y=1.45;center.z=0;}
 if(view.piece.id==='right'){center.x=.86;center.y=1.45;center.z=0;}
 for(const axis of axes){const n=V(axis);if(Math.abs(n.dot(d))>.01)continue;const side=d.clone().cross(n).normalize(),orientation=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,d,n));let chosen;
  for(const scale of [1,.78,.62]){if(chosen)break;const length=baseLength*scale;
   for(const[along,across]of[[0,0],[-.20,0],[.20,0],[0,-.20],[0,.20]]){
    const sample=center.clone().addScaledVector(d,along*Math.min(size.length(),1)).addScaledVector(side,across*Math.min(size.length(),1));ray.set(sample.clone().addScaledVector(n,5),n.clone().negate());
    const hit=ray.intersectObjects(hosts,false).find(h=>h.face&&h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).dot(n)>.45);if(!hit)continue;
    const projection=new DecalGeometry(hit.object,hit.point,orientation,new THREE.Vector3(length*.74,length,shell?.55:.075));
    // Keep only outward, visible host triangles. A deep curved-shell projector
    // must not stamp the inside wall or another disconnected metal surface.
    const pos=projection.attributes.position,norm=projection.attributes.normal,sourceUV=projection.attributes.uv,positions=[],normals=[],uvs=[];
    for(let i=0;i+2<pos.count;i+=3){const middle=new THREE.Vector3(),normal=new THREE.Vector3();for(let j=0;j<3;j++){middle.add(new THREE.Vector3().fromBufferAttribute(pos,i+j));normal.add(new THREE.Vector3().fromBufferAttribute(norm,i+j));}middle.multiplyScalar(1/3);if(normal.normalize().dot(n)<.35)continue;ray.set(middle.clone().addScaledVector(n,2),n.clone().negate());const outside=ray.intersectObject(hit.object,false)[0];if(!outside||outside.point.distanceTo(middle)>2e-5)continue;for(let j=0;j<3;j++){positions.push(pos.getX(i+j),pos.getY(i+j),pos.getZ(i+j));normals.push(norm.getX(i+j),norm.getY(i+j),norm.getZ(i+j));uvs.push(sourceUV.getX(i+j),sourceUV.getY(i+j));}}
    projection.dispose();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));const uv=geometry.attributes.uv;
    if(!uv?.count){geometry.dispose();continue;}let u0=1,u1=0,v0=1,v1=0;for(let i=0;i<uv.count;i++){u0=Math.min(u0,uv.getX(i));u1=Math.max(u1,uv.getX(i));v0=Math.min(v0,uv.getY(i));v1=Math.max(v1,uv.getY(i));}
    if(u0>.16||u1<.84||v0>.14||v1<.86){geometry.dispose();continue;}
    // DecalGeometry clips the HOST triangles. No normal-space spatial lift.
    // Check triangle centres against the real parent surface, not its AABB.
    const p=geometry.attributes.position;let maxSurfaceGap=0,samples=0;for(let i=0;i+2<p.count;i+=Math.max(3,Math.floor(p.count/45/3)*3)){
     const point=new THREE.Vector3();for(let j=0;j<3;j++)point.add(new THREE.Vector3().fromBufferAttribute(p,i+j));point.multiplyScalar(1/3);ray.set(point.clone().addScaledVector(n,.1),n.clone().negate());const surface=ray.intersectObject(hit.object,false).find(h=>Math.abs(h.distance-.1)<.002);if(surface){maxSurfaceGap=Math.max(maxSurfaceGap,surface.point.distanceTo(point));samples++;}
    }
    if(!samples||maxSurfaceGap>2e-5){geometry.dispose();continue;}
    const tip=hit.point.clone().addScaledVector(d,length*.36),tail=hit.point.clone().addScaledVector(d,-length*.36);
    chosen={geometry,mark:{normal:axis,anchor:hit.point.clone().applyMatrix4(inverse),tip:tip.applyMatrix4(inverse),tail:tail.applyMatrix4(inverse),length,sourceMesh:hit.object.uuid,surfaceGap:maxSurfaceGap,surfaceSamples:samples,vectorBasis:[...view.piece.dir],uvCoverage:[u0,u1,v0,v1]}};break;
   }
  }
  if(chosen){chosen.geometry.applyMatrix4(inverse);geometries.push(chosen.geometry);marks.push(chosen.mark);}
 }
 if(!marks.length)throw Error('Не найдено читаемой поверхности для маркировки '+view.piece.id);
 const mesh=new THREE.Mesh(mergeGeometries(geometries,false),material);for(const g of geometries)g.dispose();mesh.userData.piece=view.piece.id;mesh.userData.decal_surface=true;mesh.userData.marking=true;
 view.group.add(mesh);view.marks=marks;view.arrowMesh=mesh;return mesh;
}
