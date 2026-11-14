// Bot-KI: Absprung, Looten, Kämpfen, vor dem Sturm fliehen
import * as THREE from 'three';
import { G, rand, pick } from './state.js';
import { DEFS, AMMO } from './items.js';
import { createActor, switchSlot } from './actors.js';
import { updateMovement, startSlide } from './movement.js';
import { trigger, current } from './combat.js';
import { exitBus } from './bus.js';
import { openChest, pickup } from './loot.js';
import { lineOfSight, raycast } from './physics.js';
import { heightAt, isLand } from './world.js';

const NAMES = ['Nebelkrähe', 'KaktusKalle', 'Pixelpilot', 'Sturmvogel', 'Wolkenwal', 'Flinkfuß', 'Rostbart', 'Moorhexe', 'Lavaluchs',
  'Sandsturm', 'Frostzahn', 'Quarkbrot', 'Bohnenkönig', 'Funkenflug', 'Silberfuchs', 'Kiesel', 'Grummel', 'Dachs_77', 'Nordlicht',
  'Zackenbarsch', 'Brombeere', 'Kettensäge', 'Laubfrosch', 'Wirbelwind', 'Paprika', 'Seeteufel', 'Hagel', 'Tintenfisch'];
const DEG = Math.PI / 180;
const PREF_DIST = { shotgun: 5, smg: 11, pistol: 14, ar: 26, sniper: 70, rocket: 32, pickaxe: 1.5 };

export function createBots(n) {
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < n; i++) {
    const a = createActor(names[i % names.length], true, i + 1);
    const ai = {
      skill: rand(0.3, 0.85), think: Math.random() * 0.4, target: null, targetSeen: 0, reaction: 0,
      goal: null, goalObj: null, strafe: 1, strafeT: 0, stuckT: 0, lastPos: new THREE.Vector3(), detourT: 0, detour: 1,
      aimDir: new THREE.Vector3(0, 0, -1), aimErr: new THREE.Vector3(), dropTarget: null, jumpProg: 1,
      ignore: new Set(), goalSince: 0, escapeT: 0, escX: 0, escZ: 0, route: [], stuckN: 0,
      onHit(att) { if (!this.target || !this.target.alive || Math.random() < 0.5) { this.target = att; this.reaction = Math.min(this.reaction, 0.25); this.targetSeen = G.time; } },
    };
    a.ai = ai;
    a.aimRay = () => [eye(a), ai.aimDir.clone()];
  }
}

const eye = a => new THREE.Vector3(a.pos.x, a.pos.y + (a.crouch ? 1.1 : 1.5), a.pos.z);

// Landeziele entlang der Bus-Route verteilen
export function planBotDrops() {
  const b = G.bus;
  const spots = [...G.chests.map(c => c.pos), ...G.houses.map(h => h.pos)];
  for (const a of G.actors) {
    if (!a.isBot) continue;
    const cands = spots.filter(p => lineDist(p, b) < 105);
    const t = (cands.length ? pick(cands) : pick(spots)).clone();
    const ang = Math.random() * Math.PI * 2, off = rand(5, 9);   // neben dem Haus landen, nicht auf dem Dach
    t.x += Math.cos(ang) * off; t.z += Math.sin(ang) * off;
    a.ai.dropTarget = t;
    a.ai.jumpProg = rand(0.15, 0.9);
  }
}
function lineDist(p, b) {
  const v = new THREE.Vector3(p.x - b.start.x, 0, p.z - b.start.z);
  const along = v.dot(b.dir);
  return Math.hypot(v.x - b.dir.x * along, v.z - b.dir.z * along);
}

export function updateBots(dt) {
  for (const a of G.actors) if (a.isBot && a.alive) updateBot(a, dt);
}

function updateBot(a, dt) {
  const ai = a.ai;
  if (a.state === 'bus') {
    const b = G.bus;
    if (b.doors && (Math.hypot(b.pos.x - ai.dropTarget.x, b.pos.z - ai.dropTarget.z) < 95 || b.progress > ai.jumpProg + 0.1)) exitBus(a);
    return;
  }
  if (a.state === 'skydive' || a.state === 'glide' || a.state === 'launch') {
    const t = ai.dropTarget || a.pos;
    const dx = t.x - a.pos.x, dz = t.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, d / 8);
    const hAbove = a.pos.y - heightAt(a.pos.x, a.pos.z);
    updateMovement(a, dt, { mx: dx / d * k, mz: dz / d * k, jump: false, dive: d < hAbove * 0.7 ? 1 : 0 });
    a.yaw = Math.atan2(-dx, -dz);
    return;
  }

  ai.think -= dt;
  if (ai.think <= 0) { ai.think = rand(0.22, 0.4); decide(a, ai); }

  // ---- Bewegung ----
  let mx = 0, mz = 0, jump = false;
  const tgt = ai.target && ai.target.alive ? ai.target : null;
  const close = tgt && tgt.pos.distanceTo(a.pos) < 6 && G.time - (a.lastHitTime || -9) < 4;
  const fighting = tgt && G.phase !== 'warmup' && G.time - ai.targetSeen < 2.5 && (hasGun(a) || close) && !a.channel;
  if (fighting) {
    const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    const it = current(a); const cls = it ? DEFS[it.key].cls || 'ar' : 'ar';
    const want = PREF_DIST[cls] || 20;
    const ux = dx / d, uz = dz / d;
    const hurt = a.reloadT > 0 || a.hp + a.shield < 55;
    // Deckung suchen beim Nachladen oder mit wenig Leben
    if (hurt && G.time > (ai.coverCheck || 0)) { ai.coverCheck = G.time + 1.2; ai.cover = findCover(a, tgt); }
    if (hurt && ai.cover && Math.hypot(ai.cover.x - a.pos.x, ai.cover.z - a.pos.z) > 1) {
      const cx = ai.cover.x - a.pos.x, cz = ai.cover.z - a.pos.z, cl = Math.hypot(cx, cz);
      mx = cx / cl; mz = cz / cl; a.sprint = cl > 3; a.crouch = false;
    } else {
      const fwd = THREE.MathUtils.clamp((d - want) / 6, -1, 1);
      // Strafen: wechselnde Richtung und Tempo, ab und zu kurz stehen bleiben zum Zielen
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) {
        const r = Math.random();
        ai.strafe = r < 0.12 ? 0 : (r < 0.56 ? -1 : 1) * (Math.random() < 0.3 ? -ai.strafe || 1 : 1);
        ai.strafeT = rand(0.3, 1.1) * (1.25 - ai.skill * 0.5);
      }
      const side = ai.strafe * (0.55 + 0.45 * Math.sin(G.time * 3.1 + a.id));
      mx = ux * fwd + -uz * side; mz = uz * fwd + ux * side;
      a.sprint = fwd > 0.7 && d > want + 12;
      if (a.sprint && a.onGround && d > 14 && Math.random() < dt * 0.4) startSlide(a);
      const jumpRate = (d < 15 ? 1.1 : 0.45) * (0.4 + ai.skill);
      if (a.onGround && !a.slideT && Math.random() < dt * jumpRate) jump = true;
      a.crouch = !a.slideT && ((cls === 'sniper' && d > 40 && Math.abs(fwd) < 0.3) || (ai.strafe === 0 && d > 25));
    }
    aimAndFire(a, ai, tgt, dt);
  } else if (ai.escapeT > 0) {
    ai.escapeT -= dt; mx = ai.escX; mz = ai.escZ; a.sprint = false;
  } else {
    a.crouch = false;
    if (ai.route.length && Math.hypot(ai.route[0].x - a.pos.x, ai.route[0].z - a.pos.z) < 1.1) ai.route.shift();
    const wp = ai.route.length ? ai.route[0] : ai.goal;
    if (wp) {
      const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > (ai.route.length ? 0.3 : 1.0)) { mx = dx / d; mz = dz / d; }
      a.sprint = d > 8;
      const look = Math.atan2(-mx, -mz);
      if (mx || mz) a.yaw = lerpAngle(a.yaw, look, Math.min(1, dt * 8));
      a.pitch *= 0.9;
    }
    if (G.phase === 'warmup' && a.onGround && Math.random() < dt * 0.25) jump = true;
  }
  // Festhängen erkennen
  if (mx || mz) {
    ai.stuckT += dt;
    if (ai.stuckT > 0.7) {
      const moved = Math.hypot(a.pos.x - ai.lastPos.x, a.pos.z - ai.lastPos.z);
      if (moved < 0.8) {
        jump = true; ai.stuckN++;
        if (ai.stuckN % 3 === 2 && ai.goal) ai.route = planRoute(a, ai.goal);
        else if (Math.random() < 0.5) { ai.detourT = 1.2; ai.detour = Math.random() < 0.5 ? -1 : 1; }
      } else ai.stuckN = 0;
      ai.stuckT = 0; ai.lastPos.copy(a.pos);
    }
  }
  if (ai.detourT > 0) {
    ai.detourT -= dt;
    const t = mx; mx = -mz * ai.detour; mz = t * ai.detour;
  }
  // Hindernissen und Wasser ausweichen (Fühler nach vorn), kleine Kanten überspringen
  if (mx || mz) {
    ai.avoidT = (ai.avoidT || 0) - dt;
    if (ai.avoidT <= 0) { ai.avoidT = 0.12; steerAround(a, ai, mx, mz); }
    if (ai.avoidAng) { const c = Math.cos(ai.avoidAng), sn = Math.sin(ai.avoidAng); const x = mx * c - mz * sn; mz = mx * sn + mz * c; mx = x; }
    if (ai.lowJump && a.onGround) { jump = true; ai.lowJump = false; }
    if (!fighting && a.sprint && a.onGround && !a.slideT && Math.random() < dt * 0.05) startSlide(a);
  }
  // weiche Richtungswechsel statt Zucken
  const k = Math.min(1, dt * (fighting ? 9 : 6));
  ai.mx = (ai.mx || 0) + (mx - (ai.mx || 0)) * k; ai.mz = (ai.mz || 0) + (mz - (ai.mz || 0)) * k;
  mx = ai.mx; mz = ai.mz;
  if (!fighting && Math.hypot(mx, mz) > 0.2) a.yaw = lerpAngle(a.yaw, Math.atan2(-mx, -mz), Math.min(1, dt * 7));
  updateMovement(a, dt, { mx, mz, jump });

  // Truhen/Loot erreichen
  if (ai.goalObj && !fighting) {
    const o = ai.goalObj;
    const p = o.pos;
    const hd = Math.hypot(p.x - a.pos.x, p.z - a.pos.z), dy = p.y - a.pos.y;
    if (G.time - ai.goalSince > 11) { ai.ignore.add(o); ai.goalObj = null; ai.goal = null; ai.think = 0; return; }
    if (hd < 5 && dy < -2.2 && a.onGround && ai.escapeT <= 0) {      // steht auf dem Dach -> runter
      let ex = a.pos.x - p.x, ez = a.pos.z - p.z; const l = Math.hypot(ex, ez);
      if (l < 0.3) { const r = Math.random() * 6.28; ex = Math.cos(r); ez = Math.sin(r); } else { ex /= l; ez /= l; }
      ai.escX = ex; ai.escZ = ez; ai.escapeT = 2.2;
    }
    if (hd < 2.1 && Math.abs(dy) < 2.2) {
      if (o.type) { if (!o.opened) openChest(o, a); }
      else if (G.loot.includes(o)) { prepareSwap(a, o); pickup(a, o); afterPickup(a, o); }
      ai.goalObj = null; ai.goal = null; ai.think = 0.15;
    }
  }
}

function decide(a, ai) {
  // Gegner suchen
  if (G.phase !== 'warmup') {
    const e = eye(a);
    const range = hasClass(a, 'sniper') ? 140 : 95;
    if (!hasGun(a) && !(ai.target && ai.target.alive && G.time - (a.lastHitTime || -9) < 4)) ai.target = null;
    else if (!ai.target || !ai.target.alive || G.time - ai.targetSeen > 3) {
      const cands = G.actors.filter(o => o !== a && o.alive && o.state !== 'bus' && o.pos.distanceTo(a.pos) < range)
        .sort((x, y) => x.pos.distanceTo(a.pos) - y.pos.distanceTo(a.pos)).slice(0, 3);
      ai.target = null;
      for (const c of cands) {
        if (lineOfSight(e, eye(c))) { ai.target = c; ai.targetSeen = G.time; ai.reaction = rand(0.35, 0.9) * (1.35 - ai.skill); break; }
      }
    } else if (lineOfSight(e, eye(ai.target))) ai.targetSeen = G.time;
    if (ai.target && ai.target.alive) chooseWeapon(a, ai.target.pos.distanceTo(a.pos));
  }
  const fighting = ai.target && ai.target.alive && G.time - ai.targetSeen < 2.5 && hasGun(a);

  if (G.phase === 'warmup') {
    if (!ai.goal || Math.random() < 0.15) ai.goal = randomNear(G.spawnCenter, 40, true);
    return;
  }
  if (fighting) return;

  // Heilen
  if (a.hp + a.shield < 130 && !a.channel) {
    const s = findSlot(a, it => (DEFS[it.key].type === 'heal' && a.hp < DEFS[it.key].cap) || (DEFS[it.key].type === 'shield' && a.shield < DEFS[it.key].cap));
    if (s > 0) { switchSlot(a, s); setTimeout(() => { if (a.alive && a.slot === s) trigger(a, eye(a), ai.aimDir, true); }, 260); ai.goal = null; return; }
  }
  if (a.channel) { ai.goal = null; return; }
  if (!current(a) || DEFS[current(a).key].type !== 'gun') { const s = findSlot(a, it => DEFS[it.key].type === 'gun'); if (s > 0) switchSlot(a, s); }

  // Sturm
  const st = G.storm;
  if (st && st.active) {
    const dNext = Math.hypot(a.pos.x - st.nx, a.pos.z - st.nz), dNow = Math.hypot(a.pos.x - st.cx, a.pos.z - st.cz);
    if (dNow > st.r - 8 || dNext > st.nr * 0.9) {
      const ang = Math.atan2(a.pos.z - st.nz, a.pos.x - st.nx);
      const r = st.nr * 0.5;
      ai.goal = new THREE.Vector3(st.nx + Math.cos(ang) * r, 0, st.nz + Math.sin(ang) * r); ai.goalObj = null;
      return;
    }
  }
  // Looten
  if (!ai.goalObj || (ai.goalObj.type ? ai.goalObj.opened : !G.loot.includes(ai.goalObj))) {
    ai.goalObj = null;
    let best = null, bd = 60;
    for (const l of G.loot) { if (l.t < 1 || ai.ignore.has(l) || l.pos.y - heightAt(l.pos.x, l.pos.z) > 3 || !wants(a, l.item)) continue; const d = l.pos.distanceTo(a.pos); if (d < bd) { bd = d; best = l; } }
    if (!best || bd > 12) for (const c of G.chests) { if (c.opened || ai.ignore.has(c) || c.pos.y - heightAt(c.pos.x, c.pos.z) > 3) continue; const d = c.pos.distanceTo(a.pos) + (c.type === 'ammo' ? 15 : 0); if (d < Math.min(bd, 75)) { bd = d; best = c; } }
    if (best) { ai.goalObj = best; ai.goal = best.pos; ai.goalSince = G.time; ai.route = planRoute(a, best.pos); return; }
  } else return;
  // Herumlaufen
  if (!ai.goal || ai.goal.distanceTo(a.pos) < 3 || Math.random() < 0.02) {
    const c = st && st.active ? new THREE.Vector3(st.nx, 0, st.nz) : a.pos;
    ai.goal = randomNear(c, st && st.active ? Math.max(10, st.nr * 0.8) : 60, false);
  }
}

function aimAndFire(a, ai, tgt, dt) {
  const it = current(a); if (!it) return;
  const d = DEFS[it.key];
  const e = eye(a);
  const tp = new THREE.Vector3(tgt.pos.x, tgt.pos.y + (Math.random() < ai.skill * 0.25 ? 1.6 : 1.05), tgt.pos.z);
  const dist = e.distanceTo(tp);
  if (d.speed) {
    const t = dist / d.speed;
    tp.addScaledVector(tgt.vel, t * ai.skill);
    tp.y += 0.5 * d.grav * t * t * (0.6 + ai.skill * 0.4);
  }
  // Zielfehler, langsam wandernd
  const err = (1.7 - ai.skill) * 2.6 * DEG * (1 + Math.hypot(tgt.vel.x, tgt.vel.z) / 10);
  ai.aimErr.x += (Math.random() - 0.5) * err * 0.8; ai.aimErr.y += (Math.random() - 0.5) * err * 0.8;
  ai.aimErr.multiplyScalar(0.9);
  const dir = tp.sub(e).normalize();
  const yaw = Math.atan2(-dir.x, -dir.z) + ai.aimErr.x, pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) + ai.aimErr.y;
  a.yaw = lerpAngle(a.yaw, yaw, Math.min(1, dt * (4 + ai.skill * 8)));
  a.pitch += (pitch - a.pitch) * Math.min(1, dt * (4 + ai.skill * 8));
  ai.aimDir.set(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
  ai.reaction -= dt;
  if (ai.reaction > 0 || G.time - ai.targetSeen > 0.6) return;
  if (d.type === 'melee') { if (dist < 2.6) trigger(a, e, ai.aimDir, true); return; }
  if (d.type !== 'gun') return;
  const angErr = Math.abs(wrap(yaw - a.yaw));
  if (angErr > 0.12 || dist > (d.cls === 'shotgun' ? 25 : d.cls === 'smg' ? 55 : 160)) return;
  if (d.auto) trigger(a, e, ai.aimDir, Math.random() < 0.6);
  else if (a.fireCd <= 0 && Math.random() < dt * 6) trigger(a, e, ai.aimDir, true);
}

function chooseWeapon(a, dist) {
  if (a.channel || a.reloadT > 0) return;
  const order = dist < 9 ? ['shotgun', 'smg', 'pistol', 'ar'] : dist < 22 ? ['smg', 'ar', 'shotgun', 'pistol'] : dist < 60 ? ['ar', 'rocket', 'smg', 'pistol', 'sniper'] : ['sniper', 'ar', 'rocket', 'pistol'];
  for (const cls of order) {
    const s = findSlot(a, it => DEFS[it.key].cls === cls && (it.mag > 0 || a.ammo[DEFS[it.key].ammo] > 0));
    if (s > 0) { if (s !== a.slot) switchSlot(a, s); return; }
  }
  if (!hasGun(a) && a.slot !== 0) switchSlot(a, 0);
}

function wants(a, item) {
  if (item.ammo) return true;
  const d = DEFS[item.key];
  if (findSlot(a, it => it.key === item.key && d.type !== 'gun' && it.count < d.stack) > 0) return true;
  if (findSlot(a, () => false, true) > 0) return true;
  if (d.type === 'gun') { const w = worstSlot(a); return w > 0 && score(a.inv[w]) < score(item); }
  return false;
}
const score = it => { const d = DEFS[it.key]; return d.type === 'gun' ? 10 + (it.rarity || 0) * 3 + (d.cls === 'ar' || d.cls === 'shotgun' ? 2 : 0) : d.type === 'heal' || d.type === 'shield' ? 6 : 2; };
function worstSlot(a) { let w = -1, ws = 1e9; for (let s = 1; s <= 5; s++) { const it = a.inv[s]; if (it && score(it) < ws) { ws = score(it); w = s; } } return w; }
function prepareSwap(a, drop) {
  if (drop.item.ammo || findSlot(a, () => false, true) > 0) return;
  const w = worstSlot(a); if (w > 0) switchSlot(a, w);
}
function afterPickup(a, drop) {
  const it = drop.item;
  if (it.key && DEFS[it.key].type === 'gun') { const am = DEFS[it.key].ammo; if (a.ammo[am] < AMMO[am].pile) a.ammo[am] += AMMO[am].pile; }
}
function findSlot(a, fn, empty = false) {
  for (let s = 1; s <= 5; s++) { const it = a.inv[s]; if (empty ? !it : it && fn(it)) return s; }
  return -1;
}
const hasGun = a => findSlot(a, it => DEFS[it.key].type === 'gun') > 0;
const hasClass = (a, c) => findSlot(a, it => DEFS[it.key].cls === c) > 0;

// Fühler: ist die Richtung frei (Brust- und Kniehöhe, kein tiefes Wasser)?
const _o = new THREE.Vector3(), _dir = new THREE.Vector3();
function freeDir(a, x, z, dist) {
  _dir.set(x, 0, z).normalize();
  _o.set(a.pos.x, a.pos.y + 1.35, a.pos.z);
  if (raycast(_o, _dir, dist)) return 0;
  const ax = a.pos.x + _dir.x * 3, az = a.pos.z + _dir.z * 3;
  if (heightAt(ax, az) < -1.2 && heightAt(a.pos.x, a.pos.z) > -0.6 && a.state !== 'swim') return 0;
  _o.y = a.pos.y + 0.45;
  return raycast(_o, _dir, dist) ? 1 : 2;     // 1 = nur unten blockiert -> drüberspringen
}
function steerAround(a, ai, mx, mz) {
  const l = Math.hypot(mx, mz); if (l < 0.01) return;
  const x = mx / l, z = mz / l, dist = 1.4 + Math.hypot(a.vel.x, a.vel.z) * 0.25;
  const straight = freeDir(a, x, z, dist);
  if (straight === 2) { ai.avoidAng = (ai.avoidAng || 0) * 0.5; if (Math.abs(ai.avoidAng) < 0.05) ai.avoidAng = 0; return; }
  if (straight === 1) { ai.lowJump = true; return; }
  const side = ai.avoidSide || (Math.random() < 0.5 ? 1 : -1);
  for (const ang of [0.5, 0.95, 1.45, 2.0]) for (const sg of [side, -side]) {
    const t = ang * sg, c = Math.cos(t), sn = Math.sin(t);
    if (freeDir(a, x * c - z * sn, x * sn + z * c, dist) === 2) { ai.avoidAng = t; ai.avoidSide = sg; return; }
  }
  ai.avoidAng = Math.PI * 0.6 * side;
}
// Deckung: Punkt in der Nähe, den der Gegner nicht sehen kann
function findCover(a, tgt) {
  const te = eye(tgt);
  let best = null, bd = Infinity;
  for (let k = 0; k < 10; k++) for (const r of [4.5, 8]) {
    const ang = k / 10 * Math.PI * 2 + Math.random() * 0.3;
    const x = a.pos.x + Math.cos(ang) * r, z = a.pos.z + Math.sin(ang) * r;
    if (!isLand(x, z)) continue;
    const p = new THREE.Vector3(x, heightAt(x, z) + 1.2, z);
    if (Math.abs(p.y - a.pos.y) > 3 || lineOfSight(te, p) || !lineOfSight(eye(a), p)) continue;
    const d = r + p.distanceTo(tgt.pos) * -0.05;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Einfache Wegfindung: Eingang (Tür/Höhlenöffnung) zum Ziel suchen
const _d = new THREE.Vector3();
function exitsFrom(p, toward) {
  let best = null, bs = -Infinity;
  for (let k = 0; k < 48; k++) {
    const ang = k / 48 * Math.PI * 2;
    _d.set(Math.cos(ang), 0, Math.sin(ang));
    const hit = raycast(p, _d, 30);
    const free = hit ? hit.distance : 30;
    if (free < 4) continue;
    const q = p.clone().addScaledVector(_d, Math.min(free - 1.5, 12));
    const sc = free - q.distanceTo(toward) * 0.05;   // möglichst offen, dann möglichst nah
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}
function planRoute(a, goal) {
  const e = eye(a), g = new THREE.Vector3(goal.x, goal.y + 1.0, goal.z);
  if (lineOfSight(e, g)) return [];
  const route = [];
  const nearGoal = exitsFrom(g, e);
  if (nearGoal && lineOfSight(e, nearGoal)) { route.push(nearGoal); }
  else {
    const out = exitsFrom(e, nearGoal || g);
    if (out) route.push(out);
    if (nearGoal) route.push(nearGoal);
  }
  // Zwischenpunkt direkt vor dem Eingang, damit der Bot gerade hindurchläuft
  if (route.length) {
    const last = route[route.length - 1];
    const mid = last.clone().lerp(g, 0.45);
    route.push(mid);
  }
  return route;
}

function randomNear(c, r, spawn) {
  for (let i = 0; i < 25; i++) {
    const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    const x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
    if (isLand(x, z) && (!spawn || Math.hypot(x - G.spawnCenter.x, z - G.spawnCenter.z) < G.spawnRadius - 8)) return new THREE.Vector3(x, heightAt(x, z), z);
  }
  return new THREE.Vector3(c.x, 0, c.z);
}
const wrap = x => { while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; };
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
