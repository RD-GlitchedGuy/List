// Prozedurale 3D-Modelle mit abgerundeten Formen: Figuren, Waffen, Gleiter, Battle-Bus, Loot
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFS, AMMO } from './items.js';
import { RARITIES } from './state.js';

// ---------- Bausteine ----------
const matCache = new Map(), geoCache = new Map();
export function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.05 }, opts)));
  return matCache.get(k);
}
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
function mesh(g, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color, opts));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function rbox(w, h, d, r, color, x, y, z, opts) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return mesh(geo(`rb${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r)), color, x, y, z, opts);
}
export function box(w, h, d, color, x, y, z, opts) { return rbox(w, h, d, Math.min(w, h, d) * 0.18, color, x, y, z, opts); }
function cyl(rt, rb, h, color, x, y, z, seg = 14, opts) { return mesh(geo(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), color, x, y, z, opts); }
function caps(r, len, color, x, y, z) { return mesh(geo(`ca${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 5, 12)), color, x, y, z); }
function sph(r, color, x, y, z, opts) { return mesh(geo(`sp${r}`, () => new THREE.SphereGeometry(r, 18, 14)), color, x, y, z, opts); }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// ---------- Waffen ----------
export function makeWeaponModel(key, rarity = 0) {
  const d = DEFS[key];
  const g = new THREE.Group();
  const body = '#33373c', dark = '#1e2124', accent = RARITIES[rarity].color, wood = '#6b4a2e';
  const metal = { metalness: 0.55, roughness: 0.38 };
  if (key === 'pickaxe') {
    // Stiel mit Griffband, Metallkragen und Kopf mit Spitze + Flachklinge
    const h = cyl(0.026, 0.031, 0.92, wood, 0, 0, -0.36, 12); h.rotation.x = Math.PI / 2; g.add(h);
    for (let i = 0; i < 4; i++) { const w = cyl(0.034, 0.034, 0.045, '#2b2622', 0, 0, 0.03 - i * 0.065, 12); w.rotation.x = Math.PI / 2 + (i % 2 ? 0.12 : -0.12); g.add(w); }
    g.add(sph(0.042, '#3a3330', 0, 0, 0.1));
    const col = cyl(0.04, 0.036, 0.09, '#8e959c', 0, 0, -0.68, 12, metal); col.rotation.x = Math.PI / 2; g.add(col);
    const head = new THREE.Group(); head.position.set(0, 0, -0.79); g.add(head);
    head.add(rbox(0.12, 0.14, 0.15, 0.03, accent, 0, 0, 0));
    head.add(rbox(0.125, 0.04, 0.155, 0.01, '#2a2d31', 0, 0.055, 0));
    for (const sx of [-0.063, 0.063]) for (const z of [-0.04, 0.04]) head.add(sph(0.012, '#c9ced3', sx, -0.02, z, metal));
    // Spitze (gebogen)
    let px = 0.06, py = 0;
    [[0.045, 0.038, 0.13, 0.05], [0.038, 0.028, 0.12, 0.22], [0.028, 0.014, 0.11, 0.42]].forEach(([r1, r2, l, ang]) => {
      const seg = cyl(r2, r1, l, '#a9b0b6', 0, 0, 0, 10, metal);
      const cx = px + Math.cos(-ang) * l / 2, cy = py + Math.sin(-ang) * l / 2;
      seg.position.set(cx, cy, 0); seg.rotation.z = -Math.PI / 2 - ang; head.add(seg);
      px += Math.cos(-ang) * l; py += Math.sin(-ang) * l;
    });
    const tip = mesh(geo('ptip', () => new THREE.ConeGeometry(0.014, 0.06, 8)), '#c9ced3', px + 0.022, py - 0.016, 0, metal); tip.rotation.z = -Math.PI / 2 - 0.6; head.add(tip);
    // Flachklinge
    const blade = rbox(0.2, 0.035, 0.13, 0.012, '#9aa1a8', -0.15, -0.02, 0, metal); blade.rotation.z = 0.18; head.add(blade);
    const edge = rbox(0.03, 0.04, 0.15, 0.01, '#d6dbe0', -0.255, -0.04, 0, metal); edge.rotation.z = 0.18; head.add(edge);
    const m = new THREE.Object3D(); m.name = 'muzzle'; m.position.set(0, 0, -0.8); g.add(m);
    return g;
  }
  const p = d.model, L = p.len, H = p.h;
  if (p.tube) {
    const t = cyl(0.11, 0.11, L, '#4a5a3a', 0, 0.06, -L * 0.3, 16); t.rotation.x = Math.PI / 2; g.add(t);
    const f = cyl(0.13, 0.11, 0.14, dark, 0, 0.06, -L * 0.8, 16); f.rotation.x = Math.PI / 2; g.add(f);
    const b = cyl(0.125, 0.125, 0.08, accent, 0, 0.06, -L * 0.25, 16); b.rotation.x = Math.PI / 2; g.add(b);
    g.add(rbox(0.06, 0.18, 0.08, 0.02, dark, 0, -0.08, 0.02));
    g.add(rbox(0.05, 0.08, 0.14, 0.02, dark, 0, 0.2, -0.2));
  } else if (p.pistol) {
    g.add(rbox(0.06, H, L, 0.02, body, 0, 0.04, -L / 2 + 0.06, metal));
    g.add(rbox(0.055, 0.17, 0.08, 0.02, dark, 0, -0.08, 0.03));
    g.add(rbox(0.065, 0.025, L * 0.55, 0.01, accent, 0, 0.04 + H / 2, -L * 0.4));
    const br = cyl(0.016, 0.016, 0.06, dark, 0, 0.05, -L + 0.03, 10); br.rotation.x = Math.PI / 2; g.add(br);
  } else {
    g.add(rbox(0.075, H, L * 0.62, 0.025, body, 0, 0.02, -L * 0.28 + 0.06, metal));          // Gehäuse
    g.add(rbox(0.07, H * 0.8, L * 0.3, 0.025, p.pump ? wood : '#2a2e33', 0, 0.0, -L * 0.72)); // Handschutz
    const br = cyl(0.018, 0.018, L * 0.35, dark, 0, 0.04, -L * 0.88 - 0.02, 10, metal); br.rotation.x = Math.PI / 2; g.add(br);
    g.add(rbox(0.05, 0.14, 0.07, 0.02, dark, 0, -0.09, 0.03));                                 // Griff
    if (p.stock) g.add(rbox(0.06, 0.12, p.stock, 0.03, p.pump || key === 'hunting' ? wood : dark, 0, -0.01, 0.1 + p.stock / 2));
    if (p.mag) { const m = rbox(0.05, p.mag, 0.08, 0.02, dark, 0, -0.04 - p.mag / 2, -0.17); m.rotation.x = 0.15; g.add(m); }
    if (p.sight === 1) g.add(rbox(0.05, 0.055, 0.12, 0.015, dark, 0, H / 2 + 0.05, -0.12));
    if (p.sight === 2) {
      const sc = cyl(0.045, 0.045, 0.36, dark, 0, H / 2 + 0.08, -0.18, 16, metal); sc.rotation.x = Math.PI / 2; g.add(sc);
      for (const z of [-0.36, 0]) { const r = cyl(0.055, 0.055, 0.05, dark, 0, H / 2 + 0.08, z, 16); r.rotation.x = Math.PI / 2; g.add(r); }
      const lens = cyl(0.042, 0.042, 0.01, '#4a7aa8', 0, H / 2 + 0.08, -0.385, 16, { roughness: 0.1, metalness: 0.3 }); lens.rotation.x = Math.PI / 2; g.add(lens);
    }
    g.add(rbox(0.08, 0.022, L * 0.26, 0.01, accent, 0, H / 2 + 0.022, -L * 0.42));            // Seltenheitsstreifen
  }
  const m = new THREE.Object3D(); m.name = 'muzzle';
  m.position.set(0, 0.04, p.pistol ? -L + 0.02 : -L * 1.05); g.add(m);
  return g;
}

// ---------- Figuren (menschlich, mit Gelenken) ----------
const SCHEMES = [ // Haut, Oberteil, Hose, Haare, Schuhe
  ['#e3b597', '#3e6f9f', '#2f3742', '#4a3424', '#2a2a2a'], ['#c8916f', '#a5463a', '#3a332c', '#1f150e', '#5a3a22'],
  ['#8a5a40', '#4d7b3a', '#3a3a3a', '#121212', '#e8e4dc'], ['#f1c9a8', '#c9a23a', '#3b4654', '#c27a3a', '#333'],
  ['#d8a585', '#6b4f9e', '#2b2f36', '#d9cfb3', '#202020'], ['#6b4430', '#c46a2a', '#2e3a2e', '#0f0f0f', '#444'],
  ['#e8bfa0', '#2f8a8a', '#463c33', '#7a3a2a', '#1e1e1e'], ['#b98266', '#7d7d7d', '#24272b', '#3a2a1a', '#8a3a2a'],
];
export function makeCharacter(idx) {
  const [skin, shirt, pants, hair, shoe] = SCHEMES[idx % SCHEMES.length];
  const root = new THREE.Group();
  const J = {};
  J.pelvis = grp(root, 0, 0.97, 0);
  J.pelvis.add(rbox(0.32, 0.2, 0.2, 0.07, pants, 0, 0, 0));
  J.pelvis.add(rbox(0.335, 0.05, 0.215, 0.02, '#2b2622', 0, 0.08, 0));
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const hip = J['hip' + k] = grp(J.pelvis, s * 0.095, -0.06, 0);
    hip.add(caps(0.078, 0.3, pants, 0, -0.22, 0));
    const knee = J['knee' + k] = grp(hip, 0, -0.44, 0);
    knee.add(caps(0.064, 0.3, pants, 0, -0.2, 0));
    const ankle = grp(knee, 0, -0.42, 0);
    ankle.add(rbox(0.12, 0.09, 0.27, 0.04, shoe, 0, -0.04, -0.05));
  }
  J.spine = grp(J.pelvis, 0, 0.1, 0);
  J.spine.add(rbox(0.3, 0.2, 0.19, 0.07, shirt, 0, 0.1, 0));
  J.spine.add(rbox(0.41, 0.3, 0.23, 0.1, shirt, 0, 0.33, 0));
  J.spine.add(cyl(0.05, 0.056, 0.1, skin, 0, 0.52, 0));
  J.head = grp(J.spine, 0, 0.56, 0);
  const skull = sph(0.12, skin, 0, 0.13, 0); skull.scale.set(1, 1.12, 1.05); J.head.add(skull);
  J.head.add(rbox(0.17, 0.08, 0.16, 0.04, skin, 0, 0.055, -0.015));
  const hr = sph(0.125, hair, 0, 0.185, 0.018); hr.scale.set(1.04, 0.78, 1.08); J.head.add(hr);
  J.head.add(rbox(0.23, 0.12, 0.06, 0.03, hair, 0, 0.14, 0.1));
  for (const s of [-1, 1]) {
    J.head.add(sph(0.019, '#1b1b1b', s * 0.043, 0.14, -0.112, { roughness: 0.2 }));
    J.head.add(rbox(0.045, 0.012, 0.015, 0.005, hair, s * 0.045, 0.172, -0.114));
    J.head.add(sph(0.026, skin, s * 0.122, 0.13, 0));
  }
  J.head.add(rbox(0.028, 0.045, 0.04, 0.012, skin, 0, 0.11, -0.125));
  J.head.add(rbox(0.05, 0.01, 0.01, 0.004, '#8a4a40', 0, 0.075, -0.118));
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = J['sh' + k] = grp(J.spine, s * 0.235, 0.44, 0);
    sh.add(sph(0.075, shirt, 0, 0, 0));
    sh.add(caps(0.058, 0.17, shirt, 0, -0.14, 0));
    const el = J['el' + k] = grp(sh, 0, -0.29, 0);
    el.add(caps(0.047, 0.16, skin, 0, -0.12, 0));
    const hand = sph(0.05, skin, 0, -0.27, 0); hand.scale.set(0.8, 1.1, 0.65); el.add(hand);
    J['hand' + k] = el;
  }
  J.gunPivot = grp(J.spine, 0.1, 0.36, 0);
  J.glider = makeGlider(shirt, hair);
  J.glider.position.set(0, 2.35, 0.05); J.glider.visible = false; root.add(J.glider);
  root.userData.J = J;
  root.userData.cur = {};
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// ---------- Gleiter ----------
export function makeGlider(c1, c2) {
  const g = new THREE.Group();
  const W = 3.6, D = 1.7;
  const pg = new THREE.PlaneGeometry(W, D, 24, 6);
  const pos = pg.attributes.position, cols = [];
  const a = new THREE.Color(c1), b = new THREE.Color('#ece8dc');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = Math.abs(x) / (W / 2);
    // Pfeilform: Spitzen nach hinten gezogen, Mitte nach vorn
    const back = t * 0.75;
    pos.setY(i, y * (1 - t * 0.55) - back);
    pos.setZ(i, -0.28 * t * t + 0.12 * (1 - (y / (D / 2)) ** 2));  // Wölbung
    const stripe = Math.floor((x + W / 2) / (W / 8)) % 2 === 0;
    const c = stripe ? a : b; cols.push(c.r, c.g, c.b);
  }
  pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  pg.computeVertexNormals();
  const sail = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
  sail.rotation.x = -Math.PI / 2; sail.castShadow = true;
  g.add(sail);
  const tube = '#2b2f34';
  const keel = cyl(0.025, 0.025, 2.0, tube, 0, 0.02, 0.2, 8); keel.rotation.x = Math.PI / 2; g.add(keel);
  const cross = cyl(0.022, 0.022, W * 0.86, tube, 0, 0.0, 0.45, 8); cross.rotation.z = Math.PI / 2; g.add(cross);
  for (const s of [-1, 1]) {
    const st = cyl(0.015, 0.015, 0.9, tube, s * 0.28, -0.42, 0.05, 6); st.rotation.z = s * 0.3; g.add(st);
  }
  const bar = cyl(0.02, 0.02, 0.85, '#c9c3b5', 0, -0.83, 0.05, 8); bar.rotation.z = Math.PI / 2; g.add(bar);
  return g;
}

// ---------- gehaltene Gegenstände ----------
export function setHeldModel(actor) {
  const J = actor.model.userData.J;
  if (actor.heldModel) { actor.heldModel.parent && actor.heldModel.parent.remove(actor.heldModel); actor.heldModel = null; }
  const it = actor.inv[actor.slot];
  if (!it) return;
  const d = DEFS[it.key];
  let m;
  if (d.type === 'melee') {
    m = makeWeaponModel(it.key, it.rarity);
    m.position.set(0, -0.27, 0.12); m.rotation.z = Math.PI / 2;
    J.handR.add(m);
  } else {
    m = d.type === 'gun' ? makeWeaponModel(it.key, it.rarity) : makeItemModel(it);
    m.position.set(0.04, -0.02, -0.32);
    J.gunPivot.add(m);
  }
  actor.heldModel = m;
}

// ---------- Animation (weich überblendet) ----------
const T = {};
function setPose(o) { for (const k in T) delete T[k]; Object.assign(T, o); }
export function animateCharacter(a, dt) {
  const ud = a.model.userData, J = ud.J, cur = ud.cur;
  const hs = Math.hypot(a.vel.x, a.vel.z);
  const sprint = a.sprint && hs > 6;
  a.anim = (a.anim || 0) + dt * (hs < 0.3 ? 0 : (sprint ? 11 : a.crouch ? 6 : 8.5) * Math.min(1.2, hs / 5.6 + 0.3));
  const ph = a.anim, m = Math.min(hs / 5.6, 1.3), s = Math.sin(ph), c = Math.cos(ph);
  const it = a.inv[a.slot], held = it ? DEFS[it.key] : null;
  const pitch = a.pitch, kick = a.kickVis || 0;

  // Grundhaltung
  a.airVis = a.state === 'air' ? (a.airVis || 0) + dt : 0;   // kurzes Abheben auf unebenem Boden zählt nicht als Sprung
  const P = { pelvisY: 0.97, pelvisX: 0, pelvisZ: 0, pelvisYw: 0, spineZ: 0, spineY: 0, spineX: 0, headX: 0, hipLX: 0, hipLZ: 0, kneeLX: 0, hipRX: 0, hipRZ: 0, kneeRX: 0,
    shLX: 0, shLZ: 0, elLX: 0, shRX: 0, shRZ: 0, elRX: 0, gunX: 0, glider: 0 };
  let armsFree = true;
  const st = a.state;
  if (st === 'skydive' || st === 'launch') {
    const dive = a.diving ? 1 : 0;
    P.pelvisX = st === 'launch' ? -0.3 : -1.3 - dive * 1.1;
    P.shLZ = dive ? -0.2 : -1.25; P.shRZ = dive ? 0.2 : 1.25; P.shLX = P.shRX = dive ? 0 : 0.35; P.elLX = P.elRX = dive ? 0 : 0.45;
    P.hipLX = P.hipRX = dive ? 0 : -0.25; P.kneeLX = P.kneeRX = dive ? -0.1 : -0.7; P.hipLZ = dive ? 0 : -0.18; P.hipRZ = dive ? 0 : 0.18;
    P.headX = dive ? -0.6 : -0.5;
    P.hipLX += Math.sin(G_t() * 6) * 0.08; P.hipRX -= Math.sin(G_t() * 6) * 0.08;
    armsFree = false;
  } else if (st === 'glide') {
    P.pelvisX = -0.2; P.shLX = P.shRX = Math.PI - 0.12; P.shLZ = -0.22; P.shRZ = 0.22; P.elLX = P.elRX = 0.25;
    P.hipLX = -0.15; P.hipRX = -0.35; P.kneeLX = -0.5; P.kneeRX = -0.3; P.glider = 1;
    armsFree = false;
  } else if (st === 'swim') {
    P.pelvisX = -1.25; P.pelvisY = 0.75;
    P.shLX = Math.PI / 2 + s * 1.5; P.shRX = Math.PI / 2 - s * 1.5; P.elLX = P.elRX = 0.3;
    P.hipLX = Math.sin(ph * 2) * 0.3; P.hipRX = -Math.sin(ph * 2) * 0.3; P.headX = -0.9;
    armsFree = false;
  } else if (a.ladder) {
    const t = Math.abs(a.vel.y) > 0.1 ? G_t() * 7 : 0;
    P.shLX = Math.PI - 0.55 + Math.sin(t) * 0.4; P.shRX = Math.PI - 0.55 - Math.sin(t) * 0.4; P.elLX = P.elRX = 0.7;
    P.hipLX = 0.55 - Math.sin(t) * 0.45; P.hipRX = 0.55 + Math.sin(t) * 0.45; P.kneeLX = P.kneeRX = -1.0;
    armsFree = false;
  } else if (st === 'car') {
    P.pelvisY = 0.55; P.hipLX = P.hipRX = 1.45; P.kneeLX = P.kneeRX = -1.35; P.hipLZ = -0.08; P.hipRZ = 0.08;
    if (a.lean) { P.pelvisY = 0.62; P.spineX = -0.1; }                       // aus dem Fenster gelehnt: Arme frei zum Zielen
    else if (a.seat > 0) { P.shLX = P.shRX = 0.35; P.elLX = P.elRX = 0.9; P.shLZ = -0.1; P.shRZ = 0.1; armsFree = false; }
    else { P.shLX = P.shRX = 0.95; P.elLX = P.elRX = 0.55; P.shLZ = 0.15; P.shRZ = -0.15; armsFree = false; }
  } else if (a.slideT > 0) {
    P.pelvisY = 0.42; P.pelvisX = 0.4; P.spineX = 0.05; P.headX = -0.35;
    P.hipLX = 1.2; P.kneeLX = -0.1; P.hipRX = 0.35; P.kneeRX = -1.45; P.hipRZ = 0.1;
    if (!held || held.type === 'melee') { P.shLX = -0.5; P.shLZ = -0.9; P.shRX = 0.6; P.shRZ = 0.4; armsFree = false; }
  } else if ((st === 'air' && a.airVis > 0.22) || st === 'grapple') {
    P.hipLX = 0.6; P.kneeLX = -0.9; P.hipRX = -0.1; P.kneeRX = -0.5; P.spineX = -0.05;
    if (!held) { P.shLX = 0.4; P.shRX = -0.2; P.shLZ = -0.4; P.shRZ = 0.4; P.elLX = P.elRX = 0.6; armsFree = false; }
  } else if (a.crouch) {
    P.pelvisY = 0.66; P.spineX = -0.32; P.headX = 0.25;
    P.hipLX = 1.05 + s * 0.45 * m; P.hipRX = 1.05 - s * 0.45 * m; P.spineY = -s * 0.1 * m; P.pelvisY = 0.66 - Math.abs(s) * 0.03 * m;
    P.kneeLX = -1.75 + Math.max(0, c) * 0.4 * m; P.kneeRX = -1.75 + Math.max(0, -c) * 0.4 * m;
    P.hipLZ = -0.12; P.hipRZ = 0.12;
  } else {
    // Gehen (langsam) / Laufen / Sprinten
    const walk = hs < 4.2, amp = sprint ? 0.9 : walk ? 0.5 : 0.66, knee = sprint ? 1.35 : walk ? 0.75 : 1.05;
    P.hipLX = s * amp * m; P.hipRX = -s * amp * m;
    P.kneeLX = -(0.06 + Math.max(0, -c) * knee * m); P.kneeRX = -(0.06 + Math.max(0, c) * knee * m);
    P.pelvisY = 0.97 - Math.abs(s) * (walk ? 0.035 : 0.06) * m;
    P.pelvisYw = s * 0.1 * m; P.spineY = -s * 0.16 * m; P.pelvisZ = -c * 0.04 * m;
    P.spineX = sprint ? -0.32 : -0.07 * m; P.headX = sprint ? 0.28 : Math.abs(s) * 0.04 * m;
    if (hs < 0.3) { const br = Math.sin(G_t() * 1.8); P.spineX = br * 0.025; P.headX = -br * 0.02; }
  }
  if (a.emoteT > 0 && st === 'ground' && hs < 0.6) {
    // Emotes (Liste in emotes.js)
    const t = G_t() * 7.5, sn = Math.sin(t), ab = Math.abs(sn);
    armsFree = false;
    switch ((a.emoteStyle || 0) & 7) {
      case 1:                                                     // Hüftschwung
        P.shLZ = -0.25 + sn * 0.9; P.shRZ = 0.25 + sn * 0.9;
        P.shLX = Math.sin(t * 2) * 0.55; P.shRX = -Math.sin(t * 2) * 0.55;
        P.pelvisZ = -sn * 0.22; P.spineZ = sn * 0.12;
        P.kneeLX = P.kneeRX = -0.18 - ab * 0.2; P.hipLX = P.hipRX = 0.1;
        break;
      case 2: {                                                   // Winken
        const w = Math.sin(G_t() * 9);
        P.shRX = Math.PI - 0.5; P.shRZ = 0.35 + w * 0.3; P.elRX = 0.35 + w * 0.25;
        P.shLX = 0.1; P.shLZ = -0.08; P.spineZ = -0.06; P.headX = -0.08;
        break;
      }
      case 3: {                                                   // Roboter: abgehackte Schritte
        const st4 = Math.floor(G_t() * 3.2) % 4, side = st4 < 2 ? 1 : -1, up = st4 % 2;
        P.shLX = up ? 1.55 : 0.2; P.elLX = up ? 0 : 1.57; P.shRX = up ? 0.2 : 1.55; P.elRX = up ? 1.57 : 0;
        P.spineY = side * 0.35; P.pelvisYw = -side * 0.12; P.headX = up ? -0.12 : 0.1;
        P.kneeLX = P.kneeRX = up ? -0.25 : -0.05; P.hipLX = P.hipRX = up ? 0.12 : 0.02; P.pelvisY = up ? 0.92 : 0.97;
        break;
      }
      case 4: {                                                   // Jubeln: Fäuste hoch, kleine Sprünge
        const j = Math.abs(Math.sin(G_t() * 6));
        P.shLX = P.shRX = Math.PI - 0.15 - j * 0.45; P.shLZ = -0.3; P.shRZ = 0.3; P.elLX = P.elRX = 0.25 + j * 0.4;
        P.pelvisY = 0.97 - (1 - j) * 0.08; P.kneeLX = P.kneeRX = -(1 - j) * 0.45; P.hipLX = P.hipRX = (1 - j) * 0.25; P.headX = -0.25;
        break;
      }
      case 5: {                                                   // Hüpfer: seitlich wippen, Arme schwingen
        P.pelvisY = 0.97 - ab * 0.14; P.kneeLX = P.kneeRX = -ab * 0.6; P.hipLX = P.hipRX = ab * 0.32;
        P.pelvisZ = Math.sin(t / 2) * 0.12; P.spineZ = -Math.sin(t / 2) * 0.16;
        P.shLX = 0.6 + Math.sin(t / 2) * 0.6; P.shRX = 0.6 - Math.sin(t / 2) * 0.6; P.shLZ = -0.5; P.shRZ = 0.5; P.elLX = P.elRX = 0.9;
        break;
      }
      case 6:                                                     // Salutieren
        P.shRX = 2.1; P.shRZ = 0.85; P.elRX = 2.25; P.shLX = 0.02; P.shLZ = -0.05; P.headX = -0.06; P.spineX = -0.04;
        break;
      case 7: {                                                   // Klatschen
        const c2 = Math.abs(Math.sin(G_t() * 7));
        P.shLX = P.shRX = 1.25; P.elLX = P.elRX = 0.55; P.shLZ = 0.05 + c2 * 0.35; P.shRZ = -0.05 - c2 * 0.35;
        P.headX = 0.05; P.spineX = -0.04;
        break;
      }
      default:                                                    // Arme hoch
        P.shLX = Math.PI - 0.35 + sn * 0.45; P.shRX = Math.PI - 0.35 - sn * 0.45; P.elLX = P.elRX = 0.55;
        P.shLZ = -0.2; P.shRZ = 0.2;
        P.pelvisY = 0.97 - ab * 0.08; P.kneeLX = P.kneeRX = -ab * 0.45; P.hipLX = P.hipRX = ab * 0.25;
        P.spineZ = Math.sin(t / 2) * 0.18; P.headX = sn * 0.15;
    }
  }
  if (armsFree) {
    if (held && held.type === 'melee') {
      const sw = a.swingT > 0 ? 1 - a.swingT / 0.4 : 0;
      if (sw > 0) {
        // Ausholen -> Zuschlagen -> Zurück: ganzer Körper dreht und beugt sich mit
        const L = (x, y, t) => x + (y - x) * t;
        const wind = Math.min(1, sw / 0.35), strike = sw < 0.35 ? 0 : Math.min(1, (sw - 0.35) / 0.25), rec = sw < 0.6 ? 0 : (sw - 0.6) / 0.4;
        const ph = (a0, a1, a2, a3) => rec > 0 ? L(a2, a3, rec) : strike > 0 ? L(a1, a2, strike) : L(a0, a1, wind);
        P.shRX = ph(0.3, 2.8, 0.05, 0.3); P.elRX = ph(0.9, 1.1, 0.12, 0.9); P.shRZ = ph(0.08, 0.35, -0.1, 0.08);
        P.shLX = ph(0.2, 0.9, -0.35, 0.2); P.elLX = ph(0.3, 0.8, 0.4, 0.3); P.shLZ = ph(0, -0.3, 0.2, 0);
        P.spineY = ph(0, 0.38, -0.36, 0); P.spineX = ph(P.spineX, 0.14, -0.42, P.spineX);
        P.pelvisYw = ph(0, 0.12, -0.14, 0); P.headX = ph(0, -0.12, 0.25, 0);
        if (hs < 1) { P.kneeLX = P.kneeRX = ph(-0.1, -0.1, -0.35, -0.06); P.hipLX = ph(0, 0.1, 0.35, 0); P.hipRX = ph(0, -0.15, 0.05, 0); }
      } else {
        P.shRX = 0.2 - s * 0.3 * m; P.elRX = 0.95; P.shRZ = 0.08;
        P.shLX = sprint ? s * 0.9 : s * 0.45 * m; P.elLX = sprint ? 1.2 : 0.3;
      }
    } else if (held && !sprint) {
      const aim = Math.PI / 2 + pitch + kick;
      P.shRX = aim - 0.35; P.elRX = 0.45; P.shRZ = 0.05;
      P.shLX = aim - 0.15; P.elLX = 0.35; P.shLZ = 0.55;
      P.gunX = pitch + kick; P.spineX += -0.05;
    } else if (held && sprint) {           // Waffe beim Sprinten seitlich halten
      P.shRX = 0.7; P.elRX = 1.3; P.shLX = 0.9; P.elLX = 1.2; P.shLZ = 0.6; P.gunX = -0.7;
    } else {
      P.shLX = -s * (sprint ? 1.1 : 0.6) * m; P.shRX = s * (sprint ? 1.1 : 0.6) * m;
      P.elLX = P.elRX = sprint ? 1.25 : 0.3; P.shLZ = -0.06; P.shRZ = 0.06;
    }
  }
  // weich überblenden
  const k = 1 - Math.exp(-dt * 16);
  for (const key in P) cur[key] = cur[key] === undefined ? P[key] : cur[key] + (P[key] - cur[key]) * k;
  J.pelvis.position.y = cur.pelvisY; J.pelvis.rotation.set(cur.pelvisX, cur.pelvisYw, cur.pelvisZ);
  J.spine.rotation.set(cur.spineX, cur.spineY, cur.spineZ); J.head.rotation.x = cur.headX;
  J.hipL.rotation.set(cur.hipLX, 0, cur.hipLZ); J.kneeL.rotation.x = cur.kneeLX;
  J.hipR.rotation.set(cur.hipRX, 0, cur.hipRZ); J.kneeR.rotation.x = cur.kneeRX;
  J.shL.rotation.set(cur.shLX, 0, cur.shLZ); J.elL.rotation.x = cur.elLX;
  J.shR.rotation.set(cur.shRX, 0, cur.shRZ); J.elR.rotation.x = cur.elRX;
  J.gunPivot.rotation.x = cur.gunX;
  J.gunPivot.visible = armsFree;
  if (actorHeldMelee(a)) J.gunPivot.visible = false;
  if (a.heldModel) a.heldModel.visible = (armsFree || st === 'air') && !(a.emoteT > 0);
  // Gleiter auf- und zuklappen
  const gs = J.glider.scale.x + ((cur.glider > 0.5 ? 1 : 0) - J.glider.scale.x) * Math.min(1, dt * 9);
  J.glider.scale.setScalar(Math.max(0.001, gs));
  J.glider.visible = gs > 0.05;
}
const actorHeldMelee = a => { const it = a.inv[a.slot]; return it && it.key === 'pickaxe'; };
const G_t = () => performance.now() / 1000;

// ---------- Battle-Bus ----------
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const speck = (x, w, h, n, col, size = 2) => { x.fillStyle = col; for (let i = 0; i < n; i++) x.fillRect(Math.random() * w, Math.random() * h, size, size); };
let busMats = null;
function makeBusMats() {
  const body = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#2f62a8'; x.fillRect(0, 0, w, h);
    speck(x, w, h, 900, 'rgba(255,255,255,.035)'); speck(x, w, h, 700, 'rgba(0,0,0,.05)');
    x.fillStyle = '#ece6d4'; x.fillRect(0, h * 0.7, w, h * 0.3);                    // heller Unterteil
    x.fillStyle = '#d9b545'; x.fillRect(0, h * 0.6, w, 12);                          // gelber Streifen
    x.fillStyle = '#1d3d6e'; x.fillRect(0, h * 0.6 - 3, w, 3); x.fillRect(0, h * 0.6 + 12, w, 3);
    x.fillStyle = 'rgba(15,30,55,.55)';
    for (let i = 0; i <= w; i += 64) x.fillRect(i, 0, 2, h * 0.7);                 // Blechnähte
    x.fillStyle = '#c9ced3';
    for (let i = 4; i <= w; i += 64) for (let y = 8; y < h * 0.58; y += 18) { x.beginPath(); x.arc(i, y, 1.8, 0, 7); x.fill(); }
    // Schmutz unten, ein paar Kratzer
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(90,70,45,${Math.random() * 0.18})`; x.fillRect(Math.random() * w, h * 0.82 + Math.random() * h * 0.18, 3 + Math.random() * 8, 2 + Math.random() * 4); }
    x.strokeStyle = 'rgba(220,230,240,.25)'; x.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const sx = Math.random() * w, sy = Math.random() * h * 0.55; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 8 + Math.random() * 20, sy + Math.random() * 4 - 2); x.stroke(); }
  });
  const glass = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#1c2a3a'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(160,200,230,.22)';
    for (const o of [10, 46, 58]) { x.beginPath(); x.moveTo(o, h); x.lineTo(o + 26, 0); x.lineTo(o + 26 + (o === 46 ? 8 : 18), 0); x.lineTo(o + (o === 46 ? 8 : 18), h); x.fill(); }
    x.strokeStyle = '#0f151d'; x.lineWidth = 8; x.strokeRect(0, 0, w, h);
  });
  const roof = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#d8d3c4'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,75,65,.35)'; x.lineWidth = 2;
    for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    speck(x, w, h, 500, 'rgba(70,60,50,.12)', 3);
  });
  const grille = canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#2b3036'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#8e959c'; for (let y = 6; y < h; y += 10) x.fillRect(6, y, w - 12, 4);
  });
  const tire = canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2c2c2c'; for (let i = 0; i < w; i += 8) { x.fillRect(i, 0, 4, h / 2 - 4); x.fillRect(i + 4, h / 2 + 4, 4, h / 2); }
  }, [6, 1]);
  const fabric = canvasTex(512, 256, (x, w, h) => {
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#d9b545' : '#2f62a8'; x.fillRect(i * w / 12, 0, w / 12 + 1, h); }
    speck(x, w, h, 1500, 'rgba(0,0,0,.05)'); speck(x, w, h, 1000, 'rgba(255,255,255,.05)');
    x.fillStyle = 'rgba(30,30,30,.35)'; for (let i = 0; i < 12; i++) x.fillRect(i * w / 12 - 1, 0, 3, h);   // Nähte
    x.fillStyle = 'rgba(60,45,30,.5)'; for (const y of [0.3, 0.55, 0.8]) x.fillRect(0, h * y, w, 3);       // Lastbänder
    for (const [px, py, c] of [[90, 70, '#c95b3a'], [340, 150, '#e8e1cf'], [230, 40, '#4f7b3a']]) {           // Flicken
      x.fillStyle = c; x.fillRect(px, py, 30, 24);
      x.setLineDash([3, 3]); x.strokeStyle = 'rgba(30,25,20,.8)'; x.lineWidth = 1; x.strokeRect(px + 2, py + 2, 26, 20); x.setLineDash([]);
    }
  });
  const S = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.6 }, o));
  busMats = { body: S(body, { roughness: 0.5, metalness: 0.15 }), glass: S(glass, { roughness: 0.15, metalness: 0.3 }), roof: S(roof, { roughness: 0.8 }),
    grille: S(grille, { metalness: 0.4 }), tire: S(tire, { roughness: 0.9 }), fabric: S(fabric, { roughness: 0.85 }) };
}

export function makeBus() {
  if (!busMats) makeBusMats();
  const M = busMats, g = new THREE.Group();
  const metal = { metalness: 0.6, roughness: 0.3 };
  g.add(rbox(3.2, 2.6, 8.4, 0.45, M.body, 0, 0.1, 0));
  g.add(rbox(3.26, 0.42, 8.46, 0.18, '#e2dccb', 0, -0.98, 0));
  g.add(rbox(3.0, 0.25, 7.6, 0.12, M.roof, 0, 1.45, 0));             // Dach
  // Dachgepäckträger mit Koffern
  for (const sx of [-1.2, 1.2]) g.add(rbox(0.06, 0.06, 6.4, 0.02, '#3a3f45', sx, 1.72, 0, metal));
  for (let z = -2.8; z <= 2.8; z += 1.4) g.add(rbox(2.5, 0.05, 0.05, 0.02, '#3a3f45', 0, 1.72, z, metal));
  g.add(rbox(1.0, 0.45, 0.7, 0.06, '#7a4a2a', -0.5, 1.98, -1.6)); g.add(rbox(0.75, 0.38, 0.55, 0.05, '#4f7b3a', 0.55, 1.95, -1.2));
  g.add(rbox(0.9, 0.5, 0.6, 0.06, '#c95b3a', 0.2, 2.0, 1.4)); g.add(rbox(0.05, 0.06, 0.62, 0.02, '#2b2622', 0.2, 2.26, 1.4));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) g.add(rbox(0.08, 0.85, 1.15, 0.06, M.glass, s * 1.6, 0.55, -2.9 + i * 1.45));
    g.add(cyl(0.22, 0.22, 0.1, '#e9e2c4', s * 1.05, -0.3, -4.21, 16, { emissive: '#4a4630' }).rotateX(Math.PI / 2));
    g.add(cyl(0.26, 0.26, 0.06, '#8e959c', s * 1.05, -0.3, -4.19, 16, metal).rotateX(Math.PI / 2));
    g.add(rbox(0.25, 0.15, 0.06, 0.03, '#b2382a', s * 1.15, -0.4, 4.22));                         // Rücklichter
    g.add(rbox(0.08, 0.35, 0.25, 0.04, '#2b3036', s * 1.68, 0.75, -3.7));                          // Spiegel
  }
  g.add(rbox(1.0, 1.7, 0.06, 0.04, M.glass, 1.61, 0.15, 3.0)); // Tür
  g.add(rbox(2.7, 1.05, 0.1, 0.08, M.glass, 0, 0.55, -4.2));
  g.add(rbox(1.6, 0.45, 0.08, 0.04, M.grille, 0, -0.45, -4.22));
  g.add(rbox(3.0, 0.3, 0.3, 0.12, '#3a3f45', 0, -1.15, -4.25, metal));
  g.add(rbox(3.0, 0.3, 0.3, 0.12, '#3a3f45', 0, -1.15, 4.25, metal));
  for (const z of [-2.7, 2.7]) for (const x of [-1.5, 1.5]) {
    const w = cyl(0.58, 0.58, 0.38, M.tire, x, -1.3, z, 22); w.rotation.z = Math.PI / 2; g.add(w);
    const h = cyl(0.3, 0.3, 0.4, '#9aa1a8', x, -1.3, z, 14, metal); h.rotation.z = Math.PI / 2; g.add(h);
    const n = cyl(0.08, 0.08, 0.44, '#5a6068', x, -1.3, z, 8, metal); n.rotation.z = Math.PI / 2; g.add(n);
  }
  // Ballon (Stoff mit Nähten und Flicken)
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; const y = -1 + 2 * t; pts.push(new THREE.Vector2(Math.max(0.35, Math.sin(Math.acos(Math.max(-1, y * 0.98))) * (y < 0 ? 0.75 + 0.25 * (1 + y) : 1)), y)); }
  const balloon = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), M.fabric);
  balloon.scale.set(4.4, 4.6, 4.4); balloon.position.y = 9.2; balloon.castShadow = true; g.add(balloon);
  g.add(cyl(1.4, 1.2, 0.5, '#5a4632', 0, 4.4, 0, 18));                 // Ring unter dem Ballon
  g.add(cyl(0.5, 0.65, 0.5, '#3a3f45', 0, 4.9, 0, 12, metal));          // Brenner
  for (const [x, z] of [[-1.3, -3.6], [1.3, -3.6], [-1.3, 3.6], [1.3, 3.6]]) {
    const len = Math.hypot(x * 0.15, 3.1, z * 0.7);
    const r = cyl(0.03, 0.03, len, '#4a4a4a', x * 0.6, 2.95, z * 0.6, 5);
    r.rotation.z = Math.atan2(x * 0.5, 3.1) * -1 * 0.6; r.rotation.x = Math.atan2(z * 0.5, 3.1) * 0.9; g.add(r);
  }
  g.add(cyl(0.18, 0.25, 0.6, '#3a3f45', 0, 2.0, 3.6, 10, metal));      // Triebwerk hinten
  return g;
}

// ---------- Loot ----------
export function makeItemModel(item) {
  const g = new THREE.Group();
  if (item.ammo) {
    const c = AMMO[item.ammo].color;
    g.add(rbox(0.42, 0.22, 0.28, 0.05, '#3b4148', 0, 0.11, 0));
    g.add(rbox(0.44, 0.05, 0.3, 0.02, c, 0, 0.21, 0));
    for (let i = 0; i < 3; i++) g.add(cyl(0.025, 0.025, 0.1, '#c9a23a', -0.1 + i * 0.1, 0.28, 0, 8, { metalness: 0.6, roughness: 0.3 }));
    return g;
  }
  const d = DEFS[item.key];
  if (d.type === 'gun' || d.type === 'melee') { const w = makeWeaponModel(item.key, item.rarity); w.position.z = 0.4; g.add(w); return g; }
  const c = d.color;
  switch (item.key) {
    case 'grenade': g.add(sph(0.13, c, 0, 0.14, 0)); g.add(cyl(0.05, 0.05, 0.07, '#222', 0, 0.29, 0)); g.add(rbox(0.03, 0.12, 0.05, 0.01, '#888', 0.06, 0.25, 0)); break;
    case 'shockwave': g.add(sph(0.14, c, 0, 0.15, 0, { roughness: 0.25 })); g.add(cyl(0.155, 0.155, 0.05, '#e8e4dc', 0, 0.15, 0, 18)); break;
    case 'bandage': g.add(cyl(0.11, 0.11, 0.14, c, 0, 0.11, 0, 18).rotateZ(Math.PI / 2)); g.add(cyl(0.112, 0.112, 0.04, '#b84a3a', 0, 0.11, 0, 18).rotateZ(Math.PI / 2)); break;
    case 'medkit': g.add(rbox(0.42, 0.26, 0.26, 0.06, c, 0, 0.13, 0)); g.add(rbox(0.07, 0.19, 0.27, 0.02, '#f0ede6', 0, 0.13, 0)); g.add(rbox(0.19, 0.07, 0.27, 0.02, '#f0ede6', 0, 0.13, 0)); break;
    case 'minishield': case 'shield': {
      const s = item.key === 'shield' ? 1.4 : 1;
      g.add(cyl(0.1 * s, 0.12 * s, 0.24 * s, c, 0, 0.12 * s, 0, 18, { roughness: 0.2, metalness: 0.1 }));
      g.add(cyl(0.04 * s, 0.06 * s, 0.07 * s, '#e8e4dc', 0, 0.27 * s, 0, 12));
      g.add(cyl(0.045 * s, 0.045 * s, 0.03 * s, '#333', 0, 0.32 * s, 0, 12)); break;
    }
    case 'launchpad': g.add(rbox(0.5, 0.12, 0.5, 0.04, '#3b4148', 0, 0.06, 0)); g.add(rbox(0.42, 0.05, 0.42, 0.02, c, 0, 0.14, 0)); break;
    case 'grappler': g.add(rbox(0.1, 0.18, 0.38, 0.03, '#3b4148', 0, 0.12, 0)); g.add(cyl(0.05, 0.05, 0.12, c, 0, 0.12, -0.24, 10).rotateX(Math.PI / 2)); g.add(rbox(0.05, 0.12, 0.06, 0.02, '#222', 0, 0.02, 0.06)); break;
    case 'rift': { const s = mesh(geo('oct', () => new THREE.OctahedronGeometry(0.18, 1)), c, 0, 0.22, 0, { roughness: 0.2 }); g.add(s); break; }
    default: g.add(rbox(0.3, 0.3, 0.3, 0.06, c, 0, 0.15, 0));
  }
  return g;
}

export function makeRarityRing(rarity) {
  const m = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.42, 0.52, 32)),
    new THREE.MeshBasicMaterial({ color: RARITIES[rarity].color, transparent: true, opacity: 0.7, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
  return m;
}

export function makeLaunchPad() {
  const g = new THREE.Group();
  g.add(rbox(2.4, 0.22, 2.4, 0.08, '#33383e', 0, 0.11, 0));
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) g.add(cyl(0.12, 0.12, 0.12, '#9aa1a8', x, 0.27, z, 10, { metalness: 0.6 }));
  g.add(rbox(2.0, 0.08, 2.0, 0.04, '#c9a23a', 0, 0.35, 0));
  return g;
}
