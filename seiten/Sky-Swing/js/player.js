// Spielerphysik: Laufen, Schwingen, Zip, Wandlauf, Katapult, Sturzflug, Kollision
import { V3, UP, clamp, angDiff } from './util.js';
import { camera } from './engine.js';
import { P, I, cam, camF, camR, wish, fx } from './state.js';
import { addStyle, bank, loseCombo } from './score.js';
import { boxes, query, raycast, maxTopNear, inLand, START } from './city.js';
import { sfx } from './audio.js';
import { cars } from './trains.js';
import { inPool, splashAt } from './roofs.js';
import { rumble } from './input.js';
import { showMove } from './hud.js';

const G = 28, RUN = 9, SPRINT = 16;
const _t = new V3(), _t2 = new V3(), _pv = new V3(), _near = [];
const rightOf = (f, o) => o.set(-f.z, 0, f.x).normalize();
export let zipTarget = null;

export function respawn() {
  loseCombo(); P.trick = null; P.roll = 0; P.splat = null; P.corner = null; P.carrier = null; fx.impact = 0;
  P.pos.copy(START); P.vel.set(0, 0, 0); P.state = 'ground'; P.nAnch = 0; P.zip = null;
  cam.tgt.copy(P.pos).add(new V3(0, 1.5, 0));
}

/* ---------- Anker finden ---------- */
// Faden sucht eine echte Fläche (Fassade, Dachkante, Pylon …). Kein Treffer = kein Faden.
// hook  = wo der Faden sichtbar klebt
// pivot = Drehpunkt fürs Pendeln, höchstens 3 m vor der Fassade, damit man nicht an der Wand entlangschrammt
const ANCHOR_DIRS = [[.85, 1, .55], [.55, 1, .95], [1, .85, .25], [.25, 1, .35], [1.2, 1, 0], [.4, 1, 1.4], [1.4, 1.2, .6], [.1, 1, .8], [.6, 1.6, .3], [1.6, .7, .9]];
function findAnchor(f, side) {
  const r = rightOf(f, new V3()), o = P.pos.clone().add(new V3(0, 1.4, 0)), d = new V3();
  for (const [a, b, c] of ANCHOR_DIRS) {
    d.copy(f).multiplyScalar(a).addScaledVector(UP, b).addScaledVector(r, c * side).normalize();
    const h = raycast(o, d, 110);
    if (h && h.point.y > P.pos.y + 4 && h.t > 7) {
      const pivot = h.normal.y > .5 ? h.point.clone() : h.point.clone().addScaledVector(h.normal, Math.min(3, h.t * .08));
      return { hook: h.point, pivot };
    }
  }
  return null;
}
function swingDir() {
  if (P.wishLen > .2) return wish.clone().normalize();
  const h = new V3(P.vel.x, 0, P.vel.z); if (h.length() > 4) return h.normalize();
  return camF.clone();
}

/* ---------- Moves ---------- */
// Faden abschießen: Zischen an der Hand, Klatsch dort, wo er anklebt (kommt mit Laufzeit des Fadens)
function webShot(target, vol = .8) {
  sfx('web_shoot', { vol, rev: .2 });
  if (target) sfx('web_hit', { pos: target, vol: .9, delay: Math.min(.2, P.pos.distanceTo(target) / 260), rev: .45, ref: 8 });
}
function startSwing(dbl) {
  if (P.swingCD > 0) return;
  const f = swingDir(); P.side = -P.side; let a = null;
  if (dbl) {
    const a1 = findAnchor(f, 1), a2 = findAnchor(f, -1);
    if (a1 && a2) { P.anchors[0].copy(a1.hook); P.anchors[1].copy(a2.hook); P.nAnch = 2; a = a1.pivot.clone().add(a2.pivot).multiplyScalar(.5); }
    else { const h = a1 || a2; dbl = false; if (h) { P.side = a1 ? 1 : -1; P.anchors[0].copy(h.hook); P.nAnch = 1; a = h.pivot; } }
  } else {
    let h = findAnchor(f, P.side);
    if (!h) { h = findAnchor(f, -P.side); if (h) P.side = -P.side; }
    if (h) { P.anchors[0].copy(h.hook); P.nAnch = 1; a = h.pivot; }
  }
  if (!a) { showMove('Kein Halt'); return; }
  if (P.state === 'ground' || P.state === 'charge') { P.vel.y = 9; P.pos.y += .05; }
  if (P.state === 'wall') { P.vel.addScaledVector(P.wallN, 8); P.wallCD = .45; }
  P.anchor.copy(a); P.L = Math.max(6, P.pos.distanceTo(a)); P.dbl = dbl; P.state = 'swing'; P.webT = 0; P.airZips = 2;
  if (Math.hypot(P.vel.x, P.vel.z) < 22) P.vel.addScaledVector(f, dbl ? 8 : 5);
  if (dbl) showMove('Doppelschwung');
  addStyle(dbl ? 150 : 100, dbl ? 'Doppelschwung' : 'Schwung'); P.lowSwing = false;
  fx.shake = Math.max(fx.shake, .08); rumble(.2, 60);
  webShot(P.anchors[0]); if (P.nAnch === 2) webShot(P.anchors[1], .55);
}
function releaseSwing() {
  const h = new V3(P.vel.x, 0, P.vel.z);
  // Perfekter Absprung: Spieler ist vor dem Anker und steigt noch
  const r = _t.subVectors(P.pos, P.anchor); r.y = 0;
  const perfect = P.state === 'swing' && h.length() > 8 && P.vel.y > 1.5 && r.dot(h) / (r.length() * h.length() + 1e-6) > .3;
  P.state = 'air'; P.nAnch = 0; P.swingCD = .12;
  if (h.length() > 1) { h.normalize(); P.vel.addScaledVector(h, perfect ? 9 : 3.5); }
  P.vel.y += perfect ? 9 : P.vel.y > 0 ? 7 : (P.vel.y > -5 ? 5 : 2);
  sfx('web_release', { vol: .5, rev: .15 });
  if (perfect) { addStyle(250, 'Perfekter Absprung'); showMove('Perfekt!'); fx.punch = 1; rumble(.35, 90); sfx('whoosh', { vol: .8, rate: 1.1 }); sfx('perfect', { vol: .35, vary: .2, rev: .3 }); }
}
function enterWall(n) { P.state = 'wall'; P.wallN.copy(n); P.nAnch = 0; P.airZips = 2; P.wallGrace = .15; P.zip = null; P.vel.set(-n.x * 2, Math.max(0, P.vel.y * .25), -n.z * 2); }
function wallJump() {
  const n = P.wallN, t = _t.set(n.z, 0, -n.x), al = wish.dot(t);
  P.state = 'air'; P.vel.set(n.x * 13 + t.x * al * 6, 12, n.z * 13 + t.z * al * 6); P.wallCD = .3;
  showMove('Wandsprung'); addStyle(120, 'Wandsprung'); sfx('jump', { vol: .8 }); sfx('whoosh', { vol: .55, rate: 1.2 });
}
function airZip() {
  // Netz-Sprint: Faden an eine Fläche schießen und sich daran nach vorn ziehen
  const f = P.wishLen > .1 ? wish.clone().normalize() : camF.clone(), o = P.pos.clone().add(new V3(0, 1.4, 0));
  let hit = null, d = null;
  for (const up of [.32, .55, .15, .85]) { d = f.clone().add(new V3(0, up, 0)).normalize(); const h = raycast(o, d, 85); if (h && h.t > 4) { hit = h; break; } }
  // Dash geht immer; ein Faden ist nur zu sehen, wenn er an etwas kleben kann
  if (hit) { d.subVectors(hit.point, o).normalize(); if (d.y < .15) d.y = .15; d.normalize(); }
  else d = f.clone().add(new V3(0, .32, 0)).normalize();
  P.vel.multiplyScalar(.35).addScaledVector(d, 30); P.airZips--; P.zipFx = hit ? { t: .24, p: hit.point.clone() } : null;
  showMove('Netz-Sprint'); addStyle(60, 'Netz-Sprint'); webShot(null, .7); sfx('whoosh', { vol: .7, rate: 1.15 }); rumble(.25, 70);
}
// Katapult: zwei Fäden nach vorn an Flächen in der Nähe. Ohne Halt nur ein kräftiger Sprung aus der Hocke.
function slingAnchors() {
  const r = rightOf(camF, new V3()), o = P.pos.clone().add(new V3(0, 1, 0)), out = [];
  for (const s of [1, -1]) for (const [fw, up, sd] of [[.9, .5, .7], [1, .25, .55], [.7, .9, .9]]) {
    const d = camF.clone().multiplyScalar(fw).addScaledVector(UP, up).addScaledVector(r, sd * s).normalize();
    const h = raycast(o, d, 45); if (h && h.t > 3) { out.push(h.point); break; }
  }
  return out;
}
function launchSling() {
  const c = P.charge * (P.sling.length ? 1 : .5), d = camF.clone().add(new V3(0, .85, 0)).normalize();
  P.vel.copy(d).multiplyScalar(20 + 42 * c); P.sling = []; P.state = 'air'; P.pos.y += .05; P.coyote = 0;
  showMove(c > .95 ? 'Katapult MAX' : 'Katapult'); addStyle(c > .95 ? 200 : 100, 'Katapult'); sfx('launch', { vol: .6 + .4 * c, rate: .9 + .2 * c, rev: .3 }); rumble(.6, 200); fx.punch = .7; fx.shake = .25;
}
function tryZip() {
  if (!zipTarget || P.state === 'charge') return;
  P.state = 'zip'; P.zip = { target: zipTarget.p.clone(), n: zipTarget.n.clone(), type: zipTarget.type, t: 0 }; P.nAnch = 0; P.webT = 0; webShot(zipTarget.p); sfx('zip', { vol: .8 });
}
function arriveZip() {
  const z = P.zip; P.airZips = 2;
  if (z.type === 'launch') { P.state = 'air'; P.vel.set(-z.n.x * 9, 17, -z.n.z * 9); showMove('Zip-Launch'); addStyle(150, 'Zip-Launch'); sfx('launch', { vol: .7, rate: 1.15 }); rumble(.4, 100); fx.punch = .5; }
  else if (z.type === 'perch') { P.state = 'air'; P.vel.set(0, 4, 0); sfx('land_soft', { vol: .7 }); }
  else { enterWall(z.n); sfx('land_soft', { vol: .5, rate: 1.3 }); }
  P.zip = null;
}

// Luft-Tricks: Richtung wählt den Trick (vor = Salto, zurück = Rückwärtssalto, seitlich = Schraube, Sprint+vor = Doppelsalto),
// ohne Richtung wechseln Pirouette und Korkenzieher. Am Faden gibt es eigene Seil-Tricks.
const TRICK = {
  flip: ['Salto', .6, 300], back: ['Rückwärtssalto', .6, 300], barrel: ['Schraube', .6, 300], double: ['Doppelsalto', .95, 550],
  spin: ['Pirouette', .55, 300], twist: ['Korkenzieher', .75, 350], ropeSpin: ['Seil-Pirouette', .7, 250], ropeFlip: ['Seil-Überschlag', .8, 300],
};
function doTrick() {
  if (P.trick) return;
  let type;
  if (P.state === 'swing') type = P.trickN++ % 2 ? 'ropeFlip' : 'ropeSpin';
  else if (P.state === 'air' && P.pos.y > 3) {
    if (Math.abs(I.mx) > .5) type = 'barrel';
    else if (I.mz > .5) type = I.sprint ? 'double' : 'flip';
    else if (I.mz < -.5) type = 'back';
    else type = P.trickN++ % 2 ? 'twist' : 'spin';
  } else return;
  const [name, dur, pts] = TRICK[type];
  P.trick = { type, t: 0, dur }; addStyle(pts, name); showMove(name);
  sfx('whoosh', { vol: .75, rate: .95 + .5 / dur * .3 }); if (dur > .7) sfx('whoosh', { vol: .55, rate: 1.1, delay: dur * .45 });
}

/* ---------- Eckenschwung: Faden an einer Hauskante, ohne Tempoverlust um die Ecke ---------- */
function findCorner(f, side) {
  const r = rightOf(f, new V3()); let best = null;
  query(P.pos.x - 36, P.pos.z - 36, P.pos.x + 36, P.pos.z + 36, _near);
  for (const i of _near) {
    const b = boxes[i]; if (b.y1 < P.pos.y + 6 || b.y1 - b.y0 < 15) continue;
    for (const [cx, cz] of [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]]) {
      const dx = cx - P.pos.x, dz = cz - P.pos.z, fa = dx * f.x + dz * f.z, sa = (dx * r.x + dz * r.z) * side, d = Math.hypot(dx, dz);
      // Ecke muss vorne auf der gewünschten Seite liegen und das Haus dahinter, nicht auf dem Weg
      const out = new V3(cx - (b.x0 + b.x1) / 2, 0, cz - (b.z0 + b.z1) / 2).normalize();
      if (fa > 2 && fa < 30 && sa > 2 && sa < 22 && d < 32 && (out.x * r.x + out.z * r.z) * side < .2 && (!best || d < best.d)) best = { cx, cz, top: b.y1, d };
    }
  }
  return best;
}
function startCorner(side) {
  const hv = new V3(P.vel.x, 0, P.vel.z); const f = hv.length() > 8 ? hv.normalize() : camF.clone();
  const c = findCorner(f, side); if (!c) return false;
  const sp = Math.max(22, Math.hypot(P.vel.x, P.vel.z));
  const rx = P.pos.x - c.cx, rz = P.pos.z - c.cz, rad = Math.max(5, Math.hypot(rx, rz));
  const s = Math.sign(f.x * -rz + f.z * rx) || 1;
  P.corner = { cx: c.cx, cz: c.cz, rad, th: Math.atan2(rz, rx), s, sp, turned: 0 };
  P.anchors[0].set(c.cx, Math.min(c.top - 1, P.pos.y + 9), c.cz); P.nAnch = 1; P.side = side;
  P.state = 'corner'; P.airZips = 2; P.vel.y = Math.max(P.vel.y, 1);
  webShot(P.anchors[0]); rumble(.25, 70); fx.shake = Math.max(fx.shake, .08);
  return true;
}
function endCorner(bonus) {
  P.state = 'air'; P.nAnch = 0; P.swingCD = .12; P.corner = null;
  if (bonus) { const h = new V3(P.vel.x, 0, P.vel.z).normalize(); P.vel.addScaledVector(h, 5); P.vel.y += 5; addStyle(220, 'Eckenschwung'); showMove('Eckenschwung'); fx.punch = .5; sfx('whoosh', { vol: .9, rate: .9 }); }
  sfx('web_release', { vol: .45 });
}

// Zielpunkt unter dem Fadenkreuz
export function computeZipTarget() {
  zipTarget = null; if (P.state === 'zip' || P.state === 'charge') return;
  const cd = camera.getWorldDirection(new V3());
  const s = Math.max(0, _t.subVectors(P.pos, camera.position).dot(cd));
  const o = camera.position.clone().addScaledVector(cd, s);
  const h = raycast(o, cd, 125); if (!h) return;
  const dist = h.point.distanceTo(P.pos); if (dist < 4 || dist > 118) return;
  const n = h.normal; let p, type;
  if (n.y > .5) { p = h.point.clone(); p.y += .05; type = 'perch'; }
  else if (h.box.y1 - h.point.y < 35) { p = new V3(h.point.x + n.x * .6, h.box.y1 + .3, h.point.z + n.z * .6); type = 'launch'; }
  else { p = h.point.clone().addScaledVector(n, .5); type = 'wall'; }
  zipTarget = { p, n: n.clone(), type };
}

// Harter Aufprall: platt an der Fassade kleben oder flach auf dem Boden liegen
function splat(kind, n, force) {
  const k = clamp((force - 22) / 35, 0, 1);
  if (kind === 'ground') { const hs = Math.hypot(_pv.x, _pv.z); if (hs > 1) P.faceYaw = Math.atan2(_pv.x, _pv.z); P.vel.set(_pv.x * .12, 0, _pv.z * .12); }
  else { P.vel.set(0, 0, 0); P.faceYaw = Math.atan2(-n.x, -n.z); }
  P.state = 'splat'; P.splat = { kind, t: 0, dur: .9 + .8 * k, n: n.clone() };
  P.nAnch = 0; P.zip = null; P.trick = null; P.roll = 0; P.diving = false; P.land = 0;
  loseCombo();
  fx.impact = Math.max(fx.impact, .55 + .45 * k); fx.shake = Math.max(fx.shake, .5 + .45 * k);
  sfx(kind === 'ground' ? 'impact_ground' : 'impact_wall', { vol: .75 + .25 * k, rate: 1.05 - .12 * k, rev: .45 }); rumble(.6 + .4 * k, 260);
  showMove(kind === 'ground' ? 'Aufprall!' : 'Klatsch!', 1100);
}

function moveTowards(v, tx, tz, step) { const dx = tx - v.x, dzz = tz - v.z, l = Math.hypot(dx, dzz); if (l <= step) { v.x = tx; v.z = tz; } else { v.x += dx / l * step; v.z += dzz / l * step; } }

/* ---------- Hauptschritt ---------- */
export function stepPlayer(dt) {
  // wer vom fahrenden Zug abspringt oder losschwingt, behält dessen Tempo
  const rideBefore = (P.state === 'ground' || P.state === 'charge') ? P.carrier : null;
  camF.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)); camR.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  wish.copy(camF).multiplyScalar(I.mz).addScaledVector(camR, I.mx); P.wishLen = Math.min(1, wish.length());
  P.wallCD -= dt; P.swingCD -= dt; P.land -= dt; P.wallGrace -= dt; P.roll -= dt;
  if (P.trick) { P.trick.t += dt; if (P.trick.t >= P.trick.dur) P.trick = null; }
  if (P.state === 'ground' && P.roll <= 0) { P.groundT += dt; if (P.groundT > .8) bank(); } else P.groundT = 0;
  if (I.trickP) doTrick();
  if (P.zipFx) { P.zipFx.t -= dt; if (P.zipFx.t <= 0) P.zipFx = null; }
  if (P.state === 'splat') { const n = Math.ceil(dt / (1 / 120)), h = dt / n; for (let i = 0; i < n; i++) sub(h); return; }  // benommen: keine Eingaben
  if (I.zipP) tryZip();
  if (I.swingP && !I.dbl && Math.abs(I.mx) > .6 && (P.state === 'air' || P.state === 'swing') && startCorner(Math.sign(I.mx))) {}
  else if ((I.swingP || I.dblP) && P.state !== 'swing' && P.state !== 'zip' && P.state !== 'corner') startSwing(I.dblP || (I.swingP && I.sprint));
  if (P.state === 'swing' && !(I.swing || I.dbl)) releaseSwing();
  if (P.state === 'corner' && !I.swing) endCorner(P.corner.turned > .9);
  if (I.jumpP) {
    if (P.state === 'ground') { P.vel.y = I.sprint ? 13 : 11.5; P.state = 'air'; P.coyote = 0; sfx('jump', { vol: .75 }); }
    else if (P.state === 'wall') wallJump();
    else if (P.state === 'swing') { releaseSwing(); P.vel.y += 4; showMove('Absprung'); }
    else if (P.state === 'corner') { endCorner(P.corner.turned > .9); P.vel.y += 4; }
    else if (P.state === 'air' && P.airZips > 0) airZip();
  }
  if (P.state === 'ground' && I.slingP) { P.state = 'charge'; P.charge = 0; P.sling = slingAnchors(); }
  if (P.state === 'charge' && !I.sling) launchSling();
  const n = Math.ceil(dt / (1 / 120)), h = dt / n;
  for (let i = 0; i < n; i++) sub(h);
  if (rideBefore && P.state !== 'ground' && P.state !== 'charge') { P.vel.x += rideBefore.vx; P.vel.z += rideBefore.vz; }
  // Pendel-Rauschen: startet beim schnellen Abwärtsschwung, damit der lauteste Teil am Tiefpunkt liegt
  if (P.state === 'swing') {
    const v = P.vel.length();
    if (!P.swWhoosh && P.vel.y < -7 && v > 13) { P.swWhoosh = true; sfx('swing', { vol: clamp((v - 8) / 40, .25, .65), rate: .9 + clamp(v / 120, 0, .15), rev: .15 }); }
    if (P.vel.y > 2) P.swWhoosh = false;
  } else P.swWhoosh = false;
}

function sub(h) {
  const st = P.state;
  if ((st === 'ground' || st === 'charge') && P.carrier) { P.pos.x += P.carrier.vx * h; P.pos.z += P.carrier.vz * h; }   // auf dem Zug mitfahren
  if (st === 'ground') {
    const maxS = (I.sprint ? SPRINT : RUN) * (inPool(P.pos) ? .5 : 1), hs = Math.hypot(P.vel.x, P.vel.z);
    const acc = (hs > maxS + .5 && P.wishLen > .1) ? 14 : (P.wishLen > .1 ? 60 : 40);
    moveTowards(P.vel, wish.x * maxS, wish.z * maxS, acc * h); P.vel.y -= G * h;
  } else if (st === 'charge') {
    moveTowards(P.vel, 0, 0, 40 * h); P.vel.y -= G * h; P.charge = Math.min(1, P.charge + h / .9);
  } else if (st === 'air') {
    const hs = Math.hypot(P.vel.x, P.vel.z);
    if (P.wishLen > .1) {
      if (hs < 11) { P.vel.x += wish.x * 12 * h; P.vel.z += wish.z * 12 * h; }
      else { const cur = Math.atan2(P.vel.x, P.vel.z), d = angDiff(Math.atan2(wish.x, wish.z), cur); if (Math.abs(d) < 2.6) { const na = cur + clamp(d, -1.7 * h, 1.7 * h); P.vel.x = Math.sin(na) * hs; P.vel.z = Math.cos(na) * hs; } }
    }
    P.diving = I.dive && P.vel.y < 6;
    P.vel.y -= G * h * (P.diving ? 1.9 : 1);
    if (!P.diving) P.vel.multiplyScalar(1 - .02 * h);
    const term = P.diving ? -88 : -70; if (P.vel.y < term) P.vel.y = term;
  } else if (st === 'swing') {
    P.vel.y -= G * h;
    if (P.wishLen > .1) { const r = _t.subVectors(P.pos, P.anchor).normalize(); const w = _t2.copy(wish).addScaledVector(r, -wish.dot(r)); P.vel.addScaledVector(w, (P.dbl ? 24 : 16) * h); }
    P.L = Math.max(5, P.L - (P.dbl ? 3 : 1.5) * h);
    const maxL = P.anchor.y - 1.4; if (P.L > maxL) P.L = maxL;
    if (!P.lowSwing && P.pos.y < 7 && P.vel.length() > 22) { P.lowSwing = true; addStyle(200, 'Tiefflug'); showMove('Tiefflug'); }
    if (P.L < 4 || P.pos.y > P.anchor.y - .5) releaseSwing();
  } else if (st === 'zip') {
    const z = P.zip, to = _t.subVectors(z.target, P.pos), d = to.length(); z.t += h;
    const sp = Math.min(62, 20 + z.t * 120);
    if (d < sp * h + .8 || z.t > 3) { P.pos.copy(z.target); arriveZip(); return; }
    P.vel.copy(to).multiplyScalar(sp / d);
  } else if (st === 'corner') {
    const c = P.corner, w = c.sp / c.rad;
    c.th += c.s * w * h; c.turned += w * h;
    const nx = c.cx + Math.cos(c.th) * c.rad, nz = c.cz + Math.sin(c.th) * c.rad;
    P.vel.set((nx - P.pos.x) / h, P.vel.y - G * .25 * h, (nz - P.pos.z) / h);
    if (c.turned > 1.55) { P.pos.x = nx; P.pos.z = nz; endCorner(true); return; }
  } else if (st === 'splat') {
    const s = P.splat; s.t += h;
    if (s.kind === 'wall') P.vel.set(-s.n.x, s.t > .3 ? -1.1 : 0, -s.n.z);          // an die Wand gedrückt, rutscht langsam ab
    else { const f = Math.exp(-7 * h); P.vel.x *= f; P.vel.z *= f; P.vel.y -= G * h; } // kurz schlittern, dann liegen
    if (s.t >= s.dur) { P.splat = null; if (s.kind === 'wall') enterWall(s.n); else { P.state = 'ground'; P.land = .45; } }
  } else if (st === 'wall') {
    const n = P.wallN, t = _t.set(n.z, 0, -n.x);
    const into = -(wish.x * n.x + wish.z * n.z), al = wish.x * t.x + wish.z * t.z;
    if (P.wishLen > .1 && into < -.6) { P.state = 'air'; P.vel.set(n.x * 5, 2, n.z * 5); P.wallCD = .3; }
    else { const vy = P.wishLen > .1 ? (I.sprint ? 17 : 12) * Math.max(.35, into) : 0; P.vel.set(t.x * al * 7 - n.x * 1.5, vy, t.z * al * 7 - n.z * 1.5); }
  }
  if (P.vel.lengthSq() > 78 * 78) P.vel.setLength(78);
  P.pos.addScaledVector(P.vel, h);
  if (P.state === 'swing') { // Seil: nie länger als L
    const d = _t.subVectors(P.pos, P.anchor), len = d.length();
    if (len > P.L) { d.multiplyScalar(1 / len); P.pos.copy(P.anchor).addScaledVector(d, P.L); const vr = P.vel.dot(d); if (vr > 0) P.vel.addScaledVector(d, -vr); }
  }
  _pv.copy(P.vel);
  collide();
  if (P.state === 'corner' && (P.hasWall || P.onGround)) { P.state = 'air'; P.nAnch = 0; P.corner = null; }
  postCollide(h);
}

function collide() {
  P.onGround = false; P.hasWall = false; let carrier = null;
  if (inLand(P.pos.x, P.pos.z) && P.pos.y < 0) { P.pos.y = 0; if (P.vel.y < 0) P.vel.y = 0; P.onGround = true; }
  query(P.pos.x - 3, P.pos.z - 3, P.pos.x + 3, P.pos.z + 3, _near);
  for (const i of _near) resolve(boxes[i]);
  for (const c of cars) if (resolve(c) === 'top') carrier = c;
  P.carrier = P.onGround ? carrier : null;
}
function resolve(b) {
  const r = .42, hg = 1.8;
  {
    const px0 = P.pos.x - r, px1 = P.pos.x + r, py0 = P.pos.y, py1 = P.pos.y + hg, pz0 = P.pos.z - r, pz1 = P.pos.z + r;
    if (px1 <= b.x0 || px0 >= b.x1 || py1 <= b.y0 || py0 >= b.y1 || pz1 <= b.z0 || pz0 >= b.z1) return null;
    const yP = b.y1 - py0; let m = yP, ax = 1, s = 1;
    if (!(yP < .35 && P.vel.y <= 1)) { // kleine Stufen einfach hochsteigen
      const c = [[px1 - b.x0, 0, -1], [b.x1 - px0, 0, 1], [pz1 - b.z0, 2, -1], [b.z1 - pz0, 2, 1], [py1 - b.y0, 1, -1]];
      for (const [v, a, sg] of c) if (v < m) { m = v; ax = a; s = sg; }
    }
    if (ax === 1) { if (s > 0) { P.pos.y += m; if (P.vel.y < 0) P.vel.y = 0; P.onGround = true; return 'top'; } P.pos.y -= m; if (P.vel.y > 0) P.vel.y = 0; return 'bottom'; }
    if (ax === 0) { P.pos.x += s * m; if (P.vel.x * s < 0) P.vel.x = 0; P.hasWall = true; P.wallN.set(s, 0, 0); return 'side'; }
    P.pos.z += s * m; if (P.vel.z * s < 0) P.vel.z = 0; P.hasWall = true; P.wallN.set(0, 0, s); return 'side';
  }
}
function postCollide(h) {
  if (P.pos.y < -6) { respawn(); return; }
  const n = P.wallN;
  if (P.state === 'splat') { if (P.splat && P.splat.kind === 'wall' && P.onGround) { P.splat = null; P.state = 'ground'; P.land = .45; } return; }
  if (P.hasWall && (P.state === 'air' || P.state === 'swing')) {
    const into = -(_pv.x * n.x + _pv.z * n.z);
    if (into > 24) { splat('wall', n, into); return; }
  }
  if (P.state === 'wall') {
    if (P.onGround && P.vel.y <= 0) { P.state = 'ground'; return; }
    if (!P.hasWall && P.wallGrace <= 0) { if (P.vel.y > .5) { P.vel.set(-n.x * 6.5, 9.5, -n.z * 6.5); showMove('Kantensprung'); addStyle(120, 'Kantensprung'); } P.state = 'air'; P.wallCD = .25; }
    return;
  }
  if (P.state === 'zip' && P.hasWall) { if (P.zip.type === 'wall') enterWall(n.clone()); else arriveZip(); return; }
  if (P.hasWall && P.wallCD <= 0 && (P.state === 'air' || P.state === 'swing' || P.state === 'ground')) {
    const into = -(_pv.x * n.x + _pv.z * n.z), sp = Math.hypot(_pv.x, _pv.z) + .01, wi = -(wish.x * n.x + wish.z * n.z);
    if ((P.state !== 'ground' && into > 2.5 && into / sp > .3) || (P.state === 'ground' && wi > .6 && P.wishLen > .5)) { enterWall(n.clone()); return; }
  }
  if (P.onGround) {
    P.coyote = .1; P.airZips = 2;
    if (P.state === 'air') {
      const imp = -_pv.y, hs = Math.hypot(_pv.x, _pv.z); P.state = 'ground';
      const pool = inPool(P.pos);
      if (pool && imp > 3) {
        splashAt(P.pos, pool.water); sfx(imp > 12 ? 'splash_1' : 'splash_2', { vol: Math.min(1, .35 + imp / 40), rev: .25 });
        P.vel.x *= .35; P.vel.z *= .35; P.trick = null; fx.shake = Math.min(.3, imp / 90);
        if (imp > 15) { addStyle(Math.round(150 + imp * 6), 'Poolsprung'); showMove('Poolsprung!'); }
        return;
      }
      if (imp > 30) { splat('ground', UP, imp); return; }
      if (P.trick) { P.trick = null; loseCombo(); showMove('Bruchlandung!'); P.land = .5; P.vel.x *= .3; P.vel.z *= .3; fx.shake = .5; rumble(.7, 200); sfx('land_hard', { vol: .9, rev: .35 }); sfx('fail', { vol: .3 }); }
      else if (hs > 13 && imp > 10) { P.roll = .55; P.vel.x *= .92; P.vel.z *= .92; addStyle(80, 'Landerolle'); fx.shake = .2; rumble(.3, 80); sfx('land_soft', { vol: .8 }); sfx('roll', { vol: .8, delay: .05 }); }
      else if (imp > 20) { P.land = .3; P.vel.x *= .55; P.vel.z *= .55; fx.shake = .35; fx.impact = Math.max(fx.impact, .25); rumble(.35, 90); sfx('land_hard', { vol: .45 + clamp((imp - 20) / 25, 0, 1) * .5, rev: .3 }); }
      else if (imp > 3) sfx('land_soft', { vol: clamp(imp / 20, .25, .9) });
    }
    else if (P.state === 'swing' && P.vel.y <= .1) { P.state = 'ground'; P.nAnch = 0; }
  } else if (P.state === 'ground' || P.state === 'charge') { P.coyote -= h; if (P.coyote <= 0) P.state = 'air'; }
}
