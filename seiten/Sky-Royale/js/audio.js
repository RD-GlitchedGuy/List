// Sounds aus assets/sounds (MP3), abgespielt über WebAudio mit Entfernungs-Lautstärke
const NAMES = ['ar', 'smg', 'pistol', 'shotgun', 'sniper', 'rocket', 'pickaxe', 'reload', 'empty', 'hit', 'head', 'shieldhit',
  'chest', 'chesthum', 'pickup', 'jump', 'land', 'boom', 'launch', 'glider', 'horn', 'storm', 'elim', 'ping', 'heal', 'banner', 'victory'];
// Grundlautstärke pro Sound
const VOL = { ar: 0.7, smg: 0.6, pistol: 0.7, shotgun: 0.85, sniper: 0.9, rocket: 0.8, pickaxe: 0.6, reload: 0.7, empty: 0.6, hit: 0.7, head: 0.8,
  shieldhit: 0.7, chest: 0.8, chesthum: 0.35, pickup: 0.6, jump: 0.45, land: 0.55, boom: 1, launch: 0.75, glider: 0.6, horn: 0.8, storm: 0.7,
  elim: 0.85, ping: 0.7, heal: 0.6, banner: 0.7, victory: 1 };
// Wie weit ein Sound zu hören ist (Meter)
const RANGE = { ar: 170, smg: 140, pistol: 140, shotgun: 150, sniper: 260, rocket: 200, boom: 220, launch: 90, pickaxe: 40, land: 30, jump: 30, chesthum: 30 };
// Sounds, die sich nicht stapeln sollen (Mindestabstand in s)
const GAP = { chesthum: 0.8, hit: 0.03, shieldhit: 0.03, head: 0.03, land: 0.15, pickup: 0.05 };

let ctx = null, master = null, vol = 0.6;
const buffers = {}, lastPlay = {};
export function setVolume(v) { vol = v; if (master) master.gain.value = v; }

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  for (const n of NAMES) {
    fetch(`assets/sounds/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[n] = buf; }).catch(() => {});
  }
}

export function sfx(name, dist = 0) {
  if (!ctx || !buffers[name]) return;
  const range = RANGE[name] || 160;
  const fall = Math.max(0, 1 - dist / range);
  if (fall <= 0.02) return;
  const now = ctx.currentTime;
  if (GAP[name] && now - (lastPlay[name] || -9) < GAP[name]) return;
  lastPlay[name] = now;
  const src = ctx.createBufferSource(); src.buffer = buffers[name];
  src.playbackRate.value = 0.96 + Math.random() * 0.08;      // kleine Variation, klingt weniger monoton
  const g = ctx.createGain(); g.gain.value = (VOL[name] ?? 0.7) * fall * fall;
  src.connect(g); g.connect(master);
  src.start(now);
}
export const soundsLoaded = () => Object.keys(buffers).length;
