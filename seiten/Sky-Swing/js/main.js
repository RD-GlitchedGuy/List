// Einstieg: verbindet alle Teile und startet die Spielschleife
import { $, isTouch } from './util.js';
import { camera, sky, followSun, lowerQuality, render, updateTime, envU } from './engine.js';
import { game, P, I, cam, mode, fx } from './state.js';
import { updateCars, updateFunkenMesh, setFunkenVisible, setCityNight, START, parkRect } from './city.js';
const inPark = p => p.x > parkRect.x0 && p.x < parkRect.x1 && p.z > parkRect.z0 && p.z < parkRect.z1;
import { updateHero, marker, hero } from './hero.js';
import { gatherInput, hooks, flags, reqLock, rumble, enterFullscreen } from './input.js';
import { initAudio, chime, sfx, updateAudio } from './audio.js';
import { updateHUD, toggleHelp, checkFunken, showMove, fmtRace } from './hud.js';
import { stepPlayer, computeZipTarget, respawn, zipTarget } from './player.js';
import { updateCamera } from './camera.js';
import { startRace, stopRace, updateRace, race, rings } from './race.js';
import { startCourier, startChase, stopMissions, updateMissions, chase } from './missions.js';
import { updateLife, heli } from './life.js';
import { updateTrains } from './trains.js';
import { updateRoofs, inPool } from './roofs.js';
import { updateNet, netLabel, net } from './net.js';
import { updateMinimap } from './minimap.js';
import { menuHooks, applyAll, openMenu, closeMenu, syncMenu, openOnline, closeOnline } from './menu.js';
import { score } from './score.js';
import { settings } from './settings.js';

if (isTouch) document.body.classList.add('touch');

// Schließen des Tabs (z. B. Strg+W) während des Spiels erst nach Rückfrage
addEventListener('beforeunload', e => { if (game.started) { e.preventDefault(); e.returnValue = ''; } });

// Schritte kommen direkt aus der Laufanimation
hero.onStep = (climb, A) => inPool(P.pos) ? sfx('splash_2', { vol: .18 + .2 * A, rate: 1.5, rev: .1 }) : sfx('step', { vol: (climb ? .35 : .3) + .45 * A, rate: climb ? 1.12 : .95 + .1 * A, rev: .12, lp: climb ? 3500 : 0 });
// Klick-Geräusch für alle Menüknöpfe
document.addEventListener('click', e => { if (e.target.closest('button, .tb')) { initAudio(); sfx('click', { vol: .5, vary: .3, rev: 0 }); } }, true);
applyAll(); syncMenu();

function faceFirstRing() { const r = rings[0]; cam.yaw = Math.atan2(r.p.x - P.pos.x, r.p.z - P.pos.z); P.faceYaw = cam.yaw; cam.pitch = .05; }
function setMode(name) {
  stopRace(); stopMissions(); setFunkenVisible(name === 'free'); mode.name = 'free';
  if (name === 'race') { startRace(); respawn(); faceFirstRing(); }
  else if (name === 'courier') startCourier();
  else if (name === 'chase') startChase();
}
function startGame(name, lock = true) {
  if (game.started) return;
  game.started = true; $('start').style.display = 'none'; initAudio(); respawn(); setMode(name);
  if (isTouch) {
    $('touch').style.display = 'block';
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  } else if (lock) { reqLock(); enterFullscreen(); }
}
let onlineOpen = false;
function resume() { closeMenu(); closeOnline(); onlineOpen = false; game.paused = false; if (!isTouch) { if (!flags.locked && !flags.noLock) reqLock(); enterFullscreen(); } }
function pause(fromLockLoss) {
  if (!game.started) return;
  if (onlineOpen) { if (!fromLockLoss) resume(); return; }
  if (game.paused) { if (!fromLockLoss) resume(); return; }
  game.paused = true; openMenu();
  if (flags.locked && document.exitPointerLock) document.exitPointerLock();   // Maus fürs Menü freigeben
}
function showOnline() { game.paused = true; closeMenu(); onlineOpen = true; openOnline(); }
hooks.respawn = respawn; hooks.help = toggleHelp; hooks.pause = pause;
menuHooks.resume = resume;
menuHooks.free = () => { setMode('free'); resume(); };
menuHooks.race = () => { setMode('race'); resume(); };
menuHooks.courier = () => { setMode('courier'); resume(); };
menuHooks.chase = () => { setMode('chase'); resume(); };
menuHooks.respawn = () => { respawn(); if (mode.name === 'race') { startRace(); faceFirstRing(); } resume(); };
menuHooks.online = showOnline;
menuHooks.onlineBack = resume;

$('play').onclick = () => startGame('free');
$('playRace').onclick = () => startGame('race');
$('playCourier').onclick = () => startGame('courier');
$('playChase').onclick = () => startGame('chase');
$('playOnline').onclick = () => { startGame('free', false); showOnline(); };
$('play').textContent = 'FREIES SCHWINGEN';
$('cross').style.display = 'block';
P.pos.copy(START); cam.tgt.copy(START).setY(START.y + 1.5);

// Sky-Games-Intro (läuft schon beim Laden, siehe index.html): jetzt ist das Spiel bereit
if (window.introReady) window.introReady();

const autoQ = !/noauto/.test(location.search);
const impactEl = $('impact'), netEl = $('netRow');
let last = performance.now(), fAcc = 0, fN = 0, playT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now; game.clock += dt;
  gatherInput(dt);
  if (!game.started && I.startP && !document.getElementById('intro')) startGame('free');
  else if (game.paused && !onlineOpen && I.startP) resume();
  if (!game.paused) updateTrains(dt, envU.night.value);
  if (game.started && !game.paused) {
    const frozen = mode.name === 'race' && race.count > 0;
    if (!frozen) { computeZipTarget(); stepPlayer(dt); } else { P.vel.set(0, 0, 0); }
    if (!game.won && mode.name === 'free') game.playTime += dt;
    checkFunken(() => { chime(); rumble(.3, 80); });
    updateRace(dt, (t, rec) => { showMove(`Ziel! ${fmtRace(t)}${rec ? ' · Neue Bestzeit!' : ''}`, 5000); rumble(.6, 300); syncMenu(); });
    updateMissions(dt, game.clock);
  }
  updateTime(dt); setCityNight(envU.night.value); updateRoofs(dt, game.clock, envU.night.value);
  if (game.started && !game.paused) updateCamera(dt); else if (!game.started) updateCamera(dt);
  updateHero(dt);
  updateNet(dt);
  updateLife(dt, game.clock);
  updateCars(dt);
  updateFunkenMesh(game.clock);
  if (zipTarget && game.started && !game.paused) {
    marker.visible = true; marker.position.copy(zipTarget.p); marker.lookAt(camera.position);
    marker.scale.setScalar(camera.position.distanceTo(zipTarget.p) * .022);
    marker.material.color.set(zipTarget.type === 'launch' ? 0xffb060 : zipTarget.type === 'perch' ? 0x9ee6ff : 0xff7a1a);
  } else marker.visible = false;
  followSun(P.pos);
  sky.position.copy(camera.position);
  const sp = P.vel.length();
  // Aufprall-Vignette: bleibt, solange man klebt oder liegt, dann blendet sie aus
  if (P.state !== 'splat') fx.impact = Math.max(0, fx.impact - dt * .9);
  impactEl.style.opacity = fx.impact.toFixed(3);
  netEl.textContent = netLabel();
  updateAudio(dt, {
    speed: sp, y: P.pos.y, pos: P.pos, diving: P.diving, paused: game.paused || !game.started, started: game.started,
    night: envU.night.value, inPark: inPark(P.pos), heli: heli.position,
    drone: mode.name === 'chase' ? chase.pos : null, charge: P.state === 'charge' ? P.charge : null,
  });
  updateHUD(dt);
  if (game.started) updateMinimap();
  render();
  // läuft es dauerhaft zu langsam, wird die Grafik eine Stufe gesenkt
  if (game.started && !game.paused && autoQ) {
    playT += dt; fAcc += dt; fN++;
    if (fAcc > 3) { if (playT > 6 && fN / fAcc < 38 && lowerQuality()) showMove('Grafik automatisch auf ' + settings.quality, 2000); fAcc = 0; fN = 0; }
  }
}
requestAnimationFrame(loop);
window.SKY_DEBUG = { P, cam, game, mode, race, score, net, scene: sky.parent };
