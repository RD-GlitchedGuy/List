// Der Held: rundes Skinned-Mesh mit Skelett, prozedurale Animationen und Fäden
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, UP, DOWN, clamp, angDiff } from './util.js';
import { scene, camera } from './engine.js';
import { P, game, camF } from './state.js';
import { settings } from './settings.js';

/* ---------- Modell bauen ---------- */
function buildHero() {
  // Gelenkpositionen in Metern (Füße bei y=0, Blick nach +Z)
  const J = {
    hips: [0, .98, 0], spine: [0, 1.1, 0], chest: [0, 1.27, 0], neck: [0, 1.49, 0], head: [0, 1.6, .005],
    uArmL: [.195, 1.435, -.01], fArmL: [.212, 1.155, -.02], handL: [.222, .9, 0],
    uArmR: [-.195, 1.435, -.01], fArmR: [-.212, 1.155, -.02], handR: [-.222, .9, 0],
    thighL: [.098, .93, 0], shinL: [.104, .52, .012], footL: [.108, .095, -.01],
    thighR: [-.098, .93, 0], shinR: [-.104, .52, .012], footR: [-.108, .095, -.01],
  };
  const PAR = { spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', uArmL: 'chest', fArmL: 'uArmL', handL: 'fArmL', uArmR: 'chest', fArmR: 'uArmR', handR: 'fArmR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
  const names = Object.keys(J), id = {}; names.forEach((n, i) => id[n] = i);
  const bones = names.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
  names.forEach((n, i) => { const p = PAR[n], v = new V3(...J[n]); if (p) { v.sub(new V3(...J[p])); bones[id[p]].add(bones[i]); } bones[i].position.copy(v); });
  const jv = n => new V3(...J[n]);
  // Farbregionen: 0 Anzug, 1 Seitenteile, 2 Akzente, 3 Helm – werden später per Anzug-Editor umgefärbt
  const C = { base: 0, panel: 1, acc: 2, dark: 3 };
  const parts = [];

  // Gewichte (welcher Knochen bewegt welchen Punkt) und Farben pro Teil
  function skin(geo, wf, cf) {
    const p = geo.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), cl = new Float32Array(n * 3), rg = new Float32Array(n), v = new V3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i); const w = wf(v);
      si[i * 4] = w[0]; sw[i * 4] = w[1]; if (w.length > 2) { si[i * 4 + 1] = w[2]; sw[i * 4 + 1] = w[3]; }
      rg[i] = cf(v);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    geo.setAttribute('region', new THREE.Float32BufferAttribute(rg, 1));
    parts.push(geo);
  }
  // runde, sich verjüngende Gliedmaße mit Muskelwölbung (gedrechselt)
  function limb(a, b, rA, rB, bulge, at) {
    const L = a.distanceTo(b), pts = [], pw = Math.log(.5) / Math.log(at);
    for (let i = 0; i <= 8; i++) { const g = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(rA * Math.cos(g), rA * Math.sin(g))); }
    for (let i = 1; i < 10; i++) { const t = i / 10; pts.push(new THREE.Vector2((rA + (rB - rA) * t) * (1 + (bulge - 1) * Math.sin(Math.PI * Math.pow(t, pw))), t * L)); }
    for (let i = 0; i <= 8; i++) { const g = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(rB * Math.cos(g), L + rB * Math.sin(g))); }
    pts[0].x = 0; pts[pts.length - 1].x = 0;
    const g = new THREE.LatheGeometry(pts, 26);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new V3().subVectors(b, a).normalize())); g.translate(a.x, a.y, a.z);
    return g;
  }
  // weicher Übergang am Gelenk: Anfang der Gliedmaße folgt teilweise dem Elternknochen
  function limbW(a, b, bone, par, blend, pk) {
    const d = new V3().subVectors(b, a), L = d.length(), tv = new V3(); d.normalize();
    return v => { const t = clamp(tv.subVectors(v, a).dot(d) / L, 0, 1); if (par == null || t >= blend) return [bone, 1]; const k = (1 - t / blend) * pk; return [bone, 1 - k, par, k]; };
  }
  const one = b => () => [b, 1], col = c => () => c;

  // Rumpf
  const prof = [[0, .8], [.1, .808], [.152, .85], [.172, .93], [.166, 1.02], [.148, 1.11], [.15, 1.19], [.172, 1.29], [.19, 1.37], [.178, 1.44], [.12, 1.49], [.062, 1.525], [0, 1.535]];
  const tp = new THREE.SplineCurve(prof.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(56); tp.forEach(p => p.x = Math.max(0, p.x)); tp[0].x = 0; tp[tp.length - 1].x = 0;
  const torso = new THREE.LatheGeometry(tp, 44); torso.scale(1, 1, .7);
  skin(torso, v => { const y = v.y; if (y < 1.0) return [id.hips, 1]; if (y < 1.12) { const k = (y - 1) / .12; return [id.hips, 1 - k, id.spine, k]; } if (y < 1.24) { const k = (y - 1.12) / .12; return [id.spine, 1 - k, id.chest, k]; } return [id.chest, 1]; },
    v => {
      const ax = Math.abs(v.x);
      if (Math.abs(v.y - .955) < .02) return C.acc;                                   // Gürtel
      const yy = v.y - 1.265 - ax * .55; if (v.z > .035 && yy > 0 && yy < .05 && ax < .13) return C.acc; // Brustwinkel
      if (v.z < -.04 && ax < .02 && v.y > 1.0 && v.y < 1.45) return C.acc;             // Rückenlinie
      if (ax > .128 && v.y > 1.02 && v.y < 1.36) return C.panel;                       // Seitenteile
      return C.base;
    });
  skin(limb(new V3(0, 1.45, 0), new V3(0, 1.63, .005), .057, .05, 1.0, .5), limbW(new V3(0, 1.45, 0), new V3(0, 1.63, 0), id.neck, id.chest, .45, .5), col(C.base));
  skin(new THREE.SphereGeometry(.118, 40, 30).scale(.9, 1.08, 1).translate(0, 1.725, .012), one(id.head), col(C.dark));
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    skin(new THREE.SphereGeometry(.03, 16, 12).scale(.5, 1.6, 1.4).translate(s * .106, 1.74, -.01), one(id.head), col(C.acc));
    skin(new THREE.SphereGeometry(.07, 24, 18).scale(1, 1.12, 1).translate(s * .188, 1.425, -.008), one(id['uArm' + S]), col(C.panel));
    skin(limb(jv('uArm' + S), jv('fArm' + S), .06, .047, 1.1, .35), limbW(jv('uArm' + S), jv('fArm' + S), id['uArm' + S], id.chest, .12, .25), v => (s * v.x) > .248 ? C.acc : C.base);
    skin(limb(jv('fArm' + S), jv('hand' + S), .047, .037, 1.12, .3), limbW(jv('fArm' + S), jv('hand' + S), id['fArm' + S], id['uArm' + S], .22, .5), v => v.y < .975 ? C.acc : C.base);
    skin(new THREE.SphereGeometry(.05, 22, 16).scale(.62, 1.7, .95).translate(s * .226, .82, .006), one(id['hand' + S]), col(C.acc));
    skin(new THREE.SphereGeometry(.02, 12, 10).scale(1, 1.9, 1).translate(s * .212, .85, .036), one(id['hand' + S]), col(C.acc));
    skin(limb(jv('thigh' + S), jv('shin' + S), .098, .064, 1.06, .3), limbW(jv('thigh' + S), jv('shin' + S), id['thigh' + S], id.hips, .2, .45), v => (s * v.x) > .172 ? C.acc : C.base);
    skin(limb(jv('shin' + S), jv('foot' + S), .064, .045, 1.12, .28), limbW(jv('shin' + S), jv('foot' + S), id['shin' + S], id['thigh' + S], .2, .5), v => v.y < .34 ? C.acc : (v.z > .045 && Math.abs(v.y - .52) < .05 ? C.panel : C.base));
    skin(new THREE.SphereGeometry(.05, 20, 14).translate(s * .108, .095, -.01), one(id['foot' + S]), col(C.acc));
    skin(new THREE.SphereGeometry(.06, 28, 18).scale(.95, .82, 2.05).translate(s * .108, .052, .055), one(id['foot' + S]), v => v.y < .02 ? C.dark : C.acc);
  }
  const geo = mergeGeometries(parts);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .46, metalness: .1, clearcoat: .4, clearcoatRoughness: .35, sheen: .5, sheenRoughness: .5, sheenColor: new THREE.Color(0x8fa6d6), envMapIntensity: 1 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.1225, 40, 10, Math.PI / 2 - 1.0, 2.0, 1.28, .36).scale(.9, 1.08, 1),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff8a2a, emissiveIntensity: 1.6, roughness: .15, metalness: .6 }));
  visor.position.set(0, .125, .007); bones[id.head].add(visor);
  const B = {}; names.forEach((n, i) => B[n] = bones[i]);
  return { mesh, B, visor };
}

/* ---------- Gemeinsame Teile ---------- */
const _e = new THREE.Euler();
const _ap = new V3(), _aq = new THREE.Quaternion(), _ad = new V3();
const webMat = new THREE.MeshBasicMaterial({ color: 0xeef2ff });
const RS = 22, RR = 5;
function makeRope() {
  const pos = new Float32Array((RS + 1) * RR * 3), idx = [];
  for (let s = 0; s < RS; s++) for (let r = 0; r < RR; r++) { const a = s * RR + r, b = s * RR + (r + 1) % RR, c = a + RR, d = b + RR; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, webMat); m.frustumCulled = false; m.visible = false; scene.add(m);
  return { m, pos, g };
}
const _rd = new V3(), _rs = new V3(), _rn = new V3(), _rp = new V3();
function setRope(R, a, b, sag, wob) {
  _rd.subVectors(b, a); _rs.crossVectors(_rd, UP); if (_rs.lengthSq() < 1e-6) _rs.set(1, 0, 0); _rs.normalize(); _rn.crossVectors(_rs, _rd).normalize();
  const t = game.clock;
  for (let s = 0; s <= RS; s++) {
    const u = s / RS, bell = 4 * u * (1 - u);
    _rp.copy(a).addScaledVector(_rd, u).addScaledVector(DOWN, sag * bell).addScaledVector(_rs, wob * Math.sin(u * 12.6 + t * 38) * bell);
    const rad = .03 * (1 - .45 * u) + .01;
    for (let r = 0; r < RR; r++) {
      const an = r / RR * Math.PI * 2, c = Math.cos(an) * rad, sn = Math.sin(an) * rad, k = (s * RR + r) * 3;
      R.pos[k] = _rp.x + _rs.x * c + _rn.x * sn; R.pos[k + 1] = _rp.y + _rs.y * c + _rn.y * sn; R.pos[k + 2] = _rp.z + _rs.z * c + _rn.z * sn;
    }
  }
  R.g.attributes.position.needsUpdate = true; R.m.visible = true;
}
const _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3(), _q = new THREE.Quaternion();
function basisQuat(fw, up, out, yaw) {
  _y.copy(up).normalize(); _z.copy(fw).addScaledVector(_y, -fw.dot(_y));
  if (_z.lengthSq() < 1e-4) { _z.set(Math.sin(yaw), 0, Math.cos(yaw)); _z.addScaledVector(_y, -_z.dot(_y)); if (_z.lengthSq() < 1e-4) _z.set(0, 0, 1); }
  _z.normalize(); _x.crossVectors(_y, _z); _m.makeBasis(_x, _y, _z); out.setFromRotationMatrix(_m);
}
// Drehung des ganzen Körpers für jeden Trick: [Achse X, Y, Z in vollen Umdrehungen, Pose]
const TRICK_ROT = {
  flip: [1, 0, 0, 'tuck'], roll: [1, 0, 0, 'tuck'], back: [-1, 0, 0, 'tuck'], spin: [0, 2, 0, 'spread'], twist: [1, 1, 0, 'tuck'],
  barrel: [0, 0, 1, 'spread'], double: [2, 0, 0, 'tuck'], ropeSpin: [0, 1, 0, 'spread'], ropeFlip: [-1, 0, 0, 'tuck'],
};
const _v1 = new V3(), _v2 = new V3(), _q2 = new THREE.Quaternion();
const RATE = { hips: 13, spine: 13, chest: 13, neck: 9, head: 8, uArmL: 'arm', uArmR: 'arm', fArmL: 'arm', fArmR: 'arm', handL: 10, handR: 10, thighL: 'leg', thighR: 'leg', shinL: 'leg', shinR: 'leg', footL: 'leg', footR: 'leg' };
export const DEFAULT_COLORS = { base: '#1b2231', panel: '#34465f', acc: '#ff7a1a', dark: '#141922', visor: '#ff8a2a' };

/* ---------- Avatar: der eigene Held und jeder Mitspieler ---------- */
export class Avatar {
  constructor(colors) {
    const h = buildHero();
    this.mesh = h.mesh; this.B = h.B; this.visor = h.visor;
    this.root = new THREE.Group(); this.pivot = new THREE.Group(); this.model = new THREE.Group();
    this.model.add(this.mesh); this.model.position.y = -.95; this.pivot.add(this.model); this.root.add(this.pivot); scene.add(this.root);
    this.tgt = {}; for (const n in this.B) this.tgt[n] = new THREE.Quaternion();
    this.ropes = [makeRope(), makeRope()];
    this.splats = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 1), webMat); m.visible = false; scene.add(m); return m; });
    this.crouch = -.95; this.phase = 0; this.anim = ''; this.animT = 0; this.prevYaw = 0; this.bank = 0; this.cOff = new V3(0, .95, 0); this.webT = 1; this.lastAnchor = new V3();
    this.setColors(colors || DEFAULT_COLORS);
  }
  setColors(c) {
    c = Object.assign({}, DEFAULT_COLORS, c);
    const pal = [c.base, c.panel, c.acc, c.dark].map(x => new THREE.Color(x));
    const g = this.mesh.geometry, rg = g.attributes.region.array, col = g.attributes.color;
    for (let i = 0; i < rg.length; i++) { const p = pal[rg[i]]; col.setXYZ(i, p.r, p.g, p.b); }
    col.needsUpdate = true;
    this.visor.material.emissive.set(c.visor);
  }
  dispose() {
    scene.remove(this.root); this.ropes.forEach(r => { scene.remove(r.m); r.g.dispose(); }); this.splats.forEach(m => scene.remove(m));
    this.mesh.geometry.dispose();
  }
  T(n, x = 0, y = 0, z = 0) { this.tgt[n].setFromEuler(_e.set(x, y, z)); }
  aim(n, wp) { const b = this.B[n]; b.getWorldPosition(_ap); _ad.subVectors(wp, _ap).normalize(); b.parent.getWorldQuaternion(_aq).invert(); _ad.applyQuaternion(_aq); this.tgt[n].setFromUnitVectors(DOWN, _ad); }
  slingPts(S) { return S.sling || []; }   // Ankerpunkte des Katapults (nur echte Treffer)

  update(S, dt, local) {
    const hv = new V3(S.vel.x, 0, S.vel.z), hs = hv.length();
    const fw = new V3(), up = new V3(0, 1, 0), off = new V3(0, .95, 0);
    const yawV = () => new V3(Math.sin(S.faceYaw), 0, Math.cos(S.faceYaw));
    let anim = 'idle';
    switch (S.state) {
      case 'ground': if (hs > .6) S.faceYaw = Math.atan2(hv.x, hv.z); fw.copy(yawV()); anim = S.land > 0 ? 'land' : hs > .6 ? 'run' : 'idle'; break;
      case 'charge': if (local) S.faceYaw = Math.atan2(camF.x, camF.z); fw.copy(yawV()); anim = 'charge'; break;
      case 'air':
        if (hs > .6) S.faceYaw = Math.atan2(hv.x, hv.z);
        if (S.diving) { up.copy(S.vel).normalize(); fw.set(0, -1, 0); anim = 'dive'; }
        else { up.set(hv.x * .012, 1, hv.z * .012); fw.copy(yawV()); anim = S.zipFx ? 'zip' : 'air'; }
        break;
      case 'swing': case 'corner':
        up.subVectors(S.anchors[0], S.pos); fw.copy(S.vel.lengthSq() > 1 ? S.vel : yawV()); if (hs > .6) S.faceYaw = Math.atan2(hv.x, hv.z); anim = 'swing'; break;
      case 'zip': if (S.zip) up.subVectors(S.zip.target, S.pos); fw.set(0, -1, 0); anim = 'zip'; break;
      case 'splat': {
        const s = S.splat; if (!s) break;
        if (s.kind === 'ground') { up.set(Math.sin(S.faceYaw), 0, Math.cos(S.faceYaw)); fw.set(0, -1, 0); off.set(0, .16, 0); anim = 'sprawl'; }
        else { fw.copy(s.n).negate(); off.set(-s.n.x * .27, .95, -s.n.z * .27); anim = 'splatWall'; }
        break;
      }
      case 'wall': up.copy(S.wallN); fw.set(0, 1, 0); off.set(S.wallN.x * .5, .9, S.wallN.z * .5); anim = S.vel.lengthSq() > .5 ? 'run' : 'cling'; break;
    }
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
    // in Kurven legen: Drehgeschwindigkeit der Blickrichtung kippt den Körper zur Seite
    const yawRate = angDiff(S.faceYaw, this.prevYaw) / Math.max(dt, 1e-3); this.prevYaw = S.faceYaw;
    const bankT = (S.state === 'ground' && hs > 3) || S.state === 'swing' || S.state === 'corner' || (S.state === 'air' && !S.diving) ? clamp(-yawRate * (S.state === 'ground' ? .07 : .12), -.45, .45) : 0;
    this.bank += (bankT - this.bank) * (1 - Math.exp(-6 * dt));
    if (Math.abs(this.bank) > .01) { const fh = _v1.set(Math.sin(S.faceYaw), 0, Math.cos(S.faceYaw)); up.normalize().addScaledVector(_v2.set(-fh.z, 0, fh.x), this.bank); }
    basisQuat(fw, up, _q, S.faceYaw);
    this.root.quaternion.slerp(_q, 1 - Math.exp(-12 * dt));
    this.cOff.lerp(off, 1 - Math.exp(-15 * dt));
    this.root.position.copy(S.pos).add(this.cOff);
    this.root.updateMatrixWorld(true);
    // Tricks und Landerolle drehen den ganzen Körper um seine Mitte
    const tr = S.trick || (S.roll > 0 ? { type: 'roll', t: .55 - S.roll, dur: .55 } : null);
    if (tr && TRICK_ROT[tr.type]) {
      const e = clamp(tr.t / tr.dur, 0, 1), ee = e < .5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2, R = TRICK_ROT[tr.type], a = Math.PI * 2 * ee;
      this.pivot.quaternion.setFromEuler(_e.set(R[0] * a, R[1] * a, R[2] * a));
      if (S.state !== 'swing' && S.state !== 'corner') anim = R[3]; else if (R[3] === 'spread') anim = 'spread';
    } else this.pivot.quaternion.identity();
    this.pose(S, anim, dt, hs);
    this.root.updateMatrixWorld(true);
    this.updateWebs(S, dt);
  }

  // Posen werden als Euler-Tabellen gebaut, gemischt und erst am Ende in Drehungen umgewandelt.
  pose(S, anim, dt, hs) {
    if (anim !== this.anim) { this.anim = anim; this.animT = 0; } else this.animT += dt;
    const E = {}, t = game.clock, at = this.animT;
    const set = (n, x = 0, y = 0, z = 0) => { E[n] = [x, y, z]; };
    const add = (n, x = 0, y = 0, z = 0) => { const e = E[n] || (E[n] = [0, 0, 0]); e[0] += x; e[1] += y; e[2] += z; };
    const mixIn = (P_, w) => { for (const n in P_) { const p = P_[n]; add(n, (p[0] || 0) * w, (p[1] || 0) * w, (p[2] || 0) * w); } };
    const sm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
    const aims = [];                  // Arme, die auf einen Punkt zeigen (Faden), plus Zusatzdrehung
    let bob = 0, crouch = 0, legRate = 10, armRate = 11;
    const vy = S.vel.y, sp = S.vel.length();

    if (anim === 'idle') {
      // Atmen, Gewicht verlagern, ab und zu umschauen
      const br = Math.sin(t * 1.6), sh = Math.sin(t * .45);
      set('chest', br * .03); set('spine', .02 + br * .01);
      set('hips', 0, 0, sh * .045); set('thighL', -.02, 0, .05 - sh * .04); set('thighR', .02, 0, -.05 - sh * .04);
      set('shinL', .06 + Math.max(0, sh) * .12); set('shinR', .06 + Math.max(0, -sh) * .12);
      set('uArmL', .05 + br * .02, 0, .14 + br * .015); set('uArmR', .05 + br * .02, 0, -.14 - br * .015);
      set('fArmL', -.22); set('fArmR', -.22); set('handL', 0, 0, .1); set('handR', 0, 0, -.1);
      const look = Math.sin(t * .31) * .4 + Math.sin(t * .83) * .12;
      set('head', -.04 + Math.sin(t * .27) * .05, look); set('neck', 0, look * .25);
      bob = br * .006;
    } else if (anim === 'run') {
      const climb = S.state === 'wall', s = climb ? Math.abs(vy) + 3 : hs;
      const A = clamp(s / 16, 0, 1), sprint = clamp((s - 10) / 7, 0, 1);
      this.phase += dt * Math.PI * 2 * (1.25 + s * .11);
      const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);
      // Fuß setzt auf, wenn die Beinbewegung die Richtung wechselt
      if (this.onStep && this.lastSn !== undefined && Math.sign(sn) !== Math.sign(this.lastSn)) this.onStep(climb, A, this.root.position);
      this.lastSn = sn;
      const swing = .32 + .62 * A, lean = .05 + .28 * A;
      // Beine: Schwungbein beugt stark, Standbein federt beim Aufsetzen, Fuß rollt ab
      set('thighL', -sn * swing - .08 * A, 0, .03); set('thighR', sn * swing - .08 * A, 0, -.03);
      set('shinL', .12 + (.45 + 1.25 * A) * Math.max(0, cs) + .18 * Math.max(0, sn) * A);
      set('shinR', .12 + (.45 + 1.25 * A) * Math.max(0, -cs) + .18 * Math.max(0, -sn) * A);
      set('footL', -.3 * Math.max(0, cs) + .35 * Math.max(0, -sn) * A); set('footR', -.3 * Math.max(0, -cs) + .35 * Math.max(0, sn) * A);
      // Oberkörper dreht gegen das Becken, Kopf bleibt ruhig
      set('hips', 0, -sn * .16 * A, cs * .05); set('spine', lean, sn * .08 * A); set('chest', .04 * sprint, sn * .2 * A);
      set('head', -lean * .85, -sn * .12 * A); set('neck', -lean * .2);
      if (!climb) {
        set('uArmL', sn * (.25 + .75 * A), 0, .09 + .08 * A); set('uArmR', -sn * (.25 + .75 * A), 0, -.09 - .08 * A);
        set('fArmL', -(.35 + .9 * A) - .35 * Math.max(0, -sn) * A); set('fArmR', -(.35 + .9 * A) - .35 * Math.max(0, sn) * A);
        set('handL', 0, 0, .15); set('handR', 0, 0, -.15);
      } else {
        // Wandlauf: Arme greifen abwechselnd nach oben
        set('uArmL', -1.7 - .9 * Math.max(0, -sn) + .4 * Math.max(0, sn), 0, .35); set('uArmR', -1.7 - .9 * Math.max(0, sn) + .4 * Math.max(0, -sn), 0, -.35);
        set('fArmL', -.3 - .9 * Math.max(0, sn)); set('fArmR', -.3 - .9 * Math.max(0, -sn));
        set('head', -.45); set('spine', .25);
      }
      bob = (Math.abs(cs) * .085 - .045) * A;
    } else if (anim === 'cling') {
      const br = Math.sin(t * 2.2), look = Math.sin(t * .5) * .5;
      set('thighL', -1.05, 0, .28); set('thighR', -.9, 0, -.24); set('shinL', 1.7); set('shinR', 1.5); set('footL', -.5); set('footR', -.45);
      set('uArmL', -1.6 + br * .03, 0, .45); set('uArmR', -1.05, 0, -.55); set('fArmL', -.45); set('fArmR', -.8);
      set('spine', .22 + br * .02); set('chest', br * .03); set('head', -.25, look); set('neck', 0, look * .3);
    } else if (anim === 'air') {
      // fließend zwischen Steigen, Scheitelpunkt und Fallen mischen
      const r = clamp(vy / 12, -1, 1), wu = Math.max(0, r), wd = Math.max(0, -r), wa = 1 - Math.abs(r);
      const fl = clamp(-vy / 30, 0, 1), w1 = Math.sin(t * 7.3), w2 = Math.sin(t * 6.1 + 1.3);
      mixIn({ thighL: [-1.1, 0, .08], shinL: [1.6], thighR: [-.45, 0, -.06], shinR: [.85], footL: [-.3], footR: [-.2], uArmL: [-.95, 0, .65], uArmR: [-.35, 0, -1.0], fArmL: [-.65], fArmR: [-.5], spine: [.2], head: [-.15] }, wu);
      mixIn({ thighL: [-.65, 0, .12], shinL: [1.05], thighR: [-.15, 0, -.1], shinR: [.45], uArmL: [-.3, 0, 1.15], uArmR: [-.25, 0, -1.2], fArmL: [-.35], fArmR: [-.35], spine: [.05], head: [-.1] }, wa);
      mixIn({ thighL: [-.4, 0, .25], shinL: [.75], thighR: [.2, 0, -.22], shinR: [.4], footL: [.2], footR: [.3], uArmL: [-.55, 0, 1.55], uArmR: [-.5, 0, -1.6], fArmL: [-.3], fArmR: [-.25], spine: [-.12], head: [-.3] }, wd);
      // je schneller der Fall, desto mehr rudern Arme und Beine
      add('uArmL', w1 * .12 * fl, 0, w1 * .3 * fl); add('uArmR', -w2 * .12 * fl, 0, -w2 * .3 * fl);
      add('thighL', w2 * .25 * fl); add('thighR', -w1 * .25 * fl); add('fArmL', w2 * .2 * fl); add('fArmR', w1 * .2 * fl);
    } else if (anim === 'dive') {
      const fl = Math.sin(t * 11) * .07;
      set('uArmL', .45, 0, .18); set('uArmR', .45, 0, -.18); set('fArmL', -.05); set('fArmR', -.05); set('handL', 0, 0, .3); set('handR', 0, 0, -.3);
      set('thighL', .04 + fl, 0, .03); set('thighR', .06 - fl, 0, -.03); set('shinL', .12 + fl); set('shinR', .2 - fl); set('footL', .5); set('footR', .5);
      set('spine', -.15); set('chest', -.08); set('head', -.85); set('neck', -.2);
    } else if (anim === 'swing') {
      // Phase des Pendels: <0 hinter dem Anker (fällt nach unten), >0 davor (steigt)
      const rel = _v1.subVectors(S.pos, S.anchors[S.nAnch === 2 ? 0 : 0]);
      const fwd = _v2.set(S.vel.x, 0, S.vel.z); if (fwd.lengthSq() < .5) fwd.set(Math.sin(S.faceYaw), 0, Math.cos(S.faceYaw)); fwd.normalize();
      const u = clamp(Math.atan2(rel.dot(fwd), -rel.y) / 1.05, -1, 1), fast = clamp(sp / 40, 0, 1);
      const thB = u < 0 ? -.35 + .7 * (-u) : -.35 - .95 * u, shB = u < 0 ? 1.0 - .7 * (-u) : 1.0 - .75 * u;
      set('thighL', thB, 0, .07 * (1 - fast)); set('thighR', thB * .8 + .15, 0, -.07 * (1 - fast));
      set('shinL', shB); set('shinR', shB + .2); set('footL', .25 + .2 * u); set('footR', .3);
      set('spine', .12 + .22 * u); set('chest', .05 * u, S.side * .22); set('hips', 0, -S.side * .12);
      set('head', -.2 - .25 * u, -S.side * .1);
      if (S.nAnch === 2) { aims.push(['uArmR', S.anchors[0]], ['uArmL', S.anchors[1]]); set('fArmL', -.12); set('fArmR', -.12); }
      else {
        const ra = S.side > 0 ? 'R' : 'L', oa = S.side > 0 ? 'L' : 'R', sg = oa === 'L' ? 1 : -1;
        aims.push(['uArm' + ra, S.anchors[0]]); set('fArm' + ra, -.12); set('hand' + ra, -.3);
        set('uArm' + oa, .3 - .55 * u, 0, sg * (1.05 + .25 * u)); set('fArm' + oa, -.45 - .25 * Math.max(0, u)); set('hand' + oa, 0, 0, sg * .2);
      }
      legRate = 6;                    // Beine schwingen hinterher
    } else if (anim === 'zip') {
      const p = S.zip ? S.zip.target : (S.zipFx ? S.zipFx.p : null), d = p ? p.distanceTo(S.pos) : 0, pull = clamp(1 - d / 28, 0, 1);
      if (p) { aims.push(['uArmL', p], ['uArmR', p]); }
      set('fArmL', -.15 - 1.1 * pull); set('fArmR', -.15 - 1.1 * pull);
      set('thighL', .25 - 1.2 * pull, 0, .06); set('thighR', .4 - 1.0 * pull, 0, -.06); set('shinL', .4 + 1.3 * pull); set('shinR', .8 + 1.0 * pull);
      set('spine', -.1 + .4 * pull); set('head', -.35 + .2 * pull);
    } else if (anim === 'charge') {
      const c = S.charge || 0, tr = Math.sin(t * 43) * .035 * c;
      set('thighL', -1.35 - .1 * c, 0, .14); set('thighR', -1.35 - .1 * c, 0, -.14); set('shinL', 2.1 + .1 * c); set('shinR', 2.1 + .1 * c); set('footL', -.75); set('footR', -.75);
      set('spine', .45 + .1 * c + tr); set('chest', tr); set('head', -.45 - .1 * c);
      const sl = this.slingPts(S); if (sl[0]) aims.push(['uArmR', sl[0]]); if (sl[1]) aims.push(['uArmL', sl[1]]);
      set('fArmL', -.3 - .5 * c + tr); set('fArmR', -.3 - .5 * c - tr);
      crouch = -.38 - .1 * c;
    } else if (anim === 'sprawl') {          // flach auf dem Bauch, federt nach dem Aufprall kurz nach
      const k = Math.exp(-at * 6) * Math.sin(at * 26) * .35, br = Math.sin(t * 3) * .025;
      set('uArmL', -.15 + k, 0, 2.4 - k); set('uArmR', -.1 - k, 0, -2.3 + k); set('fArmL', -.35 + k); set('fArmR', -.2);
      set('thighL', .05 - k, 0, .38); set('thighR', .1 + k, 0, -.32); set('shinL', .3 + k); set('shinR', .15 - k * .5); set('footL', .5); set('footR', .5);
      set('head', .25 - k * .5, .95); set('chest', br); set('spine', -k * .3);
    } else if (anim === 'splatWall') {       // platt an der Fassade, Glieder federn nach
      const k = Math.exp(-at * 6) * Math.sin(at * 24) * .3;
      set('uArmL', -.1, 0, 2.2 + k); set('uArmR', -.15, 0, -2.05 - k); set('fArmL', -.3 - k); set('fArmR', -.45 + k);
      set('thighL', -.05 + k, 0, .32); set('thighR', -.2 - k, 0, -.26); set('shinR', .45 + k); set('shinL', .1); set('footL', .3); set('footR', .3);
      set('head', k * .4, .9); set('spine', -.05 - k * .3);
    } else if (anim === 'tuck') {
      set('thighL', -1.95, 0, .15); set('thighR', -1.9, 0, -.15); set('shinL', 2.25); set('shinR', 2.2); set('footL', -.4); set('footR', -.4);
      set('uArmL', -1.05, 0, .32); set('uArmR', -1.0, 0, -.32); set('fArmL', -1.7); set('fArmR', -1.65); set('spine', .55); set('chest', .15); set('head', .35);
      legRate = armRate = 18;
    } else if (anim === 'spread') {
      set('uArmL', -.2, 0, 1.5); set('uArmR', -.2, 0, -1.5); set('fArmL', -.08); set('fArmR', -.08); set('handL', 0, 0, .2); set('handR', 0, 0, -.2);
      set('thighL', -.25, 0, .38); set('thighR', .12, 0, -.38); set('shinL', .45); set('shinR', .3); set('footL', .3); set('footR', .3); set('head', -.25); set('spine', -.08);
      legRate = armRate = 16;
    } else if (anim === 'land') {
      const k = clamp((S.land || 0) / .45, 0, 1), d = sm(0, 1, k);   // tief einfedern, dann aufrichten
      set('thighL', -.5 - .6 * d, 0, .12); set('thighR', -.5 - .6 * d, 0, -.12); set('shinL', .8 + .8 * d); set('shinR', .8 + .8 * d); set('footL', -.3 - .3 * d); set('footR', -.3 - .3 * d);
      set('spine', .2 + .25 * d); set('head', -.2 * d);
      set('uArmL', -.25 - .2 * d, 0, .45 + .25 * d); set('uArmR', -.25 - .2 * d, 0, -.45 - .25 * d); set('fArmL', -.45); set('fArmR', -.45);
      crouch = -.08 - .2 * d;
    }

    // Euler-Tabellen in Ziel-Drehungen umwandeln, Faden-Arme ausrichten
    const tgt = this.tgt;
    for (const n in tgt) { const e = E[n]; if (e) tgt[n].setFromEuler(_e.set(e[0], e[1], e[2])); else tgt[n].identity(); }
    for (const [n, p] of aims) { this.aim(n, p); const e = E[n]; if (e) tgt[n].multiply(_q2.setFromEuler(_e.set(e[0], e[1], e[2]))); }
    // jede Körperpartie mit eigenem Tempo: Rumpf schnell, Kopf ruhig, Beine im Schwung mit Nachlauf
    for (const n in tgt) {
      const r = RATE[n] === 'leg' ? legRate : RATE[n] === 'arm' ? armRate : RATE[n] || 12;
      this.B[n].quaternion.slerp(tgt[n], 1 - Math.exp(-r * dt));
    }
    this.crouch += (-.95 + bob + crouch - this.crouch) * (1 - Math.exp(-16 * dt));
    this.model.position.y = this.crouch;
  }

  rope(i, hand, target, slack) {
    this.B[hand].getWorldPosition(_hp);
    const shoot = this.webT < 1;
    _he.copy(_hp).lerp(target, this.webT);
    setRope(this.ropes[i], _hp, _he, shoot ? .6 * this.webT : slack, shoot ? .35 * (1 - this.webT) : 0);
    if (!shoot) { this.splats[i].position.copy(target); this.splats[i].visible = true; }
  }
  updateWebs(S, dt) {
    this.ropes[0].m.visible = this.ropes[1].m.visible = this.splats[0].visible = this.splats[1].visible = false;
    // neuer Ankerpunkt = Faden wird neu abgeschossen
    const a = S.state === 'zip' && S.zip ? S.zip.target : S.anchors[0];
    if ((S.state === 'swing' || S.state === 'corner' || S.state === 'zip') && a.distanceToSquared(this.lastAnchor) > 1) { this.webT = 0; this.lastAnchor.copy(a); if (this.onShoot) this.onShoot(); }
    this.webT = Math.min(1, this.webT + dt * 9);
    if (S.state === 'swing' || S.state === 'corner') {
      const slack = S.state === 'swing' ? Math.min(2.5, Math.max(0, (S.L || 0) - S.pos.distanceTo(S.anchors[0])) * .7) : 0;
      if (S.nAnch === 2) { this.rope(0, 'handR', S.anchors[0], slack); this.rope(1, 'handL', S.anchors[1], slack); }
      else this.rope(0, S.side > 0 ? 'handR' : 'handL', S.anchors[0], slack);
    } else if (S.state === 'zip' && S.zip) this.rope(0, 'handR', S.zip.target, 0);
    else if (S.state === 'charge') { const s = this.slingPts(S), c = S.charge || 0; this.webT = 1; if (s[0]) this.rope(0, 'handR', s[0], .4 * (1 - c)); if (s[1]) this.rope(1, 'handL', s[1], .4 * (1 - c)); }
    else if (S.zipFx) { this.webT = 1; this.rope(0, 'handR', S.zipFx.p, 0); this.rope(1, 'handL', S.zipFx.p, 0); }
    if (S.state !== 'swing' && S.state !== 'corner' && S.state !== 'zip') this.lastAnchor.set(1e9, 0, 0);
  }
}
const _hp = new V3(), _he = new V3();

/* ---------- Der eigene Held mit Tempo-Spuren ---------- */
export const hero = new Avatar(settings.colors);
const TN = 30;
function makeTrail() {
  const pos = new Float32Array(TN * 2 * 3), col = new Float32Array(TN * 2 * 3), idx = [];
  for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; scene.add(m);
  return { m, g, pos, col, pts: Array.from({ length: TN }, () => new V3()), init: false };
}
const trails = [makeTrail(), makeTrail()];
const _tc = new V3(), _tt = new V3(), _ts = new V3(), _fp = new V3();
const trailCol = new THREE.Color();
function updateTrail(T_, src, k) {
  if (!T_.init) { T_.pts.forEach(p => p.copy(src)); T_.init = true; }
  for (let i = TN - 1; i > 0; i--) T_.pts[i].copy(T_.pts[i - 1]);
  T_.pts[0].copy(src);
  let cum = 0;
  for (let i = 0; i < TN; i++) {
    const p = T_.pts[i], q = T_.pts[Math.min(TN - 1, i + 1)];
    _tt.subVectors(p, q); _tc.subVectors(camera.position, p); _ts.crossVectors(_tt, _tc); if (_ts.lengthSq() < 1e-8) _ts.set(0, 1, 0); _ts.normalize();
    // Spur ist höchstens 12 m lang, egal wie schnell oder ruckelig das Bild läuft
    const f = Math.pow(Math.max(0, 1 - Math.max(i / TN, cum / 12)), 1.4), w = .16 * f; cum += _tt.length();
    T_.pos.set([p.x + _ts.x * w, p.y + _ts.y * w, p.z + _ts.z * w, p.x - _ts.x * w, p.y - _ts.y * w, p.z - _ts.z * w], i * 6);
    const c = f * k; T_.col.set([trailCol.r * c, trailCol.g * c, trailCol.b * c, trailCol.r * c, trailCol.g * c, trailCol.b * c], i * 6);
  }
  T_.g.attributes.position.needsUpdate = true; T_.g.attributes.color.needsUpdate = true;
}
export function setHeroColors(c) { hero.setColors(c); trailCol.set(Object.assign({}, DEFAULT_COLORS, c).acc); }
setHeroColors(settings.colors);

export const marker = new THREE.Mesh(new THREE.RingGeometry(.75, 1.05, 36), new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: .9, depthTest: false, side: THREE.DoubleSide }));
marker.renderOrder = 10; marker.visible = false; scene.add(marker);

export function updateHero(dt) {
  hero.update(P, dt, true);
  const k = clamp((P.vel.length() - 16) / 30, 0, 1);
  trails.forEach((tr, i) => { (i ? hero.B.footL : hero.B.footR).getWorldPosition(_fp); tr.m.visible = k > 0.01; updateTrail(tr, _fp, k * 1.6); });
}
