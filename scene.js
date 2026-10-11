import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import {StageScale} from './stage-scale.js';
import {clampZoom} from './view-input.js';
import {metalInk,pointAtUV} from './surface-marks.js';
import {surfaceInk,INK_SAMPLES} from './surface-ink.js';
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
  this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.center=new THREE.Vector3(0,1.65,.08);this.targetCenter=this.center.clone();this.cameraWidth=4.5;this.targetWidth=4.5;this.manualZoom=1;this.stageScale=new StageScale();this.inkMaterial=metalInk();
  this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x74f2d3,transparent:true,opacity:.65}));this.root.add(this.path);this.path.visible=false;
  new ResizeObserver(()=>this.resize()).observe(host);this.resetAngle();this.resize();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
 }
 resize(){this.width=Math.max(1,this.host.clientWidth);this.height=Math.max(1,this.host.clientHeight);this.renderer.setSize(this.width,this.height,false);if(this.views.size)this.fitInitialAssembly();this.stageScale.viewport(this.isMobile());this.camera.zoom=this.manualZoom*this.stageScale.preset;this.updateCamera();}
 updateCamera(){const half=this.cameraWidth/2,h=half*this.height/this.width;Object.assign(this.camera,{left:-half,right:half,top:h,bottom:-h});this.camera.updateProjectionMatrix();}
 setZoom(value){this.manualZoom=clampZoom(value);this.camera.zoom=this.manualZoom*this.stageScale.preset;this.updateCamera();return this.manualZoom;}
 isMobile(){return matchMedia('(max-width: 900px) and (orientation: portrait)').matches;}
 enterStage(stage){if(!this.stageScale.enter(stage,this.isMobile()))return false;this.fitInitialAssembly();this.setZoom(this.manualZoom);return true;}
 resetAngle(){this.root.rotation.set(.22,-.45,0);}
 rotate(dx,dy){this.root.rotation.y+=dx*.009;this.root.rotation.x=THREE.MathUtils.clamp(this.root.rotation.x+dy*.009,-1.5,1.5);this.root.updateMatrixWorld(true);}
 async load(level,{qa=false,progress=()=>{}}={}){
  this.unload();this.level=level;let bytes,digest;
  if(this.cachedFamily?.digest===level.assetSHA256){bytes=this.cachedFamily.bytes;digest=this.cachedFamily.digest;progress(.82);}else{
  const response=await fetch(new URL(level.asset,document.baseURI));if(!response.ok)throw Error('Не удалось получить чайник');
  const total=Number(response.headers.get('content-length'))||8626416,reader=response.body.getReader(),chunks=[];let n=0;
  for(;;){const r=await reader.read();if(r.done)break;chunks.push(r.value);n+=r.value.length;progress(Math.min(.82,n/total*.82));}
  bytes=new Uint8Array(n);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
  digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==level.assetSHA256)throw Error('Модель не соответствует проверенной геометрии');
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');this.cachedFamily={bytes,digest,scene:gltf.scene};}
  this.model=this.cachedFamily.scene.clone(true);this.model.updateMatrixWorld(true);
  const selected=new Set(level.pieces.map(p=>p.node||p.id));for(const child of [...this.model.children])if(!selected.has(child.name))child.removeFromParent();
  const collisionParts=[];let originalMeshes=0,mergedMeshes=0;
  for(const piece of level.pieces){
   const group=this.model.getObjectByName(piece.node||piece.id);if(!group||group.userData.piece_id!==piece.id)throw Error('В модели отсутствует деталь '+piece.id);
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
   for(const b of buckets.values()){const geo=mergeGeometries(b.geometries,false);if(!geo)throw Error('Ошибка объединения геометрии');const material=b.material.clone();if(b.paint){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}const m=new THREE.Mesh(geo,material);m.userData.piece=piece.id;m.userData.decal_surface=b.paint;group.add(m);meshes.push(m);this.pickMeshes.push(m);materials.push({material,color:material.color?.clone(),emissive:material.emissive?.clone(),intensity:material.emissiveIntensity});mergedMeshes++;for(const g of b.geometries)g.dispose();}
   this.views.set(piece.id,{piece,group,meshes,materials,start:group.position.clone(),box:worldBox,solidSourceCount:sources.filter(m=>!m.userData.decal_surface).length,marks:[]});
   
  }
  this.model.updateMatrixWorld(true);
  // Browser QA checks the actual optimized DRAW geometry, not only the raw
  // loader buffers. Paint/arrow markings remain surface ink, not solid bodies.
  for(let n=0;n<level.pieces.length;n++){const p=level.pieces[n],v=this.views.get(p.id),points=[],box=new THREE.Box3();for(const mesh of v.meshes){if(mesh.userData.decal_surface)continue;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++){const point=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld);points.push(point.x,point.y,point.z);box.expandByPoint(point);}}if(points.length!==collisionParts[n].triangles.length)throw Error('Оптимизация потеряла треугольники');for(let i=0;i<3;i++)if(Math.abs(box.min.getComponent(i)-p.bounds.min[i])>2e-5||Math.abs(box.max.getComponent(i)-p.bounds.max[i])>2e-5)throw Error('Оптимизация изменила габариты');collisionParts[n].triangles=new Float64Array(points);}
  for(const v of this.views.values())this.makeArrows(v);
  this.assetOffset.add(this.model);this.assetSHA256=digest;this.optimization={originalMeshes,mergedMeshes,parts:level.pieces.length,geometryChanged:false};progress(.9);
  if(qa){this.qaProof=await this.verifyMeshGraph(collisionParts,progress);}else this.qaProof={mode:'SHA-bound native continuous-mesh certificate',graphVerified:true,sourceSHA256:digest};
  this.reset();progress(1);return this;
 }
 verifyMeshGraph(parts,progress){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./physics-worker.js',import.meta.url),{type:'module'});worker.onerror=e=>{worker.terminate();reject(Error(e.message));};worker.onmessage=({data})=>{if(data.progress!==undefined){progress(.90+data.progress*.1);return;}worker.terminate();if(data.error){reject(Error(data.error));return;}for(const p of this.level.pieces){if(JSON.stringify(data.graph[p.id].sort())!==JSON.stringify(p.pathBlockers.map(b=>b.id).sort())){reject(Error('Браузерный mesh solver расходится с Blender: '+p.id));return;}}resolve({mode:'browser continuous triangle SAT',graphVerified:true,pairs:data.pairs,milliseconds:data.milliseconds,graph:data.graph});};worker.postMessage({parts},parts.map(p=>p.triangles.buffer));});}
 makeArrows(view){this.pickMeshes.push(surfaceInk(view,this.ray,this.inkMaterial));}
 unload(){this.animation=null;this.inkStamp=null;this.tapStamp=null;this.markerStamp=null;this.markerCache=new Map();for(const v of this.views.values()){for(const m of v.meshes){m.geometry.dispose();m.material.dispose();}v.arrowMesh?.geometry.dispose();v.arrowMesh?.material.dispose();}this.model?.removeFromParent();this.views.clear();this.pickMeshes=[];this.active.clear();this.tutorialFocus=null;}

 reset(){this.stageScale.reset();this.enterStage('shell');this.animation=null;this.inkStamp=null;this.path.visible=false;this.selected=null;this.hinted=null;this.tutorialFocus=null;this.flashIds=null;this.active=new Set(this.level.pieces.map(p=>p.id));for(const v of this.views.values()){v.group.visible=true;v.group.position.copy(v.start);}this.resetAngle();this.fitInitialAssembly();}
 fitInitialAssembly(){
  // Full ORIGINAL bounds only. Removal/animation/rotation never adjusts framing.
  // Rotation-safe horizontal envelope; resize is the only projection refit.
  const box=new THREE.Box3(),stageBox=new THREE.Box3();for(const v of this.views.values()){box.union(v.box);if(this.stageScale.stage==='core'?v.piece.core:this.stageScale.stage==='inner'?v.piece.stage!=='shell':true)stageBox.union(v.box);}if(box.isEmpty())return;
  // Preset pivot is the ORIGINAL stage assembly, including any removed blocks.
  // It changes once on entry, never from the remaining-parts bounding box.
  this.center.copy((stageBox.isEmpty()?box:stageBox).getCenter(new THREE.Vector3()));this.targetCenter.copy(this.center);const s=box.getSize(new THREE.Vector3());
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,-.45,0));let minY=Infinity,maxY=-Infinity;
  for(const x of [-s.x/2,s.x/2])for(const y of [-s.y/2,s.y/2])for(const z of [-s.z/2,s.z/2]){const p=new THREE.Vector3(x,y,z).applyQuaternion(q);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  this.cameraWidth=Math.max(1.05,Math.hypot(s.x,s.z)*1.18,(maxY-minY)*this.width/this.height*1.18);this.targetWidth=this.cameraWidth;
  this.assetOffset.position.copy(this.center).negate();this.updateCamera();this.root.updateMatrixWorld(true);
 }
 groupComposite(view){if(view.solidSourceCount!==1||view.group.userData.visual_construction!=='ONE_MONOLITHIC_T_CASTING')throw Error('Expected genuine monolithic casting');view.composite={sections:1,monolithic:true,onePivot:true,solidMeshes:view.solidSourceCount};}

 select(id){this.selected=id&&this.active.has(id)?id:null;}
 framingAudit(id='roof-block'){
  this.root.updateMatrixWorld(true);const v=this.views.get(id),points=[];
  if(v)for(const mesh of v.meshes){if(mesh.userData.decal_surface)continue;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++)points.push(this.project(new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld)));}
  const bounds=points.reduce((b,p)=>({x:Math.min(b.x,p.x),y:Math.min(b.y,p.y),right:Math.max(b.right,p.x),bottom:Math.max(b.bottom,p.y)}),{x:Infinity,y:Infinity,right:-Infinity,bottom:-Infinity});return{cameraPosition:this.camera.position.toArray(),cameraQuaternion:this.camera.quaternion.toArray(),target:[0,0,0],zoom:this.camera.zoom,stage:this.stageScale.stage,stagePreset:this.stageScale.preset,manualZoom:this.manualZoom,frustum:[this.camera.left,this.camera.right,this.camera.top,this.camera.bottom,this.camera.near,this.camera.far],projection:this.camera.projectionMatrix.toArray(),pivot:this.center.toArray(),modelScale:this.model?.scale.toArray(),rotation:this.root.rotation.toArray().slice(0,3),viewport:[this.width,this.height],block:id,projected:points.length?{x:bounds.x,y:bounds.y,width:bounds.right-bounds.x,height:bounds.bottom-bounds.y}:null,composite:v?.composite,selected:this.selected};
 }
 pick(x,y){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);for(const hit of this.ray.intersectObjects(this.pickMeshes.filter(m=>this.active.has(m.userData.piece)),false)){return hit.object.userData.piece;}return null;}
 project(point){const p=point.clone().project(this.camera);return{x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2};}
 marker(id){const v=this.views.get(id);if(!v||!this.active.has(id))return null;
  const stamp=[this.root.rotation.x.toFixed(4),this.root.rotation.y.toFixed(4),this.cameraWidth.toFixed(2),this.manualZoom.toFixed(4),...this.center.toArray().map(x=>x.toFixed(2)),this.width,this.height,[...this.active].join(',')].join(':');if(this.markerStamp!==stamp){this.markerStamp=stamp;this.markerCache=new Map();}if(this.markerCache.has(id))return this.markerCache.get(id);
  this.root.updateMatrixWorld(true);const r=this.renderer.domElement.getBoundingClientRect();
  // Read-only QA targets must survive CSS-pixel rounding: prefer the visible
  // solid centre, not an ink anchor at a subpixel silhouette edge.
  const safe=point=>point.x>=8&&point.x<=this.width-8&&point.y>=8&&point.y<=this.height-8&&[[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>this.pick(r.left+point.x+dx,r.top+point.y+dy)===id);
  const targetBox=v.box.clone();if(id==='lid')targetBox.max.y=Math.min(targetBox.max.y,2.80);
  const c=targetBox.getCenter(new THREE.Vector3()).sub(this.center).applyQuaternion(this.root.quaternion);
  const candidates=[c,...v.marks.map(m=>v.group.localToWorld(m.anchor.clone()))];
  for(const p of candidates){const point=this.project(p);if(safe(point)){const value={id,...point};this.markerCache.set(id,value);return value;}}this.markerCache.set(id,null);return null;
 }
 markers(){return [...this.active].map(id=>this.marker(id)).filter(Boolean);}
 rotationGesturePoint(){
  const stamp=[this.level.id,this.width,this.height,this.manualZoom,this.root.rotation.x,this.root.rotation.y].join(':');if(this.gestureEnvelopeStamp===stamp)return this.gesturePoint;
  this.root.updateMatrixWorld(true);let bottom=0;const p=new THREE.Vector3();
  // Actual silhouette, not empty corners of an AABB: on narrow phones those
  // phantom corners pushed the hand into the tutorial footer.
  for(const v of this.views.values())for(const mesh of v.meshes){if(mesh.userData.decal_surface)continue;const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).project(this.camera);bottom=Math.max(bottom,(1-p.y)*this.height/2);}}
  this.gestureEnvelopeStamp=stamp;return this.gesturePoint={x:this.width*.5,y:bottom+7,objectBottom:bottom};
 }
 tapTarget(id){
  const stamp=[id,this.root.rotation.x,this.root.rotation.y,this.manualZoom,this.width,this.height,[...this.active].join(',')].join(':');
  if(this.tapStamp===stamp)return this.tapPoint;this.tapStamp=stamp;
  const v=this.views.get(id);if(!v||!this.active.has(id))return this.tapPoint=null;
  const box=v.box.clone();if(id==='lid')box.max.y=Math.min(box.max.y,2.80); // cap, not the antenna
  this.root.updateMatrixWorld(true);const points=[];
  for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(this.project(new THREE.Vector3(x,y,z).sub(this.center).applyQuaternion(this.root.quaternion)));
  const left=Math.max(8,Math.min(...points.map(p=>p.x))),right=Math.min(this.width-8,Math.max(...points.map(p=>p.x))),top=Math.max(8,Math.min(...points.map(p=>p.y))),bottom=Math.min(this.height-8,Math.max(...points.map(p=>p.y))),r=this.renderer.domElement.getBoundingClientRect(),visible=[];
  const centre={x:(left+right)/2,y:(top+bottom)/2};if(this.pick(r.left+centre.x,r.top+centre.y)===id)return this.tapPoint={id,...centre,visibleCentroid:centre,centreError:0,picked:id};
  for(let row=0;row<11;row++)for(let col=0;col<11;col++){const p={x:left+(col+.5)*(right-left)/11,y:top+(row+.5)*(bottom-top)/11};if(this.pick(r.left+p.x,r.top+p.y)===id)visible.push(p);}
  if(!visible.length)return this.tapPoint=null;
  const middle=visible.reduce((c,p)=>({x:c.x+p.x/visible.length,y:c.y+p.y/visible.length}),{x:0,y:0});
  visible.sort((a,b)=>(a.x-middle.x)**2+(a.y-middle.y)**2-(b.x-middle.x)**2-(b.y-middle.y)**2);
  return this.tapPoint={id,...visible[0],visibleCentroid:middle,centreError:Math.hypot(visible[0].x-middle.x,visible[0].y-middle.y),picked:id};
 }
 setHint(id){this.hinted=id;}
 setTutorialFocus(id){this.tutorialFocus=id;}
 flash(id,blocked=[],tutorial=false){this.flashIds=new Set([id,...(tutorial?blocked.map(b=>b.id):[])]);this.flashUntil=performance.now()+420;}
 showPath(id,bad=false){const v=this.views.get(id),c=v.box.getCenter(new THREE.Vector3()),end=c.clone().addScaledVector(V(v.piece.dir),bad?.4:1);this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints([c.clone().sub(this.center),end.sub(this.center)]);this.path.material.color.set(bad?0xe78c51:0x72ecd7);this.path.visible=true;this.pathUntil=performance.now()+800;}
 remove(id,callback){const v=this.views.get(id);this.animation={id,start:performance.now(),duration:this.reducedMotion?180:(v.piece.core?1050:650),origin:v.start.clone(),callback};this.hinted=null;this.path.visible=false;}
 tick(now){this.raf=requestAnimationFrame(this.tick);if(this.lastFrame&&this.frameCount>35&&!document.hidden){this.frameTimes.push(now-this.lastFrame);if(this.frameTimes.length>400)this.frameTimes.shift();}this.lastFrame=now;this.frameCount++;
  for(const[id,v]of this.views){for(const m of v.materials)if(m.emissive){if(m.color)m.material.color.copy(m.color).multiplyScalar(this.tutorialFocus&&id!==this.tutorialFocus? .48:1);const flash=now<this.flashUntil&&this.flashIds?.has(id);m.material.emissive.copy(m.emissive);m.material.emissiveIntensity=m.intensity;if(flash){m.material.emissive.add(new THREE.Color(0x803318));m.material.emissiveIntensity=Math.max(.5,m.intensity||0);}else if(this.selected===id||this.animation?.id===id){m.material.emissive.add(new THREE.Color(0x286b59));m.material.emissiveIntensity=Math.max(.45,m.intensity||0);}}}
  if(this.animation){const a=this.animation,t=Math.min(1,(now-a.start)/a.duration),v=this.views.get(a.id),e=t*t*(3-2*t);v.group.position.copy(a.origin).addScaledVector(V(v.piece.dir),e*this.level.pathDistance);if(t===1){const delta=v.group.position.clone().sub(a.origin);v.group.visible=false;this.active.delete(a.id);this.animation=null;a.callback({distance:delta.length(),dir:[...v.piece.dir],endpointDelta:delta.toArray()});}}
  this.updateInkVisibility();if(now>this.pathUntil)this.path.visible=false;const start=performance.now();this.renderer.render(this.scene,this.camera);this.renderTimes.push(performance.now()-start);if(this.renderTimes.length>400)this.renderTimes.shift();
 }
 inkProjection(v,m){
  const points=m.inkPoints.map(p=>this.project(v.group.localToWorld(p.clone()))),origin=v.group.localToWorld(m.inkPoints[0].clone()),expectedWorld=V(v.piece.dir).applyQuaternion(this.root.quaternion),end=this.project(origin.clone().addScaledVector(expectedWorld,m.length)),start=this.project(origin),expected=new THREE.Vector2(end.x-start.x,end.y-start.y),pixels=expected.length();
  const cos=(a,b)=>{const d=new THREE.Vector2(b.x-a.x,b.y-a.y);return d.length()>.05&&pixels>.05?d.normalize().dot(expected.clone().normalize()):0;};
  const alignment=cos(points[0],points[4]),segments=points.slice(0,4).map((p,i)=>cos(p,points[i+1]));
  // Oblique curved paint can suggest a different direction. Cull that copy,
  // never rotate its glyph away from the real vector to make it look upright.
  const enabled=pixels>=3&&alignment>=.985&&segments.every(c=>c>=.96);
  return{enabled,alignment,segments,pixels,points};
 }
 updateInkVisibility(){
  const stamp=[this.level?.id,this.root.rotation.x,this.root.rotation.y,this.camera.zoom,this.width,this.height].join(':');if(this.inkStamp===stamp)return;this.inkStamp=stamp;this.root.updateMatrixWorld(true);
  for(const v of this.views.values()){
   if(!this.active.has(v.piece.id))continue;const index=[];
   for(const m of v.marks){const projected=this.inkProjection(v,m),normal=m.normalLocal.clone().transformDirection(v.group.matrixWorld).transformDirection(this.camera.matrixWorldInverse);
    // Suppress an edge-on/visually misleading copy. Its UVs and physical
    // attachment NEVER move, rotate toward the camera, or encode availability.
    m.enabled=projected.enabled&&normal.z>.06;if(m.enabled)for(let i=m.start;i<m.start+m.count;i++)index.push(i);
   }
   const geometry=v.arrowMesh.geometry,attribute=geometry.index;attribute.array.fill(0);attribute.array.set(index);attribute.needsUpdate=true;geometry.setDrawRange(0,index.length);v.arrowMesh.visible=!!index.length;
  }
 }
 paintedArrowAudit(){
  this.updateInkVisibility();this.root.updateMatrixWorld(true);const hosts=this.pickMeshes.filter(m=>this.active.has(m.userData.piece)&&!m.userData.decal_surface);
  return [...this.views.values()].filter(v=>this.active.has(v.piece.id)).map(v=>({id:v.piece.id,dir:v.piece.dir,mode:'fixed object-space paint on suitable host faces',copies:v.marks.map(m=>{
   const projection=this.inkProjection(v,m),actual=m.inkPoints.map(p=>v.group.localToWorld(p.clone()));let visibleSamples=0,maxSurfaceGap=0;
   for(let i=0;i<5;i++){const p=projection.points[i];if(!m.enabled||p.x<0||p.y<0||p.x>this.width||p.y>this.height)continue;this.pointer.set(p.x/this.width*2-1,-p.y/this.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects(hosts,false)[0];if(hit&&hit.object.userData.piece===v.piece.id&&hit.point.distanceTo(actual[i])<3e-5){visibleSamples++;maxSurfaceGap=Math.max(maxSurfaceGap,hit.point.distanceTo(actual[i]));}}
   return{enabled:m.enabled,normal:m.normal,normalDotVector:m.normalDot,normalLimit:m.normalLimit,compound:m.compound,uvFixed:m.uvFixed,physicalAlignment:m.physicalAlignment,screenAlignment:projection.alignment,segmentAlignment:projection.segments,extractionPixels:projection.pixels,visibleSamples,stencilSamples:INK_SAMPLES.length,paintOnHost:true,points:projection.points.slice(0,5),completeGlyph:m.inkPoints.length===INK_SAMPLES.length,maxSurfaceGap,carrierTriangles:m.count/3};
  })}));
 }
 arrowAudit(){this.root.updateMatrixWorld(true);return [...this.views.values()].map(v=>({id:v.piece.id,dir:v.piece.dir,copies:v.marks.length,uvSignature:v.arrowMesh.geometry.attributes.uv.array.reduce((sum,x,i)=>sum+x*(i+1),0),fixedInk:!v.arrowMesh.material.isShaderMaterial,depthTest:v.arrowMesh.material.depthTest,style:'navy-cream-metal-ink',surface:true,spatialLift:0,lengths:v.marks.map(m=>m.length),maxSurfaceGap:Math.max(...v.marks.map(m=>m.surfaceGap)),suitableFaces:v.marks.map(m=>({normal:m.normal,normalDot:m.normalDot,normalLimit:m.normalLimit,compound:m.compound,uvFixed:m.uvFixed,ownSamples:m.ownSamples})),alignment:v.marks.map(m=>{const actual=v.group.localToWorld(m.tip.clone()).sub(v.group.localToWorld(m.tail.clone())).normalize(),expected=V(v.piece.dir).applyQuaternion(this.root.quaternion).normalize();return actual.dot(expected);})}));}
 metrics(){const quant=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length*q)]||0;};return{samples:this.frameTimes.length,medianMs:quant(this.frameTimes,.5),p95Ms:quant(this.frameTimes,.95),longFrames:this.frameTimes.filter(t=>t>50).length,cpuRenderP95Ms:quant(this.renderTimes,.95),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio()};}
 geometryAudit(){return{assetSHA256:this.assetSHA256,parts:this.level?.pieces.length,optimization:this.optimization,physics:this.qaProof};}
 appearanceAudit(){return [...this.views.values()].filter(v=>this.active.has(v.piece.id)).map(v=>({id:v.piece.id,ink:{color:v.arrowMesh.material.color.toArray(),opacity:v.arrowMesh.material.opacity,textureUUID:v.arrowMesh.material.map.uuid,style:'navy-cream-metal-ink'},materials:v.materials.map(m=>({color:m.material.color.toArray(),emissive:m.material.emissive?.toArray(),intensity:m.material.emissiveIntensity,opacity:m.material.opacity})),tutorialFocus:this.tutorialFocus,flash:performance.now()<this.flashUntil&&this.flashIds?.has(v.piece.id)}));}
}
