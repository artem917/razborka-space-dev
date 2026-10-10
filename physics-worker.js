import { meshGraph } from './mesh-collision.js';
self.onmessage=({data})=>{try{const start=performance.now(),result=meshGraph(data.parts,(done,total)=>postMessage({progress:done/total}));postMessage({...result,milliseconds:performance.now()-start});}catch(e){postMessage({error:e.message});}};
