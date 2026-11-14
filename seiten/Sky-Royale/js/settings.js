// Einstellungen: Tastenbelegung, Maus, Grafik, Audio & HUD – gespeichert im Browser
import { G } from './state.js';
import { ACTIONS, binds, setBind, resetBinds, keyName, captureNext, setFullscreenWanted } from './input.js';
import { setVolume } from './audio.js';
import { setMusicUrl, applyVolume, validUrl, cleanUrl } from './music.js';

const STORE = 'skyroyale.settings.v1';
export const DEFAULTS = {
  sens: 1, adsSens: 0.75, padSens: 1, touchSens: 1, invertY: false, touch: matchMedia('(pointer: coarse)').matches,
  fov: 80, quality: matchMedia('(pointer: coarse)').matches ? 0.7 : 1, shadows: true, viewDist: 760, clouds: true,
  volume: 0.6, fullscreen: true, showFps: false, minimapZoom: 1, damageNumbers: true, autoSprint: false,
  prefSlots: {},
  musicUrl: '', musicVol: 0.5, musicAuto: true, noDupes: false,                      // bevorzugte Slots je Item-Kategorie (0 = egal)
};
export const SLOT_CATS = [['ar', 'Sturmgewehre'], ['shotgun', 'Shotguns'], ['smg', 'Maschinenpistolen'], ['pistol', 'Pistolen'], ['sniper', 'Scharfschützengewehre'],
  ['rocket', 'Raketenwerfer'], ['heal', 'Heilung (Verband, Medikit)'], ['shield', 'Schildtränke'], ['throw', 'Granaten'], ['mobility', 'Mobilität (Startrampe, Enterhaken, Riss)']];
Object.assign(G.settings, DEFAULTS, { prefSlots: {} });
try { Object.assign(G.settings, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(G.settings)); } catch (e) {} };

export function applySettings() {
  const s = G.settings, R = G.renderer;
  G.baseFov = s.fov;
  if (R) {
    R.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.quality);
    R.setSize(innerWidth, innerHeight);
    if (G.sun && G.sun.castShadow !== s.shadows) { G.sun.castShadow = s.shadows; G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
  }
  if (G.scene && G.scene.fog) { G.scene.fog.far = s.viewDist; G.scene.fog.near = s.viewDist * 0.3; }
  if (G.camera) { G.camera.far = Math.max(900, s.viewDist + 400); G.camera.updateProjectionMatrix(); }
  if (G.clouds) G.clouds.visible = s.clouds;
  setVolume(s.volume);
  applyVolume();
  setFullscreenWanted(s.fullscreen);
  if (G.onTouchSetting) G.onTouchSetting(s.touch);
  const fps = document.getElementById('fps'); if (fps) fps.style.display = s.showFps ? 'block' : 'none';
}

// ---------- Oberfläche ----------
const TABS = [['keys', 'Tastenbelegung'], ['slots', 'Bevorzugte Slots'], ['music', 'Musik'], ['mouse', 'Maus, Controller & Touch'], ['gfx', 'Grafik'], ['other', 'Audio & HUD']];
const SLIDERS = {
  mouse: [['sens', 'Mausempfindlichkeit', 0.1, 3, 0.05], ['adsSens', 'Empfindlichkeit beim Zielen', 0.2, 1.5, 0.05], ['padSens', 'Controller-Empfindlichkeit', 0.3, 2.5, 0.05], ['touchSens', 'Touch-Empfindlichkeit', 0.3, 2.5, 0.05]],
  gfx: [['fov', 'Sichtfeld (FOV)', 65, 105, 1], ['quality', 'Auflösung (Render-Skalierung)', 0.5, 1.25, 0.05], ['viewDist', 'Sichtweite', 350, 1200, 10]],
  music: [['musicVol', 'Musik-Lautstärke', 0, 1, 0.01]],
  other: [['volume', 'Lautstärke', 0, 1, 0.01], ['minimapZoom', 'Minimap-Zoom', 0.6, 1.8, 0.05]],
};
const TOGGLES = {
  mouse: [['invertY', 'Y-Achse invertieren'], ['touch', 'Touch-Steuerung anzeigen']],
  gfx: [['fullscreen', 'Vollbild beim Spielen (sperrt Strg+W)'], ['shadows', 'Schatten'], ['clouds', 'Wolken'], ['showFps', 'FPS anzeigen']],
  music: [['musicAuto', 'Musik beim Rundenstart automatisch abspielen']],
  other: [['noDupes', 'Keine doppelten Items aufheben (bessere Seltenheit tauscht automatisch)'], ['damageNumbers', 'Schadenszahlen'], ['autoSprint', 'Automatisch laufen = sprinten']],
};
let tab = 'keys', root, onClose;
try { tab = localStorage.getItem('skyroyale.settab') || 'keys'; } catch (e) {}

export function openSettings(cb) {
  onClose = cb;
  root = document.getElementById('settings');
  root.classList.remove('hidden');
  if (!TABS.some(t => t[0] === tab)) tab = 'keys';
  render();
}
function close() { root.classList.add('hidden'); captureNext(null); if (onClose) onClose(); }

function render() {
  const s = G.settings;
  let body = '';
  if (tab === 'keys') {
    let group = '';
    body += '<table class="binds"><tr><th>Aktion</th><th>Primär</th><th>Sekundär</th></tr>';
    for (const [id, label, grp] of ACTIONS) {
      if (grp !== group) { group = grp; body += `<tr class="grp"><td colspan="3">${grp}</td></tr>`; }
      body += `<tr><td>${label}</td>${[0, 1].map(i => `<td><button class="bind" data-a="${id}" data-i="${i}">${keyName(binds[id][i])}</button></td>`).join('')}</tr>`;
    }
    body += '</table><p class="hint">Feld anklicken, dann Taste, Maustaste oder Mausrad drücken. Esc bricht ab, Entf löscht.</p>';
    body += `<table class="binds pad"><tr class="grp"><td colspan="2">Controller (Xbox / PlayStation)</td></tr>
      ${[['Linker Stick', 'Laufen (L3 drücken = Sprinten)'], ['Rechter Stick', 'Umsehen'], ['RT / R2', 'Schießen · im Auto Gas'], ['LT / L2', 'Zielen · im Auto Bremse/Rückwärts'],
        ['A / ✕', 'Springen · Abspringen · Gleiter'], ['B / ○', 'Ducken · beim Sprinten Rutschen'], ['X / □', 'Benutzen · Nachladen · Einsteigen'], ['Y / △', 'Spitzhacke'],
        ['LB / RB', 'Slot wechseln'], ['Steuerkreuz ↑', 'Inventar an / aus'], ['Steuerkreuz ↓ / ←', 'Tanzen / Pingen'], ['View / Share', 'Karte'], ['Menü / Options', 'Pause']]
        .map(([k, v]) => `<tr><td style="width:180px"><b>${k}</b></td><td>${v}</td></tr>`).join('')}</table>`;
  } else if (tab === 'slots') {
    const p = s.prefSlots || (s.prefSlots = {});
    body += '<p class="hint" style="margin-top:0">Aufgehobene Items landen automatisch in ihrem Slot. Liegt dort schon etwas anderes, rutscht es in einen freien Slot. Andere Items nehmen bevorzugte Slots nur, wenn nichts anderes frei ist.</p>';
    for (const [k, label] of SLOT_CATS) body += `<label class="opt"><span>${label}</span><select data-slot="${k}">${['Egal', 1, 2, 3, 4, 5].map((n, i) => `<option value="${i}" ${(p[k] || 0) === i ? 'selected' : ''}>${i ? 'Slot ' + n : n}</option>`).join('')}</select></label>`;
  } else {
    if (tab === 'music') body += `<p class="hint" style="margin-top:0">Füge den Link zu einem öffentlichen SoundCloud-Track oder einer Playlist ein (z. B. https://soundcloud.com/künstler/sets/playlist).
      Gestreamt wird über den offiziellen SoundCloud-Player. Öffentliche Titel laufen ohne Konto. Wichtig: Ein Profil-Link spielt nur die eigenen Uploads dieses Profils – für deine Lieblingssongs leg in SoundCloud eine öffentliche Playlist an und nimm deren Link (…/sets/…). Nichts wird gespeichert oder heruntergeladen. Alle gehörten Titel stehen mit Künstler und Link unter „Credits“ im Hauptmenü.</p>
      <label class="opt"><span>SoundCloud-Link</span><input type="text" id="music-url" spellcheck="false" placeholder="https://soundcloud.com/…" value="${(s.musicUrl || '').replace(/"/g, '&quot;')}"><button id="music-set" class="small">Übernehmen</button></label>
      <p class="hint" id="music-status"></p>`;
    for (const [k, label, min, max, step] of SLIDERS[tab]) {
      const v = s[k];
      body += `<label class="opt"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><b>${fmt(k, v)}</b></label>`;
    }
    for (const [k, label] of TOGGLES[tab]) body += `<label class="opt tog"><span>${label}</span><input type="checkbox" data-t="${k}" ${s[k] ? 'checked' : ''}></label>`;
  }
  root.innerHTML = `<div class="panel wide">
    <div class="tabs">${TABS.map(([id, n]) => `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>
    <div class="body">${body}</div>
    <div class="row"><button class="ghost" id="set-reset">Standard wiederherstellen</button><button id="set-close">Fertig</button></div></div>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; try { localStorage.setItem('skyroyale.settab', tab); } catch (e) {} render(); });
  const mb = root.querySelector('#music-set');
  if (mb) mb.onclick = async () => {
    const u = root.querySelector('#music-url').value.trim(), st = root.querySelector('#music-status');
    if (u && !validUrl(u)) { st.textContent = 'Das ist kein SoundCloud-Link (muss mit https://soundcloud.com/ anfangen).'; return; }
    s.musicUrl = u ? cleanUrl(u) : ''; save();
    root.querySelector('#music-url').value = s.musicUrl;
    st.textContent = u ? 'Player wird geladen …' : 'Musik entfernt.';
    if (await setMusicUrl(u) && u) st.textContent = 'Player bereit – unten links auf ▶ klicken oder im Spiel mit ' + keyName(binds.music[0]) + ' starten. ' + keyName(binds.musicNext[0]) + ': nächster Song.';
  };
  root.querySelectorAll('select[data-slot]').forEach(c => c.onchange = () => { s.prefSlots[c.dataset.slot] = +c.value; save(); });
  root.querySelector('#set-close').onclick = close;
  root.querySelector('#set-reset').onclick = () => {
    if (tab === 'keys') resetBinds();
    else if (tab === 'slots') { s.prefSlots = {}; save(); }
    else if (tab === 'music') { s.musicVol = DEFAULTS.musicVol; s.musicAuto = DEFAULTS.musicAuto; save(); applySettings(); }
    else { for (const [k] of [...(SLIDERS[tab] || []), ...(TOGGLES[tab] || [])]) s[k] = DEFAULTS[k]; save(); applySettings(); }
    render();
  };
  root.querySelectorAll('.bind').forEach(b => b.onclick = e => {
    e.stopPropagation();
    root.querySelectorAll('.bind.wait').forEach(x => x.classList.remove('wait'));
    b.classList.add('wait'); b.textContent = 'Taste drücken …';
    setTimeout(() => captureNext(code => {
      if (code === 'Delete') code = '';
      if (code !== null) setBind(b.dataset.a, +b.dataset.i, code);
      render();
    }), 50);
  });
  root.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => {
    s[r.dataset.k] = +r.value; r.nextElementSibling.textContent = fmt(r.dataset.k, +r.value); save(); applySettings();
  });
  root.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => { s[c.dataset.t] = c.checked; save(); applySettings(); });
}
function fmt(k, v) {
  if (k === 'fov') return v + '°';
  if (k === 'viewDist') return v + ' m';
  if (k === 'volume' || k === 'quality' || k === 'musicVol') return Math.round(v * 100) + ' %';
  return (+v).toFixed(2);
}
