import {StageScale} from './stage-scale.js';
// Two concrete families only. The original scene and kettle loader retain their
// default path; session sources are retained without retaining old draw meshes.
const sessions=new WeakMap();
class CassetteScale{
 constructor(){this.reset();}reset(){this.stage=null;this.entries=[];this.preset=1.1;}
 enter(stage){if(this.stage===stage)return false;this.stage=stage;this.preset=1.1;this.entries.push({stage,preset:this.preset});return this.entries.length===1;}
 viewport(){return this.preset;}
}
function disposeSource(source){source.scene.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of [o.material].flat()){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});}
export function selectFamily(view,level){
 let s=sessions.get(view);if(!s){s={sources:new Map(),zooms:new Map(),fit:view.fitInitialAssembly,angle:view.resetAngle,destroy:view.destroy};sessions.set(view,s);view.destroy=function(){for(const source of s.sources.values())if(source!==this.cachedFamily)disposeSource(source);s.sources.clear();sessions.delete(this);return s.destroy.call(this);};}
 if(view.cachedFamily){s.sources.set(view.cachedFamily.digest,view.cachedFamily);s.zooms.set(view.cachedFamily.digest,view.manualZoom);}view.cachedFamily=s.sources.get(level.assetSHA256);view.manualZoom=s.zooms.get(level.assetSHA256)||1;
 const cassette=level.family==='cassette001';view.stageScale=cassette?new CassetteScale():new StageScale();
 view.resetAngle=cassette?function(){this.root.rotation.set(-.08,.25,0);}:s.angle;
 view.renderer.domElement.setAttribute('aria-label',cassette?'Энергокассета C-01 — настоящая 3D-разборка':'Реактивный чайник — настоящая 3D-разборка');
 view.fitInitialAssembly=cassette?function(){const stage=this.stageScale.stage;this.stageScale.stage='shell';try{return s.fit.call(this);}finally{this.stageScale.stage=stage;}}:s.fit;
 return()=>{if(view.cachedFamily)s.sources.set(view.cachedFamily.digest,view.cachedFamily);};
}
