// Eingabe: Tastatur + Maus, Controller, Touch – alles landet im Objekt I
import { $, isTouch, clamp } from './util.js';
import { renderer } from './engine.js';
import { I, cam, game } from './state.js';
import { settings } from './settings.js';

export const hooks = { respawn: () => {}, help: () => {}, pause: () => {} };   // werden von main.js gesetzt
export const flags = { locked: false, noLock: false, usingPad: false, kbLocked: false };

const keys = {}; let mouseL = false, mouseR = false, lookDX = 0, lookDY = 0;
const tb = {}, prev = {};

// Zeiger-Sperre: klappt sie zweimal nicht (z. B. in einer Vorschau), läuft die Maus ohne Sperre
let lockErr = 0;
const lockFail = () => { if (++lockErr >= 2) flags.noLock = true; };
export function reqLock() {
  if (!renderer.domElement.requestPointerLock) { flags.noLock = true; return; }
  try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(lockFail); }
  catch (e) { lockFail(); }
}
document.addEventListener('pointerlockerror', lockFail);
let fsChangeT = 0;   // kurz nach einem Vollbild-Wechsel kein Pausemenü, falls der Browser die Zeiger-Sperre neu setzt
document.addEventListener('pointerlockchange', () => {
  flags.locked = document.pointerLockElement === renderer.domElement; if (flags.locked) lockErr = 0;
  if (!flags.locked) {
    mouseL = mouseR = false;
    if (game.started && !game.paused && !isTouch) { if (performance.now() - fsChangeT < 800) setTimeout(() => { if (!flags.locked && !game.paused) reqLock(); }, 50); else hooks.pause(true); }
  }
});

/* ---------- Vollbild mit Tastatursperre ----------
   Im Vollbild darf ein Spiel in Chrome und Edge alle Tasten selbst nutzen (Keyboard Lock).
   Dann schließt Strg+W nicht mehr den Tab, Esc muss zum Verlassen gedrückt gehalten werden. */
export function enterFullscreen() {
  if (isTouch || !settings.fullscreen || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  fsChangeT = performance.now();
  el.requestFullscreen({ navigationUI: 'hide' }).then(lockKeys).catch(() => {});
}
function lockKeys() {
  if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().then(() => { flags.kbLocked = true; }).catch(() => {});
}
export function exitFullscreen() { if (document.fullscreenElement && document.exitFullscreen) { fsChangeT = performance.now(); document.exitFullscreen().catch(() => {}); } }
document.addEventListener('fullscreenchange', () => {
  fsChangeT = performance.now();
  if (!document.fullscreenElement) { flags.kbLocked = false; try { navigator.keyboard && navigator.keyboard.unlock(); } catch (e) {} }
  else if (game.started && !game.paused && !flags.locked && !flags.noLock && !isTouch) reqLock();
});

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  // Browser-Kürzel mit Strg (Strg+W, Strg+S, Strg+D …) im Spiel abfangen, soweit der Browser es erlaubt
  if ((e.ctrlKey || e.metaKey) && game.started && !game.paused) e.preventDefault();
  if (e.code === 'KeyH') hooks.help();
  if ((e.code === 'Escape' || e.code === 'KeyP') && game.started && !e.repeat) hooks.pause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseL = mouseR = false; });
renderer.domElement.addEventListener('mousedown', e => {
  if (!game.started || isTouch) return;
  if (!flags.locked && !flags.noLock) { reqLock(); return; }
  if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { if (flags.locked || (flags.noLock && game.started)) { lookDX += e.movementX; lookDY += e.movementY; } });
addEventListener('wheel', e => { cam.zoom = clamp(cam.zoom + Math.sign(e.deltaY) * .1, .6, 1.8); }, { passive: true });

/* ---------- Touch ---------- */
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, lk = { id: null, x: 0, y: 0 };
$('joy').addEventListener('pointerdown', e => {
  joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
  const s = $('stick'); s.style.display = 'block'; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; $('knob').style.transform = '';
  e.target.setPointerCapture(e.pointerId);
});
$('joy').addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy); if (l > 60) { dx *= 60 / l; dy *= 60 / l; }
  joy.x = dx / 60; joy.y = dy / 60; $('knob').style.transform = `translate(${dx}px,${dy}px)`;
});
const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; };
$('joy').addEventListener('pointerup', joyEnd); $('joy').addEventListener('pointercancel', joyEnd);
$('look').addEventListener('pointerdown', e => { lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY; e.target.setPointerCapture(e.pointerId); });
$('look').addEventListener('pointermove', e => { if (e.pointerId !== lk.id) return; lookDX += (e.clientX - lk.x) * 1.7; lookDY += (e.clientY - lk.y) * 1.7; lk.x = e.clientX; lk.y = e.clientY; });
const lkEnd = e => { if (e.pointerId === lk.id) lk.id = null; };
$('look').addEventListener('pointerup', lkEnd); $('look').addEventListener('pointercancel', lkEnd);
document.querySelectorAll('.tb').forEach(el => {
  const k = el.dataset.k;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); tb[k] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); if (k === 'pause') hooks.pause(); });
  const up = () => { tb[k] = false; el.classList.remove('on'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
});

/* ---------- Controller ---------- */
export function readPad() { const gs = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of gs) if (g && g.connected) return g; return null; }
const dz = v => Math.abs(v) < .15 ? 0 : (v - Math.sign(v) * .15) / .85;
export function rumble(m, ms) {
  const g = readPad();
  try { g && g.vibrationActuator && g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: m, weakMagnitude: m * .6 }); } catch (e) {}
  if (isTouch && navigator.vibrate) navigator.vibrate(Math.min(ms, 40));
}

/* ---------- pro Frame alles zusammenführen ---------- */
export function gatherInput(dt) {
  const g = readPad(); flags.usingPad = !!g;
  let mx = 0, mz = 0;
  if (keys.KeyW) mz += 1; if (keys.KeyS) mz -= 1; if (keys.KeyD) mx += 1; if (keys.KeyA) mx -= 1;
  const sens = settings.sens, inv = settings.invertY ? -1 : 1;
  let lx = lookDX * .0024 * sens, ly = lookDY * .0024 * sens * inv; lookDX = lookDY = 0;
  lx += ((keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)) * 2.4 * dt; ly += ((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)) * 1.8 * dt;
  let swing = mouseL || !!keys.KeyE, dbl = !!keys.KeyR, jump = !!keys.Space, zip = mouseR || !!keys.KeyQ, sling = !!keys.KeyF,
    dive = !!(keys.KeyC || ((keys.ControlLeft || keys.ControlRight) && flags.kbLocked)), sprint = !!(keys.ShiftLeft || keys.ShiftRight), trick = !!keys.KeyX, reset = false, start = false, menu = false;
  if (g) {
    const b = i => !!(g.buttons[i] && g.buttons[i].pressed);
    const ax = dz(g.axes[0] || 0), ay = dz(g.axes[1] || 0);
    mx += ax; mz -= ay; lx += dz(g.axes[2] || 0) * 2.8 * dt * sens; ly += dz(g.axes[3] || 0) * 2.0 * dt * sens * inv;
    swing = swing || b(7); dbl = dbl || b(5); jump = jump || b(0); zip = zip || b(4); trick = trick || b(3); sling = sling || b(2);
    dive = dive || b(1) || b(6); sprint = sprint || b(10) || Math.hypot(ax, ay) > .92; reset = b(8); start = b(0); menu = b(9);
  }
  if (isTouch) {
    mx += joy.x; mz -= joy.y; if (Math.hypot(joy.x, joy.y) > .92) sprint = true;
    swing = swing || !!tb.swing; dbl = dbl || !!tb.dbl; jump = jump || !!tb.jump; zip = zip || !!tb.zip; sling = sling || !!tb.sling; dive = dive || !!tb.dive; trick = trick || !!tb.trick;
  }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  Object.assign(I, { mx, mz, lx, ly, look: Math.abs(lx) + Math.abs(ly) > 1e-4 });
  const st = { swing, dbl, jump, zip, sling, dive, sprint, trick, reset, start, menu };
  for (const k in st) { I[k + 'P'] = st[k] && !prev[k]; I[k] = st[k]; prev[k] = st[k]; }
  if (I.resetP && game.started && !game.paused) hooks.respawn();
  if (I.menuP && game.started) hooks.pause();
}
