"use strict";
/* =====================================================================
   NETZWERK (PeerJS, Stern-Topologie über den Host)
   ===================================================================== */
function genCode(){ const a='ABCDEFGHJKLMNPQRSTUVWXYZ'; let s=''; for(let i=0;i<4;i++) s+=a[Math.random()*a.length|0]; return s; }
function bcast(m){ for(const c of net.conns.values()) if(c.open) try{ c.send(m); }catch(e){} }
function sendRoster(){ if(net.isHost) bcast({t:'roster', list:game.roster}); }
function hostGame(attempt=0){
  if(typeof Peer==='undefined') return toast('PeerJS konnte nicht geladen werden.');
  leaveNet(); net.code=genCode(); net.isHost=true; net.myId='host';
  const p=net.peer=new Peer(PREFIX+net.code);
  p.on('open', ()=>enterWorld());
  p.on('connection', c=>{ c.on('open',()=>net.conns.set(c.peer,c)); c.on('data',d=>hostOnData(c,d)); c.on('close',()=>dropPlayer(c.peer)); });
  p.on('error', e=>{ if(e.type==='unavailable-id' && attempt<3) return hostGame(attempt+1); toast('Netzwerkfehler: '+e.type); });
  p.on('disconnected', ()=>{ try{ p.reconnect(); }catch(_){} });
}
function hostOnData(c,d){
  if(!d||!d.t||!W) return;
  if(d.t==='hello'||d.t==='pick'){ let e=game.roster.find(x=>x.id===c.peer); const isNew=!e; if(!e){ e={id:c.peer}; game.roster.push(e); }
    e.name=String(d.name||'Gast').slice(0,14); e.car=carById(d.car).id; e.paint=/^#[0-9a-f]{6}$/i.test(d.paint)?d.paint:carById(e.car).paint;
    syncRacers(game.roster); sendRoster(); if(isNew) toast(e.name+' ist dem Festival beigetreten'); }
  else if(d.t==='s'){ applyState(c.peer, d.d); }
  else if(d.t==='req'){ if(W.events.some(e=>e.id===d.ev)) startEvent(d.ev); }
}
function dropPlayer(id){ net.conns.delete(id); const e=game.roster.find(x=>x.id===id); game.roster=game.roster.filter(x=>x.id!==id); if(W){ syncRacers(game.roster); sendRoster(); } if(e) toast(e.name+' hat das Festival verlassen'); }
function joinGame(code){
  if(typeof Peer==='undefined') return toast('PeerJS konnte nicht geladen werden.');
  code=code.trim().toUpperCase(); if(code.length!==4) return toast('Bitte einen 4-stelligen Code eingeben.');
  leaveNet(); net.isHost=false; net.code=code; toast('Verbinde mit Raum '+code+' …');
  const p=net.peer=new Peer();
  p.on('open', id=>{ net.myId=id; const c=net.host=p.connect(PREFIX+code,{reliable:true});
    c.on('open', ()=>c.send({t:'hello', ...myEntry()}));
    c.on('data', clientOnData);
    c.on('close', ()=>{ if(net.peer){ toast('Verbindung zum Host getrennt.'); leaveWorld(); } }); });
  p.on('error', e=>{ toast(e.type==='peer-unavailable'?'Raum '+code+' nicht gefunden.':'Netzwerkfehler: '+e.type); if(e.type==='peer-unavailable') leaveNet(); });
}
function clientOnData(d){
  if(!d||!d.t) return;
  if(d.t==='roster'){ if(game.mode==='menu'){ enterWorld(); setTimeout(()=>clientOnData(d),80); return; } if(!W||!game.me) return setTimeout(()=>clientOnData(d),80); game.roster=d.list; syncRacers(d.list); }
  else if(d.t==='ss'){ if(!W||!game.me) return; for(const s of d.s) if(s[0]!==net.myId) applyState(s[0], s.slice(1)); }
  else if(d.t==='race'){ if(!W||!game.me) return; beginRace(d); }
  else if(d.t==='raceEnd'){ endRaceAll(); }
}
function packState(r){ return [+r.x.toFixed(2),+r.y.toFixed(2),+r.z.toFixed(2),+r.h.toFixed(3),+r.fwd.toFixed(1),+(r.lat||0).toFixed(1),r.lap,r.ridx,r.fin?1:0,+r.ftime.toFixed(2),r.inRace?1:0]; }
function applyState(id,a){ const r=game.byId.get(id); if(!r||r.sim) return;
  if(!r.seen){ r.x=a[0]; r.y=a[1]; r.z=a[2]; r.h=a[3]; r.seen=true; r.mesh.visible=true; }
  r.tx=a[0]; r.ty=a[1]; r.tz=a[2]; r.th=a[3]; r.fwd=a[4]; r.lat=a[5]; r.lap=a[6]; r.ridx=a[7]; r.fin=!!a[8]; r.ftime=a[9]; r.inRace=!!a[10];
  r.vx=Math.sin(r.h)*r.fwd; r.vz=Math.cos(r.h)*r.fwd; }
function netTick(){ if(!net.peer||!game.me) return;
  if(net.isHost) bcast({t:'ss', s:game.racers.filter(r=>r.sim||r.seen).map(r=>[r.id,...packState(r)])});
  else if(net.host && net.host.open) net.host.send({t:'s', d:packState(game.me)}); }
function leaveNet(){ const p=net.peer; net.peer=null; net.conns.clear(); net.host=null; net.isHost=false; net.myId='me'; if(p) try{ p.destroy(); }catch(_){} }
