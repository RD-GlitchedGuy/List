// Einstellungen: Tastenbelegung, Maus, Grafik, Audio & HUD – gespeichert im Browser
import { G } from './state.js';
import { ACTIONS, binds, setBind, resetBinds, keyName, captureNext, setFullscreenWanted } from './input.js';
import { setVolume } from './audio.js';

const STORE = 'skyroyale.settings.v1';
export const DEFAULTS = {
  sens: 1, adsSens: 0.75, padSens: 1, touchSens: 1, invertY: false, touch: matchMedia('(pointer: coarse)').matches,
  fov: 80, quality: matchMedia('(pointer: coarse)').matches ? 0.7 : 1, shadows: true, viewDist: 760, clouds: true,
  volume: 0.6, fullscreen: true, showFps: false, minimapZoom: 1, damageNumbers: true, autoSprint: false,
};
Object.assign(G.settings, DEFAULTS);
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
  setFullscreenWanted(s.fullscreen);
  if (G.onTouchSetting) G.onTouchSetting(s.touch);
  const fps = document.getElementById('fps'); if (fps) fps.style.display = s.showFps ? 'block' : 'none';
}

// ---------- Oberfläche ----------
const TABS = [['keys', 'Tastenbelegung'], ['mouse', 'Maus, Controller & Touch'], ['gfx', 'Grafik'], ['other', 'Audio & HUD']];
const SLIDERS = {
  mouse: [['sens', 'Mausempfindlichkeit', 0.1, 3, 0.05], ['adsSens', 'Empfindlichkeit beim Zielen', 0.2, 1.5, 0.05], ['padSens', 'Controller-Empfindlichkeit', 0.3, 2.5, 0.05], ['touchSens', 'Touch-Empfindlichkeit', 0.3, 2.5, 0.05]],
  gfx: [['fov', 'Sichtfeld (FOV)', 65, 105, 1], ['quality', 'Auflösung (Render-Skalierung)', 0.5, 1.25, 0.05], ['viewDist', 'Sichtweite', 350, 1200, 10]],
  other: [['volume', 'Lautstärke', 0, 1, 0.01], ['minimapZoom', 'Minimap-Zoom', 0.6, 1.8, 0.05]],
};
const TOGGLES = {
  mouse: [['invertY', 'Y-Achse invertieren'], ['touch', 'Touch-Steuerung anzeigen']],
  gfx: [['fullscreen', 'Vollbild beim Spielen (sperrt Strg+W)'], ['shadows', 'Schatten'], ['clouds', 'Wolken'], ['showFps', 'FPS anzeigen']],
  other: [['damageNumbers', 'Schadenszahlen'], ['autoSprint', 'Automatisch laufen = sprinten']],
};
let tab = 'keys', root, onClose;

export function openSettings(cb) {
  onClose = cb;
  root = document.getElementById('settings');
  root.classList.remove('hidden');
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
        ['LB / RB', 'Slot wechseln'], ['Steuerkreuz ↑ / ↓', 'Pingen / Tanzen'], ['View / Share', 'Karte'], ['Menü / Options', 'Pause']]
        .map(([k, v]) => `<tr><td style="width:180px"><b>${k}</b></td><td>${v}</td></tr>`).join('')}</table>`;
  } else {
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
  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  root.querySelector('#set-close').onclick = close;
  root.querySelector('#set-reset').onclick = () => {
    if (tab === 'keys') resetBinds();
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
  if (k === 'volume' || k === 'quality') return Math.round(v * 100) + ' %';
  return (+v).toFixed(2);
}
