const _vS=new THREE.Vector3(), _v4=new THREE.Vector3();
"use strict";
/* =====================================================================
   SPIELSCHLEIFE
   ===================================================================== */
let last=performance.now(), netAcc=0, frameN=0, regionAcc=0;
function updatePointScale(){ if(!W||!W.pointMats) return; const h=renderer.getDrawingBufferSize(_v2).y, s=h/(2*Math.tan(camera.fov*Math.PI/360)); for(const m of W.pointMats) m.uniforms.uScale.value=s; }
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-last)/1000); last=now; frameN++;
  pollPad(dt); dynRes(dt);
  if(game.mode==='menu'||!W||!game.me){ show.t+=dt; if(show.car) show.car.rotation.y=show.t*.35;
    const a=camera.aspect; show.cam.aspect=a; const wide=a>1.25; const fit=3.6/(Math.tan(18*Math.PI/180)*Math.min(a,1.6)); const dist=Math.max(8.2,fit);
    show.cam.position.set(wide?2.6:0, 1.7+dist*.1, dist); show.cam.lookAt(wide?1.9:0, a<.8?-1.0:.55, 0); show.cam.updateProjectionMatrix();
    draw(show.scene, show.cam); audioUpdate(null, NONE, dt, false); return; }

  const me=game.me, race=game.race;
  if(race){ if(race.phase==='count'){ race.countT-=dt; const n=Math.ceil(race.countT), c=$('#count');
      if(race.countT<=0){ race.phase='go'; race.t=0; if(me.inRace){ c.textContent='LOS!'; blip(1046,.35,'square',.15); setTimeout(()=>c.hidden=true,700); } }
      else if(me.inRace){ if(c.textContent!==String(Math.min(3,n))) blip(523,.15,'square',.12); c.hidden=false; c.textContent=Math.min(3,n); tilt.zero=tilt.raw; } }
    else race.t+=dt; }
  let localImpact=0, inp=NONE;
  if(!game.paused){
    for(const r of game.racers){ let ri=NONE;
      if(r.sim){
        const frozen = r.inRace && race && race.phase==='count';
        if(r.local){ inp=(game.mode==='roam') ? readInput() : (game.mode==='intro' && r.road && !game.cineHub ? botInput(r,dt) : NONE); if(r.fin) inp=Object.assign({},NONE,botFollow(r,dt),{horn:inp.horn,look:inp.look});
          if(frozen){ r.vx=r.vz=0; ri={...NONE, thr:inp.thr}; }
          else if(rewindStep(r, inp.rew && !r.fin)) ri=NONE;
          else { localImpact=physics(r, inp, dt); ri=inp; } }
        else { ri=frozen?NONE:botInput(r,dt); physics(r, ri, dt); }
        if(r.inRace && race && race.phase==='go') lapLogic(r);
        r.brkOn=(ri.brk||0)>.1 && (r.fwd||0)>.5; gbUpdate(r, ri.thr||0, dt);
      } else if(r.seen){ const k=Math.min(1,dt*10); r.x+=(r.tx-r.x)*k; r.y+=(r.ty-r.y)*k; r.z+=(r.tz-r.z)*k; r.h+=wrapA(r.th-r.h)*k; r.air=r.y>surfaceAt(r.x,r.z)+.4;
        const acc=(r.fwd||0)-(r.pf2||0); r.pf2=r.fwd||0; r.brkOn=acc<-.08; ri={...NONE, thr:acc>.01?1:0}; gbUpdate(r, ri.thr, dt); }
      updateVisual(r, dt); carFX(r, ri, dt);
    }
    if(race && race.mode==='drift' && me.inRace && !me.fin && race.phase==='go' && !me.air && Math.abs(me.lat)>3.2 && Math.abs(me.fwd)>8) race.drift+=Math.abs(me.lat)*Math.abs(me.fwd)*dt*.9;
    if(game.mode==='roam' && !RW.on){ skillsUpdate(me, dt, localImpact); if(!me.inRace) stuntsUpdate(me, dt); if(localImpact>6){ crashSound(localImpact); camState.shake=Math.min(1,localImpact/18); } }
    if(me.landed){ if(me.landed>9){ blip(55,.25,'sine',Math.min(.35,me.landed*.02)); camState.shake=Math.max(camState.shake,Math.min(.8,me.landed/30)); } me.landed=0; }
    if(me.y<WATER_Y-.6){ me.drown=(me.drown||0)+dt; if(me.drown>.8){ me.drown=0; resetToRoad(me,true); } } else me.drown=0;
  }
  camState.look=!!inp.look;
  if(race && isAuthority()) raceAuthorityCheck(dt);
  W.anim.forEach(f=>f(dt)); if(frameN%10===0) updateLods();
  if(W.fx){ fxUpdate(W.fx.smoke,dt); fxUpdate(W.fx.glow,dt); }
  netAcc+=dt; if(netAcc>.066){ netAcc=0; netTick(); }

  // Tageszeit, Licht, Schatten
  todAcc+=dt; if(todAcc>.25){ todAcc=0; applyTod(); }
  const s=Math.sin(me.h), c=Math.cos(me.h);
  if(W.head){ if(W.head.isSpotLight){ W.head.position.set(me.x+s*2.4, me.y+.75, me.z+c*2.4); W.head.target.position.set(me.x+s*26, me.y-.5, me.z+c*26); W.head.intensity=(W.night||0)*3.6; }
    else { W.head.intensity=(W.night||0)*2.2; W.head.position.set(me.x+s*9, me.y+2.5, me.z+c*9); } }
  { const P=GP(), L=W.lightDir; let cx=me.x, cz=me.z; if(P.shadows){ const st=P.shadowR*2/P.shadows*4; cx=Math.round(cx/st)*st; cz=Math.round(cz/st)*st; }
    W.sun.target.position.set(cx, me.y, cz); W.sun.position.set(cx+L.x*420, me.y+L.y*420, cz+L.z*420); }

  audioUpdate(me, inp, dt, (game.mode==='roam'||game.mode==='intro') && !game.paused);

  // HUD
  if(frameN % GP().hudEvery===0 && game.mode==='roam'){
    const gb=me.gb||{rpm:800,g:1}; drawTach(Math.round(Math.abs(me.fwd)*3.6), gb.rpm, ENG[me.def.type].red, gb.g<0?'R':gb.g); drawMinimap(); renderSkill();
    regionAcc+=dt*GP().hudEvery; if(regionAcc>.5){ regionAcc=0; const rg=regionAt(me.x,me.z); if(rg!==game.region){ game.region=rg; $('#region').textContent=rg; } updatePrompt(); }
    if(me.inRace && race){ const list=raceRanking(); $('#hPosL').textContent=race.mode==='drift'?'Punkte':race.mode==='time'?'Rekord':'Platz';
      if(race.mode==='drift') $('#hPos').textContent=fmtN(race.drift); else if(race.mode==='time') $('#hPos').textContent=save.pr[race.evId]?fmt(save.pr[race.evId]):'–'; else $('#hPos').innerHTML=(list.indexOf(me)+1)+`<small>/${list.length}</small>`; $('#hLap').innerHTML=clamp(me.lap,1,race.laps)+`<small>/${race.laps}</small>`;
      $('#hTime').textContent=fmt(me.fin?me.ftime:(race.phase==='go'?race.t:0));
      const t=race.road.tan[me.ridx]; $('#wrong').hidden=!(race.phase==='go' && Math.sin(me.h)*t.x+Math.cos(me.h)*t.z < -.4 && Math.abs(me.fwd)>5);
      const nx=nextCp(), p=race.road.pts[nx]; W.ring.position.set(p.x,p.y+6,p.z); W.ring.rotation.y=Math.atan2(race.road.tan[nx].x, race.road.tan[nx].z);
      if(!$('#results').hidden) renderResults(); }
  }
  updateCamera(dt); navUpdate(dt);
  if(W.sky) W.sky.position.copy(camera.position);
  if(W.stars) W.stars.position.copy(camera.position);
  if(W.clouds){ W.clouds.position.set(camera.position.x*.85+(now*.002)%1200, 0, camera.position.z*.85); }
  if(W.grass){ const u=W.grass.material.uniforms; u.uCam.value.copy(camera.position); u.uTime.value=now/1000; }
  updatePointScale();
  if(gradePass && (gradePass.uniforms.ultra.value || gradePass.uniforms.solas.value)){ const U=gradePass.uniforms, me2=game.me; U.time.value=now/1000;
    const sp=me2&&game.mode==='roam'?Math.abs(me2.fwd||0)/me2.def.maxSpeed:0; U.speed.value+=(clamp((sp-.45)/.55,0,1)-U.speed.value)*Math.min(1,dt*3);
    const sv=_vS.copy(W.sunDir).multiplyScalar(2000).add(camera.position).project(camera), facing=_v4.set(0,0,-1).applyQuaternion(camera.quaternion).dot(W.sunDir);
    U.sun.value.set(sv.x*.5+.5, sv.y*.5+.5); U.sunView.value.copy(W.sunDir).transformDirection(camera.matrixWorldInverse); U.sunCol.value.copy(W.sun.color); U.day.value=sstep(-.05,.15,W.sunDir.y)*(1-(W.night||0)); U.sunVis.value=facing>0 && W.sunDir.y>-.02 ? sstep(0,.35,facing)*(1-sstep(.9,1.6,Math.max(Math.abs(sv.x),Math.abs(sv.y))))*(1-(W.night||0)) : 0; }
  draw(W.scene, camera);
}
// nach dem Zieleinlauf fährt der Autopilot weiter
function botFollow(r,dt){ r.road=game.race?game.race.road:r.road; const s=r.skill; r.skill=.6; const i=botInput(r,dt); r.skill=s; return i; }
requestAnimationFrame(frame);

/* ---------- Festival betreten / verlassen ---------- */
function enterWorld(cine){
  $('#loading').hidden=false;
  setTimeout(()=>{
    if(activeGfx!==cfg.gfx || cfg.gfx==='custom') applyGfx();
    buildWorld(); if(W.skid){ W.skid.pos.fill(0); W.skid.g.attributes.position.needsUpdate=true; W.skid.last=[null,null]; } game.mode=cine?'intro':'roam'; game.cineBoot=!!cine; game.intro=0; game.racers=[]; game.byId.clear(); game.race=null; game.region='';
    game.me=makeRacer(myEntry()); const me=game.me; me.hubX=rnd(-12,12); me.hubZ=30+rnd(-6,6); if(cine){ const hw=W.byId.hwy; placeOnRoad(me, hw, 900, -3.6); me.road=hw; me.skill=.72; } else { cinePark(); me.road=null; } camState.init=false; game.cineHub=false; game.cineCap=null; game.cineShot=-1; game.fwI=0; $('#cineT').innerHTML=''; $('#cineT').style.opacity=0;
    if(isAuthority()){ game.roster=[myEntry(), ...createAmbient()]; syncRacers(game.roster); if(net.isHost) sendRoster(); }
    RW.buf.length=0; resetChain(); applyTod(true); updateRank(); updateHudMode();
    $('#roomTag').hidden=!net.peer; $('#roomTag').textContent=net.peer?('Raum '+net.code):'';
    $('#loading').hidden=true; showScreen('hud'); if(cine){ $('#intro').hidden=false; document.body.classList.add('cine'); } else banner('Festivalgelände', 'Fahr zu einer Säule, um ein Event zu starten'); updateTouchUI(); requestWake();
  }, 30);
}
// Schnitte passend zur Intro-Musik (Akzente bei 8 · 10 · 18,25 · 22,8 · 28 · 40,5 · Höhepunkt ab 44,75 s)
const CINE=[[0,'establish'],[8,'front'],[10.05,'side'],[14,'rear'],[18.25,'bridge'],[22.8,'city'],[27.95,'fuji'],[32.5,'orbit'],[36,'stage'],[40.45,'car'],[44.75,'finale']];
const FW_T=[44.75,45.25,45.7,46.15,46.6,47.1,47.55,48,48.5,48.95,49.4,49.85,50.35,50.8,51.3,51.75,52.2];
function cineEnter(type){ const me=game.me, hw=W.byId.hwy, go=(i,v)=>{ placeOnRoad(me,hw,(i+hw.N)%hw.N,-3.6); me.road=hw; const t=hw.tan[(i+hw.N)%hw.N]; me.vx=t.x*v; me.vz=t.z*v; me.fwd=v; };
  if(type==='front') go(W.bridgeMid?W.bridgeMid.i+200:900, 26);
  if(type==='bridge') go(W.bridgeMid?W.bridgeMid.i-34:900, 31);
  if(type==='orbit' && !game.cineHub){ game.cineHub=true; cinePark(); } }
function cineCamera(r,t,dt){
  let si=0; while(si<CINE.length-1 && t>=CINE[si+1][0]) si++; const [t0,type]=CINE[si], t1=si<CINE.length-1?CINE[si+1][0]:53.5, k=clamp((t-t0)/(t1-t0),0,1);
  if(game.cineShot!==si){ game.cineShot=si; cineEnter(type); }
  const s=Math.sin(r.h), c=Math.cos(r.h), sx=c, sz=-s, hy=surfaceAt(0,0,false); let cap='';
  if(type==='establish'){ const L=MAPDATA.lake; camera.position.set(lerp(L[0]+260,L[0]-120,k), lerp(260,150,k), lerp(L[1]-420,L[1]-80,k)); camera.lookAt(FUJI.x, 90, FUJI.z); setFov(50); if(t>3) cap='<span>Turbo Ring</span><small>Festival · Japan</small>'; }
  else if(type==='front'){ camera.position.set(r.x+s*(9-k*3)+sx*2.2, r.y+.6, r.z+c*(9-k*3)+sz*2.2); camera.lookAt(r.x, r.y+.7, r.z); setFov(42); }
  else if(type==='side'){ camera.position.set(r.x+sx*4.6+s*(2.5-k*5), r.y+.75, r.z+sz*4.6+c*(2.5-k*5)); camera.lookAt(r.x+s*1.5, r.y+.6, r.z+c*1.5); setFov(48); }
  else if(type==='rear'){ camera.position.set(r.x-s*(5.5+k*2)-sx*1.2, r.y+.55, r.z-c*(5.5+k*2)-sz*1.2); camera.lookAt(r.x+s*12, r.y+.8, r.z+c*12); setFov(46); }
  else if(type==='bridge' && W.bridgeMid){ const B=W.bridgeMid, hw=W.byId.hwy, seg=hw.len/hw.N, f=B.i-24+(t-t0)*30/seg, i0=Math.floor(f), fr=f-i0, a1=hw.pts[(i0+hw.N)%hw.N], a2=hw.pts[(i0+1+hw.N)%hw.N], tn=hw.tan[(i0+hw.N)%hw.N], nn=hw.nor[(i0+hw.N)%hw.N];
    r.x=lerp(a1.x,a2.x,fr)+nn.x*3.6; r.z=lerp(a1.z,a2.z,fr)+nn.z*3.6; r.y=lerp(a1.y,a2.y,fr)+.02; r.h=Math.atan2(tn.x,tn.z); r.vx=tn.x*30; r.vz=tn.z*30; r.vy=0; r.fwd=30; r.lat=0; r.air=false; r.mesh.position.set(r.x,r.y,r.z); r.mesh.rotation.set(0,r.h,0); camera.position.set(B.p.x+B.n.x*36-B.t.x*8, Math.max(WATER_Y+1.5,B.p.y-2), B.p.z+B.n.z*36-B.t.z*8); camera.lookAt(lerp(B.p.x,r.x,.6), r.y+1, lerp(B.p.z,r.z,.6)); setFov(40); }
  else if(type==='drone' || type==='bridge'){ const e=sstep(0,1,k); camera.position.set(r.x-s*(8+e*40)-sx*e*20, r.y+2.5+e*45, r.z-c*(8+e*40)-sz*e*20); camera.lookAt(r.x+s*25, r.y+3+e*10, r.z+c*25); setFov(55); }
  else if(type==='city'){ const T=W.tower, a=-.9+k*1.5, d=lerp(260,150,k); camera.position.set(T.x+Math.sin(a)*d, T.y+lerp(40,95,k), T.z+Math.cos(a)*d); camera.lookAt(T.x, T.y+lerp(60,110,k), T.z); setFov(52); cap='<span>Neon-City</span>'; }
  else if(type==='fuji'){ const a=1.6+k*1.1, d=FUJI.r*1.55; camera.position.set(FUJI.x+Math.sin(a)*d, FUJI.h*.55+lerp(60,140,k), FUJI.z+Math.cos(a)*d); camera.lookAt(FUJI.x, FUJI.h*.55, FUJI.z); setFov(46); cap='Bis zum <span>Gipfel</span><small>Fuji-Bergstraße</small>'; }
  else if(type==='orbit'){ const a=k*1.6+.6, rad=130-k*30; camera.position.set(Math.sin(a)*rad, hy+32-k*8, Math.cos(a)*rad-10); camera.lookAt(0,hy+8,-30); setFov(55); }
  else if(type==='stage'){ camera.position.set(lerp(-8,6,k), hy+lerp(5,9,k), lerp(15,-22,k)); camera.lookAt(0,hy+12,-68); setFov(52); cap='Willkommen<br>beim <span>Festival</span>'; }
  else if(type==='car'){ const a=k*2.2+2.4; camera.position.set(r.x+Math.sin(a)*6.5, r.y+1.1, r.z+Math.cos(a)*6.5); camera.lookAt(r.x, r.y+.7, r.z); setFov(45); }
  else { const a=1.2+k*.8, d=8+k*45; camera.position.set(r.x+Math.sin(a)*d, r.y+2+k*22, r.z+Math.cos(a)*d); camera.lookAt(r.x, r.y+1+k*22, r.z-k*30); setFov(55); cap='<span>Turbo Ring</span> Festival<small>Taste drücken</small>'; }
  if(game.fwI==null) game.fwI=0; while(game.fwI<FW_T.length && t>=FW_T[game.fwI]){ game.fwI++; firework(hy); }
  if(type==='car' && Math.random()<dt*1.5) firework(hy);
  if(cap!==game.cineCap){ game.cineCap=cap; const el=$('#cineT'); el.style.opacity=0; setTimeout(()=>{ el.innerHTML=cap; el.style.opacity=cap?1:0; }, cap?250:0); }
  if(t>53.5) endIntro(); }
function cinePark(){ const me=game.me; if(!me) return; me.road=null; me.x=me.hubX; me.z=me.hubZ; me.h=0; me.vx=me.vz=me.vy=0; me.fwd=me.lat=0; me.y=surfaceAt(me.x,me.z)+.05; RW.buf.length=0; }
function firework(hy){ if(!W||!W.fx) return; const F=W.fx.glow, x=rnd(-60,60), y=hy+42+rnd(0,25), z=rnd(-95,-5), col=pick([[1,.2,.55],[.2,.85,1],[1,.85,.2],[.5,1,.4],[.75,.4,1]]);
  for(let i=0;i<28;i++){ const a=Math.random()*6.28, e=Math.random()*2-1, v=10+Math.random()*4, ce=Math.sqrt(1-e*e); fxSpawn(F, x,y,z, Math.cos(a)*ce*v, e*v, Math.sin(a)*ce*v, 1.1, .6, 1.3+Math.random()*.5, 1, col[0],col[1],col[2], -7); }
  blip(70+Math.random()*30,.35,'sine',.18); }
function endIntro(){ if(game.mode!=='intro') return; stopMusic(); if(AU.master) AU.master.gain.value=cfg.sound?.8:0; if(game.cineBoot){ game.cineBoot=false; game.cineCap=null; $('#cineT').innerHTML=''; leaveWorld(); playStudio(); return; } if(!game.cineHub) cinePark(); game.cineHub=false; game.cineCap=null; $('#cineT').innerHTML=''; document.body.classList.remove('cine'); game.mode='roam'; $('#intro').hidden=true; camState.init=false; banner('Festivalgelände', 'Fahr zu einer pinken Säule, um ein Rennen zu starten'); updateTouchUI(); }
function leaveWorld(){ if(W) [...game.racers].forEach(removeRacer); game.racers=[]; game.byId.clear(); game.me=null; game.race=null; game.mode='menu';
  $('#pause').hidden=$('#map').hidden=$('#results').hidden=$('#intro').hidden=$('#binds').hidden=true; rebind=null; document.body.classList.remove('cine'); $('#gl').classList.remove('rewind'); leaveNet(); releaseWake(); showScreen('menu'); updateTouchUI(); }
let wakeLock=null;
async function requestWake(){ try{ if(navigator.wakeLock) wakeLock=await navigator.wakeLock.request('screen'); }catch(e){} }
function releaseWake(){ try{ if(wakeLock) wakeLock.release(); }catch(e){} wakeLock=null; }
