// Steuerung des Spielers + Third-Person-Kamera wie in Fortnite
import * as THREE from 'three';
import { G, on } from './state.js';
import { mouse, down, hit, analog, touchStick } from './input.js';
import { DEFS } from './items.js';
import { switchSlot, cycleSlot } from './actors.js';
import { updateMovement, startSlide } from './movement.js';
import { trigger, startReload, current } from './combat.js';
import { exitBus, thankDriver } from './bus.js';
import { findInteract, interact } from './loot.js';
import { nearestCar, driveCar, seatActor } from './cars.js';
import { requestCar, leaveCar } from './net.js';
import { raycast } from './physics.js';
import { sfx } from './audio.js';

const view = { recoil: 0, fov: 80, camY: 1.55 };
export const camState = { dir: new THREE.Vector3(0, 0, -1), scoped: false, interact: null, car: null };

on('recoil', (p, y) => {
  const a = G.player;
  a.pitch = Math.min(1.45, a.pitch + p * 0.35);   // bleibender Anteil
  view.recoil += p * 0.65;                         // federt zurück
  a.yaw += y;
});

export function setupPlayer(a) {
  a.aimRay = () => {
    const cam = G.camera, d = camState.dir.clone();
    const pivot = new THREE.Vector3(a.pos.x, a.pos.y + 1.4, a.pos.z);
    const along = Math.max(0, pivot.clone().sub(cam.position).dot(d)) + 0.35;
    return [cam.position.clone().addScaledVector(d, along), d];
  };
}

export function updatePlayer(dt) {
  const a = G.player;
  const zoom = Math.tan(view.fov * Math.PI / 360) / Math.tan(G.baseFov * Math.PI / 360);
  const s = 0.0022 * G.settings.sens * (a.ads ? Math.max(0.25, zoom) * G.settings.adsSens : 1);
  // Controller-Stick: Drehgeschwindigkeit statt Mausweg
  const ps = 2.6 * G.settings.padSens * (a.ads ? Math.max(0.3, zoom) * G.settings.adsSens : 1) * dt;
  if (!G.invOpen) {
    a.yaw -= mouse.dx * s + analog.lookX * ps * 1.25;
    a.pitch = THREE.MathUtils.clamp(a.pitch - (mouse.dy * s + analog.lookY * ps * 0.8) * (G.settings.invertY ? -1 : 1), -1.45, 1.45);
  }
  view.recoil *= Math.exp(-dt * 7);
  camState.interact = null; camState.car = null;
  if (!a.alive || G.victory) return;

  if (a.state === 'bus') {
    const b = G.bus;
    if (hit('emote')) thankDriver(a);
    if (b && b.driver === a) b.steer = THREE.MathUtils.clamp((down('right') ? 1 : 0) - (down('left') ? 1 : 0) + analog.mx + touchStick.x, -1, 1);
    if (hit('jump') && b && b.doors) { if (b.driver === a) b.steer = 0; exitBus(a); }
    return;
  }

  // ---- Auto fahren ----
  if (a.state === 'car' && a.car) {
    const c = a.car;
    driveCar(c, dt, {
      throttle: THREE.MathUtils.clamp((down('forward') ? 1 : 0) - (down('back') ? 1 : 0) + analog.my + touchStick.y + (analog.pad || down('fire') ? (down('fire') ? 1 : 0) - (down('aim') ? 1 : 0) : 0), -1, 1),
      steer: THREE.MathUtils.clamp((down('right') ? 1 : 0) - (down('left') ? 1 : 0) + analog.mx + touchStick.x, -1, 1),
      brake: down('jump'),
    });
    seatActor(a);
    camState.interact = null; camState.car = null;
    if (hit('interact') || hit('padUse')) leaveCar(a);
    return;
  }

  // ---- Bewegung ----
  if (hit('autorun')) a.autorun = !a.autorun;
  if (down('back')) a.autorun = false;
  let f = (down('forward') || a.autorun ? 1 : 0) - (down('back') ? 1 : 0);
  let r = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  // analoger Stick (Controller oder Touch-Joystick)
  const stx = analog.mx + touchStick.x, sty = analog.my + touchStick.y;
  if (Math.hypot(stx, sty) > 0.05) { f = THREE.MathUtils.clamp(f + sty, -1, 1); r = THREE.MathUtils.clamp(r + stx, -1, 1); }
  // Emote: B tanzt, Bewegung oder Schießen bricht ab
  if (hit('emote') && a.state === 'ground') { a.emoteT = a.emoteT > 0 ? 0 : 8; a.emoteStyle = (a.emoteStyle || 0) + 1; }
  if (a.emoteT > 0 && (f || r || down('fire') || down('jump'))) a.emoteT = 0;
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
  let mx = -sy * f + cy * r, mz = -cy * f - sy * r;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const shift = down('sprint') || (a.autorun && G.settings.autoSprint);
  a.sprint = shift && f > 0 && !a.slideT;
  const crouchKey = hit('crouch');
  if (crouchKey && (a.state === 'ground' || a.state === 'air')) {
    if (a.slideT > 0) { a.slideT = 0; a.crouch = false; }
    else if ((shift || Math.hypot(a.vel.x, a.vel.z) > 6.5) && a.state === 'ground' && startSlide(a)) { /* rutscht */ }
    else a.crouch = !a.crouch;
  }
  if (a.state !== 'ground' && a.state !== 'air') { a.crouch = false; a.slideT = 0; }
  if (a.sprint && a.crouch && !a.slideT) a.crouch = false;

  const it = current(a);
  const isGun = it && DEFS[it.key].type === 'gun';
  a.ads = !!(!G.invOpen && down('aim') && isGun && (a.state === 'ground' || a.state === 'air') && a.reloadT <= 0 && !a.slideT);
  if (a.ads) a.sprint = false;
  a.adsT = THREE.MathUtils.clamp(a.adsT + (a.ads ? dt : -dt) * 5, 0, 1);

  const dive = a.state === 'skydive' ? Math.max(0, -Math.sin(a.pitch)) * (f >= 0 ? 1 : 0.3) : 0;
  updateMovement(a, dt, { mx, mz, jump: hit('jump') && !G.invOpen, dive });

  // Slots
  for (let i = 1; i <= 5; i++) if (hit('slot' + i)) switchSlot(a, i);
  if (hit('pickaxe')) switchSlot(a, 0);
  if (hit('nextSlot')) cycleSlot(a, 1);
  if (hit('prevSlot')) cycleSlot(a, -1);
  if (hit('reload')) startReload(a);

  // Interaktion: Loot/Truhen haben Vorrang, sonst Auto
  const onFoot = a.state === 'ground' || a.state === 'air' || a.state === 'swim';
  camState.interact = onFoot ? findInteract(a, { x: -sy, z: -cy }) : null;
  camState.car = onFoot && !camState.interact && a.state !== 'swim' ? nearestCar(a) : null;
  const use = hit('interact') || hit('padUse');
  if (use) {
    if (camState.interact) interact(a, camState.interact);
    else if (camState.car) requestCar(a, camState.car);
    else if (hit('padUse')) startReload(a);      // Controller: X lädt nach, wenn nichts zum Benutzen da ist
  }

  // Feuern / Benutzen
  const canAct = a.state === 'ground' || a.state === 'air' || a.state === 'grapple';
  if (canAct && !G.invOpen && (down('fire') || hit('fire'))) {
    if (a.sprint) a.sprint = false;
    const [o, d] = a.aimRay();
    trigger(a, o, d, hit('fire'));
  }

  // Pingen mit mittlerer Maustaste
  if (hit('ping') && !G.invOpen) {
    const hit = raycast(G.camera.position, camState.dir, 900);
    if (hit) { G.pings = [{ pos: hit.point.clone(), t: G.time }]; sfx('ping'); }
  }
}

// ---------- Kamera ----------
const pivot = new THREE.Vector3(), want = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3();
let spectateAng = 0;
export function updateCamera(dt) {
  const a = G.player, cam = G.camera;
  const p = a.pitch + view.recoil, yw = a.yaw;
  const dir = camState.dir.set(-Math.sin(yw) * Math.cos(p), Math.sin(p), -Math.cos(yw) * Math.cos(p));
  right.set(Math.cos(yw), 0, -Math.sin(yw));
  let back = 3.5, side = 0.72, up = 0.3, fov = G.baseFov;
  if (a.emoteT > 0 && a.state === 'ground') { back = 4.2; side = 0; up = 0.5; }
  const it = current(a), d = it ? DEFS[it.key] : null;

  if (G.victory && a.alive) {
    // Sieg: Kamera kreist langsam um die tanzende Figur
    const t = G.victory.t, e = Math.min(t, 7);
    const ang = a.yaw + Math.PI * 0.85 + t * 0.32, r = 3.0 + e * 0.45, h = 0.4 + e * 0.32;
    pivot.copy(a.pos).add(tmp.set(0, 1.25, 0));
    want.set(pivot.x + Math.sin(ang) * r, pivot.y + h, pivot.z + Math.cos(ang) * r);
    const off = want.clone().sub(pivot), len = off.length(); off.divideScalar(len);
    const hit = raycast(pivot, off, len + 0.2);
    if (hit) want.copy(pivot).addScaledVector(off, Math.max(0.6, hit.distance - 0.3));
    cam.position.lerp(want, Math.min(1, dt * 4));
    cam.lookAt(pivot);
    a.model.visible = true; camState.scoped = false;
    setFov(62, dt);
    return;
  }
  if (!a.alive && G.spectate && G.spectate.alive) {
    // Zuschauen: Kamera hinter dem beobachteten Spieler
    const t = G.spectate;
    const tp = t.pitch, ty = t.yaw;
    const d2 = tmp.set(-Math.sin(ty) * Math.cos(tp), Math.sin(tp), -Math.cos(ty) * Math.cos(tp));
    const sky = t.state === 'skydive' || t.state === 'glide' || t.state === 'bus';
    pivot.copy(t.state === 'bus' && G.bus ? G.bus.pos : t.pos).add(right.set(0, sky ? 1.2 : 1.55, 0));
    right.set(Math.cos(ty), 0, -Math.sin(ty));
    want.copy(pivot).addScaledVector(d2, -(t.state === 'bus' ? 20 : sky ? 6.5 : 3.6)).addScaledVector(right, sky ? 0 : 0.7);
    want.y += 0.3;
    const off = want.clone().sub(pivot), len = off.length(); off.divideScalar(len);
    const hit = raycast(pivot, off, len + 0.2);
    if (hit) want.copy(pivot).addScaledVector(off, Math.max(0.2, hit.distance - 0.25));
    cam.position.lerp(want, Math.min(1, dt * 10));
    cam.lookAt(want.copy(cam.position).add(d2));
    camState.scoped = false;
    setFov(G.baseFov, dt);
    return;
  }
  if (!a.alive) {
    spectateAng += dt * 0.15;
    pivot.copy(a.pos).add(tmp.set(0, 1.5, 0));
    cam.position.set(pivot.x + Math.sin(spectateAng) * 9, pivot.y + 5, pivot.z + Math.cos(spectateAng) * 9);
    cam.lookAt(pivot);
    camState.scoped = false;
    setFov(fov);
    return;
  }
  // Kamerahöhe weich nachführen (Ducken, Rutschen)
  const targetY = a.slideT > 0 ? 0.85 : a.crouch && a.state === 'ground' ? 1.15 : 1.55;
  view.camY += (targetY - view.camY) * Math.min(1, dt * 10);
  if (a.state === 'bus') {
    pivot.copy(G.bus.pos).add(tmp.set(0, 3, 0)); back = 22; side = 0; up = 3;
  } else if (a.state === 'car' && a.car) {
    pivot.copy(a.car.pos).add(tmp.set(0, 1.6, 0)); back = 8; side = 0; up = 1.4;
    fov = G.baseFov + Math.min(12, Math.abs(a.car.speed) * 0.4);
  } else if (a.state === 'skydive' || a.state === 'glide' || a.state === 'launch') {
    pivot.copy(a.pos).add(tmp.set(0, 1.2, 0)); back = a.diving ? 5 : 6.5; side = 0; up = 1.2;
    if (a.diving) fov = G.baseFov + 10;
  } else {
    pivot.copy(a.pos).add(tmp.set(0, view.camY, 0));
    if (a.sprint) fov = G.baseFov + 4;
    if (a.adsT > 0 && d && d.type === 'gun') {
      const k = a.adsT;
      back = THREE.MathUtils.lerp(3.5, d.scope ? 0 : 2.3, k);
      side = THREE.MathUtils.lerp(0.72, d.scope ? 0 : 0.8, k);
      up = THREE.MathUtils.lerp(0.3, 0.12, k);
      fov = THREE.MathUtils.lerp(G.baseFov, d.adsFov, k);
    }
  }
  camState.scoped = !!(d && d.scope && a.adsT > 0.9 && a.alive && a.state !== 'car');
  want.copy(pivot).addScaledVector(dir, -back).addScaledVector(right, side).add(tmp.set(0, up, 0));
  const off = tmp.subVectors(want, pivot); const len = off.length();
  if (len > 0.05 && a.state !== 'bus') {
    off.divideScalar(len);
    const hit = raycast(pivot, off, len + 0.2);
    if (hit) want.copy(pivot).addScaledVector(off, Math.max(0.1, hit.distance - 0.25));
  }
  cam.position.copy(want);
  cam.lookAt(tmp.copy(want).add(dir));
  a.model.visible = a.state !== 'bus' && !camState.scoped && cam.position.distanceTo(pivot) > 0.7;
  setFov(fov, dt);
}

function setFov(f, dt = 0.016) {
  view.fov += (f - view.fov) * Math.min(1, dt * 10);
  if (Math.abs(G.camera.fov - view.fov) > 0.01) { G.camera.fov = view.fov; G.camera.updateProjectionMatrix(); }
}
