// Online-Modus mit PeerJS: Räume per Code, öffentliche Lobby, Mitspieler als Avatare
// Die Lobby ist selbst ein Peer mit festem Namen: der erste Spieler, der online geht, übernimmt sie.
import * as THREE from 'three';
import { $, V3 } from './util.js';
import { scene, camera } from './engine.js';
import { P, game } from './state.js';
import { settings, saveSettings } from './settings.js';
import { Avatar } from './hero.js';
import { showMove } from './hud.js';
import { sfx } from './audio.js';

const PREFIX = 'skygames-skyweaver-v1-', LOBBY_ID = PREFIX + 'lobby', MAX = 8;
const q = new URLSearchParams(location.search);
const OPTS = Object.assign(q.get('peerhost') ? { host: q.get('peerhost'), port: +(q.get('peerport') || 9000), path: '/', secure: false, key: 'peerjs' } : {}, { debug: +(q.get('peerdebug') || 0) });
const dbg = (...a) => { if (OPTS.debug) console.log('[net]', ...a); };
const CONN = { serialization: 'json', reliable: true };

export const net = { status: 'offline', code: null, room: null, rooms: [], players: 0, lobby: 'getrennt', isLobbyHost: false };
export const remotes = new Map();
const ui = { onChange: () => {} };
export function onNetChange(f) { ui.onChange = f; }
const changed = () => ui.onChange();
const setStatus = s => { net.status = s; changed(); };

let peer = null, lobbyConn = null, lobbyPeer = null, hostConn = null, tick = 0, announceT = 0;
const clients = new Map();                 // als Gastgeber: Verbindungen der Mitspieler
const lobbyClients = new Map(), roomList = new Map();   // als Lobby

const rndCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/* ---------- Verbindung aufbauen ---------- */
export function goOnline() {
  if (!window.Peer) { setStatus('PeerJS konnte nicht geladen werden'); return; }
  if (peer && !peer.destroyed) { if (!lobbyConn) connectLobby(); return; }
  net.code = rndCode(); setStatus('Verbinde …');
  peer = new window.Peer(PREFIX + net.code, OPTS);
  peer.on('open', () => { setStatus('online'); connectLobby(); });
  peer.on('connection', c => acceptPlayer(c));
  peer.on('disconnected', () => { setStatus('Verbindung zum Server verloren, versuche erneut …'); try { peer.reconnect(); } catch (e) {} });
  peer.on('error', e => {
    dbg('peer error', e.type, e.message);
    if (e.type === 'unavailable-id') { peer.destroy(); peer = null; goOnline(); return; }
    if (e.type === 'peer-unavailable') {
      if (String(e.message).includes(LOBBY_ID)) becomeLobby();
      else { setStatus('online'); showMove('Raum nicht gefunden', 1800); }
      return;
    }
    if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') setStatus('Server nicht erreichbar');
  });
}

/* ---------- Lobby: Liste öffentlicher Räume ---------- */
function connectLobby() {
  dbg('connectLobby', !!peer, peer && peer.destroyed, !!lobbyConn);
  if (!peer || peer.destroyed || lobbyConn) return;
  const c = peer.connect(LOBBY_ID, CONN);
  // Lobby fehlt -> PeerJS meldet 'peer-unavailable' (siehe oben). Der Zeitgeber ist nur ein Notfall, falls gar nichts zurückkommt.
  const to = setTimeout(() => { if (!c.open) { try { c.close(); } catch (e) {} becomeLobby(); } }, 20000);
  c.on('open', () => { clearTimeout(to); lobbyConn = c; net.lobby = 'verbunden'; changed(); c.send({ t: 'list' }); if (net.room && net.room.host && net.room.pub) announce(); });
  c.on('data', d => { if (d && d.t === 'rooms') { net.rooms = d.rooms.filter(r => r.code !== net.code); changed(); } });
  c.on('close', () => { clearTimeout(to); if (lobbyConn === c) { lobbyConn = null; net.lobby = 'getrennt'; changed(); } setTimeout(connectLobby, 1500 + Math.random() * 2500); });
}
function becomeLobby() {
  dbg('becomeLobby', !!lobbyPeer, !!lobbyConn);
  if (lobbyPeer || lobbyConn) return;
  lobbyPeer = new window.Peer(LOBBY_ID, OPTS);
  lobbyPeer.on('open', () => { net.isLobbyHost = true; setTimeout(connectLobby, 200); });
  lobbyPeer.on('error', e => { if (e.type === 'unavailable-id') { lobbyPeer.destroy(); lobbyPeer = null; setTimeout(connectLobby, 800); } });
  lobbyPeer.on('connection', c => {
    c.on('open', () => { lobbyClients.set(c.peer, c); sendRooms(c); });
    c.on('data', d => {
      if (!d) return;
      if (d.t === 'announce' && d.room) { roomList.set(d.room.code, Object.assign({ ts: Date.now(), owner: c.peer }, d.room)); broadcastRooms(); }
      else if (d.t === 'unannounce') { roomList.delete(d.code); broadcastRooms(); }
      else if (d.t === 'list') sendRooms(c);
    });
    c.on('close', () => { lobbyClients.delete(c.peer); for (const [k, r] of roomList) if (r.owner === c.peer) roomList.delete(k); broadcastRooms(); });
  });
}
const roomsPayload = () => { const now = Date.now(); for (const [k, r] of roomList) if (now - r.ts > 14000) roomList.delete(k); return { t: 'rooms', rooms: [...roomList.values()].map(({ code, name, players }) => ({ code, name, players })) }; };
function sendRooms(c) { try { c.send(roomsPayload()); } catch (e) {} }
function broadcastRooms() { const p = roomsPayload(); for (const c of lobbyClients.values()) try { c.send(p); } catch (e) {} }
function announce() { if (lobbyConn && net.room && net.room.host && net.room.pub) lobbyConn.send({ t: 'announce', room: { code: net.code, name: net.room.name, players: 1 + clients.size } }); }

/* ---------- Raum als Gastgeber ---------- */
export function createRoom(pub) {
  leaveRoom(true);
  net.room = { host: true, pub, name: (settings.name || 'Weaver') + 's Raum', code: net.code }; net.players = 1;
  announce(); changed();
}
function acceptPlayer(c) {
  c.on('data', d => {
    if (!d) return;
    if (d.t === 'hello') {
      if (!net.room || !net.room.host) { c.send({ t: 'nope', why: 'Kein Raum offen' }); setTimeout(() => c.close(), 300); return; }
      if (clients.size >= MAX - 1) { c.send({ t: 'nope', why: 'Raum ist voll' }); setTimeout(() => c.close(), 300); return; }
      clients.set(c.peer, c); c.info = { id: c.peer, name: clean(d.name), colors: d.colors };
      const list = [{ id: peer.id, name: settings.name, colors: settings.colors }, ...[...clients.values()].filter(x => x !== c).map(x => x.info)];
      c.send({ t: 'welcome', players: list });
      relay(c, { t: 'join', ...c.info });
      addRemote(c.info); net.players = 1 + clients.size; showMove(`${c.info.name} ist beigetreten`, 1800); announce(); changed();
    } else if (d.t === 's' && clients.has(c.peer)) { d.id = c.peer; updateRemote(d); relay(c, d); }
  });
  c.on('close', () => {
    if (!clients.has(c.peer)) return;
    clients.delete(c.peer); removeRemote(c.peer); relay(null, { t: 'leave', id: c.peer });
    net.players = 1 + clients.size; announce(); changed();
  });
}
function relay(except, msg) { for (const c of clients.values()) if (c !== except && c.open) try { c.send(msg); } catch (e) {} }

/* ---------- Raum beitreten ---------- */
export function joinRoom(code) {
  code = String(code || '').trim().toUpperCase(); if (!code || code === net.code) return;
  if (!peer || peer.destroyed || net.status !== 'online') { showMove('Noch nicht verbunden', 1500); return; }
  leaveRoom(true);
  const c = peer.connect(PREFIX + code, CONN); setStatus('Trete bei …');
  c.on('open', () => c.send({ t: 'hello', name: settings.name, colors: settings.colors }));
  c.on('data', d => {
    if (!d) return;
    if (d.t === 'welcome') { hostConn = c; net.room = { host: false, code }; d.players.forEach(addRemote); net.players = 1 + remotes.size; setStatus('online'); showMove('Beigetreten: ' + code, 1800); }
    else if (d.t === 'nope') { setStatus('online'); showMove(d.why, 2000); }
    else if (d.t === 'join') { addRemote(d); net.players = 1 + remotes.size; showMove(`${clean(d.name)} ist beigetreten`, 1800); changed(); }
    else if (d.t === 'leave') { removeRemote(d.id); net.players = 1 + remotes.size; changed(); }
    else if (d.t === 's') updateRemote(d);
  });
  c.on('close', () => { if (hostConn === c) { hostConn = null; clearRemotes(); net.room = null; showMove('Der Raum wurde geschlossen', 2000); changed(); } });
}
export function leaveRoom(silent) {
  if (net.room && net.room.host) { if (lobbyConn) try { lobbyConn.send({ t: 'unannounce', code: net.code }); } catch (e) {} for (const c of clients.values()) try { c.close(); } catch (e) {} clients.clear(); }
  if (hostConn) { const c = hostConn; hostConn = null; try { c.close(); } catch (e) {} }
  clearRemotes(); net.room = null; net.players = 0; if (!silent) changed();
}
export function setName(n) { settings.name = clean(n) || settings.name; saveSettings(); }
const clean = s => String(s || 'Weaver').replace(/[<>]/g, '').slice(0, 16);

/* ---------- Mitspieler darstellen ---------- */
function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,22,.65)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 22); g.fill();
  g.fillStyle = '#fff'; g.font = '700 30px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(2.4, .6, 1); s.renderOrder = 20; scene.add(s); return s;
}
const blankS = () => ({ pos: new V3(0, -999, 0), vel: new V3(), state: 'air', faceYaw: 0, anchors: [new V3(), new V3()], nAnch: 0, side: 1, wallN: new V3(1, 0, 0), splat: null, trick: null, roll: 0, land: 0, charge: 0, diving: false, zip: null, zipFx: null, L: 0 });
function addRemote(info) {
  if (!info || info.id === (peer && peer.id) || remotes.has(info.id)) return;
  const r = { id: info.id, name: clean(info.name), S: blankS(), tp: new V3(0, -999, 0), tv: new V3(), age: 0, avatar: new Avatar(info.colors), tag: nameTag(clean(info.name)), fresh: true };
  // Mitspieler hört man: Fäden und Schritte mit Raumklang
  r.avatar.onShoot = () => sfx('web_shoot', { pos: r.S.pos.clone(), vol: .6, ref: 5 });
  r.avatar.onStep = (climb, A, p) => sfx('step', { pos: p.clone(), vol: .25 + .35 * A, rate: climb ? 1.15 : 1, ref: 3 });
  remotes.set(info.id, r);
}
function removeRemote(id) { const r = remotes.get(id); if (!r) return; r.avatar.dispose(); scene.remove(r.tag); r.tag.material.map.dispose(); remotes.delete(id); }
function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }
const v3 = (a, o) => a ? o.set(a[0], a[1], a[2]) : o;
function updateRemote(d) {
  const r = remotes.get(d.id); if (!r) return;
  const S = r.S; v3(d.p, r.tp); v3(d.v, r.tv); r.age = 0;
  if (r.fresh) { S.pos.copy(r.tp); r.fresh = false; }
  S.vel.copy(r.tv); S.state = d.s; S.faceYaw = d.y; S.nAnch = d.n; S.side = d.sd; S.land = d.l || 0; S.roll = d.r || 0; S.charge = d.c || 0; S.diving = !!d.dv;
  if (d.a) { S.anchors[0].set(d.a[0], d.a[1], d.a[2]); S.anchors[1].set(d.a[3], d.a[4], d.a[5]); }
  if (d.w) S.wallN.set(d.w[0], 0, d.w[1]);
  S.splat = d.sp ? { kind: d.sp[0], n: new V3(d.sp[1], 0, d.sp[2]) } : null;
  if (d.tr) { if (!S.trick || S.trick.type !== d.tr[0] || Math.abs(S.trick.t - d.tr[1]) > .25) S.trick = { type: d.tr[0], t: d.tr[1], dur: d.tr[2] }; } else S.trick = null;
  S.zip = d.z ? { target: new V3(d.z[0], d.z[1], d.z[2]) } : null;
  S.zipFx = d.zf ? { p: new V3(d.zf[0], d.zf[1], d.zf[2]) } : null;
}
const r2 = x => Math.round(x * 100) / 100;
function myState() {
  const a = P.anchors, s = {
    t: 's', p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], v: [r2(P.vel.x), r2(P.vel.y), r2(P.vel.z)], s: P.state, y: r2(P.faceYaw), n: P.nAnch, sd: P.side,
    a: [r2(a[0].x), r2(a[0].y), r2(a[0].z), r2(a[1].x), r2(a[1].y), r2(a[1].z)], w: [P.wallN.x, P.wallN.z],
  };
  if (P.land > 0) s.l = r2(P.land); if (P.roll > 0) s.r = r2(P.roll); if (P.state === 'charge') s.c = r2(P.charge); if (P.diving) s.dv = 1;
  if (P.splat) s.sp = [P.splat.kind, P.splat.n.x, P.splat.n.z];
  if (P.trick) s.tr = [P.trick.type, r2(P.trick.t), P.trick.dur];
  if (P.zip) s.z = [r2(P.zip.target.x), r2(P.zip.target.y), r2(P.zip.target.z)];
  if (P.zipFx) s.zf = [r2(P.zipFx.p.x), r2(P.zipFx.p.y), r2(P.zipFx.p.z)];
  return s;
}

/* ---------- pro Frame ---------- */
export function updateNet(dt) {
  if (net.room) {
    tick += dt;
    if (tick > 1 / 15 && game.started) {
      tick = 0; const s = myState();
      if (net.room.host) { s.id = peer.id; relay(null, s); } else if (hostConn && hostConn.open) try { hostConn.send(s); } catch (e) {}
    }
    announceT += dt; if (announceT > 4) { announceT = 0; announce(); }
  }
  for (const r of remotes.values()) {
    r.age += dt; const S = r.S;
    // weich zur gemeldeten Position, mit Vorhersage über die Geschwindigkeit
    const target = r.tp.clone().addScaledVector(r.tv, Math.min(.25, r.age));
    S.pos.lerp(target, 1 - Math.exp(-12 * dt));
    if (S.trick) S.trick.t += dt;
    r.avatar.update(S, dt, false);
    r.tag.position.copy(S.pos).setY(S.pos.y + 2.35);
    r.tag.visible = r.age < 5;
  }
}
export function netLabel() { return net.room ? `Online · ${net.players} Spieler · Code ${net.room.code}` : ''; }
