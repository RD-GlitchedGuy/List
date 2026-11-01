"use strict";
/* =====================================================================
   SPIELZUSTAND
   ===================================================================== */
const game = { mode:'menu', racers:[], byId:new Map(), me:null, race:null, roster:[], intro:0, cam:cfg.cam, paused:false, region:'' };
const PREFIX='turboring-v2-';
const net = { peer:null, isHost:false, conns:new Map(), host:null, code:'', myId:'me' };
const isAuthority = () => !net.peer || net.isHost;
const myEntry = () => ({ id:net.myId, name:cfg.name, car:cfg.car, paint:cfg.paint });

function makeRacer(e){
  const def=carById(e.car), local=e.id===net.myId;
  const mesh=createCarMesh(def, e.paint||def.paint); W.scene.add(mesh);
  if(local) mesh.traverse(o=>{ if(o.isLOD){ o.autoUpdate=false; o.levels.forEach((l,i)=>l.object.visible=i===0); } });   // eigenes Auto immer voll sichtbar
  if(!local && (!e.bot || GP().botLabels)) mesh.add(makeLabel(e.name, e.paint||def.paint));
  const r={ id:e.id, name:e.name, car:e.car, def, paint:e.paint||def.paint, bot:!!e.bot, kind:e.kind||'player', local, mesh,
    x:0,y:0,z:0,h:0,vx:0,vy:0,vz:0, fwd:0, lat:0, air:false, airT:0, pitch:0, roll:0, steerVis:0,
    road:e.road?W.byId[e.road]:null, ridx:0, lap:0, half:true, fin:false, ftime:0, inRace:false, stuck:0,
    tx:0,ty:0,tz:0,th:0, seen:local, sim: local || (!!e.bot && isAuthority()), skill: e.kind==='race'? rnd(.86,.97) : rnd(.5,.66), laneSeed:rnd(0,6.28) };
  if(r.sim && r.road){ const i=Math.floor(rnd(0,r.road.N)); placeOnRoad(r, r.road, i, r.kind==='amb'?-3.6:0); }
  else if(!local){ mesh.visible=false; }
  game.racers.push(r); game.byId.set(r.id,r); return r;
}
function removeRacer(r){ W.scene.remove(r.mesh); disposeTree(r.mesh); game.racers.splice(game.racers.indexOf(r),1); game.byId.delete(r.id); }
function rebuildMesh(r, e){ const keep={x:r.x,y:r.y,z:r.z,h:r.h}; W.scene.remove(r.mesh); disposeTree(r.mesh);
  r.car=e.car; r.def=carById(e.car); r.paint=e.paint||r.def.paint; r.name=e.name; r.mesh=createCarMesh(r.def,r.paint); W.scene.add(r.mesh); if(r.local) r.mesh.traverse(o=>{ if(o.isLOD){ o.autoUpdate=false; o.levels.forEach((l,i)=>l.object.visible=i===0); } });
  if(!r.local && (!r.bot||GP().botLabels)) r.mesh.add(makeLabel(r.name,r.paint)); Object.assign(r,keep); }
function syncRacers(roster){
  const ids=new Set(roster.map(e=>e.id));
  for(const r of [...game.racers]) if(!r.local && !ids.has(r.id)) removeRacer(r);
  for(const e of roster){ let r=game.byId.get(e.id);
    if(r){ if(!r.local && (r.car!==e.car||r.paint!==(e.paint||carById(e.car).paint)||r.name!==e.name)) rebuildMesh(r,e); if(e.road && r.sim) r.road=W.byId[e.road]; }
    else makeRacer(e); }
}
function placeOnRoad(r, road, i, lane=0, back=0){ const p=road.pts[i], t=road.tan[i], n=road.nor[i];
  r.x=p.x+n.x*lane-t.x*back; r.z=p.z+n.z*lane-t.z*back; r.h=Math.atan2(t.x,t.z); r.vx=r.vy=r.vz=0; r.fwd=r.lat=0; r.y=surfaceAt(r.x,r.z)+.05; r.ridx=i;
  r.tx=r.x; r.ty=r.y; r.tz=r.z; r.th=r.h; }
function createAmbient(){ const roads=['hwy','hwy','hwy','city','city','fest','pass']; return roads.map((rd,k)=>({ id:'amb'+k, name:DRIVATARS[k%DRIVATARS.length], car:pick(CARS).id, paint:pick(PAINTS), bot:true, kind:'amb', road:rd })); }

/* ---------- Strecken-Index & Bots ---------- */
function loopIdx(r, road){
  const P=road.pts, N=road.N; let best=1e12, bi=r.ridx||0;
  for(let o=-25;o<=55;o++){ const i=(r.ridx+o+N)%N; const dx=P[i].x-r.x, dz=P[i].z-r.z, d=dx*dx+dz*dz; if(d<best){best=d;bi=i;} }
  if(best>1600){ best=1e12; for(let i=0;i<N;i+=2){ const dx=P[i].x-r.x, dz=P[i].z-r.z, d=dx*dx+dz*dz; if(d<best){best=d;bi=i;} } }
  return bi;
}
function botInput(r, dt){
  const road=r.road; if(!road) return NONE;
  r.ridx=loopIdx(r,road);
  const N=road.N, spd=Math.abs(r.fwd), look=Math.floor((10+spd*.75)/2.5), ti=(r.ridx+look)%N;
  const lane = r.kind==='amb' ? -3.6 : Math.sin(r.laneSeed+r.ridx*.008)*3;
  const P=road.pts[ti], n=road.nor[ti]; const want=Math.atan2(P.x+n.x*lane-r.x, P.z+n.z*lane-r.z); const diff=wrapA(want-r.h);
  const a=road.tan[r.ridx], b=road.tan[(r.ridx+16)%N]; const bend=Math.acos(clamp(a.x*b.x+a.z*b.z,-1,1));
  const target=r.def.maxSpeed*r.skill*clamp(1.06-bend*1.9,.3,1);
  if(spd<2 && (!game.race || game.race.phase==='go')){ r.stuck+=dt; if(r.stuck>3){ r.stuck=0; placeOnRoad(r,road,(r.ridx+3)%N,lane); } } else r.stuck=0;
  if(Math.abs(diff)>1.8) return { steer:clamp(diff*2,-1,1), thr:0, brk:1, hb:0 };
  return { steer:clamp(diff*2.4,-1,1), thr: spd<target?1:0, brk: spd>target+6?1:0, hb:0 };
}

/* ---------- Fahrphysik ---------- */
const GRAV=30;
function physics(r, inp, dt){
  const d=r.def;
  const g0=surfaceAt(r.x,r.z); const onRoad=G.onRoad; r.qRoad=G.r; r.qi=G.i; r.qd=G.d;
  const grounded = r.y <= g0+.15;
  r.offroad=!onRoad;
  if(grounded){
    const surf=onRoad?1:d.offroad, maxLat=d.grip*1.55*(onRoad?1:.7)*(inp.hb?.38:1);
    // Lenken: die Gierrate wird durch die Haftgrenze begrenzt – zu schnell in der Kurve = schieben/rutschen
    const f0=r.vx*Math.sin(r.h)+r.vz*Math.cos(r.h), vs=Math.max(Math.abs(f0),1);
    r.h+=inp.steer*Math.min(d.turn*clamp((Math.abs(f0)-.4)/5.6,0,1), maxLat*(inp.hb?2.6:1.02)/vs)*Math.sign(f0||1)*dt;
    const fx=Math.sin(r.h), fz=Math.cos(r.h);
    let fwd=r.vx*fx+r.vz*fz, lat=r.vx*fz-r.vz*fx;
    const maxS=d.maxSpeed*(onRoad?1:d.offroad), A=d.accel*.55*surf;
    if(inp.thr>0 && fwd<maxS) fwd+=A*inp.thr*dt*(1-Math.max(0,fwd)/maxS*.6)*(r.gb&&r.gb.shiftT>0?.4:1);
    if(inp.brk>0){ if(fwd>.5) fwd-=26*inp.brk*dt*surf; else if(fwd>-maxS*.3) fwd-=A*.6*dt; }
    if(!inp.thr && !inp.brk) fwd-=Math.sign(fwd)*Math.min(Math.abs(fwd),2.2*dt);
    if(fwd>maxS) fwd-=(fwd-maxS)*1.5*dt;
    const slope=(surfaceAt(r.x+fx*2,r.z+fz*2,false)-surfaceAt(r.x-fx*2,r.z-fz*2,false))/4;   // Hangabtrieb
    fwd-=9.8*clamp(slope,-1,1)*dt;
    fwd-=fwd*(onRoad?.02:.15)*dt+Math.sign(fwd)*fwd*fwd*.0009*dt;                              // Roll- & Luftwiderstand
    lat-=Math.sign(lat)*Math.min(Math.abs(lat), maxLat*(inp.hb?1:1.6)*dt);                                       // Seitenhaftung
    if(Math.abs(lat)>.5) fwd-=Math.sign(fwd)*Math.min(Math.abs(fwd), Math.abs(lat)*.55*dt);       // Rutschen kostet Tempo
    fwd-=fwd*Math.abs(inp.steer)*.12*dt;                                                         // Lenkwiderstand
    r.vx=fx*fwd+fz*lat; r.vz=fz*fwd-fx*lat; r.fwd=fwd; r.lat=lat;
  } else { r.h+=inp.steer*.4*dt; r.vx*=1-.15*dt; r.vz*=1-.15*dt; const fx=Math.sin(r.h), fz=Math.cos(r.h); r.fwd=r.vx*fx+r.vz*fz; r.lat=r.vx*fz-r.vz*fx; }
  r.x+=r.vx*dt; r.z+=r.vz*dt;
  // Höhe, Sprünge, Landung
  const wasAir=r.air; r.vy-=GRAV*dt; r.y+=r.vy*dt;
  const g1=surfaceAt(r.x,r.z);
  let impact=0;
  if(r.y<=g1 && !wasAir && g1-g0>1.1){ // Stufe/Wand (z. B. Brückenkante, Böschung): nicht hochkatapultieren, sondern abprallen
    r.x-=r.vx*dt; r.z-=r.vz*dt; impact=Math.hypot(r.vx,r.vz)*.4; r.vx*=-.25; r.vz*=-.25; r.y=g0; r.vy=0; r.air=false; }
  else if(r.y<=g1){ const gv=Math.min((g1-g0)/dt,20); if(wasAir && r.vy<-8) r.landed=-r.vy; if(wasAir && r.vy<-16){ r.vx*=.85; r.vz*=.85; } r.y=g1; r.vy=Math.max(r.vy, gv); r.air=false; }
  else r.air = r.y > g1+.3;
  if(r.air) r.airT+=dt; else r.airT=0;
  // Hindernisse & andere Autos
  impact=Math.max(impact, staticCollide(r));
  for(const o of game.racers){ if(o===r || !o.mesh.visible || Math.abs(o.y-r.y)>2.5) continue; const dx=r.x-o.x, dz=r.z-o.z, dd=dx*dx+dz*dz;
    if(dd<6.25 && dd>1e-4){ const dl=Math.sqrt(dd), push=2.5-dl; r.x+=dx/dl*push*.6; r.z+=dz/dl*push*.6;
      const rvx=r.vx-(o.vx||0), rvz=r.vz-(o.vz||0), vn=(rvx*dx+rvz*dz)/dl; if(vn<0){ r.vx-=dx/dl*vn*.65; r.vz-=dz/dl*vn*.65; impact=Math.max(impact,-vn*.7); } } }
  const L=HALF-70; if(Math.abs(r.x)>L){ r.x=Math.sign(r.x)*L; r.vx*=-.3; } if(Math.abs(r.z)>L){ r.z=Math.sign(r.z)*L; r.vz*=-.3; }
  r.steerVis+=(inp.steer-r.steerVis)*Math.min(1,dt*10);
  return impact;
}
function staticCollide(r){
  const C=16, cx=Math.floor(r.x/C), cz=Math.floor(r.z/C); let imp=0;
  for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const L=W.obs.get(hkey(cx+a,cz+b)); if(!L) continue;
    for(const o of L){ if(r.y>o.top) continue; let nx, nz, pen;
      if(o.r!=null){ const dx=r.x-o.x, dz=r.z-o.z, dd=dx*dx+dz*dz, R=o.r+1.3; if(dd>=R*R) continue; const dl=Math.sqrt(dd)||1e-3; nx=dx/dl; nz=dz/dl; pen=R-dl; }
      else { const qx=clamp(r.x,o.x0,o.x1), qz=clamp(r.z,o.z0,o.z1), dx=r.x-qx, dz=r.z-qz, dd=dx*dx+dz*dz; if(dd>=1.69) continue;
        if(dd<1e-6){ const s=[[r.x-o.x0,-1,0],[o.x1-r.x,1,0],[r.z-o.z0,0,-1],[o.z1-r.z,0,1]].sort((p,q)=>p[0]-q[0])[0]; nx=s[1]; nz=s[2]; pen=s[0]+1.3; }
        else { const dl=Math.sqrt(dd); nx=dx/dl; nz=dz/dl; pen=1.3-dl; } }
      r.x+=nx*pen; r.z+=nz*pen; const vn=r.vx*nx+r.vz*nz; if(vn<0){ r.vx-=nx*vn*1.35; r.vz-=nz*vn*1.35; r.vx*=.75; r.vz*=.75; imp=Math.max(imp,-vn); } } }
  return imp;
}
/* ---------- Getriebe (automatisch) ---------- */
function gbUpdate(r, thr, dt){
  const E=ENG[r.def.type]||ENG.sport; let gb=r.gb; if(!gb) gb=r.gb={g:1, rpm:E.idle, shiftT:0, boost:0, limit:0, load:0};
  const v=Math.abs(r.fwd||0), vmax=r.def.maxSpeed*1.02, sf=g=>Math.pow(g/E.n,.78);
  let target;
  if((r.fwd||0)<-.6){ gb.g=-1; target=E.idle+(E.red-E.idle)*clamp(v/(vmax*.25),0,1); }
  else { if(gb.g<1) gb.g=1;
    const rpmAt=g=>E.red*v/(vmax*sf(g));
    if(gb.shiftT<=0){ if(rpmAt(gb.g)>E.red*.96 && gb.g<E.n && thr>.2){ gb.g++; gb.shiftT=E.cut; onShift(r,1); }
      else if(gb.g>1 && rpmAt(gb.g)<E.red*.45){ gb.g--; gb.shiftT=E.cut*.6; onShift(r,-1); } }
    target=Math.max(rpmAt(gb.g), E.idle+(gb.g===1?(E.red*.52-E.idle)*thr:0));
    if(r.air) target=E.idle+(E.red-E.idle)*thr*.95; }
  if(Math.abs(r.lat||0)>3 && thr>.5) target*=1.12;
  target=Math.min(target, E.red);
  gb.rpm+=(target-gb.rpm)*Math.min(1, dt*(gb.shiftT>0?18:10)); if(gb.shiftT>0) gb.shiftT-=dt;
  if(gb.rpm>E.red*.985 && thr>.5){ gb.limit+=dt; gb.rpm=E.red*(.965+.02*Math.sin(gb.limit*60)); }
  gb.boost+=((thr>.5 && gb.shiftT<=0 ? clamp((gb.rpm-E.idle)/(E.red*.5),0,1) : 0)-gb.boost)*Math.min(1,dt*(thr>.5?2.2:6));
  gb.load=thr; return gb; }
function onShift(r, dir){ if(!r.local || !AU.ctx) return; const E=ENG[r.def.type];
  if(dir>0){ if(E.turbo||r.def.type==='sport'){ burst(AU.pop.g,.14,.05); spawnFlame(r); } } }

/* ---------- Darstellung pro Auto: Federung, Bremslichter, Effekte ---------- */
function updateVisual(r, dt){
  const m=r.mesh; m.position.set(r.x,r.y,r.z);
  let tp, tr;
  if(!r.air){ const s=Math.sin(r.h), c=Math.cos(r.h); const gf=surfaceAt(r.x+s*1.8,r.z+c*1.8), gb=surfaceAt(r.x-s*1.8,r.z-c*1.8), gl=surfaceAt(r.x+c,r.z-s), gr=surfaceAt(r.x-c,r.z+s);
    tp=-Math.atan2(gf-gb,3.6); tr=Math.atan2(gl-gr,2); }
  else { tp=-Math.atan2(r.vy||0, Math.max(8,Math.abs(r.fwd)))*.6; tr=r.roll; }
  const k=Math.min(1,dt*10); r.pitch+=(tp-r.pitch)*k; r.roll+=(tr-r.roll)*k;
  m.rotation.set(r.pitch, r.h, r.roll);
  const U=m.userData.inner && m.userData.inner.userData; if(!U) return;
  if(U.wheels){ const spin=(r.fwd||0)*dt/(U.wr||.4); for(const w of U.wheels) w.rotation.x+=spin; for(const f of U.front) f.rotation.y=(r.steerVis||0)*.42; }
  if(U.body){ const acc=((r.fwd||0)-(r.pfv==null?r.fwd||0:r.pfv))/Math.max(dt,1e-3); r.pfv=r.fwd||0; r.accS=lerp(r.accS||0, clamp(acc,-30,30), Math.min(1,dt*5));
    const kk=Math.min(1,dt*7), spd=Math.abs(r.fwd||0);
    U.body.rotation.z+=(clamp((r.steerVis||0)*spd*.0011+(r.lat||0)*.004,-.065,.065)-U.body.rotation.z)*kk;
    U.body.rotation.x+=(clamp(-r.accS*.0024,-.045,.045)-U.body.rotation.x)*kk; }
  if(U.tail) U.tail.emissiveIntensity=(r.brkOn?3.4:.75)+(W&&W.night||0)*.8;
}
function spawnFlame(r){ if(!W||!W.fx||!r.mesh) return; const U=r.mesh.userData.inner&&r.mesh.userData.inner.userData; if(!U||!U.exhaust) return;
  const ch=Math.cos(r.h), sh=Math.sin(r.h);
  for(const [ex,ey,ez] of U.exhaust){ const x=r.x+ch*ex+sh*ez, z=r.z-sh*ex+ch*ez;
    fxSpawn(W.fx.glow, x, r.y+ey, z, -sh*3+r.vx*.9, .2, -ch*3+r.vz*.9, .35, 2.6, .09, 1, 1, .5, .14, 0);
    fxSpawn(W.fx.glow, x, r.y+ey, z, -sh*5+r.vx*.9, .3, -ch*5+r.vz*.9, .22, 1.6, .06, 1, 1, .85, .45, 0); } }
function carFX(r, ri, dt){
  if(!W||!W.fx||!r.mesh.visible) return; const dx=r.x-camera.position.x, dz=r.z-camera.position.z; if(dx*dx+dz*dz>8100){ if(r.local&&W.skid) W.skid.last=[null,null]; return; }
  const U=r.mesh.userData.inner&&r.mesh.userData.inner.userData; if(!U||!U.rear) return;
  const spd=Math.abs(r.fwd||0), lat=Math.abs(r.lat||0), E=ENG[r.def.type];
  const drift=!r.air && !r.offroad && lat>3.4 && spd>5;
  const burn=!r.air && !r.offroad && (ri.thr||0)>.8 && spd<9 && r.gb && r.gb.rpm>E.red*.48;
  const brake=!r.air && !r.offroad && (ri.brk||0)>.7 && spd>14;
  const dust=r.offroad && !r.air && spd>6;
  const ch=Math.cos(r.h), sh=Math.sin(r.h);
  if(drift||burn||dust){ r.fxAcc=(r.fxAcc||0)+dt*(dust?22:30)*(GP().fx/160);
    while(r.fxAcc>1){ r.fxAcc--; for(const [wx,wz] of U.rear){ const x=r.x+ch*wx+sh*wz, z=r.z-sh*wx+ch*wz;
      if(dust) fxSpawn(W.fx.smoke, x, r.y+.3, z, -r.vx*.15+rnd(-1,1), rnd(.6,1.6), -r.vz*.15+rnd(-1,1), 1.2, 3.2, rnd(1.2,2), .5, .58,.48,.36, .2);
      else fxSpawn(W.fx.smoke, x, r.y+.25, z, -r.vx*.08+rnd(-.6,.6), rnd(.4,1.2), -r.vz*.08+rnd(-.6,.6), 1, 3.6, rnd(1.6,2.6), .55, .82,.82,.84, .45); } } }
  if(r.local && W.skid){ if(drift||burn||brake){ U.rear.forEach(([wx,wz],i)=>{ const x=r.x+ch*wx+sh*wz, z=r.z-sh*wx+ch*wz; const vx=r.vx||sh, vz=r.vz||ch, l=Math.hypot(vx,vz)||1; skidAdd(W.skid, i, x, surfaceAt(x,z)+.035, z, vx/l, vz/l); }); } else W.skid.last=[null,null]; }
}
function resetToRoad(r, msg){
  if(!r) return; let q=roadQuery(r.x,r.z), road, i;
  if(q){ road=q.r; i=q.i; } else { let best=1e12; W.roads.forEach(rd=>{ for(let k=0;k<rd.N;k+=3){ const p=rd.pts[k], d=(p.x-r.x)**2+(p.z-r.z)**2; if(d<best){ best=d; road=rd; i=k; } } }); }
  const t=road.tan[i]; const dir=Math.sin(r.h)*t.x+Math.cos(r.h)*t.z;
  placeOnRoad(r, road, i, -3.6); if(dir<0) r.h+=Math.PI; r.ridx = r.inRace && game.race ? loopIdx(r, game.race.road) : r.ridx;
  RW.buf.length=0; if(msg) toast('Auf die Straße gesetzt');
}

/* ---------- Skills ---------- */
const SK={ chain:0, count:0, mult:1, t:0, drift:0, driftOff:0, airT:0, speedT:0, near:new Map(), lines:[], dirty:true };
function addSkill(name, pts){ pts=Math.round(pts); SK.chain+=pts; SK.count++; SK.mult=Math.min(9,1+Math.floor(SK.count/2)); SK.t=3.2; SK.lines.unshift({name,pts,t:2.6}); if(SK.lines.length>4) SK.lines.pop(); SK.dirty=true; blip(700+SK.mult*60,.09,'square',.07); }
function bankChain(){ const total=SK.chain*SK.mult; if(total>0){ addXP(total); addCR(total*.2); SK.lines=[{name:'Gesichert',pts:total,t:2.2}]; blip(988,.15); blip(1318,.2,'triangle',.14,.08); } resetChain(); }
function breakChain(){ if(SK.chain>0){ SK.lines=[{name:'Crash – Kette verloren',pts:0,t:2.2}]; blip(140,.3,'sawtooth',.18); } resetChain(); }
function resetChain(){ SK.chain=0; SK.count=0; SK.mult=1; SK.t=0; SK.drift=0; SK.airT=0; SK.dirty=true; }
function skillsUpdate(r, dt, impact){
  if(impact>10){ breakChain(); return; }
  const spd=Math.abs(r.fwd), drifting=!r.air && Math.abs(r.lat)>3.2 && spd>9;
  if(drifting){ SK.drift+=Math.abs(r.lat)*spd*dt*.9; SK.driftOff=0; SK.dirty=true; }
  else if(SK.drift>0){ SK.driftOff+=dt; if(SK.driftOff>.45){ if(SK.drift>120) addSkill(SK.drift>4000?'Epischer Drift':SK.drift>1500?'Großer Drift':'Drift', SK.drift); SK.drift=0; } }
  if(r.air) SK.airT=r.airT; else if(SK.airT>0){ if(SK.airT>.55) addSkill(SK.airT>1.6?'Großer Sprung':'Sprung', SK.airT*700); SK.airT=0; }
  if(spd*3.6>210){ SK.speedT+=dt; if(SK.speedT>2.5){ SK.speedT=0; addSkill('Raser',300); } } else SK.speedT=0;
  const now=performance.now();
  for(const o of game.racers){ if(o===r || !o.mesh.visible) continue; const dd=(o.x-r.x)**2+(o.z-r.z)**2; if(dd<18 && dd>7){ const rel=Math.hypot(r.vx-(o.vx||Math.sin(o.h)*o.fwd), r.vz-(o.vz||Math.cos(o.h)*o.fwd)); if(rel>14 && now-(SK.near.get(o.id)||0)>2500){ SK.near.set(o.id,now); addSkill('Beinahe-Unfall',350); } } }
  if(SK.chain>0 && SK.drift===0 && !r.air){ SK.t-=dt; if(SK.t<=0) bankChain(); }
  SK.lines.forEach(l=>l.t-=dt); if(SK.lines.length && SK.lines[SK.lines.length-1].t<=0){ SK.lines.pop(); SK.dirty=true; }
}
function renderSkill(){
  const show=SK.chain>0||SK.drift>0||SK.lines.length; $('#skill').hidden=!show; if(!show) return;
  $('#skChain').textContent=fmtN(SK.chain + SK.drift); $('#skMult').textContent='x'+SK.mult; $('#skTimer').style.width=(SK.drift>0?100:clamp(SK.t/3.2,0,1)*100)+'%';
  if(SK.dirty){ $('#skLines').innerHTML=SK.lines.map(l=>`<div class="ln">${esc(l.name)}${l.pts?`<span>+${fmtN(l.pts)}</span>`:''}</div>`).join(''); SK.dirty=false; } }
function addXP(n){ const before=levelOf(save.xp); save.xp+=Math.round(n); persist(); const after=levelOf(save.xp); if(after>before){ banner('Festival-Rang '+after, 'Aufgestiegen!'); jingle(); } updateRank(); }
function updateRank(){ const l=levelOf(save.xp), a=xpFor(l), b=xpFor(l+1); $('#rankTxt').textContent=`Festival-Rang ${l} · ${fmtN(save.xp)} XP`; $('#rankBar i').style.width=clamp((save.xp-a)/(b-a),0,1)*100+'%'; $('#menuRank').textContent=l; $('#pRank').textContent=l; $('#menuXp').textContent=fmtN(save.xp)+' XP'; $('#menuCr').textContent='· '+fmtN(save.cr)+' CR'; $('#crTxt').textContent=fmtN(save.cr)+' CR'; }
function addCR(n){ save.cr+=Math.round(n); persist(); updateRank(); }
function banner(a,b){ $('#bn1').textContent=a; $('#bn2').textContent=b||''; $('#banner').hidden=false; clearTimeout(banner.h); banner.h=setTimeout(()=>$('#banner').hidden=true,3200); }

/* ---------- PR-Stunts ---------- */
const starStr = n => '★'.repeat(n)+'☆'.repeat(3-n);
function stuntResult(s, val, label){ const st=s.stars.filter(t=>val>=t).length; const best=save.pr[s.id]; const rec=best==null||val>best;
  const cr=1000+st*1500; if(rec){ save.pr[s.id]=Math.round(val); persist(); } banner(s.name+' · '+label, starStr(st)+(rec?'  Neuer Rekord!':'  Rekord '+fmtN(best))+'  +'+fmtN(cr)+' CR');
  addXP(500+st*1000); addCR(cr); if(st) jingle(); else blip(660,.15); }
function stuntsUpdate(r, dt){
  for(const s of W.stunts){
    if(s.type==='trap'){ const rel=(r.x-s.p.x)*s.t.x+(r.z-s.p.z)*s.t.z, lat=Math.abs((r.x-s.p.x)*s.n.x+(r.z-s.p.z)*s.n.z);
      if(s.prev!=null && Math.sign(rel)!==Math.sign(s.prev) && lat<ROAD_W/2+4 && Math.abs(rel)<25){ const kmh=Math.abs(r.fwd)*3.6; stuntResult(s,kmh,Math.round(kmh)+' km/h'); } s.prev=rel; }
    else if(s.type==='drift'){ const inside=r.qRoad===s.roadObj && r.qd<ROAD_W && r.qi>=s.i0 && r.qi<=s.i1;
      if(!s.on && inside && r.qi-s.i0<15){ s.on=true; s.score=0; banner(s.name,'Drifte so viel du kannst!'); }
      if(s.on){ if(inside){ if(!r.air && Math.abs(r.lat)>3.2 && Math.abs(r.fwd)>9) s.score+=Math.abs(r.lat)*Math.abs(r.fwd)*dt*.9; }
        else { if(r.qRoad===s.roadObj && r.qi>s.i1-6) stuntResult(s,s.score,fmtN(s.score)+' Punkte'); else banner(s.name,'Abgebrochen'); s.on=false; } } }
    else if(s.type==='jump'){ const R=s.ramp;
      if(r.air && !s.jumping){ const d=Math.hypot(r.x-R.endX, r.z-R.endZ); if(d<9){ s.jumping=true; s.fx=r.x; s.fz=r.z; } }
      if(s.jumping && !r.air){ s.jumping=false; const dist=Math.hypot(r.x-s.fx, r.z-s.fz); if(dist>8) stuntResult(s,dist,Math.round(dist)+' m'); } }
  }
}

/* ---------- Zurückspulen ---------- */
const RW={ buf:[], on:false };
function rewindStep(r, want){
  const allowed = !(net.peer && r.inRace) && !(game.race && game.race.phase==='count' && r.inRace);
  if(want && allowed && RW.buf.length>2){ for(let k=0;k<2&&RW.buf.length>1;k++) RW.buf.pop(); const s=RW.buf[RW.buf.length-1];
    [r.x,r.y,r.z,r.h,r.vx,r.vy,r.vz,r.lap,r.ridx,r.half]=s; r.lastIdx=r.ridx; r.fwd=r.vx*Math.sin(r.h)+r.vz*Math.cos(r.h); r.lat=0; r.air=false; if(!RW.on){ RW.on=true; $('#gl').classList.add('rewind'); resetChain(); } return true; }
  if(RW.on){ RW.on=false; $('#gl').classList.remove('rewind'); }
  RW.buf.push([r.x,r.y,r.z,r.h,r.vx,r.vy,r.vz,r.lap,r.ridx,r.half]); if(RW.buf.length>600) RW.buf.shift();
  return false;
}

/* =====================================================================
   RENNEN
   ===================================================================== */
function gridSlot(road, k){ const p=road.pts[0], t=road.tan[0], n=road.nor[0]; const back=10+Math.floor(k/2)*8, side=(k%2?-1:1)*3.6; return { x:p.x-t.x*back+n.x*side, z:p.z-t.z*back+n.z*side, h:Math.atan2(t.x,t.z) }; }
function startEvent(evId){
  const ev=W.events.find(e=>e.id===evId); if(!ev) return;
  if(!isAuthority()){ if(net.host && net.host.open){ net.host.send({t:'req', ev:evId}); toast('Event beim Host angefragt …'); } return; }
  if(game.race){ toast('Es läuft bereits ein Rennen.'); return; }
  const road=ev.road, roadId=road.id, mode=ev.mode||'race'; const humans=game.racers.filter(r=>!r.bot);
  const nb=mode==='race' ? Math.max(net.peer?1:5, 6-humans.length) : 0;
  const bots=[]; for(let k=0;k<nb;k++) bots.push({ id:'rb'+k+'_'+Date.now()%10000, name:DRIVATARS[(k+5)%DRIVATARS.length], car:pick(CARS).id, paint:pick(PAINTS), bot:true, kind:'race', road:roadId });
  game.roster=game.roster.concat(bots); syncRacers(game.roster); sendRoster();
  const msg={ t:'race', road:roadId, laps:ev.laps, mode, name:ev.name, ev:evId, grid:[...bots.map(b=>b.id), ...humans.map(h=>h.id)] };
  bcast(msg); beginRace(msg);
}
function beginRace(msg){
  const road=W.byId[msg.road]; game.race={ road, laps:msg.laps, phase:'count', countT:3.99, t:0, grid:msg.grid, firstFin:null, mode:msg.mode||'race', name:msg.name||road.name, evId:msg.ev||road.id, drift:0 };
  msg.grid.forEach((id,k)=>{ const r=game.byId.get(id); if(!r) return; const s=gridSlot(road,k);
    r.x=s.x; r.z=s.z; r.h=s.h; r.y=surfaceAt(r.x,r.z)+.05; r.vx=r.vy=r.vz=0; r.fwd=r.lat=0; r.tx=r.x; r.ty=r.y; r.tz=r.z; r.th=r.h;
    r.inRace=true; r.lap=0; r.half=true; r.fin=false; r.ftime=0; r.ridx=loopIdx(r,road); r.lastIdx=r.ridx; if(r.ridx<road.N*.5){ r.lap=1; r.half=false; } if(r.sim && r.bot) r.road=road; });
  const me=game.me;
  if(me.inRace){ closePause(); closeMap(); $('#results').hidden=true; RW.buf.length=0; resetChain(); camState.init=false; banner(game.race.name, (game.race.mode==='drift'?'Drifte so viel du kannst · ':game.race.mode==='time'?'Gegen die Uhr · ':'')+msg.laps+(msg.laps>1?' Runden':' Runde')); }
  updateHudMode();
}
function lapLogic(r){
  const race=game.race, N=race.road.N; const prev=r.lastIdx!=null?r.lastIdx:r.ridx; r.ridx=loopIdx(r,race.road); const b=r.ridx; r.lastIdx=b;
  if(b>N*.45 && b<N*.6) r.half=true;
  if(prev>N*.85 && b<N*.15 && r.half){ r.half=false; r.lap++;
    if(r.lap>race.laps && !r.fin){ r.fin=true; r.ftime=race.t; if(r.local) onLocalFinish(); } }
}
const progress = r => r.lap*100000 + r.ridx + (r.fin ? 1e8 - r.ftime*100 : 0);
function raceRanking(){ return game.racers.filter(r=>r.inRace).sort((a,b)=>progress(b)-progress(a)); }
function onLocalFinish(){ const race=game.race, mode=race?race.mode:'race'; blip(880,.2); jingle(); let xp, cr, txt;
  if(mode==='drift'){ const sc=Math.round(race.drift), st=[15000,30000,50000].filter(t=>sc>=t).length, best=save.pr[race.evId]; if(best==null||sc>best) save.pr[race.evId]=sc; xp=2000+st*1500; cr=4000+sc*.25; txt=`${fmtN(sc)} Driftpunkte · ${starStr(st)}${best!=null&&sc<=best?' · Rekord '+fmtN(best):''}`; }
  else if(mode==='time'){ const t=game.me.ftime, best=save.pr[race.evId], rec=best==null||t<best; if(rec) save.pr[race.evId]=+t.toFixed(2); xp=3000; cr=rec?12000:6000; txt=`Zeit ${fmt(t)}${rec?' · Neuer Rekord!':' · Rekord '+fmt(best)}`; }
  else { const pos=raceRanking().indexOf(game.me)+1; xp=[0,6000,4000,3000][pos]||1500; cr=[0,25000,15000,10000][pos]||5000; if(pos===1) save.wins++; txt=`Platz ${pos}`; }
  persist(); addXP(xp); addCR(cr);
  $('#resXp').textContent=`${txt} · +${fmtN(xp)} XP · +${fmtN(Math.round(cr))} CR`; setTimeout(()=>{ if(game.me && game.me.fin && game.mode==='roam') showResults(); },1200); }
function showResults(){ $('#results').hidden=false; $('#resTitle').textContent=game.race?game.race.name:'Ergebnis'; renderResults(); updateTouchUI(); setTimeout(()=>{ if(lastInput!=='touch') $('#btnBack').focus(); },50); }
function renderResults(){ const list=raceRanking(); if(!list.length) return;
  $('#resTable').innerHTML=list.map((r,i)=>`<tr class="${r.local?'me':''}"><td>${i+1}</td><td><span class="dot" style="background:${r.paint}"></span>${esc(r.name)}${r.bot?' <span class="label">Drivatar</span>':''}</td><td style="text-align:right">${r.fin?fmt(r.ftime):'Runde '+clamp(r.lap,1,game.race?game.race.laps:1)}</td></tr>`).join(''); }
function leaveRaceLocal(){ const me=game.me; me.inRace=false; me.fin=false; $('#results').hidden=true; updateHudMode(); updateTouchUI(); }
function endRaceAll(){
  if(!game.race) return; const me=game.me;
  const keepResults = me.fin;
  if(me.inRace && !me.fin){ toast('Rennen beendet'); }
  game.racers.forEach(r=>{ r.inRace=false; r.fin=false; }); game.race=null; if(!keepResults) $('#results').hidden=true;
  if(isAuthority()){ game.roster=game.roster.filter(e=>e.kind!=='race'); syncRacers(game.roster); sendRoster(); if(net.peer) bcast({t:'raceEnd'}); }
  updateHudMode(); updateTouchUI();
}
function raceAuthorityCheck(dt){ const race=game.race; if(!race||race.phase!=='go') return;
  const humans=race.grid.map(id=>game.byId.get(id)).filter(r=>r && !r.bot);
  const done=humans.every(r=>r.fin || !r.inRace); if(humans.some(r=>r.fin) && race.firstFin==null) race.firstFin=race.t;
  if(done || !humans.length){ race.endT=(race.endT||0)+dt; if(race.endT>2.5) endRaceAll(); }
  else if(race.firstFin!=null && race.t-race.firstFin>60) endRaceAll(); }

/* =====================================================================
   KAMERA, TAGESZEIT
   ===================================================================== */
const camState={ init:false, h:0, pos:new THREE.Vector3(), tmp:new THREE.Vector3(), look:false, shake:0 };
function cycleCam(){ game.cam=(game.cam+1)%3; cfg.cam=game.cam; store.set('cam',game.cam); camState.init=false; }
function updateCamera(dt){
  const r=game.me; if(!r) return;
  if(game.mode==='intro'){ game.intro+=dt; const mt=musicTime(), t=mt!=null?mt:game.intro; return cineCamera(r,t,dt); }
  if(!camState.init){ camState.h=r.h; camState.init=true; camState.pos.set(0,0,0); }
  camState.h+=wrapA(r.h-camState.h)*Math.min(1,dt*5);
  const spd=Math.abs(r.fwd)/r.def.maxSpeed, look=camState.look;
  if(look!==camState.wasLook){ camState.wasLook=look; camState.pos.set(0,0,0); }
  camState.shake=Math.max(0,camState.shake-dt*2.2); const sk=camState.shake*.35+Math.max(0,spd-.75)*.05;
  const jx=(Math.random()-.5)*sk, jy=(Math.random()-.5)*sk;
  if(game.cam===2 && !look){ const s=Math.sin(r.h), c=Math.cos(r.h); camera.position.set(r.x+s*.6+jx*.3, r.y+1.25+jy*.3, r.z+c*.6); camera.lookAt(r.x+s*20, r.y+1.1, r.z+c*20); setFov(70+spd*12); return; }
  const h=look?r.h+Math.PI:camState.h, sh=Math.sin(h), ch=Math.cos(h);
  const far=game.cam===1; const back=(far?11:7.6)+spd*2.4, up=(far?4.4:2.9)+spd*.5;
  const want=camState.tmp.set(r.x-sh*back, r.y+up, r.z-ch*back);
  const gy=surfaceAt(want.x,want.z)+1.2; if(want.y<gy) want.y=gy;
  if(camState.pos.lengthSq()===0) camState.pos.copy(want); else camState.pos.lerp(want, 1-Math.exp(-dt*8));
  camera.position.copy(camState.pos); camera.position.x+=jx; camera.position.y+=jy;
  camera.lookAt(r.x+sh*5, r.y+1.2, r.z+ch*5);
  setFov(62+spd*15);
}
function setFov(v){ const f=fitFov(v,camera.aspect); if(Math.abs(camera.fov-f)>.1){ camera.fov=f; camera.updateProjectionMatrix(); } }
let todAcc=0;
function todPhase(){ if(cfg.tod==='day') return .1; if(cfg.tod==='dusk') return .365; if(cfg.tod==='night') return .55; return (performance.now()/1000/720+.08)%1; }
function applyTod(force){
  if(!W) return; const hq=HQ(), p=todPhase();
  const al=2*Math.PI*(p-.38)+Math.PI+.1674, e=Math.sin(al)*.9+.15;
  W.sunDir.set(Math.cos(al), e, -.45).normalize();
  const day=sstep(-.06,.2,e), night=1-sstep(-.2,0,e), dusk=Math.exp(-(((e-.03)/.13)**2));
  W.night=night;
  const fc=_c1.set('#0a1120').lerp(_c2.set('#a9c6e2'), day).lerp(_c3.set('#e9a47c'), dusk*.75); if(hq) fc.convertSRGBToLinear();
  W.scene.fog.color.copy(fc); if(!W.sky) W.scene.background.copy(fc);
  if(e>-.03){ W.lightDir.copy(W.sunDir); const sc=_c1.set('#ff9c55').lerp(_c2.set('#fff3e3'), sstep(0,.4,e)); if(hq) sc.convertSRGBToLinear(); W.sun.color.copy(sc); W.sun.intensity=(hq?2.6:1)*sstep(-.03,.12,e); }
  else { W.lightDir.set(-W.sunDir.x*.6, .75, -W.sunDir.z*.6+.3).normalize(); const mc=_c1.set('#8fa8ff'); if(hq) mc.convertSRGBToLinear(); W.sun.color.copy(mc); W.sun.intensity=(hq?.32:.22)*night; }
  const hs=_c1.set('#26324f').lerp(_c2.set('#cfe1ff'), day).lerp(_c3.set('#ffc19a'), dusk*.5); if(hq) hs.convertSRGBToLinear(); W.hemi.color.copy(hs);
  const hg=_c1.set('#1b2018').lerp(_c2.set('#56653f'), day); if(hq) hg.convertSRGBToLinear(); W.hemi.groundColor.copy(hg);
  W.hemi.intensity = hq ? .22+.3*day+.12*night : .3+.65*day;
  if(W.sky){ const U=W.sky.material.uniforms; U.sunPosition.value.copy(W.sunDir);
    if(W.envScene && (force || Math.abs(p-W.envP)>.006)){ W.envP=p; const rt=W.pmrem.fromScene(W.envScene,0,.1,200); if(W.envRT) W.envRT.dispose(); W.envRT=rt; W.scene.environment=rt.texture; } }
  if(hq) renderer.toneMappingExposure=.8+night*.6;
  W.mats.win.emissiveIntensity=night*1.4; if(W.mats.shop) W.mats.shop.emissiveIntensity=night*.7;
  if(W.lampMat){ const lc=_c1.set('#ffd59a'); if(hq) lc.convertSRGBToLinear(); W.lampMat.color.copy(lc).multiplyScalar(.3+night*2.4); }
  if(W.neonMat) W.neonMat.color.setScalar(.85+night*1.5);
  if(W.fujiMat){ const t=_c1.set('#0e1424').lerp(_c2.set('#ffffff'), day).lerp(_c3.set('#ffb48a'), dusk*.5); if(hq) t.convertSRGBToLinear(); W.fujiMat.color.copy(t); }
  if(W.clouds){ const t=_c1.set('#1a2236').lerp(_c2.set('#ffffff'), day).lerp(_c3.set('#ff9e7a'), dusk*.7); if(hq) t.convertSRGBToLinear(); W.clouds.material.uniforms.uTint.value.copy(t); }
  if(W.stars) W.stars.material.uniforms.uTint.value.setScalar(night*1.2);
  if(W.grass) W.grass.material.uniforms.uLight.value.copy(W.sun.color).multiplyScalar(W.sun.intensity*(hq?.3:1)).add(_c1.copy(W.hemi.color).multiplyScalar(W.hemi.intensity*1.3));
  if(M && M.head) M.head.emissiveIntensity=.9+night*2.6;
}
