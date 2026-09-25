// Headless verification harness for spectral-forge engine.
// Extracts the <script id="engine"> block and runs invariants under Node vm.
const fs=require('fs'), vm=require('vm'), path=require('path');

const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if(!m){ console.error('ENGINE BLOCK NOT FOUND'); process.exit(2); }

const ctx={
  console, Math, Object, Array, JSON, isFinite, Infinity, NaN, Date,
  Float64Array, Int32Array, Uint8Array, Uint8ClampedArray, Set, Map,
  globalThis:{}
};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(m[1], ctx, {filename:'engine.js'});
const S=ctx.SPEC;

let pass=0, fail=0; const fails=[];
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; fails.push(name+(extra!==undefined?('  ['+extra+']'):''));} }
function matVec(A,v){var n=A.length,out=new Array(n).fill(0);for(var i=0;i<n;i++){var s=0,Ai=A[i];for(var j=0;j<v.length;j++)s+=Ai[j]*v[j];out[i]=s;}return out;}

function maxOffDiag(M){ var n=M.length, mx=0; for(var i=0;i<n;i++)for(var j=0;j<n;j++) if(i!==j) mx=Math.max(mx,Math.abs(M[i][j])); return mx; }

// ---- 1. determinism (the canonical closure invariant) ----
(function(){
  const data=S.blobs(120,3,0.4,7);
  const a=S.cluster(data.points,{k:3,sigma:1.0,seed:7}).labels;
  const b=S.cluster(data.points,{k:3,sigma:1.0,seed:7}).labels;
  let same=true; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) same=false;
  ok('determinism: identical labels on re-run', same);
})();

// ---- 2. Lanczos basis orthogonality V^T V = I ----
(function(){
  const pts=S.blobs(60,2,0.3,9); const A=S.rbfAffinity(pts.points,1.0);
  const L=S.normalizedLaplacian(A);
  const M=L.map((row,i)=>row.map((v,j)=>(i===j?2:0)-v));
  const r=S.lanczos(M,20); const V=r.V, mS=20, n=V[0].length;
  let G=[]; for(let i=0;i<mS;i++)G.push(new Array(mS).fill(0));
  for(let i=0;i<mS;i++)for(let j=0;j<mS;j++){let s=0;for(let p=0;p<n;p++)s+=V[i][p]*V[j][p];G[i][j]=s;}
  // off-diagonal ~0, diagonal ~1
  let off=maxOffDiag(G), diaErr=0;
  for(let i=0;i<mS;i++) diaErr=Math.max(diaErr,Math.abs(G[i][i]-1));
  ok('lanczos: V^T V off-diag ~0', off<1e-8, off.toExponential(2));
  ok('lanczos: V^T V diag ~1', diaErr<1e-8, diaErr.toExponential(2));
})();

// ---- 3. Lanczos residual == last beta (exact by construction) ----
(function(){
  const pts=S.blobs(60,2,0.3,9); const A=S.rbfAffinity(pts.points,1.0);
  const L=S.normalizedLaplacian(A);
  const M=L.map((row,i)=>row.map((v,j)=>(i===j?2:0)-v));
  const r=S.lanczos(M,20);
  const res=S.lanczosResidual(M,r);
  const betaLast=r.beta[19];
  ok('lanczos: ||MV-VT|| == beta_last', Math.abs(res-betaLast)<1e-6, (res-betaLast).toExponential(2));
})();

// ---- 4. Lanczos (full m=n) eigenvalues == Jacobi full eig ----
(function(){
  const pts=S.blobs(24,2,0.3,11).points;
  const A=S.rbfAffinity(pts,1.0); const L=S.normalizedLaplacian(A);
  const jac=S.jacobiEig(L); const eigFull=jac.values.slice().sort((a,b)=>a-b);
  const M=L.map((row,i)=>row.map((v,j)=>(i===j?2:0)-v));
  const le=S.lanczosEig(M,24);
  const eigLanc=le.values.map(v=>2-v).sort((a,b)=>a-b);
  let mx=0; for(let i=0;i<24;i++) mx=Math.max(mx,Math.abs(eigFull[i]-eigLanc[i]));
  ok('eig: lanczos(full) == jacobi spectrum', mx<1e-6, mx.toExponential(2));
})();

// ---- 5. Laplacian null vector: L * sqrt(d) == 0 ----
(function(){
  const pts=S.blobs(30,2,0.3,5).points;
  const A=S.rbfAffinity(pts,1.0); const L=S.normalizedLaplacian(A); const d=S.degrees(A);
  const sq=d.map(Math.sqrt); const Ls=matVec(L,sq);
  let mx=0; for(let i=0;i<Ls.length;i++) mx=Math.max(mx,Math.abs(Ls[i]));
  ok('laplacian: L * sqrt(d) == 0', mx<1e-9, mx.toExponential(2));
})();

// ---- 6. smallest eigenvalue ~ 0 for connected graph ----
(function(){
  const pts=S.blobs(80,3,0.4,3).points;
  const res=S.cluster(pts,{k:3,sigma:1.0,seed:3});
  ok('spectrum: lambda1 ~ 0 (connected)', res.eigL[0]<1e-4, res.eigL[0].toExponential(2));
  let hasNaN=res.eigL.some(x=>!isFinite(x));
  ok('spectrum: all eigenvalues finite', !hasNaN);
})();

// ---- 7. clustering accuracy: well-separated blobs (fixed centers on a ring) ----
function sepBlobs(n,k,noise,seed){
  const rng=S.mulberry32(seed), pts=[], labels=[], centers=[];
  for(let c=0;c<k;c++){const a=2*Math.PI*c/k; centers.push([6*Math.cos(a),6*Math.sin(a)]);}
  for(let i=0;i<n;i++){const c=Math.floor(rng()*k); pts.push([centers[c][0]+(rng()*2-1)*noise, centers[c][1]+(rng()*2-1)*noise]); labels.push(c);}
  return {points:pts, labels:labels};
}
(function(){
  for(let seed=1;seed<=12;seed++){
    const data=sepBlobs(150,3,0.4,seed);
    const res=S.cluster(data.points,{k:3,sigma:1.0,seed:seed});
    const acc=S.bestAccuracy(data.labels,res.labels,3);
    ok('blobs acc seed '+seed+' >0.9', acc>0.9, (acc*100).toFixed(1)+'%');
  }
})();

// ---- 8. clustering accuracy: rings (concentric) across seeds ----
(function(){
  for(let seed=1;seed<=8;seed++){
    const data=S.rings(160,seed);
    const res=S.cluster(data.points,{k:2,sigma:0.35,seed:seed});
    const acc=S.bestAccuracy(data.labels,res.labels,2);
    ok('rings acc seed '+seed+' >0.9', acc>0.9, (acc*100).toFixed(1)+'%');
  }
})();

// ---- 9. bestAccuracy correctness ----
(function(){
  const t=[0,0,1,1];
  ok('bestAccuracy: perfect match', Math.abs(S.bestAccuracy(t,[1,1,0,0],2)-1)<1e-12);
  ok('bestAccuracy: flipped =1', Math.abs(S.bestAccuracy(t,[0,0,1,1],2)-1)<1e-12);
  ok('bestAccuracy: wrong =0.5', Math.abs(S.bestAccuracy(t,[0,1,0,1],2)-0.5)<1e-12);
})();

// ---- 10. edge: tiny n, label length, no throw ----
(function(){
  const data=S.blobs(40,2,0.3,1);
  const res=S.cluster(data.points,{k:2,sigma:0.8,seed:1});
  ok('edge: labels length == n', res.labels.length===40);
  ok('edge: labels in [0,k)', res.labels.every(l=>l>=0&&l<2));
})();

const summary=`PASS ${pass} / ${pass+fail}\n`+(fail?('FAIL ('+fail+')\n'+fails.join('\n')):'ALL GREEN')+'\n';
fs.writeFileSync(path.join(__dirname,'_smoke.log'),summary);
console.log(summary);
process.exit(fail?1:0);
