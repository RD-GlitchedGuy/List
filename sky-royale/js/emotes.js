// Emotes und Emote-Rad: Emote-Taste kurz drücken = letztes Emote, halten = Rad (Maus/rechter Stick wählt, loslassen spielt ab)
import * as THREE from 'three';
import { G } from './state.js';
import { down, mouse, analog, touchMode, padConnected, virtDown, promptKey } from './input.js';
import { sfx } from './audio.js';

// dance: läuft, bis man sich bewegt (mit Musik) – sonst kurze Geste
export const EMOTES = [
  { name: 'Arme hoch', dance: true }, { name: 'Hüftschwung', dance: true }, { name: 'Winken', time: 2.6 }, { name: 'Roboter', dance: true },
  { name: 'Jubeln', time: 2.8 }, { name: 'Hüpfer', dance: true }, { name: 'Salutieren', time: 2.4 }, { name: 'Klatschen', time: 3 },
];
const N = EMOTES.length;
let root, open = false, heldT = 0, sel = -1, last = 0;
const v = { x: 0, y: 0 };
try { last = +localStorage.getItem('skyroyale.emote') || 0; } catch (e) {}

export function initEmoteWheel() {
  root = document.getElementById('emote-wheel');
  root.innerHTML = '<div class="ew-center"><b></b><small></small></div>' + EMOTES.map((e, i) => {
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2, r = 128;
    return `<div class="ew-item" data-e="${i}" style="left:${Math.cos(ang) * r}px;top:${Math.sin(ang) * r}px">${e.name}</div>`;
  }).join('');
  root.addEventListener('pointerdown', e => {          // Touch / freie Maus: direkt antippen
    const t = e.target.closest('[data-e]'); if (!t) return;
    e.preventDefault(); play(+t.dataset.e); close();
  });
}

export function playEmote(a, i) {
  const e = EMOTES[i]; if (!e) return;
  a.emoteStyle = i; a.emoteT = e.dance ? 600 : e.time;
}
function play(i) { const a = G.player; if (!a) return; last = i; try { localStorage.setItem('skyroyale.emote', i); } catch (e) {} playEmote(a, i); }
function close() { open = false; G.wheelOpen = false; root.classList.add('hidden'); virtDown.delete('emote'); const b = document.querySelector('.b-emote'); if (b) b.classList.remove('on'); }

export function updateEmoteWheel(dt) {
  const a = G.player;
  const can = a && a.alive && a.state === 'ground' && !G.ended && !G.victory && !G.invOpen;
  const held = can && down('emote');
  if (!can) { if (open) close(); heldT = 0; return; }
  if (held) {
    heldT += dt;
    if (!open && (heldT > 0.22 || (touchMode && !padConnected))) {      // halten öffnet das Rad (Touch: sofort)
      open = true; G.wheelOpen = true; sel = -1; v.x = v.y = 0;
      root.classList.remove('hidden'); sfx('invopen', 0, { vol: 0.6 });
    }
  } else if (heldT > 0) {
    if (!open) { if (a.emoteT > 0) a.emoteT = 0; else play(last); }   // kurz getippt
    else { if (sel >= 0) play(sel); close(); }        // loslassen spielt die Auswahl
    heldT = 0;
  }
  if (!open) return;
  // Auswahl per Mausbewegung oder rechtem Stick
  v.x += mouse.dx; v.y += mouse.dy;
  if (Math.abs(analog.lookX) + Math.abs(analog.lookY) > 0.3) { v.x = analog.lookX * 100; v.y = analog.lookY * 100; }
  const len = Math.hypot(v.x, v.y);
  if (len > 90) { v.x *= 90 / len; v.y *= 90 / len; }
  if (len > 25) {
    const ang = Math.atan2(v.y, v.x) + Math.PI / 2;
    const i = ((Math.round(ang / (Math.PI * 2) * N) % N) + N) % N;
    if (i !== sel) { sel = i; sfx('hover'); }
  }
  [...root.querySelectorAll('.ew-item')].forEach((d, i) => d.classList.toggle('sel', i === sel));
  root.querySelector('.ew-center b').textContent = sel >= 0 ? EMOTES[sel].name : 'Emote wählen';
  root.querySelector('.ew-center small').textContent = padConnected ? 'rechter Stick · Steuerkreuz loslassen' : touchMode ? 'antippen' : 'Maus bewegen · ' + promptKey('emote') + ' loslassen';
}
