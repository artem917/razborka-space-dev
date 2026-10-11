export const STAGE_PRESETS=Object.freeze({mobile:Object.freeze({shell:1.12,inner:2.2,core:4.8}),desktop:Object.freeze({shell:1,inner:1.65,core:3.2})});
export function puzzleStage(pieces){return pieces.some(p=>p.stage==='shell')?'shell':pieces.some(p=>!p.core)?'inner':'core';}
// One preset per entry. Removing another part within the stage is a no-op.
export class StageScale {
 constructor(){this.reset();}
 reset(){this.stage=null;this.entries=[];}
 enter(stage,mobile){if(stage===this.stage)return false;this.stage=stage;this.preset=STAGE_PRESETS[mobile?'mobile':'desktop'][stage];this.entries.push({stage,preset:this.preset});return true;}
 viewport(mobile){this.preset=STAGE_PRESETS[mobile?'mobile':'desktop'][this.stage||'shell'];return this.preset;}
}
