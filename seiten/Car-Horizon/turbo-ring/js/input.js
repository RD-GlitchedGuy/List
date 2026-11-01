"use strict";
/* =====================================================================
   EINGABE (frei belegbar)
   ===================================================================== */
const ACTIONS=[['gas','Gas geben'],['brake','Bremsen / Rückwärts'],['left','Links lenken'],['right','Rechts lenken'],['hb','Handbremse'],['rew','Zurückspulen'],['act','Event starten'],['map','Karte'],['cam','Kamera wechseln'],['look','Zurückschauen'],['horn','Hupe'],['radio','Radio an/aus'],['reset','Auf die Straße setzen'],['pause','Pause']];
const DEF_BINDS={ gas:{k:['KeyW','ArrowUp'],p:['b7']}, brake:{k:['KeyS','ArrowDown'],p:['b6']}, left:{k:['KeyA','ArrowLeft'],p:['a0-']}, right:{k:['KeyD','ArrowRight'],p:['a0+']},
  hb:{k:['Space',''],p:['b0']}, rew:{k:['KeyR',''],p:['b3']}, act:{k:['KeyE','Enter'],p:['b2']}, map:{k:['KeyM',''],p:['b8']}, cam:{k:['KeyC',''],p:['b4']},
  look:{k:['KeyQ',''],p:['b5']}, horn:{k:['KeyH',''],p:['b10']}, radio:{k:['KeyN',''],p:['b12']}, reset:{k:['KeyT',''],p:['b11']}, pause:{k:['KeyP',''],p:['b9']} };
function loadBinds(){ const b=JSON.parse(JSON.stringify(DEF_BINDS)), s=store.get('binds',null);
  if(s && typeof s==='object') for(const a in b) if(s[a]){ if(Array.isArray(s[a].k)) b[a].k=[String(s[a].k[0]||''),String(s[a].k[1]||'')]; if(Array.isArray(s[a].p)) b[a].p=[String(s[a].p[0]||'')]; }
  return b; }
let BINDS=loadBinds(), rebind=null;
const KEYN={Space:'Leertaste',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Shift links',ShiftRight:'Shift rechts',ControlLeft:'Strg links',ControlRight:'Strg rechts',AltLeft:'Alt',AltRight:'Alt Gr',Enter:'Enter',Tab:'Tab',Backspace:'Rücktaste',CapsLock:'Feststelltaste',Semicolon:'Ö',Quote:'Ä',BracketLeft:'Ü',Minus:'ß',Comma:',',Period:'.',Slash:'-',Backquote:'^',IntlBackslash:'<'};
function keyName(c){ if(!c) return '—'; if(KEYN[c]) return KEYN[c]; if(c.startsWith('Key')) return c.slice(3); if(c.startsWith('Digit')) return c.slice(5); if(c.startsWith('Numpad')) return 'Num '+c.slice(6); return c; }
const PADB=['A','B','X','Y','LB','RB','LT','RT','View','Menü','L3','R3','Steuerkreuz ↑','Steuerkreuz ↓','Steuerkreuz ←','Steuerkreuz →','Home'];
function padName(p){ if(!p) return '—'; if(p[0]==='b') return PADB[+p.slice(1)]||('Taste '+p.slice(1)); const ax=+p[1], neg=p[2]==='-'; const st=ax<2?'Linker Stick':ax<4?'Rechter Stick':'Achse '+ax; return st+' '+(ax%2===0?(neg?'←':'→'):(neg?'↑':'↓')); }
function padVal(p, code){ if(!p||!code) return 0; if(code[0]==='b'){ const b=p.buttons[+code.slice(1)]; return b ? Math.max(b.value||0, b.pressed?1:0) : 0; } const v=p.axes[+code[1]]||0, s=code[2]==='-'?-v:v; return s>.15?(s-.15)/.85:0; }
const keyOn = a => BINDS[a].k.some(c=>c && keys[c]);
const padOn = (p,a) => padVal(p, BINDS[a].p[0]);
const padBound = code => Object.values(BINDS).some(b=>b.p[0]===code);
const actionsForKey = code => ACTIONS.map(x=>x[0]).filter(a=>BINDS[a].k.includes(code));

const keys={};
const overlayOpen = () => !$('#pause').hidden || !$('#map').hidden || !$('#results').hidden || !$('#binds').hidden;
const inMenuNav = () => game.mode==='menu' || overlayOpen();
function escapeAction(){ if(!$('#binds').hidden) closeBinds(); else if(!$('#map').hidden) closeMap(); else if(!$('#pause').hidden) closePause(); else if(!$('#results').hidden) $('#btnBack').click(); else if(game.mode==='roam') openPause(); }
addEventListener('keydown', e=>{
  initAudio(); if(bootWait){ e.preventDefault(); startBoot(); return; }
  if(rebind){ e.preventDefault(); handleRebindKey(e); return; }
  if(e.target.tagName==='INPUT'){ if(e.code==='Escape') e.target.blur(); return; }
  setInputMode('kb'); keys[e.code]=true;
  if(game.mode==='intro'){ endIntro(); return; }
  const acts=actionsForKey(e.code);
  if(e.code==='Escape' || (acts.includes('pause') && !e.repeat && (game.mode==='roam' || !$('#pause').hidden) && $('#binds').hidden)){ e.preventDefault(); escapeAction(); return; }
  if(inMenuNav()){ const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.code]; if(d){ e.preventDefault(); moveFocus(d[0],d[1]); }
    if(acts.includes('map') && !$('#map').hidden) closeMap(); return; }
  if(game.mode!=='roam') return;
  if(!e.repeat){ if(acts.includes('map')) openMap(); if(acts.includes('cam')) cycleCam(); if(acts.includes('act')) tryAction(); if(acts.includes('reset')) resetToRoad(game.me,true); if(acts.includes('radio')) radioToggle(); }
  if(acts.length || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e=>{ keys[e.code]=false; });
addEventListener('blur', ()=>{ for(const k in keys) keys[k]=false; });
const touch={ left:0,right:0,gas:0,brake:0,drift:0,rew:0 };
[['tLeft','left'],['tRight','right'],['tGas','gas'],['tBrake','brake'],['tDrift','drift'],['tRew','rew'],['tAct','act'],['tPause','pause'],['tMap','map'],['tCam','cam'],['tRadio','radio']].forEach(([id,k])=>{
  const el=$('#'+id);
  el.addEventListener('pointerdown',e=>{ e.preventDefault(); initAudio(); try{el.setPointerCapture(e.pointerId);}catch(_){} touch[k]=1; el.classList.add('on');
    if(k==='act') tryAction(); if(k==='pause') openPause(); if(k==='map') openMap(); if(k==='cam') cycleCam(); if(k==='radio') radioToggle(); });
  const up=()=>{ touch[k]=0; el.classList.remove('on'); };
  el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up); el.addEventListener('lostpointercapture',up);
});
let lastInput = HAS_TOUCH ? 'touch' : 'kb';
function setInputMode(m){ if(lastInput===m) return; lastInput=m; updateTouchUI(); }
function updateTouchUI(){ const t=lastInput==='touch';
  $('#touch').hidden = !(game.mode==='roam' && t && !overlayOpen());
  document.body.classList.toggle('touch-ui', t); document.body.classList.toggle('nav-pad', lastInput==='pad');
  document.body.classList.toggle('tilt', cfg.steer==='tilt'); document.body.classList.toggle('autogas', !!cfg.autogas); }
addEventListener('pointerdown', e=>{ initAudio(); if(bootWait){ startBoot(); return; } if(e.pointerType==='touch') setInputMode('touch'); else if(e.pointerType==='mouse' && !HAS_TOUCH) setInputMode('kb'); if(game.mode==='intro' && !e.target.closest('#touch')) endIntro(); }, true);

/* Neigungssteuerung: Schwerkraftanteil entlang der Bildschirm-Horizontalen */
const tilt={ raw:0, zero:0, ok:false };
addEventListener('devicemotion', e=>{ const g=e.accelerationIncludingGravity; if(!g||g.x==null) return; tilt.ok=true;
  const ang=(screen.orientation && typeof screen.orientation.angle==='number') ? screen.orientation.angle : (window.orientation||0);
  tilt.raw = ang===90 ? -g.y : (ang===270||ang===-90) ? g.y : ang===180 ? -g.x : g.x; });
function tiltSteer(){ if(!tilt.ok) return 0; let v=(tilt.raw-tilt.zero)/4.2; if(cfg.inv) v=-v; if(Math.abs(v)<.06) v=0; return clamp(v,-1,1); }
async function enableTilt(){ try{ if(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission==='function'){ const r=await DeviceMotionEvent.requestPermission(); if(r!=='granted') throw 0; } return true; }
  catch(e){ toast('Neigungssensor nicht freigegeben – Tasten-Lenkung aktiv.'); return false; } }

const NONE={steer:0,thr:0,brk:0,hb:0,rew:0,look:0,horn:0};
function getPad(){ const pads=navigator.getGamepads?navigator.getGamepads():[]; for(const p of pads) if(p && p.connected) return p; return null; }
function readInput(){
  if(overlayOpen()) return NONE;
  let steer=0, thr=0, brk=0, hb=0, rew=0, look=0, horn=0;
  if(keyOn('left')) steer+=1; if(keyOn('right')) steer-=1; if(keyOn('gas')) thr=1; if(keyOn('brake')) brk=1;
  if(keyOn('hb')) hb=1; if(keyOn('rew')) rew=1; if(keyOn('look')) look=1; if(keyOn('horn')) horn=1;
  if(cfg.steer==='tilt' && lastInput==='touch') steer+=tiltSteer(); else steer+=touch.left-touch.right;
  if(touch.gas || (cfg.autogas && lastInput==='touch' && !touch.brake)) thr=1; if(touch.brake) brk=1; if(touch.drift) hb=1; if(touch.rew) rew=1;
  const p=getPad();
  if(p){ steer+=padOn(p,'left')-padOn(p,'right');
    if(!padBound('b14') && p.buttons[14] && p.buttons[14].pressed) steer+=1; if(!padBound('b15') && p.buttons[15] && p.buttons[15].pressed) steer-=1;
    thr=Math.max(thr,padOn(p,'gas')); brk=Math.max(brk,padOn(p,'brake')); if(padOn(p,'hb')>.5) hb=1; if(padOn(p,'rew')>.5) rew=1; if(padOn(p,'look')>.5) look=1; if(padOn(p,'horn')>.5) horn=1; }
  return { steer:clamp(steer,-1,1), thr:clamp(thr,0,1), brk:clamp(brk,0,1), hb, rew, look, horn };
}

/* ---------- Tastenbelegung ---------- */
function openBinds(){ $('#binds').hidden=false; rebind=null; renderBinds(); updateTouchUI(); setTimeout(()=>{ if(lastInput!=='touch') moveFocus(0,0); },30); }
function closeBinds(){ rebind=null; $('#binds').hidden=true; updateTouchUI(); }
function renderBinds(focus){
  const w=(a,s)=>rebind && rebind.a===a && rebind.s===s;
  $('#bindTable').innerHTML='<tr><th>Aktion</th><th>Taste 1</th><th>Taste 2</th><th>Controller</th></tr>'+ACTIONS.map(([a,label])=>`<tr><td>${label}</td>${[0,1].map(s=>`<td><button class="bind${w(a,s)?' wait':''}" data-a="${a}" data-s="${s}">${w(a,s)?'Taste drücken …':esc(keyName(BINDS[a].k[s]))}</button></td>`).join('')}<td><button class="bind${w(a,'p')?' wait':''}" data-a="${a}" data-s="p">${w(a,'p')?'Controller drücken …':esc(padName(BINDS[a].p[0]))}</button></td></tr>`).join('');
  $('#bindTable').querySelectorAll('button.bind').forEach(b=>b.onclick=()=>{ rebind={a:b.dataset.a, s:b.dataset.s==='p'?'p':+b.dataset.s, armed:false, t:performance.now()}; renderBinds(true); });
  if(focus && lastInput!=='touch' && rebind){ const el=$('#bindTable').querySelector(`button[data-a="${rebind.a}"][data-s="${rebind.s}"]`); if(el) el.focus(); } }
function setBind(code){ const {a,s}=rebind; let moved=null;
  if(s==='p'){ for(const x in BINDS) if(x!==a && BINDS[x].p[0]===code){ BINDS[x].p[0]=''; moved=x; } BINDS[a].p[0]=code; }
  else { for(const x in BINDS) for(let i=0;i<2;i++) if((x!==a||i!==s) && BINDS[x].k[i]===code){ BINDS[x].k[i]=''; moved=x; } BINDS[a].k[s]=code; }
  if(moved) toast('War bei „'+ACTIONS.find(q=>q[0]===moved)[1]+'“ belegt – dort entfernt');
  store.set('binds',BINDS); const keep=rebind; rebind=null; renderBinds(); const el=$('#bindTable').querySelector(`button[data-a="${keep.a}"][data-s="${keep.s}"]`); if(el && lastInput!=='touch') el.focus(); }
function handleRebindKey(e){
  if(e.code==='Escape'){ rebind=null; renderBinds(); return; }
  if(e.code==='Delete'||e.code==='Backspace'){ if(rebind.s==='p') BINDS[rebind.a].p[0]=''; else BINDS[rebind.a].k[rebind.s]=''; store.set('binds',BINDS); rebind=null; renderBinds(); return; }
  if(rebind.s==='p') return;
  setBind(e.code); }
function pollRebindPad(p){ if(!rebind || rebind.s!=='p') return; if(performance.now()-rebind.t>9000){ rebind=null; renderBinds(); return; }
  const anyDown=p.buttons.some(b=>b.pressed) || p.axes.some(v=>Math.abs(v)>.5);
  if(!rebind.armed){ if(!anyDown) rebind.armed=true; return; }
  for(let i=0;i<p.buttons.length;i++) if(p.buttons[i].pressed){ setBind('b'+i); return; }
  for(let i=0;i<p.axes.length;i++) if(Math.abs(p.axes[i])>.7){ setBind('a'+i+(p.axes[i]<0?'-':'+')); return; } }

/* ---------- Menü-Navigation (Controller & Pfeiltasten) ---------- */
function focusables(){ return [...document.querySelectorAll('button,input')].filter(el=>!el.disabled && el.offsetParent!==null && !el.closest('#touch') && !el.closest('#hud') && (!$('#binds').hidden ? el.closest('#binds') : true)); }
function moveFocus(dx,dy){ const list=focusables(); if(!list.length) return; const cur=document.activeElement;
  if(!list.includes(cur) || (!dx&&!dy)){ (list.find(e=>e.classList.contains('primary'))||list[0]).focus(); return; }
  const r=cur.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2; let best=null, bs=1e9;
  for(const el of list){ if(el===cur) continue; const q=el.getBoundingClientRect(); const ex=q.left+q.width/2-cx, ey=q.top+q.height/2-cy;
    const along=ex*dx+ey*dy; if(along<=4) continue; const sc=along+Math.abs(ex*dy-ey*dx)*2.2; if(sc<bs){ bs=sc; best=el; } }
  if(best){ best.focus(); best.scrollIntoView({block:'nearest',inline:'nearest'}); } }
const padNav={ prev:[], rep:0, held:false, act:{} };
function pollPad(dt){
  const p=getPad(); if(!p) return;
  if(bootWait){ if(p.buttons.some(x=>x.pressed)) startBoot(); return; }
  if(rebind){ pollRebindPad(p); padNav.prev=p.buttons.map(x=>x.pressed); return; }
  const b=i=>!!(p.buttons[i] && p.buttons[i].pressed), pr=i=>b(i) && !padNav.prev[i];
  const actEdge=a=>{ const on=padOn(p,a)>.5, was=padNav.act[a]; padNav.act[a]=on; return on && !was; };
  if(p.buttons.some(x=>x.pressed) || p.axes.some(a=>Math.abs(a)>.5)) setInputMode('pad');
  if(game.mode==='intro'){ if(p.buttons.some((x,i)=>x.pressed && !padNav.prev[i])) endIntro(); }
  else if(inMenuNav()){
    let dx=0, dy=0; if(b(14)||p.axes[0]<-.6) dx=-1; if(b(15)||p.axes[0]>.6) dx=1; if(b(12)||p.axes[1]<-.6) dy=-1; if(b(13)||p.axes[1]>.6) dy=1;
    if(dx||dy){ padNav.rep-=dt; if(padNav.rep<=0){ moveFocus(dx,dy); padNav.rep=padNav.held?.14:.35; padNav.held=true; } } else { padNav.rep=0; padNav.held=false; }
    if(pr(0)){ const a=document.activeElement; if(a && a.tagName==='BUTTON' && focusables().includes(a)) a.click(); else moveFocus(0,0); }
    if(pr(1)||pr(9)) escapeAction();
    if(pr(8) && !$('#map').hidden) closeMap();
    if($('#binds').hidden && (game.mode==='menu' || !$('#pause').hidden)){ if(pr(4)) cycleCar(-1); if(pr(5)) cycleCar(1); }
    ACTIONS.forEach(([a])=>actEdge(a));
  } else if(game.mode==='roam'){
    if(actEdge('pause')) openPause(); if(actEdge('map')) openMap(); if(actEdge('cam')) cycleCam(); if(actEdge('act')) tryAction(); if(actEdge('reset')) resetToRoad(game.me,true); if(actEdge('radio')) radioToggle();
  }
  padNav.prev=p.buttons.map(x=>x.pressed);
}
