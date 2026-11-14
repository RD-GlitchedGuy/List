// Bewegung für Spieler und Bots: Laufen, Sprinten, Schleichen, Sliden, Schwimmen, Skydiven, Gleiten
import * as THREE from 'three';
import { G, GRAVITY, WATER_Y } from './state.js';
import { moveActor, inDeepWater, groundBelow, raycast } from './physics.js';
import { heightAt } from './world.js';
import { damage } from './actors.js';
import { pushFromCars } from './cars.js';
import { sfx } from './audio.js';

export const SPEED = { run: 5.6, sprint: 7.6, crouch: 2.6, ads: 3.6, swim: 3.4, heal: 3.2, slide: 11 };
const GLIDE_AUTO = 30, GLIDE_AUTO_DIVE = 26, GLIDE_CANCEL_MIN = 10, GLIDE_OPEN_MIN = 4;

// input: { mx, mz (Weltrichtung, Länge 0..1), jump (gedrückt), dive (0..1) }
export function updateMovement(a, dt, input) {
  if (!a.alive || a.state === 'bus' || a.state === 'car') return;
  const wishX = input.mx || 0, wishZ = input.mz || 0;
  const above = () => a.pos.y - (a.isPlayer ? groundBelow(a.pos) : Math.max(heightAt(a.pos.x, a.pos.z), WATER_Y));
  a.padCd -= dt;

  switch (a.state) {
    case 'skydive': {
      // nach dem Abbrechen des Gleiters: Sturzflug kopfüber
      const fall = a.diving ? 55 : 20 + 18 * (input.dive || 0);
      a.vel.y += (-fall - a.vel.y) * Math.min(1, dt * (a.diving ? 3 : 2.2));
      approachXZ(a, wishX * (a.diving ? 8 : 13), wishZ * (a.diving ? 8 : 13), dt * 2.2);
      const h = above();
      if ((input.jump && h > GLIDE_OPEN_MIN) || h < (a.diving ? GLIDE_AUTO_DIVE : GLIDE_AUTO)) { a.state = 'glide'; a.diving = false; if (a.isPlayer) sfx('glider'); }
      break;
    }
    case 'glide': {
      a.vel.y += (-6 - a.vel.y) * Math.min(1, dt * 6);
      approachXZ(a, wishX * 15, wishZ * 15, dt * 1.6);
      if (input.jump && above() > GLIDE_CANCEL_MIN) { a.state = 'skydive'; a.diving = true; if (a.isPlayer) sfx('jump'); }
      break;
    }
    case 'launch': {
      a.vel.y -= GRAVITY * 0.85 * dt;
      approachXZ(a, wishX * 10, wishZ * 10, dt * 1.2);
      if (a.vel.y < 0) { a.state = 'skydive'; a.diving = false; }
      break;
    }
    case 'grapple': break;          // Geschwindigkeit setzt combat.js
    case 'swim': {
      approachXZ(a, wishX * SPEED.swim, wishZ * SPEED.swim, dt * 6);
      a.vel.y = (WATER_Y - 1.15 - a.pos.y) * 5;
      if (input.jump) a.vel.y = 7;
      break;
    }
    default: {
      if (a.slideT > 0) {
        // Rutschen: Schwung bleibt, wird langsam weniger
        a.slideT -= dt;
        const f = Math.exp(-dt * (a.onGround ? 0.75 : 0.2));
        a.vel.x *= f; a.vel.z *= f;
        const hs = Math.hypot(a.vel.x, a.vel.z);
        if (hs > 0.1) { const t = Math.min(1, dt * 1.5); a.vel.x += (wishX * hs - a.vel.x) * t * 0.3; a.vel.z += (wishZ * hs - a.vel.z) * t * 0.3; }
        if (a.slideT <= 0 || hs < 3.2) { a.slideT = 0; a.crouch = true; }
      } else {
        let sp = SPEED.run;
        if (a.sprint && !a.ads && !a.crouch) sp = SPEED.sprint;
        if (a.crouch) sp = SPEED.crouch;
        if (a.ads) sp = Math.min(sp, SPEED.ads);
        if (a.channel) sp = Math.min(sp, SPEED.heal);
        const k = a.onGround ? 12 : 2.5;
        approachXZ(a, wishX * sp, wishZ * sp, dt * k);
      }
      if (!climbLadders(a, wishX, wishZ, input)) a.vel.y -= GRAVITY * dt;
      else if (a.ladder) input = { ...input, jump: false };
      if (input.jump && a.onGround) { a.vel.y = 8.2; a.onGround = false; if (!a.slideT) a.crouch = false; if (a.isPlayer) sfx('jump'); }
    }
  }

  moveActor(a, dt);
  pushFromCars(a);

  // Zustandswechsel
  if (a.state === 'swim') {
    if (!inDeepWater(a) && heightAt(a.pos.x, a.pos.z) > WATER_Y - 1.1) a.state = a.onGround ? 'ground' : 'air';
  } else if (a.state !== 'grapple' && a.state !== 'launch' && inDeepWater(a)) {
    a.state = 'swim'; a.fallImmune = false; a.vel.y = 0; a.slideT = 0; a.diving = false;
  } else if (a.ladder) {
    a.state = 'air'; a.fallImmune = true;
  } else if (a.onGround && a.state !== 'grapple') {
    const wasAir = a.state !== 'ground';
    if (wasAir && a.impact > 21 && !a.fallImmune) damage(a, (a.impact - 21) * 7, null, { ignoreShield: true, cause: 'Sturz' });
    if (wasAir && a.isPlayer && a.impact > 6) sfx('land');
    if (!(a.state === 'launch' && a.vel.y > 0)) { a.state = 'ground'; a.fallImmune = false; a.diving = false; }
  } else if (a.state === 'ground') {
    a.state = 'air';
  }

  // Startrampen, Sprungfelder, Geysire
  if (a.padCd <= 0 && (a.state === 'ground' || a.state === 'air')) {
    for (const p of G.pads) if (near(a, p.pos, p.r, 1.0)) return launch(a, p.power);
    for (const p of G.jumpPads) if (near(a, p, 1.5, 1.2)) return launch(a, 44);
    for (const p of G.geysers) if (near(a, p, 2.0, 3.5)) return launch(a, 50);
  }
  if (a.state === 'swim') for (const p of G.geysers) if (near(a, p, 2.2, 3.5)) return launch(a, 50);
}

// Sprint + Ducken = Rutschen
export function startSlide(a) {
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if (!a.onGround || hs < 5.5 || a.slideT > 0) return false;
  const k = Math.max(hs, SPEED.slide) / hs;
  a.vel.x *= k; a.vel.z *= k;
  a.slideT = 1.1; a.crouch = true; a.sprint = false;
  if (a.isPlayer) sfx('land');
  return true;
}

// Leitern an den Wachtürmen: ranlaufen = festhalten, Richtung Turm = hoch, weg vom Turm = runter, Springen = loslassen.
// Oben auf der Plattform zur Leiter laufen = über das Geländer auf die Leiter, unten im Turm zur Leiter = raus.
function climbLadders(a, wishX, wishZ, input) {
  if (a.isBot) return false;
  if (a.ladder) {
    const l = a.ladder, n = ladderNormal(l);
    const toward = -(wishX * n.x + wishZ * n.z);
    a.vel.x = (l.x + n.x * 0.6 - a.pos.x) * 10; a.vel.z = (l.z + n.z * 0.6 - a.pos.z) * 10;
    a.vel.y = Math.abs(toward) > 0.2 ? Math.sign(toward) * 4.5 : 0;
    a.slideT = 0; a.crouch = false;
    if (input.jump) { a.ladder = null; a.vel.set(n.x * 4, 5, n.z * 4); return true; }
    if (a.pos.y >= l.top - 0.1 && toward > 0.2) {          // oben angekommen: auf die Plattform
      a.ladder = null;
      const px = l.x - n.x * 1.25, pz = l.z - n.z * 1.25;
      const hit = raycast(new THREE.Vector3(px, l.top + 0.6, pz), new THREE.Vector3(0, -1, 0), 3.5);
      a.pos.set(px, hit ? hit.point.y + 0.05 : l.top + 0.25, pz); a.vel.set(-n.x * 1.5, 0, -n.z * 1.5); return true;
    }
    if ((a.onGround && toward < -0.2) || a.pos.y < l.y0 - 0.5) { a.ladder = null; return false; }
    return true;
  }
  for (const l of G.ladders) {
    const n = ladderNormal(l);
    const dx = a.pos.x - l.x, dz = a.pos.z - l.z, dist = Math.hypot(dx, dz);
    const toward = -(wishX * n.x + wishZ * n.z);
    const outside = dx * n.x + dz * n.z > 0;
    // von außen an die Leiter laufen
    if (dist < 1.15 && outside && toward > 0.3 && a.pos.y >= l.y0 && a.pos.y < l.top - 0.4) { a.ladder = l; return true; }
    // oben auf der Plattform Richtung Leiter laufen -> über das Geländer auf die Leiter
    if (dist < 1.7 && !outside && toward < -0.3 && a.pos.y > l.top - 1.9 && a.pos.y < l.top + 0.8) {
      a.ladder = l; a.pos.set(l.x + n.x * 0.6, l.top - 0.4, l.z + n.z * 0.6); a.vel.set(0, 0, 0); return true;
    }
    // unten im Turmgerüst gefangen -> zur Leiter hin rauslaufen
    if (dist < 1.9 && !outside && toward < -0.3 && a.pos.y < l.y0 + 2.2) {
      a.pos.set(l.x + n.x * 0.75, a.pos.y + 0.2, l.z + n.z * 0.75); a.vel.set(n.x * 2, 0, n.z * 2); return false;
    }
  }
  return false;
}
function ladderNormal(l) {
  const ox = l.x - l.cx, oz = l.z - l.cz, ol = Math.hypot(ox, oz) || 1;
  return { x: ox / ol, z: oz / ol };
}

function near(a, p, r, h) {
  const dx = a.pos.x - p.x, dz = a.pos.z - p.z;
  return dx * dx + dz * dz < r * r && a.pos.y - p.y > -0.6 && a.pos.y - p.y < h;
}

export function launch(a, power) {
  a.vel.set(a.vel.x * 0.3, power, a.vel.z * 0.3);
  a.state = 'launch'; a.fallImmune = true; a.onGround = false; a.padCd = 1; a.slideT = 0; a.diving = false; a.ladder = null;
  a.pos.y += 0.4;
  sfx('launch', a.isPlayer ? 0 : a.pos.distanceTo(G.camera.position));
}

function approachXZ(a, tx, tz, k) {
  k = Math.min(1, k);
  a.vel.x += (tx - a.vel.x) * k;
  a.vel.z += (tz - a.vel.z) * k;
}

// Heiße Quellen geben langsam Schild
export function updateSprings(a, dt) {
  for (const s of G.springs) {
    if (Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 3.2 && Math.abs(a.pos.y - s.y) < 2.5) {
      a.springT = (a.springT || 0) + dt;
      if (a.springT > 0.5) { a.springT = 0; if (a.shield < 100) a.shield = Math.min(100, a.shield + 2); else if (a.hp < 100) a.hp = Math.min(100, a.hp + 2); }
      return;
    }
  }
}
