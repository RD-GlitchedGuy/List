// Anzeige: Tempo, Höhe, Punkte, Kombo, Funken/Ringe, Richtungspfeil, Countdown, Hilfe
import { $, fmtTime, V3 } from './util.js';
import { P, cam, game, mode } from './state.js';
import { funken, NF } from './city.js';
import { score } from './score.js';
import { race, nextRing, rings } from './race.js';
import { best } from './settings.js';
import { nav } from './missions.js';

$('helpBox').innerHTML = `<b>Moves</b><br>Pendelschwung: Schwingen halten, am vorderen Hochpunkt loslassen = Perfekter Absprung<br>Doppelschwung: zwei Fäden, mehr Zug<br>Zip-Punkt: Fadenkreuz auf Wand oder Dachkante, Kante = Zip-Launch<br>Netz-Sprint: Sprung in der Luft (2×)<br>Eckenschwung: seitlich lenken + Schwingen, nahe einer Hauskante<br>Trick: in der Luft mit Richtung (vor Salto, zurück Rückwärtssalto, seitlich Schraube, Sprint+vor Doppelsalto), am Faden Seil-Tricks<br>Katapult: am Boden aufladen, loslassen<br>Wandlauf: gegen die Wand laufen, Sprung = Wandsprung<br>Sturzflug: Tempo sammeln für den nächsten Schwung<br>Tiefflug: dicht über der Straße schwingen<br>Hochbahn: aufs Zugdach springen und mitfahren<br>Pool: weiche Landung, Sprung von hoch oben gibt Bonus`;

export function toggleHelp() { const h = $('helpBox'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; }

let moveTimer = 0;
export function showMove(txt, ms = 900) {
  const m = $('move'); m.textContent = txt; m.style.opacity = 1;
  clearTimeout(moveTimer); moveTimer = setTimeout(() => m.style.opacity = 0, ms);
}
const fmtRace = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
export { fmtRace };
const nf = n => n.toLocaleString('de-DE');

export function updateHUD(dt) {
  $('speed').textContent = Math.round(P.vel.length() * 3.6) + ' km/h';
  $('alt').textContent = Math.round(P.pos.y);
  const racing = mode.name === 'race', free = mode.name === 'free';
  $('cntRow').style.display = free ? '' : 'none';
  $('timer').style.display = free ? '' : 'none';
  $('cnt').textContent = game.collected + '/' + NF;
  $('timer').textContent = fmtTime(game.playTime);
  // Punkte und Kombo
  $('score').textContent = nf(score.total) + ' Punkte';
  score.popT -= dt;
  const c = $('combo');
  if (score.pending > 0) { c.textContent = `+${nf(score.pending)}  ×${score.mult.toFixed(1)}` + (score.popT > 0 ? `  ·  ${score.label}` : ''); c.style.opacity = 1; }
  else c.style.opacity = 0;
  // Rennen
  $('raceBox').style.display = free ? 'none' : 'block';
  if (racing) {
    $('raceLbl').textContent = 'Ring';
    $('raceTime').textContent = fmtRace(race.time);
    $('raceRing').textContent = Math.min(race.idx, rings.length) + '/' + rings.length;
    $('raceBest').textContent = best.race != null ? 'Bestzeit ' + fmtRace(best.race) : '';
    const cd = $('count');
    if (race.count > 0) { cd.style.display = 'block'; cd.textContent = Math.ceil(race.count); } else cd.style.display = 'none';
  } else $('count').style.display = 'none';
  // Richtungspfeil: nächster Ring oder nächster Funke
  let tgt = null, label = '';
  if (racing) { const r = nextRing(); if (r) { tgt = r.p; label = 'Ring'; } }
  else if (!free) { tgt = nav.p; label = nav.label; }
  else { let b = null; for (const f of funken) if (!f.got) { const d = f.p.distanceTo(P.pos); if (!b || d < b.d) b = { d, f }; } if (b) { tgt = b.f.p; label = 'Funke'; } }
  if (tgt) {
    const a = Math.atan2(tgt.x - P.pos.x, tgt.z - P.pos.z) - cam.yaw, dy = tgt.y - P.pos.y;
    $('arrow').style.transform = `rotate(${-a}rad)`;
    $('navTxt').textContent = `${label} ${Math.round(tgt.distanceTo(P.pos))} m · ${dy > 8 ? 'oben' : dy < -8 ? 'unten' : 'gleich hoch'}`;
  } else $('navTxt').textContent = racing ? 'Ziel!' : free ? 'Alle Funken gefunden!' : '–';
}

const _c = new V3();
export function checkFunken(onPick) {
  if (mode.name !== 'free') return;
  for (const f of funken) {
    if (f.got) continue;
    if (f.p.distanceTo(_c.copy(P.pos).setY(P.pos.y + .9)) < 2.8) {
      f.got = true; game.collected++; onPick();
      showMove(`Sky-Funke ${game.collected}/${NF}`);
      if (game.collected === NF && !game.won) { game.won = true; setTimeout(() => showMove('Alle Funken! Zeit ' + fmtTime(game.playTime), 4000), 950); }
    }
  }
}
