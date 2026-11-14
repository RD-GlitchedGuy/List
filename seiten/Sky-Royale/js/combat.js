// Schießen mit Kugelfall, Rückstoß, Nachladen, Granaten, Mobilitäts-Items, Heilung
import * as THREE from 'three';
import { G, emit } from './state.js';
import { DEFS, stat } from './items.js';
import { damage, switchSlot } from './actors.js';
import { raycast, groundBelow, lineOfSight } from './physics.js';
import { makeLaunchPad, mat } from './models.js';
import { puff, muzzleFlash, explosion, shockRing } from './effects.js';
import { sfx } from './audio.js';
import { isClient, net, req } from './net.js';
import { rayCars } from './cars.js';
import { objectAtHit, destroyObject, wobbleObject } from './world.js';

const DEG = Math.PI / 180;
const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: '#f1dfa2' });
const rocketGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8).rotateX(Math.PI / 2);

export const current = a => a.inv[a.slot];

// ---------- Hilfsfunktionen ----------
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
function segSegDist(p1, q1, p2, q2) {               // liefert [Abstand, s auf Segment 1]
  const d1 = _v.subVectors(q1, p1), d2 = _u.subVectors(q2, p2), r = _w.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  if (e < 1e-8) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
  else {
    s = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
    t = (b * s + f) / e;
  }
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
  else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  const cx = p1.x + d1.x * s - (p2.x + d2.x * t), cy = p1.y + d1.y * s - (p2.y + d2.y * t), cz = p1.z + d1.z * s - (p2.z + d2.z * t);
  return [Math.sqrt(cx * cx + cy * cy + cz * cz), s];
}
const bodyA = new THREE.Vector3(), bodyB = new THREE.Vector3(), headP = new THREE.Vector3();
function hitActors(from, to, owner) {
  let best = null, bestS = 2;
  const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2, half = from.distanceTo(to) / 2 + 2;
  for (const a of G.actors) {
    if (!a.alive || a === owner || a.state === 'bus') continue;
    if (Math.abs(a.pos.x - mx) > half || Math.abs(a.pos.z - mz) > half) continue;
    const low = a.crouch && a.state === 'ground';
    const top = low ? 1.0 : 1.38;
    headP.set(a.pos.x, a.pos.y + top + 0.24, a.pos.z);
    const [hd, hs] = segSegDist(from, to, headP, headP);
    if (hd < 0.24 && hs < bestS) { bestS = hs; best = { actor: a, head: true, s: hs }; continue; }
    bodyA.set(a.pos.x, a.pos.y + 0.25, a.pos.z); bodyB.set(a.pos.x, a.pos.y + top, a.pos.z);
    const [bd, bs] = segSegDist(from, to, bodyA, bodyB);
    if (bd < 0.38 && bs < bestS) { bestS = bs; best = { actor: a, head: false, s: bs }; }
  }
  return best;
}

// ---------- Schießen ----------
export function canFire(a) {
  const it = current(a);
  return it && a.equipT <= 0 && a.fireCd <= 0 && a.reloadT <= 0 && !a.channel && a.state !== 'swim';
}

export function startReload(a) {
  const it = current(a); if (!it) return;
  const d = DEFS[it.key];
  if (d.type !== 'gun' || it.mag >= d.mag || a.reloadT > 0 || a.ammo[d.ammo] <= 0) return;
  a.reloadT = stat(it).reload; a.reloadMax = a.reloadT; a.burstLeft = 0;
  if (a === G.player) sfx('reload');
}

// aimOrigin/aimDir: Zielstrahl (Kamera beim Spieler, Augen beim Bot)
export function trigger(a, aimOrigin, aimDir, fresh) {
  const it = current(a); if (!it) return;
  const d = DEFS[it.key];
  if (d.type === 'gun') {
    if (!d.auto && !fresh && a.burstLeft <= 0) return;
    if (!canFire(a)) return;
    if (it.mag <= 0) { if (a.ammo[d.ammo] > 0) startReload(a); else if (a === G.player && fresh) sfx('empty'); return; }
    if (d.burst) { a.burstLeft = d.burst; a.burstT = 0; a.fireCd = 1 / d.rate; return; }
    shoot(a, it, aimOrigin, aimDir);
    a.fireCd = Math.max(1 / d.rate, 0.09);
    return;
  }
  if (!fresh) return;
  if (a.equipT > 0 || a.channel || a.fireCd > 0) return;
  if (d.type === 'melee') return swing(a, aimOrigin, aimDir);
  useItem(a, it, aimOrigin, aimDir);
}

const muzzleW = new THREE.Vector3();
function shoot(a, it, aimOrigin, aimDir) {
  const d = stat(it);
  it.mag--;
  const ads = a.adsT > 0.6;
  let spread = (ads ? d.adsSpread : d.spread) * (1 + a.bloom);
  if (a.state !== 'ground') spread *= 1.5;
  if (a.crouch && d.cls !== 'shotgun') spread *= 0.75;
  if (d.cls === 'sniper' && !ads) spread = d.spread;
  a.bloom = Math.min(1.2, a.bloom + d.bloom);
  const pellets = d.pellets || 1, dirs = [];
  for (let i = 0; i < pellets; i++) {
    const dir = aimDir.clone();
    if (spread > 0) {
      // gleichmäßig im Kegel (bei Shotguns passend zum Viereck-Fadenkreuz)
      const ang = Math.random() * Math.PI * 2, rad = (d.pellets ? Math.sqrt(Math.random()) : Math.random()) * spread * DEG;
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(ang) * Math.tan(rad)).addScaledVector(up, Math.sin(ang) * Math.tan(rad)).normalize();
    }
    dirs.push(dir);
  }
  const visual = isClient();
  for (const dir of dirs) spawnProjectile(a, d, it, aimOrigin.clone(), dir.clone(), visual);
  if (visual) req.fire(aimOrigin, dirs, it.key, it.rarity || 0); else net.shot(a, aimOrigin, dirs, it.key);
  flash(a);
  // Rückstoß: Waffe geht hoch, Kamera auch
  a.kickVis = Math.min(0.5, (a.kickVis || 0) + d.kick * 0.18);
  if (a === G.player) emit('recoil', d.recoil * DEG * (ads ? 0.75 : 1), (Math.random() - 0.5) * d.recoil * 0.35 * DEG);
  const dist = a === G.player ? 0 : a.pos.distanceTo(G.camera.position);
  sfx(d.cls, dist);
}

function flash(a) {
  if (!a.heldModel) return;
  const m = a.heldModel.getObjectByName('muzzle');
  if (m && a.model.visible) { m.getWorldPosition(muzzleW); muzzleFlash(muzzleW); }
}

// Host: Schüsse eines entfernten Spielers mit dessen Richtungen nachrechnen
export function remoteShots(a, origin, dirs, key, rarity) {
  const it = { key, rarity }, d = stat(it);
  for (const dir of dirs) spawnProjectile(a, d, it, origin.clone(), dir.clone().normalize(), false);
  a.kickVis = Math.min(0.5, (a.kickVis || 0) + d.kick * 0.18);
  flash(a); sfx(d.cls, a.pos.distanceTo(G.camera.position));
}
// Client: Schüsse anderer nur anzeigen
export function visualShots(a, origin, dirs, key) {
  const it = { key, rarity: 0 }, d = stat(it);
  for (const dir of dirs) spawnProjectile(a, d, it, origin.clone(), dir.clone().normalize(), true);
  a.kickVis = Math.min(0.5, (a.kickVis || 0) + d.kick * 0.18);
  flash(a); sfx(d.cls, a.pos.distanceTo(G.camera.position));
}

function spawnProjectile(owner, d, it, origin, dir, visual) {
  const p = {
    visual, owner, pos: origin, prev: origin.clone(), vel: dir.multiplyScalar(d.speed), grav: d.grav,
    dmg: d.dmg, head: d.head, cls: d.cls, key: it.key, life: d.life, travel: 0, splash: d.splash || 0,
  };
  const mesh = new THREE.Mesh(d.cls === 'rocket' ? rocketGeo : tracerGeo, d.cls === 'rocket' ? mat('#5a5a4a') : tracerMat);
  mesh.visible = false;
  G.scene.add(mesh); p.mesh = mesh;
  G.projectiles.push(p);
}

const step = new THREE.Vector3(), nd = new THREE.Vector3();
export function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i];
    p.prev.copy(p.pos);
    p.vel.y -= p.grav * dt;
    step.copy(p.vel).multiplyScalar(dt);
    const len = step.length();
    p.pos.add(step); p.travel += len; p.life -= dt;
    nd.copy(step).divideScalar(len);
    let wall = raycast(p.prev, nd, len);
    const carT = rayCars(p.prev, nd, len);
    if (carT >= 0 && (!wall || carT < wall.distance)) wall = { distance: carT, point: p.prev.clone().addScaledVector(nd, carT) };
    const wallS = wall ? wall.distance / len : 2;
    const hit = hitActors(p.prev, p.pos, p.owner);
    let done = p.life <= 0 || p.pos.y < -25;
    if (hit && hit.s < wallS) {
      const at = p.prev.clone().addScaledVector(step, hit.s);
      if (p.visual) puff(at, '#a83a2a', 3, 0.07, 2);
      else if (p.splash) explode(at, p.splash, p.dmg, p.owner, p.key);
      else {
        let dmg = p.dmg * (hit.head ? p.head : 1);
        if (p.cls === 'shotgun') dmg *= THREE.MathUtils.clamp(1 - (p.travel - 8) / 40, 0.4, 1);
        damage(hit.actor, dmg, p.owner, { head: hit.head, pos: at, weapon: p.key });
        puff(at, '#a83a2a', 3, 0.07, 2);
      }
      done = true;
    } else if (wall) {
      if (p.splash && !p.visual) explode(wall.point, p.splash, p.dmg, p.owner, p.key);
      else if (!p.splash) puff(wall.point, '#c9c2b0', 3, 0.06, 2);
      done = true;
    }
    // Leuchtspur
    const vis = p.travel > 2.5 || p.cls === 'rocket';
    p.mesh.visible = vis;
    if (vis) {
      p.mesh.position.copy(p.pos).addScaledVector(nd, -Math.min(len, 1.6) / 2);
      p.mesh.lookAt(p.mesh.position.clone().add(nd));
      if (p.cls !== 'rocket') p.mesh.scale.set(1, 1, Math.min(len, p.cls === 'shotgun' ? 0.8 : 1.6));
    }
    if (done) { G.scene.remove(p.mesh); G.projectiles.splice(i, 1); }
  }
}

export function explode(pos, radius, dmg, owner, key) {
  explosion(pos, radius);
  net.boom(pos, radius, 'exp');
  sfx('boom', pos.distanceTo(G.camera.position));
  const c = pos.clone(); c.y += 0.4;
  for (const a of G.actors) {
    if (!a.alive || a.state === 'bus') continue;
    const center = a.pos.clone(); center.y += 1;
    const d = center.distanceTo(pos);
    if (d > radius + 0.5) continue;
    if (!lineOfSight(c, center)) continue;
    const f = THREE.MathUtils.clamp(1 - d / (radius + 0.5), 0.3, 1);
    damage(a, dmg * f, owner, { pos: center, cause: key ? DEFS[key].name : 'Explosion', weapon: key });
  }
}

// ---------- Spitzhacke ----------
function swing(a, origin, dir) {
  a.fireCd = 1 / DEFS.pickaxe.rate; a.swingT = 0.4;
  if (isClient()) {
    req.melee(origin, dir); sfx('pickaxe');
    // sofortiges Feedback, Schaden rechnet der Host
    const o = meleeObject(a, origin, dir);
    if (o) { wobbleObject(o.obj); puff(o.point, '#b8a88a', 5, 0.08, 3); if (a === G.player) emit('recoil', 0.012, 0); }
    return;
  }
  remoteMelee(a, origin, dir);
}
function meleeObject(a, origin, dir) {
  const from = new THREE.Vector3(a.pos.x, a.pos.y + 1.3, a.pos.z);
  const target = origin.clone().addScaledVector(dir, 3.2);
  const d = target.sub(from), len = Math.min(3.0, d.length()); d.normalize();
  const hit = raycast(from, d, len);
  const obj = objectAtHit(hit);
  return obj ? { obj, point: hit.point } : null;
}
export function remoteMelee(a, origin, dir) {
  a.swingT = 0.4;
  const from = a.pos.clone(); from.y += 1.35;
  const to = from.clone().addScaledVector(dir, DEFS.pickaxe.range);
  const hit = hitActors(from, to, a);
  if (hit) damage(hit.actor, DEFS.pickaxe.dmg, a, { pos: to, weapon: 'pickaxe' });
  else {
    const o = meleeObject(a, origin, dir);
    if (o) {
      hitObject(o.obj, 50);
      puff(o.point, '#b8a88a', 5, 0.08, 3);
      if (a === G.player) { emit('objHit', o.obj); emit('recoil', 0.012, 0); }
      else if (a.isRemote) net.objHitFor(a, o.obj);
    }
  }
  sfx('pickaxe', a === G.player ? 0 : a.pos.distanceTo(G.camera.position));
}

// Gebäude/Bäume/Steine abbauen (Host bzw. Solo)
export function hitObject(o, dmg) {
  if (!o.alive) return;
  o.hp -= dmg;
  wobbleObject(o);
  if (o.hp <= 0) breakObject(o);
  net.obj(o);
}
export function breakObject(o) {
  const c = o.pos.clone(); c.y += 1.5;
  puff(c, '#9a8c74', 22, 0.35, 6);
  puff(c, '#6f6a62', 12, 0.25, 4);
  sfx('boom', c.distanceTo(G.camera.position) + 60);
  destroyObject(o);
}

// ---------- Items ----------
function consume(a, it) {
  it.count--;
  if (it.count > 0) return;
  const empty = a.slot;
  a.inv[empty] = null;
  let next = 0;
  for (let i = 1; i <= 5; i++) { const s = ((empty - 1 - i + 10) % 5) + 1; if (a.inv[s]) { next = s; break; } }
  a.slot = -1; switchSlot(a, next);
}

function useItem(a, it, origin, dir) {
  const d = DEFS[it.key];
  switch (d.type) {
    case 'heal': if (a.hp >= d.cap) { if (a === G.player) emit('toast', 'Gesundheit bereits voll'); return; }
      a.channel = { slot: a.slot, t: 0, total: d.time, label: d.name }; return;
    case 'shield': if (a.shield >= d.cap) { if (a === G.player) emit('toast', 'Schild bereits voll'); return; }
      a.channel = { slot: a.slot, t: 0, total: d.time, label: d.name }; return;
    case 'throw': {
      const from = a.pos.clone(); from.y += 1.6;
      const v = dir.clone().multiplyScalar(22); v.y += 5;
      if (isClient()) { req.throw(it.key, from, v); addThrowable(it.key, from, v, a, true); }
      else { addThrowable(it.key, from, v, a, false); net.throwV(it.key, from, v); }
      a.fireCd = 0.6; consume(a, it); return;
    }
    case 'place': {
      const p = a.pos.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 2.6);
      p.y = groundBelow(new THREE.Vector3(p.x, a.pos.y + 2, p.z), 8);
      if (Math.abs(p.y - a.pos.y) > 3) { if (a === G.player) emit('toast', 'Hier nicht platzierbar'); return; }
      if (isClient()) req.pad(p, a.yaw); else { addPad(p, a.yaw); net.pad(p, a.yaw); }
      consume(a, it); a.fireCd = 0.5; return;
    }
    case 'grapple': {
      const hit = raycast(origin, dir, d.range);
      if (!hit) { if (a === G.player) emit('toast', 'Zu weit weg'); a.fireCd = 0.3; return; }
      a.grapple = { point: hit.point.clone(), t: 0 };
      a.state = 'grapple'; a.fallImmune = true;
      consume(a, it); a.fireCd = 0.5; sfx('launch', a === G.player ? 0 : 50); return;
    }
    case 'rift': {
      puff(a.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#6a4abf', 16, 0.2, 5);
      a.pos.y = Math.max(groundBelow(a.pos), 0) + 95;
      a.vel.set(0, 0, 0); a.state = 'skydive'; a.fallImmune = true;
      consume(a, it); a.fireCd = 0.5; if (a === G.player) sfx('launch'); return;
    }
  }
}

export function addPad(p, yaw) {
  const m = makeLaunchPad(); m.position.copy(p); m.rotation.y = yaw; G.scene.add(m);
  G.pads.push({ pos: p.clone(), yaw, mesh: m, r: 1.3, power: 46 });
}
function addThrowable(key, from, v, owner, visual) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(DEFS[key].color));
  mesh.castShadow = true; mesh.position.copy(from); G.scene.add(mesh);
  G.throwables.push({ key, pos: from.clone(), vel: v.clone(), fuse: DEFS[key].fuse, owner, mesh, visual });
}
export const remoteThrow = (a, key, p, v) => addThrowable(key, p, v, a, false);
export const visualThrow = (key, p, v) => addThrowable(key, p, v, null, true);

export function updateThrowables(dt) {
  for (let i = G.throwables.length - 1; i >= 0; i--) {
    const t = G.throwables[i];
    t.vel.y -= 20 * dt;
    step.copy(t.vel).multiplyScalar(dt);
    const len = step.length();
    if (len > 0) {
      nd.copy(step).divideScalar(len);
      const hit = raycast(t.pos, nd, len + 0.13);
      if (hit) {
        if (t.key === 'shockwave') { if (!t.visual) detonate(t, hit.point); G.scene.remove(t.mesh); G.throwables.splice(i, 1); continue; }
        const n = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
        t.vel.reflect(n).multiplyScalar(0.35);
        t.pos.copy(hit.point).addScaledVector(n, 0.14);
      } else t.pos.add(step);
    }
    t.fuse -= dt;
    t.mesh.position.copy(t.pos);
    if (t.key === 'grenade' && t.fuse <= 0) { if (!t.visual) detonate(t, t.pos); G.scene.remove(t.mesh); G.throwables.splice(i, 1); }
    else if (t.pos.y < -10) { G.scene.remove(t.mesh); G.throwables.splice(i, 1); }
  }
}

function detonate(t, pos) {
  const d = DEFS[t.key];
  if (t.key === 'grenade') { explode(pos, d.radius, d.dmg, t.owner, 'grenade'); return; }
  shockRing(pos, d.radius);
  net.boom(pos, d.radius, 'shock');
  sfx('boom', pos.distanceTo(G.camera.position) + 30);
  for (const a of G.actors) {
    if (!a.alive || a.state === 'bus') continue;
    const dx = a.pos.x - pos.x, dz = a.pos.z - pos.z, dy = a.pos.y + 0.9 - pos.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > d.radius) continue;
    const h = Math.hypot(dx, dz) || 1;
    a.vel.set(dx / h * 20, 26, dz / h * 20);
    if (a.isRemote) { net.knock(a, a.vel); continue; }
    if (a.state === 'car') continue;
    a.state = 'launch'; a.fallImmune = true; a.onGround = false; a.slideT = 0;
    a.pos.y += 0.3;
  }
}

// ---------- Timer pro Akteur ----------
export function updateActorCombat(a, dt) {
  a.fireCd -= dt; a.equipT -= dt; a.swingT = Math.max(0, a.swingT - dt);
  a.kickVis = (a.kickVis || 0) * Math.exp(-dt * 9);
  a.bloom = Math.max(0, a.bloom - dt * 1.6);
  const it = current(a);
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0 && it && DEFS[it.key].type === 'gun') {
      const d = DEFS[it.key];
      const take = Math.min(d.mag - it.mag, a.ammo[d.ammo]);
      it.mag += take; a.ammo[d.ammo] -= take;
      if (a === G.player) sfx('reload');
    }
  }
  if (it && DEFS[it.key].type === 'gun' && it.mag === 0 && a.reloadT <= 0 && a.fireCd <= 0 && a.burstLeft <= 0 && a.equipT <= 0) startReload(a);
  if (a.burstLeft > 0 && it) {
    a.burstT -= dt;
    if (a.burstT <= 0) {
      if (it.mag > 0) {
        const aim = a.aimRay ? a.aimRay() : null;
        if (aim) shoot(a, it, aim[0], aim[1]);
        a.burstLeft--; a.burstT = DEFS[it.key].burstGap;
      } else a.burstLeft = 0;
    }
  }
  if (a.channel) {
    const c = a.channel;
    if (!it || a.slot !== c.slot) { a.channel = null; return; }
    c.t += dt;
    if (c.t >= c.total) {
      const d = DEFS[it.key];
      if (d.type === 'heal') a.hp = Math.min(d.cap, a.hp + d.hp);
      else a.shield = Math.min(d.cap, a.shield + d.sh);
      if (a === G.player) sfx('heal');
      a.channel = null;
      if (isClient() && a === G.player) req.vitals(a);
      consume(a, it);
    }
  }
  if (a.state === 'grapple' && a.grapple) {
    const g = a.grapple; g.t += dt;
    const to = _w.subVectors(g.point, a.pos); to.y -= 0.8;
    const dist = to.length();
    if (dist < 2.2 || g.t > 1.8) { a.state = 'air'; a.vel.multiplyScalar(0.7); a.vel.y = Math.max(a.vel.y, 7); a.grapple = null; }
    else a.vel.copy(to.normalize().multiplyScalar(36));
  }
}
