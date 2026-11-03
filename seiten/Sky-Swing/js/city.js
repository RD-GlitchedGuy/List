// Die Stadt: Raster, Gebäude, Details, Park, Verkehr, Sky-Funken und Kollisionsabfragen
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, UP, rand, rr } from './util.js';
import { scene, envU } from './engine.js';

export const AVE_W = 24, ST_W = 16, BX = 86, BZ = 40, NX = 9, NZ = 34;
const PX = BX + AVE_W, PZ = BZ + ST_W;
const X0 = -NX * PX / 2, Z0 = -NZ * PZ / 2;
export const aveX = i => X0 + i * PX, strZ = j => Z0 + j * PZ;
export const LAND = { x0: aveX(0) - AVE_W / 2 - 24, x1: aveX(NX) + AVE_W / 2 + 24, z0: strZ(0) - ST_W / 2 - 24, z1: strZ(NZ) + ST_W / 2 + 24 };
export const inLand = (x, z) => x > LAND.x0 && x < LAND.x1 && z > LAND.z0 && z < LAND.z1;
const PARK = { ix0: 4, ix1: 5, iz0: 18, iz1: 25 };
const inPark = (ix, iz) => ix >= PARK.ix0 && ix <= PARK.ix1 && iz >= PARK.iz0 && iz <= PARK.iz1;
export const parkRect = { x0: aveX(4) + AVE_W / 2, x1: aveX(6) - AVE_W / 2, z0: strZ(18) + ST_W / 2, z1: strZ(26) - ST_W / 2 };

export const boxes = [];          // alle Kollisionsboxen
export const bldg = [];           // sichtbare Gebäudeteile {b, col}
export const walks = [];
const towers = [], spires = [], units = [], masts = [];
export const roofTops = [];
function addBox(x0, y0, z0, x1, y1, z1, col) { const b = { x0, y0, z0, x1, y1, z1 }; boxes.push(b); if (col) bldg.push({ b, col }); return b; }

/* ---------- Gebäude erzeugen ---------- */
const PAL_LOW = [0x8c5a46, 0x9b4f3a, 0xb9a58a, 0x7e6a5c, 0xc7b79c, 0x6f5848, 0xa38b72, 0x8a7f74];
const PAL_HIGH = [0x7f8a96, 0x5f7186, 0xb8b2a6, 0x8d9aa8, 0x4f6077, 0xc9c1b0, 0x6b7480];
export const MID_Z = strZ(13);
const DOWN_Z = strZ(3);
const density = z => { const g = (d, s) => Math.exp(-(d * d) / (2 * s * s)); return 0.22 + 0.78 * Math.max(g(z - MID_Z, 240), g(z - DOWN_Z, 170)); };
function splits(a, b, n) { const w = []; let s = 0; for (let i = 0; i < n; i++) { const v = 0.6 + rand(); w.push(v); s += v; } const o = [a]; let acc = a; for (let i = 0; i < n - 1; i++) { acc += (b - a) * w[i] / s; o.push(acc); } o.push(b); return o; }
function roofStuff(x0, z0, x1, z1, h) { // Klimageräte und Antennen auf dem Dach
  if ((x1 - x0) * (z1 - z0) < 120) return;
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const w = rr(1.8, 3.4), d = rr(1.4, 2.6), hh = rr(1, 1.9), x = rr(x0 + 3, x1 - 3 - w), z = rr(z0 + 3, z1 - 3 - d);
    if (x1 - x0 < 8 + w || z1 - z0 < 8 + d) continue;
    units.push([x, h, z, x + w, h + hh, z + d]); addBox(x, h, z, x + w, h + hh, z + d);
  }
  if (rand() < .25) masts.push([rr(x0 + 2, x1 - 2), h, rr(z0 + 2, z1 - 2), rr(5, 13)]);
}
/* ---------- Begehbare Dächer: Garten, Pool, Helipad, Werbetafel ---------- */
export const roofFeat = [];       // für die Darstellung in roofs.js
export const pools = [];          // {x0,z0,x1,z1,floor,water}
const RP = [];                    // Dach-Teile als farbige Boxen (werden mit den props gezeichnet)
const rbox = (x0, y0, z0, x1, y1, z1, c, solid = true) => { RP.push([x0, y0, z0, x1, y1, z1, c]); if (solid) addBox(x0, y0, z0, x1, y1, z1); };
function roofFeature(x0, z0, x1, z1, h, tall) {
  const w = x1 - x0, d = z1 - z0; if (w < 16 || d < 16) return false;
  const r = rand();
  if (r > .2) return false;
  // Welche Dachkanten liegen an einer Straße? (nur dort darf eine Werbetafel hin, sonst schaut sie aufs Nachbarhaus)
  const ix = Math.floor((x0 + 1 - X0) / PX), iz = Math.floor((z0 + 1 - Z0) / PZ);
  const ext = { x0: x0 - (aveX(ix) + AVE_W / 2) < 4, x1: (aveX(ix + 1) - AVE_W / 2) - x1 < 4, z0: z0 - (strZ(iz) + ST_W / 2) < 4, z1: (strZ(iz + 1) - ST_W / 2) - z1 < 4 };
  const canBoard = !tall && (ext.x0 || ext.x1 || ext.z0 || ext.z1);
  const kind = tall && w >= 20 && d >= 20 && r < .08 ? 'heli' : canBoard && r < .05 ? 'board' : r < .13 ? 'garden' : 'pool';
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = { kind, x0, z0, x1, z1, h, cx, cz };
  if (kind === 'garden') {
    const m = 1.6; rbox(x0 + m, h, z0 + m, x1 - m, h + .22, z1 - m, 0x4f7a3a);                 // Rasen
    rbox(cx - .9, h + .22, z0 + m, cx + .9, h + .26, z1 - m, 0xb9b2a4);                          // Weg
    f.trees = []; f.bushes = []; f.lights = [];
    for (let i = 0; i < 4 + Math.floor(rand() * 4); i++) {                                       // Pflanzkästen mit Büschen
      const along = rand() < .5, px = along ? rr(x0 + 3, x1 - 5) : (rand() < .5 ? x0 + 2.2 : x1 - 3.4), pz = along ? (rand() < .5 ? z0 + 2.2 : z1 - 3.4) : rr(z0 + 3, z1 - 5);
      const pw = along ? 2.4 : 1.2, pd = along ? 1.2 : 2.4;
      rbox(px, h + .22, pz, px + pw, h + 1.0, pz + pd, 0x6b4a2f);
      f.bushes.push([px + pw / 2, h + 1.2, pz + pd / 2, along ? 1.3 : .8, along ? .8 : 1.3]);
    }
    for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) {                                       // kleine Bäume, Mitte bleibt frei
      let tx, tz, k = 0; do { tx = rr(x0 + 3.5, x1 - 3.5); tz = rr(z0 + 3.5, z1 - 3.5); } while (Math.hypot(tx - cx, tz - cz) < 4 && ++k < 20);
      const th = rr(3.5, 5.5); f.trees.push([tx, h + .22, tz, th, rr(1.4, 2.1)]); addBox(tx - .25, h, tz - .25, tx + .25, h + th, tz + .25);
    }
    for (let i = 0; i < 2; i++) { const bz = i ? z1 - m - 1.4 : z0 + m + .9; rbox(cx + 1.4, h + .22, bz, cx + 3.4, h + .7, bz + .55, 0x7a5638); }   // Bänke
    for (let a = 0; a < 1; a += 1 / 14) {                                                        // Lichterkette am Rand
      const per = 2 * (w + d) - 8 * m, s0 = a * per; let px, pz; const W = w - 2 * m, D = d - 2 * m;
      if (s0 < W) { px = x0 + m + s0; pz = z0 + m; } else if (s0 < W + D) { px = x1 - m; pz = z0 + m + s0 - W; } else if (s0 < 2 * W + D) { px = x1 - m - (s0 - W - D); pz = z1 - m; } else { px = x0 + m; pz = z1 - m - (s0 - 2 * W - D); }
      f.lights.push([px, h + 2.3, pz]);
    }
  } else if (kind === 'pool') {
    const px0 = x0 + 4, px1 = x1 - 4, pz0 = z0 + 4.5, pz1 = Math.min(z1 - 4, pz0 + Math.max(8, (z1 - z0) * .45));
    rbox(x0 + 1.2, h, z0 + 1.2, x1 - 1.2, h + .08, z1 - 1.2, 0xc9b38f);                          // Holzdeck
    rbox(px0 - .5, h + .08, pz0 - .5, px1 + .5, h + .55, pz0, 0xe8e4dc); rbox(px0 - .5, h + .08, pz1, px1 + .5, h + .55, pz1 + .5, 0xe8e4dc);
    rbox(px0 - .5, h + .08, pz0, px0, h + .55, pz1, 0xe8e4dc); rbox(px1, h + .08, pz0, px1 + .5, h + .55, pz1, 0xe8e4dc);   // Beckenrand
    pools.push({ x0: px0, z0: pz0, x1: px1, z1: pz1, floor: h + .08, water: h + .5 });
    f.pool = [px0, pz0, px1, pz1];
    for (let i = 0; i < 4; i++) { const lx = px0 + 1 + i * (px1 - px0 - 2) / 3; if (pz1 + 3.4 < z1 - 1) rbox(lx - .4, h + .08, pz1 + 1.4, lx + .4, h + .45, pz1 + 3.3, [0xffffff, 0xff7a1a, 0x3cc8ff, 0xffffff][i]); }  // Liegen
    for (const sx of [x0 + 2.5, x1 - 2.5]) rbox(sx - .1, h + .08, z1 - 3, sx + .1, h + 2.6, z1 - 2.8, 0xdddddd, false);   // Schirmstangen
    f.umbrellas = [[x0 + 2.5, h + 2.6, z1 - 2.9], [x1 - 2.5, h + 2.6, z1 - 2.9]];
  } else if (kind === 'heli') {
    const r0 = Math.min(w, d) / 2 - 2; rbox(cx - r0, h, cz - r0, cx + r0, h + .2, cz + r0, 0x3a3d42);
    f.r = r0; f.lights = []; for (let a = 0; a < 16; a++) f.lights.push([cx + Math.cos(a / 16 * 6.283) * (r0 - .6), h + .3, cz + Math.sin(a / 16 * 6.283) * (r0 - .6)]);
  } else if (kind === 'board') {
    // Tafel an eine Straßenkante stellen, die Werbung schaut nach außen
    const opts = [ext.z0 && ['x', -1], ext.z1 && ['x', 1], ext.x0 && ['z', -1], ext.x1 && ['z', 1]].filter(Boolean);
    const [ax, edge] = opts[Math.floor(rand() * opts.length)], alongX = ax === 'x';
    const L = Math.min(16, (alongX ? w : d) - 4), H0 = h + 6.5, H1 = h + 13;
    if (alongX) {
      const z = edge < 0 ? z0 + 2 : z1 - 2.6;
      for (const px of [cx - L / 2 + 1, cx, cx + L / 2 - 1]) rbox(px - .2, h, z, px + .2, H0, z + .6, 0x4a4f56);
      rbox(cx - L / 2, H0 - .3, z - (edge < 0 ? 0 : 1.2), cx + L / 2, H0 - .15, z + .6 + (edge < 0 ? 1.2 : 0), 0x4a4f56);   // Laufsteg
      rbox(cx - L / 2, H0, z, cx + L / 2, H1, z + .6, 0x1d1f24);
      f.face = { x: cx, y: (H0 + H1) / 2, z: edge < 0 ? z - .02 : z + .62, rot: edge < 0 ? Math.PI : 0, w: L - .4, hgt: H1 - H0 - .4 };
    } else {
      const x = edge < 0 ? x0 + 2 : x1 - 2.6;
      for (const pz of [cz - L / 2 + 1, cz, cz + L / 2 - 1]) rbox(x, h, pz - .2, x + .6, H0, pz + .2, 0x4a4f56);
      rbox(x - (edge < 0 ? 0 : 1.2), H0 - .3, cz - L / 2, x + .6 + (edge < 0 ? 1.2 : 0), H0 - .15, cz + L / 2, 0x4a4f56);
      rbox(x, H0, cz - L / 2, x + .6, H1, cz + L / 2, 0x1d1f24);
      f.face = { x: edge < 0 ? x - .02 : x + .62, y: (H0 + H1) / 2, z: cz, rot: edge < 0 ? -Math.PI / 2 : Math.PI / 2, w: L - .4, hgt: H1 - H0 - .4 };
    }
  }
  roofFeat.push(f); return true;
}
function building(x0, z0, x1, z1, h) {
  const tall = h > 90, pal = tall ? PAL_HIGH : PAL_LOW;
  const col = new THREE.Color(pal[Math.floor(rand() * pal.length)]).offsetHSL(0, rr(-.03, .03), rr(-.05, .05));
  const w = Math.min(x1 - x0, z1 - z0);
  if (tall && rand() < 0.7 && w > 14) { // gestufter Wolkenkratzer
    const h1 = h * rr(.42, .58), h2 = h * rr(.72, .84), i1 = w * .12, i2 = w * .26;
    addBox(x0, 0, z0, x1, h1, z1, col); addBox(x0 + i1, h1, z0 + i1, x1 - i1, h2, z1 - i1, col); addBox(x0 + i2, h2, z0 + i2, x1 - i2, h, z1 - i2, col);
    if (h > 200 && rand() < 0.75) spires.push([(x0 + x1) / 2, h, (z0 + z1) / 2, rr(18, 55)]);
    else if (!roofFeature(x0 + i2, z0 + i2, x1 - i2, z1 - i2, h, true)) roofStuff(x0 + i2, z0 + i2, x1 - i2, z1 - i2, h);
  } else {
    addBox(x0, 0, z0, x1, h, z1, col);
    if (roofFeature(x0, z0, x1, z1, h, tall)) {}
    else if (h < 85 && w > 10 && rand() < 0.3) { const tx = rr(x0 + 3, x1 - 3), tz = rr(z0 + 3, z1 - 3); towers.push([tx, h, tz]); addBox(tx - 2.1, h, tz - 2.1, tx + 2.1, h + 7.6, tz + 2.1); }
    else roofStuff(x0, z0, x1, z1, h);
  }
  roofTops.push([(x0 + x1) / 2, h, (z0 + z1) / 2]);
}
for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
  if (inPark(ix, iz)) continue;
  const bx0 = aveX(ix) + AVE_W / 2, bx1 = aveX(ix + 1) - AVE_W / 2, bz0 = strZ(iz) + ST_W / 2, bz1 = strZ(iz + 1) - ST_W / 2;
  walks.push([bx0, bz0, bx1, bz1]); addBox(bx0, 0, bz0, bx1, 0.22, bz1);
  const f = density((bz0 + bz1) / 2), m = 2.5;
  const xs = splits(bx0 + m, bx1 - m, 2 + Math.floor(rand() * 3));
  const zs = rand() < 0.55 ? [bz0 + m, bz1 - m] : splits(bz0 + m, bz1 - m, 2);
  for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < zs.length - 1; k++) {
    let x0 = xs[i], x1 = xs[i + 1], z0 = zs[k], z1 = zs[k + 1];
    const g = rand() < 0.3 ? rr(1.5, 4) : 0.3;
    if (i > 0) x0 += g / 2; if (i < xs.length - 2) x1 -= g / 2; if (k > 0) z0 += g / 2; if (k < zs.length - 2) z1 -= g / 2;
    let h = 10 + Math.pow(rand(), 1.6) * 150 * f + 18 * f;
    if (rand() < 0.06 * f) h = rr(200, 330);
    building(x0, z0, x1, z1, h);
  }
}
// Park mit Bäumen (Baumkronen sind auch Ankerpunkte)
addBox(parkRect.x0, 0, parkRect.z0, parkRect.x1, 0.25, parkRect.z1);
export const pondC = new V3((parkRect.x0 + parkRect.x1) / 2, 0, (parkRect.z0 + parkRect.z1) / 2);
const trees = [];
for (let i = 0; i < 340; i++) {
  const x = rr(parkRect.x0 + 4, parkRect.x1 - 4), z = rr(parkRect.z0 + 4, parkRect.z1 - 4);
  if (Math.hypot(x - pondC.x, (z - pondC.z) * 0.6) < 46) continue;
  const h = rr(7, 14), r = rr(2.6, 4.4); trees.push([x, z, h, r]);
  addBox(x - r * .75, h - r * .5, z - r * .75, x + r * .75, h + r * .8, z + r * .75);
}

/* ---------- Hängebrücke nach Osten, Ufer drüben, Hafen im Westen ---------- */
export const props = [];          // farbige Boxen mit Kollision [x0,y0,z0,x1,y1,z1,farbe]
const propBox = (x0, y0, z0, x1, y1, z1, c, solid = true) => { props.push([x0, y0, z0, x1, y1, z1, c]); if (solid) addBox(x0, y0, z0, x1, y1, z1); };
const cables = [];                // [ax,ay,az, bx,by,bz, radius]
export const BRIDGE = { z: strZ(10), xs: aveX(NX) + AVE_W / 2 + 2, len: 760, deck: 32, ramp: 190, hw: 12 };
// Höhe der Fahrbahn: steigt vom Ufer sanft bis zu den Pylonen, dazwischen eben, drüben wieder hinunter
export function bridgeY(x) {
  const { xs, len, deck, ramp } = BRIDGE, xe = xs + len;
  if (x <= xs || x >= xe) return 0;
  const u = Math.min(1, (x - xs) / ramp, (xe - x) / ramp);
  return deck * (.5 * u + .5 * u * u * (3 - 2 * u));
}
export const mapRects = [];       // nur für die Minikarte
export const FAR = { av: [], st: [], AW: 20, SW: 14 };
const farCars = [];
{
  const { z, xs, len, deck, ramp, hw } = BRIDGE, xe = xs + len;
  // begehbare Fahrbahn: feine Stufen (1 m) auf den Rampen, ein Stück in der Mitte
  for (let x = xs; x < xs + ramp; x += 1) { const y = bridgeY(x + .5); addBox(x, y - 2.5, z - hw, x + 1, y, z + hw); }
  for (let x = xe - ramp; x < xe; x += 1) { const y = bridgeY(x + .5); addBox(x, y - 2.5, z - hw, x + 1, y, z + hw); }
  addBox(xs + ramp, deck - 2.5, z - hw, xe - ramp, deck, z + hw);
  mapRects.push([xs, z - hw, xe, z + hw, '#4a4c52']);
  // Stützen unter den Rampen
  for (const side of [0, 1]) for (let k = 1; k * 36 < ramp; k++) {
    const x = side ? xe - k * 36 : xs + k * 36, y = bridgeY(x); if (y < 5) continue;
    for (const sz of [-8, 8]) propBox(x - 1.2, -2, z + sz - 1.2, x + 1.2, y - 2.5, z + sz + 1.2, 0x8a8278);
    propBox(x - 1, y - 4, z - hw, x + 1, y - 2.5, z + hw, 0x8a8278);
  }
  const py = [xs + ramp, xe - ramp], top = 150;
  for (const px of py) {
    for (const sz of [-1, 1]) propBox(px - 3, -2, z + sz * 15 - 3, px + 3, top, z + sz * 15 + 3, 0xc0412e);
    for (const y of [deck - 8, 95, top - 8]) propBox(px - 2.5, y, z - 15, px + 2.5, y + 4, z + 15, 0xc0412e);
  }
  // Seilverankerung an beiden Ufern
  for (const ax of [xs - 6, xe]) for (const sz of [-13.5, 13.5]) propBox(ax, 0, z + sz - 2, ax + 6, 5, z + sz + 2, 0x8a8278);
  // Tragseile: von der Verankerung zu den Pylonspitzen, dazwischen durchhängend; Hänger bis zur Fahrbahn
  const cy = x => {
    if (x <= py[0]) return 4 + (top - 4) * Math.max(0, (x - xs) / (py[0] - xs)) ** 1.5;
    if (x >= py[1]) return 4 + (top - 4) * Math.max(0, (xe - x) / (xe - py[1])) ** 1.5;
    const u = (x - py[0]) / (py[1] - py[0]); return 46 + (top - 46) * (2 * u - 1) ** 2;
  };
  for (const sz of [-13.5, 13.5]) {
    let px = xs, pyv = cy(xs);
    for (let x = xs + 10; x <= xe; x += 10) { const y = cy(x), dy = bridgeY(x); cables.push([px, pyv, z + sz, x, y, z + sz, .45]); if (y - dy > 3) cables.push([x, dy, z + sz, x, y, z + sz, .09]); px = x; pyv = y; }
  }

  /* ---------- Ufer gegenüber: zweite Stadt mit Straßenraster ---------- */
  const fx0 = xe - 20, fx1 = xe + 620;
  propBox(fx0, -4, LAND.z0, fx1, 0, LAND.z1, 0x3a3b40);
  const { AW, SW } = FAR, BX2 = 78, BZ2 = 44, PX2 = AW + BX2, PZ2 = SW + BZ2;
  for (let x = xe + 18; x < fx1 - 20; x += PX2) FAR.av.push(x);
  for (let k = -30; k <= 30; k++) { const zz = z + k * PZ2; if (zz > LAND.z0 + 18 && zz < LAND.z1 - 18) FAR.st.push(zz); }
  Object.assign(FAR, { x0: FAR.av[0], x1: FAR.av[FAR.av.length - 1], z0: FAR.st[0], z1: FAR.st[FAR.st.length - 1] });
  const parkBlock = [1, FAR.st.indexOf(z)];   // ein kleiner Platz mit Bäumen direkt am Brückenende
  for (let i = 0; i < FAR.av.length - 1; i++) for (let j = 0; j < FAR.st.length - 1; j++) {
    const bx0 = FAR.av[i] + AW / 2, bx1 = FAR.av[i + 1] - AW / 2, bz0 = FAR.st[j] + SW / 2, bz1 = FAR.st[j + 1] - SW / 2;
    walks.push([bx0, bz0, bx1, bz1]); addBox(bx0, 0, bz0, bx1, .22, bz1);
    if (i === parkBlock[0] && j === parkBlock[1]) {
      propBox(bx0 + 2, .22, bz0 + 2, bx1 - 2, .3, bz1 - 2, 0x55803d);
      for (let k = 0; k < 16; k++) { const tx = rr(bx0 + 5, bx1 - 5), tz = rr(bz0 + 5, bz1 - 5), h = rr(6, 10), r = rr(2.4, 3.6); trees.push([tx, tz, h, r]); addBox(tx - r * .75, h - r * .5, tz - r * .75, tx + r * .75, h + r * .8, tz + r * .75); }
      continue;
    }
    const m = 2.5, xsp = splits(bx0 + m, bx1 - m, 2 + Math.floor(rand() * 2)), zsp = rand() < .5 ? [bz0 + m, bz1 - m] : splits(bz0 + m, bz1 - m, 2);
    for (let a = 0; a < xsp.length - 1; a++) for (let c = 0; c < zsp.length - 1; c++) {
      let x0 = xsp[a], x1 = xsp[a + 1], z0 = zsp[c], z1 = zsp[c + 1];
      if (a > 0) x0 += .2; if (a < xsp.length - 2) x1 -= .2; if (c > 0) z0 += .2; if (c < zsp.length - 2) z1 -= .2;
      building(x0, z0, x1, z1, rand() < .08 ? rr(65, 95) : 12 + Math.pow(rand(), 1.4) * 48);
    }
  }
  // Verkehr drüben und auf der Brücke
  for (let k = 0; k < 44; k++) {
    const dir = rand() < .5 ? 1 : -1;
    if (rand() < .5) { const a = FAR.av[Math.floor(rand() * FAR.av.length)]; farCars.push({ ax: 'z', lane: a + dir * rr(2.3, 6.5), t: rr(FAR.z0, FAR.z1), a: FAR.z0, b: FAR.z1, dir, sp: rr(8, 14) }); }
    else { const s0 = FAR.st[Math.floor(rand() * FAR.st.length)]; farCars.push({ ax: 'x', lane: s0 - dir * rr(2, 4.5), t: rr(FAR.x0, FAR.x1), a: FAR.x0, b: FAR.x1, dir, sp: rr(8, 13) }); }
  }
  for (let k = 0; k < 18; k++) { const dir = k % 2 ? 1 : -1; farCars.push({ ax: 'x', lane: z - dir * rr(3, 8.5), t: rr(xs, xe), a: xs - 6, b: xe + 6, dir, sp: rr(13, 19), yf: bridgeY }); }
  BRIDGE.shoreX1 = fx1;
}
export const HARBOR = { x: LAND.x0 };
{
  const x1 = LAND.x0, CC = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0xe5e7e9, 0x117a65, 0xa04000];
  for (let k = 0; k < 4; k++) {
    const zc = strZ(4 + k * 7), pz0 = zc - 16, pz1 = zc + 16, px0 = x1 - 170;
    propBox(px0, -3, pz0, x1 + 4, 1.5, pz1, 0x6e6a64);                                // Pier
    for (let x = px0 + 8; x < x1 - 20; x += 13.5) for (let row = 0; row < 3; row++) {     // Containerstapel
      if (rand() < .25) continue;
      const n = 1 + Math.floor(rand() * 4), zz = pz0 + 5 + row * 3.1;
      for (let i = 0; i < n; i++) props.push([x, 1.5 + i * 2.6, zz, x + 12.2, 1.5 + (i + 1) * 2.6 - .05, zz + 2.45, CC[Math.floor(rand() * CC.length)]]);
      addBox(x, 1.5, zz, x + 12.2, 1.5 + n * 2.6, zz + 2.45);
    }
    const cx = px0 + 30 + rand() * 60;                                                    // Containerkran
    for (const sz of [pz0 + 1, pz1 - 3]) propBox(cx, 1.5, sz, cx + 2, 46, sz + 2, 0xe0a526);
    propBox(cx - 2, 46, pz0 + 1, cx + 4, 49, pz1 - 1, 0xe0a526);
    propBox(cx - 55, 49, zc - 2, cx + 14, 52, zc + 2, 0xe0a526);
    if (k < 3) {                                                                           // Schiff neben dem Pier
      const sz0 = pz1 + 6, hx0 = x1 - 160;
      propBox(hx0, -3, sz0, hx0 + 120, 7, sz0 + 20, [0x7b241c, 0x1b2631, 0x145a32][k]);
      propBox(hx0 + 4, 7, sz0 + 2, hx0 + 22, 22, sz0 + 18, 0xecf0f1);
      for (let i = 0; i < 6; i++) { const h = 1 + Math.floor(rand() * 3); props.push([hx0 + 28 + i * 14, 7, sz0 + 3, hx0 + 40 + i * 14, 7 + h * 2.6, sz0 + 17, CC[Math.floor(rand() * CC.length)]]); addBox(hx0 + 28 + i * 14, 7, sz0 + 3, hx0 + 40 + i * 14, 7 + h * 2.6, sz0 + 17); }
    }
  }
}
export const MAPB = { x0: LAND.x0 - 220, x1: BRIDGE.shoreX1, z0: LAND.z0, z1: LAND.z1 };

/* ---------- Hochbahn: zweigleisig über einer Querstraße, zwei Bahnhöfe ---------- */
export const ELEV = { z: strZ(15), x0: LAND.x0 + 14, x1: LAND.x1 - 14, deck: 16, tracks: [-2, 2], stations: [] };
{
  const { z, x0, x1, deck } = ELEV, G = 0x34584a, STEEL = 0x55595f;
  propBox(x0, deck - .8, z - 4.3, x1, deck, z + 4.3, 0x4b4f55);                                      // Fahrbahn
  propBox(x0, deck - 2.2, z - 4.3, x1, deck - .8, z - 3.7, G); propBox(x0, deck - 2.2, z + 3.7, x1, deck - .8, z + 4.3, G);   // Längsträger
  propBox(x0, deck, z - 4.3, x1, deck + .6, z - 4.0, G); propBox(x0, deck, z + 4.0, x1, deck + .6, z + 4.3, G);           // Brüstung
  for (const tz of ELEV.tracks) for (const s of [-.72, .72]) props.push([x0, deck, z + tz + s - .06, x1, deck + .16, z + tz + s + .06, 0xa8aab0]);   // Schienen
  for (let x = x0 + 6; x < x1; x += 30) {                                                            // Stützen, nicht mitten auf den Avenues
    const i = Math.round((x - X0) / PX); if (Math.abs(x - aveX(i)) < AVE_W / 2 + 2) continue;
    propBox(x - .55, 0, z - .55, x + .55, deck - 2.2, z + .55, G);
    propBox(x - .5, deck - 2.9, z - 4.3, x + .5, deck - 2.2, z + 4.3, G);
  }
  for (const sx of [(aveX(2) + aveX(3)) / 2, (aveX(6) + aveX(7)) / 2]) {                              // Bahnhöfe
    const L = 70, a = sx - L / 2, b = sx + L / 2; ELEV.stations.push(sx);
    for (const sz of [-1, 1]) {
      const pz0 = sz < 0 ? z - 7.6 : z + 4.3, pz1 = sz < 0 ? z - 4.3 : z + 7.6;
      propBox(a, deck - .8, pz0, b, deck, pz1, 0x8a8478);                                             // Bahnsteig
      propBox(a, deck, sz < 0 ? pz0 : pz1 - .3, b, deck + 1.1, sz < 0 ? pz0 + .3 : pz1, G);             // Geländer außen
      props.push([a, deck - .01, sz < 0 ? pz1 - .6 : pz0, b, deck + .02, sz < 0 ? pz1 : pz0 + .6, 0xf2c12e]);   // gelbe Kante
      for (let x = a + 4; x < b; x += 12) propBox(x - .15, deck, (pz0 + pz1) / 2 - .15, x + .15, deck + 4, (pz0 + pz1) / 2 + .15, G);
      propBox(a, deck + 4, pz0 - .3, b, deck + 4.3, pz1 + .3, 0x5d6b62);                               // Dach – begehbar
      // Treppe mit Wendepodest: erster Lauf außen neben dem Bahnsteig, zweiter Lauf darunter zurück
      const R = .3, T = .45, n1 = 26, za0 = sz < 0 ? z - 7.6 : z + 6.2, zb0 = sz < 0 ? z - 6.0 : z + 4.6;
      for (let k = 0; k < n1; k++) { const top = deck - k * R, xx = b + k * T; propBox(xx, top - .6, za0, xx + T, top, za0 + 1.4, 0x7d776c); }
      const landY = deck - n1 * R, lx = b + n1 * T;
      propBox(lx, landY - .6, Math.min(za0, zb0), lx + 1.8, landY, Math.max(za0, zb0) + 1.4, 0x7d776c);   // Podest
      for (let k = 1; landY - k * R > 0; k++) { const top = landY - k * R, xx = lx - k * T; propBox(xx, Math.max(0, top - .6), zb0, xx + T, top, zb0 + 1.4, 0x7d776c); }
    }
  }
}

/* ---------- U-Bahn-Eingänge auf den Gehwegen ---------- */
export const subway = [];
{
  const spots = [[1, 6], [3, 12], [2, 20], [6, 9], [7, 15], [8, 27], [3, 29], [0, 15], [5, 4], [6, 31]];
  for (const [i, j] of spots) {
    const x = aveX(i) + AVE_W / 2 + 3.5, zc = strZ(j) + ST_W / 2 + 6;
    if (inPark(i, j)) continue;
    props.push([x - 1.3, .2, zc - 2.2, x + 1.3, .23, zc + 2.2, 0x0b0b0d]);                              // dunkler Abgang
    propBox(x - 1.45, .22, zc - 2.3, x - 1.3, 1.25, zc + 2.3, 0x2e5e3a); propBox(x + 1.3, .22, zc - 2.3, x + 1.45, 1.25, zc + 2.3, 0x2e5e3a);
    propBox(x - 1.45, .22, zc + 2.15, x + 1.45, 1.25, zc + 2.3, 0x2e5e3a);
    for (const sx of [-1.38, 1.38]) propBox(x + sx - .06, .22, zc - 2.32, x + sx + .06, 3.1, zc - 2.2, 0x2e5e3a);
    subway.push([x - 1.38, 3.2, zc - 2.26], [x + 1.38, 3.2, zc - 2.26]);
  }
}
props.push(...RP);

/* ---------- Raster für schnelle Abfragen ---------- */
const CELL = 40, grid = new Map(); let stamp = 1; const stamps = new Uint32Array(boxes.length + 8);
const gkey = (cx, cz) => (cx + 600) * 2000 + (cz + 600);
boxes.forEach((b, i) => { for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) { const k = gkey(cx, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
export function query(x0, z0, x1, z1, out) {
  out.length = 0; stamp++;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
    const a = grid.get(gkey(cx, cz)); if (!a) continue;
    for (const i of a) if (stamps[i] !== stamp) { stamps[i] = stamp; out.push(i); }
  }
  return out;
}
let _hitAx = 0;
function rayBox(o, d, b, tmax) {
  let tmin = 0, t1 = tmax, ax = -1; const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z], MN = [b.x0, b.y0, b.z0], MX = [b.x1, b.y1, b.z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) { if (O[a] < MN[a] || O[a] > MX[a]) return -1; continue; }
    let ta = (MN[a] - O[a]) / D[a], tb = (MX[a] - O[a]) / D[a]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > tmin) { tmin = ta; ax = a; } if (tb < t1) t1 = tb; if (tmin > t1) return -1;
  }
  if (ax < 0) return -1; _hitAx = ax; return tmin;
}
const _near = [];
export function raycast(o, d, maxD) {
  const ex = o.x + d.x * maxD, ez = o.z + d.z * maxD;
  query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), _near);
  let best = maxD, bb = null, bax = 0;
  for (const i of _near) { const t = rayBox(o, d, boxes[i], best); if (t >= 0 && t < best) { best = t; bb = boxes[i]; bax = _hitAx; } }
  if (!bb) return null;
  const n = new V3(); n.setComponent(bax, -Math.sign(d.getComponent(bax)));
  return { t: best, point: o.clone().addScaledVector(d, best), normal: n, box: bb };
}
export function maxTopNear(p, r) {
  query(p.x - r, p.z - r, p.x + r, p.z + r, _near); let m = 0;
  for (const i of _near) { const b = boxes[i]; const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dz = Math.max(b.z0 - p.z, 0, p.z - b.z1); if (dx * dx + dz * dz < r * r && b.y1 > m) m = b.y1; }
  return m;
}

/* ---------- Fassaden aus dem Shader: Lochfenster, Glasfassaden, Geschossbänder, Dächer ---------- */
const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, metalness: .05, envMapIntensity: 1 });
bMat.onBeforeCompile = sh => {
  sh.uniforms.night = envU.night;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
    .replace('#include <fog_vertex>', `#include <fog_vertex>
    #ifdef USE_INSTANCING
      vWP=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);
    #else
      vWP=(modelMatrix*vec4(transformed,1.0)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);
    #endif`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
    uniform float night; varying vec3 vWP; varying vec3 vWN;
    float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
    vec3 an=abs(vWN); float roof=step(.5,an.y); float wall=1.-roof;
    float hz=an.x>.5?vWP.z:vWP.x;
    float seed=vColor.r*37.+vColor.g*19.+vColor.b*7.;
    float glassy=step(.05,vColor.b-vColor.r)*wall;
    vec2 cell=vec2(hz/3.3,(vWP.y-4.6)/3.7); vec2 fc=fract(cell);
    vec2 gc=vec2(hz/1.7,(vWP.y-4.6)/3.7); vec2 gf=fract(gc);
    // Kantenglättung: in der Ferne werden Fenstermuster zu ihrem Mittelwert statt zu flimmern
    float wAA=clamp(1.-max(fwidth(cell.x),fwidth(cell.y))*1.3,0.,1.);
    float gAA=clamp(1.-max(fwidth(gc.x),fwidth(gc.y))*1.3,0.,1.);
    float wallC=step(0.,cell.y)*wall*(1.-glassy);
    float win=mix(.37*wallC,step(.18,fc.x)*step(fc.x,.82)*step(.22,fc.y)*step(fc.y,.8)*wallC,wAA);
    float mull=mix(.14,1.-step(.05,gf.x)*step(gf.x,.95)*step(.06,gf.y)*step(gf.y,.97),gAA);
    float pane=glassy*(1.-mull)*step(0.,gc.y);
    vec2 wc=floor(mix(cell,gc,glassy));
    float rn=h12(wc+seed);
    float shop=wall*step(.5,vWP.y)*step(vWP.y,4.)*step(.08,fract(hz/6.))*step(fract(hz/6.),.92);
    vec3 glass=mix(vec3(.08,.1,.14),vec3(.34,.4,.48),rn*.8);
    glass=mix(vec3(.2,.24,.3),glass,wAA);
    diffuseColor.rgb=mix(diffuseColor.rgb,glass,max(win*.85,shop*.8));
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.14,.18,.25),mix(vec3(.08,.11,.16),vec3(.2,.26,.34),rn),gAA),pane);
    diffuseColor.rgb*=1.-.45*glassy*mull*step(0.,gc.y);
    diffuseColor.rgb*=1.-.16*mix(.07,step(fc.y,.07),wAA)*wallC;
    vec2 tl=fract(vWP.xz/4.); float seam=step(.95,max(tl.x,tl.y));
    vec3 tar=vec3(.36,.35,.34)*(.9+.2*h12(floor(vWP.xz/4.)))+diffuseColor.rgb*.12-seam*.05;
    diffuseColor.rgb=mix(diffuseColor.rgb,tar,roof);
    diffuseColor.rgb*=mix(.6,1.,smoothstep(0.,22.,vWP.y));
    float litTh=mix(.83,.68,night);
    float lit=step(litTh,rn)*(.55+.45*h12(wc*1.7+seed)), litAvg=(1.-litTh)*.75;
    float glow=(win*mix(litAvg,lit,wAA)+pane*mix(litAvg,lit,gAA))*mix(1.,1.5,night)+shop*mix(.5,1.2,night);
    vec3 glowCol=mix(vec3(1.,.74,.42),vec3(.62,.78,1.),step(.94,h12(wc*3.1+seed)));
    float gl=max(max(win,shop),pane);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.18,max(win,shop)); roughnessFactor=mix(roughnessFactor,.06,pane);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.7,pane);')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=glowCol*glow*1.1;');
};
const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _q = new THREE.Quaternion();
function instBoxes(list, mat, get, geo = new THREE.BoxGeometry(1, 1, 1)) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => { const [x0, y0, z0, x1, y1, z1, c] = get(it); M4.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Q0, _s.set(x1 - x0, y1 - y0, z1 - z0)); im.setMatrixAt(i, M4); if (c) im.setColorAt(i, c); });
  return im;
}
const bMesh = instBoxes(bldg, bMat, o => [o.b.x0, o.b.y0, o.b.z0, o.b.x1, o.b.y1, o.b.z1, o.col]);
bMesh.castShadow = bMesh.receiveShadow = true; scene.add(bMesh);
const wMesh = instBoxes(walks, new THREE.MeshStandardMaterial({ color: 0x8f8b86, roughness: .95 }), w => [w[0], 0, w[1], w[2], 0.22, w[3]]);
wMesh.receiveShadow = true; scene.add(wMesh);

// Brücke, Hafen, Schiffe
const bridgeLampMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
{
  const pm = instBoxes(props, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65, metalness: .2 }), p => [p[0], p[1], p[2], p[3], p[4], p[5], new THREE.Color(p[6])]);
  pm.castShadow = pm.receiveShadow = true; scene.add(pm);
  const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0xc0412e, roughness: .5, metalness: .4 }), cables.length);
  const d = new V3();
  cables.forEach(([ax, ay, az, bx, by, bz, r], i) => { d.set(bx - ax, by - ay, bz - az); const l = d.length(); _q.setFromUnitVectors(UP, d.normalize()); M4.compose(_p.set(ax, ay, az), _q, _s.set(r, l, r)); cm.setMatrixAt(i, M4); });
  scene.add(cm);
  // Fahrbahn als glatte, gebogene Fläche (die Stufen der Kollision sieht man nicht)
  const { xs, len, z: bz, hw } = BRIDGE, segs = Math.ceil(len / 2);
  const bend = (geo, yOff) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + bridgeY(p.getX(i)) + yOff); geo.computeVertexNormals(); return geo; };
  const deckGeo = bend(new THREE.BoxGeometry(len, 2.5, hw * 2, segs, 1, 1).translate(xs + len / 2, -1.25, bz), 0);
  const deckM = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0x4a4c52, roughness: .9 })); deckM.castShadow = deckM.receiveShadow = true; scene.add(deckM);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb43a2a, roughness: .6, metalness: .3 });
  for (const sz of [-1, 1]) { const g = bend(new THREE.BoxGeometry(len, 1.1, .4, segs, 1, 1).translate(xs + len / 2, .55, bz + sz * (hw - .2)), 0); const m = new THREE.Mesh(g, railMat); m.castShadow = true; scene.add(m); }
  // Mittellinie folgt der Steigung
  const dash = []; for (let x = xs + 4; x < xs + len - 4; x += 10) dash.push(x);
  const dm = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, .25).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8cfb0, roughness: .8 }), dash.length);
  dash.forEach((x, i) => { const sl = (bridgeY(x + 1) - bridgeY(x - 1)) / 2; _q.setFromAxisAngle(new V3(0, 0, 1), Math.atan(sl)); M4.compose(_p.set(x, bridgeY(x) + .03, bz), _q, _s.set(1, 1, 1)); dm.setMatrixAt(i, M4); });
  dm.receiveShadow = true; scene.add(dm);
  const L = []; for (let x = BRIDGE.xs + 20; x < BRIDGE.xs + BRIDGE.len; x += 40) for (const sz of [-11.4, 11.4]) L.push([x, bridgeY(x) + 1.3, BRIDGE.z + sz]);
  const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(.35, 10, 8), bridgeLampMat, L.length);
  L.forEach(([x, y, z], i) => { M4.compose(_p.set(x, y, z), Q0, _s.set(1, 1, 1)); lm.setMatrixAt(i, M4); }); scene.add(lm);
}

// Simse unter der Dachkante und Brüstungen rundum
{
  const ledges = [], rims = [];
  for (const { b, col } of bldg) {
    const c = col.clone().offsetHSL(0, -.03, .06);
    ledges.push([b.x0 - .45, b.y1 - 1.4, b.z0 - .45, b.x1 + .45, b.y1 - .6, b.z1 + .45, c]);
    const t = .35, hh = .95;
    rims.push([b.x0, b.y1, b.z0, b.x1, b.y1 + hh, b.z0 + t, c], [b.x0, b.y1, b.z1 - t, b.x1, b.y1 + hh, b.z1, c],
      [b.x0, b.y1, b.z0 + t, b.x0 + t, b.y1 + hh, b.z1 - t, c], [b.x1 - t, b.y1, b.z0 + t, b.x1, b.y1 + hh, b.z1 - t, c]);
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 });
  const a = instBoxes(ledges, m, v => v), r = instBoxes(rims, m, v => v);
  a.castShadow = r.castShadow = true; a.receiveShadow = r.receiveShadow = true; scene.add(a, r);
  const u = instBoxes(units, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: .6, metalness: .4 }), v => v);
  u.castShadow = u.receiveShadow = true; scene.add(u);
  const mm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .12, 1, 6).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0x777d84, metalness: .7, roughness: .4 }), Math.max(1, masts.length));
  masts.forEach(([x, h, z, l], i) => { M4.compose(_p.set(x, h, z), Q0, _s.set(1, l, 1)); mm.setMatrixAt(i, M4); }); mm.count = masts.length; scene.add(mm);
}

/* ---------- Boden, Wasser, Park ---------- */
const land = new THREE.Mesh(new THREE.BoxGeometry(LAND.x1 - LAND.x0, 4, LAND.z1 - LAND.z0), new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: .96 }));
land.position.set((LAND.x0 + LAND.x1) / 2, -2, (LAND.z0 + LAND.z1) / 2); land.receiveShadow = true; scene.add(land);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a4558, roughness: .08, metalness: .45 });
const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), waterMat); water.position.y = -1.3; scene.add(water);
const park = new THREE.Mesh(new THREE.BoxGeometry(parkRect.x1 - parkRect.x0, 0.25, parkRect.z1 - parkRect.z0), new THREE.MeshStandardMaterial({ color: 0x55803d, roughness: 1 }));
park.position.set((parkRect.x0 + parkRect.x1) / 2, 0.125, (parkRect.z0 + parkRect.z1) / 2); park.receiveShadow = true; scene.add(park);
const pond = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2).scale(1, 1, 1.6), waterMat); pond.position.set(pondC.x, 0.27, pondC.z); scene.add(pond);
{
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .32, 1, 8).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), trees.length);
  const top = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }), trees.length);
  const c = new THREE.Color();
  trees.forEach(([x, z, h, r], i) => { M4.compose(_p.set(x, .25, z), Q0, _s.set(1, h, 1)); trunk.setMatrixAt(i, M4); M4.compose(_p.set(x, h + r * .15, z), Q0, _s.set(r, r * .9, r)); top.setMatrixAt(i, M4); top.setColorAt(i, c.setHSL(rr(.22, .32), rr(.35, .55), rr(.24, .36))); });
  trunk.castShadow = top.castShadow = true; top.receiveShadow = true; scene.add(trunk, top);
}
/* ---------- Wassertürme, Turmspitzen, Markierungen, Zebrastreifen ---------- */
{
  const g = mergeGeometries([new THREE.CylinderGeometry(2.1, 2.1, 3.8, 18).translate(0, 4.1, 0), new THREE.ConeGeometry(2.3, 1.6, 18).translate(0, 6.8, 0),
    ...[[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].map(([x, z]) => new THREE.CylinderGeometry(.13, .13, 2.2, 6).translate(x, 1.1, z))]);
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x7a5538, roughness: .9 }), towers.length);
  towers.forEach(([x, h, z], i) => { M4.compose(_p.set(x, h, z), Q0, _s.set(1, 1, 1)); im.setMatrixAt(i, M4); }); im.castShadow = true; scene.add(im);
  const sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, 1.4, 1, 8).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0xaab2bc, roughness: .3, metalness: .8 }), Math.max(1, spires.length));
  spires.forEach(([x, h, z, l], i) => { M4.compose(_p.set(x, h, z), Q0, _s.set(1, l, 1)); sp.setMatrixAt(i, M4); }); sp.count = spires.length; sp.castShadow = true; scene.add(sp);
  // Mittellinien
  const pos = [];
  for (let i = 0; i <= NX; i++) { if (i === 5) continue; for (let z = strZ(0); z < strZ(NZ); z += 10) { const j = Math.round((z - Z0) / PZ); if (Math.abs(z - strZ(j)) < ST_W / 2 + 4.5) continue; pos.push([aveX(i), z, .25, 3.2]); } }
  for (let j = 0; j <= NZ; j++) { for (let x = aveX(0); x < aveX(NX); x += 10) { const i = Math.round((x - X0) / PX); if (Math.abs(x - aveX(i)) < AVE_W / 2 + 4.5) continue; if (j >= 19 && j <= 25 && x > parkRect.x0 && x < parkRect.x1) continue; pos.push([x, strZ(j), 3.2, .25]); } }
  // Mittellinien am anderen Ufer
  for (const a of FAR.av) for (let zz = FAR.z0; zz < FAR.z1; zz += 10) { if (FAR.st.some(s0 => Math.abs(zz - s0) < FAR.SW / 2 + 3)) continue; pos.push([a, zz, .25, 3.2]); }
  for (const s0 of FAR.st) for (let x = FAR.x0; x < FAR.x1; x += 10) { if (FAR.av.some(a => Math.abs(x - a) < FAR.AW / 2 + 3)) continue; pos.push([x, s0, 3.2, .25]); }
  // Zebrastreifen an allen Kreuzungen
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
    if (i === 5 && j >= 19 && j <= 25) continue;
    for (const s of [-1, 1]) {
      const zc = strZ(j) + s * (ST_W / 2 + 2); for (let x = aveX(i) - AVE_W / 2 + 1.2; x < aveX(i) + AVE_W / 2 - 1; x += 1.3) pos.push([x, zc, .65, 3]);
      const xc = aveX(i) + s * (AVE_W / 2 + 2); for (let z = strZ(j) - ST_W / 2 + 1.2; z < strZ(j) + ST_W / 2 - 1; z += 1.3) pos.push([xc, z, 3, .65]);
    }
  }
  const lm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: .8 }), pos.length);
  pos.forEach(([x, z, w, d], i) => { M4.compose(_p.set(x, .02, z), Q0, _s.set(w, 1, d)); lm.setMatrixAt(i, M4); });
  lm.receiveShadow = true; scene.add(lm);
}

/* ---------- Straßenlaternen ---------- */
const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
{
  const L = [];
  for (const [x0, z0, x1, z1] of walks) {
    for (let x = x0 + 8; x < x1 - 4; x += 28) { L.push([x, z0 + .7, Math.PI]); L.push([x, z1 - .7, 0]); }
    for (let z = z0 + 10; z < z1 - 4; z += 28) { L.push([x0 + .7, z, -Math.PI / 2]); L.push([x1 - .7, z, Math.PI / 2]); }
  }
  const pole = mergeGeometries([new THREE.CylinderGeometry(.08, .11, 7, 6).translate(0, 3.5, 0), new THREE.BoxGeometry(.1, .1, 1.7).translate(0, 7, .8)]);
  const pm = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: .5, metalness: .6 }), L.length);
  const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, .14, .8).translate(0, 6.9, 1.6), lampHeadMat, L.length);
  L.forEach(([x, z, yaw], i) => { _q.setFromAxisAngle(UP, yaw); M4.compose(_p.set(x, .22, z), _q, _s.set(1, 1, 1)); pm.setMatrixAt(i, M4); hm.setMatrixAt(i, M4); });
  pm.castShadow = true; scene.add(pm, hm);
}

/* ---------- Leuchtreklamen ---------- */
const boardMats = [];
{
  const ads = [['SKY GAMES', '#ff7a1a', '#1a1030'], ['SKY SWING', '#ffffff', '#0d2b4a'], ['KAFFEE 24/7', '#3b1f12', '#ffcf6b'], ['STADTFUNK 99.4', '#ff3d7f', '#120a18'],
    ['HOTEL AURORA', '#9ef0ff', '#0a1a2a'], ['NUDELN • NUDELN', '#fff4d6', '#c2252b'], ['KINO PALAST', '#ffe14a', '#1b1b1b'], ['SCHWING MIT!', '#ffffff', '#ff7a1a']];
  const texs = ads.map(([t, fg, bg]) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, bg); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(14, 14, 484, 228);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 110; g.font = `900 ${fs}px system-ui,sans-serif`;
    while (g.measureText(t).width > 440 && fs > 30) { fs -= 6; g.font = `900 ${fs}px system-ui,sans-serif`; }
    g.fillText(t, 256, 132);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
  });
  const cands = bldg.filter(({ b }) => b.y0 === 0 && b.z1 - b.z0 > 18 && b.y1 > 40 && Math.abs((b.z0 + b.z1) / 2 - MID_Z) < 520);
  const used = new Set();
  for (let k = 0; k < 22 && cands.length; k++) {
    const i = Math.floor(rand() * cands.length); if (used.has(i)) continue; used.add(i);
    const b = cands[i].b, w = Math.min(18, b.z1 - b.z0 - 3), h = w * .5, y = rr(12, Math.min(42, b.y1 - h - 4)), side = rand() < .5 ? -1 : 1;
    const mat = new THREE.MeshBasicMaterial({ map: texs[k % texs.length], color: new THREE.Color().setScalar(1.5) });
    boardMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(side > 0 ? b.x1 + .15 : b.x0 - .15, y + h / 2, (b.z0 + b.z1) / 2); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  }
}

/* ---------- Verkehr mit Scheinwerfern ---------- */
const cars = [];
for (let i = 0; i < 170; i++) {
  const dir = rand() < .5 ? 1 : -1;
  if (rand() < .55) { let a; do { a = Math.floor(rand() * (NX + 1)); } while (a === 5); cars.push({ ax: 'z', lane: aveX(a) + dir * rr(2.5, 8), t: rr(strZ(0), strZ(NZ)), a: strZ(0), b: strZ(NZ), dir, sp: rr(9, 16) }); }
  else { let j; do { j = Math.floor(rand() * (NZ + 1)); } while (j >= 19 && j <= 25); cars.push({ ax: 'x', lane: strZ(j) - dir * rr(2, 5), t: rr(aveX(0), aveX(NX)), a: aveX(0), b: aveX(NX), dir, sp: rr(8, 14) }); }
}
cars.push(...farCars);
const NC = cars.length;
const carMesh = (() => {
  const g = mergeGeometries([new THREE.BoxGeometry(1.9, .8, 4.4).translate(0, .7, 0), new THREE.BoxGeometry(1.7, .6, 2.3).translate(0, 1.38, -.2)]);
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3, metalness: .55 }), NC);
  const pal = [0xf2c12e, 0xf2c12e, 0xf2c12e, 0x2b2f38, 0xd8dde4, 0x8a1f24, 0x274a7a, 0x55606b];
  for (let i = 0; i < NC; i++) im.setColorAt(i, new THREE.Color(pal[Math.floor(rand() * pal.length)]));
  im.castShadow = true; scene.add(im); return im;
})();
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const carLights = (() => {
  const part = (x, y, z, c) => { const b = new THREE.BoxGeometry(.38, .18, .08).translate(x, y, z); const n = b.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); b.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return b; };
  const g = mergeGeometries([part(.62, .78, 2.21, [1, .95, .85]), part(-.62, .78, 2.21, [1, .95, .85]), part(.68, .82, -2.21, [1, .04, .03]), part(-.68, .82, -2.21, [1, .04, .03])]);
  const im = new THREE.InstancedMesh(g, lightMat, NC); scene.add(im); return im;
})();
const carQ = new THREE.Quaternion();
const carPitch = new THREE.Quaternion(), XAX = new V3(1, 0, 0);
export function updateCars(dt) {
  cars.forEach((c, i) => {
    c.t += c.dir * c.sp * dt;
    if (c.t > c.b) c.t = c.a; if (c.t < c.a) c.t = c.b;
    if (c.ax === 'z') { carQ.setFromAxisAngle(UP, c.dir > 0 ? 0 : Math.PI); M4.compose(_p.set(c.lane, 0, c.t), carQ, _s.set(1, 1, 1)); }
    else {
      carQ.setFromAxisAngle(UP, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let y = 0;
      if (c.yf) { y = c.yf(c.t); const sl = (c.yf(c.t + 1) - c.yf(c.t - 1)) / 2; carQ.multiply(carPitch.setFromAxisAngle(XAX, -Math.atan(sl * c.dir))); }   // Auto kippt mit der Rampe
      M4.compose(_p.set(c.t, y, c.lane), carQ, _s.set(1, 1, 1));
    }
    carMesh.setMatrixAt(i, M4); carLights.setMatrixAt(i, M4);
  });
  carMesh.instanceMatrix.needsUpdate = true; carLights.instanceMatrix.needsUpdate = true;
}

export function setCityNight(n) {        // n = 0 (Tag) … 1 (Nacht), fließend
  lampHeadMat.color.set(0xffd9a0).multiplyScalar(.9 + 3.1 * n);
  lightMat.color.setScalar(1.1 + 1.9 * n);
  boardMats.forEach(m => m.color.setScalar(1.2 + 1.0 * n));
  bridgeLampMat.color.set(0xffe2b0).multiplyScalar(.6 + 3.4 * n);
}

/* ---------- Sky-Funken ---------- */
export const NF = 40;
export const funken = [];
{
  const tops = roofTops.filter(r => r[1] > 22);
  while (funken.length < 30) { const r = tops[Math.floor(rand() * tops.length)]; const p = new V3(r[0], r[1] + 2.4, r[2]); if (funken.every(f => f.p.distanceTo(p) > 60)) funken.push({ p, got: false }); }
  while (funken.length < NF) { let a; do { a = Math.floor(rand() * (NX + 1)); } while (a === 5); funken.push({ p: new V3(aveX(a), rr(30, 75), rr(strZ(1), strZ(NZ - 1))), got: false }); }
}
const fMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.9, 0), new THREE.MeshStandardMaterial({ color: 0xffc08a, emissive: 0xff7a1a, emissiveIntensity: 3, roughness: .3 }), NF);
scene.add(fMesh);
export function setFunkenVisible(v) { fMesh.visible = v; }
const fq = new THREE.Quaternion();
export function updateFunkenMesh(t) {
  funken.forEach((f, i) => {
    fq.setFromAxisAngle(UP, t * 1.6 + i);
    M4.compose(_p.copy(f.p).add(new V3(0, Math.sin(t * 2 + i) * .3, 0)), fq, _s.setScalar(f.got ? 0 : 1)); fMesh.setMatrixAt(i, M4);
  });
  fMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- Startpunkt: mittelhohes Dach nahe Midtown ---------- */
export const START = new V3();
{
  // ein Dach mit freier Aussicht: höher als die Nachbarn, nicht zu weit von Midtown
  let best = null; const cx = (aveX(3) + aveX(4)) / 2, cz = strZ(12);
  for (const r of roofTops) if (r[1] > 50 && r[1] < 140) {
    const nb = maxTopNear(new V3(r[0], 0, r[2]), 45), d = Math.hypot(r[0] - cx, r[2] - cz);
    const sc = d + Math.max(0, nb - r[1] - 8) * 20; if (!best || sc < best.sc) best = { sc, r };
  }
  const r = best ? best.r : roofTops[0]; START.set(r[0], r[1] + .1, r[2]);
}
