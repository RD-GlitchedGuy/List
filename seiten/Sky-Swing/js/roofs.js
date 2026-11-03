// Darstellung der begehbaren Dächer und der U-Bahn-Laternen: Bäume, Büsche, Pool-Wasser, Helipad-Markierung,
// Werbeflächen, Lichterketten, Sonnenschirme. Kollision und farbige Boxen entstehen schon in city.js.
import * as THREE from 'three';
import { V3, UP } from './util.js';
import { scene } from './engine.js';
import { roofFeat, subway, pools } from './city.js';

const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _q = new THREE.Quaternion();
const by = k => roofFeat.filter(f => f.kind === k);
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

/* ---------- Gärten: Bäume, Büsche, Lichterketten ---------- */
const gardens = by('garden');
{
  const trees = gardens.flatMap(f => f.trees), bushes = gardens.flatMap(f => f.bushes);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .18, 1, 7).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), Math.max(1, trees.length));
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }), Math.max(1, trees.length));
  const c = new THREE.Color();
  trees.forEach(([x, y, z, h, r], i) => {
    M4.compose(_p.set(x, y, z), Q0, _s.set(1, h, 1)); trunk.setMatrixAt(i, M4);
    M4.compose(_p.set(x, y + h, z), Q0, _s.set(r, r * .85, r)); crown.setMatrixAt(i, M4); crown.setColorAt(i, c.setHSL(.24 + (i % 5) * .02, .45, .3 + (i % 3) * .03));
  });
  trunk.count = crown.count = trees.length; trunk.castShadow = crown.castShadow = true; crown.receiveShadow = true; scene.add(trunk, crown);
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true }), Math.max(1, bushes.length));
  bushes.forEach(([x, y, z, sx, sz], i) => { M4.compose(_p.set(x, y, z), Q0, _s.set(sx * .6, .55, sz * .6)); bush.setMatrixAt(i, M4); bush.setColorAt(i, c.setHSL(.27 + (i % 4) * .025, .5, .28)); });
  bush.count = bushes.length; bush.castShadow = true; scene.add(bush);
}
const fairyMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
{
  const L = gardens.flatMap(f => f.lights);
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 6, 5), fairyMat, Math.max(1, L.length));
  L.forEach(([x, y, z], i) => { M4.compose(_p.set(x, y + Math.sin(i * 1.3) * .12, z), Q0, _s.set(1, 1, 1)); im.setMatrixAt(i, M4); });
  im.count = L.length; scene.add(im);
}

/* ---------- Pools: Beckenboden mit Fliesen, Wasser, Sonnenschirme ---------- */
const tileTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#5fc7e6'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
});
tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
export const waterMat = new THREE.MeshStandardMaterial({ color: 0x2fb4e0, roughness: .04, metalness: .15, transparent: true, opacity: .72, emissive: 0x0a6f90, emissiveIntensity: .25 });
waterMat.onBeforeCompile = sh => {  // leichte Wellen
  sh.uniforms.uT = waterU.t;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x*1.7+uT*1.6)*.03+cos(position.y*2.1+uT*1.3)*.03;');
};
const waterU = { t: { value: 0 } };
for (const f of by('pool')) {
  const [x0, z0, x1, z1] = f.pool, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const t = tileTex.clone(); t.repeat.set(w / 2, d / 2); t.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: .4 }));
  floor.position.set(cx, f.h + .1, cz); floor.receiveShadow = true; scene.add(floor);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, Math.ceil(w / 2), Math.ceil(d / 2)).rotateX(-Math.PI / 2), waterMat);
  water.position.set(cx, f.h + .5, cz); scene.add(water);
}
{
  const U = by('pool').flatMap(f => f.umbrellas);
  const cols = [0xff7a1a, 0xffffff, 0x3cc8ff, 0xf2c12e];
  const im = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, .7, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8, side: THREE.DoubleSide }), Math.max(1, U.length));
  U.forEach(([x, y, z], i) => { M4.compose(_p.set(x, y, z), Q0, _s.set(1, 1, 1)); im.setMatrixAt(i, M4); im.setColorAt(i, new THREE.Color(cols[i % 4])); });
  im.count = U.length; im.castShadow = true; scene.add(im);
}

/* ---------- Helipads ---------- */
const padTex = canvasTex(512, 512, (g, w) => {
  g.clearRect(0, 0, w, w); g.strokeStyle = '#f2c12e'; g.lineWidth = 26; g.beginPath(); g.arc(256, 256, 210, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '900 300px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 256, 270);
});
const padLightMat = new THREE.MeshBasicMaterial({ color: 0x9effa0 });
{
  const L = [];
  for (const f of by('heli')) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.r * 2, f.r * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: .7 }));
    m.position.set(f.cx, f.h + .22, f.cz); m.receiveShadow = true; scene.add(m); L.push(...f.lights);
  }
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.16, 8, 6), padLightMat, Math.max(1, L.length));
  L.forEach(([x, y, z], i) => { M4.compose(_p.set(x, y, z), Q0, _s.set(1, 1, 1)); im.setMatrixAt(i, M4); }); im.count = L.length; scene.add(im);
}

/* ---------- Werbetafeln: Werbung für Sky-Games-Spiele ---------- */
const ADS = [
  ['SKY SWING', 'Schwing dich durch die Stadt', '#ff7a1a', '#16202e'], ['CUBE DASHER', 'Spring. Dash. Wiederhol.', '#ffffff', '#5b2cc9'],
  ['SKY CIRCUIT', 'Zeichne deine Strecke', '#111111', '#ffc94a'], ['RIFT ROYALE', '12 Spieler · 1 Sieger', '#ffffff', '#b3261e'],
  ['SKYLINE FLIGHT', 'Über den Wolken', '#0d2b4a', '#9ee6ff'], ['HOCHBAHN', 'Alle 4 Minuten · Linie S', '#ffffff', '#2e5e3a'],
  ['SKY GAMES', 'Neue Spiele jeden Monat', '#ffc94a', '#0b0e15'], ['PIZZA NAPOLI', 'Bis 3 Uhr nachts', '#fff4d6', '#c2252b'],
];
const adTex = ADS.map(([t, sub, fg, bg]) => canvasTex(1024, 384, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.globalAlpha = .12; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * (.1 + i * .17), h * (.3 + (i % 2) * .4), 90 + i * 12, 0, 6.28); g.fill(); } g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
  let fs = 170; g.font = `900 ${fs}px system-ui,sans-serif`; while (g.measureText(t).width > w - 80 && fs > 40) { fs -= 8; g.font = `900 ${fs}px system-ui,sans-serif`; }
  g.fillText(t, w / 2, h * .42); g.font = '600 48px system-ui,sans-serif'; g.globalAlpha = .85; g.fillText(sub, w / 2, h * .78);
}));
const adMats = [];
by('board').forEach((f, i) => {
  const F = f.face, mat = new THREE.MeshBasicMaterial({ map: adTex[i % adTex.length], color: new THREE.Color().setScalar(1.2) });
  adMats.push(mat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.hgt), mat); m.position.set(F.x, F.y, F.z); m.rotation.y = F.rot; scene.add(m);
});

/* ---------- U-Bahn-Laternen (grüne Kugeln) ---------- */
const globeMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
{
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 12, 10), globeMat, Math.max(1, subway.length));
  subway.forEach(([x, y, z], i) => { M4.compose(_p.set(x, y, z), Q0, _s.set(1, 1, 1)); im.setMatrixAt(i, M4); }); im.count = subway.length; scene.add(im);
}

/* ---------- Platsch-Ringe im Pool ---------- */
const rings = [];
const ringGeo = new THREE.RingGeometry(.6, .85, 32).rotateX(-Math.PI / 2);
for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); rings.push({ m, t: 9 }); }
let ri = 0;
export function splashAt(p, y) { for (let k = 0; k < 3; k++) { const r = rings[ri++ % rings.length]; r.m.position.set(p.x, y + .02, p.z); r.t = -k * .15; r.m.visible = true; } }
export const inPool = p => { for (const q of pools) if (p.x > q.x0 && p.x < q.x1 && p.z > q.z0 && p.z < q.z1 && p.y < q.water + .2) return q; return null; };

/* ---------- pro Frame: Nachtlicht, Blinken, Wellen ---------- */
export function updateRoofs(dt, t, night) {
  waterU.t.value = t;
  fairyMat.color.set(0xffd9a0).multiplyScalar(.6 + 3.4 * night);
  globeMat.color.set(0x7dff9a).multiplyScalar(.7 + 2.5 * night);
  padLightMat.color.set((t % 1.4) < .7 ? 0x9effa0 : 0x2c5a30).multiplyScalar(.8 + 2.2 * night);
  adMats.forEach(m => m.color.setScalar(1.1 + 1.1 * night));
  waterMat.emissiveIntensity = .25 + .9 * night;
  for (const r of rings) {
    if (r.t > 2) continue; r.t += dt; if (r.t < 0) { r.m.visible = false; continue; }
    r.m.visible = true; const s = 1 + r.t * 3.2; r.m.scale.set(s, 1, s); r.m.material.opacity = Math.max(0, .7 * (1 - r.t / 1.1));
    if (r.t > 1.1) r.m.visible = false;
  }
}
