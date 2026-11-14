// Touch-Steuerung für Handy/Tablet: Joystick links, Umsehen per Wischen rechts, Tasten wie in Fortnite Mobile
import { G } from './state.js';
import { virtDown, virtHit, touchStick, mouse, setTouchMode } from './input.js';

const BUTTONS = [
  // id, Beschriftung, Aktion, Halten?
  ['fire', 'Feuer', 'fire', true], ['fire2', 'Feuer', 'fire', true], ['aim', 'Zielen', 'aim', 'toggle'],
  ['jump', 'Springen', 'jump', true], ['crouch', 'Ducken', 'crouch', false], ['reload', 'Laden', 'reload', false],
  ['use', 'Benutzen', 'padUse', false], ['pick', 'Hacke', 'pickaxe', false],
  ['map', 'Karte', 'map', false], ['ping', 'Ping', 'ping', false], ['emote', 'Tanz', 'emote', false], ['pause', 'Menü', 'pause', false],
];
let root, stickBase, stickKnob, active = false;
const touches = new Map();
const R = 58;

export function initTouch() {
  root = document.getElementById('touch');
  root.innerHTML = `<div class="t-look"></div><div class="t-stick"><i></i></div>` +
    BUTTONS.map(([id, label]) => `<div class="t-btn b-${id}" data-id="${id}">${label}</div>`).join('') +
    `<div class="t-rotate">Bitte das Gerät quer halten</div>`;
  stickBase = root.querySelector('.t-stick'); stickKnob = stickBase.querySelector('i');
  root.addEventListener('touchstart', start, { passive: false });
  root.addEventListener('touchmove', move, { passive: false });
  root.addEventListener('touchend', end, { passive: false });
  root.addEventListener('touchcancel', end, { passive: false });
  // Slots, Hinweis und Karte direkt antippen
  document.getElementById('hotbar').addEventListener('touchstart', e => {
    const slot = e.target.closest('.slot'); if (!slot) return;
    e.preventDefault();
    const i = [...slot.parentNode.children].indexOf(slot);
    virtHit.add(i === 0 ? 'pickaxe' : 'slot' + i);
  }, { passive: false });
  document.getElementById('prompt').addEventListener('touchstart', e => { e.preventDefault(); virtHit.add('padUse'); }, { passive: false });
  document.getElementById('bigmap-wrap').addEventListener('touchstart', e => { e.preventDefault(); virtHit.add('map'); }, { passive: false });
}

export function setTouch(on) {
  active = !!on;
  setTouchMode(active);
  document.body.classList.toggle('touch', active);
  if (root) root.classList.toggle('hidden', !active || !G.player);
}
export function showTouch(v) { if (root) root.classList.toggle('hidden', !active || !v); }

function start(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('.t-btn');
    if (btn) {
      const def = BUTTONS.find(b => b[0] === btn.dataset.id), action = def[2];
      btn.classList.add('on');
      if (def[3] === 'toggle') { if (virtDown.has(action)) { virtDown.delete(action); btn.classList.remove('on'); } else virtDown.add(action); }
      else { virtHit.add(action); if (def[3]) virtDown.add(action); }
      // Feuer-Knopf: Finger darf gleichzeitig umsehen
      touches.set(t.identifier, { kind: 'btn', action, hold: def[3] === true, el: btn, look: action === 'fire', x: t.clientX, y: t.clientY });
      continue;
    }
    if (root.classList.contains('dead')) { virtHit.add('padUse'); continue; }   // Zuschauen: Tippen = nächster Spieler
    if (t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.3 && ![...touches.values()].some(v => v.kind === 'stick')) {
      touches.set(t.identifier, { kind: 'stick', x0: t.clientX, y0: t.clientY });
      stickBase.style.left = t.clientX + 'px'; stickBase.style.top = t.clientY + 'px'; stickBase.classList.add('on');
      stickKnob.style.transform = 'translate(-50%,-50%)';
    } else touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
  }
}

function move(e) {
  e.preventDefault();
  const k = 1.5 * (G.settings.touchSens || 1);
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier); if (!s) continue;
    if (s.kind === 'stick') {
      let dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      touchStick.x = dx / R; touchStick.y = -dy / R;
      stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // ganz durchgedrückt = automatisch sprinten
      if (l >= R * 0.98 && dy < -R * 0.5) virtDown.add('sprint'); else virtDown.delete('sprint');
    } else if (s.kind === 'look' || s.look) {
      mouse.dx += (t.clientX - s.x) * k; mouse.dy += (t.clientY - s.y) * k;
      s.x = t.clientX; s.y = t.clientY;
    }
  }
}

function end(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier); if (!s) continue;
    touches.delete(t.identifier);
    if (s.kind === 'stick') { touchStick.x = touchStick.y = 0; virtDown.delete('sprint'); stickBase.classList.remove('on'); }
    if (s.kind === 'btn') {
      if (s.hold && ![...touches.values()].some(v => v.action === s.action)) virtDown.delete(s.action);
      if (!(s.action === 'aim' && virtDown.has('aim'))) s.el.classList.remove('on');
    }
  }
}

// Schaltflächen ein-/ausblenden je nach Lage (z. B. „Benutzen“ nur, wenn es etwas gibt)
export function updateTouch(canUse, inCar, dead) {
  if (!active || !root) return;
  root.classList.toggle('dead', !!dead);
  root.classList.toggle('car', !!inCar);
  root.querySelector('.b-use').classList.toggle('dim', !canUse && !inCar);
}
