// Ring-Rennen: eine Route durch die Häuserschluchten, Countdown, Zeit, Bestzeit
import * as THREE from 'three';
import { V3 } from './util.js';
import { scene } from './engine.js';
import { aveX, strZ } from './city.js';
import { P, mode } from './state.js';
import { best, saveBest } from './settings.js';
import { sfx } from './audio.js';
import { showMove } from './hud.js';

// Kreuzungen (Avenue, Straße), durch die die Route führt
const NODES = [[4, 12], [4, 7], [2, 7], [2, 3], [6, 3], [6, 9], [8, 9], [8, 15], [3, 15], [3, 12]];
export const rings = [];
{
  const pts = NODES.map(([i, j]) => new V3(aveX(i), 0, strZ(j)));
  let acc = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1], L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    for (let d = s === 0 ? 60 : 0; d < L - 10; d += 115) {
      const p = a.clone().addScaledVector(dir, d); acc++;
      p.y = 26 + 16 * Math.sin(acc * 1.3) + 8 * Math.sin(acc * .45);
      rings.push({ p, n: dir.clone() });
    }
  }
  const last = pts[pts.length - 1].clone(); last.y = 30; rings.push({ p: last, n: pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize() });
}
const R = 7.5;
const ringGeo = new THREE.TorusGeometry(R, .45, 14, 56);
const matNext = new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff7a1a, emissiveIntensity: 3 });
const matLater = new THREE.MeshStandardMaterial({ color: 0xdde6ff, emissive: 0x9ec8ff, emissiveIntensity: .8, transparent: true, opacity: .55 });
const matDone = new THREE.MeshStandardMaterial({ color: 0x55606b, transparent: true, opacity: .15 });
const group = new THREE.Group(); group.visible = false; scene.add(group);
rings.forEach(r => { const m = new THREE.Mesh(ringGeo, matLater); m.position.copy(r.p); m.lookAt(r.p.clone().add(r.n)); r.m = m; group.add(m); });
// Lichtsäule über dem nächsten Ring, damit man ihn von weitem sieht
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 400, 10, 1, true).translate(0, 200, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
group.add(beam);

export const race = { idx: 0, time: 0, count: 0, running: false, done: false };

export function startRace() {
  mode.name = 'race'; group.visible = true;
  Object.assign(race, { idx: 0, time: 0, count: 3.2, running: false, done: false });
  paint();
}
export function stopRace() { mode.name = 'free'; group.visible = false; race.running = false; }
function paint() {
  rings.forEach((r, i) => { r.m.material = i < race.idx ? matDone : i === race.idx ? matNext : matLater; r.m.visible = i >= race.idx - 1; });
  const nx = rings[race.idx]; beam.visible = !!nx; if (nx) beam.position.set(nx.p.x, nx.p.y + R, nx.p.z);
}
export const nextRing = () => rings[race.idx];

const _c = new V3();
export function updateRace(dt, onDone) {
  if (mode.name !== 'race') return;
  rings.forEach((r, i) => { if (i === race.idx) r.m.rotation.z += dt * 1.5; });
  if (race.count > 0) {
    const before = Math.ceil(race.count); race.count -= dt;
    if (race.count <= 0) { race.running = true; showMove('LOS!'); sfx('perfect', { vol: .6, vary: 0 }); }
    else if (Math.ceil(race.count) !== before) sfx('tick', { vol: .7, vary: 0, rate: .8 });
    return;
  }
  if (!race.running) return;
  race.time += dt;
  const r = rings[race.idx];
  if (r && _c.copy(P.pos).setY(P.pos.y + .9).distanceTo(r.p) < R + .8) {
    race.idx++; sfx('ring', { vol: .7, rate: 1 + Math.min(.4, race.idx * .015), vary: .2, rev: .3 }); paint();
    if (race.idx >= rings.length) {
      race.running = false; race.done = true;
      const t = race.time, rec = best.race == null || t < best.race;
      if (rec) { best.race = t; saveBest(); }
      onDone(t, rec);
    }
  }
}
