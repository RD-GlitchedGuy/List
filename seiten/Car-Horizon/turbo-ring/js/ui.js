"use strict";
/* =====================================================================
   MENÜ-UI
   ===================================================================== */
function showScreen(id){ ['menu','hud'].forEach(s=>$('#'+s).hidden=s!==id); if(id==='menu'){ $('#slotGarage').appendChild($('#garage')); $('#slotSettings').appendChild($('#settings')); refreshShowCar(); } }
function optButtons(container, items, cur, onPick){ const c=$(container); [...c.querySelectorAll('button')].forEach(b=>b.remove());
  items.forEach(([v,label])=>{ const b=document.createElement('button'); b.textContent=label; if(v===cur) b.classList.add('sel'); b.onclick=()=>onPick(v); c.appendChild(b); }); }
function renderOpts(){
  const loc=(k,v)=>{ cfg[k]=v; store.set(k,v); renderOpts(); updateTouchUI(); };
  optButtons('#gfxOpts',[['potato','Potato'],['normal','Normal'],['ultra','Ultra'],['custom','Eigene']],cfg.gfx,v=>{ if(v===cfg.gfx) return; const wasPotato=activeGfx==='potato'; loc('gfx',v);
    if(game.mode==='menu'){ applyGfx(); if(HAS_TOUCH && wasPotato) toast('Für volle Kantenglättung die Seite einmal neu laden.'); } else toast('Gilt beim nächsten Betreten des Festivals.'); });
  optButtons('#navOpts',[[1,'An'],[0,'Aus']],cfg.navline,v=>loc('navline',v));
  optButtons('#radioOpts',[[1,'An'],[0,'Aus']],RADIO.on,v=>{ if(v!==RADIO.on) radioToggle(); });
  optButtons('#todOpts',[['cycle','Zyklus'],['day','Tag'],['dusk','Abend'],['night','Nacht']],cfg.tod,v=>loc('tod',v));
  optButtons('#sndOpts',[[1,'An'],[0,'Aus']],cfg.sound,v=>{ loc('sound',v); initAudio(); if(AU.master) AU.master.gain.value=v?.55:0; });
  optButtons('#steerOpts',[['buttons','Tasten'],['tilt','Neigen']],cfg.steer,async v=>{ if(v==='tilt' && !(await enableTilt())) return; loc('steer',v); });
  optButtons('#invOpts',[[0,'Normal'],[1,'Umgekehrt']],cfg.inv,v=>loc('inv',v));
  optButtons('#gasOpts',[[0,'Aus'],[1,'An']],cfg.autogas,v=>loc('autogas',v));
}
function renderGarage(){
  const d=carById(gView), own=owned(d.id), [price,rk]=SHOP[d.id]||[0,1], lvl=levelOf(save.xp); $('#carName').textContent=d.name; $('#carCls').textContent=own?d.cls:d.cls+' · gesperrt';
  $('#shopRow').hidden=own; $('#swatchRow').hidden=!own;
  if(!own){ $('#shopTxt').textContent = lvl<rk ? `Ab Festival-Rang ${rk} · ${fmtN(price)} CR` : `${fmtN(price)} CR · du hast ${fmtN(save.cr)} CR`; $('#btnBuy').disabled = lvl<rk || save.cr<price; }
  const stats=[['Tempo',d.maxSpeed/80],['Beschl.',d.accel/26],['Grip',d.grip/10],['Lenkung',d.turn/3.1],['Gelände',d.offroad]];
  $('#carStats').innerHTML=stats.map(([n,v])=>`<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.round(v*100)}%"></i></div></div>`).join('');
  $('#swatches').innerHTML=''; PAINTS.forEach(p=>{ const b=document.createElement('button'); b.className='sw'+(p===cfg.paint?' sel':''); b.style.background=p; b.setAttribute('aria-label','Farbe '+p); b.onclick=()=>{ cfg.paint=p; store.set('paint',p); onGarageChange(); }; $('#swatches').appendChild(b); });
}
function onGarageChange(){ renderGarage();
  if(game.mode==='menu'){ refreshShowCar(); return; }
  if(game.me && game.me.inRace){ toast('Autowechsel nach dem Rennen.'); return; }
  const me=game.me; if(me) rebuildMesh(me, myEntry());
  if(isAuthority()){ const e=game.roster.find(x=>x.id===net.myId); if(e) Object.assign(e,myEntry()); sendRoster(); } else if(net.host && net.host.open) net.host.send({t:'pick',...myEntry()}); }
function cycleCar(dir){ const i=CARS.findIndex(c=>c.id===gView), n=CARS[(i+dir+CARS.length)%CARS.length]; gView=n.id;
  if(owned(n.id)){ cfg.car=n.id; cfg.paint=n.paint; store.set('car',n.id); store.set('paint',n.paint); onGarageChange(); } else { renderGarage(); if(game.mode==='menu') refreshShowCar(); } }
$('#btnBuy').onclick=()=>{ const [price,rk]=SHOP[gView]||[0,1]; if(owned(gView) || save.cr<price || levelOf(save.xp)<rk) return;
  save.cr-=price; save.owned.push(gView); persist(); cfg.car=gView; cfg.paint=carById(gView).paint; store.set('car',cfg.car); store.set('paint',cfg.paint); jingle(); toast(carById(gView).name+' gekauft!'); updateRank(); onGarageChange(); };
$('#carPrev').onclick=()=>cycleCar(-1); $('#carNext').onclick=()=>cycleCar(1);
$('#name').value=cfg.name; $('#name').oninput=e=>{ cfg.name=e.target.value.trim()||'Fahrer'; store.set('name',cfg.name); };
$('#btnSolo').onclick=()=>{ initAudio(); leaveNet(); enterWorld(); };
$('#btnHost').onclick=()=>{ initAudio(); hostGame(); };
$('#btnJoin').onclick=()=>{ initAudio(); joinGame($('#joinCode').value); };
$('#joinCode').addEventListener('keydown',e=>{ if(e.key==='Enter') joinGame(e.target.value); });
$('#btnBack').onclick=()=>leaveRaceLocal();
$('#btnPause').onclick=()=>openPause();
$('#pResume').onclick=()=>closePause();
$('#pMap').onclick=()=>openMap();
$('#pReset').onclick=()=>{ closePause(); resetToRoad(game.me,true); };
$('#pQuit').onclick=()=>leaveWorld();
$('#mapClose').onclick=()=>closeMap();
$('#btnBinds').onclick=()=>openBinds(); $('#bindClose').onclick=()=>closeBinds();
$('#bindReset').onclick=()=>{ BINDS=JSON.parse(JSON.stringify(DEF_BINDS)); store.set('binds',BINDS); rebind=null; renderBinds(); toast('Standardbelegung wiederhergestellt'); };
{ const de=document.documentElement, rq=de.requestFullscreen||de.webkitRequestFullscreen;
  if(rq){ $('#btnFull').hidden=false; $('#btnFull').onclick=()=>{ const fe=document.fullscreenElement||document.webkitFullscreenElement;
    try{ if(fe) (document.exitFullscreen||document.webkitExitFullscreen).call(document); else { const r=rq.call(de); if(r&&r.catch) r.catch(()=>toast('Vollbild wird hier nicht unterstützt.')); } }catch(e){ toast('Vollbild wird hier nicht unterstützt.'); }
    setTimeout(resize,300); }; } }
if(cfg.steer==='tilt' && window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission==='function'){ addEventListener('pointerdown', function once(){ removeEventListener('pointerdown', once, true); enableTilt(); }, true); }
renderGarage(); renderOpts(); updateRank(); updateTouchUI(); showScreen('menu');
// Beim Öffnen: Titelbild → Kino-Eröffnung (mit Ton) → Hauptmenü
let bootWait=true; $('#menu').hidden=true; $('#boot').hidden=false;
function startBoot(){ if(!bootWait) return; bootWait=false; $('#boot').hidden=true; initAudio(); radioPrime(); playMusic(); if(AU.master) AU.master.gain.value=cfg.sound?.35:0; enterWorld(true); }
if(/^#[A-Z]{4}$/i.test(location.hash)) $('#joinCode').value=location.hash.slice(1).toUpperCase();

// Lautstärkeregler (Gesamt & Radio), wird gespeichert
[['#volAll','vol'],['#volCar','cvol'],['#volFx','fvol'],['#volRadio','rvol'],['#volMusic','mvol']].forEach(([id,k])=>{ const el=$(id), out=$(id+'V'); el.value=cfg[k]; out.textContent=cfg[k]+'%';
  el.addEventListener('input',()=>{ cfg[k]=+el.value; out.textContent=el.value+'%'; store.set(k,cfg[k]); applyVolume(); }); });

// ---------- Eigene Grafik: jede Option einzeln ----------
const GFX_ROWS=[
  ['res','Auflösung',[[.75,'75 %'],[1,'100 %'],[1.3,'130 %'],[1.6,'160 %'],[2,'200 %']]],
  ['shadows','Schatten',[[0,'Aus'],[2048,'Mittel'],[4096,'Hoch'],[8192,'Ultra']]],
  ['view','Sichtweite',[['nah','Nah'],['mittel','Mittel'],['weit','Weit']]],
  ['seg','Gelände-Details',[[300,'Niedrig'],[400,'Hoch'],[480,'Ultra'],[600,'Extrem']]],
  ['trees','Bäume',[[3000,'Wenig'],[8000,'Normal'],[13000,'Viel'],[20000,'Wald']]],
  ['grass','Gras',[[0,'Aus'],[8000,'Wenig'],[16000,'Normal'],[36000,'Dicht'],[60000,'Extrem']]],
  ['buildings','Hochhäuser',[[260,'Wenig'],[380,'Normal'],[520,'Viel'],[700,'Metropole']]],
  ['clouds','Wolken',[[0,'Aus'],[36,'Wenig'],[56,'Normal'],[90,'Viel']]],
  ['fx','Rauch & Staub',[[120,'Wenig'],[360,'Normal'],[520,'Viel']]],
  ['leaves','Kirschblüten',[[0,'Aus'],[600,'Wenig'],[1100,'Normal'],[2000,'Viel']]],
  ['bloom','Leuchten (Bloom)',[[1,'An'],[0,'Aus']]],
  ['post','Ultra-Effekte (Lichtstrahlen, Tempo-Unschärfe, Kinolook)',[[1,'An'],[0,'Aus']]],
  ['solas','Solas-Shader (Schattierung, Licht in der Luft, Linsenreflexe)',[[1,'An'],[0,'Aus']]],
  ['dyn','Automatische Auflösung bei Rucklern',[[1,'An'],[0,'Aus']]] ];
function renderGfxPanel(){ const c=customCfg(), box=$('#gfxRows'); box.innerHTML='';
  GFX_ROWS.forEach(([k,label,items])=>{ const row=document.createElement('div'); row.className='row opts'; row.innerHTML=`<span class="label" style="width:150px;white-space:normal">${label}</span>`; box.appendChild(row);
    items.forEach(([v,t])=>{ const b=document.createElement('button'); b.textContent=t; if(v===c[k]) b.classList.add('sel'); b.onclick=()=>{ const cur=customCfg(); cur[k]=v; store.set('gfxc',cur); renderGfxPanel(); }; row.appendChild(b); }); });
  const row=document.createElement('div'); row.className='row opts'; row.innerHTML='<span class="label" style="width:150px">Vorlage</span>'; box.appendChild(row);
  [['Wie Normal',{res:1,shadows:2048,view:'mittel',seg:340,trees:6000,grass:9000,buildings:340,clouds:36,fx:260,leaves:0,bloom:0,post:0,solas:0,dyn:1}],['Wie Ultra',{res:1.3,shadows:8192,view:'weit',seg:480,trees:13000,grass:36000,buildings:520,clouds:90,fx:520,leaves:1100,bloom:1,post:1,solas:1,dyn:1}]].forEach(([t,o])=>{ const b=document.createElement('button'); b.textContent=t; b.onclick=()=>{ store.set('gfxc',o); renderGfxPanel(); }; row.appendChild(b); }); }
function closeGfxPanel(){ $('#gfxPanel').hidden=true; if(cfg.gfx!=='custom'){ cfg.gfx='custom'; store.set('gfx','custom'); }
  if(game.mode==='menu') applyGfx(); else toast('Gilt beim nächsten Betreten des Festivals.'); renderOpts(); }
$('#btnGfxCustom').onclick=()=>{ renderGfxPanel(); $('#gfxPanel').hidden=false; }; $('#gfxClose').onclick=closeGfxPanel;
