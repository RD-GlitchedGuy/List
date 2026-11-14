// Sky Royale – Einstieg, Lobby, Spielphasen und Hauptschleife
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { G, on, rand } from './state.js';
import { initInput, lockPointer, endFrame, bindLabel, setUnloadGuard, pollGamepad, virtHit, touchMode, locked } from './input.js';
import { initTouch, setTouch, showTouch, updateTouch } from './touch.js';
import { camState } from './player.js';
import { applySettings, openSettings } from './settings.js';
import { createSky, createWater, updateSky, HORIZON } from './sky.js';
import { elimEffect, sparkle, confetti } from './effects.js';
import { sfx } from './audio.js';
import { loadWorld, heightAt, isLand, updateObjects } from './world.js';
import { createActor, resetLoadout, aliveCount } from './actors.js';
import { createBots, updateBots, planBotDrops } from './bots.js';
import { setupPlayer, updatePlayer, updateCamera } from './player.js';
import { updateActorCombat, updateProjectiles, updateThrowables } from './combat.js';
import { updateSprings } from './movement.js';
import { animateCharacter } from './models.js';
import { spawnLoot, updateLoot, removeLoot } from './loot.js';
import { rollFloor } from './items.js';
import { startBus, updateBus } from './bus.js';
import { createStorm, startStorm, updateStorm } from './storm.js';
import { initCars, stepCar } from './cars.js';
import { updateEffects } from './effects.js';
import { initHud, updateHud, message } from './hud.js';
import { raycast } from './physics.js';
import { initAudio } from './audio.js';
import { NET, isClient, isHost, isMP, hostLobby, joinLobby, lobbyNames, createRemoteActors, sendStart, netUpdate, net } from './net.js';

const TOTAL = 25, WARMUP = 30;
const canvas = document.getElementById('game');
const $ = id => document.getElementById(id);

// ---------- Renderer & Szene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON.clone(), 230, 760);
renderer.toneMappingExposure = 1.08;
// weiche Umgebungsreflexe geben allen Modellen mehr Tiefe
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(G.baseFov, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(300, 60, 300);
Object.assign(G, { scene, camera, renderer });

scene.add(new THREE.HemisphereLight('#cfe6ff', '#6a5a40', 0.95));
const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
G.sun = sun;

createSky();
applySettings();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ---------- Grenze um die Spawn-Insel ----------
let border;
function makeBorder() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(190,220,255,0.9)'; x.lineWidth = 2; x.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.round(G.spawnRadius * Math.PI * 2 / 4), 10);
  border = new THREE.Mesh(new THREE.CylinderGeometry(G.spawnRadius, G.spawnRadius, 40, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, color: '#9cc8f0' }));
  border.position.set(G.spawnCenter.x, 15, G.spawnCenter.z);
  border.userData.noMap = true;
  scene.add(border);
}
function keepInsideBorder(a) {
  const dx = a.pos.x - G.spawnCenter.x, dz = a.pos.z - G.spawnCenter.z, d = Math.hypot(dx, dz);
  const max = G.spawnRadius - a.radius - 0.2;
  if (d > max) {
    a.pos.x = G.spawnCenter.x + dx / d * max; a.pos.z = G.spawnCenter.z + dz / d * max;
    const out = (a.vel.x * dx + a.vel.z * dz) / d;
    if (out > 0) { a.vel.x -= dx / d * out; a.vel.z -= dz / d * out; }
  }
}

// ---------- Laden ----------
initInput(canvas, onLock);
loadWorld('assets/maps/sky-royale.glb', p => { $('load-bar').style.width = (p * 100).toFixed(0) + '%'; })
  .then(() => {
    if (G.spawnPoints.length) {               // Spawn-Insel vermessen -> Grenze
      const s0 = G.spawnPoints[0];
      let cx = 0, cz = 0, n = 0; const cells = [];
      for (let x = s0.x - 110; x <= s0.x + 110; x += 2) for (let z = s0.z - 110; z <= s0.z + 110; z += 2) {
        if (isLand(x, z) && Math.hypot(x - s0.x, z - s0.z) < 85) { cx += x; cz += z; n++; cells.push([x, z]); }
      }
      if (n) {
        cx /= n; cz /= n;
        let r = 0; for (const [x, z] of cells) r = Math.max(r, Math.hypot(x - cx, z - cz));
        G.spawnCenter.set(cx, 0, cz); G.spawnRadius = r + 7;
      }
    }
    initCars();
    createWater();
    makeBorder();
    createStorm(); G.storm.wall.userData.noMap = true;
    initHud();
    initTouch(); G.onTouchSetting = setTouch; setTouch(G.settings.touch);
    $('load-txt').textContent = 'Bereit';
    $('load-bar').style.width = '100%';
    for (const id of ['btn-play', 'btn-host', 'btn-join']) $(id).disabled = false;
    G.phase = 'menu';
  })
  .catch(err => { $('load-txt').textContent = 'Fehler beim Laden der Map: ' + err.message; console.error(err); });

// ---------- Menü & Lobby ----------
try { $('name').value = localStorage.getItem('skyroyale.name') || ''; } catch (e) {}
function keyHelp() {
  const k = id => `<b>${bindLabel(id)}</b>`;
  $('keyhelp').innerHTML = `${k('forward')}${k('left')}${k('back')}${k('right')} Laufen · ${k('jump')} Springen/Gleiter · ${k('sprint')} Sprinten · ${k('crouch')} Ducken (beim Sprinten: Rutschen) · ` +
    `${k('fire')} Schießen · ${k('aim')} Zielen · ${k('reload')} Nachladen · ${k('interact')} Öffnen/Einsteigen · ${k('ping')} Pingen · ${k('map')} Karte · ${k('emote')} Tanzen`;
}
keyHelp();
$('btn-settings').onclick = () => openSettings(keyHelp);
$('btn-psettings').onclick = () => openSettings();
const playerName = () => { const n = $('name').value.trim().slice(0, 16) || 'Spieler'; try { localStorage.setItem('skyroyale.name', n); } catch (e) {} return n; };

$('btn-play').onclick = () => { if (isMP()) return; initAudio(); lockPointer(canvas); if (G.phase === 'menu') startWarmup(); };
function afterStart() { if (touchMode || !locked) { $('menu').classList.add('hidden'); } showTouch(true); }
$('btn-host').onclick = () => {
  if (isMP()) return;
  initAudio();
  for (const id of ['btn-play', 'btn-host', 'btn-join']) $(id).disabled = true;
  $('lobby').classList.remove('hidden'); $('lobby-msg').textContent = 'Lobby wird erstellt …';
  try { hostLobby(playerName(), updateLobby); } catch (e) { $('lobby-msg').textContent = e.message; }
};
$('btn-join').onclick = () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length < 4 || isMP()) return;
  initAudio();
  for (const id of ['btn-play', 'btn-host', 'btn-join']) $(id).disabled = true;
  $('lobby').classList.remove('hidden'); $('lobby-code').textContent = code; $('lobby-msg').textContent = 'Verbinde …';
  try { joinLobby(code, playerName(), updateLobby); } catch (e) { $('lobby-msg').textContent = e.message; }
};
$('btn-start').onclick = () => { if (isHost() && G.phase === 'menu') { lockPointer(canvas); startWarmup(); } };
function updateLobby(err) {
  if (err) { $('lobby-msg').textContent = err; return; }
  const names = isHost() ? lobbyNames() : (NET.lobby || []);
  $('lobby-list').innerHTML = names.map((n, i) => `<div>${i === 0 ? '★ ' : ''}${n.replace(/</g, '&lt;')}</div>`).join('');
  if (isHost()) {
    $('lobby-code').textContent = NET.code;
    $('btn-start').classList.remove('hidden');
    $('lobby-msg').textContent = `${names.length} Spieler · Rest wird mit Bots aufgefüllt. Code an Freunde schicken.`;
  } else $('lobby-msg').textContent = names.length ? 'Verbunden – warte auf den Host …' : 'Verbinde …';
}

function resumeGame(viaPad) {
  if (G.ended) return;
  $('pause').classList.add('hidden'); G.paused = false;
  if (!viaPad) lockPointer(canvas);
}
$('btn-resume').onclick = () => resumeGame(false);
function openPause() {
  if (G.ended || !G.player) return;
  $('pause-title').textContent = isMP() ? 'Menü (Spiel läuft weiter)' : 'Pause';
  $('btn-resume').textContent = 'Weiter';
  $('pause').classList.remove('hidden');
  if (!isMP()) G.paused = true;
  if (locked) document.exitPointerLock();
}
$('btn-restart').onclick = $('btn-again').onclick = () => { setUnloadGuard(false); location.reload(); };

function onLock(isLocked) {
  if (isLocked) { $('menu').classList.add('hidden'); $('pause').classList.add('hidden'); G.paused = false; return; }
  if (G.ended || G.phase === 'menu' || G.phase === 'loading' || touchMode) return;
  openPause();
}

// ---------- Phasen ----------
function placeOnPad(a, i) {
  const p = G.spawnPoints.length ? G.spawnPoints[i % G.spawnPoints.length] : G.spawnCenter;
  const off = i < G.spawnPoints.length ? 0 : 1.6;
  const ang = Math.random() * Math.PI * 2;
  a.pos.set(p.x + Math.cos(ang) * off, p.y + 0.4, p.z + Math.sin(ang) * off);
  a.vel.set(0, 0, 0); a.state = 'air'; a.onGround = false;
  a.yaw = Math.atan2(-(G.spawnCenter.x - a.pos.x), -(G.spawnCenter.z - a.pos.z));
  a.hp = 100; a.shield = 0; a.alive = true; a.model.visible = true;
  if (a.isRemote) { a.netPos = a.pos.clone(); a.netYaw = a.yaw; a.netPitch = 0; }
}

function showHud() { $('hud').classList.remove('hidden'); $('menu').classList.add('hidden'); setUnloadGuard(true); canvas.dataset.play = '1'; }

function startWarmup() {
  G.phase = 'warmup'; G.phaseT = WARMUP;
  showHud(); setTimeout(afterStart, 0);
  G.player = createActor(isMP() ? NET.name : 'Du', false, 0);
  setupPlayer(G.player);
  if (isHost()) createRemoteActors();
  createBots(TOTAL - G.actors.length);
  const order = G.actors.slice(1).sort(() => Math.random() - 0.5);
  placeOnPad(G.player, 0);
  order.forEach((a, i) => placeOnPad(a, i + 1));
  if (isHost()) sendStart();
  for (let i = 0; i < 18; i++) {             // Aufwärm-Loot auf der Spawn-Insel
    const ang = Math.random() * Math.PI * 2, d = rand(8, G.spawnRadius - 14);
    const x = G.spawnCenter.x + Math.cos(ang) * d, z = G.spawnCenter.z + Math.sin(ang) * d;
    if (!isLand(x, z)) continue;
    for (const it of rollFloor()) spawnLoot(it, new THREE.Vector3(x + rand(-0.6, 0.6), heightAt(x, z) + 0.05, z + rand(-0.6, 0.6)));
  }
}

// Client: Runde vom Host übernehmen
on('netStart', d => {
  if (G.player) return;
  for (const r of d.actors) {
    const a = createActor(r.name, r.bot, r.look, r.id);
    a.pos.set(r.p[0], r.p[1], r.p[2]);
    if (r.id === d.you) { G.player = a; setupPlayer(a); a.name = r.name; }
    else { a.isPuppet = true; a.netPos = a.pos.clone(); a.netYaw = 0; a.netPitch = 0; }
  }
  G.player.state = 'air';
  G.phase = 'warmup'; G.phaseT = d.pt;
  showHud(); showTouch(true);
  $('pause-title').textContent = 'Die Runde startet!';
  $('btn-resume').textContent = 'Klicken zum Mitspielen';
  $('pause').classList.remove('hidden');
});
on('respawnLocal', (p, yaw) => {
  const a = G.player;
  resetLoadout(a);
  a.pos.copy(p); a.vel.set(0, 0, 0); a.yaw = yaw; a.state = 'air';
  a.hp = 100; a.shield = 0; a.alive = true; a.model.visible = true;
});
on('respawn', a => {
  if (G.phase !== 'warmup') return;
  resetLoadout(a);
  placeOnPad(a, (Math.random() * G.spawnPoints.length) | 0);
  net.respawn(a);
});

function startBusPhase() {
  G.phase = 'bus';
  for (const l of G.loot.slice()) removeLoot(l);
  for (const a of G.actors) {
    if (a.car) { a.car.driver = null; a.car = null; }
    resetLoadout(a);
    a.hp = 100; a.shield = 0; a.alive = true; a.kills = 0; a.slideT = 0; a.crouch = false; a.dmgDealt = 0; a.emoteT = 0;
    a.state = 'bus'; a.model.visible = false; a.vel.set(0, 0, 0);
  }
  border.visible = false;
  startBus();
  G.matchStart = G.time;
  planBotDrops();
  startStorm();
  const down = new THREE.Vector3(0, -1, 0);
  for (const h of G.houses) {                // Bodenloot in den Häusern
    if (Math.hypot(h.pos.x - G.spawnCenter.x, h.pos.z - G.spawnCenter.z) < G.spawnRadius) continue;
    let n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < 12 && n > 0; i++) {
      const o = new THREE.Vector3(h.pos.x + rand(-2.5, 2.5), h.pos.y + 3.0, h.pos.z + rand(-2.5, 2.5));
      const hit = raycast(o, down, 4);
      if (!hit || hit.point.y > h.pos.y + 0.7) continue;
      for (const it of rollFloor()) spawnLoot(it, hit.point.clone().add(new THREE.Vector3(rand(-0.3, 0.3), 0.02, rand(-0.3, 0.3))));
      n--;
    }
  }
}
on('clientBus', () => {
  G.matchStart = G.time;
  const a = G.player;
  if (a.car) { a.car.driver = null; a.car = null; }
  resetLoadout(a);
  a.hp = 100; a.shield = 0; a.alive = true; a.kills = 0; a.slideT = 0; a.crouch = false; a.dmgDealt = 0; a.emoteT = 0;
  a.state = 'bus'; a.model.visible = false;
  for (const o of G.actors) if (o !== a) o.model.visible = false;
  border.visible = false;
  G.phase = 'bus';
});

on('eliminated', (t, killer) => {
  if (G.phase !== 'bus' && G.phase !== 'match') return;
  if (t === G.player) {
    G.spectate = killer && killer !== t && killer.alive ? killer : null;
    const kn = killer && killer !== t ? killer.name : null;
    setTimeout(() => endGame('lose', kn), 1600);
  }
  if (!isClient() && aliveCount() === 1) {
    const w = G.actors.find(a => a.alive);
    net.end(w);
    announceWinner(w);
  }
});
on('netEnd', id => announceWinner(G.actors.find(a => a.id === id)));
function announceWinner(w) {
  if (!w) return;
  G.winner = w;
  if (w === G.player) { startVictory(); return; }
  w.emoteT = 1e9; w.emoteStyle = 1;                   // Gewinner tanzt
  G.spectate = w;
  setTimeout(() => { if (!G.ended) endGame('lose', null); updateEndBar(); }, 1700);
}
on('netLost', () => endGame('lost', null));

// ---------- Rundenende ----------
let endKind = 'lose', killerName = null;
function endGame(kind, kname) {
  if (G.ended) return;
  G.ended = true; endKind = kind; killerName = kname;
  setUnloadGuard(false); canvas.dataset.play = '0';
  document.body.classList.add('ended');
  showTouch(false);
  $('pause').classList.add('hidden');
  if (!G.spectate || !G.spectate.alive) nextSpectate();
  updateEndBar();
  $('end').classList.remove('hidden');
  document.exitPointerLock();
}
function updateEndBar() {
  const a = G.player, t = Math.max(0, (a.alive || endKind === 'win' ? G.time : (a.deathTime || G.time)) - (G.matchStart || G.time));
  const win = endKind === 'win';
  $('end').classList.toggle('win', win);
  $('end-place').textContent = win ? '#1 von ' + G.actors.length : endKind === 'lost' ? '' : '#' + (a.place || '?');
  $('end-title').textContent = win ? 'Victory Royale' : endKind === 'lost' ? 'Verbindung verloren'
    : G.winner && G.winner !== a ? G.winner.name + ' hat gewonnen' : 'Ausgeschieden';
  const stats = [[a.kills, 'Eliminierungen'], [Math.round(a.dmgDealt || 0), 'Schaden'], [`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 'Überlebt']];
  if (!win && killerName) stats.push([killerName, 'Eliminiert von']);
  $('end-stats').innerHTML = stats.map(([v, l]) => `<div><b>${String(v).replace(/</g, '&lt;')}</b>${l}</div>`).join('');
  $('btn-spectate').classList.toggle('hidden', win);
}
// Sieg: Zeitlupe, Kamerafahrt, Konfetti, großer Schriftzug, danach die Leiste
function startVictory() {
  if (G.victory) return;
  G.victory = { t: 0 };
  document.body.classList.add('ended', 'victory');
  showTouch(false);
  const a = G.player;
  a.emoteT = 1e9; a.emoteStyle = 0; a.ads = false;
  $('victory').querySelector('.v3').textContent = `${a.kills} Eliminierungen · ${G.actors.length} Spieler`;
  $('victory').classList.remove('hidden');
  sfx('victory'); setTimeout(() => sfx('horn'), 700);
  if (!isMP()) G.timeScale = 0.3;
  setTimeout(() => { $('victory').classList.add('hidden'); endGame('win', null); }, 6500);
}
$('btn-spectate').onclick = () => nextSpectate();
// Zuschauen: nächster Spieler per Leertaste/Klick/Tippen/A, Esc (oder B/Menü) zurück zum Ende-Bildschirm
function nextSpectate() {
  const alive = G.actors.filter(a => a.alive && a !== G.player).sort((x, y) => (x.isBot - y.isBot) || x.id - y.id);
  if (!alive.length) { G.spectate = null; return; }
  const i = alive.indexOf(G.spectate);
  G.spectate = alive[(i + 1) % alive.length];
}
const spectating = () => G.ended && !G.player.alive;
addEventListener('keydown', e => {
  if (!G.ended) return;
  if (e.code === 'Escape' && $('settings').classList.contains('hidden') && !G.victory) $('end').classList.toggle('hidden');   // Leiste ein/aus
  else if (e.code === 'Space' && spectating()) nextSpectate();
});
canvas.addEventListener('click', () => { if (spectating()) nextSpectate(); });
on('eliminated', t => { if (t === G.player) t.deathTime = G.time; });
canvas.addEventListener('touchstart', () => { if (spectating()) nextSpectate(); }, { passive: true });
on('elimFx', p => elimEffect(p));

// ---------- Hauptschleife ----------
const clock = new THREE.Clock();

function update(dt) {
  G.time += dt;
  const client = isClient();
  if (G.phase === 'warmup') {
    if (!client) { G.phaseT -= dt; if (G.phaseT <= 0) startBusPhase(); }
    message(`Battle-Bus startet in ${Math.max(0, Math.ceil(G.phaseT))}`, null);
  } else if (G.phase === 'bus' || G.phase === 'match') {
    const inBus = G.player.state === 'bus' && G.bus;
    message(inBus ? (G.bus.doors ? 'Leertaste: Abspringen' : 'Türen öffnen sich …') : '', null);
    if (!client && G.phase === 'bus' && G.bus && G.bus.done && !G.actors.some(a => a.state === 'bus')) G.phase = 'match';
  }

  updatePlayer(dt);
  if (!client) updateBots(dt);
  updateBus(dt);
  for (const a of G.actors) {
    if (!a.alive) continue;
    const local = !a.isRemote && !a.isPuppet;
    if (local) {
      if (a.emoteT > 0) a.emoteT -= dt;
      updateActorCombat(a, dt);
      if (G.phase === 'warmup') keepInsideBorder(a);
    } else {
      a.model.visible = a.state !== 'bus' && a.state !== 'dead';
      a.kickVis = (a.kickVis || 0) * Math.exp(-dt * 9);
    }
    if (!client) updateSprings(a, dt);
    a.model.position.copy(a.pos);
    a.model.rotation.y = a.yaw;
    if (a.model.visible && a.pos.distanceToSquared(camera.position) < 220 * 220) animateCharacter(a, dt);
  }
  if (!client) for (const c of G.cars) if (!c.driver && (Math.abs(c.speed) > 0.05 || c.vy)) { c.speed *= Math.exp(-dt * 1.5); stepCar(c, dt); }
  updateStorm(dt);
  updateProjectiles(dt);
  updateThrowables(dt);
  updateLoot(dt);
  updateEffects(dt);
  updateObjects(dt);
  netUpdate(dt);
  chestFx(dt);
  updateSky(dt, camera.position);

  const p = G.player.state === 'bus' && G.bus ? G.bus.pos : G.player.pos;
  sun.position.set(p.x + 60, p.y + 120, p.z + 40);
  sun.target.position.copy(p);
  if (border.visible) border.material.map.offset.y += dt * 0.02;
  updateCamera(dt);
  updateHud(dt);
  updateTouch(!!(camState.interact || camState.car), G.player.state === 'car', !G.player.alive);
  if (!G.player.alive && G.ended) {
    if (!G.spectate || !G.spectate.alive) nextSpectate();
    $('end-watch').textContent = G.spectate ? `Du schaust ${G.spectate.name}${G.spectate.isBot ? '' : ' (Spieler)'} zu · ${touchMode ? 'Tippen' : 'Leertaste / Klick'}: nächster · ${touchMode ? '' : 'Esc: Leiste ein/aus'}` : '';
  } else if (G.ended) $('end-watch').textContent = '';
  if (G.victory) { G.victory.t += dt / (G.timeScale || 1); if (G.victory.t > 1.4) G.timeScale = 1; if (Math.random() < 0.5) confetti(G.player.pos); }
}

// Truhen funkeln und summen in der Nähe
let sparkT = 0, humT = 0;
function chestFx(dt) {
  sparkT -= dt; humT -= dt;
  const p = G.player.pos;
  let near = null, nd = 18;
  for (const c of G.chests) {
    if (c.opened || c.type !== 'chest') continue;
    const d = c.pos.distanceTo(p);
    if (d < 24 && sparkT <= 0) sparkle(c.pos);
    if (d < nd) { nd = d; near = c; }
  }
  if (sparkT <= 0) sparkT = 0.12;
  if (near && humT <= 0) { sfx('chesthum', nd); humT = 1.4; }
}

// Controller in Menüs: A bestätigt, Menü-Taste pausiert/weiter, B zurück
function padMenus() {
  const vh = a => virtHit.has(a);
  if (vh('pause')) {
    if (G.ended) { if (!G.victory || G.victory.t > 6) $('end').classList.toggle('hidden'); }
    else if (G.player && G.phase !== 'menu') { if ($('pause').classList.contains('hidden')) openPause(); else resumeGame(true); }
  }
  if (vh('jump') || vh('padUse')) {
    if (!$('menu').classList.contains('hidden') && G.phase === 'menu' && !$('btn-play').disabled && !isMP()) { initAudio(); startWarmup(); $('menu').classList.add('hidden'); }
    else if (!$('pause').classList.contains('hidden') && !G.ended) resumeGame(true);
    else if (spectating()) nextSpectate();
  }
  if (vh('crouch') && spectating()) $('end').classList.toggle('hidden');
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta()) * (G.timeScale || 1);
  pollGamepad();
  padMenus();
  if (G.player && !G.paused && G.phase !== 'loading' && G.phase !== 'menu') update(dt);
  else if (G.phase === 'menu') {             // Kamerafahrt über die Map im Menü
    G.time += dt;
    camera.position.set(Math.sin(G.time * 0.05) * 260, 110, Math.cos(G.time * 0.05) * 260);
    camera.lookAt(0, 0, 0);
    updateSky(dt, camera.position);
  }
  renderer.render(scene, camera);
  endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.G = G;
