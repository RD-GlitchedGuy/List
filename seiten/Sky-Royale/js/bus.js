// Battle-Bus: fliegt über die Insel, Leertaste = Abspringen, Emote-Taste = beim Busfahrer bedanken
import * as THREE from 'three';
import { G, emit } from './state.js';
import { makeBus } from './models.js';
import { net, isClient, req } from './net.js';
import { sfx } from './audio.js';

const ALT = 120, SPEED = 26, HALF = 430, DOOR_DELAY = 2.5;
// Sehr, sehr selten lässt einen der Busfahrer nach dem Bedanken ans Steuer (?busfahrer in der Adresse erzwingt es)
const WHEEL_CHANCE = /busfahrer/i.test(location.search) ? 1 : 0.01;

export function startBus() {
  const ang = Math.random() * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 120);
  const center = new THREE.Vector3(-4, ALT, -3).add(side);
  startBusWith(center.clone().addScaledVector(dir, -HALF), center.clone().addScaledVector(dir, HALF), dir);
  net.bus(G.bus);
}

export function startBusWith(start, end, dir) {
  if (G.bus && G.bus.model) G.scene.remove(G.bus.model);
  const model = makeBus();
  model.position.copy(start);
  model.rotation.y = Math.atan2(-dir.x, -dir.z);
  G.scene.add(model);
  G.bus = { model, start, end, dir: dir.clone(), t: 0, len: start.distanceTo(end), pos: start.clone(), doors: false, done: false, progress: 0,
    driver: null, steer: 0, yaw: Math.atan2(dir.z, dir.x), dist: 0 };
  sfx('horn');
}

export function updateBus(dt) {
  const b = G.bus; if (!b || b.done) return;
  b.t += dt;
  const dur = b.len / SPEED;
  if (b.driver) {
    // Gelenkter Bus: fährt geradeaus weiter, die Richtung dreht mit der Lenkung
    if (!isClient()) {
      if (!b.driver.alive || b.driver.state !== 'bus') b.steer = 0;
      b.yaw += b.steer * 0.55 * dt;
      b.dir.set(Math.cos(b.yaw), 0, Math.sin(b.yaw));
      b.pos.addScaledVector(b.dir, SPEED * dt);
    } else if (b.netPos) {
      b.pos.lerp(b.netPos, 1 - Math.exp(-dt * 8));
      b.dir.set(Math.cos(b.netYaw), 0, Math.sin(b.netYaw));
    }
    b.progress = Math.min(1, b.t / (dur * 1.6));
  } else {
    const d = Math.min(b.len, b.t * SPEED);
    b.pos.copy(b.start).addScaledVector(b.dir, d);
    b.progress = d / b.len;
  }
  b.model.position.copy(b.pos);
  b.model.position.y += Math.sin(b.t * 1.3) * 0.35;
  b.model.rotation.y = Math.atan2(-b.dir.x, -b.dir.z);
  b.model.rotation.z = Math.sin(b.t * 0.9) * 0.03 - b.steer * 0.12;
  b.doors = b.t > DOOR_DELAY;
  for (const a of G.actors) if (a.state === 'bus') a.pos.copy(b.pos);
  const off = Math.hypot(b.pos.x, b.pos.z) > HALF + 15 && b.t > dur * 0.4;
  if (b.progress >= 1 || (b.driver && off)) {
    if (!isClient()) for (const a of G.actors) if (a.state === 'bus' && !a.isRemote && !a.isPuppet) exitBus(a);   // automatischer Rauswurf
    if (isClient() && G.player.state === 'bus') exitBus(G.player);
    b.done = true;
    setTimeout(() => { G.scene.remove(b.model); }, 4000);
  }
}

export function exitBus(a) {
  const b = G.bus;
  a.state = 'skydive'; a.diving = false;
  a.pos.copy(b.pos).add(new THREE.Vector3(0, -3, 0));
  a.vel.copy(b.dir).multiplyScalar(SPEED * 0.5);
  a.vel.y = -5;
  a.model.visible = true;
  a.onGround = false;
}

// Beim Busfahrer bedanken (einmal pro Runde)
export function thankDriver(a) {
  if (a.thanked || !G.bus || a.state !== 'bus') return;
  a.thanked = true;
  if (isClient()) { req.thank(); sfx('ping'); return; }
  emit('feed', a === G.player ? 'Du hast dich beim Busfahrer bedankt' : `${a.name} hat sich beim Busfahrer bedankt`, a === G.player);
  net.feed(`${a.name} hat sich beim Busfahrer bedankt`, a);
  if (a === G.player) sfx('ping');
  if (!a.isBot && !G.bus.driver && Math.random() < WHEEL_CHANCE) giveWheel(a);
}

function giveWheel(a) {
  const b = G.bus;
  b.driver = a; b.steer = 0;
  b.yaw = Math.atan2(b.dir.z, b.dir.x);
  sfx('horn');
  emit('feed', `Der Busfahrer überlässt ${a === G.player ? 'dir' : a.name} das Steuer!`, true);
  net.feed(`Der Busfahrer überlässt ${a.name} das Steuer!`, a, `Der Busfahrer überlässt dir das Steuer!`);
  net.wheel(a);
  if (a === G.player) emit('wheel');
}
