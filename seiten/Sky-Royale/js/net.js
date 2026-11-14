// Multiplayer über PeerJS – der Host rechnet die Runde (Bots, Sturm, Schaden, Loot),
// Clients steuern ihre eigene Figur und schicken Eingaben/Positionen.
import * as THREE from 'three';
import { G, emit } from './state.js';
import { createActor, eliminate, damage, feedText, removeActor, setPlace } from './actors.js';
import { spawnLoot, removeLoot, openChest, takeItem, pickupSound } from './loot.js';
import { setHeldModel } from './models.js';
import { remoteShots, visualShots, remoteMelee, remoteThrow, visualThrow, addPad, breakObject } from './combat.js';
import { wobbleObject, destroyObject } from './world.js';
import { startBusWith, thankDriver as thankDriverRemote } from './bus.js';
import { enterCar, exitCar, placeCar, freeSeat, setSeat, clearSeat } from './cars.js';
import { matesOf } from './actors.js';
import { createItem } from './items.js';
import { explosion, shockRing } from './effects.js';
import { sfx } from './audio.js';

export const NET = { role: 'solo', peer: null, conns: [], host: null, name: 'Spieler', code: '', snapT: 0, sendT: 0, started: false, lastData: 0, rtt: 0, pingT: 0 };
export const isClient = () => NET.role === 'client';
export const isHost = () => NET.role === 'host';
export const isMP = () => NET.role !== 'solo';

const STATES = ['ground', 'air', 'skydive', 'glide', 'launch', 'grapple', 'swim', 'bus', 'dead', 'car'];
const r2 = x => Math.round(x * 100) / 100;
const v3 = v => [r2(v.x), r2(v.y), r2(v.z)];
const V = a => new THREE.Vector3(a[0], a[1], a[2]);
const byId = id => G.actors.find(a => a.id === id);

// ---------------- Lobby ----------------
// Öffentliche Lobbys: feste Peer-ID pro Modus. Wer die ID zuerst belegt, ist Host – alle anderen verbinden sich dorthin.
const NETVER = 12, MAXC = 11;
const pubId = mode => `skyroyale-rdg-v${NETVER}-${mode}`;
function newPeer(id) {
  if (!window.Peer) throw new Error('PeerJS konnte nicht geladen werden');
  const cfg = Object.assign({ debug: 1 }, window.PEER_CONFIG || {});   // PEER_CONFIG: optional eigener PeerJS-Server
  return id ? new window.Peer(id, cfg) : new window.Peer(cfg);
}

// Host: eingehende Verbindungen annehmen (öffentlich und privat gleich)
function setupHost(peer, onChange) {
  peer.on('disconnected', () => { if (NET.peer === peer && !peer.destroyed) try { peer.reconnect(); } catch (e) {} });
  peer.on('connection', conn => {
    const entry = { conn, name: 'Spieler', actor: null };
    conn.on('data', d => {
      if (NET.peer !== peer) return;
      if (d.t === 'hello') {
        if (d.v !== NETVER) { conn.send({ t: 'full', why: 'Andere Spielversion – bitte Seite neu laden (Strg+F5)' }); setTimeout(() => conn.close(), 300); return; }
        if (NET.conns.length >= MAXC) { conn.send({ t: 'full', why: 'Lobby ist voll' }); setTimeout(() => conn.close(), 300); return; }
        entry.name = String(d.name || 'Spieler').slice(0, 16);
        NET.conns.push(entry);
        if (G.player && G.phase !== 'menu') emit('lateJoin', entry);     // Runde läuft schon: Wartebereich oder Zuschauer
        else { lobbyBroadcast(); onChange(); }
        return;
      }
      hostHandle(entry, d);
    });
    conn.on('close', () => {
      if (NET.peer !== peer) return;
      const i = NET.conns.indexOf(entry); if (i >= 0) NET.conns.splice(i, 1);
      if (entry.actor) emit('netLeave', entry.actor);
      if (!G.player || G.phase === 'menu') { lobbyBroadcast(); onChange(); }
    });
  });
}

// Privat: Lobby mit Code
export function hostLobby(name, mode, onChange) {
  NET.role = 'host'; NET.name = name; NET.mode = mode; NET.public = null;
  NET.code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join('');
  const peer = NET.peer = newPeer('skyroyale-' + NET.code.toLowerCase());
  peer.on('open', () => onChange());
  peer.on('error', e => onChange(e.type === 'unavailable-id' ? 'Code schon vergeben – bitte nochmal' : 'Verbindungsfehler: ' + e.type));
  setupHost(peer, onChange);
}
function lobbyBroadcast() { broadcast({ t: 'lobby', names: [NET.name, ...NET.conns.map(c => c.name)] }); }
export const lobbyNames = () => [NET.name, ...NET.conns.map(c => c.name)];

export function joinLobby(code, name, onChange) {
  NET.public = null;
  connectTo('skyroyale-' + code.trim().toLowerCase(), name, onChange);
}
function connectTo(id, name, onChange) {
  NET.role = 'client'; NET.name = name; NET.lastData = 0; NET.lostSent = false;
  const peer = NET.peer = newPeer();
  peer.on('error', e => { if (NET.peer === peer) onChange('Verbindungsfehler: ' + (e.type === 'peer-unavailable' ? 'Lobby nicht gefunden' : e.type), e.type); });
  peer.on('open', () => {
    const conn = NET.host = peer.connect(id, { reliable: true, serialization: 'json' });
    conn.on('open', () => conn.send({ t: 'hello', name, v: NETVER }));
    conn.on('data', d => { if (NET.peer === peer) clientHandle(d, onChange); });
    conn.on('close', () => { if (NET.peer === peer) emit('netLost'); });
  });
}

// Öffentliche Warteschlange: Host werden oder beitreten
export function queuePublic(mode, name, onChange) {
  NET.public = mode; NET.mode = mode; NET.name = name;
  let peer;
  try { peer = NET.peer = newPeer(pubId(mode)); } catch (e) { onChange(e.message, 'fatal'); return; }
  peer.on('open', () => {
    if (NET.peer !== peer) return;
    NET.role = 'host';
    setupHost(peer, () => {});
    emit('pubHost');
  });
  peer.on('error', e => {
    if (NET.peer !== peer) return;
    if (e.type === 'unavailable-id') {          // Lobby gibt es schon -> beitreten
      peer.destroy();
      connectTo(pubId(mode), name, onChange);
    } else if (NET.role !== 'host') onChange('Verbindungsfehler: ' + e.type, 'fatal');
  });
}

// Verbindung komplett trennen (Hauptmenü)
export function leaveNet() {
  const p = NET.peer;
  Object.assign(NET, { role: 'solo', peer: null, conns: [], host: null, started: false, lobby: null, public: null, lastData: 0, lostSent: false });
  if (p) try { p.destroy(); } catch (e) {}
}

export function broadcast(msg, except) { for (const c of NET.conns) if (c !== except && c.conn.open) c.conn.send(msg); }
function toActor(a, msg) { if (a && a.conn && a.conn.open) a.conn.send(msg); }
export function toHost(msg) { if (NET.host && NET.host.open) NET.host.send(msg); }

// ---------------- Rundenstart ----------------
// Host: Remote-Akteure anlegen (vor den Bots)
export function createRemoteActors() {
  for (const c of NET.conns) {
    const a = createActor(c.name, false, G.actors.length);
    a.isRemote = true; a.conn = c.conn; c.actor = a;
  }
}
const actorInfo = a => ({ id: a.id, name: a.name, look: a.look, bot: a.isBot, p: v3(a.pos), team: a.team, w: a.wait ? 1 : 0, al: a.alive ? 1 : 0 });
export function sendStart() {
  NET.started = true;
  for (const c of NET.conns) if (c.actor) sendStartTo(c);
}
// Startnachricht inkl. aktuellem Weltzustand (für Nachzügler)
export function sendStartTo(c, spec) {
  const sync = {
    chests: G.chests.map((x, i) => x.opened ? i : -1).filter(i => i >= 0),
    objs: G.objects.filter(o => !o.alive || o.hp < o.max).map(o => [o.id, Math.round(o.hp), o.alive ? 0 : 1]),
    loot: G.loot.map(l => [l.id, l.item, v3(l.pos)]),
    pads: G.pads.map(p => [v3(p.pos), p.yaw || 0]),
    bus: G.bus && !G.bus.done ? { s: v3(G.bus.start), e: v3(G.bus.end), d: v3(G.bus.dir), t: G.bus.t } : null,
  };
  c.conn.send({ t: 'start', you: c.actor.id, actors: G.actors.map(actorInfo), pt: G.phaseT, ph: G.phase, mode: G.mode, spec: spec ? 1 : 0, sync });
}
export const netActorAdd = (a, except) => { if (isHost()) broadcast({ t: 'actor+', a: actorInfo(a) }, except); };
export const netActorRemove = a => { if (isHost()) broadcast({ t: 'actor-', id: a.id }); };

// ---------------- Host: Nachrichten der Clients ----------------
function hostHandle(entry, d) {
  entry.lastData = performance.now();
  if (d.t === 'ping') { entry.conn.send({ t: 'pong', ts: d.ts }); entry.rtt = d.rtt || 0; return; }
  const a = entry.actor; if (!a) return;
  switch (d.t) {
    case 'requeue': emit('requeue', a); break;
    case 'mark': forwardPing(a, V(d.p)); break;
    case 'unmark': forwardUnping(a); break;
    case 'thank': if (a.state === 'bus') { a.thanked = false; thankDriverRemote(a); } break;
    case 'st': {
      if (!a.alive) return;
      if (G.bus && G.bus.driver === a && typeof d.bs === 'number') G.bus.steer = Math.max(-1, Math.min(1, d.bs));
      a.netPos = V(d.p); a.netYaw = d.y; a.netPitch = d.pi;
      a.vel.set(d.v[0], d.v[1], d.v[2]);
      const ns = d.s;
      if (a.state === 'bus' && ns === 'bus') return;
      if (a.state === 'bus' && ns !== 'bus') { a.pos.copy(a.netPos); a.model.visible = true; }
      a.state = ns; a.crouch = !!d.c; a.slideT = d.sl ? 1 : 0; a.diving = !!d.dv; a.emoteT = d.em ? 1 : 0; a.emoteStyle = d.em ? d.em - 1 : 0; a.lean = !!d.ln;
      setHeld(a, d.h);
      if (d.car) {
        const car = G.cars[d.car.id];
        if (car && car.driver === a) applyCar(car, d.car.p, d.car.y, d.car.pi, d.car.ro, d.car.sp, true);
      }
      break;
    }
    case 'fire': remoteShots(a, V(d.o), d.d.map(V), d.k, d.r); broadcast({ t: 'shot', id: a.id, o: d.o, d: d.d, k: d.k }, entry); break;
    case 'melee': remoteMelee(a, V(d.o), V(d.d)); break;
    case 'throw': remoteThrow(a, d.k, V(d.p), V(d.v)); broadcast({ t: 'throwV', k: d.k, p: d.p, v: d.v }, entry); break;
    case 'pad': addPad(V(d.p), d.y); broadcast({ t: 'pad', p: d.p, y: d.y }); break;
    case 'open': { const c = G.chests[d.i]; if (c && !c.opened && c.pos.distanceTo(a.pos) < 5) openChest(c, a); break; }
    case 'pick': {
      const l = G.loot.find(x => x.id === d.id);
      if (!l || l.pos.distanceTo(a.pos) > 5) { entry.conn.send({ t: 'deny', id: d.id }); return; }
      removeLoot(l);
      entry.conn.send({ t: 'grant', id: d.id, item: l.item });
      break;
    }
    case 'drop': spawnLoot(d.item, V(d.p), true); break;
    case 'dropAll': for (const it of d.items) spawnLoot(it, V(d.p), true); break;
    case 'vit': a.hp = Math.min(100, d.hp); a.shield = Math.min(100, d.sh); break;
    case 'selfdmg': damage(a, d.a, null, { ignoreShield: true, cause: d.c }); break;
    case 'car': {
      const car = G.cars[d.id]; if (!car) return;
      const seat = freeSeat(car);
      if (d.on && seat >= 0 && a.alive && !a.car) { enterCar(a, car, seat); entry.conn.send({ t: 'carOk', id: d.id, seat }); }
      else if (!d.on && a.car === car) clearSeat(a);
      break;
    }
  }
}

function applyCar(car, p, y, pi, ro, sp, snap) {
  car.netPos = V(p); car.netYaw = y; car.pitch = pi; car.roll = ro; car.speed = sp;
  if (snap) { car.pos.copy(car.netPos); car.yaw = y; placeCar(car); }
}

// ---------------- Host → alle (von anderen Modulen aufgerufen) ----------------
export const net = {
  shot(a, o, dirs, k) { if (isHost()) broadcast({ t: 'shot', id: a.id, o: v3(o), d: dirs.map(v3), k }); },
  lootAdd(l) { if (isHost()) broadcast({ t: 'loot+', id: l.id, item: l.item, p: v3(l.pos), f: l.t < 1 ? v3(l.from) : null }); },
  lootRemove(l) { if (isHost()) broadcast({ t: 'loot-', id: l.id }); },
  chest(c) { if (isHost()) broadcast({ t: 'chest', i: G.chests.indexOf(c) }); },
  boom(p, r, kind) { if (isHost()) broadcast({ t: 'boom', p: v3(p), r, k: kind }); },
  throwV(k, p, v, except) { if (isHost()) broadcast({ t: 'throwV', k, p: v3(p), v: v3(v) }); },
  pad(p, y) { if (isHost()) broadcast({ t: 'pad', p: v3(p), y }); },
  elim(t, killer, cause) { if (isHost()) broadcast({ t: 'elim', v: t.id, k: killer ? killer.id : 0, c: cause || '', pl: t.place, w: t.wait || G.phase === 'warmup' ? 1 : 0 }); },
  feed(txt, a, own) { if (!isHost()) return; for (const c of NET.conns) if (c.conn.open) c.conn.send({ t: 'feed', txt: c.actor === a && own ? own : txt, me: c.actor === a ? 1 : 0 }); },
  wheel(a) { if (isHost() && a.isRemote) toActor(a, { t: 'wheel' }); },
  died(t) { if (isHost() && t.isRemote) toActor(t, { t: 'died' }); },
  dealt(att, e) { if (isHost() && att.isRemote) toActor(att, { t: 'dealt', id: e.target.id, a: e.amount, h: e.head, s: e.shield, p: e.pos ? v3(e.pos) : null }); },
  knock(a, vel) { if (isHost() && a.isRemote) toActor(a, { t: 'knock', v: v3(vel) }); },
  respawn(a) { if (isHost() && a.isRemote) toActor(a, { t: 'respawn', p: v3(a.pos), y: a.yaw }); },
  bus(b) { if (isHost()) broadcast({ t: 'bus', s: v3(b.start), e: v3(b.end), d: v3(b.dir) }); },
  end(w) { if (isHost()) broadcast({ t: 'end', w: w ? w.id : 0 }); },
  obj(o) { if (isHost()) broadcast({ t: 'obj', id: o.id, hp: Math.max(0, Math.round(o.hp)), gone: o.alive ? 0 : 1 }); },
  objHitFor(a, o) { if (isHost()) toActor(a, { t: 'objHit', id: o.id }); },
};

// ---------------- Client → Host ----------------
export const req = {
  fire(o, dirs, k, r) { toHost({ t: 'fire', o: v3(o), d: dirs.map(v3), k, r }); },
  melee(o, d) { toHost({ t: 'melee', o: v3(o), d: v3(d) }); },
  throw(k, p, v) { toHost({ t: 'throw', k, p: v3(p), v: v3(v) }); },
  pad(p, y) { toHost({ t: 'pad', p: v3(p), y }); },
  open(c) { toHost({ t: 'open', i: G.chests.indexOf(c) }); },
  pick(l) { if (l.pending) return; l.pending = true; toHost({ t: 'pick', id: l.id }); },
  drop(item, p) { toHost({ t: 'drop', item, p: v3(p) }); },
  vitals(a) { toHost({ t: 'vit', hp: a.hp, sh: a.shield }); },
  selfDamage(amount, cause) { toHost({ t: 'selfdmg', a: amount, c: cause }); },
  thank() { toHost({ t: 'thank' }); },
  requeue() { toHost({ t: 'requeue' }); },
};

// Pings: eigene immer sichtbar, in Teams auch bei allen Teamkameraden
export function setPing(a, pos) {
  G.pings = G.pings.filter(p => p.owner !== a.id);
  G.pings.push({ pos, t: G.time, owner: a.id, mate: a !== G.player });
  if (!isClient()) (G.marks || (G.marks = {}))[a.id] = { pos, t: G.time };     // für Bot-Teamkameraden
}
export function placePing(a, pos) {
  // Nochmal genau auf den eigenen Ping zielen = Ping entfernen
  const own = G.pings.find(p => p.owner === a.id);
  if (own && own.pos.distanceTo(pos) < 2.5) { removePing(a); return false; }
  setPing(a, pos);
  if (!matesOf(a).length) return true;
  if (isClient()) toHost({ t: 'mark', p: v3(pos) }); else forwardPing(a, pos);
  return true;
}
// Eigenen Ping entfernen (auch bei den Teamkameraden)
export function removePing(a) {
  G.pings = G.pings.filter(p => p.owner !== a.id);
  if (!matesOf(a).length) return;
  if (isClient()) toHost({ t: 'unmark' }); else forwardUnping(a);
}
function forwardUnping(a) {
  if (G.marks) delete G.marks[a.id];
  for (const m of matesOf(a)) {
    if (m === G.player) G.pings = G.pings.filter(p => p.owner !== a.id);
    else if (m.isRemote) toActor(m, { t: 'unmark', id: a.id });
  }
}
function forwardPing(a, pos) {
  if (a !== G.player) G.marks = Object.assign(G.marks || {}, { [a.id]: { pos, t: G.time } });
  for (const m of matesOf(a)) {
    if (m === G.player) { setPing(a, pos); sfx('ping', 0, { vol: 0.7, rate: 0.9 }); }
    else if (m.isRemote) toActor(m, { t: 'mark', id: a.id, p: v3(pos) });
  }
}

// Auto ein-/aussteigen (lokal oder per Anfrage)
export function requestCar(a, car) {
  if (isClient()) toHost({ t: 'car', id: car.id, on: true });
  else { enterCar(a, car); }
}
export function leaveCar(a) {
  const id = a.car ? a.car.id : -1;
  exitCar(a);
  if (isClient()) toHost({ t: 'car', id, on: false });
}

// Client: Figur eines anderen Spielers/Bots anlegen
export function makePuppet(r) {
  const a = createActor(r.name, r.bot, r.look, r.id);
  a.pos.set(r.p[0], r.p[1], r.p[2]);
  a.isPuppet = true; a.netPos = a.pos.clone(); a.netYaw = 0; a.netPitch = 0;
  a.team = r.team; a.wait = !!r.w;
  return a;
}
// Client: Weltzustand eines laufenden Spiels übernehmen
export function applySync(s) {
  if (!s) return;
  for (const i of s.chests) { const c = G.chests[i]; if (c && !c.opened) openChest(c, null); }
  for (const [id, hp, gone] of s.objs) { const o = G.objects[id]; if (!o) continue; o.hp = hp; if (gone && o.alive) destroyObject(o); }
  for (const [id, item, p] of s.loot) spawnLoot(item, V(p), false, null, { id, from: null });
  for (const [p, y] of s.pads) addPad(V(p), y);
  if (s.bus) { startBusWith(V(s.bus.s), V(s.bus.e), V(s.bus.d)); G.bus.t = s.bus.t; }
}

// ---------------- Client: Nachrichten vom Host ----------------
function clientHandle(d, onChange) {
  NET.lastData = performance.now();
  switch (d.t) {
    case 'pong': NET.rtt = performance.now() - d.ts; break;
    case 'lobby': NET.lobby = d.names; onChange(); break;
    case 'full': onChange(d.why || 'Lobby ist voll', 'full'); break;
    case 'actor+': { if (byId(d.a.id)) break; const a = makePuppet(d.a); a.alive = !!d.a.al; a.model.visible = a.alive; break; }
    case 'actor-': { const a = byId(d.id); if (a && a !== G.player) { removeActor(a); if (G.spectate === a) G.spectate = null; } break; }
    case 'feed': emit('feed', d.txt, !!d.me); break;
    case 'mark': { const o = byId(d.id); if (o) { setPing(o, V(d.p)); sfx('ping', 0, { vol: 0.7, rate: 0.9 }); } break; }
    case 'unmark': G.pings = G.pings.filter(p => p.owner !== d.id); break;
    case 'wheel': if (G.bus) { G.bus.driver = G.player; emit('wheel'); } break;
    case 'start': emit('netStart', d); break;
    case 'snap': applySnap(d); break;
    case 'shot': { const a = byId(d.id); if (a) visualShots(a, V(d.o), d.d.map(V), d.k); break; }
    case 'throwV': visualThrow(d.k, V(d.p), V(d.v)); break;
    case 'loot+': spawnLoot(d.item, V(d.p), false, null, { id: d.id, from: d.f ? V(d.f) : null }); break;
    case 'loot-': { const l = G.loot.find(x => x.id === d.id); if (l) removeLoot(l); break; }
    case 'chest': { const c = G.chests[d.i]; if (c) openChest(c, null); break; }
    case 'boom': if (d.k === 'shock') shockRing(V(d.p), d.r); else explosion(V(d.p), d.r); sfx('boom', V(d.p).distanceTo(G.camera.position) + (d.k === 'shock' ? 30 : 0)); break;
    case 'pad': addPad(V(d.p), d.y); break;
    case 'grant': {
      const rest = takeItem(G.player, d.item);
      if (rest) req.drop(rest, G.player.pos);
      sfx(pickupSound(d.item)); break;
    }
    case 'deny': { const l = G.loot.find(x => x.id === d.id); if (l) l.pending = false; break; }
    case 'dealt': { const t = byId(d.id); if (t) emit('dealt', { target: t, amount: d.a, head: d.h, shield: d.s, pos: d.p ? V(d.p) : null }); break; }
    case 'knock': { const a = G.player; a.vel.copy(V(d.v)); a.state = 'launch'; a.fallImmune = true; a.onGround = false; a.pos.y += 0.3; break; }
    case 'elim': {
      const t = byId(d.v), k = d.k ? byId(d.k) : null; if (!t) return;
      emit('elimFx', t.pos.clone()); t.alive = false; t.state = 'dead'; t.model.visible = false; setPlace(t, d.pl); t.netPos = null; t.hp = 0; t.shield = 0;
      if (t.car) clearSeat(t);
      emit('feed', feedText(t, k, d.c), t === G.player || k === G.player);
      if (k === G.player) { sfx('elim'); emit('kill', t, (k.kills || 0) + 1); }
      if (G.phase !== 'warmup' && !d.w) emit('eliminated', t, k);
      break;
    }
    case 'died': {
      const a = G.player, items = [];
      for (let s = 1; s <= 5; s++) if (a.inv[s]) { items.push(a.inv[s]); a.inv[s] = null; }
      for (const k in a.ammo) if (a.ammo[k] > 0) { items.push({ ammo: k, amount: a.ammo[k] }); a.ammo[k] = 0; }
      toHost({ t: 'dropAll', items, p: v3(a.pos) });
      break;
    }
    case 'respawn': emit('respawnLocal', V(d.p), d.y); break;
    case 'bus': startBusWith(V(d.s), V(d.e), V(d.d)); emit('clientBus'); break;
    case 'carOk': { const car = G.cars[d.id]; if (car && !G.player.car) enterCar(G.player, car, d.seat || 0); break; }
    case 'end': emit('netEnd', d.w); break;
    case 'obj': { const o = G.objects[d.id]; if (!o) break; o.hp = d.hp; if (d.gone && o.alive) breakObject(o); else if (!d.gone) wobbleObject(o); break; }
    case 'objHit': { const o = G.objects[d.id]; if (o) emit('objHit', o); break; }
  }
}

let lastHp = 100;
function applySnap(d) {
  if (d.ph !== G.phase && G.phase !== 'loading') { const old = G.phase; G.phase = d.ph; emit('phase', d.ph, old); }
  G.phaseT = d.pt;
  for (const r of d.a) {
    const a = byId(r[0]); if (!a) continue;
    const alive = !!r[9];
    a.kills = r[10]; a.team = r[17]; a.wait = !!r[18];
    if (a === G.player) {
      if (a.alive && alive) {
        if (r[7] + r[8] < lastHp + 0 && r[7] + r[8] < a.hp + a.shield - 0.5) emit('hurt', {});
        a.hp = r[7]; a.shield = r[8];
      }
      lastHp = a.hp + a.shield;
      continue;
    }
    if (!alive) { if (a.alive && G.phase !== 'warmup') { a.alive = false; a.model.visible = false; } a.alive = alive; continue; }
    if (!a.alive) { a.alive = true; a.pos.set(r[1], r[2], r[3]); }
    a.netPos = new THREE.Vector3(r[1], r[2], r[3]); a.netYaw = r[4]; a.netPitch = r[5];
    a.state = STATES[r[6]] || 'ground'; a.hp = r[7]; a.shield = r[8];
    a.crouch = !!(r[11] & 1); a.slideT = r[11] & 2 ? 1 : 0; a.diving = !!(r[11] & 4); a.emoteT = r[11] & 8 ? 1 : 0; a.emoteStyle = (r[11] >> 6) & 7; a.lean = !!(r[11] & 32);
    setHeld(a, r[12] ? [r[12], r[13]] : null);
    a.vel.set(r[14], 0, r[15]);
    const car = r[16] >= 0 ? G.cars[r[16]] : null;
    if (car) { if (a.car && a.car !== car) clearSeat(a); setSeat(car, a, r[19] || 0); } else if (a.car) clearSeat(a);
  }
  if (d.st) {
    const s = G.storm, q = d.st;
    s.active = !!q[0]; s.cx = q[1]; s.cz = q[2]; s.r = q[3]; s.nx = q[4]; s.nz = q[5]; s.nr = q[6]; s.phase = q[7]; s.shrinking = !!q[8]; s.t = q[9];
  }
  if (d.bt !== undefined && G.bus) G.bus.t = d.bt;
  if (d.bd && G.bus) { const b = G.bus; b.driver = byId(d.bd[5]) || b.driver; b.netPos = new THREE.Vector3(d.bd[0], d.bd[1], d.bd[2]); b.netYaw = d.bd[3]; if (b.driver !== G.player) b.steer = d.bd[4]; }
  if (d.c) for (const q of d.c) {
    const car = G.cars[q[0]]; if (!car || car.driver === G.player) continue;
    car.netPos = new THREE.Vector3(q[1], q[2], q[3]); car.netYaw = q[4]; car.pitch = q[5]; car.roll = q[6]; car.speed = q[7];
    const drv = q[8] ? byId(q[8]) : null;
    if (!drv && car.driver && car.driver !== G.player) { if (car.driver.car === car) clearSeat(car.driver); else car.driver = null; }
  }
}

function setHeld(a, h) {
  const key = h ? h[0] : null, rar = h ? h[1] : 0;
  const cur = a.inv[a.slot];
  if ((cur ? cur.key : null) === key && (!cur || (cur.rarity || 0) === rar)) return;
  a.inv = [createItem('pickaxe'), null, null, null, null, null];
  if (key && key !== 'pickaxe') { a.inv[1] = createItem(key, rar); if (a.inv[1].rarity !== undefined) a.inv[1].rarity = rar; a.slot = 1; }
  else a.slot = 0;
  setHeldModel(a);
}

// ---------------- pro Frame ----------------
export function netUpdate(dt) {
  if (!isMP() || !G.player) return;
  // Puppen (fremde Spieler) weich nachziehen
  const k = 1 - Math.exp(-dt * 14);
  for (const a of G.actors) {
    if (!a.netPos || a === G.player || (isHost() && !a.isRemote)) continue;
    if (!a.alive) continue;
    if (a.pos.distanceToSquared(a.netPos) > 100) a.pos.copy(a.netPos); else a.pos.lerp(a.netPos, k);
    if (Number.isFinite(a.netYaw)) a.yaw += wrap(a.netYaw - a.yaw) * k;
    if (Number.isFinite(a.netPitch)) a.pitch += (a.netPitch - a.pitch) * k;
    if (!Number.isFinite(a.yaw)) a.yaw = 0;
    if (!Number.isFinite(a.pitch)) a.pitch = 0;
  }
  if (isClient()) for (const c of G.cars) {
    if (!c.netPos || c.driver === G.player) continue;
    if (c.pos.distanceToSquared(c.netPos) > 64) c.pos.copy(c.netPos); else c.pos.lerp(c.netPos, k);
    if (Number.isFinite(c.netYaw)) c.yaw += wrap(c.netYaw - c.yaw) * k; placeCar(c);
  }

  if (isHost()) {
    NET.snapT -= dt;
    if (NET.snapT <= 0 && NET.conns.length) { NET.snapT = 1 / 15; broadcast(makeSnap()); }
  } else {
    // Host antwortet nicht mehr (Tab zu, Internet weg): als Verbindungsabbruch behandeln
    if (NET.lastData && performance.now() - NET.lastData > 8000 && !NET.lostSent) {
      NET.lostSent = true;
      try { NET.host && NET.host.close(); } catch (e) {}
      emit('netLost'); return;
    }
    NET.pingT -= dt;
    if (NET.pingT <= 0) { NET.pingT = 2; toHost({ t: 'ping', ts: performance.now(), rtt: Math.round(NET.rtt) }); }
    NET.sendT -= dt;
    if (NET.sendT <= 0) {
      NET.sendT = 1 / 20;
      const a = G.player, it = a.inv[a.slot];
      toHost({
        t: 'st', p: v3(a.pos), v: v3(a.vel), y: r2(a.yaw), pi: r2(a.pitch), s: a.state, c: a.crouch ? 1 : 0, sl: a.slideT > 0 ? 1 : 0, dv: a.diving ? 1 : 0, em: a.emoteT > 0 ? ((a.emoteStyle || 0) & 7) + 1 : 0, ln: a.lean ? 1 : 0,
        h: it ? [it.key, it.rarity || 0] : null, bs: G.bus && G.bus.driver === a ? r2(G.bus.steer) : undefined,
        car: a.car ? { id: a.car.id, p: v3(a.car.pos), y: r2(a.car.yaw), pi: r2(a.car.pitch), ro: r2(a.car.roll), sp: r2(a.car.speed) } : null,
      });
    }
  }
}

function makeSnap() {
  const a = G.actors.map(x => {
    const it = x.inv[x.slot];
    return [x.id, r2(x.pos.x), r2(x.pos.y), r2(x.pos.z), r2(x.yaw), r2(x.pitch), Math.max(0, STATES.indexOf(x.state)), Math.round(x.hp), Math.round(x.shield),
      x.alive ? 1 : 0, x.kills, (x.crouch ? 1 : 0) | (x.slideT > 0 ? 2 : 0) | (x.diving ? 4 : 0) | (x.emoteT > 0 ? 8 | (((x.emoteStyle || 0) & 7) << 6) : 0) | (x.lean ? 32 : 0), it ? it.key : '', it ? it.rarity || 0 : 0,
      r2(x.vel.x), r2(x.vel.z), x.car ? x.car.id : -1, x.team ?? -1, x.wait ? 1 : 0, x.seat || 0];
  });
  const s = G.storm;
  const st = s ? [s.active ? 1 : 0, r2(s.cx), r2(s.cz), r2(s.r), r2(s.nx), r2(s.nz), r2(s.nr), s.phase, s.shrinking ? 1 : 0, r2(s.t)] : null;
  const c = G.cars.map(car => [car.id, r2(car.pos.x), r2(car.pos.y), r2(car.pos.z), r2(car.yaw), r2(car.pitch), r2(car.roll), r2(car.speed), car.driver ? car.driver.id : 0]);
  const b = G.bus, bd = b && b.driver && !b.done ? [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.yaw), r2(b.steer), b.driver.id] : undefined;
  return { t: 'snap', ph: G.phase, pt: r2(G.phaseT), a, st, bt: b ? r2(b.t) : undefined, bd, c };
}

const wrap = x => { while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; };

// Verbindungsanzeige im HUD
export function netStatus() {
  if (!isMP()) return null;
  const now = performance.now();
  if (isHost()) {
    if (!NET.conns.length) return { text: 'Online-Lobby · du bist Host · noch keine anderen Spieler', bad: false };
    const parts = NET.conns.map(c => {
      const ago = (now - (c.lastData || now)) / 1000;
      return ago > 3 ? `${c.name}: keine Daten seit ${Math.round(ago)} s` : `${c.name}: ${Math.round(c.rtt || 0)} ms`;
    });
    return { text: 'Host · ' + parts.join(' · '), bad: NET.conns.some(c => now - (c.lastData || now) > 3000) };
  }
  const ago = (now - NET.lastData) / 1000;
  if (!NET.host || !NET.host.open) return { text: 'Keine Verbindung zum Host', bad: true };
  if (ago > 3) return { text: `Keine Daten vom Host seit ${Math.round(ago)} s – ist das Host-Fenster offen und sichtbar?`, bad: true };
  return { text: `Verbunden mit Host · ${Math.round(NET.rtt)} ms`, bad: false };
}

// Beim Schließen die Peer-ID sofort freigeben, damit ein anderer Spieler die Lobby übernehmen kann
addEventListener('pagehide', () => { if (NET.peer) try { NET.peer.destroy(); } catch (e) {} });
