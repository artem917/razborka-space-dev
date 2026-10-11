// Dialogue events carry stable line IDs and optional future voice cues.
// A voice adapter may subscribe later; this runtime contains no voice playback.
export class BrakychDialogue {
 constructor({render=()=>{},emit=()=>{},now=()=>performance.now(),reducedMotion=false}={}){Object.assign(this,{render,emit,now,reducedMotion});this.line=null;this.count=0;}
 say(id,text,{next=null,action=null,voiceCue=null}={}){
  if(this.line?.id===id)return;
  this.line={id,text,next,action,voiceCue};this.started=this.now();this.count=this.reducedMotion?Array.from(text).length:0;
  this.emit('dialogue-start',{id,text,voiceCue});this.draw();
 }
 tick(){if(!this.line||!this.typing)return;const count=Math.min(Array.from(this.line.text).length,Math.floor((this.now()-this.started)/22));if(count!==this.count){this.count=count;this.draw();if(!this.typing)this.emit('dialogue-revealed',{id:this.line.id});}}
 get typing(){return !!this.line&&this.count<Array.from(this.line.text).length;}
 draw(){this.render({...this.line,shown:Array.from(this.line?.text||'').slice(0,this.count).join(''),typing:this.typing});}
 tap(){if(!this.line)return false;if(this.typing){this.count=Array.from(this.line.text).length;this.draw();this.emit('dialogue-revealed',{id:this.line.id,instant:true});return true;}if(this.line.next){const next=this.line.next;this.line.next=null;next();return true;}this.emit('dialogue-action-request',{id:this.line.id,action:this.line.action});return false;}
 snapshot(){return this.line?{id:this.line.id,text:this.line.text,shown:Array.from(this.line.text).slice(0,this.count).join(''),typing:this.typing,action:this.line.action,voiceCue:this.line.voiceCue}:null;}
}
