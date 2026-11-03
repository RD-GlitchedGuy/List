// Runde Minikarte, dreht sich mit der Kamera
import { $ } from './util.js';
import { P, cam, mode } from './state.js';
import { bldg, walks, parkRect, LAND, MAPB, pondC, funken, props, mapRects } from './city.js';
import { rings, race } from './race.js';
import { nav } from './missions.js';
import { remotes } from './net.js';
import { trains } from './trains.js';

const S = .3;                       // Pixel pro Meter auf der Grundkarte
const W = Math.ceil((MAPB.x1 - MAPB.x0) * S), H = Math.ceil((MAPB.z1 - MAPB.z0) * S);
const base = document.createElement('canvas'); base.width = W; base.height = H;
const toPx = (x, z) => [(x - MAPB.x0) * S, (z - MAPB.z0) * S];
{
  const g = base.getContext('2d');
  g.fillStyle = '#1f3644'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b2e36'; { const [a, b] = toPx(LAND.x0, LAND.z0); g.fillRect(a, b, (LAND.x1 - LAND.x0) * S, (LAND.z1 - LAND.z0) * S); }
  for (const p of props) { g.fillStyle = '#' + p[6].toString(16).padStart(6, '0'); const [a, b] = toPx(p[0], p[2]); g.fillRect(a, b, Math.max(1, (p[3] - p[0]) * S), Math.max(1, (p[5] - p[2]) * S)); }
  for (const [x0, z0, x1, z1, c] of mapRects) { g.fillStyle = c; const [a, b] = toPx(x0, z0); g.fillRect(a, b, (x1 - x0) * S, (z1 - z0) * S); }
  g.fillStyle = '#4a4d55'; for (const [x0, z0, x1, z1] of walks) { const [a, b] = toPx(x0, z0); g.fillRect(a, b, (x1 - x0) * S, (z1 - z0) * S); }
  for (const { b } of bldg) {
    const t = Math.min(1, b.y1 / 260), l = 52 + t * 38;
    g.fillStyle = `hsl(215 12% ${l}%)`; const [a, c] = toPx(b.x0, b.z0); g.fillRect(a, c, (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
  }
  g.fillStyle = '#3f6b33'; { const [a, b] = toPx(parkRect.x0, parkRect.z0); g.fillRect(a, b, (parkRect.x1 - parkRect.x0) * S, (parkRect.z1 - parkRect.z0) * S); }
  g.fillStyle = '#2a4558'; { const [a, b] = toPx(pondC.x, pondC.z); g.beginPath(); g.ellipse(a, b, 40 * S, 64 * S, 0, 0, Math.PI * 2); g.fill(); }
}
const cv = $('mini'), ctx = cv.getContext('2d');
const VIEW = 260;                    // sichtbarer Radius in Metern

export function updateMinimap() {
  const w = cv.width, h = cv.height, k = w / 2 / VIEW;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1f3644'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  // so drehen, dass die Blickrichtung nach oben zeigt
  ctx.rotate(-Math.PI / 2 - Math.atan2(Math.cos(cam.yaw), Math.sin(cam.yaw)));
  ctx.scale(k / S, k / S);
  const [px, pz] = toPx(P.pos.x, P.pos.z);
  ctx.drawImage(base, -px, -pz);
  const dot = (x, z, r, c) => { const [a, b] = toPx(x, z); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(a - px, b - pz, r / k * S, 0, Math.PI * 2); ctx.fill(); };
  if (mode.name === 'race') {
    rings.forEach((r, i) => { if (i >= race.idx) dot(r.p.x, r.p.z, i === race.idx ? 9 : 5, i === race.idx ? '#ff7a1a' : 'rgba(158,200,255,.8)'); });
  } else if (mode.name === 'free') { for (const f of funken) if (!f.got) dot(f.p.x, f.p.z, 6, '#ffb070'); }
  else if (nav.p) dot(nav.p.x, nav.p.z, 9, '#40d0ff');
  for (const T of trains) { const [a, b] = toPx(T.x - 32, T.z), [c] = toPx(T.x + 32, T.z); ctx.fillStyle = '#e4e7ea'; ctx.fillRect(a - px, b - pz - 1.2, c - a, 2.4); }
  for (const r of remotes.values()) dot(r.S.pos.x, r.S.pos.z, 7, '#7fffb0');
  ctx.restore();
  // Spielerpfeil in der Mitte
  ctx.save(); ctx.translate(w / 2, h / 2);
  ctx.rotate(-(P.faceYaw - cam.yaw));
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 12); ctx.lineTo(0, 6); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
