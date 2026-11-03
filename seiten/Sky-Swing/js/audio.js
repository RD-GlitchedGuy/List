// Sound-Engine: Effekte aus sounds/sfx.mp3 (Sammeldatei, Positionen in sfx.json), Schleifen als eigene Dateien.
// Raumklang (HRTF) für alles mit Position, Hall in Häuserschluchten, Kompressor gegen Übersteuern.
import { Vector3 } from 'three';
import { camera } from './engine.js';

const _f = new Vector3(), _u = new Vector3(), _p = new Vector3();

let AC = null, master = null, sfxBus = null, ambBus = null, revIn = null, vol = .8, ready = false;
let sprite = null, meta = {};
const loops = {}, lastPick = {}, bufs = {};
const LOOPS = ['wind_loop', 'city_loop', 'traffic_loop', 'heli_loop', 'drone_loop', 'charge_loop'];
export const audio = { canyon: .5 };                 // 0 = hoch oben im Freien, 1 = unten zwischen Häusern

export function setVolume(v) { vol = v; if (master) master.gain.setTargetAtTime(v, AC.currentTime, .05); }

async function fetchBuf(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return AC.decodeAudioData(await r.arrayBuffer()); }
function makeIR(sec, decay) {   // künstlicher Hall: dichte Reflexionen zwischen Fassaden, dunkel ausklingend
  const n = Math.floor(AC.sampleRate * sec), b = AC.createBuffer(2, n, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / AC.sampleRate; lp += .35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.exp(-t / decay) * (t < .012 ? t / .012 : 1); }
    for (const [dt, g] of [[.045, .5], [.09, .32], [.14, .2]]) { const i = Math.floor(dt * AC.sampleRate) + c * 37; if (i < n) d[i] += g * (c ? -1 : 1); }   // Echos von gegenüber
  }
  return b;
}

export async function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
  master = AC.createGain(); master.gain.value = vol; master.connect(comp).connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.gain.value = .4; sfxBus.connect(master);
  ambBus = AC.createGain(); ambBus.gain.value = .35; ambBus.connect(master);
  const conv = AC.createConvolver(); conv.buffer = makeIR(2.2, .55);
  revIn = AC.createGain(); revIn.gain.value = 1; const revOut = AC.createGain(); revOut.gain.value = .3;
  revIn.connect(conv).connect(revOut).connect(master);
  try {
    const [b, m] = await Promise.all([fetchBuf('sounds/sfx.mp3'), fetch('sounds/sfx.json').then(r => r.json())]);
    sprite = b; meta = m; ready = true;          // Effekte sofort spielbereit, Schleifen laden nebenher
  } catch (e) { console.warn('Sounds konnten nicht geladen werden', e); }
  fetchBuf('sounds/train_loop.mp3').then(b => { bufs.train_loop = b; }).catch(() => {});
  await Promise.all(LOOPS.map(async n => {
    try {
      const b = await fetchBuf(`sounds/${n}.mp3`); bufs[n] = b;
      const s = AC.createBufferSource(); s.buffer = b; s.loop = true;
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000;
      const g = AC.createGain(); g.gain.value = 0;
      let out = g, pan = null;
      if (n === 'heli_loop' || n === 'drone_loop') { pan = makePanner(n === 'heli_loop' ? 40 : 8, n === 'heli_loop' ? 1.1 : 1.6); g.connect(pan); out = pan; }
      s.connect(f).connect(g); out.connect(n === 'wind_loop' ? master : n === 'charge_loop' || n === 'drone_loop' ? sfxBus : ambBus);
      if (n === 'heli_loop' || n === 'drone_loop') { const send = AC.createGain(); send.gain.value = .25; out.connect(send).connect(revIn); }
      s.start(0, Math.random() * b.duration * .9);
      loops[n] = { s, f, g, pan };
    } catch (e) {}
  }));
  ready = true;
}

function makePanner(ref = 6, roll = 1.3) {
  const p = AC.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 2000; return p;
}
function setPos(p, v) {
  if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
}
// Name ohne Nummer wählt zufällig eine Variante (nie zweimal dieselbe hintereinander)
function pick(name) {
  if (meta[name]) return name;
  const opts = Object.keys(meta).filter(k => k.startsWith(name + '_'));
  if (!opts.length) return null;
  let k; do { k = opts[Math.floor(Math.random() * opts.length)]; } while (opts.length > 1 && k === lastPick[name]);
  lastPick[name] = k; return k;
}

/** Spielt einen Effekt. opts: vol, rate, pos (Vector3 für Raumklang), rev (Hallanteil), delay, lp (Tiefpass Hz), vary */
export function sfx(name, o = {}) {
  if (!ready || !sprite) return;
  const k = pick(name); if (!k) return;
  const [off, dur] = meta[k], vary = o.vary ?? 1;
  const s = AC.createBufferSource(); s.buffer = sprite;
  s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - .5) * .1 * vary);
  const g = AC.createGain(); g.gain.value = (o.vol ?? 1) * (1 + (Math.random() - .5) * .16 * vary);
  let node = s;
  if (o.lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  node.connect(g); node = g;
  if (o.pos) { const p = makePanner(o.ref || 6, o.roll || 1.3); setPos(p, o.pos); node.connect(p); node = p; }
  node.connect(sfxBus);
  const r = (o.rev ?? .2) * (.35 + audio.canyon);
  if (r > .01) { const sg = AC.createGain(); sg.gain.value = r; node.connect(sg).connect(revIn); }
  const t = AC.currentTime + (o.delay || 0);
  s.start(t, off, dur);
}

/** Schleife mit Raumklang für bewegliche Quellen (z. B. Züge). Startet von selbst, sobald der Klang geladen ist. */
export function spatialLoop(name, ref = 10, roll = 1.2) {
  const h = {
    s: null, g: null, pan: null,
    update(pos, gain, rate = 1) {
      if (!this.s) { if (!AC || !bufs[name]) return; this.start(); }
      const t = AC.currentTime; setPos(this.pan, pos);
      this.g.gain.setTargetAtTime(gain, t, .15); this.s.playbackRate.setTargetAtTime(rate, t, .2);
    },
    start() {
      this.s = AC.createBufferSource(); this.s.buffer = bufs[name]; this.s.loop = true;
      this.g = AC.createGain(); this.g.gain.value = 0; this.pan = makePanner(ref, roll);
      this.s.connect(this.g).connect(this.pan).connect(sfxBus);
      const send = AC.createGain(); send.gain.value = .3; this.pan.connect(send).connect(revIn);
      this.s.start(0, Math.random() * bufs[name].duration);
    },
  };
  return h;
}

// alte Namen bleiben als Abkürzungen erhalten
export const thwip = () => sfx('web_shoot', { vol: .75, rev: .25 });
export const launchSound = () => sfx('launch', { vol: .9, rev: .3 });
export const chime = () => sfx('pickup', { vol: .7, rev: .35, vary: .3 });
export const thud = () => sfx('impact_ground');

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let hornT = 8, sirenT = 40;

/** Jede Frame: Hörerposition, Wind, Stadt, Verkehr, Hubschrauber, Drohne, Aufladen, Zufalls-Geräusche. */
export function updateAudio(dt, s) {
  if (!AC || !sprite) return;
  const t = AC.currentTime, L = AC.listener, c = camera;
  // Hörer = Kamera
  const fw = c.getWorldDirection(_f), up = _u.set(0, 1, 0).applyQuaternion(c.quaternion);
  if (L.positionX) {
    L.positionX.value = c.position.x; L.positionY.value = c.position.y; L.positionZ.value = c.position.z;
    L.forwardX.value = fw.x; L.forwardY.value = fw.y; L.forwardZ.value = fw.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
  } else { L.setPosition(c.position.x, c.position.y, c.position.z); L.setOrientation(fw.x, fw.y, fw.z, up.x, up.y, up.z); }

  const sp = s.speed, y = s.y, paused = s.paused;
  audio.canyon = lerp(audio.canyon, clamp(1 - y / 90, 0, 1) * (s.inPark ? .3 : 1), Math.min(1, dt * 2));
  const set = (n, gain, freq, tc = .12) => { const l = loops[n]; if (!l) return; l.g.gain.setTargetAtTime(gain, t, tc); if (freq) l.f.frequency.setTargetAtTime(freq, t, tc); };
  // Wind: der ursprüngliche Klang mit der ursprünglichen Kurve (leises, dunkles Rauschen, das mit dem Tempo heller wird)
  set('wind_loop', paused ? 0 : Math.min(.32, Math.max(0, (sp - 6) / 190)), 250 + sp * 28, .15);
  // Stadt: unten voll, oben leiser und dumpfer; nachts ruhiger
  const ground = clamp(1 - y / 110, 0, 1), night = s.night;
  set('city_loop', (.16 + .26 * ground) * (1 - .45 * night) * (paused ? .5 : 1), 2500 + 9000 * ground, .4);
  set('traffic_loop', (s.inPark ? .08 : .4) * Math.pow(clamp(1 - y / 75, 0, 1), 1.4) * (1 - .4 * night) * (paused ? .5 : 1), 600 + 2600 * ground, .4);
  // Hubschrauber und Drohne mit Raumklang
  if (loops.heli_loop && s.heli) { setPos(loops.heli_loop.pan, s.heli); set('heli_loop', paused ? 0 : .9, 0, .3); }
  if (loops.drone_loop) { if (s.drone) setPos(loops.drone_loop.pan, s.drone); set('drone_loop', s.drone && !paused ? .55 : 0, 0, .2); }
  // Katapult aufladen: Dehnen wird mit der Spannung höher und lauter
  const ch = loops.charge_loop;
  if (ch) { ch.g.gain.setTargetAtTime(s.charge != null && !paused ? .25 + .45 * s.charge : 0, t, .05); ch.s.playbackRate.setTargetAtTime(.8 + .6 * (s.charge || 0), t, .05); }
  // ab und zu Hupen und eine Sirene in der Ferne, nur nah am Boden
  if (!paused && s.started) {
    hornT -= dt; sirenT -= dt;
    if (hornT <= 0) {
      hornT = 5 + Math.random() * 14;
      if (y < 55 && !s.inPark) { const a = Math.random() * 6.28, d = 25 + Math.random() * 70; sfx('horn', { pos: _p.set(s.pos.x + Math.cos(a) * d, 1.2, s.pos.z + Math.sin(a) * d), vol: .5, rev: .5, ref: 10 }); }
    }
    if (sirenT <= 0) { sirenT = 50 + Math.random() * 70; const a = Math.random() * 6.28; sfx('siren', { pos: _p.set(s.pos.x + Math.cos(a) * 260, 2, s.pos.z + Math.sin(a) * 260), vol: .7, rev: .6, ref: 60, vary: .2 }); }
  }
}
export const audioState = () => ({ ready, ctx: AC && AC.state, sprite: !!sprite, sounds: Object.keys(meta).length, loops: Object.keys(loops) });
