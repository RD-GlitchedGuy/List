// Loot am Boden, Truhen öffnen, Aufheben
import * as THREE from 'three';
import { G, emit } from './state.js';
import { DEFS, rollChest, rollAmmoBox, itemLabel } from './items.js';
import { makeItemModel, makeRarityRing, setHeldModel } from './models.js';
import { hideChest } from './world.js';
import { groundBelow } from './physics.js';
import { isClient, net, req } from './net.js';
import { sfx } from './audio.js';

let nextLootId = 1;

// netInfo: nur vom Netzwerk (Client) – { id, from }
export function spawnLoot(item, pos, scatter = false, toward = null, netInfo = null) {
  if (isClient() && !netInfo) { req.drop(item, pos); return null; }
  const g = new THREE.Group();
  const model = makeItemModel(item); g.add(model);
  if (!item.ammo) g.add(makeRarityRing(item.rarity || 0));
  let from = pos.clone(), to = pos.clone();
  if (netInfo) { if (netInfo.from) from = netInfo.from; else from = to.clone(); }
  else {
    if (scatter) {
      const ang = toward !== null ? toward + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 1.0;
      to.x += -Math.sin(ang) * r; to.z += -Math.cos(ang) * r;
    }
    to.y = groundBelow(new THREE.Vector3(to.x, from.y + 1.2, to.z), 6);
    if (to.y < from.y - 5) to.y = from.y - 0.1;
  }
  const animate = netInfo ? !!netInfo.from : scatter;
  g.position.copy(animate ? from : to);
  G.scene.add(g);
  const drop = { id: netInfo ? netInfo.id : nextLootId++, item, pos: to, from, t: animate ? 0 : 1, group: g, model, spin: Math.random() * 6 };
  G.loot.push(drop);
  net.lootAdd(drop);
  return drop;
}

export function removeLoot(drop) {
  G.scene.remove(drop.group);
  const i = G.loot.indexOf(drop); if (i >= 0) G.loot.splice(i, 1);
  net.lootRemove(drop);
}

export function openChest(chest, actor) {
  if (chest.opened) return;
  chest.opened = true;
  hideChest(chest);
  const snd = chest.type === 'chest' ? 'chest' : 'ammobox';
  sfx(snd, actor === G.player ? 0 : chest.pos.distanceTo(G.camera.position));
  if (!actor || isClient()) return;          // Client: nur verstecken, Loot kommt vom Host
  net.chest(chest);
  const items = chest.type === 'chest' ? rollChest() : rollAmmoBox();
  const base = chest.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
  const face = Math.atan2(-(actor.pos.x - chest.pos.x), -(actor.pos.z - chest.pos.z));
  for (const it of items) spawnLoot(it, base, true, face);
}

// Kann der Akteur das aufnehmen?
export function canTake(a, it) {
  if (it.ammo) return true;
  const d = DEFS[it.key];
  if (d.type !== 'gun') for (let s = 1; s <= 5; s++) { const c = a.inv[s]; if (c && c.key === it.key && c.count < d.stack) return true; }
  for (let s = 1; s <= 5; s++) if (!a.inv[s]) return true;
  return a.slot !== 0;
}

// Item ins Inventar legen. Rückgabe: false = geht nicht, null = alles genommen, sonst Rest/getauschtes Item
export function takeItem(a, it) {
  if (it.ammo) { a.ammo[it.ammo] += it.amount; return null; }
  const d = DEFS[it.key];
  if (d.type !== 'gun') {
    for (let s = 1; s <= 5; s++) {
      const cur = a.inv[s];
      if (cur && cur.key === it.key && cur.count < d.stack) {
        const take = Math.min(d.stack - cur.count, it.count);
        cur.count += take; it.count -= take;
        if (it.count <= 0) return null;
      }
    }
  }
  // Bevorzugte Slots (Einstellungen, nur der eigene Spieler)
  const prefs = a === G.player ? G.settings.prefSlots || {} : {};
  const prefOf = x => prefs[itemCategory(x.key)] || 0;
  const equip = s => { if (a.slot === 0 || !a.inv[a.slot]) { a.slot = s; a.equipT = 0.22; } if (a.slot === s) { a.reloadT = 0; a.channel = null; } setHeldModel(a); };
  const want = prefOf(it);
  const reserved = new Set(Object.values(prefs).filter(Boolean));
  const free = [1, 2, 3, 4, 5].filter(s => !a.inv[s]).sort((x, y) => reserved.has(x) - reserved.has(y));
  if (want) {
    const cur = a.inv[want];
    if (!cur) { a.inv[want] = it; equip(want); return null; }
    const out = free.find(s => s !== want);
    if (out && prefOf(cur) !== want) { a.inv[out] = cur; a.inv[want] = it; equip(want); return null; }   // altes Item weicht aus
  }
  if (free.length) { a.inv[free[0]] = it; equip(free[0]); return null; }
  if (a.slot === 0) return false;
  const old = a.inv[a.slot];
  a.inv[a.slot] = it;
  a.reloadT = 0; a.channel = null; a.equipT = 0.22;
  setHeldModel(a);
  return old;
}

// true = Drop wurde (ganz oder teilweise) genommen
export function pickup(a, drop) {
  if (isClient()) { if (canTake(a, drop.item)) req.pick(drop); return false; }
  const rest = takeItem(a, drop.item);
  if (rest === false) { if (a === G.player) emit('toast', 'Inventar voll – wähle einen Slot zum Tauschen'); return false; }
  removeLoot(drop);
  if (rest) spawnLoot(rest, a.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), true);
  if (a === G.player) sfx(pickupSound(drop.item));
  return true;
}

export function interact(a, obj) {
  if (obj.type) { if (isClient()) req.open(obj); else openChest(obj, a); }
  else if (!canTake(a, obj.item)) emit('toast', 'Inventar voll – wähle einen Slot zum Tauschen');
  else pickup(a, obj);
}

// Interaktionsziel vor dem Akteur (Truhe oder Loot)
export function findInteract(a, lookDir) {
  let best = null, bestScore = Infinity;
  const consider = (obj, p, range) => {
    const dx = p.x - a.pos.x, dz = p.z - a.pos.z, dy = p.y - a.pos.y;
    const dist = Math.hypot(dx, dz);
    if (dist > range || Math.abs(dy) > 2.2) return;
    let facing = 1;
    if (lookDir && dist > 0.6) facing = (dx * lookDir.x + dz * lookDir.z) / (dist * Math.hypot(lookDir.x, lookDir.z) || 1);
    if (facing < 0.3) return;
    const score = dist - facing * 1.5;
    if (score < bestScore) { bestScore = score; best = obj; }
  };
  for (const c of G.chests) if (!c.opened) consider(c, c.pos, 2.6);
  for (const l of G.loot) if (l.t >= 1 && !l.pending) consider(l, l.pos, 2.3);
  return best;
}

export function interactLabel(obj) {
  if (obj.type === 'chest') return 'Truhe öffnen';
  if (obj.type === 'ammo') return 'Munitionskiste öffnen';
  return itemLabel(obj.item);
}

export function updateLoot(dt) {
  for (const l of G.loot) {
    l.spin += dt * 1.2;
    if (l.t < 1) {
      l.t = Math.min(1, l.t + dt * 2.2);
      l.group.position.lerpVectors(l.from, l.pos, l.t);
      l.group.position.y += Math.sin(l.t * Math.PI) * 0.9;
    } else {
      l.group.position.copy(l.pos);
      l.model.position.y = 0.25 + Math.sin(l.spin * 2) * 0.06;
    }
    l.model.rotation.y = l.spin;
  }
  // Munition wird automatisch eingesammelt
  for (const a of G.actors) {
    if (!a.alive || a.state !== 'ground' || a.isRemote || a.isPuppet) continue;
    for (let i = G.loot.length - 1; i >= 0; i--) {
      const l = G.loot[i];
      if (!l || !l.item.ammo || l.t < 1 || l.pending) continue;
      if (Math.abs(l.pos.x - a.pos.x) < 1.1 && Math.abs(l.pos.z - a.pos.z) < 1.1 && Math.abs(l.pos.y - a.pos.y) < 1.5) pickup(a, l);
    }
  }
}

// Aufheben klingt je nach Gegenstand anders
export const pickupSound = it => it.ammo ? 'ammo' : DEFS[it.key] && DEFS[it.key].type === 'gun' ? 'pickupgun' : 'pickup';

// Kategorie eines Items für die bevorzugten Slots
export function itemCategory(key) {
  const d = DEFS[key]; if (!d) return '';
  if (d.type === 'gun') return d.cls;
  if (d.type === 'heal' || d.type === 'shield' || d.type === 'throw') return d.type;
  return 'mobility';
}
