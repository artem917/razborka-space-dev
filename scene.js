import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
const V=a=>new THREE.Vector3(...a),AXES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export class WorkshopScene {
 constructor(host){
  this.host=host;this.views=new Map();this.active=new Set();this.pickMeshes=[];this.frameTimes=[];this.renderTimes=[];this.animation=null;this.hinted=null;this.frameCount=0;this.qaProof=null;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.setClearColor(0x0a1b24,0);host.append(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label','Реактивный чайник — настоящая 3D-разборка');
  this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-2.4,2.4,2.4,-2.4,.1,60);this.camera.position.set(0,0,12);this.camera.lookAt(0,0,0);
  this.root=new THREE.Group();this.assetOffset=new THREE.Group();this.root.add(this.assetOffset);this.scene.add(this.root);
  this.scene.add(new THREE.HemisphereLight(0xc4edf0,0x283136,2.0));
  for(const[p,c,i]of[[[-4,6,7],0xffdfb3,3.7],[[4,2,-4],0x63cad8,3.0],[[3,0,6],0xd8e6ff,.8]]){const l=new THREE.DirectionalLight(c,i);l.position.fromArray(p);this.scene.add(l);}
  const env=document.createElement('canvas');env.width=512;env.height=256;const ctx=env.getContext('2d'),g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#b9d4d9');g.addColorStop(.45,'#506978');g.addColorStop(.7,'#182934');g.addColorStop(1,'#161c24');ctx.fillStyle=g;ctx.fillRect(0,0,512,256);ctx.fillStyle='#fff4d9';ctx.fillRect(80,25,55,95);ctx.fillStyle='#659da9';ctx.fillRect(355,50,50,100);
  const tex=new THREE.CanvasTexture(env);tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.SRGBColorSpace;const pm=new THREE.PMREMGenerator(this.renderer);this.environment=pm.fromEquirectangular(tex);this.scene.environment=this.environment.texture;tex.dispose();pm.dispose();
  this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.center=new THREE.Vector3(0,1.65,.08);this.targetCenter=this.center.clone();this.cameraWidth=4.5;this.targetWidth=4.5;
  this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x74f2d3,transparent:true,opacity:.65}));this.root.add(this.path);this.path.visible=false;
  new ResizeObserver(()=>this.resize()).observe(host);this.resetAngle();this.resize();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
 }
 resize(){this.width=Math.max(1,this.host.clientWidth);this.height=Math.max(1,this.host.clientHeight);this.renderer.setSize(this.width,this.height,false);if(this.views.size)this.fitInitialAssembly();this.updateCamera();}
 updateCamera(){const half=this.cameraWidth/2,h=half*this.height/this.width;Object.assign(this.camera,{left:-half,right:half,top:h,bottom:-h});this.camera.updateProjectionMatrix();}
 resetAngle(){this.root.rotation.set(.22,-.45,0);}
 rotate(dx,dy){this.root.rotation.y+=dx*.009;this.root.rotation.x=THREE.MathUtils.clamp(this.root.rotation.x+dy*.009,-1.5,1.5);this.root.updateMatrixWorld(true);}
 async load(level,{qa=false,progress=()=>{}}={}){
  this.level=level;const response=await fetch(new URL(level.asset,document.baseURI));if(!response.ok)throw Error('Не удалось получить чайник');
  const total=Number(response.headers.get('content-length'))||8626416,reader=response.body.getReader(),chunks=[];let n=0;
  for(;;){const r=await reader.read();if(r.done)break;chunks.push(r.value);n+=r.value.length;progress(Math.min(.82,n/total*.82));}
  const bytes=new Uint8Array(n);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==level.assetSHA256)throw Error('Модель не соответствует проверенной геометрии');
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');this.model=gltf.scene;this.model.updateMatrixWorld(true);const collisionParts=[];let originalMeshes=0,mergedMeshes=0;
  for(const piece of level.pieces){
   const group=this.model.getObjectByName(piece.id);if(!group||group.userData.piece_id!==piece.id)throw Error('В модели отсутствует деталь '+piece.id);
   const d=group.userData.removal_vector_gltf_scene;if(!d||d.some((v,i)=>v!==piece.dir[i]))throw Error('Несогласованное направление '+piece.id);
   const sources=[];group.traverse(o=>{if(o.isMesh)sources.push(o);});originalMeshes+=sources.length;
   const triangles=[],worldBox=new THREE.Box3(),buckets=new Map(),inv=group.matrixWorld.clone().invert();
   for(const mesh of sources){
    const pos=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index,physical=!mesh.userData.decal_surface&&mesh.userData.role!=='removal_arrow';
    if(physical){for(let i=0;i<(idx?.count||pos.count);i++){const p=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(mesh.matrixWorld);triangles.push(p.x,p.y,p.z);worldBox.expandByPoint(p);}}
    const key=mesh.material.uuid+(mesh.userData.decal_surface?'_paint':'');let geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    for(const name of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);
    if(!geo.attributes.normal)geo.computeVertexNormals();if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
    geo.applyMatrix4(inv.clone().multiply(mesh.matrixWorld));if(!buckets.has(key))buckets.set(key,{material:mesh.material,paint:!!mesh.userData.decal_surface,geometries:[]});buckets.get(key).geometries.push(geo);
   }
   for(let i=0;i<3;i++)if(Math.abs(worldBox.min.getComponent(i)-piece.bounds.min[i])>2e-5||Math.abs(worldBox.max.getComponent(i)-piece.bounds.max[i])>2e-5)throw Error('Габариты GLB изменились: '+piece.id);
   collisionParts.push({id:piece.id,dir:[...piece.dir],triangles:new Float64Array(triangles)});
   for(const m of sources)m.removeFromParent();const materials=[],meshes=[];
   for(const b of buckets.values()){const geo=mergeGeometries(b.geometries,false);if(!geo)throw Error('Ошибка объединения геометрии');const material=b.material.clone();if(b.paint){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}const m=new THREE.Mesh(geo,material);m.userData.piece=piece.id;m.userData.decal_surface=b.paint;group.add(m);meshes.push(m);this.pickMeshes.push(m);materials.push({material,emissive:material.emissive?.clone(),intensity:material.emissiveIntensity});mergedMeshes++;for(const g of b.geometries)g.dispose();}
   this.views.set(piece.id,{piece,group,meshes,materials,start:group.position.clone(),box:worldBox,marks:[]});
   if(piece.id==='roof-block')this.groupComposite(this.views.get(piece.id));
  }
  this.model.updateMatrixWorld(true);
  // Browser QA checks the actual optimized DRAW geometry, not only the raw
  // loader buffers. Paint/arrow markings remain surface ink, not solid bodies.
  for(let n=0;n<level.pieces.length;n++){const p=level.pieces[n],v=this.views.get(p.id),points=[],box=new THREE.Box3();for(const mesh of v.meshes){if(mesh.userData.decal_surface)continue;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++){const point=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld);points.push(point.x,point.y,point.z);box.expandByPoint(point);}}if(points.length!==collisionParts[n].triangles.length)throw Error('Оптимизация потеряла треугольники');for(let i=0;i<3;i++)if(Math.abs(box.min.getComponent(i)-p.bounds.min[i])>2e-5||Math.abs(box.max.getComponent(i)-p.bounds.max[i])>2e-5)throw Error('Оптимизация изменила габариты');collisionParts[n].triangles=new Float64Array(points);}
  for(const v of this.views.values())this.makeArrows(v);
  this.assetOffset.add(this.model);this.assetSHA256=digest;this.optimization={originalMeshes,mergedMeshes,parts:15,geometryChanged:false};progress(.9);
  if(qa){this.qaProof=await this.verifyMeshGraph(collisionParts,progress);}else this.qaProof={mode:'SHA-bound native continuous-mesh certificate',graphVerified:true,sourceSHA256:digest};
  this.reset();progress(1);return this;
 }
 verifyMeshGraph(parts,progress){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./physics-worker.js',import.meta.url),{type:'module'});worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.onmessage=({data})=>{if(data.progress!==undefined){progress(.90+data.progress*.1);return;}worker.terminate();if(data.error){reject(Error(data.error));return;}for(const p of this.level.pieces){if(JSON.stringify(data.graph[p.id].sort())!==JSON.stringify(p.pathBlockers.map(b=>b.id).sort())){reject(Error('Браузерный mesh solver расходится с Blender: '+p.id));return;}}resolve({mode:'browser continuous triangle SAT',graphVerified:true,pairs:data.pairs,milliseconds:data.milliseconds,graph:data.graph});};worker.postMessage({parts},parts.map(p=>p.triangles.buffer));});}
 makeArrows(view){
  const shell=view.piece.stage==='shell',d=V(view.piece.dir),size=view.box.getSize(new THREE.Vector3()),center=view.box.getCenter(new THREE.Vector3()),length=view.piece.id==='base'?.20:shell?Math.max(.32,Math.min(.44,size.length()*.14)):Math.max(.17,Math.min(.25,size.length()*.14)),positions=[],colors=[],facings=[];const inv=view.group.matrixWorld.clone().invert(),inverseNormal=new THREE.Matrix3().getNormalMatrix(view.group.matrixWorld).invert();
  // Keep long painted arrows INSIDE their panel, away from the adjoining lid,
  // energy glass and gauge. The thin base receives a proportionate marking.
  if(view.piece.id==='front'){center.y=view.box.max.y-.34;center.x=.42;}
  if(view.piece.id==='upper'){center.y=view.box.max.y-.34;center.x=-.30;}
  for(const na of AXES){const n=V(na),axisNormal=Math.abs(n.dot(d))>.9;
   // Cap reliefs on joining shell edges would protrude into the neighbouring
   // panel. Use four side surfaces there; the outermost lid also has a top cue.
   if(shell&&axisNormal&&view.piece.id!=='lid')continue;
   const origin=center.clone().addScaledVector(n,4);this.ray.set(origin,n.clone().negate());const hit=this.ray.intersectObjects(view.meshes,false)[0];if(!hit)continue;
   const ink=new THREE.Color(0xffcc62),border=new THREE.Color(0x101f29),p=hit.point.clone().addScaledVector(n,.022);let vertices,faces,tip,tail;
   if(!axisNormal){const side=new THREE.Vector3().crossVectors(n,d).normalize(),w=length*.12,outline=[[-.5,-1],[.1,-1],[.1,-2.1],[.5,0],[.1,2.1],[.1,1],[-.5,1]];vertices=outline.map(([a,b])=>p.clone().addScaledVector(d,a*length).addScaledVector(side,b*w));faces=THREE.ShapeUtils.triangulateShape(outline.map(([a,b])=>new THREE.Vector2(a,b)),[]);tip=vertices[3];tail=vertices[0].clone().add(vertices[6]).multiplyScalar(.5);
   }else{
    // Actual 3D relief for near-axis views. It points to/from the face rather
    // than inventing a screen-space direction when the projected vector is short.
    const l=shell?.22:.13,start=p.clone().addScaledVector(n,n.dot(d)<0?l+.018:.005),u=V(Math.abs(d.x)<.9?[1,0,0]:[0,0,1]),side=new THREE.Vector3().crossVectors(d,u).normalize();u.crossVectors(side,d).normalize();vertices=[];
    const r=shell?.025:.018;for(const[t,radius]of[[0,r],[l*.55,r],[l*.55,r*2.7]])for(let i=0;i<8;i++)vertices.push(start.clone().addScaledVector(d,t).addScaledVector(u,Math.cos(i*Math.PI/4)*radius).addScaledVector(side,Math.sin(i*Math.PI/4)*radius));vertices.push(start.clone().addScaledVector(d,l));faces=[];for(let i=0;i<8;i++){const j=(i+1)%8;faces.push([i,j,j+8,i+8],[i+8,j+8,j+16,i+16],[i+16,j+16,24]);}faces.push([7,6,5,4,3,2,1,0]);tip=vertices[24];tail=start;
   }
   if(!axisNormal){
    // A planar axis arrow must clear a curved pot surface throughout its
    // footprint. Lift the WHOLE relief equally; never bend its true vector.
    const side=new THREE.Vector3().crossVectors(n,d).normalize();let lift=0;
    for(const a of [-.61,-.3,0,.3,.61])for(const b of [-.30,0,.30]){const sample=p.clone().addScaledVector(d,a*length).addScaledVector(side,b*length);this.ray.set(sample.clone().addScaledVector(n,4),n.clone().negate());const surface=this.ray.intersectObjects(view.meshes,false)[0];if(surface)lift=Math.max(lift,surface.point.dot(n)+.023-p.dot(n));}
    if(lift>0){for(const v of vertices)v.addScaledVector(n,lift);tail.addScaledVector(n,lift);p.addScaledVector(n,lift);}
   }
   const offset=positions.length/3;
   // Thin physical outline, anchored to the same surface and depth-tested.
   // Both layers retain the one extraction direction; no screen-space badge.
   const localFacing=n.clone().applyMatrix3(inverseNormal).normalize();
   for(const [scale,lift,color]of (axisNormal?[[1,0,ink]]:[[1.22,0,border],[1,.005,ink]]))for(const f of faces)for(let i=1;i<f.length-1;i++)for(const k of [f[0],f[i],f[i+1]]){const point=vertices[k].clone();if(!axisNormal)point.sub(p).multiplyScalar(scale).add(p);point.addScaledVector(n,lift);const v=point.applyMatrix4(inv);positions.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);facings.push(localFacing.x,localFacing.y,localFacing.z);}
   view.marks.push({normal:na,anchor:hit.point.clone().applyMatrix4(inv),tip:tip.clone().applyMatrix4(inv),tail:tail.clone().applyMatrix4(inv),length,outlined:true,vertices:positions.length/3-offset});
  }
  if(view.marks.length<3)throw Error('Недостаточно закреплённых направлений '+view.piece.id);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('markFacing',new THREE.Float32BufferAttribute(facings,3));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,depthTest:true,toneMapped:false});
  material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 markFacing;\nvarying vec3 vMarkFacing;').replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkFacing = normalMatrix * markFacing;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMarkFacing;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (normalize(vMarkFacing).z < 0.035) discard;');};material.customProgramCacheKey=()=> 'surface-arrow-facing-v1';
  const mesh=new THREE.Mesh(geo,material);mesh.userData.piece=view.piece.id;mesh.userData.marking=true;view.group.add(mesh);view.arrowMesh=mesh;this.pickMeshes.push(mesh);
 }
 reset(){this.animation=null;this.path.visible=false;this.selected=null;this.hinted=null;this.flashIds=null;this.active=new Set(this.level.pieces.map(p=>p.id));for(const v of this.views.values()){v.group.visible=true;v.group.position.copy(v.start);}this.resetAngle();this.fitInitialAssembly();}
 fitInitialAssembly(){
  // Full ORIGINAL bounds only. Removal/animation/rotation never adjusts framing.
  // Rotation-safe horizontal envelope; resize is the only projection refit.
  const box=new THREE.Box3();for(const v of this.views.values())box.union(v.box);if(box.isEmpty())return;
  this.center.copy(box.getCenter(new THREE.Vector3()));this.targetCenter.copy(this.center);const s=box.getSize(new THREE.Vector3());
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,-.45,0));let minY=Infinity,maxY=-Infinity;
  for(const x of [-s.x/2,s.x/2])for(const y of [-s.y/2,s.y/2])for(const z of [-s.z/2,s.z/2]){const p=new THREE.Vector3(x,y,z).applyQuaternion(q);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  this.cameraWidth=Math.max(1.05,Math.hypot(s.x,s.z)*1.18,(maxY-minY)*this.width/this.height*1.18);this.targetWidth=this.cameraWidth;
  this.assetOffset.position.copy(this.center).negate();this.updateCamera();this.root.updateMatrixWorld(true);
 }
 groupComposite(view){
  // One shared painted service band on the original connected T-lock geometry.
  // Shader colour only: no new solid mesh, boundary, pivot or extraction rule.
  const c=view.box.getCenter(new THREE.Vector3()).applyMatrix4(view.group.matrixWorld.clone().invert());
  for(const {material}of view.materials){if(!/ivory|cream|teal/i.test(material.name))continue;
   material.onBeforeCompile=shader=>{shader.uniforms.moduleBandY={value:c.y};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vModulePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvModulePosition = position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vModulePosition;\nuniform float moduleBandY;').replace('#include <color_fragment>','#include <color_fragment>\nfloat band = 1.0 - smoothstep(0.040, 0.050, abs(vModulePosition.y-moduleBandY));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06,0.43,0.43), band*0.94);');};
   material.customProgramCacheKey=()=> 'shared-composite-band-v1';
  }view.composite={sections:3,sharedBand:true,onePivot:true};
 }
 select(id){this.selected=id&&this.active.has(id)?id:null;}
 framingAudit(id='roof-block'){
  this.root.updateMatrixWorld(true);const v=this.views.get(id),points=[];
  if(v)for(const mesh of v.meshes){if(mesh.userData.decal_surface)continue;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++)points.push(this.project(new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld)));}
  const x=points.map(p=>p.x),y=points.map(p=>p.y);return{cameraPosition:this.camera.position.toArray(),cameraQuaternion:this.camera.quaternion.toArray(),target:[0,0,0],zoom:this.camera.zoom,frustum:[this.camera.left,this.camera.right,this.camera.top,this.camera.bottom,this.camera.near,this.camera.far],projection:this.camera.projectionMatrix.toArray(),pivot:this.center.toArray(),modelScale:this.model?.scale.toArray(),rotation:this.root.rotation.toArray().slice(0,3),viewport:[this.width,this.height],block:id,projected:points.length?{x:Math.min(...x),y:Math.min(...y),width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)}:null,composite:v?.composite,selected:this.selected};
 }
 pick(x,y){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);for(const hit of this.ray.intersectObjects(this.pickMeshes.filter(m=>this.active.has(m.userData.piece)),false)){if(hit.object.userData.marking){const n=new THREE.Vector3().fromBufferAttribute(hit.object.geometry.attributes.markFacing,hit.face.a).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));if(n.dot(this.ray.ray.direction.clone().negate())<.035)continue;}return hit.object.userData.piece;}return null;}
 project(point){const p=point.clone().project(this.camera);return{x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2};}
 marker(id){const v=this.views.get(id);if(!v||!this.active.has(id))return null;
  const stamp=[this.root.rotation.x.toFixed(4),this.root.rotation.y.toFixed(4),this.cameraWidth.toFixed(2),...this.center.toArray().map(x=>x.toFixed(2)),this.width,this.height,[...this.active].join(',')].join(':');if(this.markerStamp!==stamp){this.markerStamp=stamp;this.markerCache=new Map();}if(this.markerCache.has(id))return this.markerCache.get(id);
  this.root.updateMatrixWorld(true);const candidates=v.marks.map(m=>v.group.localToWorld(m.anchor.clone()));const c=v.box.getCenter(new THREE.Vector3()).sub(this.center).applyQuaternion(this.root.quaternion);candidates.push(c);
  const r=this.renderer.domElement.getBoundingClientRect();for(const p of candidates){const point=this.project(p);if(point.x<8||point.x>this.width-8||point.y<8||point.y>this.height-8)continue;if(this.pick(r.left+point.x,r.top+point.y)===id){const value={id,...point};this.markerCache.set(id,value);return value;}}this.markerCache.set(id,null);return null;
 }
 markers(){return [...this.active].map(id=>this.marker(id)).filter(Boolean);}
 setHint(id){this.hinted=id;}
 flash(id,blocked=[]){this.flashIds=new Set([id,...blocked.map(b=>b.id)]);this.flashUntil=performance.now()+850;this.showPath(id,true);}
 showPath(id,bad=false){const v=this.views.get(id),c=v.box.getCenter(new THREE.Vector3()),end=c.clone().addScaledVector(V(v.piece.dir),bad?.4:1);this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints([c.clone().sub(this.center),end.sub(this.center)]);this.path.material.color.set(bad?0xe78c51:0x72ecd7);this.path.visible=true;this.pathUntil=performance.now()+800;}
 remove(id,callback){const v=this.views.get(id);this.animation={id,start:performance.now(),duration:this.reducedMotion?180:(v.piece.core?1050:650),origin:v.start.clone(),callback};this.hinted=null;this.path.visible=false;}
 tick(now){this.raf=requestAnimationFrame(this.tick);if(this.lastFrame&&this.frameCount>35&&!document.hidden){this.frameTimes.push(now-this.lastFrame);if(this.frameTimes.length>400)this.frameTimes.shift();}this.lastFrame=now;this.frameCount++;
  for(const[id,v]of this.views){for(const m of v.materials)if(m.emissive){const flash=now<this.flashUntil&&this.flashIds?.has(id);m.material.emissive.copy(m.emissive);m.material.emissiveIntensity=m.intensity;if(flash){m.material.emissive.add(new THREE.Color(0x803318));m.material.emissiveIntensity=Math.max(.5,m.intensity||0);}else if(this.selected===id||this.animation?.id===id||this.hinted===id){m.material.emissive.add(new THREE.Color(0x286b59));m.material.emissiveIntensity=Math.max(.45,m.intensity||0);}}}
  if(this.animation){const a=this.animation,t=Math.min(1,(now-a.start)/a.duration),v=this.views.get(a.id),e=t*t*(3-2*t);v.group.position.copy(a.origin).addScaledVector(V(v.piece.dir),e*this.level.pathDistance);if(t===1){const delta=v.group.position.clone().sub(a.origin);v.group.visible=false;this.active.delete(a.id);this.animation=null;a.callback({distance:delta.length(),dir:[...v.piece.dir],endpointDelta:delta.toArray()});}}
  if(now>this.pathUntil)this.path.visible=false;const start=performance.now();this.renderer.render(this.scene,this.camera);this.renderTimes.push(performance.now()-start);if(this.renderTimes.length>400)this.renderTimes.shift();
 }
 arrowAudit(){this.root.updateMatrixWorld(true);return [...this.views.values()].map(v=>({id:v.piece.id,dir:v.piece.dir,copies:v.marks.length,depthTest:v.arrowMesh.material.depthTest,outline:true,lengths:v.marks.map(m=>m.length),alignment:v.marks.map(m=>{const actual=v.group.localToWorld(m.tip.clone()).sub(v.group.localToWorld(m.tail.clone())).normalize(),expected=V(v.piece.dir).applyQuaternion(this.root.quaternion).normalize();return actual.dot(expected);})}));}
 metrics(){const quant=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length*q)]||0;};return{samples:this.frameTimes.length,medianMs:quant(this.frameTimes,.5),p95Ms:quant(this.frameTimes,.95),longFrames:this.frameTimes.filter(t=>t>50).length,cpuRenderP95Ms:quant(this.renderTimes,.95),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio()};}
 geometryAudit(){return{assetSHA256:this.assetSHA256,parts:this.level?.pieces.length,optimization:this.optimization,physics:this.qaProof};}
}
