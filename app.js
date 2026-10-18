import {libraryFromCertificate} from './levels.js';
import {Puzzle,available,validateLevel} from './puzzle.js';
import {ViewGesture,MIN_ZOOM,MAX_ZOOM} from './view-input.js';
import {loadDelivered,resetModelDelivery} from './model-delivery.js?v=android-readiness-v1';
import {LoadTask,LOAD_LIMITS,loadTrace,loadBytes,loadError} from './load-trace.js?v=android-readiness-v1';
import {ObstructionLesson} from './onboarding.js';
import {BrakychDialogue} from './dialogue.js';
import {puzzleStage} from './stage-scale.js';
import {migrateWorkshop,mergeWorkshopSaves,completeWorkshopJob,installThermocore,workshopState,victoryState} from './workshop-progress.js';
import {mountWorkshop,WorkshopUI} from './workshop-ui.js?v=flow-trim-v1';
import {JOBS} from './workshop-data.js';
import {storyStorage,storyFrame,mountStory,STORY_KEY} from './story-onboarding.js?v=flow-trim-v1';
import {GUIDE_KEY,guideState,mountFirstGuide} from './first-guide.js?v=flow-trim-v1';
const $=id=>document.getElementById(id),KEY='razborka.firstRun.v1',OLD_TUTORIAL='razborka.tutorial.v1',SOUND='razborka.sound.v1';
const storyQuery=new URLSearchParams(location.search),storage=storyStorage((()=>{try{return localStorage;}catch{return null;}})(),storyQuery),hadSave=storage.get(KEY)!==null;
if(storage.isolated&&storyQuery.get('new')==='1'){storyQuery.delete('new');history.replaceState(null,'',location.pathname+'?'+storyQuery);}
if(storage.isolated){document.body.dataset.storyQa='true';const badge=document.createElement('aside');badge.id='story-qa-banner';badge.innerHTML='<span>QA · прогресс отдельно</span><a href="'+location.pathname+'">Вернуться к своему →</a>';document.body.append(badge);}
let saved;try{saved=JSON.parse(storage.get(KEY)||'{}');}catch{saved={};}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
let progress=migrateWorkshop({...saved,tutorialSeen:!!saved.tutorialSeen||storage.get(OLD_TUTORIAL)==='seen',firstJobComplete:!!saved.firstJobComplete,obstructionLessonSeen:!!saved.obstructionLessonSeen,completedTemplates:Array.isArray(saved.completedTemplates)?saved.completedTemplates:[]});
let view,library,level,puzzle,ready=false,mode='splash',generation=0,lesson=null,rotDistance=0,started=0,blockedTaps=0,rotations=0,soundOn=storage.get(SOUND)!=='off',audio,feedbackTimer,orderIndex=0;
let libraryReady;
const query=new URLSearchParams(location.search),qa=query.get('qa')==='1',gesture=new ViewGesture(),events=[],LESSON_VERSION=3;let pointerPiece=null,forceLesson=qa&&query.get('tutorial')==='1';
function storedProgress(){try{return JSON.parse(storage.get(KEY)||'{}');}catch{return{};}}
const save=()=>{progress=mergeWorkshopSaves(storedProgress(),progress);storage.set(KEY,JSON.stringify(progress));};
const record=(type,data={})=>{events.push({type,time:Math.round(performance.now()),...data});if(events.length>1000)events.shift();};
const META_PAGES=['hub','catalogue','ship','galaxy','concept'];let rendering=false,pendingJob=null,launchRunning=false,enginePromise,loading=false,lastAward=false;let activeLoad,loadFailure=null,loadAttempt=0,viewObserver;
const metaRoot=mountWorkshop();
const metaUI=new WorkshopUI(metaRoot,{progress:()=>progress,ready:()=>ready,loading:()=>loading,qa,failure:()=>loadFailure,retry:retryLoad,navigate:openWorkshop,launch:acceptJob,install:installCore,speak:(id,text)=>metaTalk.say(id,text)});
function setRendering(enabled){if(!view)return;if(enabled&&!rendering){rendering=true;view.lastFrame=null;view.raf=requestAnimationFrame(view.tick);}else if(!enabled){cancelAnimationFrame(view.raf);rendering=false;}}
function changeScreen(next){if((guided.snapshot().mode==='lesson'&&next!=='play')||(guided.snapshot().mode==='tour'&&next!=='hub'))guided.cancel();mode=next;document.body.dataset.screen=next;for(const id of ['splash','intro','win','preview','fatal'])$(id).hidden=id!==({splash:'splash',intro:'intro',victory:'win',preview:'preview',fatal:'fatal'}[next]);if(document.getElementById('story'))document.getElementById('story').hidden=next!=='story';metaRoot.hidden=!META_PAGES.includes(next);if(!metaRoot.hidden)metaUI.show(next);setRendering(next==='play');record('screen',{screen:next});}
function openWorkshop(page='hub',{jobIndex}={}){guided?.cancel();document.querySelector('.inspector').hidden=false;document.querySelector('.inspector .dialogue-tools').append($('skip-tutorial'));delete document.body.dataset.instructionOwner;if(loading){activeLoad?.cancel('NAVIGATION_CANCELLED');loading=false;}pendingJob=null;if(mode==='play'){generation++;gesture.reset();lesson=null;puzzle=null;view?.reset();$('guide-hand').hidden=true;$('skip-tutorial').hidden=true;delete $('stage').dataset.onboarding;}if(jobIndex!==undefined)metaUI.selectedJob=jobIndex;else if(page==='hub')metaUI.selectedJob=qa?orderIndex:JOBS.findIndex(j=>j.id===workshopState(progress).recommendedJob);changeScreen(page);const state=workshopState(progress);const lines={hub:state.coreReady?'Ядро добыто. Открой корабль и установи его.':state.reactorInstalled?'Реактор включён. Испытания — в архиве.':'Разбери чайник. Его ядро нужно кораблю.',catalogue:'Чайник — одна веха. Два испытания необязательны. Другие аппараты — пока эскизы.',ship:state.reactorInstalled?'Реактор ожил: 1/1. Отличная добыча — пригодилась кораблю!':state.coreReady?'Ядро готово! Установи его в реактор корабля — кнопкой или в гнездо.':'Кораблю нужно ядро из первого чайника. Добудем — и установим сюда.',galaxy:'Первый сектор ждёт разборки. Остальные ещё в разработке. Хлам не торопится.'};if(['catalogue','galaxy'].includes(page)){const e=metaRoot.querySelector(page==='catalogue'?'.catalogue-intro>span':'.galaxy-caption');if(e.dataset.originalText)e.textContent=e.dataset.originalText;}const first=guided.visit(page);metaRoot.querySelector('.meta-brakych').hidden=first;if(first){const e=metaRoot.querySelector(page==='catalogue'?'.catalogue-intro>span':'.galaxy-caption');e.dataset.originalText||=e.textContent;e.textContent=page==='catalogue'?'Здесь — чайник, его повторы и испытания. Первый заказ ждёт на стенде.':'Нажми на первый сектор — откроется Архив заказов.';metaTalk.say('context-'+page,'');}else if(lines[page])metaTalk.say('meta-'+page+'-'+events.length,lines[page]);}
const guidance=guideState(storage.get(GUIDE_KEY),{fresh:!hadSave,mechanicalQA:qa});
const guideEntry=storage.isolated?query.get('guideReplay'):null;if(guideEntry){guidance.enabled=true;guidance.tourDone=guideEntry==='tutorial';}
const guided=mountFirstGuide({storage,state:guidance,record,hub:()=>openWorkshop('hub'),launch:launchJob,skipLesson:()=>endTutorial(true),lessonStep:()=>lesson?.step,canExplain:()=>gesture.mode==='idle'&&!puzzle?.busy,confirm:()=>{if(talk.typing)talk.tap();if(talk.line)talk.line.next=null;gesture.reset();pointerPiece=null;if(lesson&&guided.activeLesson())guide();},pause:on=>{if(on&&lesson&&guided.activeLesson()){instruction('',true);$('skip-tutorial').hidden=true;}},arrowDetail:realArrowDetail,arrowPoint:realArrowPoint,modelBounds:realModelBounds});
let arrowVisibilityCache;
function realArrowPoint(){
 if(!view||!lesson||!guided.activeLesson()||lesson.step!=='attempt')return null;
 const r=$('canvas-host').getBoundingClientRect(),key=[generation,view.width,view.height,view.manualZoom,view.stageScale.preset,...view.root.rotation.toArray(),...view.active].join('|');
 const absolute=p=>p?{...p,x:r.x+p.x,y:r.y+p.y,glyphRect:{...p.glyphRect,x:r.x+p.glyphRect.x,y:r.y+p.glyphRect.y}}:null;
 if(arrowVisibilityCache?.key===key)return absolute(arrowVisibilityCache.point);
 const started=performance.now();view.updateInkVisibility();view.root.updateMatrixWorld(true);
 const hosts=view.pickMeshes.filter(mesh=>view.active.has(mesh.userData.piece)&&!mesh.userData.decal_surface),ids=[...view.active].sort((a,b)=>(a==='front'?-1:b==='front'?1:0));let result=null,checks=0;
 for(const id of ids){const v=view.views.get(id),candidates=v.marks.filter(m=>m.enabled).map(m=>({m,p:view.inkProjection(v,m)})).filter(({p})=>p.enabled&&p.pixels>=8).sort((a,b)=>b.p.pixels-a.p.pixels);
  for(const {m,p} of candidates){let samples=0;for(let i=0;i<5;i++){const point=p.points[i];if(point.x<12||point.y<12||point.x>view.width-12||point.y>view.height-12)continue;view.pointer.set(point.x/view.width*2-1,-point.y/view.height*2+1);view.ray.setFromCamera(view.pointer,view.camera);const hit=view.ray.intersectObjects(hosts,false)[0],world=v.group.localToWorld(m.inkPoints[i].clone());checks++;if(hit&&hit.object.userData.piece===v.piece.id&&hit.point.distanceTo(world)<3e-5)samples++;}
   if(samples===5){const points=p.points.slice(0,5),xs=points.map(a=>a.x),ys=points.map(a=>a.y);result={id:v.piece.id,x:(p.points[0].x+p.points[4].x)/2,y:(p.points[0].y+p.points[4].y)/2,dir:[...v.piece.dir],glyphRect:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},paintOnHost:true,visibleSamples:samples,pixels:p.pixels};break;}
  }if(result)break;
 }
 arrowVisibilityCache={key,point:result};record('arrow-visibility',{durationMs:Math.round(performance.now()-started),checks,id:result?.id||null});return absolute(result);
}
function realModelBounds(){if(!view)return null;const r=$('canvas-host').getBoundingClientRect(),points=[];for(const id of view.active){const v=view.views.get(id);for(const x of [v.box.min.x,v.box.max.x])for(const y of [v.box.min.y,v.box.max.y])for(const z of [v.box.min.z,v.box.max.z])points.push(view.project(v.box.min.clone().set(x,y,z).sub(view.center).applyQuaternion(view.root.quaternion)));}return points.length?{x:r.x+Math.min(...points.map(p=>p.x)),right:r.x+Math.max(...points.map(p=>p.x)),y:r.y+Math.min(...points.map(p=>p.y)),bottom:r.y+Math.max(...points.map(p=>p.y))}:null;}
// The lens copies one rendered frame; it never creates a glyph or changes the camera.
function realArrowDetail(canvas){const p=realArrowPoint();if(!p||!view)return null;const source=view.renderer.domElement,r=source.getBoundingClientRect(),g=p.glyphRect,side=Math.max(16,Math.max(g.width,g.height)+8),x=Math.max(0,Math.min(r.width-side,g.x+g.width/2-r.x-side/2)),y=Math.max(0,Math.min(r.height-side,g.y+g.height/2-r.y-side/2)),sx=source.width/r.width,sy=source.height/r.height;view.renderer.render(view.scene,view.camera);const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,x*sx,y*sy,side*sx,side*sy,0,0,canvas.width,canvas.height);return{id:p.id,dir:p.dir,source:'current-webgl-pixels',sourceRect:{x,y,side},scale:canvas.clientWidth/side,pixels:p.pixels,visibleSamples:p.visibleSamples};}
function acceptJob(index){guided.accepted();launchJob(index);}
function firstOrder(){openWorkshop('hub');if(guidance.enabled)guided.stand();}
metaRoot.querySelector('#world-tour').onclick=()=>{metaRoot.querySelector('.world-recovery').open=false;guided.startTour();};
const initialStory=storyFrame(storage.get(STORY_KEY),{legacy:hadSave,replay:storage.replay,mechanicalQA:qa});
const story=mountStory({storage,initial:initialStory,show:()=>changeScreen('story'),launch:launchJob,hub:()=>openWorkshop('hub'),accept:firstOrder,skip:()=>{guided.skipTour();openWorkshop('hub');}});
let storyPending=initialStory>0;
function intro(){if(guideEntry==='tutorial'){forceLesson=true;openWorkshop('hub');acceptJob(0);return;}if(guideEntry==='tour'){guided.startTour({resume:true});return;}if(storyPending){storyPending=false;story.open();}else if(guidance.enabled&&guidance.flow==='trim-v1'&&!guidance.standSeen&&!progress.obstructionLessonSeen)firstOrder();else openWorkshop('hub');}
async function launchJob(index){
 if(!Number.isInteger(index)||index<0||index>=JOBS.length)return;const state=workshopState(progress);if(index>0&&!qa&&!state.optionalJobs.includes(JOBS[index].id))return;
 pendingJob=index;metaUI.selectedJob=index;if(launchRunning)return;
 loading=true;loadFailure=null;metaUI.render();record('job-load-request',{index});launchRunning=true;
 loadTrace.attempt=++loadAttempt;const task=new LoadTask('engine');activeLoad=task;
 try{await task.paint();await ensureEngine(task);while(pendingJob!==null){const desired=pendingJob;if(orderIndex!==desired)await loadOrder(desired,{keepSplash:true,task});task.check();if(pendingJob!==desired)continue;pendingJob=null;
   await task.run('shader-ready',()=>view.renderer.compileAsync?view.renderer.compileAsync(view.scene,view.camera):Promise.resolve());
   await task.run('first-frame',async()=>{await task.paint();task.check();startJob();await task.paint();const canvas=view.renderer.domElement,r=canvas.getBoundingClientRect(),lost=view.renderer.getContext().isContextLost();if(lost||r.width<1||r.height<1||view.renderer.info.render.calls<1)throw loadError('FRAME_NOT_DRAWN','first-frame');loadTrace.event('frame-evidence','PASS',{drawCalls:view.renderer.info.render.calls,contextLost:lost,width:r.width,height:r.height,pieces:view.views.size});});
   loadTrace.event('playable-ready','PASS',{pieces:level.pieces.length});task.finish();break;
  }if(pendingJob===null&&!task.closed)task.finish('CANCELLED');
 }catch(e){task.cancel(e.code==='NAVIGATION_CANCELLED'?'NAVIGATION_CANCELLED':'FAILED');task.finish(e.code==='NAVIGATION_CANCELLED'?'CANCELLED':'ERROR',e);clearLoader(e);}
 finally{if(activeLoad===task){activeLoad=null;launchRunning=false;loading=false;if(META_PAGES.includes(mode))metaUI.render();}}
}
function clearLoader(error){setRendering(false);viewObserver?.disconnect();viewObserver=null;view?.destroy();view=null;ready=false;enginePromise=undefined;libraryReady=undefined;resetModelDelivery();pendingJob=null;loading=false;puzzle=null;lesson=null;gesture.reset();$('guide-hand').hidden=true;$('skip-tutorial').hidden=true;
 if(error.code!=='NAVIGATION_CANCELLED'){loadFailure={code:typeof error.code==='string'?error.code:'LOAD_FAILED',stage:error.stage||'unknown',reload:error.stage==='module-import'};changeScreen('hub');record('load-failed',{code:loadFailure.code,stage:loadFailure.stage});}if(META_PAGES.includes(mode))metaUI.render();
}
function retryLoad(){if(loading)return;if(loadFailure?.reload){try{sessionStorage.setItem('razborka.loadRetry',String(metaUI.selectedJob));}catch{}location.reload();return;}launchJob(metaUI.selectedJob);}
function installCore(){progress=mergeWorkshopSaves(storedProgress(),progress);const result=installThermocore(progress);progress=result.progress;save();metaUI.render();if(result.installed){sound('win');record('reactor-installed',{count:1});metaTalk.say('reactor-installed-'+events.length,'Реактор ожил. Теперь корабль кипятит неприятности без чайника.');}else metaTalk.say('reactor-not-installed-'+events.length,result.reason==='not-earned'?'Сначала добудь термоядро в первом чайнике. Пустое гнездо чаем не заполнишь.':'Ядро уже установлено. Второе из того же чайника не выжмешь.');}
save();window.addEventListener('storage',e=>{if(e.key!==storage.key(KEY)||storage.replay)return;progress=mergeWorkshopSaves(storedProgress(),progress);if(META_PAGES.includes(mode))metaUI.render();if(mode==='victory')renderVictory();});
function sound(kind){if(!soundOn)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=kind==='win'?[523,659,784,1046]:kind==='blocked'?[130,100]:[420+(puzzle?.removed.length||0)*22,820];notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.09;o.type=kind==='blocked'?'triangle':'sine';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.025,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.22);});}catch{}}
function makeDialogue(id){
 const el=$(id),text=el.textContent.trim();el.classList.add('typewriter');el.innerHTML='<span class="dialogue-reserve" aria-hidden="true"></span><span class="dialogue-typed"></span>';
 return new BrakychDialogue({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,emit:(type,data)=>record(type,data),render:line=>{el.querySelector('.dialogue-reserve').textContent=line.text;el.querySelector('.dialogue-typed').textContent=line.shown;el.closest('.speech-bubble').dataset.typing=String(line.typing);if(id==='brakych-line'){$('dialogue-cue').textContent=line.typing?'Нажми — дочитаю':line.next?'Нажми — дальше':line.action?'Теперь попробуй на стенде':'Смотри стрелки на деталях';}}});
}
const talk=makeDialogue('brakych-line'),introTalk=makeDialogue('intro-line'),winTalk=makeDialogue('win-line'),metaTalk=makeDialogue('meta-brakych-line');
function tickDialogue(){talk.tick();introTalk.tick();winTalk.tick();metaTalk.tick();requestAnimationFrame(tickDialogue);}requestAnimationFrame(tickDialogue);
function instruction(text,modal=false){talk.say('spatial-owner-'+generation+'-'+events.length,'');talk.line.next=null;document.querySelector('.inspector').hidden=true;$('spatial-action').textContent=modal?'':text;$('spatial-action').hidden=modal;document.body.dataset.instructionOwner=modal?'spotlight':'spatial';record('instruction-authority',{owner:modal?'spotlight':'spatial',text});}
function feedback(text,bad=false){if(guided.activeLesson()&&lesson){instruction(text);record('brakych-feedback',{text,bad});return;}talk.say('feedback-'+events.length,text,{action:lesson?.step||null});record('brakych-feedback',{text,bad});}
function activeTalk(){if(guided.blocked()||(mode==='play'&&lesson&&guided.activeLesson()))return null;return mode==='play'?talk:mode==='intro'?introTalk:mode==='victory'?winTalk:META_PAGES.includes(mode)?metaTalk:null;}
function dialogueTap(){const d=activeTalk();return d?d.tap():false;}
document.addEventListener('click',e=>{if(e.target.closest('button,a,canvas,summary,details'))return;dialogueTap();});
document.querySelectorAll('.speech-bubble:not(.story-cloud):not(.guide-cloud)').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Реплика Бракыча: дочитать или продолжить');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dialogueTap();}});});
function update(){
 $('counter').textContent=puzzle.removed.length+'/'+level.pieces.length;
 const stage=puzzleStage([...puzzle.active.values()]);
 $('stage-status').textContent=puzzle.won?'ЯДРО СПАСЕНО':stage==='core'?'ТЕРМОЯДРО':stage==='shell'?'ОБОЛОЧКА':'ВНУТРЕННИЙ МЕХАНИЗМ';
 if(!puzzle.won&&view.enterStage(stage)){zoomControls();positionHand();record('stage-entry',{stage,preset:view.stageScale.preset,manualZoom:view.manualZoom});if(stage==='inner')talk.say('inner-'+generation,'Ядро держат эти блоки. Вращай сборку, ищи стрелки на металле.');if(stage==='core')talk.say('core-'+generation,'Ядро свободно. Поверни его, найди стрелку — и снимай. Руками не грейся.');}
}
function endTutorial(skipped=false){
 if(!lesson)return;lesson=null;guided.cancel();document.querySelector('.inspector').hidden=false;document.querySelector('.inspector .dialogue-tools').append($('skip-tutorial'));delete document.body.dataset.instructionOwner;$('spatial-action').textContent='';$('spatial-action').hidden=false;progress.tutorialSeen=true;progress.obstructionLessonSeen=true;progress.obstructionLessonVersion=LESSON_VERSION;save();storage.set(OLD_TUTORIAL,'seen');
 $('skip-tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);talk.say('lesson-complete-'+generation,skipped?'Разбирай по стрелкам. Если упёрлось — ищи помеху.':'Вот и весь секрет: сперва помеха, потом деталь. Теперь чайник твой.');record('tutorial-complete',{skipped,version:LESSON_VERSION});
}
function guide(){
 if(!lesson)return;
 if(guided.activeLesson()){const step=lesson.step;if(step==='done'){endTutorial();guided.completed();return;}$('stage').dataset.onboarding=step;$('stage').append($('skip-tutorial'));$('skip-tutorial').hidden=false;$('guide-hand').hidden=true;view.setTutorialFocus(null);const cues={rotate:'Бракыч: потяни по стенду — поверни чайник.',attempt:guidance.explained.arrows?'Нажми на панель под крышкой.':'Поверни чайник — найди стрелку.',blocker:'Найди и сними помеху на пути панели.',retry:'Помеха снята. Снова нажми на панель.'};instruction(cues[step]||'Осмотри механизм.');guided.sync();if(step==='attempt'&&guidance.explained.arrows&&!guided.blocked()){$('guide-hand').className='guide-hand tap';positionHand();}record('tutorial-step',{step,target:lesson.target()});return;}
 const step=lesson.step;if(step==='done'){endTutorial();return;}
 $('stage').dataset.onboarding=step;$('skip-tutorial').hidden=false;$('guide-hand').className='guide-hand '+(step==='rotate'?'drag':'tap');
 const lines={rotate:['Потяни по стенду — поверни чайник. Перчатка показывает широкий жест под ним.','Вращай чайник. Детали снимаются коротким нажатием.'],attempt:['Проверь панель под крышкой: нажми в центр, куда указывает перчатка.','Нажми на верхнюю панель. Сейчас проверим её путь.'],blocker:['Панель упёрлась в крышку. Вот настоящая помеха. Сначала сними красную крышку.','Нажми на красную крышку. Её стрелка смотрит вверх.'],retry:['Крышка снята. Теперь снова нажми на панель: её путь вверх открыт.','Повтори нажатие на панель. Теперь она выйдет вверх.']}[step];
 talk.say('lesson-'+generation+'-'+step,lines[0],{action:step,next:()=>talk.say('lesson-'+generation+'-'+step+'-action',lines[1],{action:step})});
 view.setTutorialFocus(step==='rotate'?null:lesson.target());positionHand();record('tutorial-step',{step,target:lesson.target()});
}
function positionHand(){
 if(guided.activeLesson()&&(!lesson||lesson.step!=='attempt'||!guidance.explained.arrows||guided.blocked())){$('guide-hand').hidden=true;return;}
 if(!lesson)return;const rotate=lesson.step==='rotate',host=$('canvas-host'),hand=$('guide-hand');
 const point=rotate?view.rotationGesturePoint():view.tapTarget(lesson.target());
 hand.hidden=!point;if(!point)return;
 if(rotate){const room=$('stage').clientHeight-host.offsetTop-point.y-8,height=Math.min(35,room/(1-6/72));if(height<20){hand.hidden=true;return;}hand.style.height=height+'px';hand.style.width=(height*64/72)+'px';}else{hand.style.height='';hand.style.width='';}
 // The SVG fingertip is (27.5,6), not the centre of its bounding rectangle.
 const tipX=hand.offsetWidth*27.5/64,tipY=hand.offsetHeight*6/72;
 hand.style.left=(host.offsetLeft+point.x-tipX)+'px';hand.style.top=(host.offsetTop+point.y-tipY)+'px';
 hand.dataset.target=rotate?'rotate':lesson.target();
}
function tutorialVisual(){
 if(!lesson)return null;const host=$('canvas-host').getBoundingClientRect(),hand=$('guide-hand'),matrix=new DOMMatrix(getComputedStyle(hand).transform),originX=hand.offsetWidth*27.5/64,originY=hand.offsetHeight*6/72;
 const tip={};
 const stage=$('stage').getBoundingClientRect();tip.x=stage.left+$('stage').clientLeft+parseFloat(hand.style.left)+originX+matrix.e;tip.y=stage.top+$('stage').clientTop+parseFloat(hand.style.top)+originY+matrix.f;
 const expected=lesson.step==='rotate'?view.rotationGesturePoint():view.tapTarget(lesson.target());
 return{step:lesson.step,target:lesson.target(),hidden:hand.hidden,fingertip:tip,expected:expected?{x:host.left+expected.x,y:host.top+expected.y,centreError:expected.centreError}:null,picked:view.pick(tip.x,tip.y),error:expected?Math.hypot(tip.x-host.left-expected.x,tip.y-host.top-expected.y):null,rotationSweep:108};
}
function rotate(dx,dy){if(guided.blocked())return;view.rotate(dx,dy);rotDistance+=Math.hypot(dx,dy);rotations++;if(lesson){const old=lesson.step;lesson.rotated(rotDistance);if(old!==lesson.step)guide();}positionHand();}
function startJob(){
 if(!ready)return;generation++;gesture.reset();pointerPiece=null;puzzle=new Puzzle(level);view.reset();zoomControls();started=performance.now();blockedTaps=0;rotations=0;rotDistance=0;
 changeScreen('play');clearTimeout(feedbackTimer);$('feedback').classList.remove('show');talk.say('job-'+generation,'Сними оболочку. Под ней — механизм. Под механизмом — неприятности.');update();record('load',{level:level.id,parts:level.pieces.length,assetSHA256:view.assetSHA256});
 if(level.tutorial&&(forceLesson||!progress.obstructionLessonSeen||Number(progress.obstructionLessonVersion||0)<LESSON_VERSION)){forceLesson=false;lesson=new ObstructionLesson(level.tutorial);guide();}else{lesson=null;$('skip-tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);}
}
function attempt(id){
 if(mode!=='play'||!id||puzzle.busy||puzzle.won||guided.blocked()||!guided.permitsAttempt())return;
 if(guided.activeLesson()&&lesson&&!lesson.permits(id)){feedback(lesson.step==='rotate'?'Потяни по стенду — осмотри чайник.':lesson.step==='blocker'?'Найди настоящую помеху на пути панели.':'Первая проверка — панель под крышкой. Нажми на неё.');return;}
 if(lesson&&!lesson.permits(id)){feedback(lesson.step==='rotate'?'Сначала потяни чайник в сторону.':'Перчатка показывает деталь для этого примера. Можно пропустить обучение.');return;}
 const result=puzzle.begin(id);
 if(!result.ok){if(result.blocked?.length){blockedTaps++;record('blocked',{id,blockers:result.blocked,penalty:0});view.flash(id,result.blocked,!!lesson);sound('blocked');
  if(lesson){const old=lesson.step;lesson.blocked(id,result.blocked);if(old!==lesson.step)guide();}else feedback('Деталь упёрлась. Поверни конструкцию и осмотри соседей.',true);
 }return;}
 const token=generation;record('remove-start',{id,dir:result.piece.dir});sound('remove');
 view.remove(id,proof=>{if(token!==generation)return;if(!puzzle.complete(id))throw Error('Несогласованное завершение извлечения');record('remove-complete',{id,...proof});update();if(lesson){lesson.removed(id);guide();}
  if(puzzle.won){const reward=completeWorkshopJob(mergeWorkshopSaves(storedProgress(),progress),level.id);progress=reward.progress;progress.firstJobComplete=true;if(!progress.completedTemplates.includes(level.id))progress.completedTemplates.push(level.id);save();lastAward=reward.awarded;const earned=renderVictory();record('job-completed',{job:level.id,coreAwarded:reward.awarded,inventoryCount:earned.inventoryCount});sound('win');$('win-detail').textContent=level.pieces.length+' деталей · '+Math.round((performance.now()-started)/1000)+' сек · ни капли лишнего чая';winTalk.say('win-'+generation,earned.coreReady?'Ядро добыто! Пошли, установим его в реактор корабля.':level.reaction);$('next-order').textContent=qa&&orderIndex+1<library.length?'Следующее испытание · QA →':'В мастерскую →';record('win',{level:level.id,removed:[...puzzle.removed],blockedTaps,rotations});changeScreen('victory');$('next-order').focus({preventScroll:true});}
 });
}
function renderVictory(){const state=victoryState(progress,level?.id,{awarded:lastAward});$('win-reward').textContent=state.reward;$('win-ship').hidden=!state.installCTA;$('win-ship').textContent='К КОРАБЛЮ →';$('win-hub').hidden=!qa;return state;}
async function loadOrder(index,{keepSplash=false,task}={}){
 const owned=!task;task||=new LoadTask('engine');try{task.check();
 ready=false;orderIndex=index;level=library[index];generation++;puzzle=null;gesture.reset();lesson=null;$('guide-hand').hidden=true;$('skip-tutorial').hidden=true;view.setTutorialFocus(null);
 if(!keepSplash)openWorkshop('hub',{jobIndex:index});if(META_PAGES.includes(mode))metaUI.render();else{$('start-job').disabled=true;$('start-job').textContent='Готовим стенд…';}
 document.querySelector('.job-heading .eyebrow').textContent='ЗАКАЗ '+String(index+1).padStart(3,'0')+' · '+(index===0?'ПЕРВАЯ СМЕНА':'БЛОЧНАЯ СБОРКА');
 await loadDelivered(view,level,{qa,task,retry:loadAttempt>1,progress:p=>{if(task.signal.aborted)return;$('load-bar').style.width=Math.round(p*100)+'%';$('load-caption').textContent=p<.9?'Подключаем мастерскую…':'Почти готовы. Чайник уже подозревает.';}});
 task.check();ready=true;$('counter').textContent='0/'+level.pieces.length;$('start-job').disabled=false;$('start-job').textContent='Принять заказ →';$('load-caption').textContent='';zoomControls();$('qa-status').textContent=JSON.stringify(view.geometryAudit(),null,2);record('asset-ready',view.geometryAudit());if(META_PAGES.includes(mode))metaUI.render();if(pendingJob!==null&&!launchRunning)queueMicrotask(()=>launchJob(pendingJob));if(owned)task.finish();
 }catch(e){if(owned){task.cancel('FAILED');task.finish('ERROR',e);}throw e;}
}
const spatialCue=document.createElement('p');spatialCue.id='spatial-action';spatialCue.setAttribute('role','status');$('stage').append(spatialCue);
$('skip-splash').onclick=intro;$('start-job').onclick=()=>acceptJob(metaUI.selectedJob);$('restart').onclick=startJob;$('win-restart').onclick=startJob;
$('qa-replay-tutorial').onclick=async()=>{if(!qa||!ready)return;forceLesson=true;try{if(orderIndex!==0)await loadOrder(0);startJob();record('qa-tutorial-replay',{savePreserved:true});}catch(e){fatal(e);}};
$('next-order').onclick=()=>qa?loadOrder(orderIndex+1<library.length?orderIndex+1:0).catch(fatal):openWorkshop('hub');
$('game-hub').onclick=e=>{e.preventDefault();openWorkshop('hub');};$('win-hub').onclick=()=>openWorkshop('hub');$('win-ship').onclick=()=>openWorkshop('ship');
$('preview-back').onclick=intro;$('skip-tutorial').onclick=()=>{endTutorial(true);$('stage').focus({preventScroll:true});};$('retry').onclick=()=>location.reload();
$('hint').onclick=()=>{if(mode==='play'&&lesson&&guided.activeLesson()){guide();return;}if(mode==='play')feedback('Тяни — вращай. Нажимай на деталь по стрелке. Два пальца — масштаб.');};
function zoomControls(){if(!view)return;$('zoom-value').textContent=Math.round(view.manualZoom*100)+'%';$('zoom-plus').disabled=view.manualZoom>=MAX_ZOOM;$('zoom-minus').disabled=view.manualZoom<=MIN_ZOOM;}
function manualZoom(value,source){if(mode!=='play'||!view||guided.blocked())return;view.setZoom(value);zoomControls();positionHand();record('manual-zoom',{source,factor:view.manualZoom});}
$('zoom-plus').onclick=()=>manualZoom(view.manualZoom*1.25,'plus');$('zoom-minus').onclick=()=>manualZoom(view.manualZoom/1.25,'minus');$('zoom-reset').onclick=()=>manualZoom(1,'reset');
$('stage').addEventListener('keydown',e=>{if(mode!=='play'||!ready||guided.blocked()||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('button'))return;const delta={ArrowLeft:[-14,0],ArrowRight:[14,0],ArrowUp:[0,-14],ArrowDown:[0,14]}[e.key];if(delta){e.preventDefault();rotate(...delta);record('keyboard-rotate',{key:e.key});}else if(['+','=','-','0'].includes(e.key)){e.preventDefault();manualZoom(e.key==='0'?1:e.key==='-'?view.manualZoom/1.25:view.manualZoom*1.25,'keyboard');}});
window.addEventListener('resize',()=>requestAnimationFrame(positionHand));
function updateSound(){for(const id of ['sound','meta-sound']){$(id).setAttribute('aria-pressed',String(soundOn));$(id).setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук');}}updateSound();$('sound').onclick=()=>{soundOn=!soundOn;storage.set(SOUND,soundOn?'on':'off');updateSound();};$('meta-sound').onclick=()=>$('sound').click();
window.__salvage={snapshot:()=>({ready,screen:mode,workshop:workshopState(progress),story:story.snapshot(),guide:guided.snapshot(),instructionOwner:document.body.dataset.instructionOwner||null,realArrow:realArrowPoint(),rendering,level:level?.id,total:level?.pieces.length||0,active:puzzle?[...puzzle.active.keys()]:[],available:puzzle?available([...puzzle.active.values()]).map(p=>p.id):[],removed:puzzle?[...puzzle.removed]:[],busy:!!puzzle?.busy,won:!!puzzle?.won,tutorial:lesson?.step||null,progress:structuredClone(progress),markers:view&&puzzle?view.markers():[],angle:view?[view.root.rotation.x,view.root.rotation.y]:[],zoom:view?.manualZoom,stage:view?.stageScale.stage,stagePreset:view?.stageScale.preset,dialogue:activeTalk()?.snapshot()||null,instruction:{owner:document.body.dataset.instructionOwner||null,ordinary:talk.snapshot(),hasNext:!!talk.line?.next},inputMode:gesture.mode,assetSHA256:view?.assetSHA256,physics:view?.qaProof}),events:()=>events.map(e=>structuredClone(e)),arrows:()=>view?.arrowAudit(),paintedArrows:()=>view?.paintedArrowAudit(),tutorialVisual,appearance:()=>view?.appearanceAudit(),geometry:()=>view?.geometryAudit(),metrics:()=>view?.metrics(),framing:id=>view?.framingAudit(id)};
function fatal(e){console.error(e);$('fatal-message').textContent=e.message;changeScreen('fatal');record('fatal',{message:e.message});}
async function ensureEngine(task){if(enginePromise)return enginePromise;enginePromise=(async()=>{
 await ensureLibrary(task);
 const {createWorkshopScene}=await task.run('module-import',async()=>{await task.paint();return import('./scene.js?v=android-readiness-v1');},{timeoutMs:LOAD_LIMITS.module});
 await task.run('renderer-create',async()=>{view=await createWorkshopScene($('canvas-host'),{task});});setRendering(false);$('qa-panel').hidden=!qa||query.get('review')==='1';const canvas=view.renderer.domElement;
 viewObserver=new ResizeObserver(()=>requestAnimationFrame(positionHand));viewObserver.observe($('canvas-host'));
 canvas.addEventListener('pointerdown',e=>{if(mode!=='play'||!ready||guided.blocked())return;e.preventDefault();const action=gesture.down(e.pointerId,e.clientX,e.clientY,performance.now(),view.manualZoom);canvas.setPointerCapture(e.pointerId);if(action.type==='single-start'){pointerPiece=view.pick(e.clientX,e.clientY);view.select(pointerPiece);}else{pointerPiece=null;view.select(null);record(action.type);}});
 canvas.addEventListener('pointermove',e=>{if(mode!=='play'||guided.blocked())return;if(e.pointerType==='mouse'&&!e.buttons)view.select(view.pick(e.clientX,e.clientY));const action=gesture.move(e.pointerId,e.clientX,e.clientY);if(action?.type==='pinch'){manualZoom(action.zoom,'pinch');return;}const delta=action?.delta;if(delta&&(delta[0]||delta[1])){view.select(null);rotate(...delta);}});
 canvas.addEventListener('pointerup',e=>{if(mode!=='play'||guided.blocked())return;const result=gesture.up(e.pointerId,e.clientX,e.clientY,performance.now());if(result.tap&&(!talk.typing||guided.activeLesson())){if(talk.typing)talk.tap();const id=view.pick(e.clientX,e.clientY);if(id&&id===pointerPiece){if(talk.line?.next)talk.tap();attempt(id);}else dialogueTap();}else if(result.tap)talk.tap();if(result.pinchEnd)record('pinch-end');pointerPiece=null;view.select(null);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);guided.afterGesture();});
 canvas.addEventListener('pointercancel',e=>{gesture.cancel(e.pointerId);pointerPiece=null;view.select(null);record('pointer-cancel');});canvas.addEventListener('pointerleave',()=>{if(gesture.mode==='idle')view.select(null);});
 const dev=qa?library.findIndex(l=>l.id===query.get('template')):-1;await loadOrder(dev<0?0:dev,{keepSplash:true,task});return view;
 })();return enginePromise;}
async function ensureLibrary(task){if(library){loadTrace.event('library-cache','PASS',{cache:'verified'});return library;}if(libraryReady)return libraryReady;
 const promise=task.run('library',async()=>{const bytes=await loadBytes(new URL('./assets/puzzle-library.json',import.meta.url),task,'library-fetch',{timeoutMs:LOAD_LIMITS.library});const loaded=libraryFromCertificate(JSON.parse(new TextDecoder().decode(bytes)));for(const l of loaded){const errors=validateLevel(l);if(errors.length)throw Error(errors.join(', '));}task.check();library=loaded;return library;},{timeoutMs:LOAD_LIMITS.library});libraryReady=promise;try{return await promise;}catch(e){if(libraryReady===promise)libraryReady=undefined;throw e;}
}
async function boot(){if(qa){loadTrace.attempt=++loadAttempt;const task=new LoadTask('engine');activeLoad=task;try{await ensureEngine(task);task.finish();}catch(e){task.cancel('FAILED');task.finish('ERROR',e);clearLoader(e);}finally{if(activeLoad===task)activeLoad=null;}}else{let retry;try{retry=sessionStorage.getItem('razborka.loadRetry');sessionStorage.removeItem('razborka.loadRetry');}catch{}if(retry!==null&&retry!==undefined){openWorkshop('hub');launchJob(Number(retry));}}}
boot();
