import * as THREE from 'three';
const V=a=>new THREE.Vector3(...a),axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
// A view-correct stencil on the REAL carrier triangles, not a billboard mesh.
// Its anchor belongs to the module; its direction is the physical signed axis.
// Camera projection cannot bend one copy into a different extraction direction.
export function surfaceInk(view,ray,atlas){
 const d=V(view.piece.dir),box=view.box,center=box.getCenter(new THREE.Vector3()),inverse=view.group.matrixWorld.clone().invert(),hosts=view.meshes.filter(m=>!m.userData.decal_surface);
 let length=view.piece.id==='lid'?.24:view.piece.id==='base'?.18:view.piece.core?.18:view.piece.stage==='shell'?.34:.22;
 if(view.piece.id==='lid')center.set(0,2.64,0);
 if(view.piece.id==='upper'){center.y=2.09;center.x=.24;}
 if(view.piece.id==='front'){center.y=1.48;center.x=.36;}
 if(view.piece.id==='base'){center.y=.17;center.x=.53;}
 if(view.piece.id==='left'){center.set(-1.22,2.03,0);length=.25;}
 if(view.piece.id==='right'){center.set(.56,1.35,.55);length=.25;view.paintBox=new THREE.Box3(new THREE.Vector3(.44,.75,.45),new THREE.Vector3(.90,2.15,.90));}
 if(view.piece.id==='rear'){center.z=-.78;center.y=1.55;}
 if(view.piece.id==='cradle')center.y=1.04;
 const marks=[],size=box.getSize(new THREE.Vector3());
 for(const axis of axes){const n=V(axis),perp=[0,1,2].filter(i=>!axis[i]);let hit;
  // Ring-shaped modules have a genuine central hole. Sample their perimeter
  // for top/bottom attachment points instead of anchoring ink inside the hole.
  for(const base of[center,box.getCenter(new THREE.Vector3())]){for(const offset of[[0,0],[-.28,0],[.28,0],[0,-.28],[0,.28]]){const sample=base.clone();for(let i=0;i<2;i++)sample.setComponent(perp[i],sample.getComponent(perp[i])+offset[i]*size.getComponent(perp[i]));ray.set(sample.addScaledVector(n,5),n.clone().negate());hit=ray.intersectObjects(hosts,false).find(h=>h.face&&(!view.paintBox||view.paintBox.containsPoint(h.point))&&h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).dot(n)>.35);if(hit)break;}if(hit)break;}if(!hit)continue;
  const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize(),anchor=hit.point.clone().applyMatrix4(inverse),normalLocal=normal.clone().transformDirection(inverse);
  marks.push({normal:axis,normalLocal,anchor,tip:hit.point.clone().addScaledVector(d,length*.36).applyMatrix4(inverse),tail:hit.point.clone().addScaledVector(d,-length*.36).applyMatrix4(inverse),length,surfaceGap:0,surfaceSamples:1,vectorBasis:[...view.piece.dir]});
 }
 if(!marks.length)throw Error('No actual surface anchor: '+view.piece.id);
 // Conservative surface patches: copy exact parent vertices, with no spatial
 // lift, added plates, proxy boxes or changes to any collision geometry.
 const positions=[],radius=length*1.8;
 for(const host of hosts){const p=host.geometry.attributes.position;for(let i=0;i+2<p.count;i+=3){const pts=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));const triBox=new THREE.Box3().setFromPoints(pts);if(!marks.some(m=>triBox.distanceToPoint(m.anchor)<=radius))continue;for(const q of pts)positions.push(q.x,q.y,q.z);}}
 const carrier=new THREE.BufferGeometry();carrier.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.FrontSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false,
  uniforms:{uInk:{value:atlas.map},uAnchor:{value:marks[0].anchor.clone()},uVector:{value:d.clone().transformDirection(view.group.matrix.clone().invert())},uLength:{value:length},uNormal:{value:marks[0].normalLocal.clone()}},
  vertexShader:`varying vec3 vView; varying vec3 vAnchor; varying vec3 vDirection; varying vec3 vNormal;
   uniform vec3 uAnchor,uVector,uNormal;
   void main(){vec4 p=modelViewMatrix*vec4(position,1.);vView=p.xyz;vAnchor=(modelViewMatrix*vec4(uAnchor,1.)).xyz;vDirection=(modelViewMatrix*vec4(uVector,0.)).xyz;vNormal=(modelViewMatrix*vec4(uNormal,0.)).xyz;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform sampler2D uInk;uniform float uLength;varying vec3 vView,vAnchor,vDirection,vNormal;
   void main(){float projected=length(vDirection.xy)/length(vDirection);if(projected<.10||normalize(vNormal).z<.12)discard;
    vec2 along=normalize(vDirection.xy),side=vec2(along.y,-along.x),delta=vView.xy-vAnchor.xy;
    vec2 uv=vec2(.5+dot(delta,side)/(uLength*.74),.5+dot(delta,along)/uLength);
    if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))||abs(vView.z-vAnchor.z)>uLength*2.)discard;
    vec4 ink=texture2D(uInk,uv);if(ink.a<.35)discard;gl_FragColor=ink;
    #include <colorspace_fragment>
   }`});
 // The audit references the same immutable sampler used by the shader.
 material.map=atlas.map;material.color=new THREE.Color(1,1,1);
 const mesh=new THREE.Mesh(carrier,material);mesh.userData.piece=view.piece.id;mesh.userData.decal_surface=true;mesh.userData.marking=true;
 view.group.add(mesh);view.marks=marks;view.arrowMesh=mesh;view.paintIndex=0;return mesh;
}
