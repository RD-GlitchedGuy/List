/* Sky Dash — Musik & Sounds (Sky Games)
   Eigene Electro-Songs, live im Browser erzeugt (Web Audio) – keine Musikdateien.
   Aufbau jedes Songs: Intro → Build-up → Drop → Break → Build-up → Drop 2 → wieder Drop … */
(function () {
  'use strict';

  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

  // Melodien: Zahl = Tonstufe, . = Pause, - = Ton halten (16tel-Raster, 2 Takte = 32 Zeichen)
  const SONGS = [
    { // Neon Start – fröhlich, Dur
      root: 60, scale: MAJOR, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]],
      A: '4 . 4 . 5 4 . 2 - . 0 . 2 . 4 - 5 . 5 . 4 . 2 . 4 - - . 2 . 1 .',
      B: '7 . 7 . 8 7 . 5 - . 4 . 5 . 7 - 9 . 8 . 7 . 5 . 4 - - . 2 . 4 .'
    },
    { // Sky Rush – treibend, Moll
      root: 57, scale: MINOR, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
      A: '0 . 0 2 . 4 . 2 0 . 0 2 . 4 5 4 2 . 2 4 . 5 . 4 2 . 0 . 1 . 2 .',
      B: '7 . 6 . 4 . 6 7 - . 4 . 5 . 4 . 7 . 9 . 8 . 7 . 5 - . 4 . 2 . .'
    },
    { // Glitch Zone – schnell, Chiptune-Läufe
      root: 54, scale: MINOR, prog: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-5, -1, 2]],
      A: '0 2 4 2 7 4 2 4 0 2 4 2 8 4 2 4 0 2 4 2 7 4 2 4 6 5 4 2 4 . 2 .',
      B: '7 . 7 9 . 7 . 4 5 . 5 7 . 5 . 2 4 . 4 5 . 4 . 2 1 . 2 . 4 - - .'
    },
    { // Wave Storm – hektisch, Moll, schnelle Sprünge in der Melodie
      root: 52, scale: MINOR, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -2, 2]],
      A: '7 . 4 . 7 . 9 7 . 4 . 2 4 - 2 . 7 . 4 . 7 . 10 9 - 7 . 4 . 5 4 .',
      B: '11 . 9 . 7 . 9 11 - . 9 . 7 . 6 . 7 . 4 . 7 . 9 . 7 - - . 4 . 2 .'
    }
  ];
  const MENU = {
    root: 62, scale: MAJOR, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]],
    A: '4 . . 2 . . 4 . 5 . 4 . 2 . . . 1 . . 2 . . 4 . 2 . 1 . 0 . . .',
    B: '7 . . 5 . . 7 . 8 . 7 . 5 . . . 4 . . 5 . . 4 . 2 . 1 . 2 . . .'
  };

  function parse(str) {
    const tk = str.split(/\s+/), ev = [];
    for (let i = 0; i < 32; i++) {
      const t = tk[i] || '.';
      if (t === '-') { if (ev.length) ev[ev.length - 1].len++; continue; }
      if (t === '.') continue;
      ev.push({ step: i, deg: +t, len: 1 });
    }
    const map = {}; ev.forEach(e => { map[e.step] = e; });
    return map;
  }
  [...SONGS, MENU].forEach(s => { s.mA = parse(s.A); s.mB = parse(s.B); });

  const A = {
    ctx: null, master: null, musicGain: null, sfxGain: null, pump: null, delay: null,
    musicVol: 0.7, sfxVol: 0.8,
    playing: false, bpm: 140, song: null, step: 0, nextTime: 0, startTime: 0, timer: null, menu: false,
    noiseBuf: null
  };

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = A.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.15;
    A.master = ctx.createGain(); A.master.gain.value = 0.85;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.musicGain = ctx.createGain(); A.musicGain.connect(A.master);
    A.pump = ctx.createGain(); A.pump.connect(A.musicGain);        // Sidechain-Pumpen
    A.sfxGain = ctx.createGain(); A.sfxGain.connect(A.master);
    A.setVolumes(A.musicVol, A.sfxVol);
    A.delay = ctx.createDelay(1); const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3000;
    A.delay.connect(dl); dl.connect(fb); fb.connect(A.delay); dl.connect(A.pump);
    const len = ctx.sampleRate;
    A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.setVolumes = function (m, s) {
    A.musicVol = m; A.sfxVol = s;
    if (A.musicGain) { A.musicGain.gain.value = m * 0.6; A.sfxGain.gain.value = s * 0.7; }
  };

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  // ----- Instrumente -----
  function kick(t) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    env(g, t, 0.002, 1.1, 0.3); o.connect(g); g.connect(A.musicGain); o.start(t); o.stop(t + 0.34);
    // Klick obendrauf
    noise(t, A.musicGain, 'highpass', 3000, 0.25, 0.012);
    // Pumpen auslösen
    A.pump.gain.setValueAtTime(0.25, t);
    A.pump.gain.linearRampToValueAtTime(1, t + 60 / A.bpm * 0.55);
  }
  function noise(t, out, type, freq, vol, dec, q) {
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    env(g, t, 0.001, vol, dec); s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
  }
  function clap(t, vol) {
    for (let k = 0; k < 3; k++) noise(t + k * 0.009, A.musicGain, 'bandpass', 1500, vol * (k === 2 ? 1 : 0.6), k === 2 ? 0.16 : 0.02, 1.2);
  }
  function riser(t, dur) {
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    s.connect(f); f.connect(g); g.connect(A.musicGain); s.start(t); s.stop(t + dur + 0.05);
  }
  // Supersaw: mehrere leicht verstimmte Sägezähne
  function saw(t, freq, vol, a, dec, cutoff, voices, out, send) {
    const c = A.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.Q.value = 1;
    const det = voices === 1 ? [0] : voices === 3 ? [-12, 0, 12] : [-18, -7, 0, 7, 18];
    det.forEach(d => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + a + dec + 0.05);
    });
    env(g, t, a, vol / Math.sqrt(det.length), dec);
    f.connect(g); g.connect(out || A.pump); if (send) g.connect(A.delay);
  }
  function square(t, freq, vol, dec, out, send) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    env(g, t, 0.003, vol, dec); o.connect(g); g.connect(out || A.pump); if (send) g.connect(A.delay);
    o.start(t); o.stop(t + dec + 0.05);
  }
  function sine(t, freq, vol, dec, out) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; env(g, t, 0.004, vol, dec); o.connect(g); g.connect(out || A.pump);
    o.start(t); o.stop(t + dec + 0.05);
  }

  function note(S, deg) {
    const o = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
    return S.root + 12 * o + S.scale[i];
  }

  // Abschnitt im Song
  function section(bar) {
    if (A.menu) return bar % 16 < 8 ? 'break' : 'drop';
    if (bar < 4) return bar === 3 ? 'introBuild' : 'intro';
    const b = 4 + (bar - 4) % 20;
    if (b < 12) return 'drop';
    if (b < 16) return b === 15 ? 'breakBuild' : 'break';
    return 'drop2';
  }

  function playStep(st, t) {
    const S = A.song, spb = 60 / A.bpm / 4;
    const bar = Math.floor(st / 16), s16 = st % 16, sec = section(bar);
    const chord = S.prog[bar % 4];
    const drop = sec === 'drop' || sec === 'drop2';
    const build = sec === 'introBuild' || sec === 'breakBuild';
    const brk = sec === 'break' || sec === 'breakBuild';

    // Schlagzeug
    if (!brk && s16 % 4 === 0) kick(t);
    if (brk && !A.menu && s16 === 0) kick(t);
    if (drop && (s16 === 4 || s16 === 12)) clap(t, 0.7);
    if (!brk && s16 % 4 === 2) noise(t, A.musicGain, 'highpass', 7000, drop ? 0.32 : 0.22, 0.09);
    if (drop && s16 % 2 === 1) noise(t, A.musicGain, 'highpass', 10000, 0.1, 0.03);
    if (build) {
      // Snare-Wirbel, wird immer dichter und lauter
      const dense = s16 >= 8 ? 1 : 2;
      if (s16 % dense === 0) noise(t, A.musicGain, 'bandpass', 1800 + s16 * 120, 0.15 + s16 * 0.03, 0.08, 1);
      if (s16 === 0) riser(t, spb * 16);
    }
    if (drop && s16 === 0 && (bar % 8 === 4 || bar === 4)) noise(t, A.musicGain, 'highpass', 5000, 0.5, 1.4);

    // Bass auf dem Offbeat (pumpend)
    if (!brk && (s16 % 4 === 2 || (drop && s16 % 4 === 3 && s16 > 8))) {
      const f = mtof(S.root - 24 + chord[0]);
      saw(t, f, 0.5, 0.004, spb * 1.6, 520, 3);
      sine(t, f / 2, 0.45, spb * 1.6);
    }
    // Akkord-Stabs (Supersaw) auf dem Offbeat
    if (drop && s16 % 4 === 2) chord.forEach(c => saw(t, mtof(S.root + c), 0.16, 0.004, spb * 1.5, 4200, 3));
    // Flächen im Break
    if (brk && s16 === 0) chord.forEach(c => saw(t, mtof(S.root + c), 0.1, 0.4, spb * 15, 1600, 3));
    // Arpeggio (Chiptune)
    if (!drop || sec === 'drop2') {
      const ord = [0, 1, 2, 1], c = chord[ord[s16 % 4]] + (s16 >= 8 ? 12 : 0);
      if (!brk || s16 % 2 === 0) square(t, mtof(S.root + 12 + c), A.menu ? 0.035 : 0.045, spb * 0.9, null, true);
    }
    // Melodie
    if (drop || brk) {
      const half = bar % 4 < 2 ? S.mA : S.mB;
      const e = half[(bar % 2) * 16 + s16];
      if (e) {
        const up = sec === 'drop2' ? 12 : 0;
        const f = mtof(note(S, e.deg) + up), dur = spb * e.len * 0.95 + 0.04;
        if (drop) {
          saw(t, f, 0.22, 0.005, dur, 5200, 5, null, true);
          square(t, f / 2, 0.05, dur);
        } else square(t, f, A.menu ? 0.06 : 0.07, dur, null, true);
      }
    }
  }

  function tick() {
    if (!A.playing) return;
    const spb = 60 / A.bpm / 4;
    while (A.nextTime < A.ctx.currentTime + 0.14) {
      playStep(A.step, A.nextTime);
      A.step++; A.nextTime += spb;
    }
  }

  A.start = function (songIdx, bpm, menu) {
    if (!A.ctx) return;
    A.stop();
    A.menu = !!menu;
    A.song = menu ? MENU : SONGS[songIdx % SONGS.length];
    A.bpm = bpm || 140;
    A.step = 0;
    A.startTime = A.nextTime = A.ctx.currentTime + 0.05;
    A.pump.gain.cancelScheduledValues(0); A.pump.gain.value = 1;
    A.playing = true;
    tick();
    A.timer = setInterval(tick, 25);
  };

  A.stop = function () {
    A.playing = false;
    if (A.timer) clearInterval(A.timer);
    A.timer = null;
  };

  // 0..1 Puls auf dem Beat, für die Grafik
  A.pulse = function () {
    if (!A.ctx || !A.playing) return 0;
    const beat = (A.ctx.currentTime - A.startTime) * A.bpm / 60;
    if (beat < 0) return 0;
    return Math.exp(-(beat % 1) * 6);
  };

  // Soundeffekte
  A.sfx = function (name) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime, out = A.sfxGain;
    switch (name) {
      case 'die':
        noise(t, out, 'lowpass', 1800, 1.0, 0.5);
        sine(t, 90, 0.8, 0.3, out);
        break;
      case 'coin':
        square(t, 1318, 0.16, 0.08, out); square(t + 0.07, 1975, 0.16, 0.28, out);
        break;
      case 'complete':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => square(t + i * 0.07, mtof(72 + n), 0.12, 0.5, out));
        break;
      case 'click':
        sine(t, 1100, 0.25, 0.06, out);
        break;
      case 'checkpoint':
        sine(t, 1046, 0.3, 0.2, out);
        break;
    }
  };

  window.SDAudio = A;
})();
