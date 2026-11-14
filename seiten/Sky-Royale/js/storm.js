// Sturm: schrumpft in Phasen, nicht zu schnell
import * as THREE from 'three';
import { G } from './state.js';
import { isLand } from './world.js';
import { damage } from './actors.js';
import { sfx } from './audio.js';
import { isClient } from './net.js';

// wait = Wartezeit, shrink = Dauer des Zusammenziehens, r = Zielradius, dmg pro Sekunde
const PHASES = [
  { wait: 90, shrink: 70, r: 210, dmg: 1 },
  { wait: 70, shrink: 60, r: 130, dmg: 2 },
  { wait: 60, shrink: 50, r: 75,  dmg: 5 },
  { wait: 45, shrink: 45, r: 38,  dmg: 8 },
  { wait: 35, shrink: 40, r: 16,  dmg: 10 },
  { wait: 25, shrink: 35, r: 0,   dmg: 10 },
];

export function createStorm() {
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#6a3a9a'; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${150 + Math.random() * 60},${90 + Math.random() * 40},210,${0.15 + Math.random() * 0.25})`; x.fillRect(Math.random() * 64, 0, 2 + Math.random() * 6, 256); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 2); return t;
  })();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 600, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  );
  wall.position.y = 150; wall.visible = false;
  G.scene.add(wall);
  G.storm = { wall, tex, active: false, phase: -1, t: 0, shrinking: false,
    cx: 0, cz: 0, r: 460, fromX: 0, fromZ: 0, fromR: 460, nx: 0, nz: 0, nr: 460, dmg: 1, tick: 0 };
}

export function startStorm() {
  const s = G.storm;
  s.active = true; s.phase = 0; s.t = 0; s.shrinking = false;
  s.cx = s.cz = 0; s.r = 460; s.wall.visible = true;
  planNext();
}

function planNext() {
  const s = G.storm, ph = PHASES[s.phase];
  s.fromX = s.cx; s.fromZ = s.cz; s.fromR = s.r;
  // neues Zentrum innerhalb des aktuellen Kreises, bevorzugt auf Land
  const maxOff = Math.max(0, s.r - ph.r);
  let x = s.cx, z = s.cz;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * Math.min(maxOff, s.phase === 0 ? 90 : maxOff);
    const tx = s.cx + Math.cos(a) * d, tz = s.cz + Math.sin(a) * d;
    if (isLand(tx, tz) || i === 39) { x = tx; z = tz; if (isLand(tx, tz)) break; }
  }
  s.nx = x; s.nz = z; s.nr = ph.r; s.dmg = ph.dmg;
}

export function updateStorm(dt) {
  const s = G.storm; if (!s) return;
  if (isClient()) { stormVisual(s, dt); return; }   // Client: Werte kommen vom Host
  if (!s.active) return;
  const ph = PHASES[s.phase];
  s.t += dt;
  if (!s.shrinking && s.t >= ph.wait) { s.shrinking = true; s.t = 0; sfx('storm'); }
  if (s.shrinking) {
    const k = Math.min(1, s.t / ph.shrink);
    s.cx = s.fromX + (s.nx - s.fromX) * k; s.cz = s.fromZ + (s.nz - s.fromZ) * k; s.r = s.fromR + (s.nr - s.fromR) * k;
    if (k >= 1 && s.phase < PHASES.length - 1) { s.phase++; s.t = 0; s.shrinking = false; planNext(); }
  }
  stormVisual(s, dt);

  s.tick += dt;
  if (s.tick >= 1) {
    s.tick = 0;
    for (const a of G.actors) if (a.alive && a.state !== 'bus' && outside(a.pos)) damage(a, s.dmg, null, { ignoreShield: true, cause: 'Sturm' });
  }
}

export function outside(p) {
  const s = G.storm; if (!s || !s.active) return false;
  return Math.hypot(p.x - s.cx, p.z - s.cz) > s.r;
}

// Text für HUD
export function stormInfo() {
  const s = G.storm; if (!s || !s.active) return null;
  const ph = PHASES[Math.max(0, s.phase)];
  const left = Math.max(0, (s.shrinking ? ph.shrink : ph.wait) - s.t);
  return { shrinking: s.shrinking, left, final: s.phase === PHASES.length - 1 && s.shrinking && s.t >= ph.shrink };
}

function stormVisual(s, dt) {
  s.wall.visible = s.active && s.r < 400;
  s.wall.position.x = s.cx; s.wall.position.z = s.cz;
  s.wall.scale.set(Math.max(s.r, 0.5), 1, Math.max(s.r, 0.5));
  s.tex.offset.x += dt * 0.01; s.tex.offset.y -= dt * 0.03;
}
