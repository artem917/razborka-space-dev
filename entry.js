// Evaluate the experiment before the owner application can initialize saves.
export function pilotEnabled(value){const url=new URL(value),loopback=/^127(?:\.\d{1,3}){3}$/.test(url.hostname)||url.hostname==='[::1]';return url.searchParams.get('voxelpilot')==='arch02'&&(loopback||(url.hostname==='artem917.github.io'&&url.pathname.startsWith('/razborka-space-dev/')));}
if(typeof document!=='undefined'){
 const pilot=pilotEnabled(location.href);if(pilot){document.body.dataset.voxelPilot='true';for(const node of document.body.children)node.hidden=true;}
 const boot=pilot?import('./voxel-pilot.js'):import('./app.js?v=cassette-v1');
 boot.catch(()=>{const root=document.createElement('section');root.style.cssText='position:fixed;inset:0;z-index:1000;background:#10232c;color:#fff;padding:24px;font:18px system-ui';root.innerHTML='<h1>Стенд не запустился</h1><p>Не удалось загрузить приложение. Повторите попытку.</p><button>Повторить загрузку</button><p><a style="color:#aee" href="./">Вернуться в игру</a></p>';root.querySelector('button').onclick=()=>location.reload();document.body.append(root);});
}
