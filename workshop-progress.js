const JOBS=['intro','work','turn'],object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{},unique=values=>[...new Set(values.filter(v=>typeof v==='string'))];
// Entitlement is a monotone boolean, never an endlessly farmable counter.
export function migrateWorkshop(saved={}){
 const root={...object(saved)},old=object(root.workshop),modern=old.version===1,templates=Array.isArray(root.completedTemplates)?root.completedTemplates:[],completed=unique([...(Array.isArray(old.completedJobs)?old.completedJobs:[]),...templates.filter(id=>JOBS.includes(id)),...(!modern&&root.firstJobComplete?['intro']:[])]);
 root.workshop={...old,version:1,completedJobs:completed,thermocoreEarned:!!old.thermocoreEarned||!!old.reactorInstalled||completed.includes('intro')||(!modern&&!!root.firstJobComplete),reactorInstalled:!!old.reactorInstalled};
 return root;
}
export function mergeWorkshopSaves(fresh,local){
 const a=migrateWorkshop(fresh),b=migrateWorkshop(local),merged={...b,...a};
 for(const key of ['firstJobComplete','tutorialSeen','obstructionLessonSeen'])merged[key]=!!a[key]||!!b[key];
 merged.obstructionLessonVersion=Math.max(Number(a.obstructionLessonVersion)||0,Number(b.obstructionLessonVersion)||0);
 merged.completedTemplates=unique([...(Array.isArray(a.completedTemplates)?a.completedTemplates:[]),...(Array.isArray(b.completedTemplates)?b.completedTemplates:[])]);
 merged.workshop={...b.workshop,...a.workshop,version:1,completedJobs:unique([...a.workshop.completedJobs,...b.workshop.completedJobs]),thermocoreEarned:a.workshop.thermocoreEarned||b.workshop.thermocoreEarned,reactorInstalled:a.workshop.reactorInstalled||b.workshop.reactorInstalled};
 return migrateWorkshop(merged);
}
export function completeWorkshopJob(saved,id){
 if(!JOBS.includes(id))throw Error('Неизвестный заказ');
 const root=migrateWorkshop(saved),awarded=id==='intro'&&!root.workshop.thermocoreEarned;
 root.workshop.completedJobs=unique([...root.workshop.completedJobs,id]);if(id==='intro')root.workshop.thermocoreEarned=true;
 return{progress:root,awarded};
}
export function installThermocore(saved){
 const root=migrateWorkshop(saved);if(!root.workshop.thermocoreEarned)return{progress:root,installed:false,reason:'not-earned'};
 if(root.workshop.reactorInstalled)return{progress:root,installed:false,reason:'already-installed'};
 root.workshop.reactorInstalled=true;return{progress:root,installed:true,reason:'installed'};
}
export function workshopState(saved){const m=migrateWorkshop(saved).workshop;return{...m,coreReady:m.thermocoreEarned&&!m.reactorInstalled,inventoryCount:m.thermocoreEarned&&!m.reactorInstalled?1:0,reactorCount:m.reactorInstalled?1:0,recommendedJob:JOBS.find(id=>!m.completedJobs.includes(id))||'intro'};}
