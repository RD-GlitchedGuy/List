/* Sky Dash — Spielsteuerung, Menüs, Speicherstand (Sky Games) */
(function () {
  'use strict';
  const P = SDPhys, R = SDRender, A = SDAudio, T = P.T, NET = window.SDOnline || { players: {}, update() {}, step() {}, count: () => 0, connected: () => false, last: {}, status: 'error', error: 'Online-Datei fehlt – bitte js/online.js hochladen.', joinPublic() {}, create() {}, join() {}, leave() {} };
  const $ = id => document.getElementById(id);
  const cv = $('game');
  R.init(cv);

  // ---------- Speicherstand ----------
  const SAVE_KEY = 'skydash_save_v1';
  const COLORS = ['#00eaff', '#5cff5c', '#ffe14f', '#ff9d00', '#ff4040', '#ff4fd8', '#a45cff', '#3d6bff',
                  '#ffffff', '#8a8a8a', '#1e1e1e', '#7affd6', '#ffb3e6', '#b6ff3b'];
  let save = {
    levels: {}, icon: { id: 0, c1: '#b6ff3b', c2: '#00eaff' },
    settings: { music: 70, sfx: 80, pct: true, glow: true }
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const s = JSON.parse(raw); save = Object.assign(save, s); save.settings = Object.assign({ music: 70, sfx: 80, pct: true, glow: true }, s.settings); }
  } catch (e) { /* kein Speicher verfügbar */ }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* egal */ } }
  window.addEventListener('pagehide', store);

  function statsHtml() {
    let stars = 0, maxStars = 0, coins = 0, maxCoins = 0, done = 0, att = 0;
    for (const lv of window.LEVELS) {
      const sv = save.levels[lv.id] || { best: 0, coins: [], attempts: 0 };
      maxStars += lv.stars; maxCoins += lv.objs.filter(o => o[0] === T.COIN).length;
      if (sv.best >= 100) { stars += lv.stars; done++; }
      coins += sv.coins.length; att += sv.attempts || 0;
    }
    return `<span>★ ${stars}/${maxStars}</span><span>● ${coins}/${maxCoins}</span><span>✔ ${done}/${window.LEVELS.length}</span><span>Versuche ${att}</span>`;
  }
  $('btnExport').onclick = () => {
    store();
    const code = 'SKYDASH1:' + btoa(unescape(encodeURIComponent(JSON.stringify(save))));
    try { navigator.clipboard.writeText(code); } catch (e) { /* egal */ }
    prompt('Dein Spielstand-Code (wurde kopiert). Heb ihn gut auf:', code);
  };
  $('btnImport').onclick = () => {
    const code = (prompt('Spielstand-Code einfügen:') || '').trim();
    if (!code) return;
    try {
      if (!code.startsWith('SKYDASH1:')) throw 0;
      const d = JSON.parse(decodeURIComponent(escape(atob(code.slice(9)))));
      if (!d || typeof d.levels !== 'object') throw 0;
      save.levels = d.levels; if (d.icon) save.icon = d.icon; if (d.settings) save.settings = Object.assign(save.settings, d.settings);
      store(); loadSettings(); A.sfx('coin'); alert('Spielstand geladen!');
    } catch (e) { alert('Der Code ist ungültig.'); }
  };
  function lvSave(id) { return save.levels[id] || (save.levels[id] = { best: 0, practice: 0, coins: [], attempts: 0, jumps: 0 }); }

  A.musicVol = save.settings.music / 100; A.sfxVol = save.settings.sfx / 100;
  R.glow = save.settings.glow;

  // ---------- Zustand ----------
  let mode = 'intro';          // intro | menu | play | pause | complete
  let menuScreen = 'menu';
  let introT = 0, now = 0, last = performance.now();
  let lvIdx = Math.min(+save.last || 0, window.LEVELS.length - 1), L = null, s = null, practice = false;
  let attempt = 1, jumps = 0, playTime = 0, acc = 0, deadT = 0, doneT = 0;
  let hold = false, rot = 0, trail = [], checkpoints = [];
  let col = null, colTarget = null, ceil = 0, flash = 0;
  let camX = 0, menuCam = 0, menuCube = { y: 0, vy: 0, rot: 0, next: 1 };
  let levelSongOn = false;
  let menuCol = null;

  // ---------- Sky-Games-Logo-Intro ----------
  const introEl = $('intro'), plane = $('introPlane'), sun = $('introSun'), loader = $('loader');
  (function () {
    const ns = 'http://www.w3.org/2000/svg', rays = $('introRays');
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, main = k % 2 === 0, r1 = main ? 54 : 56, r2 = main ? 76 : 68;
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', (Math.cos(a) * r1).toFixed(1)); l.setAttribute('y1', (Math.sin(a) * r1).toFixed(1));
      l.setAttribute('x2', (Math.cos(a) * r2).toFixed(1)); l.setAttribute('y2', (Math.sin(a) * r2).toFixed(1));
      rays.appendChild(l);
    }
  })();
  const I_FLY = 1.8, I_PAUSE = 0.5, I_GROW = 2.6, I_LOAD = 1.2;
  let fontsReady = false;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fontsReady = true; }); else fontsReady = true;
  setTimeout(() => { fontsReady = true; }, 4000);
  function introFrame(t) {
    const easeOut = x => 1 - Math.pow(1 - x, 3), easeIn = x => x * x * x;
    const p = easeOut(Math.min(t / I_FLY, 1));
    plane.setAttribute('transform', `translate(${(800 - 352 * p).toFixed(1)},${(700 - 330 * p).toFixed(1)}) rotate(-45) scale(0.95)`);
    const g = Math.max(0, Math.min((t - I_FLY - I_PAUSE) / I_GROW, 1));
    sun.setAttribute('transform', `translate(264,184) scale(${(1 + 23 * easeIn(g)).toFixed(3)})`);
    const total = I_FLY + I_PAUSE + I_GROW;
    loader.classList.toggle('on', t > total);
    if (t > total + I_LOAD && fontsReady) endIntro();
  }
  introEl.addEventListener('pointerdown', () => { A.init(); endIntro(); });
  function endIntro() {
    if (mode !== 'intro') return;
    introEl.classList.add('out');
    setTimeout(() => introEl.classList.add('hidden'), 500);
    toMenu('menu');
  }

  function colorsAt(lv, x) {
    let c = lv.colors[0];
    for (const k of lv.colors) if (k[0] <= x) c = k;
    return { bg: R.hex(c[1]), ground: R.hex(c[2]), accent: R.hex(c[3]) };
  }

  // ---------- Bildschirme ----------
  const screens = ['menu', 'levels', 'icons', 'settings', 'credits', 'online', 'pause', 'complete'];
  function show(name) {
    for (const n of screens) $('scr-' + n).classList.toggle('hidden', n !== name);
    $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'pause'));
    if (['menu', 'levels', 'icons', 'settings', 'credits', 'online'].includes(name)) menuScreen = name;
    if (name === 'online') renderOnline();
    if (name === 'levels') renderCard(0);
    if (name === 'icons') buildIconKit();
    if (name === 'settings') loadSettings();
    if (name === 'menu') { drawMenuIcon(); $('stats').innerHTML = statsHtml(); }
  }
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { A.sfx('click'); show(b.dataset.go); }));

  function toMenu(screen) {
    mode = 'menu';
    A.start(0, 120, true);
    levelSongOn = false;
    show(screen || 'menu');
  }

  // ---------- Levelauswahl ----------
  const DIFF = {
    easy: ['Leicht', '#4fc8ff', 'smile'], normal: ['Normal', '#5cff5c', 'smile'],
    hard: ['Schwer', '#ffcc33', 'flat'], harder: ['Schwerer', '#ff6b3d', 'frown'], insane: ['Wahnsinn', '#ff4fd8', 'angry']
  };
  function faceSVG(d) {
    const [, c, m] = DIFF[d] || DIFF.easy;
    const mouth = { smile: 'M30 62 Q50 78 70 62', flat: 'M32 66 L68 66', frown: 'M32 72 Q50 58 68 72', angry: 'M30 72 Q50 56 70 72' }[m];
    const brows = m === 'angry' || m === 'frown' ? '<path d="M26 34 L44 42 M74 34 L56 42" stroke="#05021a" stroke-width="6" stroke-linecap="round"/>' : '';
    return `<svg class="face" viewBox="0 0 100 100"><path d="M50 4 L92 22 L86 70 L50 96 L14 70 L8 22 Z" fill="${c}" stroke="#05021a" stroke-width="6" stroke-linejoin="round"/>
      <path d="M50 12 L84 27 L80 44 L20 44 L16 27 Z" fill="#fff" opacity=".25"/>
      <rect x="30" y="40" width="12" height="16" rx="3" fill="#05021a"/><rect x="58" y="40" width="12" height="16" rx="3" fill="#05021a"/>
      ${brows}<path d="${mouth}" fill="none" stroke="#05021a" stroke-width="6" stroke-linecap="round"/></svg>`;
  }

  function renderCard(dir) {
    const lv = window.LEVELS[lvIdx], sv = lvSave(lv.id), c = lv.colors[0];
    const card = $('lvCard');
    card.style.setProperty('--card', c[1]);
    card.style.setProperty('--cardglow', c[3] + '88');
    card.style.setProperty('--from', (dir || 0) * 60 + 'px');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    const coins = lv.objs.filter(o => o[0] === T.COIN).length;
    let coinHtml = '';
    for (let i = 0; i < coins; i++) coinHtml += `<i class="coin ${i < sv.coins.length ? 'got' : ''}"></i>`;
    card.innerHTML = `
      <div class="card-top">${faceSVG(lv.diff)}
        <div><h2>${lv.name}</h2>
        <div class="meta"><span>${(DIFF[lv.diff] || DIFF.easy)[0]}</span><span class="stars">★ ${lv.stars}</span>
        <span class="coins">${coinHtml}</span>${sv.best >= 100 ? '<span>✔</span>' : ''}</div></div></div>
      <div class="pbar"><div class="lbl">Normalmodus</div><div class="track"><div class="fill" style="width:${sv.best}%"></div><span>${sv.best}%</span></div></div>
      <div class="pbar prac"><div class="lbl">Übungsmodus</div><div class="track"><div class="fill" style="width:${sv.practice}%"></div><span>${sv.practice}%</span></div></div>`;
    $('lvDots').innerHTML = window.LEVELS.map((_, i) => `<i class="${i === lvIdx ? 'on' : ''}"></i>`).join('');
  }
  function lvStep(d) { A.sfx('click'); lvIdx = (lvIdx + d + window.LEVELS.length) % window.LEVELS.length; renderCard(d); }
  $('lvPrev').onclick = () => lvStep(-1);
  $('lvNext').onclick = () => lvStep(1);
  $('lvCard').onclick = () => startLevel(lvIdx, false);
  let swipeX = null;
  $('scr-levels').addEventListener('pointerdown', e => { swipeX = e.clientX; });
  $('scr-levels').addEventListener('pointerup', e => {
    if (swipeX !== null && Math.abs(e.clientX - swipeX) > 60) lvStep(e.clientX < swipeX ? 1 : -1);
    swipeX = null;
  });

  // ---------- Icon-Garage ----------
  function drawMenuIcon() {
    const c = $('menuIcon').getContext('2d');
    c.clearRect(0, 0, 96, 96);
    R.icon(c, 48, 48, 72, 0, save.icon.id, save.icon.c1, save.icon.c2);
  }
  function buildIconKit() {
    const grid = $('iconGrid'); grid.innerHTML = '';
    R.ICONS.forEach((name, i) => {
      const b = document.createElement('button'); b.title = name;
      b.className = i === save.icon.id ? 'sel' : '';
      const c = document.createElement('canvas'); c.width = c.height = 104; b.appendChild(c);
      R.icon(c.getContext('2d'), 52, 52, 80, 0, i, save.icon.c1, save.icon.c2);
      b.onclick = () => { save.icon.id = i; store(); A.sfx('click'); buildIconKit(); };
      grid.appendChild(b);
    });
    ['c1', 'c2'].forEach((k, n) => {
      const box = $(n ? 'col2' : 'col1'); box.innerHTML = '';
      COLORS.forEach(c => {
        const b = document.createElement('button');
        b.style.background = c; b.className = save.icon[k] === c ? 'sel' : '';
        b.setAttribute('aria-label', 'Farbe ' + c);
        b.onclick = () => { save.icon[k] = c; store(); A.sfx('click'); buildIconKit(); };
        box.appendChild(b);
      });
    });
  }
  function drawIconPreview() {
    const c = $('iconPreview').getContext('2d');
    c.clearRect(0, 0, 320, 140);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 118, 320, 3);
    const jump = Math.abs(Math.sin(now * 2.2));
    R.icon(c, 100, 92 - jump * 40, 52, now * 4.4 % (Math.PI * 2), save.icon.id, save.icon.c1, save.icon.c2);
    c.save(); c.translate(230, 70 + Math.sin(now * 3) * 10);
    shipOn(c, 0, 0, 60, Math.sin(now * 3) * 0.2, false);
    c.restore();
  }
  function shipOn(c, x, y, s, r, flip) {
    c.save(); c.translate(x, y); c.rotate(r); c.scale(1, flip ? -1 : 1);
    R.icon(c, -s * 0.05, -s * 0.12, s * 0.5, 0, save.icon.id, save.icon.c1, save.icon.c2);
    c.fillStyle = save.icon.c1; c.strokeStyle = '#000'; c.lineWidth = s * 0.07; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-s * 0.58, s * 0.02); c.lineTo(s * 0.2, s * 0.02); c.lineTo(s * 0.62, s * 0.2);
    c.lineTo(s * 0.2, s * 0.42); c.lineTo(-s * 0.58, s * 0.38); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = save.icon.c2; c.beginPath(); c.moveTo(-s * 0.45, s * 0.14); c.lineTo(s * 0.25, s * 0.14);
    c.lineTo(s * 0.42, s * 0.21); c.lineTo(s * 0.25, s * 0.28); c.lineTo(-s * 0.45, s * 0.28); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  // ---------- Einstellungen ----------
  function loadSettings() {
    $('setMusic').value = save.settings.music; $('setSfx').value = save.settings.sfx;
    $('setPct').checked = save.settings.pct; $('setGlow').checked = save.settings.glow;
  }
  $('setMusic').oninput = e => { save.settings.music = +e.target.value; A.setVolumes(save.settings.music / 100, save.settings.sfx / 100); store(); };
  $('setSfx').oninput = e => { save.settings.sfx = +e.target.value; A.setVolumes(save.settings.music / 100, save.settings.sfx / 100); store(); };
  $('setSfx').onchange = () => A.sfx('coin');
  $('setPct').onchange = e => { save.settings.pct = e.target.checked; store(); };
  $('setGlow').onchange = e => { save.settings.glow = R.glow = e.target.checked; store(); };
  $('btnReset').onclick = () => {
    if (confirm('Wirklich den ganzen Fortschritt löschen?')) { save.levels = {}; store(); A.sfx('click'); }
  };

  // ---------- Menü-Knöpfe ----------
  $('btnPlay').onclick = () => { A.sfx('click'); show('levels'); };
  $('btnIcons').onclick = () => { A.sfx('click'); show('icons'); };
  $('btnSettings').onclick = () => { A.sfx('click'); show('settings'); };
  $('btnCredits').onclick = () => { A.sfx('click'); show('credits'); };

  // ---------- Online ----------
  NET.name = save.name || ('Spieler' + Math.floor(Math.random() * 900 + 100));
  NET.icon = save.icon;
  $('onName').value = NET.name;
  $('onName').oninput = e => { NET.name = save.name = e.target.value.trim().slice(0, 16) || 'Spieler'; store(); };
  $('onName').addEventListener('keydown', e => e.stopPropagation());
  $('onCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('onJoin').click(); });
  $('btnOnline').onclick = () => { A.sfx('click'); show('online'); };
  $('onPublic').onclick = () => { A.sfx('click'); NET.joinPublic(); };
  $('onCreate').onclick = () => { A.sfx('click'); NET.create(null, false); };
  $('onJoin').onclick = () => { A.sfx('click'); NET.join($('onCode').value, false); };
  $('onLeave').onclick = () => { A.sfx('click'); NET.leave(); };
  const levelName = id => { const l = window.LEVELS.find(v => v.id === id); return l ? l.name : 'im Menü'; };
  function renderOnline() {
    const on = NET.connected();
    $('onLobby').classList.toggle('hidden', on || NET.status === 'connecting');
    $('onRoom').classList.toggle('hidden', !on);
    $('onRoomCode').textContent = NET.isPublic ? 'Öffentlich' : (NET.room || '');
    $('onStatus').textContent = NET.status === 'connecting' ? 'Verbinde …' : NET.status === 'error' ? NET.error
      : on ? (NET.isPublic ? 'Alle im öffentlichen Raum spielen zusammen.' : 'Schick den Code an deine Freunde!') : 'Spiel mit anderen zusammen.';
    if (on) {
      const rows = [{ name: NET.name + ' (du)', lv: NET.last.lv, p: NET.last.p }].concat(Object.values(NET.players));
      $('onList').innerHTML = rows.map(p => `<div><span>${String(p.name || '?').replace(/[<>&]/g, '')}</span><span>${p.lv ? levelName(p.lv) + ' · ' + (p.p || 0) + '%' : 'im Menü'}</span></div>`).join('');
    }
    const n = NET.count();
    $('onHud').classList.toggle('hidden', !n);
    $('onHud').textContent = '🌐 ' + n + ' Spieler';
  }
  NET.onChange = renderOnline;
  setInterval(() => { if (mode !== 'play') NET.update({ lv: null, p: 0 }); renderOnline(); }, 1000);
  $('btnFull').onclick = () => {
    A.sfx('click');
    const d = document;
    if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => {})).call(d.documentElement);
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  };

  // ---------- Spielablauf ----------
  function startLevel(i, prac) {
    A.init();
    lvIdx = i; save.last = i; L = P.prepare(window.LEVELS[i]);
    practice = !!prac; attempt = 1; jumps = 0; playTime = 0; checkpoints = [];
    mode = 'play';
    show(null);
    $('hud').classList.remove('hidden');
    updatePracticeUI();
    lvSave(L.id);
    resetAttempt(true);
  }

  function resetAttempt(first) {
    const cp = practice && checkpoints.length ? checkpoints[checkpoints.length - 1] : null;
    s = cp ? P.clone(cp.s) : P.newState();
    rot = cp ? cp.rot : 0;
    col = colorsAt(L, s.x); colTarget = col;
    trail = []; acc = 0; deadT = 0; doneT = 0; flash = 0;
    R.particles = []; R.rings = [];
    ceil = (s.mode >= 1 || s.g === -1) ? 1 : 0;
    camX = s.x - R.camOff;
    if (!practice || !levelSongOn || first) { A.start(L.song, L.bpm, false); levelSongOn = true; }
    if (!first) { attempt++; lvSave(L.id).attempts++; store(); }
  }

  function updatePracticeUI() {
    $('practiceBtns').classList.toggle('hidden', !practice);
    $('pPractice').classList.toggle('on', practice);
    $('barFill').style.background = practice ? 'linear-gradient(#9ff6ff,#00a8ff)' : '';
  }

  function addCheckpoint() {
    if (!practice || !s || s.dead || s.done) return;
    checkpoints.push({ s: P.clone(s), rot });
    A.sfx('checkpoint');
    R.burst(s.x + 0.5, s.y + 0.5, 12, [[92, 255, 122], [255, 255, 255]], 4, 0.12, 0.5);
  }
  function delCheckpoint() { if (practice && checkpoints.length) { checkpoints.pop(); A.sfx('click'); } }
  $('cpAdd').addEventListener('pointerdown', e => { e.stopPropagation(); addCheckpoint(); });
  $('cpDel').addEventListener('pointerdown', e => { e.stopPropagation(); delCheckpoint(); });

  function pct() { return Math.max(0, Math.min(100, Math.floor(s.x / L.length * 100))); }

  function pause() {
    if (mode !== 'play' || (s && s.done)) return;
    mode = 'pause'; hold = false;
    A.stop(); levelSongOn = false;
    const sv = lvSave(L.id);
    $('pauseTitle').innerHTML = `<span class="gtext" data-t="${L.name}">${L.name}</span>`;
    $('pauseStats').innerHTML = `Versuch <b>${attempt}</b> · Bestwert <b>${sv.best}%</b> · Übung <b>${sv.practice}%</b>`;
    show('pause');
  }
  function resume() {
    mode = 'play'; show(null); $('hud').classList.remove('hidden');
    last = performance.now();
    if (!s.dead) { A.start(L.song, L.bpm, false); levelSongOn = true; }
  }
  $('btnPause').addEventListener('pointerdown', e => { e.stopPropagation(); pause(); });
  $('pResume').onclick = () => { A.sfx('click'); resume(); };
  $('pRestart').onclick = () => { A.sfx('click'); checkpoints = []; mode = 'play'; show(null); $('hud').classList.remove('hidden'); resetAttempt(false); A.start(L.song, L.bpm, false); levelSongOn = true; };
  $('pPractice').onclick = () => {
    A.sfx('click'); practice = !practice; checkpoints = []; updatePracticeUI();
    mode = 'play'; show(null); $('hud').classList.remove('hidden'); resetAttempt(false);
  };
  $('pMenu').onclick = () => { A.sfx('click'); toMenu('levels'); };
  $('cRestart').onclick = () => { A.sfx('click'); startLevel(lvIdx, practice); };
  $('cMenu').onclick = () => { A.sfx('click'); toMenu('levels'); };

  function onDeath(o) {
    A.sfx('die');
    if (!practice) { A.stop(); levelSongOn = false; }
    const ic = save.icon;
    R.burst(s.x + 0.5, s.y + 0.5, 46, [R.hex(ic.c1), R.hex(ic.c2), [255, 255, 255]], 12, 0.2, 0.9, 8);
    R.ring(s.x + 0.5, s.y + 0.5, [255, 255, 255], 3.2, 0.5);
    R.ring(s.x + 0.5, s.y + 0.5, R.hex(ic.c1), 2, 0.35);
    R.shake = 0.3;
    const sv = lvSave(L.id), p = pct();
    if (!practice && p > sv.best) { sv.best = p; flash = 1; }
    store();
    void o;
  }

  function onComplete() {
    A.stop(); levelSongOn = false;
    A.sfx('complete');
    const sv = lvSave(L.id);
    let newCoins = 0;
    if (practice) sv.practice = 100;
    else {
      sv.best = 100;
      for (const id of s.coins) if (sv.coins.indexOf(id) < 0) { sv.coins.push(id); newCoins++; }
    }
    sv.jumps += jumps;
    store();
    for (let k = 0; k < 5; k++) setTimeout(() => {
      if (mode !== 'play') return;
      R.burst(camX + R.W / R.U * (0.2 + Math.random() * 0.6), 4 + Math.random() * 5, 40,
        [[255, 225, 79], [92, 255, 122], [79, 200, 255], [255, 90, 214]], 9, 0.18, 1.3, 6);
    }, k * 220);
    setTimeout(() => {
      if (mode !== 'play') return;
      mode = 'complete';
      { const tt = practice ? 'ÜBUNG GESCHAFFT!' : 'LEVEL GESCHAFFT!'; $('cTitle').innerHTML = `<span class="gtext" data-t="${tt}">${tt}</span>`; }
      const total = L.coinObjs.length;
      $('cStats').innerHTML = `Versuche <b>${attempt}</b> · Sprünge <b>${jumps}</b> · Zeit <b>${playTime.toFixed(1)} s</b>` +
        (!practice ? `<br>★ <b>${L.stars}</b> Sterne verdient${newCoins ? ` · <b>${newCoins}</b> neue Münze${newCoins > 1 ? 'n' : ''}` : ''}` : '');
      let ch = '';
      if (!practice) for (let i = 0; i < total; i++) ch += `<i class="coin ${i < s.coins.length ? 'got' : ''}"></i>`;
      $('cCoins').innerHTML = ch;
      show('complete');
    }, 1900);
  }

  function handleEvents() {
    for (const e of s.ev) {
      const o = e[1];
      switch (e[0]) {
        case 'jump': jumps++; break;
        case 'orb': {
          const c = o.t === T.BORB ? [79, 200, 255] : [255, 225, 79];
          R.ring(o.x + 0.5, o.y + 0.5, c, 1.6, 0.35); R.burst(o.x + 0.5, o.y + 0.5, 10, [c, [255, 255, 255]], 5, 0.12, 0.4);
          jumps++; break;
        }
        case 'pad': R.burst(o.x + 0.5, o.y + 0.2, 14, [[255, 225, 79]], 6, 0.12, 0.5, 10); break;
        case 'portal': {
          const c = { [T.SHIP]: [255, 90, 214], [T.CUBE]: [92, 255, 122], [T.GUP]: [255, 225, 79], [T.GDOWN]: [79, 200, 255], [T.WAVE]: [79, 255, 224] }[o.t];
          R.ring(o.x + 0.5, o.y + 1.5, c, 2.6, 0.45); R.burst(o.x + 0.5, o.y + 1.5, 18, [c], 7, 0.14, 0.6); break;
        }
        case 'coin':
          A.sfx('coin'); R.burst(o.x + 0.5, o.y + 0.5, 20, [[255, 210, 63], [255, 255, 255]], 7, 0.14, 0.7, 4);
          R.ring(o.x + 0.5, o.y + 0.5, [255, 210, 63], 1.8, 0.4); break;
        case 'die': onDeath(o); break;
        case 'done': onComplete(); break;
      }
    }
    s.ev.length = 0;
  }

  // ---------- Eingabe ----------
  function press() {
    A.init();
    if (mode === 'intro') { endIntro(); return; }
    if (mode === 'play') hold = true;
  }
  function release() { hold = false; }
  window.addEventListener('keydown', e => {
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) { e.preventDefault(); return; }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (mode === 'complete') return;
      press();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      if (mode === 'play') pause(); else if (mode === 'pause') resume();
      else if (mode === 'menu' && menuScreen !== 'menu') show('menu');
    } else if (e.code === 'KeyR' && mode === 'play') {
      checkpoints = []; resetAttempt(false); A.start(L.song, L.bpm, false); levelSongOn = true;
    } else if (e.code === 'KeyZ') addCheckpoint();
    else if (e.code === 'KeyX') delCheckpoint();
    else if (mode === 'intro') press();
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') release(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { release(); if (mode === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });
  // Erster Klick irgendwo startet den Ton (Browser-Regel)
  window.addEventListener('pointerdown', () => {
    if (!A.ctx) { A.init(); if (mode === 'menu') A.start(0, 120, true); }
  }, { capture: true });
  window.addEventListener('resize', () => { R.resize(); });

  // ---------- Hauptschleife ----------
  function lerpCol(a, b, k) { return { bg: R.mix(a.bg, b.bg, k), ground: R.mix(a.ground, b.ground, k), accent: R.mix(a.accent, b.accent, k) }; }

  function updatePlay(dt) {
    if (!s.dead && !s.done) {
      acc += dt; playTime += dt;
      while (acc >= P.C.DT) {
        P.step(L, s, hold, P.C.DT); acc -= P.C.DT;
        if (s.ev.length) handleEvents();
        if (s.dead || s.done) break;
      }
    } else if (s.dead) {
      deadT += dt;
      if (deadT > 0.95) resetAttempt(false);
    } else if (s.done) {
      doneT += dt;
      s.x += L.speed * dt; // fliegt ins Ziel
    }
    if (s.ev.length) handleEvents();

    // Drehung
    if (s.mode === 0) {
      if (s.grounded) {
        const target = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
        rot += (target - rot) * Math.min(1, dt * 22);
      } else rot += 7.48 * s.g * dt;
    } else if (s.mode === 2) {
      rot = -Math.atan2(s.vy, L.speed);
    } else {
      const want = -Math.atan2(s.vy, L.speed) * 0.9;
      rot += (want - rot) * Math.min(1, dt * 14);
    }

    // Farben
    const ct = colorsAt(L, s.x);
    colTarget = ct; col = lerpCol(col, colTarget, Math.min(1, dt * 2.2));
    ceil += (((s.mode >= 1 || s.g === -1) ? 1 : 0) - ceil) * Math.min(1, dt * 4);

    // Kamera
    const endCam = L.length + 2.5 - R.W / R.U;
    const want = Math.min(s.x - R.camOff, endCam);
    camX = want;
    NET.update({ lv: L.id, x: +s.x.toFixed(2), y: +s.y.toFixed(2), rot: +rot.toFixed(2), mode: s.mode, g: s.g, dead: s.dead, done: s.done, p: pct(), at: attempt });

    if (!s.dead && !s.done) {
      trail.push([s.x + 0.5, s.y + 0.5]);
      if (trail.length > (s.mode === 2 ? 70 : s.mode ? 22 : 12)) trail.shift();
      // Funken am Boden
      if (s.mode === 0 && s.grounded && Math.random() < 0.5) {
        R.particles.push({ x: s.x + 0.1, y: s.g === 1 ? s.y + 0.05 : s.y + 0.95, vx: -2 - Math.random() * 3, vy: (Math.random() * 2) * s.g, life: 0.3, max: 0.3, size: 0.1, c: R.hex(save.icon.c2), g: 0 });
      }
      if (s.mode === 1 && Math.random() < 0.8) {
        R.particles.push({ x: s.x + 0.05, y: s.y + 0.45, vx: -4 - Math.random() * 3, vy: (Math.random() - 0.5) * 2, life: 0.35, max: 0.35, size: 0.14, c: [255, 160, 50], g: 0 });
      }
    } else if (trail.length) trail.shift();

    if (flash > 0) flash = Math.max(0, flash - dt);

    // HUD
    const p = pct();
    $('barFill').style.width = p + '%';
    $('pct').textContent = save.settings.pct ? p + '%' : '';
  }

  function drawPlay(pulse) {
    const ctx = R.ctx;
    ctx.save();
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * R.U * 0.5 * R.shake / 0.3, (Math.random() - 0.5) * R.U * 0.5 * R.shake / 0.3);
    R.background(col, camX, pulse, now);
    // Versuch-Anzeige in der Welt
    const ax = R.sx(7, camX);
    if (ax > -R.W) R.text((practice ? 'Übung · ' : '') + 'Versuch ' + attempt, ax, R.sy(5.2), R.U * 0.85, '#fff', 'center', 0.95);
    R.objects(L, s, col, pulse, now, camX);
    R.endGate(L, col, now, camX);
    R.ground(col, camX, pulse, ceil);
    // Checkpoints
    for (const cp of checkpoints) {
      const x = R.sx(cp.s.x + 0.5, camX), y = R.sy(cp.s.y + 0.5);
      if (x < -50 || x > R.W + 50) continue;
      ctx.fillStyle = 'rgba(92,255,122,0.85)'; ctx.beginPath();
      ctx.moveTo(x, y - R.U * 0.4); ctx.lineTo(x + R.U * 0.28, y); ctx.lineTo(x, y + R.U * 0.4); ctx.lineTo(x - R.U * 0.28, y); ctx.fill();
    }
    // Online-Mitspieler als Geister
    for (const id in NET.players) {
      const p = NET.players[id];
      if (p.lv !== L.id || p.dead || p.dx === undefined) continue;
      const gx = R.sx(p.dx + 0.5, camX), gy = R.sy(p.dy + 0.5);
      if (gx < -R.U * 2 || gx > R.W + R.U * 2) continue;
      const gi = p.icon || { id: 0, c1: '#ffffff', c2: '#888888' };
      ctx.save(); ctx.globalAlpha = 0.5;
      if (p.mode === 2) R.wave(gx, gy, R.U * 0.95, p.rot || 0, gi.c1, gi.c2);
      else if (p.mode === 1) R.ship(gx, gy, R.U * 1.15, p.rot || 0, p.g === -1, gi.id, gi.c1, gi.c2, now);
      else R.icon(ctx, gx, gy, R.U, p.rot || 0, gi.id, gi.c1, gi.c2);
      ctx.restore();
      R.text(String(p.name || '?').slice(0, 16), gx, gy - R.U * 0.95, R.U * 0.36, '#fff', 'center', 0.85);
    }
    const ic = save.icon;
    if (s.mode === 2) R.waveTrail(trail, R.hex(ic.c1), R.hex(ic.c2), camX);
    else R.trail(trail, R.hex(ic.c2), s.mode ? 0.42 : 0.28, camX);
    if (!s.dead && !(s.done && doneT > 0.25)) {
      const cx = R.sx(s.x + 0.5, camX), cy = R.sy(s.y + 0.5);
      if (s.mode === 0) R.icon(ctx, cx, cy, R.U, rot, ic.id, ic.c1, ic.c2);
      else if (s.mode === 2) R.wave(cx, cy, R.U * 0.95, rot, ic.c1, ic.c2);
      else R.ship(cx, cy, R.U * 1.15, rot, s.g === -1, ic.id, ic.c1, ic.c2, now);
    }
    if (s.done && doneT > 0.2 && doneT < 0.3) {
      R.burst(s.x + 0.5, s.y + 0.5, 50, [[255, 255, 255], R.hex(ic.c1)], 14, 0.18, 1, 0);
      R.ring(s.x + 0.5, s.y + 0.5, [255, 255, 255], 6, 0.7);
    }
    R.drawFx(camX);
    ctx.restore();
    // neuer Bestwert
    if (flash > 0) R.text('Neuer Bestwert! ' + lvSave(L.id).best + '%', R.W / 2, R.H * 0.32, R.U * 0.7, 'gold', 'center', Math.min(1, flash * 2));
    if (s.done && doneT > 0.3) {
      const k = Math.min(1, (doneT - 0.3) / 0.35);
      R.text(practice ? 'ÜBUNG GESCHAFFT!' : 'LEVEL GESCHAFFT!', R.W / 2, R.H * 0.4, R.U * (0.4 + 0.85 * k), 'gold', 'center', k);
    }
  }

  function drawMenuBg(dt, pulse) {
    menuCam += dt * 7;
    // In der Levelauswahl nimmt der Hintergrund die Farbe des Levels an
    let want;
    if (menuScreen === 'levels') want = colorsAt(window.LEVELS[lvIdx], 0);
    else {
      const c1 = [[31, 98, 255], [196, 18, 143], [15, 158, 138], [255, 106, 0], [110, 40, 230]];
      const i = Math.floor(now / 10) % c1.length;
      want = { bg: c1[i], ground: R.mix(c1[i], [0, 0, 0], 0.25), accent: R.mix(c1[i], [255, 255, 255], 0.5) };
    }
    if (!menuCol) menuCol = want;
    const kk = Math.min(1, dt * 2.5);
    menuCol = { bg: R.mix(menuCol.bg, want.bg, kk), ground: R.mix(menuCol.ground, want.ground, kk), accent: R.mix(menuCol.accent, want.accent, kk) };
    const mc = menuCol;
    R.background(mc, menuCam, pulse, now);
    R.ground(mc, menuCam, pulse, 0);
    // Würfel hüpft am Boden entlang
    const m = menuCube;
    m.next -= dt;
    if (m.y <= 0 && m.next <= 0) { m.vy = 21; m.next = 0.6 + Math.random() * 1.2; }
    m.vy -= 100 * dt; m.y = Math.max(0, m.y + m.vy * dt);
    if (m.y > 0) m.rot += 7.48 * dt; else m.rot = Math.round(m.rot / (Math.PI / 2)) * (Math.PI / 2);
    const x = R.W * 0.2, y = R.sy(m.y + 0.5);
    R.icon(R.ctx, x, y, R.U, m.rot, save.icon.id, save.icon.c1, save.icon.c2);
  }

  const speedOf = id => { const l = window.LEVELS.find(v => v.id === id); return l ? l.speed : 0; };

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; now += dt;
    const pulse = A.pulse();
    const ctx = R.ctx;
    ctx.clearRect(0, 0, R.W, R.H);
    if (mode === 'intro') {
      introT += dt;
      introFrame(introT);
    } else if (mode === 'play') {
      updatePlay(dt); R.updateFx(dt); drawPlay(pulse);
      NET.step(dt, speedOf);
    } else if (mode === 'pause' || mode === 'complete') {
      if (mode === 'complete') { R.updateFx(dt); if (s.done) { doneT += dt; } }
      drawPlay(0);
    } else {
      R.updateFx(dt);
      drawMenuBg(dt, pulse);
      if (menuScreen === 'icons') drawIconPreview();
    }
    requestAnimationFrame(frame);
  }

  // Entwickler-Zugang (nur mit ?dev in der Adresse)
  if (/[?&]dev/.test(location.search)) window.__sky = { get s() { return s; }, startLevel, get mode() { return mode; }, setHold(h) { hold = h; } };

  drawMenuIcon();
  requestAnimationFrame(t => { last = t; frame(t); });
})();
