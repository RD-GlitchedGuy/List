// Leben in der Stadt: Fußgänger, Taubenschwärme, Hubschrauber
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, UP, rand, rr } from './util.js';
import { scene } from './engine.js';
import { walks, roofTops, aveX, strZ, NX, NZ, MID_Z } from './city.js';
import { P } from './state.js';
import { sfx } from './audio.js';

const M4 = new THREE.Matrix4(), _p = new V3(), _s = new V3(1, 1, 1), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

/* ---------- Fußgänger auf den Gehwegen ---------- */
const NP = 420;
const peds = [];
const pedBody = new THREE.InstancedMesh(mergeGeometries([new THREE.CapsuleGeometry(.2, .75, 4, 10).translate(0, .78, 0), new THREE.CylinderGeometry(.1, .1, .45, 6).translate(.09, .3, 0), new THREE.CylinderGeometry(.1, .1, .45, 6).translate(-.09, .3, 0)]),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }), NP);
const pedHead = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 12, 10).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 }), NP);
{
  const cloth = [0x2c3e50, 0x8e44ad, 0xc0392b, 0x27ae60, 0xd35400, 0x34495e, 0x7f8c8d, 0xf1c40f, 0x16a085, 0x5d4037, 0x1a1a1a, 0xecf0f1];
  const skin = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];
  for (let i = 0; i < NP; i++) {
    const w = walks[Math.floor(rand() * walks.length)], m = 1.4;
    const x0 = w[0] + m, z0 = w[1] + m, x1 = w[2] - m, z1 = w[3] - m;
    peds.push({ x0, z0, x1, z1, per: 2 * ((x1 - x0) + (z1 - z0)), s: rand() * 1000, sp: rr(1.1, 1.7) * (rand() < .5 ? 1 : -1), ph: rand() * 6, flee: 0 });
    pedBody.setColorAt(i, new THREE.Color(cloth[Math.floor(rand() * cloth.length)]));
    pedHead.setColorAt(i, new THREE.Color(skin[Math.floor(rand() * skin.length)]));
  }
  pedBody.castShadow = true; scene.add(pedBody, pedHead);
}
function perimeter(p, s) {  // Punkt und Laufrichtung auf dem Rechteck-Rundweg
  const W = p.x1 - p.x0, D = p.z1 - p.z0; s = ((s % p.per) + p.per) % p.per;
  if (s < W) return [p.x0 + s, p.z0, 1, 0]; s -= W;
  if (s < D) return [p.x1, p.z0 + s, 0, 1]; s -= D;
  if (s < W) return [p.x1 - s, p.z1, -1, 0]; s -= W;
  return [p.x0, p.z1 - s, 0, -1];
}

/* ---------- Taubenschwärme ---------- */
const flocks = [], birds = [];
{
  for (let k = 0; k < 16; k++) {
    let home;
    if (k % 3 === 0) { const r = roofTops[Math.floor(rand() * roofTops.length)]; home = new V3(r[0], r[1] + .25, r[2]); }
    else home = new V3(aveX(Math.floor(rand() * (NX + 1))) + rr(-9, 9), .25, strZ(Math.floor(rand() * (NZ + 1))) + rr(-5, 5));
    const f = { home, state: 'idle', t: 0, birds: [] }; flocks.push(f);
    for (let i = 0; i < 10; i++) {
      const b = { off: new V3(rr(-2.2, 2.2), 0, rr(-2.2, 2.2)), pos: new V3(), vel: new V3(), yaw: rand() * 6.3, flap: rand() * 6, peck: rand() * 6 };
      b.pos.copy(home).add(b.off); f.birds.push(b); birds.push(b);
    }
  }
}
const NB = birds.length;
const birdBody = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 10, 8).scale(.8, .75, 1.5), new THREE.MeshStandardMaterial({ color: 0x6f7a86, roughness: .8 }), NB);
const wingGeo = s => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .1, s * .38, 0, -.02, 0, 0, -.12], 3)); g.computeVertexNormals(); return g; };
const wingMat = new THREE.MeshStandardMaterial({ color: 0x5b6672, roughness: .8, side: THREE.DoubleSide });
const wingL = new THREE.InstancedMesh(wingGeo(1), wingMat, NB), wingR = new THREE.InstancedMesh(wingGeo(-1), wingMat, NB);
scene.add(birdBody, wingL, wingR);

/* ---------- Hubschrauber über Midtown ---------- */
export const heli = new THREE.Group();
const rotor = new THREE.Group(), tailRotor = new THREE.Group();
{
  const body = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: .4, metalness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: .6 });
  heli.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14).scale(1, .9, 1.8), body));
  heli.add(new THREE.Mesh(new THREE.CylinderGeometry(.25, .45, 6, 10).rotateX(Math.PI / 2).translate(0, .3, -4.5), body));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12).scale(1, .8, 1.1).translate(0, .3, 1.6), new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: .05, metalness: .8 }));
  heli.add(glass);
  for (const s of [-1, 1]) heli.add(new THREE.Mesh(new THREE.BoxGeometry(.12, .12, 3.6).translate(s * 1.1, -1.55, 0), dark));
  for (let i = 0; i < 2; i++) rotor.add(new THREE.Mesh(new THREE.BoxGeometry(11, .06, .35), dark).rotateY(i * Math.PI / 2));
  rotor.position.y = 1.6; heli.add(rotor);
  tailRotor.add(new THREE.Mesh(new THREE.BoxGeometry(.06, 2.2, .2), dark)); tailRotor.position.set(.3, .5, -7.4); heli.add(tailRotor);
  heli.blink = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6).translate(0, -1.4, -1), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  heli.add(heli.blink);
  heli.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(heli);
}

export function updateLife(dt, t) {
  // Fußgänger
  const pp = P.pos, fast = P.vel.length() > 6;
  for (let i = 0; i < NP; i++) {
    const p = peds[i];
    const [x, z, dx, dz] = perimeter(p, p.s);
    const dd = Math.hypot(x - pp.x, z - pp.z);
    if (dd < 4 && pp.y < 3 && (fast || P.state === 'splat')) p.flee = 2.5;   // erschrecken und weglaufen
    p.flee -= dt;
    const away = Math.sign((x - pp.x) * dx + (z - pp.z) * dz) || 1, sp = p.flee > 0 ? away * Math.abs(p.sp) * 3.2 : p.sp;
    p.s += sp * dt; p.ph += Math.abs(sp) * dt * 5.5;
    const dir = Math.sign(sp) || 1;
    _q.setFromAxisAngle(UP, Math.atan2(dx * dir, dz * dir));
    M4.compose(_p.set(x, .22 + Math.abs(Math.sin(p.ph)) * .05, z), _q, _s.set(1, 1, 1));
    pedBody.setMatrixAt(i, M4); pedHead.setMatrixAt(i, M4);
  }
  pedBody.instanceMatrix.needsUpdate = true; pedHead.instanceMatrix.needsUpdate = true;

  // Tauben: aufschrecken, wenn man schnell vorbeikommt, später zurückkehren
  let bi = 0;
  for (const f of flocks) {
    const d = f.home.distanceTo(pp);
    if (f.state === 'idle' && d < 13 && (fast || P.state === 'splat')) {
      f.state = 'fly'; f.t = 0; sfx('pigeons', { pos: f.home, vol: .9, rev: .3, ref: 5 });
      for (const b of f.birds) { const a = new V3().subVectors(b.pos, pp).setY(0).normalize(); b.vel.set(a.x * rr(3, 6) + rr(-1.5, 1.5), rr(4.5, 7.5), a.z * rr(3, 6) + rr(-1.5, 1.5)); }
    }
    f.t += dt;
    if (f.state === 'fly' && f.t > 6) f.state = 'back';
    for (const b of f.birds) {
      if (f.state === 'fly') { b.vel.y -= 1.2 * dt; b.vel.x += Math.sin(t * 2 + b.peck) * dt * 2; b.pos.addScaledVector(b.vel, dt); b.flap += dt * 22; b.yaw = Math.atan2(b.vel.x, b.vel.z); }
      else if (f.state === 'back') {
        const target = _p.copy(f.home).add(b.off), to = target.clone().sub(b.pos), l = to.length();
        if (l > .3) { b.pos.addScaledVector(to, Math.min(1, dt * 2.5 / Math.max(1, l * .25))); b.yaw = Math.atan2(to.x, to.z); b.flap += dt * 16; }
        else b.flap = 0;
        if (f.t > 16 && d > 25) { f.state = 'idle'; f.birds.forEach(x => x.pos.copy(f.home).add(x.off)); }
      } else { b.flap = 0; b.peck += dt * (2 + (bi % 3)); }
      const onGround = f.state === 'idle', bob = onGround ? Math.max(0, Math.sin(b.peck)) * .5 : 0;
      _q.setFromEuler(_e.set(bob, b.yaw, 0));
      M4.compose(b.pos, _q, _s.set(1, 1, 1)); birdBody.setMatrixAt(bi, M4);
      const wa = onGround ? .05 : Math.sin(b.flap) * .9;
      _q2.setFromEuler(_e.set(0, 0, wa)); M4.compose(b.pos, _q.clone().multiply(_q2), _s); wingL.setMatrixAt(bi, M4);
      _q2.setFromEuler(_e.set(0, 0, -wa)); M4.compose(b.pos, _q.clone().multiply(_q2), _s); wingR.setMatrixAt(bi, M4);
      bi++;
    }
  }
  birdBody.instanceMatrix.needsUpdate = wingL.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = true;

  // Hubschrauber kreist über Midtown
  const a = t * .07, R = 260;
  heli.position.set(Math.cos(a) * R * .8, 195 + Math.sin(t * .3) * 6, MID_Z + Math.sin(a) * R);
  heli.rotation.set(.08, Math.atan2(-.8 * Math.sin(a), Math.cos(a)), -.12);
  rotor.rotation.y += dt * 38; tailRotor.rotation.x += dt * 50;
  heli.blink.visible = (t % 1.2) < .15;
}
