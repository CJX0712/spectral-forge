// Probe: dump engine internal state to _probe.txt, then we Read it to confirm
// "all green" is not masking garbage output (per pipeline lesson).
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
const ctx={console,Math,Object,Array,JSON,isFinite,Infinity,NaN,Date,Float64Array,Int32Array,Uint8Array,Uint8ClampedArray,Set,Map,globalThis:{}};
ctx.globalThis=ctx; vm.createContext(ctx); vm.runInContext(m[1],ctx,{filename:'e.js'});
const S=ctx.SPEC;

function hist(a){var h={};a.forEach(x=>h[x]=(h[x]||0)+1);return h;}
let out='';
function line(s){out+=s+'\n';}

const b=S.blobs(120,3,0.3,1);
const rb=S.cluster(b.points,{k:3,sigma:1.0,seed:1});
line('=== BLOBS n=120 k=3 sigma=1.0 ===');
line('eigL (smallest 6): '+rb.eigL.slice(0,6).map(x=>x.toFixed(5)).join(', '));
line('lambda1 ~ 0 ? '+(rb.eigL[0]<1e-4));
const ab=S.bestAccuracy(b.labels,rb.labels,3);
line('accuracy vs ground truth: '+(ab*100).toFixed(1)+'%');
line('predicted label histogram: '+JSON.stringify(hist(rb.labels)));
line('embed[0..3]: '+rb.embed.slice(0,4).map(e=>'['+e.map(x=>x.toFixed(3)).join(',')+']').join(' '));
// per-cluster mean embedding to confirm separation
const cmean=[[0,0,0],[0,0,0],[0,0,0]]; const cnt=[0,0,0];
rb.embed.forEach((e,i)=>{const c=rb.labels[i];cnt[c]++;for(let d=0;d<3;d++)cmean[c][d]+=e[d];});
for(let c=0;c<3;c++) cmean[c]=cmean[c].map(x=>(x/cnt[c]).toFixed(3));
line('cluster mean-embedding: '+JSON.stringify(cmean));
line('');

const r=S.rings(160,1);
const rr=S.cluster(r.points,{k:2,sigma:0.35,seed:1});
line('=== RINGS n=160 k=2 sigma=0.35 ===');
line('eigL (smallest 6): '+rr.eigL.slice(0,6).map(x=>x.toFixed(5)).join(', '));
const ar=S.bestAccuracy(r.labels,rr.labels,2);
line('accuracy vs ground truth: '+(ar*100).toFixed(1)+'%');
line('predicted label histogram: '+JSON.stringify(hist(rr.labels)));

fs.writeFileSync(path.join(__dirname,'_probe.txt'),out);
console.log(out);
