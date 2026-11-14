// Battle-Bus: fliegt über die Insel, Leertaste = Abspringen
import * as THREE from 'three';
import { G } from './state.js';
import { makeBus } from './models.js';
import { net } from './net.js';
import { sfx } from './audio.js';

const ALT = 120, SPEED = 26, HALF = 430, DOOR_DELAY = 2.5;

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
  G.bus = { model, start, end, dir, t: 0, len: start.distanceTo(end), pos: start.clone(), doors: false, done: false, progress: 0 };
  sfx('horn');
}

export function updateBus(dt) {
  const b = G.bus; if (!b || b.done) return;
  b.t += dt;
  const d = Math.min(b.len, b.t * SPEED);
  b.pos.copy(b.start).addScaledVector(b.dir, d);
  b.model.position.copy(b.pos);
  b.model.position.y += Math.sin(b.t * 1.3) * 0.35;
  b.model.rotation.z = Math.sin(b.t * 0.9) * 0.03;
  b.doors = b.t > DOOR_DELAY;
  b.progress = d / b.len;
  for (const a of G.actors) if (a.state === 'bus') a.pos.copy(b.pos);
  if (d >= b.len) {
    for (const a of G.actors) if (a.state === 'bus' && !a.isRemote && !a.isPuppet) exitBus(a);   // automatischer Rauswurf
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
