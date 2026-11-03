// Hochbahn-Züge: zwei Züge pendeln auf je einem Gleis, halten an den Bahnhöfen.
// Die Wagen sind bewegliche Kollisionskörper: man kann aufs Dach springen und mitfahren.
import * as THREE from 'three';
import { V3 } from './util.js';
import { scene } from './engine.js';
import { ELEV } from './city.js';
import { sfx, spatialLoop } from './audio.js';

const NC = 4, CL = 15, GAP = .9, CW = 3.0, CH = 3.5, WHEEL = .35;    // Wagen pro Zug, Länge, Abstand, Breite, Höhe
const TL = NC * CL + (NC - 1) * GAP;
const VMAX = 17, ACC = 1.3, DWELL = 6;

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// Seitenwand: Edelstahl mit Fenstern, Türen und Streifen
const sideTex = canvasTex(1024, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#c9ced4'); gr.addColorStop(.5, '#e4e7ea'); gr.addColorStop(1, '#9aa0a6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }   // Rillen
  g.fillStyle = '#ff7a1a'; g.fillRect(0, h * .72, w, h * .07);
  for (const dx of [.16, .5, .84]) { g.fillStyle = '#7d848b'; g.fillRect(w * dx - 46, h * .14, 92, h * .78); g.fillStyle = '#1a2230'; g.fillRect(w * dx - 40, h * .18, 36, h * .34); g.fillRect(w * dx + 4, h * .18, 36, h * .34); }
  g.fillStyle = '#1a2230'; for (const dx of [.33, .67]) for (const o of [-80, 0, 80]) g.fillRect(w * dx + o - 34, h * .2, 68, h * .32);
  g.fillStyle = '#ffffff'; g.font = '700 26px system-ui,sans-serif'; g.fillText('LINIE S', w * .04, h * .66);
});
const frontTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b8bec4'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a2230'; g.fillRect(w * .12, h * .14, w * .76, h * .4);
  g.fillStyle = '#ff7a1a'; g.fillRect(0, h * .72, w, h * .07);
  g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(w * .2, h * .84, 14, 0, 6.28); g.arc(w * .8, h * .84, 14, 0, 6.28); g.fill();
  g.fillStyle = '#ffffff'; g.font = '900 54px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('S', w / 2, h * .66);
});
const mSide = new THREE.MeshStandardMaterial({ map: sideTex, roughness: .35, metalness: .7, envMapIntensity: 1.1 });
const mFront = new THREE.MeshStandardMaterial({ map: frontTex, roughness: .35, metalness: .6, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: .0 });
const mRoof = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: .6, metalness: .5 });
const mUnder = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: .8 });
// Reihenfolge der Box-Flächen: +x, -x, +y, -y, +z, -z  (Wagen fährt entlang x)
const carGeo = new THREE.BoxGeometry(CL, CH, CW);
const carMats = [mFront, mFront, mRoof, mUnder, mSide, mSide];
const bogieGeo = new THREE.BoxGeometry(2.6, .6, 2.4);

export const trains = [];
export const cars = [];          // bewegliche Kollisionsboxen {x0,y0,z0,x1,y1,z1,vx,vz}
const stops = [ELEV.x0 + TL / 2 + 4, ...ELEV.stations, ELEV.x1 - TL / 2 - 4].sort((a, b) => a - b);

ELEV.tracks.forEach((tz, k) => {
  const g = new THREE.Group(); scene.add(g);
  const z = ELEV.z + tz, y0 = ELEV.deck + WHEEL;
  const T = { g, z, y0, x: k ? stops[stops.length - 1] : stops[0], v: 0, dir: k ? -1 : 1, next: k ? stops.length - 2 : 1, wait: 2 + k * 9, cars: [], loop: spatialLoop('train_loop', 14, 1.1) };
  for (let i = 0; i < NC; i++) {
    const m = new THREE.Mesh(carGeo, carMats); m.castShadow = true; m.receiveShadow = true;
    const off = -TL / 2 + CL / 2 + i * (CL + GAP); m.position.set(off, CH / 2, 0); g.add(m);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(bogieGeo, mUnder); b.position.set(off + s * (CL / 2 - 2.2), -.05, 0); g.add(b); }
    const c = { off, x0: 0, y0, z0: z - CW / 2, x1: 0, y1: y0 + CH, z1: z + CW / 2, vx: 0, vz: 0 };
    cars.push(c); T.cars.push(c);
  }
  trains.push(T);
});

export function updateTrains(dt, night) {
  mFront.emissiveIntensity = .15 + .9 * night;
  for (const T of trains) {
    if (T.wait > 0) {
      T.wait -= dt; T.v = 0;
      if (T.wait <= 0) { sfx('train_doors', { pos: new V3(T.x, T.y0 + 2, T.z), vol: .8, ref: 10, rev: .3, vary: 0 }); }
    } else {
      const target = stops[T.next], dist = (target - T.x) * T.dir;
      const vStop = Math.sqrt(Math.max(0, 2 * ACC * dist));
      const vNew = Math.min(VMAX, T.v + ACC * dt, vStop);
      if (T.v > 9 && vStop < T.v && !T.braking) { T.braking = true; sfx('train_brake', { pos: new V3(T.x, T.y0, T.z), vol: .6, ref: 12, rev: .3 }); }
      T.v = Math.max(0, vNew);
      T.x += T.v * T.dir * dt;
      if (dist <= .05 || (target - T.x) * T.dir <= 0) {
        T.x = target; T.v = 0; T.braking = false; T.wait = DWELL;
        if (T.next === 0 || T.next === stops.length - 1) T.dir *= -1;   // Endstation: Richtung wechseln
        T.next += T.dir;
        sfx('train_doors', { pos: new V3(T.x, T.y0 + 2, T.z), vol: .6, ref: 10, rev: .3, vary: 0, delay: .8 });
      }
    }
    T.g.position.set(T.x, T.y0, T.z);
    const vx = T.v * T.dir;
    for (const c of T.cars) { const cx = T.x + c.off; c.x0 = cx - CL / 2; c.x1 = cx + CL / 2; c.vx = vx; }
    T.loop.update(new V3(T.x, T.y0 + 1, T.z), Math.min(1, .15 + T.v / VMAX), .7 + .45 * T.v / VMAX);
  }
}
