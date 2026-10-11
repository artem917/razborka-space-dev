import {libraryFromCertificate} from './levels.js';
import {Puzzle,available,validateLevel} from './puzzle.js';
import {ViewGesture,MIN_ZOOM,MAX_ZOOM} from './view-input.js';
import {WorkshopScene} from './scene.js';
import {ObstructionLesson} from './onboarding.js';
const $=id=>document.getElementById(id),KEY='razborka.firstRun.v1',OLD_TUTORIAL='razborka.tutorial.v1',SOUND='razborka.sound.v1';
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
let saved;try{saved=JSON.parse(storage.get(KEY)||'{}');}catch{saved={};}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
let progress={...saved,tutorialSeen:!!saved.tutorialSeen||storage.get(OLD_TUTORIAL)==='seen',firstJobComplete:!!saved.firstJobComplete,obstructionLessonSeen:!!saved.obstructionLessonSeen,completedTemplates:Array.isArray(saved.completedTemplates)?saved.completedTemplates:[]};
let view,library,level,puzzle,ready=false,mode='splash',generation=0,lesson=null,rotDistance=0,started=0,blockedTaps=0,rotations=0,soundOn=storage.get(SOUND)!=='off',audio,feedbackTimer,orderIndex=0;
const query=new URLSearchParams(location.search),qa=query.get('qa')==='1',gesture=new ViewGesture(),events=[];let pointerPiece=null;
const save=()=>storage.set(KEY,JSON.stringify(progress));
const record=(type,data={})=>{events.push({type,time:Math.round(performance.now()),...data});if(events.length>1000)events.shift();};
function changeScreen(next){mode=next;document.body.dataset.screen=next;for(const id of ['splash','intro','win','preview','fatal'])$(id).hidden=id!==({splash:'splash',intro:'intro',victory:'win',preview:'preview',fatal:'fatal'}[next]);record('screen',{screen:next});}
function intro(){changeScreen('intro');if(progress.firstJobComplete&&orderIndex===0)$('intro-line').textContent='Чайник вернулся. Говорит, что забыл выключить себя.';}
function sound(kind){if(!soundOn)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=kind==='win'?[523,659,784,1046]:kind==='blocked'?[130,100]:[420+(puzzle?.removed.length||0)*22,820];notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.09;o.type=kind==='blocked'?'triangle':'sine';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.025,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.2);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.22);});}catch{}}
function feedback(text,bad=false){clearTimeout(feedbackTimer);$('feedback').textContent=text;$('feedback').className='feedback show'+(bad?' bad':'');feedbackTimer=setTimeout(()=>$('feedback').classList.remove('show'),1800);}
function update(){
 $('counter').textContent=puzzle.removed.length+'/'+level.pieces.length;
 const shell=[...puzzle.active.values()].filter(p=>p.stage==='shell').length;
 $('stage-status').textContent=puzzle.won?'ЯДРО СПАСЕНО':puzzle.active.size===1?'ТЕРМОЯДРО':shell?'ОБОЛОЧКА':'ВНУТРЕННИЙ МЕХАНИЗМ';
 if(!shell&&puzzle.active.size>1)$('brakych-line').textContent='Вот теперь интересно. Ядро держат эти блоки. Разбирай по стрелкам.';
 if(!shell&&puzzle.active.size===1)$('brakych-line').textContent='Осталось ядро. Нажми на него — пусть остывает отдельно.';
}
function endTutorial(skipped=false){
 if(!lesson)return;lesson=null;progress.tutorialSeen=true;progress.obstructionLessonSeen=true;save();storage.set(OLD_TUTORIAL,'seen');
 $('tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);record('tutorial-complete',{skipped,version:2});
}
function guide(){
 if(!lesson)return;const step=lesson.step;if(step==='done'){endTutorial();return;}
 $('stage').dataset.onboarding=step;$('tutorial').hidden=false;$('guide-hand').className='guide-hand '+(step==='rotate'?'drag':'tap');
 const text={rotate:['01 / 04 · ОСМОТРИ','Потяни — поверни чайник','Веди пальцем по стенду. Это вращение, не снятие.'],attempt:['02 / 04 · ПРОВЕРЬ','Нажми на верхнюю панель','Коснись панели под крышкой. Не тяни её пальцем.'],blocker:['03 / 04 · УПОР','Панели мешает крышка','Теперь нажми на красную крышку — сними препятствие.'],retry:['04 / 04 · ПОВТОРИ','Снова нажми на панель','Крышка снята. Панель выйдет вверх по своей стрелке.']}[step];
 [$('guide-step').textContent,$('guide-title').textContent,$('guide-text').textContent]=text;
 view.setTutorialFocus(step==='rotate'?null:lesson.target());positionHand();record('tutorial-step',{step,target:lesson.target()});
}
function positionHand(){
 if(!lesson)return;const rotate=lesson.step==='rotate',host=$('canvas-host'),hand=$('guide-hand');
 const point=rotate?view.rotationGesturePoint():view.tapTarget(lesson.target());
 hand.hidden=!point;if(!point)return;
 if(rotate){const room=$('tutorial').offsetTop-host.offsetTop-point.y-4,height=Math.min(35,room/(1-6/72));if(height<20){hand.hidden=true;return;}hand.style.height=height+'px';hand.style.width=(height*64/72)+'px';}else{hand.style.height='';hand.style.width='';}
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
 if(!ready)return;generation++;gesture.reset();pointerPiece=null;puzzle=new Puzzle(level);view.reset();started=performance.now();blockedTaps=0;rotations=0;rotDistance=0;
 changeScreen('play');clearTimeout(feedbackTimer);$('feedback').classList.remove('show');$('brakych-line').textContent='Сними оболочку. Под ней — механизм. Под механизмом — неприятности.';update();record('load',{level:level.id,parts:level.pieces.length,assetSHA256:view.assetSHA256});
 if(level.tutorial&&!progress.obstructionLessonSeen){lesson=new ObstructionLesson(level.tutorial);guide();}else{lesson=null;$('tutorial').hidden=true;$('guide-hand').hidden=true;delete $('stage').dataset.onboarding;view.setTutorialFocus(null);}
}
function attempt(id){
 if(mode!=='play'||!id||puzzle.busy||puzzle.won)return;
 if(lesson&&!lesson.permits(id)){feedback(lesson.step==='rotate'?'Сначала потяни чайник в сторону.':'Перчатка показывает деталь для этого примера. Можно пропустить обучение.');return;}
 const result=puzzle.begin(id);
 if(!result.ok){if(result.blocked?.length){blockedTaps++;record('blocked',{id,blockers:result.blocked,penalty:0});view.flash(id,result.blocked,!!lesson);sound('blocked');
  if(lesson){const old=lesson.step;lesson.blocked(id,result.blocked);if(old!==lesson.step)guide();feedback('Панель упёрлась в крышку.',true);}else feedback('Деталь упёрлась. Поверни конструкцию и осмотри соседей.',true);
 }return;}
 const token=generation;record('remove-start',{id,dir:result.piece.dir});sound('remove');
 view.remove(id,proof=>{if(token!==generation)return;if(!puzzle.complete(id))throw Error('Несогласованное завершение извлечения');record('remove-complete',{id,...proof});update();if(lesson){lesson.removed(id);guide();}
  if(puzzle.won){progress.firstJobComplete=true;if(!progress.completedTemplates.includes(level.id))progress.completedTemplates.push(level.id);save();sound('win');$('win-detail').textContent=level.pieces.length+' деталей · '+Math.round((performance.now()-started)/1000)+' сек · ни капли лишнего чая';document.querySelector('#win .speech-bubble p').textContent=level.reaction;$('next-order').textContent=orderIndex+1<library.length?'Следующий заказ →':'В мастерскую →';record('win',{level:level.id,removed:[...puzzle.removed],blockedTaps,rotations});changeScreen('victory');$('next-order').focus({preventScroll:true});}
 });
}
async function loadOrder(index,{keepSplash=false}={}){
 ready=false;orderIndex=index;level=library[index];generation++;puzzle=null;gesture.reset();lesson=null;$('guide-hand').hidden=true;$('tutorial').hidden=true;view.setTutorialFocus(null);
 if(!keepSplash)changeScreen('intro');$('start-job').disabled=true;$('start-job').textContent='Готовим стенд…';
 document.querySelector('.job-heading .eyebrow').textContent='ЗАКАЗ '+String(index+1).padStart(3,'0')+' · '+(index===0?'ПЕРВАЯ СМЕНА':'БЛОЧНАЯ СБОРКА');
 if(index)$('intro-line').textContent=index===1?'Тот же чайник. Внутри деталей больше. Производитель называет это улучшением.':'Детали переставили. Ответственность — тоже.';
 await view.load(level,{qa,progress:p=>{$('load-bar').style.width=Math.round(p*100)+'%';$('load-caption').textContent=p<.9?'Подключаем мастерскую…':'Почти готовы. Чайник уже подозревает.';}});
 ready=true;$('counter').textContent='0/'+level.pieces.length;$('start-job').disabled=false;$('start-job').textContent='Принять заказ →';$('load-caption').textContent='';zoomControls();$('qa-status').textContent=JSON.stringify(view.geometryAudit(),null,2);record('asset-ready',view.geometryAudit());
}
$('skip-splash').onclick=intro;$('start-job').onclick=startJob;$('restart').onclick=startJob;$('win-restart').onclick=startJob;
$('next-order').onclick=()=>loadOrder(orderIndex+1<library.length?orderIndex+1:0).catch(fatal);
$('preview-back').onclick=intro;$('skip-tutorial').onclick=()=>endTutorial(true);$('retry').onclick=()=>location.reload();
$('hint').onclick=()=>{if(mode==='play')feedback('Тяни — вращай. Нажимай на деталь по стрелке. Два пальца — масштаб.');};
function zoomControls(){if(!view)return;$('zoom-value').textContent=Math.round(view.manualZoom*100)+'%';$('zoom-plus').disabled=view.manualZoom>=MAX_ZOOM;$('zoom-minus').disabled=view.manualZoom<=MIN_ZOOM;}
function manualZoom(value,source){if(mode!=='play'||!view)return;view.setZoom(value);zoomControls();positionHand();record('manual-zoom',{source,factor:view.manualZoom});}
$('zoom-plus').onclick=()=>manualZoom(view.manualZoom*1.25,'plus');$('zoom-minus').onclick=()=>manualZoom(view.manualZoom/1.25,'minus');$('zoom-reset').onclick=()=>manualZoom(1,'reset');
$('stage').addEventListener('keydown',e=>{if(mode!=='play'||!ready||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('button'))return;const delta={ArrowLeft:[-14,0],ArrowRight:[14,0],ArrowUp:[0,-14],ArrowDown:[0,14]}[e.key];if(delta){e.preventDefault();rotate(...delta);record('keyboard-rotate',{key:e.key});}else if(['+','=','-','0'].includes(e.key)){e.preventDefault();manualZoom(e.key==='0'?1:e.key==='-'?view.manualZoom/1.25:view.manualZoom*1.25,'keyboard');}});
window.addEventListener('resize',()=>requestAnimationFrame(positionHand));
function updateSound(){$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук');}updateSound();$('sound').onclick=()=>{soundOn=!soundOn;storage.set(SOUND,soundOn?'on':'off');updateSound();};
window.__salvage={snapshot:()=>({ready,screen:mode,level:level?.id,total:level?.pieces.length||0,active:puzzle?[...puzzle.active.keys()]:[],available:puzzle?available([...puzzle.active.values()]).map(p=>p.id):[],removed:puzzle?[...puzzle.removed]:[],busy:!!puzzle?.busy,won:!!puzzle?.won,tutorial:lesson?.step||null,progress:structuredClone(progress),markers:view&&puzzle?view.markers():[],angle:view?[view.root.rotation.x,view.root.rotation.y]:[],zoom:view?.manualZoom,inputMode:gesture.mode,assetSHA256:view?.assetSHA256,physics:view?.qaProof}),events:()=>events.map(e=>structuredClone(e)),arrows:()=>view?.arrowAudit(),paintedArrows:()=>view?.paintedArrowAudit(),tutorialVisual,appearance:()=>view?.appearanceAudit(),geometry:()=>view?.geometryAudit(),metrics:()=>view?.metrics(),framing:id=>view?.framingAudit(id)};
function fatal(e){console.error(e);$('fatal-message').textContent=e.message;changeScreen('fatal');record('fatal',{message:e.message});}
async function boot(){try{
 library=libraryFromCertificate(await(await fetch(new URL('./assets/puzzle-library.json',import.meta.url))).json());for(const l of library){const errors=validateLevel(l);if(errors.length)throw Error(errors.join(', '));}
 view=new WorkshopScene($('canvas-host'));$('qa-panel').hidden=!qa||query.get('review')==='1';const canvas=view.renderer.domElement;
 canvas.addEventListener('pointerdown',e=>{if(mode!=='play'||!ready)return;e.preventDefault();const action=gesture.down(e.pointerId,e.clientX,e.clientY,performance.now(),view.manualZoom);canvas.setPointerCapture(e.pointerId);if(action.type==='single-start'){pointerPiece=view.pick(e.clientX,e.clientY);view.select(pointerPiece);}else{pointerPiece=null;view.select(null);record(action.type);}});
 canvas.addEventListener('pointermove',e=>{if(mode!=='play')return;if(e.pointerType==='mouse'&&!e.buttons)view.select(view.pick(e.clientX,e.clientY));const action=gesture.move(e.pointerId,e.clientX,e.clientY);if(action?.type==='pinch'){manualZoom(action.zoom,'pinch');return;}const delta=action?.delta;if(delta&&(delta[0]||delta[1])){view.select(null);rotate(...delta);}});
 canvas.addEventListener('pointerup',e=>{if(mode!=='play')return;const result=gesture.up(e.pointerId,e.clientX,e.clientY,performance.now());if(result.tap){const id=view.pick(e.clientX,e.clientY);if(id&&id===pointerPiece)attempt(id);}if(result.pinchEnd)record('pinch-end');pointerPiece=null;view.select(null);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
 canvas.addEventListener('pointercancel',e=>{gesture.cancel(e.pointerId);pointerPiece=null;view.select(null);record('pointer-cancel');});canvas.addEventListener('pointerleave',()=>{if(gesture.mode==='idle')view.select(null);});
 const dev=qa?library.findIndex(l=>l.id===query.get('template')):-1;await loadOrder(dev<0?0:dev,{keepSplash:true});
 }catch(e){fatal(e);}}
boot();
