/* Sky Dash — Physik (Sky Games)
   Reine Spiellogik ohne Grafik. Einheiten: 1 = ein Block. y zeigt nach oben. */
(function (root) {
  'use strict';

  const C = {
    G: 100,          // Schwerkraft
    JUMP: 21,        // Sprungkraft Würfel
    PAD: 28,         // gelbes Sprungpad
    ORB: 19.5,       // gelber Ring
    BORB: 10,        // blauer Ring (dreht Schwerkraft)
    TERM: 34,        // max. Fallgeschwindigkeit
    SHIP_ACC: 46,    // Schiff: Beschleunigung
    SHIP_MAX: 10,    // Schiff: max. Steig-/Sinkgeschwindigkeit
    SHIP_PAD: 13,
    SHIP_ORB: 11,
    TOP: 10,         // Decke der Welt
    DT: 1 / 240,     // fester Physik-Schritt
    BUF: 0.15,       // Klick-Puffer für Ringe
    TOL: 0.45,       // Toleranz beim Landen
    CORE: 0.3        // innere Hitbox: nur sie stirbt an Blockkanten (wie im Original)
  };

  const T = {
    BLOCK: 1, SPIKE: 2, CSPIKE: 3, ORB: 4, BORB: 5, PAD: 6,
    SHIP: 7, CUBE: 8, GUP: 9, GDOWN: 10, COIN: 11, SLAB: 12, DECO: 13, WAVE: 14, SAW: 15
  };

  function prepare(level) {
    const objs = level.objs.map((o, i) => {
      const t = o[0], x = o[1], y = o[2];
      const ob = { id: i, t, x, y, w: o[3] || 1, h: o[4] || 1 };
      if (t === T.SLAB) ob.h = 0.5;
      ob.solid = t === T.BLOCK || t === T.SLAB;
      switch (t) {
        case T.SPIKE: ob.bx = x + 0.36; ob.by = y; ob.bw = 0.28; ob.bh = 0.5; break;
        case T.CSPIKE: ob.bx = x + 0.36; ob.by = y + 0.5; ob.bw = 0.28; ob.bh = 0.5; break;
        case T.ORB: case T.BORB: ob.bx = x - 0.3; ob.by = y - 0.3; ob.bw = 1.6; ob.bh = 1.6; break;
        case T.PAD: ob.bx = x; ob.by = y; ob.bw = 1; ob.bh = 0.4; break;
        case T.SAW: ob.r = ob.w / 2; ob.cx = x + ob.r; ob.cy = y + ob.r; ob.bx = x; ob.by = y; ob.bw = ob.w; ob.bh = ob.w; break;
        case T.SHIP: case T.CUBE: case T.GUP: case T.GDOWN: case T.WAVE:
          ob.bx = x; ob.by = y; ob.bw = 1; ob.bh = 3; break;
        default: ob.bx = x; ob.by = y; ob.bw = ob.w; ob.bh = ob.h;
      }
      return ob;
    });
    const buckets = [];
    for (const ob of objs) {
      const a = Math.max(0, Math.floor(ob.bx)), b = Math.floor(ob.bx + ob.bw);
      for (let c = a; c <= b; c++) (buckets[c] || (buckets[c] = [])).push(ob);
    }
    return Object.assign({}, level, {
      objs, buckets,
      coinObjs: objs.filter(o => o.t === T.COIN)
    });
  }

  function newState(x) {
    return {
      x: x || 0, y: 0, vy: 0, mode: 0, g: 1, grounded: true,
      dead: false, done: false, buf: 0, prevHold: false,
      used: [], coins: [], ev: []
    };
  }

  function clone(s) {
    const n = Object.assign({}, s);
    n.used = s.used.slice(); n.coins = s.coins.slice(); n.ev = [];
    return n;
  }

  function hit(s, o) {
    return s.x < o.bx + o.bw && s.x + 1 > o.bx && s.y < o.by + o.bh && s.y + 1 > o.by;
  }

  function die(s, o) { s.dead = true; s.ev.push(['die', o]); }

  function step(L, s, hold, dt) {
    if (s.dead || s.done) return;
    if (hold && !s.prevHold) s.buf = C.BUF; else if (s.buf > 0) s.buf -= dt;
    s.prevHold = hold;
    s.x += L.speed * dt;

    let jumped = false;
    const c0 = Math.floor(s.x) - 1;

    // Ringe, Pads, Portale, Münzen, Stacheln
    for (let c = c0; c <= c0 + 3; c++) {
      const bk = L.buckets[c]; if (!bk) continue;
      for (const o of bk) {
        if (o.solid || o.t === T.DECO || !hit(s, o)) continue;
        const ins = s.mode === 2 ? 0.3 : 0.12;   // Wave hat eine kleine Hitbox
        if (o.t === T.SPIKE || o.t === T.CSPIKE) {
          if (s.x + ins < o.bx + o.bw && s.x + 1 - ins > o.bx &&
              s.y + ins < o.by + o.bh && s.y + 1 - ins > o.by) { die(s, o); return; }
          continue;
        }
        if (o.t === T.SAW) {
          const dx = s.x + 0.5 - o.cx, dy = s.y + 0.5 - o.cy, rr = o.r * 0.8 + 0.5 - ins;
          if (dx * dx + dy * dy < rr * rr) { die(s, o); return; }
          continue;
        }
        if (s.used.indexOf(o.id) >= 0) continue;
        switch (o.t) {
          case T.ORB:
            if (s.buf > 0 && s.mode !== 2) {
              s.used.push(o.id); s.buf = 0; jumped = true; s.grounded = false;
              s.vy = (s.mode ? C.SHIP_ORB : C.ORB) * s.g; s.ev.push(['orb', o]);
            } break;
          case T.BORB:
            if (s.buf > 0 && s.mode !== 2) {
              s.used.push(o.id); s.buf = 0; jumped = true; s.grounded = false;
              s.g = -s.g; s.vy = -s.g * C.BORB; s.ev.push(['orb', o]);
            } break;
          case T.PAD:
            if (s.mode === 2) break;
            s.used.push(o.id); jumped = true; s.grounded = false;
            s.vy = (s.mode ? C.SHIP_PAD : C.PAD) * s.g; s.ev.push(['pad', o]); break;
          case T.SHIP:
            s.used.push(o.id); if (s.mode !== 1) { s.mode = 1; s.vy *= 0.4; } s.ev.push(['portal', o]); break;
          case T.WAVE:
            s.used.push(o.id); s.mode = 2; s.ev.push(['portal', o]); break;
          case T.CUBE:
            s.used.push(o.id); if (s.mode !== 0) { s.mode = 0; s.vy *= 0.5; } s.ev.push(['portal', o]); break;
          case T.GUP:
            s.used.push(o.id); if (s.g === 1) { s.g = -1; s.vy *= 0.5; s.grounded = false; } s.ev.push(['portal', o]); break;
          case T.GDOWN:
            s.used.push(o.id); if (s.g === -1) { s.g = 1; s.vy *= 0.5; s.grounded = false; } s.ev.push(['portal', o]); break;
          case T.COIN:
            s.used.push(o.id); s.coins.push(o.id); s.ev.push(['coin', o]); break;
        }
      }
    }

    // Bewegung
    if (s.mode === 0) {
      if (s.grounded && hold && !jumped) { s.vy = C.JUMP * s.g; s.grounded = false; s.ev.push(['jump']); }
      s.vy -= C.G * s.g * dt;
      if (s.vy > C.TERM) s.vy = C.TERM; else if (s.vy < -C.TERM) s.vy = -C.TERM;
    } else if (s.mode === 2) {
      // Wave: gedrückt = schräg hoch, los = schräg runter (45°)
      s.vy = (hold ? 1 : -1) * s.g * L.speed;
    } else {
      s.vy += (hold ? C.SHIP_ACC : -C.SHIP_ACC) * s.g * dt;
      if (s.vy > C.SHIP_MAX) s.vy = C.SHIP_MAX; else if (s.vy < -C.SHIP_MAX) s.vy = -C.SHIP_MAX;
    }
    const py = s.y;
    s.y += s.vy * dt;
    s.grounded = false;

    if (s.y < 0) { s.y = 0; if (s.vy < 0) s.vy = 0; if (s.g === 1) s.grounded = true; }
    if (s.y > C.TOP - 1) { s.y = C.TOP - 1; if (s.vy > 0) s.vy = 0; if (s.g === -1) s.grounded = true; }

    // Blöcke
    const up = s.mode >= 1 || s.g === 1, down = s.mode >= 1 || s.g === -1;
    for (let c = c0; c <= c0 + 3; c++) {
      const bk = L.buckets[c]; if (!bk) continue;
      for (const o of bk) {
        if (!o.solid) continue;
        if (!(s.x < o.x + o.w - 1e-6 && s.x + 1 > o.x + 1e-6 && s.y < o.y + o.h - 1e-6 && s.y + 1 > o.y + 1e-6)) continue;
        const top = o.y + o.h, bot = o.y;
        if (s.mode === 2) {   // Wave stirbt an jedem Block, den ihr Kern berührt
          if (s.x + 0.3 < o.x + o.w && s.x + 0.7 > o.x && s.y + 0.3 < top && s.y + 0.7 > bot) { die(s, o); return; }
          continue;
        }
        if (py >= top - C.TOL && s.vy <= 0.001) {
          if (!up) { die(s, o); return; }
          s.y = top; s.vy = 0; if (s.g === 1) s.grounded = true;
        } else if (py + 1 <= bot + C.TOL && s.vy >= -0.001) {
          if (!down) { die(s, o); return; }
          s.y = bot - 1; s.vy = 0; if (s.g === -1) s.grounded = true;
        } else {
          // Nur sterben, wenn der Kern der Figur im Block steckt – Kanten streifen ist erlaubt
          const k = C.CORE;
          if (s.x + k < o.x + o.w && s.x + 1 - k > o.x && s.y + k < top && s.y + 1 - k > bot) { die(s, o); return; }
        }
      }
    }

    if (s.x >= L.length) { s.done = true; s.ev.push(['done']); }
  }

  const API = { C, T, prepare, newState, clone, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SDPhys = API;
})(typeof window !== 'undefined' ? window : globalThis);
