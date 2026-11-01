"use strict";
/* =====================================================================
   HUD
   ===================================================================== */
const tach=$('#tach'), tctx=tach.getContext('2d'), mm=$('#minimap'), mmc=mm.getContext('2d');
function drawTach(kmh, rpm, red, gear){ const c=tctx, S=tach.width, cx=S/2, cy=S/2, R=S*.4; c.clearRect(0,0,S,S);
  const a0=Math.PI*.75, a1=Math.PI*2.25, maxR=Math.ceil(red/1000)*1000, f=clamp(rpm/maxR,0,1), rf=red/maxR, A=t=>a0+(a1-a0)*t;
  c.lineCap='butt'; c.lineWidth=S*.055; c.strokeStyle='rgba(14,17,24,.62)'; c.beginPath(); c.arc(cx,cy,R,a0,a1); c.stroke();
  c.strokeStyle='rgba(255,77,94,.6)'; c.beginPath(); c.arc(cx,cy,R,A(rf*.9),A(1)); c.stroke();
  const hot=f>rf*.92; c.strokeStyle=hot?'#ff4d5e':'#ff2e88'; c.beginPath(); c.arc(cx,cy,R,a0,A(f)); c.stroke();
  const step=maxR>10000?2000:1000; c.fillStyle='rgba(255,255,255,.75)'; c.font=`700 ${S*.06}px Barlow,sans-serif`; c.textAlign='center'; c.textBaseline='middle';
  for(let v=0; v<=maxR; v+=step){ const a=A(v/maxR); c.fillRect(cx+Math.cos(a)*(R-S*.075)-2, cy+Math.sin(a)*(R-S*.075)-2, 4, 4); c.fillText(v/1000, cx+Math.cos(a)*(R-S*.14), cy+Math.sin(a)*(R-S*.14)); }
  c.textBaseline='alphabetic'; c.fillStyle='#fff'; c.font=`italic 700 ${S*.22}px "Chakra Petch",sans-serif`; c.fillText(kmh,cx,cy+S*.1);
  c.fillStyle='#b8c0cc'; c.font=`700 ${S*.065}px Barlow,sans-serif`; c.fillText('KM/H',cx,cy+S*.2);
  c.fillStyle=hot?'#ff4d5e':'#ff2e88'; c.font=`italic 700 ${S*.12}px "Chakra Petch",sans-serif`; c.fillText(gear,cx,cy-S*.12); }
function drawMinimap(){ const S=mm.width, me=game.me, c=mmc; c.clearRect(0,0,S,S);
  c.save(); c.beginPath(); c.arc(S/2,S/2,S/2,0,7); c.clip(); c.fillStyle='#16202a'; c.fillRect(0,0,S,S);
  const [px,py]=m2p(me.x,me.z); const phi=Math.atan2(Math.cos(me.h),Math.sin(me.h)); const k=S/(400/MAPW*MAPS);
  c.translate(S/2,S/2); c.rotate(-Math.PI/2-phi); c.scale(k,k); c.translate(-px,-py); c.drawImage(mapImg,0,0);
  const dot=(x,z,col,rad,ring)=>{ const [a,b]=m2p(x,z); c.beginPath(); c.arc(a,b,rad/k,0,7); c.fillStyle=col; c.fill(); if(ring){ c.lineWidth=2/k; c.strokeStyle='#fff'; c.stroke(); } };
  W.events.forEach(e=>dot(e.pos.x,e.pos.z,e.col||'#ff2e88',9,true));
  W.stunts.forEach(s=>dot(s.p.x,s.p.z, s.type==='trap'?'#29d9ff':s.type==='drift'?'#ff7a2e':'#ffcf2e',6));
  if(game.race && me.inRace){ const nx=nextCp(); const p=game.race.road.pts[nx]; dot(p.x,p.z,'#29d9ff',8,true); }
  navDrawMap(c, 5/k, 500);
  game.racers.forEach(r=>{ if(r!==me && r.mesh.visible) dot(r.x,r.z, r.bot?'#c8ced8':r.paint, r.bot?4:7, !r.bot); });
  c.restore();
  c.fillStyle='#ff2e88'; c.beginPath(); c.moveTo(S/2,S/2-14); c.lineTo(S/2+10,S/2+10); c.lineTo(S/2,S/2+5); c.lineTo(S/2-10,S/2+10); c.closePath(); c.fill(); c.lineWidth=2; c.strokeStyle='#fff'; c.stroke(); }
function nextCp(){ const race=game.race, N=race.road.N, step=Math.max(20,Math.floor(N/14)); return ((Math.floor(game.me.ridx/step)+1)*step)%N; }
function regionAt(x,z){ if(Math.hypot(x,z)<230) return 'Festivalgelände'; if(Math.abs(x-CITY.x)<CITY.hw+30 && Math.abs(z-CITY.z)<CITY.hd+30) return 'Neon-City';
  if(Math.hypot(x-FUJI.x,z-FUJI.z)<FUJI.r) return 'Fuji'; const L=MAPDATA.lake; if(Math.hypot(x-L[0],z-L[1])<520) return 'Seeufer'; const F=MAPDATA.forest; if(Math.hypot(x-F[0],z-F[1])<F[2]+40) return 'Zedernwald';
  const R=MAPDATA.rondell; if(Math.hypot(x-R[0],z-R[1])<160) return 'Rondell-Hügel'; if(z<-330) return 'Kaze-Berge'; if(z>620) return 'Minami-Täler'; return x<-300?'Reisfeld-Hügel':'Kirschblütental'; }
function updateHudMode(){ const inR=!!(game.me && game.me.inRace); $('#roamBox').hidden=inR; $('#raceBox').hidden=!inR; $('#timeBox').hidden=!inR; if(W && W.ring) W.ring.visible=inR; if(!inR){ $('#count').hidden=true; $('#wrong').hidden=true; } }
let promptTarget=null;
function updatePrompt(){
  const me=game.me; promptTarget=null; let txt=null, sub='';
  if(!me.inRace){ for(const e of W.events){ if(Math.hypot(me.x-e.pos.x, me.z-e.pos.z)<16){ promptTarget=e; txt='⚑ '+e.name; sub=`${e.mode==='drift'?'Drift-Challenge':e.mode==='time'?'Zeitfahren':'Rennen'} · ${e.laps} ${e.laps>1?'Runden':'Runde'} · ${lastInput==='pad'?padName(BINDS.act.p[0]):lastInput==='touch'?'Start tippen':keyName(BINDS.act.k[0]||BINDS.act.k[1])} zum Starten${game.race?' · Rennen läuft':''}`; break; } }
    if(!txt) for(const s of W.stunts){ if(Math.hypot(me.x-s.p.x, me.z-s.p.z)<55){ const best=save.pr[s.id]; txt=s.name; const unit=s.type==='trap'?' km/h':s.type==='jump'?' m':' Pkt.';
      sub = best!=null ? `Rekord ${fmtN(best)}${unit} · ${starStr(s.stars.filter(t=>best>=t).length)}` : `3 Sterne ab ${fmtN(s.stars[2])}${unit}`; if(s.on) sub=`Punkte: ${fmtN(s.score)}`; break; } } }
  $('#prompt').hidden=!txt; if(txt){ $('#prT').textContent=txt; $('#prS').textContent=sub; }
  $('#tAct').hidden=!promptTarget;
}
function tryAction(){ if(promptTarget && game.mode==='roam' && !game.me.inRace) startEvent(promptTarget.id); }

/* ---------- Karte ---------- */
const mapCan=$('#mapCan'), mapCtx=mapCan.getContext('2d'); let mapSel=null, mapItems=[];
function openMap(){ if(game.mode!=='roam') return; $('#pause').hidden=true; $('#map').hidden=false; game.paused=!net.peer; buildMapList(); updateTouchUI(); requestAnimationFrame(drawBigMap); setTimeout(()=>{ if(lastInput!=='touch') moveFocus(0,0); },30); }
function closeMap(){ if($('#map').hidden) return; $('#map').hidden=true; game.paused=false; updateTouchUI(); }
function buildMapList(){
  mapItems=[ ...W.events.map(e=>({kind:'event',name:'⚑ '+e.name, info:e.laps+' Rd.', x:e.pos.x, z:e.pos.z, col:'#ff2e88', ref:e})),
    ...W.stunts.map(s=>{ const b=save.pr[s.id]; return {kind:s.type, name:s.name, info:b!=null?starStr(s.stars.filter(t=>b>=t).length):'neu', x:s.p.x, z:s.p.z, col:s.type==='trap'?'#29d9ff':s.type==='drift'?'#ff7a2e':'#ffcf2e', ref:s}; }),
    {kind:'hub', name:'Festivalgelände', info:'Start', x:0, z:30, col:'#ffffff'} ];
  const L=$('#mapList'); L.innerHTML='';
  mapItems.forEach(it=>{ const b=document.createElement('button'); b.innerHTML=`<span>${esc(it.name)}</span><small>${esc(it.info)}</small>`; b.onfocus=()=>{ mapSel=it; drawBigMap(); }; b.onmouseenter=b.onfocus; b.onclick=()=>travel(it); L.appendChild(b); it.btn=b; });
}
function mapView(){ const r=mapCan.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio); mapCan.width=Math.max(10,r.width*dpr|0); mapCan.height=Math.max(10,r.height*dpr|0);
  const s=Math.min(mapCan.width,mapCan.height)/ ((MAPW-100)/MAPW*MAPS); return { s, ox:mapCan.width/2-MAPS/2*s, oy:mapCan.height/2-MAPS/2*s, dpr }; }
function drawBigMap(){ if($('#map').hidden) return; const v=mapView(), c=mapCtx; c.fillStyle='#121820'; c.fillRect(0,0,mapCan.width,mapCan.height);
  c.save(); c.translate(v.ox,v.oy); c.scale(v.s,v.s); c.drawImage(mapImg,0,0); navDrawMap(c, 3*v.dpr/v.s); c.restore();
  const P=(x,z)=>{ const [a,b]=m2p(x,z); return [v.ox+a*v.s, v.oy+b*v.s]; };
  mapItems.forEach(it=>{ const [x,y]=P(it.x,it.z), R=(it===mapSel?11:7)*v.dpr; c.beginPath(); c.arc(x,y,R,0,7); c.fillStyle=it.col; c.fill(); c.lineWidth=2*v.dpr; c.strokeStyle='#0f1218'; c.stroke();
    if(it===mapSel||it.kind==='event'){ c.font=`italic 700 ${13*v.dpr}px "Chakra Petch",sans-serif`; c.fillStyle='#fff'; c.textAlign='left'; c.fillText(it.name, x+R+5*v.dpr, y+4*v.dpr); } });
  game.racers.forEach(r=>{ if(!r.mesh.visible) return; const [x,y]=P(r.x,r.z); c.beginPath(); c.arc(x,y,(r.local?7:r.bot?3:5)*v.dpr,0,7); c.fillStyle=r.local?'#ff2e88':r.bot?'#c8ced8':r.paint; c.fill(); if(r.local){ c.lineWidth=3*v.dpr; c.strokeStyle='#fff'; c.stroke(); } });
  requestAnimationFrame(drawBigMap); }
mapCan.addEventListener('pointerdown', e=>{ const v=mapView(), r=mapCan.getBoundingClientRect(); const mx=(e.clientX-r.left)*v.dpr, my=(e.clientY-r.top)*v.dpr; let best=null, bd=(14*v.dpr)**2;
  mapItems.forEach(it=>{ const [a,b]=m2p(it.x,it.z); const x=v.ox+a*v.s, y=v.oy+b*v.s, d=(x-mx)**2+(y-my)**2; if(d<bd){ bd=d; best=it; } });
  if(best){ if(mapSel===best) travel(best); else { mapSel=best; best.btn && best.btn.scrollIntoView({block:'nearest'}); } return; }
  // freie Stelle: Wegpunkt setzen (auf bestehenden Wegpunkt tippen = löschen)
  const px=(mx-v.ox)/v.s, py=(my-v.oy)/v.s, x=px/MAPS*MAPW-MAPW/2, z=py/MAPS*MAPW-MAPW/2;
  if(NAV.target){ const [a,b]=m2p(NAV.target.x,NAV.target.z); if((v.ox+a*v.s-mx)**2+(v.oy+b*v.s-my)**2<(30*v.dpr)**2){ navClear(); toast('Wegpunkt gelöscht'); return; } }
  navSetTarget(x,z); });
$('#mapRoute').onclick=()=>{ if(mapSel){ navSetTarget(mapSel.x,mapSel.z); closeMap(); } else toast('Erst einen Ort auf der Karte auswählen'); };
function travel(it){ const me=game.me; if(me.inRace){ toast('Während eines Rennens nicht möglich.'); return; }
  let road, i; if(it.kind==='event'){ road=it.ref.road; i=2; } else if(it.kind==='hub'){ me.x=0; me.z=30; me.h=0; me.vx=me.vz=me.vy=0; me.fwd=0; me.y=surfaceAt(0,30)+.05; closeMap(); return; }
  else { road=it.ref.roadObj; i=Math.max(0,(it.ref.i0!=null?it.ref.i0:it.ref.i)-40); if(it.kind==='jump'){ const q=roadQuery(it.ref.ramp.x,it.ref.ramp.z); road=q.r; i=Math.max(0,q.i-50); } }
  placeOnRoad(me, road, i, -3.6); RW.buf.length=0; camState.init=false; closeMap(); toast('Schnellreise: '+it.name.replace('⚑ ','')); }

/* ---------- Pause ---------- */
function openPause(){ if(game.mode!=='roam') return; $('#pause').hidden=false; $('#slotPause').appendChild($('#garage')); $('#slotPause').appendChild($('#settings')); game.paused=!net.peer;
  $('#pRoom').textContent = net.peer ? `Raumcode ${net.code} · ${game.racers.filter(r=>!r.bot).length} Fahrer` : 'Solo-Festival'; updateTouchUI(); setTimeout(()=>{ if(lastInput!=='touch') $('#pResume').focus(); },30); }
function closePause(){ if($('#pause').hidden) return; $('#pause').hidden=true; game.paused=false; updateTouchUI(); }
