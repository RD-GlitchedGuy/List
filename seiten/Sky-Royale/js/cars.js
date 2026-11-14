// Fahrbare Autos: Einsteigen mit E, WASD fahren, Leertaste Handbremse
import * as THREE from 'three';
import { G, GRAVITY, WATER_Y } from './state.js';
import { raycast, groundBelow } from './physics.js';
import { heightAt } from './world.js';
import { damage } from './actors.js';
import { sfx } from './audio.js';

const MAX = 27, REV = 9, ACC = 11, TURN = 1.7;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fw = new THREE.Vector3(), q = new THREE.Vector3();
const eul = new THREE.Euler(0, 0, 0, 'YXZ');

export function placeCar(c) {
  eul.set(c.pitch, c.yaw, c.roll); c.root.quaternion.setFromEuler(eul);
  c.root.position.copy(c.pos);
}
export function initCars() { for (const c of G.cars) { c.pos.y = groundAt(c, c.pos.x, c.pos.z); placeCar(c); } }

function groundAt(c, x, z) { return groundBelow(q.set(x, c.pos.y + 2.5, z), 8); }

// input: { throttle -1..1, steer -1..1, brake }
export function driveCar(c, dt, input) {
  const want = input.throttle;
  if (input.brake) c.speed *= Math.exp(-dt * 3.5);
  else if (want > 0) c.speed += (c.speed < 0 ? ACC * 2 : ACC) * dt;
  else if (want < 0) c.speed -= (c.speed > 0 ? ACC * 2.2 : ACC * 0.7) * dt;
  else c.speed *= Math.exp(-dt * 0.6);
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
    for (const s of [-0.8, 0, 0.8]) {
      const o = new THREE.Vector3(c.pos.x, c.pos.y + 0.75, c.pos.z).addScaledVector(side, s * c.half.x);
      if (raycast(o, dir, c.half.z + Math.abs(dist) + 0.1)) { blocked = true; break; }
    }
    const nx = c.pos.x + fw.x * dist, nz = c.pos.z + fw.z * dist;
    if (!blocked && heightAt(nx + fw.x * c.half.z * Math.sign(dist), nz + fw.z * c.half.z * Math.sign(dist)) < WATER_Y - 0.6) blocked = true;
    if (blocked) {
      if (Math.abs(c.speed) > 10 && c.driver === G.player) sfx('land');
      c.speed = -c.speed * 0.25;
    } else { c.pos.x = nx; c.pos.z = nz; }
  }
  // Boden unter Vorder-/Hinterachse und Seiten
  const L = c.half.z * 0.8, W = c.half.x * 0.8;
  const hf = groundAt(c, c.pos.x + fw.x * L, c.pos.z + fw.z * L), hb = groundAt(c, c.pos.x - fw.x * L, c.pos.z - fw.z * L);
  const hl = groundAt(c, c.pos.x + fw.z * W, c.pos.z - fw.x * W), hr = groundAt(c, c.pos.x - fw.z * W, c.pos.z + fw.x * W);
  const target = Math.max((hf + hb) / 2, (hl + hr) / 2);
  if (c.pos.y > target + 0.25) { c.vy -= GRAVITY * dt; c.pos.y += c.vy * dt; if (c.pos.y < target) { c.pos.y = target; c.vy = 0; } }
  else { c.pos.y += (target - c.pos.y) * Math.min(1, dt * 14); c.vy = 0; }
  const tp = Math.atan2(hf - hb, L * 2), tr = Math.atan2(hl - hr, W * 2);
  c.pitch += (THREE.MathUtils.clamp(tp, -0.6, 0.6) - c.pitch) * Math.min(1, dt * 8);
  c.roll += (THREE.MathUtils.clamp(tr, -0.5, 0.5) - c.roll) * Math.min(1, dt * 8);
  placeCar(c);
}

// Akteure aus Autos herausdrücken, überfahren = Schaden
export function pushFromCars(a) {
  for (const c of G.cars) {
    const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z;
    if (dx * dx + dz * dz > 40 || c.driver === a) continue;
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
    if (c.driver) continue;
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

export function enterCar(a, c) {
  c.driver = a; a.car = c; a.state = 'car'; a.vel.set(0, 0, 0);
  a.crouch = false; a.slideT = 0; a.ads = false; a.channel = null; a.reloadT = 0;
  if (a === G.player) sfx('pickup');
}

export function exitCar(a) {
  const c = a.car; if (!c) return;
  c.driver = null; a.car = null;
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

// Sitzposition des Fahrers (Figur sichtbar im Auto)
export function seatActor(a) {
  const c = a.car;
  const off = new THREE.Vector3(-c.half.x * 0.35, 0.05, c.half.z * 0.05).applyQuaternion(c.root.quaternion);
  a.pos.copy(c.pos).add(off);
  a.yaw = c.yaw; a.vel.set(-Math.sin(c.yaw) * c.speed, 0, -Math.cos(c.yaw) * c.speed);
}

// Schüsse treffen Autos (einfacher Quader-Test), liefert Abstand oder -1
export function rayCars(from, dir, len) {
  let best = -1;
  for (const c of G.cars) {
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
