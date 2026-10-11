// Contextual lesson consumes actual physical outcomes; it cannot unlock pieces.
export class ObstructionLesson{
 constructor({attempt,blocker}){this.attempt=attempt;this.blocker=blocker;this.step='rotate';}
 rotated(distance){if(this.step==='rotate'&&distance>26)this.step='attempt';return this.step;}
 target(){return this.step==='blocker'?this.blocker:this.attempt;}
 blocked(id,blockers){if(this.step==='attempt'&&id===this.attempt&&blockers.some(b=>b.id===this.blocker))this.step='blocker';return this.step;}
 removed(id){if(this.step==='blocker'&&id===this.blocker)this.step='retry';else if(this.step==='retry'&&id===this.attempt)this.step='done';return this.step;}
 permits(id){return this.step!=='rotate'&&id===this.target();}
}
