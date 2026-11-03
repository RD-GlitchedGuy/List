// Pausemenü mit Einstellungen, Anzug-Editor und Online-Fenster
import { $ } from './util.js';
import { settings, saveSettings, best } from './settings.js';
import { applyQuality, applyTime } from './engine.js';
import { setVolume } from './audio.js';
import { fmtRace } from './hud.js';
import { setHeroColors, DEFAULT_COLORS } from './hero.js';
import { net, goOnline, createRoom, joinRoom, leaveRoom, setName, onNetChange } from './net.js';
import { enterFullscreen, exitFullscreen } from './input.js';

export const menuHooks = { resume() {}, free() {}, race() {}, courier() {}, chase() {}, respawn() {}, online() {}, onlineBack() {} };

export function applyAll() { applyQuality(); applyTime(); setVolume(settings.volume); setHeroColors(settings.colors); }

const PRESETS = {
  sky: DEFAULT_COLORS,
  eis: { base: '#e8eef6', panel: '#9fb3c8', acc: '#3cc8ff', dark: '#1d2a3a', visor: '#7fe0ff' },
  smaragd: { base: '#0f2a22', panel: '#1f5a45', acc: '#7dff6a', dark: '#0c1a14', visor: '#b6ff4a' },
  nacht: { base: '#141018', panel: '#3a2a52', acc: '#b06bff', dark: '#0d0a12', visor: '#e0b0ff' },
  gold: { base: '#23211d', panel: '#4a4234', acc: '#ffc23a', dark: '#15140f', visor: '#ffe28a' },
};

export function syncMenu() {
  document.querySelectorAll('.seg').forEach(seg => {
    const k = seg.dataset.s;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[k]) === b.dataset.v));
  });
  $('sSens').value = settings.sens; $('sVol').value = settings.volume;
  document.querySelectorAll('.suit input').forEach(i => i.value = settings.colors[i.dataset.c] || DEFAULT_COLORS[i.dataset.c]);
  document.querySelectorAll('.bestTxt').forEach(e => e.textContent = best.race != null ? 'Bestzeit ' + fmtRace(best.race) : '');
}
document.querySelectorAll('.seg').forEach(seg => {
  const k = seg.dataset.s;
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.v; settings[k] = v === 'true' ? true : v === 'false' ? false : v;
    saveSettings(); syncMenu();
    if (k === 'quality') applyQuality();
    if (k === 'time') applyTime();
    if (k === 'fullscreen') { if (settings.fullscreen) enterFullscreen(); else exitFullscreen(); }
  }));
});
$('sSens').addEventListener('input', e => { settings.sens = +e.target.value; saveSettings(); });
$('sVol').addEventListener('input', e => { settings.volume = +e.target.value; setVolume(settings.volume); saveSettings(); });
document.querySelectorAll('.suit input').forEach(i => i.addEventListener('input', () => { settings.colors = Object.assign({}, settings.colors, { [i.dataset.c]: i.value }); setHeroColors(settings.colors); saveSettings(); }));
document.querySelectorAll('.presets button').forEach(b => b.addEventListener('click', () => { settings.colors = Object.assign({}, PRESETS[b.dataset.p]); setHeroColors(settings.colors); saveSettings(); syncMenu(); }));
document.querySelectorAll('.mb[data-a]').forEach(b => b.addEventListener('click', () => menuHooks[b.dataset.a]()));

export const openMenu = () => { syncMenu(); $('menu').style.display = 'flex'; };
export const closeMenu = () => { $('menu').style.display = 'none'; };

/* ---------- Online-Fenster ---------- */
export function openOnline() { $('online').style.display = 'flex'; $('oName').value = settings.name; goOnline(); renderOnline(); }
export const closeOnline = () => { $('online').style.display = 'none'; };
function renderOnline() {
  $('oStatus').textContent = net.status === 'online' ? (net.room ? 'Verbunden' : 'Bereit – erstelle einen Raum oder tritt einem bei') : net.status;
  const room = $('oRoom');
  if (net.room) {
    room.style.display = 'block';
    room.innerHTML = net.room.host
      ? `Raumcode <b class="code">${net.room.code}</b><br>${net.room.pub ? 'Öffentlich in der Lobby sichtbar' : 'Privat – gib deinem Freund den Code'} · ${net.players} Spieler`
      : `Im Raum <b class="code">${net.room.code}</b><br>${net.players} Spieler`;
  } else room.style.display = 'none';
  $('oLeave').style.display = net.room ? '' : 'none';
  const list = $('oRooms');
  if (!net.rooms.length) list.innerHTML = '<p class="hint">Noch keine offenen Räume.</p>';
  else {
    list.innerHTML = '';
    for (const r of net.rooms) {
      const d = document.createElement('div'); d.className = 'room';
      const n = document.createElement('span'); n.textContent = `${r.name} · ${r.players}/8`;
      const b = document.createElement('button'); b.textContent = 'Beitreten'; b.onclick = () => { joinRoom(r.code); };
      d.append(n, b); list.append(d);
    }
  }
}
onNetChange(renderOnline);
$('oName').addEventListener('change', e => setName(e.target.value));
$('oPub').onclick = () => { setName($('oName').value); if (net.status === 'online') createRoom(true); };
$('oPriv').onclick = () => { setName($('oName').value); if (net.status === 'online') createRoom(false); };
$('oJoin').onclick = () => { setName($('oName').value); joinRoom($('oCode').value); };
$('oCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') joinRoom(e.target.value); });
$('oName').addEventListener('keydown', e => e.stopPropagation());
$('oLeave').onclick = () => leaveRoom();
$('oBack').onclick = () => menuHooks.onlineBack();
