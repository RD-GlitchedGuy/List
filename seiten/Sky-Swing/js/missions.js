// Missionen: Kurier (Paket abholen und zustellen) und Verfolgungsjagd (Dieb-Drohne fangen)
import * as THREE from 'three';
import { $, V3, rand, rr } from './util.js';
import { scene } from './engine.js';
import { roofTops, aveX, strZ, NX, NZ } from './city.js';
import { P, mode, fx } from './state.js';
import { hero } from './hero.js';
import { best, saveBest } from './settings.js';
import { score } from './score.js';
import { sfx } from './audio.js';
import { showMove } from './hud.js';
import { rumble } from './input.js';

export const nav = { p: null, label: '' };       // wohin der Richtungspfeil zeigt
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function reward(pts, txt) { score.total += pts; if (score.total > best.score) { best.score = score.total; saveBest(); } showMove(`${txt}  +${pts.toLocaleString('de-DE')}`, 2200); sfx('success', { vol: .6, vary: .2, rev: .3 }); rumble(.4, 120); fx.punch = .4; }

/* ---------- Markierungen ---------- */
const beamMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending });
const beamGeo = new THREE.CylinderGeometry(.8, .8, 500, 12, 1, true).translate(0, 250, 0);
const pkgBeam = new THREE.Mesh(beamGeo, beamMat(0xffa040)), dropBeam = new THREE.Mesh(beamGeo, beamMat(0x40d0ff));
const pkg = new THREE.Mesh(new THREE.BoxGeometry(1.1, .8, .8), new THREE.MeshStandardMaterial({ color: 0xc8823a, emissive: 0xff7a1a, emissiveIntensity: .6, roughness: .7 }));
const carried = new THREE.Mesh(new THREE.BoxGeometry(.42, .32, .26), pkg.material); carried.position.set(0, .04, -.2);
const dropRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, .25, 10, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9ee6ff, emissive: 0x40d0ff, emissiveIntensity: 2.5 }));
[pkgBeam, dropBeam, pkg, dropRing].forEach(m => { m.visible = false; scene.add(m); });

/* ---------- Kurier ---------- */
export const courier = { stage: 'pickup', a: new V3(), b: new V3(), time: 0, done: 0 };
function pickRoof(from, dmin, dmax) {
  for (let k = 0; k < 400; k++) { const r = roofTops[Math.floor(rand() * roofTops.length)]; const p = new V3(r[0], r[1], r[2]); const d = Math.hypot(p.x - from.x, p.z - from.z); if (r[1] > 18 && r[1] < 160 && d > dmin && d < dmax) return p; }
  const r = roofTops[0]; return new V3(r[0], r[1], r[2]);
}
function newJob() {
  courier.a.copy(pickRoof(P.pos, 120, 380)); courier.b.copy(pickRoof(courier.a, 280, 650));
  courier.stage = 'pickup'; courier.time = courier.a.distanceTo(P.pos) / 18 + 15;
  pkg.position.copy(courier.a).setY(courier.a.y + .6); pkgBeam.position.copy(courier.a);
  pkg.visible = pkgBeam.visible = true; dropRing.visible = dropBeam.visible = false; carried.removeFromParent();
}
export function startCourier() { mode.name = 'courier'; courier.done = 0; newJob(); showMove('Kurier: hol das Paket!', 2000); }

/* ---------- Verfolgungsjagd ---------- */
const drone = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: .4, metalness: .6 });
  drone.add(new THREE.Mesh(new THREE.SphereGeometry(.7, 16, 12).scale(1.3, .5, 1.3), dark));
  drone.add(new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8).translate(0, -.1, .8), new THREE.MeshStandardMaterial({ color: 0x55ff99, emissive: 0x22ff77, emissiveIntensity: 3 })));
  drone.rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    drone.add(new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 1.3).rotateY(Math.atan2(x, z)).translate(x * .55, 0, z * .55), dark));
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .03, 14), new THREE.MeshStandardMaterial({ color: 0x88ffbb, emissive: 0x22ff77, emissiveIntensity: 1.2, transparent: true, opacity: .55 }));
    r.position.set(x * .95, .15, z * .95); drone.add(r); drone.rotors.push(r);
  }
  // Sack mit Beute
  drone.add(new THREE.Mesh(new THREE.SphereGeometry(.35, 10, 8).translate(0, -.75, 0), new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: .9 })));
  drone.visible = false; scene.add(drone);
}
export const chase = { time: 0, node: [0, 0], next: [0, 0], speed: 22, pos: new V3(), dir: new V3(0, 0, 1), h: 30, hTarget: 30 };
const nodePos = (n, h) => new V3(aveX(n[0]), h, strZ(n[1]));
function nextNode() {
  const [i, j] = chase.next, opts = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && a <= NX && b >= 0 && b <= NZ && !(a === chase.node[0] && b === chase.node[1]));
  // bevorzugt weg vom Spieler
  opts.sort((A, B) => nodePos(B, 0).distanceTo(P.pos) - nodePos(A, 0).distanceTo(P.pos) + rr(-60, 60));
  chase.node = chase.next; chase.next = opts[0];
  chase.hTarget = rr(18, 60);
}
export function startChase() {
  mode.name = 'chase';
  // Start ein paar Kreuzungen vom Spieler entfernt
  let bi = 4, bj = 12, bd = 1e9;
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) { const d = Math.abs(nodePos([i, j], 0).distanceTo(P.pos) - 140); if (d < bd) { bd = d; bi = i; bj = j; } }
  chase.node = [bi, bj]; chase.next = [bi, bj]; chase.h = chase.hTarget = 35;
  chase.pos.copy(nodePos([bi, bj], 35)); nextNode();
  chase.time = 90; chase.speed = 22; drone.visible = true;
  showMove('Fang die Dieb-Drohne!', 2000);
}

export function stopMissions() {
  pkg.visible = pkgBeam.visible = dropRing.visible = dropBeam.visible = false; carried.removeFromParent();
  drone.visible = false; nav.p = null;
}

/* ---------- pro Frame ---------- */
const _c = new V3();
export function updateMissions(dt, t) {
  const box = $('raceBox');
  if (mode.name === 'courier') {
    const c = courier; c.time -= dt;
    const me = _c.copy(P.pos).setY(P.pos.y + .9);
    pkg.rotation.y += dt * 1.5;
    if (c.stage === 'pickup' && me.distanceTo(pkg.position) < 3.5) {
      c.stage = 'deliver'; c.time += c.a.distanceTo(c.b) / 20 + 8;
      pkg.visible = pkgBeam.visible = false; hero.B.chest.add(carried);
      dropRing.position.copy(c.b).setY(c.b.y + .4); dropBeam.position.copy(c.b); dropRing.visible = dropBeam.visible = true;
      showMove('Paket! Jetzt zustellen', 1600); sfx('package', { vol: .8 }); sfx('pickup', { vol: .4, delay: .1 });
    } else if (c.stage === 'deliver' && me.distanceTo(dropRing.position) < 4.5) {
      c.done++; if (c.done > best.courier) { best.courier = c.done; saveBest(); }
      reward(500 + Math.round(Math.max(0, c.time) * 25), `Zugestellt (${c.done})`); newJob();
    }
    if (c.time <= 0) { showMove('Zu spät! Neuer Auftrag', 2000); sfx('fail', { vol: .5 }); c.done = 0; newJob(); }
    dropRing.rotation.y += dt;
    nav.p = c.stage === 'pickup' ? pkg.position : dropRing.position; nav.label = c.stage === 'pickup' ? 'Paket' : 'Ziel';
    box.style.display = 'block';
    $('raceTime').textContent = fmt(Math.max(0, c.time)); $('raceLbl').textContent = 'Zugestellt'; $('raceRing').textContent = c.done;
    $('raceBest').textContent = 'Rekord ' + best.courier + ' am Stück';
  } else if (mode.name === 'chase') {
    const C = chase; C.time -= dt; C.speed = Math.min(34, C.speed + dt * .12);
    const tgt = nodePos(C.next, C.h);
    C.h += (C.hTarget - C.h) * Math.min(1, dt * .8);
    const dist = P.pos.distanceTo(C.pos);
    // ausweichen, wenn der Spieler nah ist
    if (dist < 18) C.hTarget = P.pos.y > C.pos.y ? Math.max(14, C.pos.y - 12) : Math.min(80, C.pos.y + 12);
    const to = tgt.clone().sub(C.pos); to.y = C.h - C.pos.y;
    const step = C.speed * dt * (dist < 25 ? 1.15 : 1);
    if (Math.hypot(to.x, to.z) < step + 1) nextNode();
    C.dir.lerp(to.normalize(), Math.min(1, dt * 3)).normalize();
    C.pos.addScaledVector(C.dir, step);
    drone.position.copy(C.pos).add(new V3(0, Math.sin(t * 3) * .3, 0));
    drone.rotation.set(C.dir.y * -.4 + .25, Math.atan2(C.dir.x, C.dir.z), Math.sin(t * 2) * .1);
    drone.rotors.forEach((r, i) => r.rotation.y += dt * (40 + i));
    if (P.pos.clone().setY(P.pos.y + .9).distanceTo(C.pos) < 3.3) {
      const used = 90 - C.time; if (best.chase == null || used < best.chase) { best.chase = used; saveBest(); }
      sfx('impact_wall', { vol: .5, rate: 1.4, pos: C.pos.clone() }); reward(800 + Math.round(C.time * 15), 'Erwischt!'); startChase();
      return;
    }
    if (C.time <= 0) { showMove('Entkommen! Neue Drohne', 2200); sfx('fail', { vol: .5 }); startChase(); }
    nav.p = C.pos; nav.label = 'Drohne';
    box.style.display = 'block';
    $('raceTime').textContent = fmt(Math.max(0, C.time)); $('raceLbl').textContent = 'Abstand'; $('raceRing').textContent = Math.round(dist) + ' m';
    $('raceBest').textContent = best.chase != null ? 'Schnellster Fang ' + fmt(best.chase) : '';
  }
}
