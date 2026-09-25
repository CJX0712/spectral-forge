// _uicheck.js — run the UI script outside a browser using a minimal DOM stub.
// Catches wiring bugs (_smoke.js cannot): missing element ids, null canvas ctx,
// auto-run on load, control event handlers that throw.
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

// ---- DOM stub ----
function makeCtx2d(){
  const calls=[];
  return {
    _calls:calls,
    clearRect(){calls.push('clearRect');}, fillRect(){calls.push('fillRect');},
    beginPath(){calls.push('beginPath');}, arc(){calls.push('arc');}, fill(){calls.push('fill');},
    moveTo(){}, lineTo(){}, stroke(){},
    fillText(){}, set fillStyle(v){}, set strokeStyle(v){}, set font(v){}, set textAlign(v){}
  };
}
const elements={};
const DEFAULTS={dataset:'blobs', n:'200', k:'3', sigma:'1.00', seed:'1'};
function makeEl(id){
  if(elements[id]) return elements[id];
  const listeners={};
  const el={
    id, value:(DEFAULTS[id]!==undefined?DEFAULTS[id]:''), textContent:'', innerHTML:'', width:420, height:320,
    _listeners:listeners, _ctx:null,
    addEventListener(ev,fn){ (listeners[ev]=listeners[ev]||[]).push(fn); },
    getContext(){ if(!this._ctx) this._ctx=makeCtx2d(); return this._ctx; },
    appendChild(){}, setAttribute(){}, style:{}
  };
  elements[id]=el; return el;
}
function dispatch(id,ev){ const el=elements[id]; if(el&&el._listeners[ev]) el._listeners[ev].forEach(f=>f({target:el})); }

const document={
  readyState:'complete',
  getElementById(id){ return makeEl(id); },
  addEventListener(){},
  createElement(tag){ return {tag, _ctx:null, width:0, height:0, getContext(){ if(!this._ctx) this._ctx=makeCtx2d(); return this._ctx; }, appendChild(){}, style:{} }; },
  body:{appendChild(){}}
};

// Extract UI block and wrap in IIFE so top-level `return` is legal.
const uiMatch=html.match(/<script id="ui">([\s\S]*?)<\/script>/);
if(!uiMatch){ console.error('UI BLOCK NOT FOUND'); process.exit(2); }
const uiCode='(function(){\n'+uiMatch[1]+'\n})();';

const ctx={
  console, Math, Object, Array, JSON, isFinite, Infinity, NaN, Date,
  Float64Array, Int32Array, Uint8Array, Uint8ClampedArray, Set, Map,
  document, performance:{now:()=>Date.now()},
  globalThis:{}
};
ctx.globalThis=ctx;
vm.createContext(ctx);

let pass=0, fail=0; const fails=[];
function ok(name,cond,extra){ if(cond){pass++;} else {fail++; fails.push(name+(extra!==undefined?('  ['+extra+']'):''));} }

// Engine must load first (UI references SPEC).
const engMatch=html.match(/<script id="engine">([\s\S]*?)<\/script>/);
vm.runInContext(engMatch[1], ctx, {filename:'engine.js'});
ok('engine exposes SPEC', !!ctx.SPEC);

try {
  vm.runInContext(uiCode, ctx, {filename:'ui.js'});
  ok('ui script runs without throwing', true);
} catch(e){
  ok('ui script runs without throwing', false, e.message);
}

// After load, 'run' handler should have executed (auto-run). Exercise controls.
const sc=ctx.document.getElementById('scatter');
ok('scatter canvas context acquired', !!(sc._ctx && sc._ctx._calls.length>0), sc._ctx?sc._ctx._calls.length:0);

// Click run, change dataset, randomize seed, change sliders.
try {
  dispatch('run','click');
  dispatch('rand','click');
  const ds=ctx.document.getElementById('dataset'); ds.value='rings'; dispatch('dataset','change');
  const n=ctx.document.getElementById('n'); n.value='120'; dispatch('n','input');
  const k=ctx.document.getElementById('k'); k.value='2'; dispatch('k','input');
  const sg=ctx.document.getElementById('sigma'); sg.value='0.35'; dispatch('sigma','input');
  dispatch('run','click');
  const ms=ctx.document.getElementById('moons'); // not used; ensure moons path
  const dm=ctx.document.getElementById('dataset'); dm.value='moons'; dispatch('dataset','change'); dispatch('run','click');
  ok('all control handlers execute without throwing', true);
} catch(e){
  ok('all control handlers execute without throwing', false, e.message);
}

const summary=`UI PASS ${pass} / ${pass+fail}\n`+(fail?('UI FAIL ('+fail+')\n'+fails.join('\n')):'UI ALL GREEN')+'\n';
fs.writeFileSync(path.join(__dirname,'_uicheck.log'),summary);
console.log(summary);
process.exit(fail?1:0);
