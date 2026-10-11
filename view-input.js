import {Gesture} from './puzzle.js';
export const MIN_ZOOM=.75,MAX_ZOOM=3;
export const clampZoom=value=>Number.isFinite(value)?Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value)):1;
// Pinch consumes the entire contact sequence. A remaining finger cannot turn
// into a tap/rotation until ALL contacts have been released.
export class ViewGesture{
 constructor(){this.single=new Gesture(9);this.reset();}
 reset(){this.single.reset();this.contacts=new Map();this.mode='idle';}
 distance(){const a=[...this.contacts.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;}
 down(id,x,y,t,zoom){this.contacts.set(id,{x,y});if(this.contacts.size===1&&this.mode==='idle'){this.mode='single';this.single.down(id,x,y,t);return{type:'single-start'};}
  this.single.reset();if(this.contacts.size===2&&this.mode==='single'){this.mode='pinch';this.baseDistance=Math.max(8,this.distance());this.baseZoom=zoom;return{type:'pinch-start'};}this.mode='consume';return{type:'consume'};
 }
 move(id,x,y){if(!this.contacts.has(id))return null;this.contacts.set(id,{x,y});if(this.mode==='pinch')return{type:'pinch',zoom:clampZoom(this.baseZoom*this.distance()/this.baseDistance)};if(this.mode==='single'){const delta=this.single.move(id,x,y);return delta?{type:'rotate',delta}:null;}return null;}
 up(id,x,y,t){if(!this.contacts.has(id))return{tap:false};const tap=this.mode==='single'&&this.single.up(id,x,y,t),wasPinch=this.mode==='pinch';this.contacts.delete(id);if(wasPinch)this.mode='consume';if(!this.contacts.size){this.mode='idle';this.single.reset();}return{tap:!!tap,pinchEnd:wasPinch};}
 cancel(id){this.single.reset();this.contacts.delete(id);this.mode=this.contacts.size?'consume':'idle';}
}
