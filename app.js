import {libraryFromCertificate} from './levels.js';
import {Puzzle,available,validateLevel} from './puzzle.js';
import {ViewGesture,MIN_ZOOM,MAX_ZOOM} from './view-input.js';
import {loadDelivered,deliveredModel} from './model-delivery.js';
import {ObstructionLesson} from './onboarding.js';
import {BrakychDialogue} from './dialogue.js';
import {puzzleStage} from './stage-scale.js';
import {migrateWorkshop,mergeWorkshopSaves,completeWorkshopJob,installThermocore,workshopState,victoryState} from './workshop-progress.js';
import {mountWorkshop,WorkshopUI} from './workshop-ui.js';
import {JOBS} from './workshop-data.js';
const $=id=>document.getElementById(id),KEY='razborka.firstRun.v1',OLD_TUTORIAL='razborka.tutorial.v1',SOUND='razborka.sound.v1';
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
let saved;try{saved=JSON.parse(storage.get(KEY)||'{}');}catch{saved={};}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
let progress=migrateWorkshop({...saved,tutorialSeen:!!saved.tutorialSeen||storage.get(OLD_TUTORIAL)==='seen',firstJobComplete:!!saved.firstJobComplete,obstructionLessonSeen:!!saved.obstructionLessonSeen,completedTemplates:Array.isArray(saved.completedTemplates)?saved.completedTemplates:[]});
let view,library,level,puzzle,ready=false,mode='splash',generation=0,lesson=null,rotDistance=0,started=0,blockedTaps=0,rotations=0,soundOn=storage.get(SOUND)!=='off',audio,feedbackTimer,orderIndex=0;
let libraryReady;
const query=new URLSearchParams(location.search),qa=query.get('qa')==='1',gesture=new ViewGesture(),events=[],LESSON_VERSION=3;let pointerPiece=null,forceLesson=qa&&query.get('tutorial')==='1';
function storedProgress(){try{return JSON.parse(storage.get(KEY)||'{}');}catch{return{};}}
const save=()=>{progress=mergeWorkshopSaves(storedProgress(),progress);storage.set(KEY,JSON.stringify(progress));};
const record=(type,data={})=>{events.push({type,time:Math.round(performance.now()),...data});if(events.length>1000)events.shift();};
const META_PAGES=['hub','catalogue','ship','galaxy','concept'];let rendering=false,pendingJob=null,launchRunning=false,enginePromise,loading=false,lastAward=false;
const metaRoot=mountWorkshop();
const metaUI=new WorkshopUI(metaRoot,{progress:()=>progress,ready:()=>ready,loading:()=>loading,qa,navigate:openWorkshop,launch:launchJob,install:installCore,speak:(id,text)=>metaTalk.say(id,text)});
function setRendering(enabled){if(!view)return;if(enabled&&!rendering){rendering=true;view.lastFrame=null;view.raf=requestAnimationFrame(view.tick);}else if(!enabled){cancelAnimationFrame(view.raf);rendering=false;}}
function changeScreen(next){mode=next;document.body.dataset.screen=next;for(const id of ['splash','intro','win','preview','fatal'])$(id).hidden=id!==({splash:'splash',intro:'intro',victory:'win',preview:'preview',fatal:'fatal'}[next]);metaRoot.hidden=!META_PAGES.includes(next);if(!metaRoot.hidden)metaUI.show(next);setRendering(next==='play');record('screen',{screen:next});}
function openWorkshop(page='hub',{jobIndex}={}){pendingJob=null;if(mode==='play'){generation++;gesture.reset();lesson=null;puzzle=null;view?.reset();$('guide-hand').hidden=true;$('skip-tutorial').hidden=true;delete $('stage').dataset.onboarding;}if(jobIndex!==undefined)metaUI.selectedJob=jobIndex;else if(page==='hub')metaUI.selectedJob=qa?orderIndex:JOBS.findIndex(j=>j.id===workshopState(progress).recommendedJob);changeScreen(page);const state=workshopState(progress);const lines={hub:state.coreReady?'Ядро добыто. Открой корабль и установи его.':state.reactorInstalled?'Реактор включён. Испытания — в архиве.':'Разбери чайник. Его ядро нужно кораблю.',catalogue:'Чайник — одна веха. Два испытания необязательны. Другие аппараты — пока эскизы.',ship:state.reactorInstalled?'Реактор включён. Теперь корабль может греться собственными неприятностями.':state.coreReady?'Ядро подходит к этому гнезду. Установи его — пусть корабль тоже поработает.':'Ядро для реактора — в первом чайнике. Производитель называл это подогревом.',galaxy:'Первый сектор ждёт разборки. Остальные ещё в разработке. Хлам не торопится.'};if(lines[page])metaTalk.say('meta-'+page+'-'+events.length,lines[page]);if(page==='hub')metaUI.loadMedia('hub').then(()=>ensureEngine().catch(fatal));}
function intro(){openWorkshop('hub');}
async function launchJob(index){
 if(!Number.isInteger(index)||index<0||index>=JOBS.length)return;const state=workshopState(progress);if(index>0&&!qa&&!state.optionalJobs.includes(JOBS[index].id))return;
 pendingJob=index;metaUI.selectedJob=index;loading=true;metaUI.render();record('job-load-request',{index});if(launchRunning)return;
 if(ready&&view&&orderIndex===index){pendingJob=null;loading=false;startJob();return;}
 launchRunning=true;
 try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await ensureEngine();while(pendingJob!==null){const desired=pendingJob;if(orderIndex!==desired)await loadOrder(desired,{keepSplash:true});if(pendingJob!==desired)continue;pendingJob=null;loading=false;startJob();break;}}
 catch(e){fatal(e);}finally{launchRunning=false;loading=false;if(META_PAGES.includes(mode))metaUI.render();}
}
function installCore(){progress=mergeWorkshopSaves(storedProgress(),progress);const result=installThermocore(progress);progress=result.progress;save();metaUI.render();if(result.installed){sound('win');record('reactor-installed',{count:1});metaTalk.say('reactor-installed-'+events.length,'Реактор ожил. Теперь корабль кипятит неприятности без чайника.');}else metaTalk.say('reactor-not-installed-'+events.length,result.reason==='not-earned'?'Сначала добудь термоядро в первом чайнике. Пустое гнездо чаем не заполнишь.':'Ядро уже установлено. Второе из того же чайника не выжмешь.');}
save();window.addEventListener('storage',e=>{if(e.key!==KEY)return;progress=mergeWorkshopSaves(storedProgress(),progress);if(META_PAGES.includes(mode))metaUI.render();if(mode==='victory')renderVictory();});
function sound(kind){if(!soundOn)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=kind==='win'?[523,659,784,1046]:kind==='blocked'?[130,100]:[420+(puzzle?.removed.length||0)*22,820];notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.09;o.type=kind==='blocked'?'triangle':'sine';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.025,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.22);});}catch{}}
function makeDialogue(id){
 const el=$(id),text=el.textContent.trim();el.classList.add('typewriter');el.innerHTML='<span class="dialogue-reserve" aria-hidden="true"></span><span class="dialogue-typed"></span>';
 return new BrakychDialogue({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,emit:(type,data)=>record(type,data),render:line=>{el.querySelector('.dialogue-reserve').textContent=line.text;el.querySelector('.dialogue-typed').textContent=line.shown;el.closest('.speech-bubble').dataset.typing=String(line.typing);if(id==='brakych-line'){$('dialogue-cue').textContent=line.typing?'Нажми — дочитаю':line.next?'Нажми — дальше':line.action?'Теперь попробуй на стенде':'Смотри стрелки на деталях';}}});
}
const talk=makeDialogue('brakych-line'),introTalk=makeDialogue('intro-line'),winTalk=makeDialogue('win-line'),metaTalk=makeDialogue('meta-brakych-line');
function tickDialogue(){talk.tick();introTalk.tick();winTalk.tick();metaTalk.tick();requestAnimationFrame(tickDialogue);}requestAnimationFrame(tickDialogue);
function feedback(text,bad=false){talk.say('feedback-'+events.length,text,{action:lesson?.step||null});record('brakych-feedback',{text,bad});}
function activeTalk(){return mode==='play'?talk:mode==='intro'?introTalk:mode==='victory'?winTalk:META_PAGES.includes(mode)?metaTalk:null;}
function dialogueTap(){const d=activeTalk();return d?d.tap():false;}
document.addEventListener('click',e=>{if(e.target.closest('button,a,canvas,summary,details'))return;dialogueTap();});
document.querySelectorAll('.speech-bubble').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Реплика Бракыча: дочитать или продолжить');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dialogueTap();}});});
function update(){
 $('counter').textContent=puzzle.removed.length+'/'+level.pieces.length;
 const stage=puzzleStage([...puzzle.active.values()]);
 $('stage-status').textContent=puzzle.won?'ЯДРО СПАСЕНО':stage==='core'?'ТЕРМОЯДРО':stage==='shell'?'ОБОЛОЧКА':'ВНУТРЕННИЙ МЕХАНИЗМ';
 if(!puzzle.won&&view.enterStage(stage)){zoomControls();positionHand();record('stage-entry',{stage,preset:view.stageScale.preset,manualZoom:view.manualZoom});if(stage==='inner')talk.say('inner-'+generation,'Ядро держат эти блоки. Вращай сборку, ищи стрелки на металле.');if(stage==='core')talk.say('core-'+generation,'Ядро свободно. Поверни его, найди стрелку — и снимай. Руками не грейся.');}
}
function endTutorial(skipped=false){
 if(!lesson)return;lesson=null;progress.tutorialSeen=true;progress.obstructionLessonSeen=true;progress.obstructionLessonVersion=LESSON_VERSION;save();storage.set(OLD_TUTORIAL,'seen');
 $('skip-tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);talk.say('lesson-complete-'+generation,skipped?'Разбирай по стрелкам. Если упёрлось — ищи помеху.':'Вот и весь секрет: сперва помеха, потом деталь. Теперь чайник твой.');record('tutorial-complete',{skipped,version:LESSON_VERSION});
}
function guide(){
 if(!lesson)return;const step=lesson.step;if(step==='done'){endTutorial();return;}
 $('stage').dataset.onboarding=step;$('skip-tutorial').hidden=false;$('guide-hand').className='guide-hand '+(step==='rotate'?'drag':'tap');
 const lines={rotate:['Потяни по стенду — поверни чайник. Перчатка показывает широкий жест под ним.','Вращай чайник. Детали снимаются коротким нажатием.'],attempt:['Проверь панель под крышкой: нажми в центр, куда указывает перчатка.','Нажми на верхнюю панель. Сейчас проверим её путь.'],blocker:['Панель упёрлась в крышку. Вот настоящая помеха. Сначала сними красную крышку.','Нажми на красную крышку. Её стрелка смотрит вверх.'],retry:['Крышка снята. Теперь снова нажми на панель: её путь вверх открыт.','Повтори нажатие на панель. Теперь она выйдет вверх.']}[step];
 talk.say('lesson-'+generation+'-'+step,lines[0],{action:step,next:()=>talk.say('lesson-'+generation+'-'+step+'-action',lines[1],{action:step})});
 view.setTutorialFocus(step==='rotate'?null:lesson.target());positionHand();record('tutorial-step',{step,target:lesson.target()});
}
function positionHand(){
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
function rotate(dx,dy){view.rotate(dx,dy);rotDistance+=Math.hypot(dx,dy);rotations++;if(lesson){const old=lesson.step;lesson.rotated(rotDistance);if(old!==lesson.step)guide();}positionHand();}
function startJob(){
 if(!ready)return;generation++;gesture.reset();pointerPiece=null;puzzle=new Puzzle(level);view.reset();zoomControls();started=performance.now();blockedTaps=0;rotations=0;rotDistance=0;
 changeScreen('play');clearTimeout(feedbackTimer);$('feedback').classList.remove('show');talk.say('job-'+generation,'Сними оболочку. Под ней — механизм. Под механизмом — неприятности.');update();record('load',{level:level.id,parts:level.pieces.length,assetSHA256:view.assetSHA256});
 if(level.tutorial&&(forceLesson||!progress.obstructionLessonSeen||Number(progress.obstructionLessonVersion||0)<LESSON_VERSION)){forceLesson=false;lesson=new ObstructionLesson(level.tutorial);guide();}else{lesson=null;$('skip-tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);}
}
function attempt(id){
 if(mode!=='play'||!id||puzzle.busy||puzzle.won)return;
 if(lesson&&!lesson.permits(id)){feedback(lesson.step==='rotate'?'Сначала потяни чайник в сторону.':'Перчатка показывает деталь для этого примера. Можно пропустить обучение.');return;}
 const result=puzzle.begin(id);
 if(!result.ok){if(result.blocked?.length){blockedTaps++;record('blocked',{id,blockers:result.blocked,penalty:0});view.flash(id,result.blocked,!!lesson);sound('blocked');
  if(lesson){const old=lesson.step;lesson.blocked(id,result.blocked);if(old!==lesson.step)guide();}else feedback('Деталь упёрлась. Поверни конструкцию и осмотри соседей.',true);
 }return;}
 const token=generation;record('remove-start',{id,dir:result.piece.dir});sound('remove');
 view.remove(id,proof=>{if(token!==generation)return;if(!puzzle.complete(id))throw Error('Несогласованное завершение извлечения');record('remove-complete',{id,...proof});update();if(lesson){lesson.removed(id);guide();}
  if(puzzle.won){const reward=completeWorkshopJob(mergeWorkshopSaves(storedProgress(),progress),level.id);progress=reward.progress;progress.firstJobComplete=true;if(!progress.completedTemplates.includes(level.id))progress.completedTemplates.push(level.id);save();lastAward=reward.awarded;const earned=renderVictory();record('job-completed',{job:level.id,coreAwarded:reward.awarded,inventoryCount:earned.inventoryCount});sound('win');$('win-detail').textContent=level.pieces.length+' деталей · '+Math.round((performance.now()-started)/1000)+' сек · ни капли лишнего чая';winTalk.say('win-'+generation,level.reaction);$('next-order').textContent=qa&&orderIndex+1<library.length?'Следующее испытание · QA →':'В мастерскую →';record('win',{level:level.id,removed:[...puzzle.removed],blockedTaps,rotations});changeScreen('victory');$('next-order').focus({preventScroll:true});}
 });
}
function renderVictory(){const state=victoryState(progress,level?.id,{awarded:lastAward});$('win-reward').textContent=state.reward;$('win-ship').hidden=!state.installCTA;$('win-hub').hidden=!qa;return state;}
async function loadOrder(index,{keepSplash=false}={}){
 ready=false;orderIndex=index;level=library[index];generation++;puzzle=null;gesture.reset();lesson=null;$('guide-hand').hidden=true;$('skip-tutorial').hidden=true;view.setTutorialFocus(null);
 if(!keepSplash)openWorkshop('hub',{jobIndex:index});if(META_PAGES.includes(mode))metaUI.render();else{$('start-job').disabled=true;$('start-job').textContent='Готовим стенд…';}
 document.querySelector('.job-heading .eyebrow').textContent='ЗАКАЗ '+String(index+1).padStart(3,'0')+' · '+(index===0?'ПЕРВАЯ СМЕНА':'БЛОЧНАЯ СБОРКА');
 await loadDelivered(view,level,{qa,progress:p=>{$('load-bar').style.width=Math.round(p*100)+'%';$('load-caption').textContent=p<.9?'Подключаем мастерскую…':'Почти готовы. Чайник уже подозревает.';}});
 ready=true;$('counter').textContent='0/'+level.pieces.length;$('start-job').disabled=false;$('start-job').textContent='Принять заказ →';$('load-caption').textContent='';zoomControls();$('qa-status').textContent=JSON.stringify(view.geometryAudit(),null,2);record('asset-ready',view.geometryAudit());if(META_PAGES.includes(mode))metaUI.render();if(pendingJob!==null&&!launchRunning)queueMicrotask(()=>launchJob(pendingJob));
}
$('skip-splash').onclick=intro;$('start-job').onclick=()=>launchJob(metaUI.selectedJob);$('restart').onclick=startJob;$('win-restart').onclick=startJob;
$('qa-replay-tutorial').onclick=async()=>{if(!qa||!ready)return;forceLesson=true;try{if(orderIndex!==0)await loadOrder(0);startJob();record('qa-tutorial-replay',{savePreserved:true});}catch(e){fatal(e);}};
$('next-order').onclick=()=>qa?loadOrder(orderIndex+1<library.length?orderIndex+1:0).catch(fatal):openWorkshop('hub');
$('game-hub').onclick=e=>{e.preventDefault();openWorkshop('hub');};$('win-hub').onclick=()=>openWorkshop('hub');$('win-ship').onclick=()=>openWorkshop('ship');
$('preview-back').onclick=intro;$('skip-tutorial').onclick=()=>endTutorial(true);$('retry').onclick=()=>location.reload();
$('hint').onclick=()=>{if(mode==='play')feedback('Тяни — вращай. Нажимай на деталь по стрелке. Два пальца — масштаб.');};
function zoomControls(){if(!view)return;$('zoom-value').textContent=Math.round(view.manualZoom*100)+'%';$('zoom-plus').disabled=view.manualZoom>=MAX_ZOOM;$('zoom-minus').disabled=view.manualZoom<=MIN_ZOOM;}
function manualZoom(value,source){if(mode!=='play'||!view)return;view.setZoom(value);zoomControls();positionHand();record('manual-zoom',{source,factor:view.manualZoom});}
$('zoom-plus').onclick=()=>manualZoom(view.manualZoom*1.25,'plus');$('zoom-minus').onclick=()=>manualZoom(view.manualZoom/1.25,'minus');$('zoom-reset').onclick=()=>manualZoom(1,'reset');
$('stage').addEventListener('keydown',e=>{if(mode!=='play'||!ready||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('button'))return;const delta={ArrowLeft:[-14,0],ArrowRight:[14,0],ArrowUp:[0,-14],ArrowDown:[0,14]}[e.key];if(delta){e.preventDefault();rotate(...delta);record('keyboard-rotate',{key:e.key});}else if(['+','=','-','0'].includes(e.key)){e.preventDefault();manualZoom(e.key==='0'?1:e.key==='-'?view.manualZoom/1.25:view.manualZoom*1.25,'keyboard');}});
window.addEventListener('resize',()=>requestAnimationFrame(positionHand));
function updateSound(){for(const id of ['sound','meta-sound']){$(id).setAttribute('aria-pressed',String(soundOn));$(id).setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук');}}updateSound();$('sound').onclick=()=>{soundOn=!soundOn;storage.set(SOUND,soundOn?'on':'off');updateSound();};$('meta-sound').onclick=()=>$('sound').click();
window.__salvage={snapshot:()=>({ready,screen:mode,workshop:workshopState(progress),rendering,level:level?.id,total:level?.pieces.length||0,active:puzzle?[...puzzle.active.keys()]:[],available:puzzle?available([...puzzle.active.values()]).map(p=>p.id):[],removed:puzzle?[...puzzle.removed]:[],busy:!!puzzle?.busy,won:!!puzzle?.won,tutorial:lesson?.step||null,progress:structuredClone(progress),markers:view&&puzzle?view.markers():[],angle:view?[view.root.rotation.x,view.root.rotation.y]:[],zoom:view?.manualZoom,stage:view?.stageScale.stage,stagePreset:view?.stageScale.preset,dialogue:activeTalk()?.snapshot(),inputMode:gesture.mode,assetSHA256:view?.assetSHA256,physics:view?.qaProof}),events:()=>events.map(e=>structuredClone(e)),arrows:()=>view?.arrowAudit(),paintedArrows:()=>view?.paintedArrowAudit(),tutorialVisual,appearance:()=>view?.appearanceAudit(),geometry:()=>view?.geometryAudit(),metrics:()=>view?.metrics(),framing:id=>view?.framingAudit(id)};
function fatal(e){console.error(e);$('fatal-message').textContent=e.message;changeScreen('fatal');record('fatal',{message:e.message});}
async function ensureEngine(){if(enginePromise)return enginePromise;enginePromise=(async()=>{
 await libraryReady;
 const modelReady=deliveredModel().then(bytes=>({bytes}),error=>({error}));
 const {WorkshopScene}=await import('./scene.js');view=new WorkshopScene($('canvas-host'));setRendering(false);$('qa-panel').hidden=!qa||query.get('review')==='1';const canvas=view.renderer.domElement;
 new ResizeObserver(()=>requestAnimationFrame(positionHand)).observe($('canvas-host'));
 canvas.addEventListener('pointerdown',e=>{if(mode!=='play'||!ready)return;e.preventDefault();const action=gesture.down(e.pointerId,e.clientX,e.clientY,performance.now(),view.manualZoom);canvas.setPointerCapture(e.pointerId);if(action.type==='single-start'){pointerPiece=view.pick(e.clientX,e.clientY);view.select(pointerPiece);}else{pointerPiece=null;view.select(null);record(action.type);}});
 canvas.addEventListener('pointermove',e=>{if(mode!=='play')return;if(e.pointerType==='mouse'&&!e.buttons)view.select(view.pick(e.clientX,e.clientY));const action=gesture.move(e.pointerId,e.clientX,e.clientY);if(action?.type==='pinch'){manualZoom(action.zoom,'pinch');return;}const delta=action?.delta;if(delta&&(delta[0]||delta[1])){view.select(null);rotate(...delta);}});
 canvas.addEventListener('pointerup',e=>{if(mode!=='play')return;const result=gesture.up(e.pointerId,e.clientX,e.clientY,performance.now());if(result.tap&&!talk.typing){const id=view.pick(e.clientX,e.clientY);if(id&&id===pointerPiece){if(talk.line?.next)talk.tap();attempt(id);}else dialogueTap();}else if(result.tap)talk.tap();if(result.pinchEnd)record('pinch-end');pointerPiece=null;view.select(null);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
 canvas.addEventListener('pointercancel',e=>{gesture.cancel(e.pointerId);pointerPiece=null;view.select(null);record('pointer-cancel');});canvas.addEventListener('pointerleave',()=>{if(gesture.mode==='idle')view.select(null);});
 const dev=qa?library.findIndex(l=>l.id===query.get('template')):-1;const model=await modelReady;if(model.error)throw model.error;await loadOrder(dev<0?0:dev,{keepSplash:true});return view;
 })();return enginePromise;}
async function boot(){try{
 libraryReady=(async()=>{library=libraryFromCertificate(await(await fetch(new URL('./assets/puzzle-library.json',import.meta.url))).json());for(const l of library){const errors=validateLevel(l);if(errors.length)throw Error(errors.join(', '));}})();await libraryReady;
 if(qa)await ensureEngine();
 }catch(e){fatal(e);}}
boot();
