import {existingImage,loadImageAsset,LoadTask} from './load-trace.js?v=android-readiness-v1';

export const STORY_KEY='razborka.story.v1',QA_PREFIX='razborka.storyQA.v1:';
const GAME_KEYS=['razborka.firstRun.v1','razborka.tutorial.v1','razborka.sound.v1',STORY_KEY,'razborka.guide.v2'];
// The QA namespace never reads, merges, removes or writes the owner's game keys.
export function storyStorage(real,query){
 const isolated=query.get('storyqa')==='1',replay=query.get('introReplay')==='1',memory=new Map();
 const key=k=>isolated?QA_PREFIX+k:k;
 if(isolated&&query.get('new')==='1')for(const k of GAME_KEYS)try{real.removeItem(key(k));}catch{}
 return{isolated,replay,key,get(k){try{return replay&&memory.has(k)?memory.get(k):real.getItem(key(k));}catch{return memory.get(k)||null;}},set(k,v){memory.set(k,v);if(replay)return;try{real.setItem(key(k),v);}catch{}},exitURL:typeof location==='undefined'?'':location.pathname};
}
export function storyFrame(raw,{legacy=false,replay=false,mechanicalQA=false}={}){
 if(replay)return 1;
 if(mechanicalQA)return 0;
 try{const s=JSON.parse(raw);if(s?.version===1&&s.done)return 0;if(s?.version===1&&[1,2].includes(s.frame))return s.frame;}catch{}
 return legacy?0:1;
}
export function mountStory({storage,initial,show,launch,hub,accept=()=>{hub();launch(0);},skip=()=>hub()}){
 const root=document.createElement('section');root.id='story';root.className='overlay story-world';root.hidden=true;root.setAttribute('aria-label','Первая смена в службе утилизации');
 const shells=[...document.querySelector('.inspector .speech-bubble').querySelectorAll('.bubble-shell')].map(s=>s.outerHTML).join('');
 root.innerHTML=`<picture class="story-backdrop"><source media="(max-width:600px) and (orientation:portrait)" srcset="./assets/world-hub-mobile.webp"><source media="(max-width:900px) and (orientation:portrait)" srcset="./assets/world-hub-portrait.webp"><img src="./assets/world-hub-wide.webp" alt="Ангар космической службы утилизации" decoding="async"></picture>
 <header class="story-header"><span class="story-stamp">АНГАР 04 · ПЕРВАЯ СМЕНА</span><span id="story-step"></span><button id="story-skip" class="tool">Пропустить → в мастерскую</button></header>
 <div class="story-composition"><div class="story-title"><small id="story-kicker"></small><h2 id="story-title"></h2></div>
 <img class="story-character" src="./assets/brakych-cutout.webp" alt="Бракыч приветствует нового сотрудника">
 <div class="story-cloud speech-bubble">${shells}<p class="eyebrow">БРАКЫЧ · ИНСПЕКТОР</p><p id="story-line"></p></div>
 <figure class="story-order" hidden><img id="story-teapot" alt="Реактивный чайник — первый заказ" decoding="async"><figcaption>ЗАКАЗ № 001<span>Реактивный чайник</span></figcaption></figure>
 <div class="story-caption" id="story-caption"></div></div>
 <footer class="story-footer"><span id="story-media-status" role="status"></span><button id="story-media-retry" class="tool" hidden>Повторить изображения</button><button id="story-back" class="quiet-link" hidden>← Назад</button><button id="story-next" class="primary"></button></footer>`;
 const tail=document.createElementNS('http://www.w3.org/2000/svg','svg');tail.classList.add('story-owner-tail');tail.setAttribute('aria-hidden','true');tail.innerHTML='<path></path>';root.querySelector('.story-composition').append(tail);
 for(const path of root.querySelectorAll('.story-cloud svg path'))path.setAttribute('d',path.getAttribute('d').replace('L15 231 L124 239','Q95 257 124 239').replace('L577 491 L598 420','Q635 437 598 420'));
 const pointTail=()=>{if(root.hidden)return;const host=root.querySelector('.story-composition').getBoundingClientRect(),b=root.querySelector('.story-cloud').getBoundingClientRect(),im=root.querySelector('.story-character'),r=im.getBoundingClientRect(),ratio=im.naturalWidth/im.naturalHeight,k=Math.min(r.width/im.naturalWidth,r.height/im.naturalHeight),iw=im.naturalWidth*k,ih=im.naturalHeight*k,head={x:r.x+(r.width-iw)/2+iw*.62,y:r.y+(r.height-ih)/2+ih*.27};let x=Math.max(b.x+b.width*.22,Math.min(b.right-b.width*.18,head.x)),y=b.y+b.height*.8;const dx=head.x-(b.x+b.width/2),dy=head.y-(b.y+b.height/2);if(Math.abs(dx)/b.width>Math.abs(dy)/b.height){x=dx>0?b.right-b.width*.075:b.x+b.width*.13;y=Math.max(b.y+b.height*.28,Math.min(b.y+b.height*.7,head.y));}const d=Math.hypot(head.x-x,head.y-y),ux=(head.x-x)/d,uy=(head.y-y)/d,nx=-uy*12,ny=ux*12,len=Math.min(82,Math.max(10,d-18)),tx=x+ux*len,ty=y+uy*len;tail.setAttribute('viewBox',`0 0 ${host.width} ${host.height}`);tail.querySelector('path').setAttribute('d',`M${x+nx-host.x} ${y+ny-host.y}L${tx-host.x} ${ty-host.y}L${x-nx-host.x} ${y-ny-host.y}Z`);root.dataset.speaker='brakych';root.dataset.tailTarget=JSON.stringify(head);};
 window.addEventListener('resize',()=>requestAnimationFrame(pointTail));new ResizeObserver(()=>requestAnimationFrame(pointTail)).observe(root);
 document.body.append(root);let frame=initial||1,mediaPromise;
 const persist=done=>{if(!storage.replay)storage.set(STORY_KEY,JSON.stringify({version:1,frame,done}));};
 const paint=()=>{requestAnimationFrame(()=>requestAnimationFrame(pointTail));root.dataset.frame=String(frame);root.querySelector('#story-step').textContent=frame+' / 2';root.querySelector('#story-kicker').textContent=frame===1?'ТВОЯ НОВАЯ РАБОТА':'ПЕРВЫЙ ЗАКАЗ';root.querySelector('#story-title').textContent=frame===1?'Добро пожаловать\nна разборку!':'Чайник с тягой\nв девять тонн.';
 root.querySelector('#story-line').textContent=frame===1?'Ты принят в космическую службу утилизации! Предыдущий сотрудник случайно разобрал себя.':'Сними корпус и механизм чайника. Внутри — ценное термоядро. Оно нужно реактору твоего корабля!';
 root.querySelector('#story-caption').textContent=frame===1?'Разбирай технику. Добывай компоненты для своего корабля и мастерской.':'Твой корабль ждёт это ядро.';root.querySelector('.story-order').hidden=frame!==2;root.querySelector('#story-back').hidden=frame===1;root.querySelector('#story-next').textContent=frame===1?'ДАЛЕЕ →':storage.replay?'В МАСТЕРСКУЮ →':'В МАСТЕРСКУЮ →';pointTail();};
 const media=({retry=false}={})=>{if(mediaPromise&&!retry)return mediaPromise;const status=root.querySelector('#story-media-status'),button=root.querySelector('#story-media-retry');status.textContent='Загружаем иллюстрации…';button.hidden=true;const task=new LoadTask('media:story',{timeoutMs:30000});
 mediaPromise=(async()=>{try{const [, , art]=await Promise.all([existingImage(root.querySelector('.story-backdrop img'),{retry}),existingImage(root.querySelector('.story-character'),{retry}),loadImageAsset('./assets/hub-teapot.webp',{retry})]);task.check();const img=root.querySelector('#story-teapot');img.src=art.url;await task.run('image-dom-decode',()=>img.decode(),{asset:'hub-teapot.webp'});if(!img.naturalWidth)throw Error('EMPTY_IMAGE');await task.paint();task.finish();status.textContent='';root.dataset.mediaState='ready';pointTail();}catch(e){task.cancel('FAILED');task.finish('ERROR',e);mediaPromise=null;root.dataset.mediaState='error';status.textContent='Иллюстрации не загрузились.';button.hidden=false;}})();return mediaPromise;};
 const exit=()=>{if(storage.replay){location.replace(storage.exitURL);return;}persist(true);root.hidden=true;skip();};
 root.querySelector('#story-skip').onclick=exit;root.querySelector('#story-back').onclick=()=>{frame=1;persist(false);paint();root.querySelector('#story-next').focus({preventScroll:true});};
 root.querySelector('#story-next').onclick=()=>{if(frame===1){frame=2;persist(false);paint();root.querySelector('#story-next').focus({preventScroll:true});return;}if(storage.replay){exit();return;}persist(true);root.hidden=true;accept();};
 root.querySelector('#story-media-retry').onclick=()=>media({retry:true});
 if(initial>0)persist(false);
 return{root,open(){paint();persist(false);show();root.hidden=false;media();root.querySelector('#story-next').focus({preventScroll:true});},snapshot:()=>({frame,replay:storage.replay,isolated:storage.isolated})};
}
