// Geräusche, die aus Bewegung und Zustand entstehen: Schritte je Untergrund, Rutschen, Schwimmen, Leiter,
// Landen, Wind beim Fallen, Bus, Motoren, Sturm, Tanzmusik, eigener Schaden, Countdown, Zielen.
import * as THREE from 'three';
import { G, WATER_Y } from './state.js';
import { sfx, loopSound } from './audio.js';
import { raycast } from './physics.js';
import { heightAt, objectAtHit, objMaterial } from './world.js';
import { DEFS } from './items.js';

const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
const DANCE = new Set([0, 1, 3, 5]);          // Emotes mit Musik (siehe emotes.js)
const AIR = new Set(['air', 'skydive', 'glide', 'launch', 'grapple']);

// Untergrund unter den Füßen: Gras/Sand im Gelände, sonst das Material des Gebäudes
function surface(a) {
  o.set(a.pos.x, a.pos.y + 0.4, a.pos.z);
  const hit = raycast(o, down, 1.0);
  if (!hit) return 'grass';
  if (a.pos.y - heightAt(a.pos.x, a.pos.z) < 0.35) return a.pos.y < WATER_Y + 1.7 ? 'sand' : 'grass';
  const ob = objectAtHit(hit);
  return ob ? objMaterial(ob) : 'stone';
}

export function updateFoley(dt) {
  const cam = G.camera.position, me = G.player;
  let dancer = null, dancerD = 1e9;
  for (const a of G.actors) {
    const f = a._f || (a._f = { lp: a.pos.clone(), step: 0.8, st: a.state, minVy: 0, sl: 0, cr: a.crouch, lad: 0, hp: a.hp, sh: a.shield, ads: false });
    const dx = a.pos.x - f.lp.x, dz = a.pos.z - f.lp.z, dy = a.pos.y - f.lp.y;
    f.lp.copy(a.pos);
    const h = Math.hypot(dx, dz), prev = f.st; f.st = a.state;
    if (!a.alive || h > 6 || !a.model.visible && a !== me) { f.step = 0.8; continue; }
    const dist = a === me ? 0 : a.pos.distanceTo(cam);
    if (dist > 60) continue;
    const vy = dt > 0 ? dy / dt : 0;
    if (AIR.has(a.state)) f.minVy = Math.min(f.minVy, vy); 

    // Übergänge
    if (a !== me) {                                         // für den eigenen Spieler macht das movement.js
      if (prev !== 'ground' && AIR.has(prev) && a.state === 'ground' && f.minVy < -6) sfx('land', dist);
      if (prev === 'skydive' && a.state === 'glide') sfx('glider', dist);
      if (a.slideT > 0 && !f.sl) sfx('slide', dist);
    }
    if (a.state === 'ground') f.minVy = 0;
    if (a.state === 'swim' && prev !== 'swim' && prev !== 'bus') sfx('splash', dist);
    f.sl = a.slideT > 0;

    // Schritte (geduckt leise, beim Rutschen keine)
    if (a.state === 'ground' && !a.slideT && !a.car && h > 0.002) {
      const speed = h / Math.max(dt, 1e-3);
      f.step += h;
      const stride = a.crouch ? 1.2 : speed > 7.5 ? 2.15 : 1.7;
      if (f.step > stride) { f.step = 0; sfx('step' + surface(a), dist, { vol: a.crouch ? 0.3 : speed > 7.5 ? 1 : 0.75 }); }
    } else if (a.state !== 'ground') f.step = 0.8;
    if (a.state === 'swim') { f.swim = (f.swim || 0) + h; if (f.swim > 1.9) { f.swim = 0; sfx('swim', dist); } }
    if (a.ladder) { f.lad += Math.abs(dy); if (f.lad > 0.75) { f.lad = 0; sfx('ladder', dist); } }

    if (a.emoteT > 0 && a.state === 'ground' && DANCE.has(a.emoteStyle || 0) && dist < dancerD) { dancer = a; dancerD = dist; }
  }
  if (!me) return;
  const f = me._f; if (!f) return;

  // Eigener Spieler: Ducken, Zielen, Schaden
  if (me.crouch && !f.cr && !me.slideT && me.state === 'ground') sfx('crouch');
  f.cr = me.crouch;
  if (me.ads && !f.ads) { const it = me.inv[me.slot]; sfx(it && DEFS[it.key].scope ? 'scope' : 'aim'); }
  f.ads = me.ads;
  if (me.alive && G.phase !== 'warmup' && !me.wait) {
    const lostSh = f.sh - me.shield, lostHp = f.hp - me.hp;
    const s = G.storm, inStorm = s && s.active && Math.hypot(me.pos.x - s.cx, me.pos.z - s.cz) > s.r;
    if (lostSh > 0.5) sfx(me.shield <= 0 ? 'shieldbreak' : 'shieldtake');
    if (lostHp > 0.5) sfx(inStorm && lostSh <= 0.5 ? 'stormdmg' : 'hurt');
  }
  f.hp = me.hp; f.sh = me.shield;

  // Dauerschleifen
  const viewer = !me.alive && G.spectate ? G.spectate : me;
  const st = viewer.state;
  const fallSpeed = Math.hypot(viewer.vel.x, viewer.vel.y, viewer.vel.z);
  const wind = st === 'skydive' ? (viewer.diving ? 1 : 0.7) : st === 'glide' ? 0.35 : st === 'launch' && viewer.vel.y > 5 ? 0.45 : 0;
  loopSound('wind', 'wind', wind, 0.85 + Math.min(0.5, fallSpeed / 120));
  loopSound('bus', 'busloop', st === 'bus' && G.bus && !G.bus.done ? 0.9 : 0, 1);
  // Motoren aller Autos mit Fahrer
  for (const c of G.cars) {
    const d = c.pos.distanceTo(cam), fall = c.driver ? Math.max(0, 1 - d / 80) : 0;
    loopSound('car' + c.id, 'engine', fall * fall * 0.8, 0.55 + Math.min(1.3, Math.abs(c.speed) / 22));
  }
  // Sturm: von innen laut, am Rand leise
  const s = G.storm;
  let storm = 0;
  if (s && s.active && G.phase !== 'warmup') { const e = Math.hypot(viewer.pos.x - s.cx, viewer.pos.z - s.cz) - s.r; storm = e > 0 ? 1 : Math.max(0, 1 + e / 18) * 0.35; }
  loopSound('storm', 'stormloop', st === 'bus' ? 0 : storm, 1);
  // Tanzmusik vom nächsten tanzenden Spieler
  loopSound('emote', 'emote', dancer ? Math.pow(Math.max(0, 1 - dancerD / 45), 2) : 0, 1);

  // Countdown vor dem Bus
  if (G.phase === 'warmup') {
    const n = Math.ceil(G.phaseT);
    if (n <= 5 && n >= 1 && n !== f.tick) sfx('tick', 0, { rate: n === 1 ? 1.25 : 1 });
    f.tick = n;
  }
}
