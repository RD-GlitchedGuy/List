// Fahrbare Autos: Einsteigen mit E, WASD fahren, Leertaste Handbremse
import * as THREE from 'three';
import { G, GRAVITY, WATER_Y } from './state.js';
import { raycast, groundBelow } from './physics.js';
import { heightAt, objectAtHit } from './world.js';
import { damage } from './actors.js';
import { hitObject } from './combat.js';
import { isClient } from './net.js';
import { sfx } from './audio.js';

const SMASH = new Set(['Zaun', 'Heuballen', 'Laterne', 'Lagerfeuer', 'Stein']);
const MAX = 27, REV = 9, ACC = 11, TURN = 1.7;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fw = new THREE.Vector3(), q = new THREE.Vector3();
const eul = new THREE.Euler(0, 0, 0, 'YXZ');

export function placeCar(c) {
  eul.set(c.pitch, c.yaw, c.roll); c.root.quaternion.setFromEuler(eul);
  c.root.position.copy(c.pos);
}
// Kompaktwagen haben vier Sitze, alle anderen zwei. Sitz 0 = Fahrer.
export const seatCount = c => (c.name === 'Kompaktwagen' ? 4 : 2);
export function initCars() {
  for (const c of G.cars) {
    c.pass = new Array(seatCount(c) - 1).fill(null);
    c.pos.y = groundAt(c, c.pos.x, c.pos.z); placeCar(c); c.home = { pos: c.pos.clone(), yaw: c.yaw };
  }
}
export function freeSeat(c) {
  if (!c.driver) return 0;
  const i = c.pass.findIndex(p => !p || !p.alive || p.car !== c);
  return i >= 0 ? i + 1 : -1;
}
// Sitz belegen / freigeben (auch für Netz-Abgleich)
export function setSeat(c, a, seat) {
  if (seat === 0) c.driver = a; else c.pass[seat - 1] = a;
  a.car = c; a.seat = seat;
}
export function clearSeat(a) {
  const c = a.car; if (!c) return;
  if (c.driver === a) c.driver = null;
  const i = c.pass.indexOf(a); if (i >= 0) c.pass[i] = null;
  a.car = null; a.seat = 0; a.lean = false;
}
export function resetCars() {
  for (const c of G.cars) {
    c.pos.copy(c.home.pos); c.yaw = c.home.yaw; c.pitch = c.roll = 0; c.speed = 0; c.vy = 0; c.steer = 0;
    c.driver = null; c.pass.fill(null); c.netPos = null; placeCar(c);
  }
}

// Boden unter einem Punkt: Strahl von oberhalb des Autos, damit es auch steile Hänge hinauf findet
function groundAt(c, x, z) {
  const g = groundBelow(q.set(x, c.pos.y + 3.2, z), 9);
  return Number.isFinite(g) && g > -50 ? g : heightAt(x, z);
}

// input: { throttle -1..1, steer -1..1, brake }
export function driveCar(c, dt, input) {
  const want = input.throttle;
  if (input.brake) c.speed *= Math.exp(-dt * 3.5);
  else if (want > 0) c.speed += (c.speed < 0 ? ACC * 2 : ACC) * dt;
  else if (want < 0) c.speed -= (c.speed > 0 ? ACC * 2.2 : ACC * 0.7) * dt;
  else c.speed *= Math.exp(-dt * 0.6);
  c.speed -= Math.sin(c.pitch) * 7 * dt;                 // bergauf langsamer, bergab schneller
  c.speed = THREE.MathUtils.clamp(c.speed, -REV, MAX);
  c.steer += (input.steer - c.steer) * Math.min(1, dt * 6);
  const grip = c.vy !== 0 ? 0.25 : 1;
  c.yaw -= c.steer * TURN * dt * THREE.MathUtils.clamp(c.speed / 7, -1, 1) * grip * (input.brake ? 1.4 : 1);
  stepCar(c, dt);
}

export function stepCar(c, dt) {
  fw.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
  const dist = c.speed * dt;
  if (Math.abs(dist) > 1e-4) {
    const dir = v1.copy(fw).multiplyScalar(Math.sign(dist));
    const side = v2.set(-fw.z, 0, fw.x);
    let blocked = false;
    // Nur steile Flächen (Wände, Bäume, Felsen) halten das Auto auf – Hänge und kleine Kanten werden befahren
    for (const s of [-0.8, 0, 0.8]) {
      const o = new THREE.Vector3(c.pos.x, c.pos.y + 0.95, c.pos.z).addScaledVector(side, s * c.half.x);
      const hit = raycast(o, dir, c.half.z + Math.abs(dist) + 0.1);
      // Gelände zählt nie als Wand (Hänge prüft die Steigungsregel unten), nur Gebäude/Bäume/Felsen mit steiler Fläche
      if (hit && hit.point.y > heightAt(hit.point.x, hit.point.z) + 0.3 && (!hit.face || Math.abs(hit.face.normal.y) < 0.55)) {
        // Kleinkram (Zaun, Heuballen, Laterne …) fährt man mit Schwung einfach um
        const ob = objectAtHit(hit);
        if (ob && SMASH.has(ob.name) && Math.abs(c.speed) > 9 && !isClient()) { hitObject(ob, 9999); c.speed *= 0.8; continue; }
        blocked = true; break;
      }
    }
    const nx = c.pos.x + fw.x * dist, nz = c.pos.z + fw.z * dist;
    const edge = Math.sign(dist) * c.half.z * 0.9;
    const fx = nx + fw.x * edge, fz = nz + fw.z * edge;
    if (!blocked && heightAt(fx, fz) < WATER_Y - 0.6) blocked = true;
    // Zu steil? Boden an der Vorderkante jetzt und nach dem Schritt vergleichen (Hänge bis ~50° gehen, Mauern/Klippen nicht)
    if (!blocked) {
      const hNow = groundAt(c, c.pos.x + fw.x * edge, c.pos.z + fw.z * edge), hNew = groundAt(c, fx, fz);
      if (hNew - hNow > Math.max(0.45, Math.abs(dist) * 1.25)) blocked = true;
    }
    if (blocked) {
      if (Math.abs(c.speed) > 8) sfx('carcrash', c.driver === G.player ? 0 : c.pos.distanceTo(G.camera.position), { vol: Math.min(1, Math.abs(c.speed) / 25) });
      c.speed = -c.speed * 0.25;
    } else { c.pos.x = nx; c.pos.z = nz; }
  }
  // Boden unter den vier Rädern (links = Fahrtrichtung gedreht um 90° nach links)
  const L = c.half.z * 0.8, W = c.half.x * 0.8;
  const lx = fw.z, lz = -fw.x;                                   // Vektor nach links
  const wheel = (f, s) => groundAt(c, c.pos.x + fw.x * L * f + lx * W * s, c.pos.z + fw.z * L * f + lz * W * s);
  const fl = wheel(1, 1), fr = wheel(1, -1), bl = wheel(-1, 1), br = wheel(-1, -1);
  const hf = (fl + fr) / 2, hb = (bl + br) / 2, hl = (fl + bl) / 2, hr = (fr + br) / 2;
  const target = Math.max((fl + fr + bl + br) / 4, groundAt(c, c.pos.x, c.pos.z));
  if (c.pos.y > target + 0.35) { c.vy -= GRAVITY * dt; c.pos.y += c.vy * dt; if (c.pos.y < target) { c.pos.y = target; c.vy = 0; } }
  else { c.pos.y += (target - c.pos.y) * Math.min(1, dt * 18); if (c.pos.y < target - 0.05) c.pos.y = target - 0.05; c.vy = 0; }
  // Neigung folgt dem Gelände (nur am Boden, in der Luft bleibt sie)
  if (c.vy === 0) {
    // Nase hoch = positiver Pitch; positive Rollung hebt die rechte Seite -> rechts höher = positiv
    const tp = Math.atan2(hf - hb, L * 2), tr = Math.atan2(hr - hl, W * 2);
    c.pitch += (THREE.MathUtils.clamp(tp, -0.75, 0.75) - c.pitch) * Math.min(1, dt * 10);
    c.roll += (THREE.MathUtils.clamp(tr, -0.55, 0.55) - c.roll) * Math.min(1, dt * 10);
  }
  placeCar(c);
}

// Akteure aus Autos herausdrücken, überfahren = Schaden
export function pushFromCars(a) {
  for (const c of G.cars) {
    const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z;
    if (dx * dx + dz * dz > 40 || a.car === c) continue;
    if (a.pos.y > c.pos.y + c.half.y + 0.1 || a.pos.y + a.height < c.pos.y - 0.2) continue;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    // in lokale Koordinaten (x = rechts, z = hinten)
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    const hx = c.half.x + a.radius, hz = c.half.z + a.radius;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    // auf dem Dach stehen?
    if (a.pos.y > c.pos.y + c.half.y - 0.45 && a.vel.y <= 0) { a.pos.y = c.pos.y + c.half.y; a.vel.y = 0; a.onGround = true; continue; }
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let nlx = lx, nlz = lz;
    if (px < pz) nlx = Math.sign(lx || 1) * hx; else nlz = Math.sign(lz || 1) * hz;
    a.pos.x = c.pos.x + nlx * co + nlz * s; a.pos.z = c.pos.z - nlx * s + nlz * co;
    if (Math.abs(c.speed) > 8 && c.driver && c.driver !== a && (a.carHitCd || 0) < G.time) {
      a.carHitCd = G.time + 0.8;
      damage(a, Math.abs(c.speed) * 2.2, c.driver, { cause: 'Auto' });
      a.vel.set(-s * c.speed * 0.7, 7, -co * c.speed * 0.7);
      a.state = 'air'; a.onGround = false;
      c.speed *= 0.75;
    }
  }
}

export function nearestCar(a, range = 3.6) {
  let best = null, bd = range;
  for (const c of G.cars) {
    if (freeSeat(c) < 0) continue;
    const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) - Math.max(c.half.x, c.half.z) * 0.6;
    if (d < bd && Math.abs(a.pos.y - c.pos.y) < 2.5) {
      const from = new THREE.Vector3(a.pos.x, a.pos.y + 1.2, a.pos.z), to = new THREE.Vector3(c.pos.x, c.pos.y + 0.8, c.pos.z);
      const dir = to.clone().sub(from), len = dir.length();
      if (raycast(from, dir.divideScalar(len), len)) continue;   // Wand dazwischen
      bd = d; best = c;
    }
  }
  return best;
}

export function enterCar(a, c, seat = freeSeat(c)) {
  if (seat < 0) return false;
  setSeat(c, a, seat); a.state = 'car'; a.vel.set(0, 0, 0);
  a.crouch = false; a.slideT = 0; a.ads = false; a.channel = null; a.reloadT = 0;
  sfx('cardoor', a === G.player ? 0 : c.pos.distanceTo(G.camera.position));
  return true;
}

export function exitCar(a) {
  const c = a.car; if (!c) return;
  clearSeat(a);
  sfx('cardoor', a === G.player ? 0 : c.pos.distanceTo(G.camera.position));
  const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
  for (const s of [-1, 1]) {
    const p = c.pos.clone().addScaledVector(side, s * (c.half.x + 0.8));
    p.y = c.pos.y + 0.5;
    if (!raycast(new THREE.Vector3(c.pos.x, c.pos.y + 0.9, c.pos.z), side.clone().multiplyScalar(s), c.half.x + 0.9)) { a.pos.copy(p); break; }
    a.pos.copy(c.pos).add(new THREE.Vector3(0, c.half.y + 0.2, 0));
  }
  a.vel.set(-Math.sin(c.yaw) * c.speed * 0.5, 2, -Math.cos(c.yaw) * c.speed * 0.5);
  a.state = 'air'; a.onGround = false;
}

// Sitzpositionen (x = rechts, z = hinten, in halben Autobreiten/-längen). Beim Rauslehnen sitzt man auf der Fensterkante.
const SEATS = [[-0.35, 0.05], [0.35, 0.05], [-0.35, 0.45], [0.35, 0.45]];
export function seatActor(a) {
  const c = a.car, s = SEATS[a.seat || 0];
  const out = a.lean ? Math.sign(s[0]) * 0.55 : 0;
  const off = new THREE.Vector3(c.half.x * (s[0] + out), a.lean ? 0.42 : 0.05, c.half.z * s[1]).applyQuaternion(c.root.quaternion);
  a.pos.copy(c.pos).add(off);
  if (!a.seat) a.yaw = c.yaw;
  a.vel.set(-Math.sin(c.yaw) * c.speed, 0, -Math.cos(c.yaw) * c.speed);
}

// Schüsse treffen Autos (einfacher Quader-Test), liefert Abstand oder -1
export function rayCars(from, dir, len, skip) {
  let best = -1;
  for (const c of G.cars) {
    if (c === skip) continue;
    const dx = from.x - c.pos.x, dz = from.z - c.pos.z;
    if (dx * dx + dz * dz > (len + 6) * (len + 6)) continue;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const ox = dx * co - dz * s, oz = dx * s + dz * co, oy = from.y - c.pos.y - c.half.y * 0.45;
    const rx = dir.x * co - dir.z * s, rz = dir.x * s + dir.z * co, ry = dir.y;
    let t0 = 0, t1 = len;
    for (const [o, r, h] of [[ox, rx, c.half.x], [oy, ry, c.half.y * 0.45], [oz, rz, c.half.z]]) {
      if (Math.abs(r) < 1e-6) { if (Math.abs(o) > h) { t0 = 1; t1 = 0; break; } continue; }
      let a = (-h - o) / r, b = (h - o) / r; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1 && (best < 0 || t0 < best)) best = t0;
  }
  return best;
}
