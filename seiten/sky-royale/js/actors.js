// Spieler & Bots: Erstellen, Schaden, Eliminierung, Slots
import * as THREE from 'three';
import { G, emit } from './state.js';
import { createItem, DEFS, AMMO } from './items.js';
import { makeCharacter, setHeldModel } from './models.js';
import { spawnLoot } from './loot.js';
import { sfx } from './audio.js';
import { isClient, net, req } from './net.js';

let nextId = 1;
export function createActor(name, isBot, look, id) {
  if (id) nextId = Math.max(nextId, id + 1);
  const a = {
    id: id || nextId++, name, isBot, isPlayer: !isBot, look,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
    radius: 0.35, height: 1.8, onGround: false, impact: 0,
    hp: 100, shield: 0, alive: true, kills: 0, place: 0,
    state: 'ground', crouch: false, sprint: false, ads: false, adsT: 0,
    inv: [], slot: 0, ammo: {},
    fireCd: 0, reloadT: 0, equipT: 0, burstLeft: 0, burstT: 0, bloom: 0, kickVis: 0, swingT: 0,
    channel: null, fallImmune: false, grapple: null, padCd: 0, lastHitBy: null, slideT: 0, diving: false, car: null,
    model: makeCharacter(look), heldModel: null,
  };
  resetLoadout(a);
  G.scene.add(a.model);
  G.actors.push(a);
  return a;
}

export function resetLoadout(a) {
  a.inv = [createItem('pickaxe'), null, null, null, null, null];
  a.slot = 0;
  for (const k in AMMO) a.ammo[k] = 0;
  a.reloadT = 0; a.channel = null; a.burstLeft = 0;
  setHeldModel(a);
}

export function switchSlot(a, s) {
  if (s === a.slot || s < 0 || s > 5) return;
  if (s > 0 && !a.inv[s]) return;
  a.slot = s;
  a.reloadT = 0; a.channel = null; a.burstLeft = 0;
  a.equipT = 0.22;
  setHeldModel(a);
}

export function cycleSlot(a, dir) {
  for (let i = 1; i <= 6; i++) {
    const s = (a.slot + dir * i + 6) % 6;
    if (s === 0 || a.inv[s]) { switchSlot(a, s); return; }
  }
}

export function damage(t, amount, attacker, opts = {}) {
  if (!t.alive || t.state === 'bus' || amount <= 0) return;
  if (isClient()) { if (t === G.player && opts.cause === 'Sturz') req.selfDamage(amount, 'Sturz'); return; }
  // Startinsel vor Rundenbeginn: niemand nimmt Schaden, Treffer werden nur angezeigt
  if (G.phase === 'warmup') {
    if (attacker && attacker !== t) {
      const ev = { target: t, amount: Math.round(amount), shield: t.shield > 0, head: !!opts.head, pos: opts.pos, preview: true };
      if (attacker === G.player) emit('dealt', ev); else if (attacker.isRemote) net.dealt(attacker, ev);
    }
    return;
  }
  let rest = amount, toShield = 0;
  if (!opts.ignoreShield) { toShield = Math.min(t.shield, rest); t.shield -= toShield; rest -= toShield; }
  t.hp -= rest;
  if (attacker && attacker !== t) { t.lastHitBy = attacker; t.lastHitTime = G.time; }
  const ev = { target: t, amount: Math.round(amount), shield: toShield > 0 && rest <= 0, head: !!opts.head, pos: opts.pos };
  if (attacker === G.player && t !== G.player) emit('dealt', ev);
  else if (attacker && attacker.isRemote && t !== attacker) net.dealt(attacker, ev);
  if (t === G.player) emit('hurt', { amount, from: attacker });
  if (t.isBot && t.ai && attacker && attacker !== t) t.ai.onHit(attacker);
  if (t.hp <= 0) eliminate(t, attacker && attacker !== t ? attacker : (t.lastHitBy && G.time - t.lastHitTime < 8 ? t.lastHitBy : null), opts.cause || (opts.weapon && DEFS[opts.weapon].name));
}

export function aliveCount() { return G.actors.filter(a => a.alive).length; }

export function eliminate(t, killer, cause) {
  if (!t.alive) return;
  t.hp = 0; t.alive = false; t.state = 'dead'; t.channel = null;
  t.model.visible = false;
  if (killer && killer.alive !== undefined && killer !== t) {
    killer.kills++; if (killer === G.player) { sfx('elim'); emit('kill', t, killer.kills); }
    if (killer.isBot && Math.random() < 0.35) { killer.emoteT = 3; killer.emoteStyle = (Math.random() * 2) | 0; }
  }
  emit('elimFx', t.pos.clone());
  if (t.car) { t.car.driver = null; t.car = null; }
  emit('feed', feedText(t, killer, cause), t === G.player || killer === G.player);
  t.place = aliveCount() + 1;
  net.elim(t, killer, cause);

  if (G.phase === 'warmup') {           // Aufwärmphase: einfach neu spawnen
    setTimeout(() => emit('respawn', t), 2500);
    return;
  }
  // Inventar fallen lassen
  if (t.isRemote) net.died(t);
  else {
    const at = t.pos.clone();
    for (let s = 1; s <= 5; s++) if (t.inv[s]) { spawnLoot(t.inv[s], at, true); t.inv[s] = null; }
    for (const k in t.ammo) if (t.ammo[k] > 0) { spawnLoot({ ammo: k, amount: t.ammo[k] }, at, true); t.ammo[k] = 0; }
  }
  emit('eliminated', t, killer);
}

export function feedText(t, killer, cause) {
  const me = t === G.player, by = killer === G.player;
  if (killer && killer !== t) return `${by ? 'Du hast' : killer.name + ' hat'} ${me ? 'dich' : t.name} eliminiert${cause ? ' · ' + cause : ''}`;
  if (cause === 'Sturm') return me ? 'Du bist dem Sturm erlegen' : `${t.name} ist dem Sturm erlegen`;
  if (cause === 'Sturz') return me ? 'Du bist zu tief gefallen' : `${t.name} ist zu tief gefallen`;
  if (cause === 'Verbindung getrennt') return `${t.name} hat das Spiel verlassen`;
  return me ? 'Du wurdest eliminiert' : `${t.name} wurde eliminiert`;
}
