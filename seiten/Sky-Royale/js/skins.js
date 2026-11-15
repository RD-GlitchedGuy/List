// Eigene Skins (GLB, CC0-Basis MakeHuman): laden und an das Gelenkgeruest der Figur binden
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SKINS = [
  { id: 'standard', name: 'Standard', desc: 'Zufällige Farben' },
  { id: 'nadelstreif', name: 'Nadelstreif', desc: 'Gentleman-Dieb' },
  { id: 'wolkenstahl', name: 'Wolkenstahl', desc: 'Sturmritterin' },
  { id: 'tropenkopf', name: 'Tropenkopf', desc: 'Urlaub im Dauereinsatz' },
];
export const SKIN_BASE = 100;                       // look >= 100 -> eigener Skin (look - 100 = Index in SKINS)
const KEY = 'skyroyale.skin';
export function mySkin() { try { const i = SKINS.findIndex(s => s.id === localStorage.getItem(KEY)); return i > 0 ? i : 0; } catch (e) { return 0; } }
export function setMySkin(i) { try { localStorage.setItem(KEY, SKINS[i].id); } catch (e) {} }
export const skinLook = (i, fallback) => i > 0 ? SKIN_BASE + i : fallback;
export const skinOfLook = look => (look >= SKIN_BASE && SKINS[look - SKIN_BASE]) ? look - SKIN_BASE : 0;
export function randomBotLook(i) { return Math.random() < 0.5 ? SKIN_BASE + 1 + ((Math.random() * (SKINS.length - 1)) | 0) : i; }

const cache = new Map();
const loader = new GLTFLoader();
export function loadSkin(i) {
  if (!cache.has(i)) cache.set(i, loader.loadAsync(`assets/skins/${SKINS[i].id}.glb`).then(prep).catch(e => { console.warn('Skin', SKINS[i].id, e); return null; }));
  return cache.get(i);
}
export function preloadSkins() { for (let i = 1; i < SKINS.length; i++) loadSkin(i); }

function prep(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  let sm = null; scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  if (!sm) return null;
  const geo = sm.geometry; geo.applyMatrix4(sm.matrixWorld);
  const pos = {};
  for (const b of sm.skeleton.bones) pos[b.name] = b.getWorldPosition(new THREE.Vector3());
  const mat = sm.material;
  if (mat.map) mat.map.anisotropy = 4;
  mat.envMapIntensity = 1.6;
  return { geo, mat, pos, names: sm.skeleton.bones.map(b => b.name) };
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion(), _d = new THREE.Vector3();
// Gelenke der Figur auf die Masse des Skins setzen und das Mesh in A-Pose daran binden
export function applySkin(root, data) {
  if (!data || root.userData.skinMesh) return;
  const J = root.userData.J, P = data.pos;
  const sub = (a, b) => new THREE.Vector3().subVectors(P[a], P[b]);
  const dir = (a, b) => sub(a, b).normalize();
  for (const k of ['pelvis', 'spine', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shL', 'shR', 'elL', 'elR']) J[k].rotation.set(0, 0, 0);
  J.pelvis.position.set(0, P.pelvis.y, P.pelvis.z);
  J.spine.position.copy(sub('spine', 'pelvis'));
  J.head.position.copy(sub('head', 'spine'));
  for (const s of ['L', 'R']) {
    J['hip' + s].position.copy(sub('hip' + s, 'pelvis'));
    J['knee' + s].position.set(0, -P['knee' + s].distanceTo(P['hip' + s]), 0);
    J['sh' + s].position.copy(sub('sh' + s, 'spine'));
    J['el' + s].position.set(0, -P['el' + s].distanceTo(P['sh' + s]), 0);
    // A-Pose des Meshes nachstellen: Oberschenkel/Oberarm, dann Unterschenkel/Unterarm relativ dazu
    for (const [a, b, c] of [['hip', 'knee', 'foot'], ['sh', 'el', 'hand']]) {
      const q1 = new THREE.Quaternion().setFromUnitVectors(DOWN, dir(b + s, a + s));
      J[a + s].quaternion.copy(q1);
      _d.copy(dir(c + s, b + s)).applyQuaternion(_q.copy(q1).invert());
      J[b + s].quaternion.setFromUnitVectors(DOWN, _d);
    }
  }
  for (const m of root.userData.body) m.visible = false;
  const map = { pelvis: J.pelvis, spine: J.spine, head: J.head, hipL: J.hipL, kneeL: J.kneeL, footL: J.kneeL, hipR: J.hipR, kneeR: J.kneeR, footR: J.kneeR,
    shL: J.shL, elL: J.elL, handL: J.elL, shR: J.shR, elR: J.elR, handR: J.elR };
  const mesh = new THREE.SkinnedMesh(data.geo, data.mat);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(data.names.map(n => map[n] || J.spine)));
  root.userData.skinMesh = mesh;
  root.userData.cur = {};                            // Animations-Glaettung neu starten
}
export function skinCharacter(root, look) {
  const i = skinOfLook(look);
  if (!i) return;
  loadSkin(i).then(d => applySkin(root, d));
}
