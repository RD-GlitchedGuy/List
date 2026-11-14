// Sounds aus assets/sounds (MP3, alle CC0 – siehe assets/sounds/QUELLEN.md), abgespielt über WebAudio
// Mehrere Varianten pro Sound (name.mp3, name-2.mp3 …), damit nichts monoton klingt.
const SOUNDS = { aim: 1, ammo: 1, ammobox: 1, ar: 4, bandage: 1, banner: 1, boom: 2, bounce: 2, break: 1, busdoor: 1, busloop: 1, carcrash: 1, cardoor: 1, chest: 1, chesthum: 1, click: 1, crouch: 1, csmg: 3, death: 1, defeat: 1, drink: 1, drop: 1, elim: 1, emote: 1, empty: 1, engine: 1, equip: 1, equippickaxe: 1, fallhurt: 1, geyser: 1, glider: 1, gliderclose: 1, grapple: 1, handcannon: 2, head: 1, heal: 1, heavyar: 4, hit: 1, hitmetal: 3, hitstone: 3, hitwood: 3, horn: 1, hover: 1, hunting: 3, hurt: 3, impact: 3, invclose: 1, invopen: 1, jump: 1, ladder: 3, land: 2, launch: 1, mapopen: 1, medkit: 1, padplace: 1, pickup: 3, pickupgun: 1, pin: 1, ping: 1, pistol: 3, pump: 2, reel: 1, reload: 1, reloadpistol: 1, reloadrocket: 1, reloadshotgun: 1, reloadsniper: 1, rift: 1, rocket: 1, scope: 1, shieldbreak: 1, shieldhit: 1, shieldtake: 2, shotgun: 2, slide: 1, smg: 3, sniper: 3, splash: 1, spring: 1, stepgrass: 4, stepmetal: 4, stepsand: 4, stepstone: 4, stepwood: 4, storm: 1, stormdmg: 1, stormloop: 1, swim: 3, swing: 3, throw: 1, tick: 1, treefall: 1, victory: 1, whiz: 2, wind: 1 };
// Grundlautstärke (die Dateien sind schon aufeinander abgestimmt)
const VOL = { chesthum: 0.8, hover: 0.6 };
// Wie weit ein Sound zu hören ist (Meter)
const RANGE = { ar: 170, heavyar: 180, smg: 140, csmg: 140, pistol: 140, handcannon: 190, shotgun: 150, pump: 150, sniper: 280, hunting: 240, rocket: 200,
  boom: 240, launch: 90, spring: 70, geyser: 90, pickaxe: 45, hitwood: 50, hitstone: 50, hitmetal: 50, break: 90, treefall: 110, land: 30, jump: 25,
  chesthum: 30, stepgrass: 32, stepsand: 32, stepwood: 38, stepstone: 36, stepmetal: 40, ladder: 35, slide: 40, swim: 35, splash: 60, death: 60,
  reload: 30, reloadpistol: 30, reloadshotgun: 30, reloadsniper: 30, reloadrocket: 30, impact: 45, bounce: 40, engine: 80, carcrash: 120,
  cardoor: 40, rift: 80, grapple: 70, throw: 35, padplace: 50, emote: 45, glider: 60, drink: 30, bandage: 30, medkit: 30 };
// Sounds, die sich nicht stapeln sollen (Mindestabstand in s)
const GAP = { chesthum: 0.8, hit: 0.03, shieldhit: 0.03, head: 0.03, land: 0.15, pickup: 0.05, ammo: 0.05, impact: 0.04, whiz: 0.15, hurt: 0.08,
  shieldtake: 0.08, stormdmg: 0.4, tick: 0.5, hover: 0.06, bounce: 0.1, click: 0.05 };

let ctx = null, master = null, vol = 0.6;
const buffers = {}, lastPlay = {}, lastVar = {}, loops = {};
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol;
  const comp = ctx.createDynamicsCompressor();          // fängt laute Gefechte ab, damit nichts übersteuert
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  master.connect(comp); comp.connect(ctx.destination);
  for (const [n, k] of Object.entries(SOUNDS)) {
    buffers[n] = [];
    for (let i = 1; i <= k; i++)
      fetch(`assets/sounds/${n}${i > 1 ? '-' + i : ''}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[n].push(buf); }).catch(() => {});
  }
}

// Einmal abspielen. dist = Entfernung zur Kamera, opt.vol = Lautstärke-Faktor, opt.rate = Tonhöhe
export function sfx(name, dist = 0, opt) {
  const list = ctx && buffers[name];
  if (!list || !list.length) return;
  const range = RANGE[name] || 160;
  const fall = Math.max(0, 1 - dist / range);
  if (fall <= 0.02) return;
  const now = ctx.currentTime;
  if (GAP[name] && now - (lastPlay[name] || -9) < GAP[name]) return;
  lastPlay[name] = now;
  let i = (Math.random() * list.length) | 0;
  if (list.length > 1 && i === lastVar[name]) i = (i + 1) % list.length;   // nie zweimal dieselbe Variante
  lastVar[name] = i;
  const src = ctx.createBufferSource(); src.buffer = list[i];
  src.playbackRate.value = (opt && opt.rate || 1) * (0.96 + Math.random() * 0.08);
  const g = ctx.createGain(); g.gain.value = (VOL[name] ?? 1) * (opt && opt.vol !== undefined ? opt.vol : 1) * fall * fall;
  let out = g;
  if (dist > 25) {                                      // ferne Sounds verlieren die Höhen
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 16000 * (1 - dist / range));
    g.connect(lp); out = lp;
  }
  src.connect(g); out.connect(master);
  src.start(now);
}

// Dauerschleife (Wind, Motor, Sturm, Tanzmusik): jedes Frame mit Ziel-Lautstärke aufrufen, 0 blendet aus
export function loopSound(key, name, volume, rate = 1) {
  if (!ctx) return;
  let L = loops[key];
  if (!L) {
    if (volume <= 0.001) return;
    const list = buffers[name]; if (!list || !list.length) return;
    const src = ctx.createBufferSource(); src.buffer = list[0]; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(master); src.start();
    L = loops[key] = { src, g, quiet: 0 };
  }
  const t = ctx.currentTime;
  L.g.gain.setTargetAtTime(Math.max(0, volume) * (VOL[name] ?? 1), t, 0.12);
  L.src.playbackRate.setTargetAtTime(rate, t, 0.1);
  if (volume <= 0.001) { if (++L.quiet > 90) { try { L.src.stop(); } catch (e) {} delete loops[key]; } } else L.quiet = 0;
}
export function stopLoops() { for (const k in loops) loopSound(k, '', 0); }
export const soundsLoaded = () => Object.values(buffers).filter(l => l.length).length;
