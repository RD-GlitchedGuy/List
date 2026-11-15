// Party: Gruppe im Hauptmenü. Einer ist Party-Leader (wählt Modus und Spielart), alle müssen bereit sein, dann geht es los.
import { emit } from './state.js';
import { newPeer } from './net.js';

const PV = 1, ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PARTY = 12;
const pid = code => `skyroyale-rdg-pt${PV}-${code.toLowerCase()}`;
const newCode = () => Array.from({ length: 5 }, () => ABC[(Math.random() * 32) | 0]).join('');

// members: [{ id, name, look, st, lead }]  st: 0 nicht bereit, 1 bereit, 2 im Spiel
export const PARTY = { code: '', peer: null, online: false, leader: true, host: null, conns: [], members: [], me: 0, mode: 'solo', kind: 'pub', msg: '' };
const self = { name: 'Spieler', look: 0, st: 0 };
let nextId = 1, joining = null;

const change = () => emit('party');
function say(msg) { PARTY.msg = msg || ''; change(); }
export const partyMe = () => PARTY.members.find(m => m.id === PARTY.me) || { id: 0, ...self, lead: true };

function sync() {                                       // Leader: Liste neu bauen und an alle schicken
  if (!PARTY.leader) return;
  PARTY.me = 0;
  PARTY.members = [{ id: 0, name: self.name, look: self.look, st: self.st, lead: true }, ...PARTY.conns.map(c => ({ id: c.id, name: c.name, look: c.look, st: c.st, lead: false }))];
  if (PARTY.members.length > 1 && PARTY.kind === 'off') PARTY.kind = 'pub';
  const m = PARTY.members.map(x => [x.id, x.name, x.look, x.st, x.lead ? 1 : 0]);
  for (const c of PARTY.conns) if (c.conn.open) c.conn.send({ t: 'st', mode: PARTY.mode, kind: PARTY.kind, code: PARTY.code, m, you: c.id });
  change();
}
function checkStart() {                                 // alle bereit -> los
  if (!PARTY.leader || !PARTY.members.length || PARTY.members.some(m => m.st !== 1)) return;
  const d = { t: 'go', mode: PARTY.mode, kind: PARTY.kind, room: PARTY.kind === 'priv' ? PARTY.code : '', pt: PARTY.members.length > 1 ? PARTY.code : '' };
  for (const c of PARTY.conns) { c.st = 0; if (c.conn.open) c.conn.send(d); }
  self.st = 0; sync();
  emit('partyGo', d);
}

function solo(msg) {                                    // zurück in die eigene Party
  const h = PARTY.host; PARTY.host = null; joining = null;
  if (h) try { h.close(); } catch (e) {}
  PARTY.leader = true; self.st = 0; PARTY.msg = msg || '';
  sync();
}

function accept(conn) {
  const entry = { conn, id: 0, name: 'Spieler', look: 0, st: 0 };
  conn.on('data', d => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hi') {
      const no = why => { conn.send({ t: 'no', why }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 400); };
      if (d.v !== PV) return no('Andere Spielversion – bitte Seite neu laden');
      if (!PARTY.leader || joining) return no('Dieser Spieler ist gerade selbst in einer anderen Party');
      if (PARTY.conns.length >= MAX_PARTY - 1) return no('Party ist voll');
      entry.id = nextId++; entry.name = String(d.name || 'Spieler').slice(0, 16); entry.look = d.look | 0;
      PARTY.conns.push(entry); self.st = self.st === 1 ? 0 : self.st;
      PARTY.msg = `${entry.name} ist der Party beigetreten`;
      sync();
    } else if (d.t === 'me' && entry.id) {
      entry.name = String(d.name || 'Spieler').slice(0, 16); entry.look = d.look | 0; entry.st = [0, 1, 2].includes(d.st) ? d.st : 0;
      sync(); checkStart();
    }
  });
  conn.on('close', () => {
    const i = PARTY.conns.indexOf(entry); if (i < 0) return;
    PARTY.conns.splice(i, 1); PARTY.msg = `${entry.name} hat die Party verlassen`;
    sync(); checkStart();
  });
}

let retryT = 0;
function openPeer() {
  if (!window.Peer) { PARTY.online = false; return; }
  let peer;
  try { peer = PARTY.peer = newPeer(pid(PARTY.code)); } catch (e) { return; }
  peer.on('open', () => { if (PARTY.peer !== peer) return; PARTY.online = true; try { localStorage.setItem('skyroyale.party', PARTY.code); } catch (e) {} change(); });
  peer.on('connection', conn => { if (PARTY.peer === peer) accept(conn); });
  peer.on('disconnected', () => { if (PARTY.peer === peer && !peer.destroyed) { PARTY.online = false; change(); setTimeout(() => { if (PARTY.peer === peer && !peer.destroyed && peer.disconnected) try { peer.reconnect(); } catch (e) {} }, 5000); } });
  peer.on('error', e => {
    if (PARTY.peer !== peer) return;
    if (e.type === 'unavailable-id') {                  // Code belegt (z. B. zweiter Tab) -> neuer Code
      peer.destroy(); PARTY.code = newCode(); openPeer();
    } else if (e.type === 'peer-unavailable') {
      if (joining) solo('Party nicht gefunden – stimmt der Code?');
    } else if (!PARTY.online) { clearTimeout(retryT); retryT = setTimeout(() => { if (PARTY.peer === peer && !PARTY.online) { try { peer.destroy(); } catch (x) {} openPeer(); } }, 12000); }
  });
}

export function initParty(info) {
  Object.assign(self, info);
  let c = ''; try { c = localStorage.getItem('skyroyale.party') || ''; } catch (e) {}
  PARTY.code = /^[A-Z2-9]{5}$/.test(c) ? c : newCode();
  sync();
  openPeer();
}

// Eigene Angaben (Name, Skin, Status) ändern
export function partySelf(info) {
  Object.assign(self, info);
  if (PARTY.leader) { sync(); checkStart(); }
  else {
    const me = partyMe(); Object.assign(me, self); change();
    if (PARTY.host && PARTY.host.open) PARTY.host.send({ t: 'me', name: self.name, look: self.look, st: self.st });
  }
}
export function partySet(key, val) { if (!PARTY.leader) return; PARTY[key] = val; sync(); }

export function joinParty(code) {
  code = String(code || '').trim().toUpperCase();
  if (code.length !== 5) return say('Der Party-Code hat 5 Zeichen');
  if (code === PARTY.code) return say('Das ist dein eigener Code');
  if (!PARTY.online || !PARTY.peer) return say('Keine Verbindung zum Party-Server – gleich nochmal versuchen');
  if (!PARTY.leader) return say('Erst die aktuelle Party verlassen');
  for (const c of PARTY.conns.slice()) try { c.conn.close(); } catch (e) {}
  PARTY.conns.length = 0;
  const conn = PARTY.peer.connect(pid(code), { reliable: true, serialization: 'json' });
  joining = conn; say('Verbinde mit Party ' + code + ' …');
  const timer = setTimeout(() => { if (joining === conn) solo('Party antwortet nicht'); }, 9000);
  conn.on('open', () => conn.send({ t: 'hi', v: PV, name: self.name, look: self.look }));
  conn.on('data', d => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'no') { clearTimeout(timer); if (joining === conn || PARTY.host === conn) solo(d.why); return; }
    if (d.t === 'st') {
      if (joining === conn) { clearTimeout(timer); joining = null; PARTY.host = conn; PARTY.leader = false; self.st = 0; PARTY.msg = 'Party beigetreten'; }
      if (PARTY.host !== conn) return;
      PARTY.mode = d.mode; PARTY.kind = d.kind; PARTY.hostCode = d.code; PARTY.me = d.you;
      PARTY.members = d.m.map(x => ({ id: x[0], name: x[1], look: x[2], st: x[3], lead: !!x[4] }));
      const me = partyMe(); self.st = me.st === 2 || self.st === 2 ? self.st : me.st;
      change();
    } else if (d.t === 'go' && PARTY.host === conn) { self.st = 0; emit('partyGo', d); }
  });
  conn.on('close', () => { clearTimeout(timer); if (PARTY.host === conn) solo('Die Party wurde aufgelöst'); else if (joining === conn) solo('Party nicht erreichbar'); });
}

export function leaveParty() {
  if (!PARTY.leader || joining) return solo('Party verlassen');
  for (const c of PARTY.conns.slice()) try { c.conn.close(); } catch (e) {}
  PARTY.conns.length = 0; PARTY.msg = 'Party aufgelöst'; sync();
}
