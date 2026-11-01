/* Sky Dash — Grafik (Sky Games)
   Alles wird mit Canvas gezeichnet – keine Bilddateien nötig. */
(function () {
  'use strict';
  const T = SDPhys.T;
  const R = { U: 40, W: 800, H: 450, dpr: 1, glow: true, particles: [], rings: [], shake: 0 };
  let ctx, cv;

  // ---------- Farben ----------
  R.hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  R.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  R.rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const PORTAL = {
    [T.SHIP]: R.hex('#ff5ad6'), [T.CUBE]: R.hex('#5cff7a'),
    [T.GUP]: R.hex('#ffe14f'), [T.GDOWN]: R.hex('#4fc8ff'), [T.WAVE]: R.hex('#4fffe0')
  };
  const YELLOW = R.hex('#ffe14f'), BLUE = R.hex('#4fc8ff'), GOLD = R.hex('#ffcc33');

  R.init = function (canvas) {
    cv = canvas; ctx = canvas.getContext('2d');
    R.ctx = ctx;
    R.resize();
  };

  R.resize = function () {
    R.dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.W = cv.clientWidth; R.H = cv.clientHeight;
    cv.width = Math.round(R.W * R.dpr); cv.height = Math.round(R.H * R.dpr);
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    R.U = R.H / 12.2;
    R.groundY = R.H - 1.25 * R.U;
    R.camOff = Math.min(R.W / R.U * 0.3, 7);
  };

  R.sx = (x, camX) => (x - camX) * R.U;
  R.sy = y => R.groundY - y * R.U;

  // ---------- Hintergrund ----------
  function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }

  R.background = function (col, camX, pulse, t) {
    const { W, H, U } = R;
    // heller, kräftiger Hintergrund wie im Original
    const top = R.mix(col.bg, WHITE, 0.06 + 0.1 * pulse), bot = R.mix(col.bg, BLACK, 0.18);
    const g = ctx.createLinearGradient(0, 0, 0, R.groundY);
    g.addColorStop(0, R.rgb(top)); g.addColorStop(1, R.rgb(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // große Kacheln mit Schattierung (Parallax)
    const S = U * 4, px = camX * U * 0.1;
    const i0 = Math.floor(px / S);
    for (let i = i0 - 1; i < i0 + W / S + 2; i++) {
      for (let j = 0; j < R.groundY / S + 1; j++) {
        const h = hash(i, j), x = i * S - px, y = R.groundY - (j + 1) * S;
        const tg = ctx.createLinearGradient(x, y, x + S, y + S);
        tg.addColorStop(0, R.rgb(WHITE, 0.07 + h * 0.06));
        tg.addColorStop(1, R.rgb(BLACK, 0.1 + h * 0.12));
        ctx.fillStyle = tg; ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
        ctx.strokeStyle = R.rgb(BLACK, 0.18); ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, S - 6, S - 6);
        if (h > 0.55) {
          ctx.strokeStyle = R.rgb(WHITE, 0.08); ctx.lineWidth = 2;
          ctx.strokeRect(x + S * 0.2, y + S * 0.2, S * 0.6, S * 0.6);
        }
      }
    }
    // Beat-Glühen von unten
    if (pulse > 0.01) {
      const rg = ctx.createLinearGradient(0, R.groundY, 0, R.groundY - U * 6);
      rg.addColorStop(0, R.rgb(col.accent, 0.22 * pulse));
      rg.addColorStop(1, R.rgb(col.accent, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, R.groundY);
    }
  };

  function bandTiles(col, camX, yTop, yBot, flip) {
    const { W, U } = R;
    ctx.fillStyle = R.rgb(R.mix(col.ground, BLACK, 0.25)); ctx.fillRect(0, yTop, W, yBot - yTop);
    const S = U * 2.6, off = ((camX * U) % S + S) % S;
    for (let x = -off; x < W + S; x += S) {
      const y0 = flip ? yBot - S : yTop;
      const g = ctx.createLinearGradient(x, y0, x + S * 0.4, y0 + S);
      g.addColorStop(0, R.rgb(R.mix(col.ground, WHITE, 0.18)));
      g.addColorStop(0.55, R.rgb(col.ground));
      g.addColorStop(1, R.rgb(R.mix(col.ground, BLACK, 0.45)));
      ctx.fillStyle = g; ctx.fillRect(x + 2, y0 + 2, S - 4, S - 4);
      ctx.strokeStyle = R.rgb(BLACK, 0.35); ctx.lineWidth = 3; ctx.strokeRect(x + 2, y0 + 2, S - 4, S - 4);
    }
  }

  function glowLine(y, col, pulse) {
    const { W } = R;
    const lg = ctx.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, R.rgb(WHITE, 0)); lg.addColorStop(0.5, R.rgb(WHITE, 1)); lg.addColorStop(1, R.rgb(WHITE, 0));
    if (R.glow) {
      const gg = ctx.createLinearGradient(0, 0, W, 0);
      const c = R.rgb(R.mix(col.accent, WHITE, 0.3), 0.35 + 0.3 * pulse);
      gg.addColorStop(0, R.rgb(WHITE, 0)); gg.addColorStop(0.5, c); gg.addColorStop(1, R.rgb(WHITE, 0));
      ctx.fillStyle = gg; ctx.fillRect(0, y - 6, W, 12);
    }
    ctx.fillStyle = lg; ctx.fillRect(0, y - 1.5, W, 3);
  }

  R.ground = function (col, camX, pulse, ceil) {
    bandTiles(col, camX, R.groundY, R.H, false);
    glowLine(R.groundY, col, pulse);
    if (ceil > 0.01) {
      const yc = R.sy(10);
      ctx.save(); ctx.globalAlpha = ceil;
      ctx.translate(0, -(1 - ceil) * yc);
      bandTiles(col, camX, 0, yc, true);
      glowLine(yc, col, pulse);
      ctx.restore();
    }
  };

  // ---------- Objekte ----------
  function block(x, y, w, h, col, pulse, camX) {
    const U = R.U, sx = R.sx(x, camX), sy = R.sy(y + h), pw = w * U, ph = h * U;
    if (R.glow) {
      ctx.fillStyle = R.rgb(col.accent, 0.18 + 0.15 * pulse);
      ctx.fillRect(sx - U * 0.12, sy - U * 0.12, pw + U * 0.24, ph + U * 0.24);
    }
    ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, pw, ph);
    // Kacheln innen
    const i0 = Math.max(0, Math.floor(camX - x - 1)), i1 = Math.min(w, Math.ceil(camX - x + R.W / U + 1));
    for (let i = i0; i < i1; i++) for (let j = 0; j < Math.ceil(h); j++) {
      const ch = Math.min(1, h - j);
      const cx = sx + i * U, cy = sy + j * U;
      const g = ctx.createLinearGradient(cx, cy, cx, cy + ch * U);
      g.addColorStop(0, R.rgb(R.mix(col.bg, BLACK, 0.55), 0.9)); g.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = g; ctx.fillRect(cx + U * 0.1, cy + U * 0.1, U * 0.8, Math.max(0, ch * U - U * 0.2));
      ctx.strokeStyle = R.rgb(WHITE, 0.22); ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + U * 0.1, cy + U * 0.1, U * 0.8, Math.max(0, ch * U - U * 0.2));
    }
    ctx.strokeStyle = R.rgb(R.mix(WHITE, col.accent, 0.15 - 0.15 * pulse)); ctx.lineWidth = Math.max(2, U * 0.06);
    ctx.strokeRect(sx + 1, sy + 1, pw - 2, ph - 2);
  }

  function decoBlock(x, y, w, h, col, camX) {
    const U = R.U, sx = R.sx(x, camX), sy = R.sy(y + h);
    const g = ctx.createLinearGradient(0, sy, 0, sy + h * U);
    g.addColorStop(0, R.rgb(R.mix(col.bg, BLACK, 0.5), 0.55)); g.addColorStop(1, R.rgb(R.mix(col.bg, BLACK, 0.5), 0.05));
    ctx.fillStyle = g; ctx.fillRect(sx, sy, w * U, h * U);
    ctx.strokeStyle = R.rgb(WHITE, 0.25); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy + h * U); ctx.lineTo(sx, sy); ctx.lineTo(sx + w * U, sy); ctx.lineTo(sx + w * U, sy + h * U); ctx.stroke();
  }

  function spike(x, y, down, col, pulse, camX) {
    const U = R.U, sx = R.sx(x, camX);
    const base = down ? R.sy(y + 1) : R.sy(y), tip = down ? R.sy(y + 0.06) : R.sy(y + 0.94);
    ctx.beginPath();
    ctx.moveTo(sx + U * 0.03, base); ctx.lineTo(sx + U * 0.5, tip); ctx.lineTo(sx + U * 0.97, base); ctx.closePath();
    if (R.glow) { ctx.strokeStyle = R.rgb(col.accent, 0.3 + 0.25 * pulse); ctx.lineWidth = U * 0.2; ctx.lineJoin = 'round'; ctx.stroke(); }
    const g = ctx.createLinearGradient(0, tip, 0, base);
    g.addColorStop(0, '#000'); g.addColorStop(1, R.rgb(R.mix(col.bg, BLACK, 0.6)));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, U * 0.06); ctx.lineJoin = 'miter'; ctx.stroke();
  }

  // Kreissäge: dreht sich, schwarz mit weißem Rand
  function saw(o, col, pulse, t, camX) {
    const U = R.U, cx = R.sx(o.cx, camX), cy = R.sy(o.cy), r = o.r * U, n = Math.max(8, Math.round(o.r * 12));
    if (R.glow) glowCircle(cx, cy, r * 1.5, col.accent, 0.3 + 0.25 * pulse);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * 7);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = i * Math.PI / n, rr = i % 2 ? r * 0.78 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, U * 0.05); ctx.stroke();
    ctx.strokeStyle = R.rgb(col.accent, 0.8); ctx.lineWidth = U * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.15, 0, 7); ctx.fill();
    ctx.restore();
  }

  function glowCircle(cx, cy, r, c, a) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, R.rgb(c, a)); g.addColorStop(1, R.rgb(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  }

  function orb(o, c, pulse, t, used, camX) {
    const U = R.U, cx = R.sx(o.x + 0.5, camX), cy = R.sy(o.y + 0.5);
    const a = used ? 0.35 : 1;
    if (R.glow) glowCircle(cx, cy, U * 1.1, c, 0.35 * a);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2.5);
    ctx.strokeStyle = R.rgb(WHITE, 0.8 * a); ctx.lineWidth = U * 0.06;
    ctx.setLineDash([U * 0.22, U * 0.14]);
    ctx.beginPath(); ctx.arc(0, 0, U * (0.5 + 0.06 * pulse), 0, 7); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle = R.rgb(c, a); ctx.beginPath(); ctx.arc(cx, cy, U * 0.32, 0, 7); ctx.fill();
    ctx.fillStyle = R.rgb(WHITE, 0.7 * a); ctx.beginPath(); ctx.arc(cx - U * 0.1, cy - U * 0.1, U * 0.1, 0, 7); ctx.fill();
  }

  function pad(o, pulse, t, camX) {
    const U = R.U, cx = R.sx(o.x + 0.5, camX), by = R.sy(o.y);
    if (R.glow) glowCircle(cx, by - U * 0.1, U * 0.9, YELLOW, 0.4);
    ctx.fillStyle = R.rgb(YELLOW);
    ctx.beginPath(); ctx.ellipse(cx, by, U * 0.45, U * (0.22 + 0.04 * pulse), 0, Math.PI, 0); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const p = (t * 1.6 + k / 3) % 1;
      ctx.fillStyle = R.rgb(YELLOW, 1 - p);
      ctx.fillRect(cx + (k - 1) * U * 0.25 - 2, by - p * U * 0.9, 4, 4);
    }
  }

  function portal(o, t, camX) {
    const U = R.U, c = PORTAL[o.t], cx = R.sx(o.x + 0.5, camX), cy = R.sy(o.y + 1.5);
    if (R.glow) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 1.8);
      g.addColorStop(0, R.rgb(c, 0.45)); g.addColorStop(1, R.rgb(c, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - U * 2, cy - U * 2, U * 4, U * 4);
    }
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = R.rgb(k ? R.mix(c, WHITE, 0.5) : c, k ? 0.5 : 1);
      ctx.lineWidth = k ? U * 0.05 : U * 0.16;
      ctx.beginPath();
      ctx.ellipse(cx, cy, U * (0.42 - k * 0.1) * (1 + 0.08 * Math.sin(t * 6 + k)), U * (1.5 - k * 0.18), 0, 0, 7);
      ctx.stroke();
    }
    // Symbol
    ctx.fillStyle = R.rgb(WHITE, 0.9);
    ctx.font = `${U * 0.45}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sym = { [T.SHIP]: '✈', [T.CUBE]: '■', [T.GUP]: '▲', [T.GDOWN]: '▼', [T.WAVE]: '➤' }[o.t];
    ctx.fillText(sym, cx, cy);
  }

  function coin(o, t, camX) {
    const U = R.U, cx = R.sx(o.x + 0.5, camX), cy = R.sy(o.y + 0.5) + Math.sin(t * 3) * U * 0.06;
    if (R.glow) glowCircle(cx, cy, U * 1.0, GOLD, 0.45);
    const sc = Math.abs(Math.cos(t * 2.2)) * 0.8 + 0.2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, 1);
    ctx.fillStyle = R.rgb(R.mix(GOLD, BLACK, 0.3)); ctx.beginPath(); ctx.arc(0, 0, U * 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = R.rgb(GOLD); ctx.beginPath(); ctx.arc(0, 0, U * 0.32, 0, 7); ctx.fill();
    ctx.fillStyle = R.rgb(R.mix(GOLD, WHITE, 0.6));
    ctx.font = `bold ${U * 0.4}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, U * 0.02);
    ctx.restore();
  }

  R.endGate = function (L, col, t, camX) {
    const U = R.U, x = R.sx(L.length, camX);
    if (x > R.W + U * 3) return;
    const g = ctx.createLinearGradient(x - U * 3, 0, x + U, 0);
    g.addColorStop(0, R.rgb(WHITE, 0)); g.addColorStop(0.75, R.rgb(R.mix(col.accent, WHITE, 0.6), 0.35)); g.addColorStop(1, R.rgb(WHITE, 0.9));
    ctx.fillStyle = g; ctx.fillRect(x - U * 3, 0, U * 4, R.groundY);
    ctx.fillStyle = R.rgb(WHITE, 0.15); ctx.fillRect(x + U, 0, R.W, R.groundY);
    for (let k = 0; k < 12; k++) {
      const p = (t * 0.7 + k / 12) % 1;
      ctx.fillStyle = R.rgb(WHITE, 1 - p);
      ctx.fillRect(x - p * U * 3, R.groundY * hash(k, 5), U * 0.15, U * 0.15);
    }
  };

  R.objects = function (L, s, col, pulse, t, camX) {
    const c0 = Math.floor(camX) - 2, c1 = Math.ceil(camX + R.W / R.U) + 2;
    const drawn = new Set();
    const used = s ? s.used : [];
    // erst Blöcke, dann alles andere obendrauf
    for (let pass = 0; pass < 2; pass++) {
      for (let c = Math.max(0, c0); c <= c1; c++) {
        const bk = L.buckets[c]; if (!bk) continue;
        for (const o of bk) {
          if (drawn.has(o.id) || (pass === 0) !== (o.solid || o.t === T.DECO)) continue;
          drawn.add(o.id);
          switch (o.t) {
            case T.BLOCK: case T.SLAB: block(o.x, o.y, o.w, o.h, col, pulse, camX); break;
            case T.DECO: decoBlock(o.x, o.y, o.w, o.h, col, camX); break;
            case T.SPIKE: spike(o.x, o.y, false, col, pulse, camX); break;
            case T.CSPIKE: spike(o.x, o.y, true, col, pulse, camX); break;
            case T.ORB: orb(o, YELLOW, pulse, t, used.indexOf(o.id) >= 0, camX); break;
            case T.BORB: orb(o, BLUE, pulse, t, used.indexOf(o.id) >= 0, camX); break;
            case T.PAD: pad(o, pulse, t, camX); break;
            case T.SAW: saw(o, col, pulse, t, camX); break;
            case T.COIN: if (used.indexOf(o.id) < 0) coin(o, t, camX); break;
            default: if (PORTAL[o.t]) portal(o, t, camX);
          }
        }
      }
    }
  };

  // ---------- Spielfigur ----------
  R.ICONS = ['Diamant', 'Visier', 'Kreuz', 'Smiley', 'Blitz', 'Raster', 'Ring', 'Pfeil'];

  R.icon = function (c2d, cx, cy, size, rot, id, c1, c2) {
    const g = c2d, s = size, h = s / 2;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    g.fillStyle = c1; g.strokeStyle = '#000'; g.lineWidth = s * 0.08; g.lineJoin = 'miter';
    g.fillRect(-h, -h, s, s); g.strokeRect(-h, -h, s, s);
    g.fillStyle = c2; g.lineWidth = s * 0.06;
    const box = (x, y, w, hh) => { g.fillRect(x, y, w, hh); g.strokeRect(x, y, w, hh); };
    switch (id) {
      case 0: // Diamant
        box(-s * 0.28, -s * 0.28, s * 0.56, s * 0.56);
        g.fillStyle = '#000'; g.beginPath(); g.moveTo(0, -s * 0.16); g.lineTo(s * 0.16, 0); g.lineTo(0, s * 0.16); g.lineTo(-s * 0.16, 0); g.fill();
        break;
      case 1: // Visier
        box(-s * 0.36, -s * 0.2, s * 0.72, s * 0.24);
        g.fillStyle = '#000'; g.fillRect(-s * 0.26, -s * 0.12, s * 0.52, s * 0.07);
        box(-s * 0.2, s * 0.18, s * 0.4, s * 0.12);
        break;
      case 2: // Kreuz
        g.save(); g.rotate(Math.PI / 4);
        box(-s * 0.08, -s * 0.42, s * 0.16, s * 0.84); box(-s * 0.42, -s * 0.08, s * 0.84, s * 0.16);
        g.restore();
        break;
      case 3: // Smiley
        box(-s * 0.26, -s * 0.24, s * 0.14, s * 0.18); box(s * 0.12, -s * 0.24, s * 0.14, s * 0.18);
        g.beginPath(); g.lineWidth = s * 0.1; g.strokeStyle = c2; g.arc(0, s * 0.02, s * 0.24, 0.3, Math.PI - 0.3); g.stroke();
        break;
      case 4: // Blitz
        g.beginPath(); g.moveTo(s * 0.08, -s * 0.4); g.lineTo(-s * 0.24, s * 0.04); g.lineTo(-s * 0.02, s * 0.04);
        g.lineTo(-s * 0.1, s * 0.4); g.lineTo(s * 0.24, -s * 0.06); g.lineTo(s * 0.02, -s * 0.06); g.closePath(); g.fill(); g.stroke();
        break;
      case 5: // Raster
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) box(-s * 0.33 + i * s * 0.36, -s * 0.33 + j * s * 0.36, s * 0.3, s * 0.3);
        break;
      case 6: // Ring
        g.beginPath(); g.arc(0, 0, s * 0.3, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, s * 0.13, 0, 7); g.fill();
        break;
      case 7: // Pfeil
        g.beginPath(); g.moveTo(-s * 0.32, -s * 0.1); g.lineTo(0, -s * 0.1); g.lineTo(0, -s * 0.3); g.lineTo(s * 0.34, 0);
        g.lineTo(0, s * 0.3); g.lineTo(0, s * 0.1); g.lineTo(-s * 0.32, s * 0.1); g.closePath(); g.fill(); g.stroke();
        break;
    }
    g.restore();
  };

  R.ship = function (cx, cy, size, rot, flip, id, c1, c2, t) {
    const s = size;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, flip ? -1 : 1);
    // Flamme
    const fl = 0.5 + Math.random() * 0.4;
    ctx.fillStyle = 'rgba(255,170,40,0.9)';
    ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.05); ctx.lineTo(-s * (0.55 + fl * 0.6), s * 0.18); ctx.lineTo(-s * 0.55, s * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,200,0.9)';
    ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.12); ctx.lineTo(-s * (0.55 + fl * 0.3), s * 0.18); ctx.lineTo(-s * 0.55, s * 0.24); ctx.fill();
    // Kanzel
    R.icon(ctx, -s * 0.05, -s * 0.12, s * 0.5, 0, id, c1, c2);
    // Rumpf
    ctx.fillStyle = c1; ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.07; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.58, s * 0.02); ctx.lineTo(s * 0.2, s * 0.02); ctx.lineTo(s * 0.62, s * 0.2);
    ctx.lineTo(s * 0.2, s * 0.42); ctx.lineTo(-s * 0.58, s * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.14); ctx.lineTo(s * 0.25, s * 0.14); ctx.lineTo(s * 0.42, s * 0.21);
    ctx.lineTo(s * 0.25, s * 0.28); ctx.lineTo(-s * 0.45, s * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  // Wave: Pfeil-Figur
  R.wave = function (cx, cy, size, rot, c1, c2) {
    const s = size;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.fillStyle = c1; ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.08; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(s * 0.5, 0); ctx.lineTo(-s * 0.4, -s * 0.38); ctx.lineTo(-s * 0.18, 0); ctx.lineTo(-s * 0.4, s * 0.38); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(s * 0.22, 0); ctx.lineTo(-s * 0.2, -s * 0.16); ctx.lineTo(-s * 0.08, 0); ctx.lineTo(-s * 0.2, s * 0.16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  // Wave-Spur: harte Zickzack-Linie
  R.waveTrail = function (pts, c1, c2, camX) {
    if (pts.length < 2) return;
    const line = (w, col, a) => {
      ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = w; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      ctx.beginPath();
      pts.forEach((p, i) => { const x = R.sx(p[0], camX), y = R.sy(p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    if (R.glow) line(R.U * 0.55, R.rgb(c2), 0.25);
    line(R.U * 0.3, '#000', 1);
    line(R.U * 0.2, R.rgb(c2), 1);
    line(R.U * 0.07, '#fff', 0.8);
  };

  R.trail = function (pts, c, width, camX) {
    if (pts.length < 2) return;
    for (let i = 1; i < pts.length; i++) {
      const a = i / pts.length;
      ctx.strokeStyle = R.rgb(c, a * 0.55);
      ctx.lineWidth = width * R.U * a;
      ctx.beginPath();
      ctx.moveTo(R.sx(pts[i - 1][0], camX), R.sy(pts[i - 1][1]));
      ctx.lineTo(R.sx(pts[i][0], camX), R.sy(pts[i][1]));
      ctx.stroke();
    }
  };

  // ---------- Partikel ----------
  R.burst = function (x, y, n, colors, speed, size, life, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      R.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5),
        max: life, size: size * (0.5 + Math.random()), c: colors[i % colors.length], g: grav || 0
      });
    }
  };
  R.ring = function (x, y, c, max, life) { R.rings.push({ x, y, c, r: 0, max, life, t: 0 }); };

  R.updateFx = function (dt) {
    for (const p of R.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= p.g * dt; p.life -= dt; }
    R.particles = R.particles.filter(p => p.life > 0);
    for (const r of R.rings) r.t += dt;
    R.rings = R.rings.filter(r => r.t < r.life);
    if (R.shake > 0) R.shake = Math.max(0, R.shake - dt);
  };

  R.drawFx = function (camX) {
    for (const p of R.particles) {
      ctx.fillStyle = R.rgb(p.c, Math.min(1, p.life / p.max * 1.5));
      const sz = p.size * R.U;
      ctx.fillRect(R.sx(p.x, camX) - sz / 2, R.sy(p.y) - sz / 2, sz, sz);
    }
    for (const r of R.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = R.rgb(r.c, 1 - k); ctx.lineWidth = R.U * 0.12 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(R.sx(r.x, camX), R.sy(r.y), r.max * R.U * Math.sqrt(k), 0, 7); ctx.stroke();
    }
  };

  R.FONT = "'Lilita One', 'Arial Black', sans-serif";
  // Schrift mit schwarzem Rand; gold = Farbverlauf wie bei den Titeln im Original
  R.text = function (str, x, y, size, color, align, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.font = `${size}px ${R.FONT}`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y + size * 0.06);
    ctx.strokeText(str, x, y);
    if (color === 'gold') {
      const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      g.addColorStop(0, '#fffbc4'); g.addColorStop(0.45, '#ffd21e'); g.addColorStop(1, '#ff8a00');
      ctx.fillStyle = g;
    } else ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  };
  window.SDRender = R;
})();
