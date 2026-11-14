// Eingabe über Aktionen mit frei belegbaren Tasten (Tastatur, Maustasten, Mausrad)
export const keys = {};
export const pressed = new Set();
export const mouse = { dx: 0, dy: 0, wheel: 0 };
export let locked = false;

// [Aktion, Bezeichnung, Gruppe, Standard primär, Standard sekundär]
export const ACTIONS = [
  ['forward', 'Vorwärts', 'Bewegung', 'KeyW', 'ArrowUp'],
  ['back', 'Rückwärts', 'Bewegung', 'KeyS', 'ArrowDown'],
  ['left', 'Links', 'Bewegung', 'KeyA', 'ArrowLeft'],
  ['right', 'Rechts', 'Bewegung', 'KeyD', 'ArrowRight'],
  ['jump', 'Springen / Abspringen / Gleiter', 'Bewegung', 'Space', ''],
  ['sprint', 'Sprinten', 'Bewegung', 'ShiftLeft', ''],
  ['crouch', 'Ducken / Rutschen', 'Bewegung', 'ControlLeft', 'KeyC'],
  ['autorun', 'Automatisch laufen', 'Bewegung', 'Equal', ''],
  ['fire', 'Schießen / Benutzen', 'Kampf', 'Mouse0', ''],
  ['aim', 'Zielen', 'Kampf', 'Mouse2', ''],
  ['reload', 'Nachladen', 'Kampf', 'KeyR', ''],
  ['pickaxe', 'Spitzhacke', 'Kampf', 'KeyF', ''],
  ['slot1', 'Slot 1', 'Kampf', 'Digit1', ''],
  ['slot2', 'Slot 2', 'Kampf', 'Digit2', ''],
  ['slot3', 'Slot 3', 'Kampf', 'Digit3', ''],
  ['slot4', 'Slot 4', 'Kampf', 'Digit4', ''],
  ['slot5', 'Slot 5', 'Kampf', 'Digit5', ''],
  ['nextSlot', 'Nächster Slot', 'Kampf', 'WheelDown', ''],
  ['prevSlot', 'Vorheriger Slot', 'Kampf', 'WheelUp', ''],
  ['interact', 'Öffnen / Aufheben / Einsteigen', 'Sonstiges', 'KeyE', ''],
  ['ping', 'Ort pingen', 'Sonstiges', 'Mouse1', 'KeyZ'],
  ['map', 'Karte', 'Sonstiges', 'KeyM', ''],
  ['emote', 'Emote (Tanzen)', 'Sonstiges', 'KeyB', ''],
  ['scoreboard', 'Spielerliste', 'Sonstiges', 'Tab', ''],
];
const STORE = 'skyroyale.binds.v1';
export const binds = {};
export function resetBinds() { for (const [id, , , a, b] of ACTIONS) binds[id] = [a, b]; saveBinds(); }
export function saveBinds() { try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch (e) {} }
(function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  for (const [id, , , a, b] of ACTIONS) binds[id] = Array.isArray(saved[id]) ? saved[id].slice(0, 2) : [a, b];
})();
export function setBind(action, idx, code) {
  if (code) for (const id in binds) binds[id] = binds[id].map(c => (c === code ? '' : c));   // Doppelte entfernen
  binds[action][idx] = code || '';
  saveBinds();
}

// Controller und Touch melden Aktionen direkt
export const virtDown = new Set(), virtHit = new Set();
export const analog = { mx: 0, my: 0, lookX: 0, lookY: 0, pad: false };
export const touchStick = { x: 0, y: 0 };
export const down = action => virtDown.has(action) || (binds[action] || []).some(c => c && keys[c]);
export const hit = action => virtHit.has(action) || (binds[action] || []).some(c => c && pressed.has(c));

// ---------- Controller (Gamepad-API, Xbox/PlayStation-Belegung wie Fortnite) ----------
// A Springen · B Ducken/Rutschen · X Nachladen/Benutzen · Y Spitzhacke · LT Zielen · RT Schießen
// LB/RB Slot wechseln · L3 Sprinten · Steuerkreuz hoch Pingen / runter Tanzen · View Karte · Menü Pause
const PAD = { 0: 'jump', 1: 'crouch', 2: 'padUse', 3: 'pickaxe', 4: 'prevSlot', 5: 'nextSlot', 6: 'aim', 7: 'fire',
  8: 'map', 9: 'pause', 10: 'sprint', 11: 'crouch', 12: 'ping', 13: 'emote', 14: 'prevSlot', 15: 'nextSlot' };
const padPrev = new Set(); let padSprint = false;
export let padConnected = false;
const dz = v => Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84;
export function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  padConnected = !!gp;
  const now = new Set();
  if (gp) {
    gp.buttons.forEach((b, i) => { if (PAD[i] && (b.pressed || b.value > 0.4)) now.add(PAD[i]); });
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    analog.mx = lx; analog.my = -ly; analog.pad = Math.hypot(lx, ly) > 0;
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    analog.lookX = rx * Math.abs(rx); analog.lookY = ry * Math.abs(ry);
    if (now.has('sprint') && !padPrev.has('sprint')) padSprint = !padSprint;   // L3 schaltet Sprint, bis der Stick losgelassen wird
    if (!analog.pad) padSprint = false;
  } else { analog.mx = analog.my = analog.lookX = analog.lookY = 0; analog.pad = false; padSprint = false; }
  for (const a of padPrev) if (!now.has(a)) virtDown.delete(a);
  for (const a of now) { if (!padPrev.has(a)) virtHit.add(a); virtDown.add(a); }
  if (padSprint) virtDown.add('sprint');
  padPrev.clear(); for (const a of now) padPrev.add(a);
}

// ---------- Tastennamen ----------
const NAMES = { Space: 'Leertaste', ShiftLeft: 'Shift', ShiftRight: 'Shift rechts', ControlLeft: 'Strg', ControlRight: 'Strg rechts', AltLeft: 'Alt',
  Tab: 'Tab', CapsLock: 'Feststell', Enter: 'Enter', Backspace: 'Rücktaste', Equal: '=', Minus: 'ß', Backquote: '^', Comma: ',', Period: '.',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mouse0: 'Linke Maustaste', Mouse1: 'Mittlere Maustaste', Mouse2: 'Rechte Maustaste',
  Mouse3: 'Maustaste 4', Mouse4: 'Maustaste 5', WheelUp: 'Mausrad hoch', WheelDown: 'Mausrad runter', IntlBackslash: '<' };
export function keyName(code) {
  if (!code) return '–';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export const bindLabel = action => keyName(binds[action][0] || binds[action][1]);

// ---------- Neue Taste abfangen (Menü) ----------
let capture = null;
export function captureNext(cb) { capture = cb; }
function captured(code) { const cb = capture; capture = null; cb(code); }

export function initInput(canvas, onLockChange) {
  addEventListener('keydown', e => {
    if (capture) { e.preventDefault(); captured(e.code === 'Escape' ? null : e.code); return; }
    // Mit Tastatursperre kommt Esc im Spiel an -> selbst Maus freigeben (Pause-Menü)
    if (e.code === 'Escape' && locked) { document.exitPointerLock(); return; }
    if (locked && (e.ctrlKey || e.metaKey)) e.preventDefault();
    if (locked && (e.code === 'Tab' || e.code === 'Space' || e.ctrlKey || /^F\d+$/.test(e.code) || e.code === 'AltLeft')) e.preventDefault();
    if (!keys[e.code]) pressed.add(e.code);
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  addEventListener('mousedown', e => {
    if (capture) { e.preventDefault(); captured('Mouse' + e.button); return; }
    if (!locked || e.target !== canvas) return;
    if (e.button === 1) e.preventDefault();
    const c = 'Mouse' + e.button;
    if (!keys[c]) pressed.add(c);
    keys[c] = true;
  }, true);
  addEventListener('mouseup', e => { keys['Mouse' + e.button] = false; });
  addEventListener('auxclick', e => e.preventDefault());
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!locked) return;
    mouse.dx += e.movementX; mouse.dy += e.movementY;
  });
  addEventListener('wheel', e => {
    if (capture) { captured(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); return; }
    if (!locked) return;
    pressed.add(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
    mouse.wheel += Math.sign(e.deltaY);
  }, { passive: true });

  // Klick ins Spiel holt die Maus zurück, falls das Einfangen mal nicht geklappt hat
  canvas.addEventListener('click', () => { if (!locked && !touchMode && canvas.dataset.play === '1') lockPointer(canvas); });
  document.addEventListener('pointerlockerror', () => { if (!touchMode) onLockChange(false); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) for (const k in keys) if (k.startsWith('Mouse')) keys[k] = false;
    onLockChange(locked);
  });
}

// Strg+W & Co.: Im Vollbild sperrt die Keyboard-Lock-API die Browser-Kürzel,
// sodass Strg+W (Ducken + Vorwärts) den Tab nicht mehr schließt.
export let fullscreenWanted = true;
export function setFullscreenWanted(v) { fullscreenWanted = v; }
export let touchMode = false;
export function setTouchMode(v) { touchMode = v; }
export function lockPointer(canvas) {
  if (touchMode) {           // Touch: nur Vollbild, keine Maus fangen
    if (fullscreenWanted && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    return;
  }
  // Erst Vollbild, dann die Maus fangen – sonst bricht der Vollbildwechsel das Einfangen ab
  if (fullscreenWanted && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => { lockKeys(); grab(canvas); })
      .catch(() => grab(canvas));
  } else { lockKeys(); grab(canvas); }
}
function grab(canvas) {
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
function lockKeys() {
  if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {});
}
// Sicherheitsnetz ohne Vollbild: Browser fragt vor dem Schließen nach
export let guardUnload = false;
export function setUnloadGuard(v) { guardUnload = v; }
addEventListener('beforeunload', e => { if (guardUnload) { e.preventDefault(); e.returnValue = ''; } });

export function endFrame() {
  mouse.dx = mouse.dy = 0; mouse.wheel = 0;
  pressed.clear(); virtHit.clear();
}
