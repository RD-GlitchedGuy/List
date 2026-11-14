// Partikel, Mündungsfeuer, Explosionen
import * as THREE from 'three';
import { G } from './state.js';

const parts = [];
const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = {};
const m = c => mats[c] || (mats[c] = new THREE.MeshBasicMaterial({ color: c }));

export function puff(pos, color = '#bdb7a8', n = 6, size = 0.12, speed = 3) {
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(geo, m(color));
    p.position.copy(pos); p.scale.setScalar(size);
    p.userData = { v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), life: 0.35 + Math.random() * 0.25, max: 0.6, s: size };
    G.scene.add(p); parts.push(p);
  }
}

export function muzzleFlash(pos) {
  const p = new THREE.Mesh(geo, m('#f3d38a'));
  p.position.copy(pos); p.scale.setScalar(0.16);
  p.userData = { v: new THREE.Vector3(), life: 0.05, max: 0.05, s: 0.16 };
  G.scene.add(p); parts.push(p);
}

const sphere = new THREE.SphereGeometry(1, 14, 10);
export function explosion(pos, radius) {
  const ball = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#e08a3a', transparent: true, opacity: 0.85, depthWrite: false }));
  ball.position.copy(pos); ball.scale.setScalar(0.3);
  ball.userData = { boom: true, life: 0.5, max: 0.5, r: radius };
  G.scene.add(ball); parts.push(ball);
  puff(pos, '#5a5550', 14, 0.45, 8);
}

export function shockRing(pos, radius) {
  const ball = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#6fa8dc', transparent: true, opacity: 0.4, depthWrite: false }));
  ball.position.copy(pos); ball.scale.setScalar(0.3);
  ball.userData = { boom: true, life: 0.35, max: 0.35, r: radius };
  G.scene.add(ball); parts.push(ball);
}

export function updateEffects(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i], u = p.userData;
    u.life -= dt;
    if (u.life <= 0) { G.scene.remove(p); if (u.boom) p.material.dispose(); parts.splice(i, 1); continue; }
    const k = u.life / u.max;
    if (u.boom) { p.scale.setScalar(u.r * (1 - k * k) + 0.3); p.material.opacity = k * 0.8; continue; }
    if (u.rise) { p.rotation.x += dt * 3; p.rotation.y += dt * 2; } else u.v.y -= 9 * dt;
    p.position.addScaledVector(u.v, dt);
    if (!u.flat) p.scale.setScalar(u.s * k);
  }
}

// Eliminierung: Figur zerfällt in aufsteigende Würfel
export function elimEffect(pos) {
  const cols = ['#5aa8e0', '#9fd0f0', '#e8f2f8', '#3a7fc2'];
  for (let i = 0; i < 46; i++) {
    const p = new THREE.Mesh(geo, m(cols[i % 4]));
    p.position.set(pos.x + (Math.random() - 0.5) * 0.7, pos.y + Math.random() * 1.8, pos.z + (Math.random() - 0.5) * 0.7);
    const s = 0.06 + Math.random() * 0.1; p.scale.setScalar(s);
    p.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2), life: 1 + Math.random() * 0.8, max: 1.8, s, rise: true };
    G.scene.add(p); parts.push(p);
  }
}

// Truhen funkeln (kleine goldene Partikel, kein Leuchten)
export function sparkle(pos) {
  const p = new THREE.Mesh(geo, m('#e8c35a'));
  p.position.set(pos.x + (Math.random() - 0.5) * 1.1, pos.y + 0.3 + Math.random() * 0.6, pos.z + (Math.random() - 0.5) * 1.1);
  p.scale.setScalar(0.05);
  p.userData = { v: new THREE.Vector3(0, 0.7, 0), life: 0.9, max: 0.9, s: 0.05, rise: true };
  G.scene.add(p); parts.push(p);
}

// Konfetti beim Sieg
const CONF = ['#f2cf5a', '#3f86d4', '#e8ecf0', '#c95b3a', '#5fb34e'];
export function confetti(center) {
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(geo, m(CONF[(Math.random() * CONF.length) | 0]));
    p.position.set(center.x + (Math.random() - 0.5) * 10, center.y + 5 + Math.random() * 5, center.z + (Math.random() - 0.5) * 10);
    p.scale.set(0.12, 0.02, 0.07);
    p.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    p.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.8, -1.4 - Math.random(), (Math.random() - 0.5) * 0.8), life: 4, max: 4, s: 0.12, rise: true, flat: true };
    G.scene.add(p); parts.push(p);
  }
}
