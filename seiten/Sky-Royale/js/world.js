// Map laden, Kollision (BVH) aufbauen, Truhen/Spawnpunkte/Sprungfelder auslesen
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { G, MAP_HALF } from './state.js';

const TREES = new Set(['Baum', 'Herbstbaum', 'Pinker Baum', 'Tanne', 'Palme']);
const NO_COLLIDE = new Set(['Busch', 'Herbstbusch', 'Pinker Busch', 'Pilze', 'Wasser', 'Truhe', 'Munitionskiste', 'Lagerfeuer']);
export const CAR_NAMES = new Set(['Sportwagen', 'Kompaktwagen', 'Pickup', 'Altes Auto']);
const HOUSES = new Set(['Kleines Haus', 'Großes Haus', 'Laden', 'Scheune', 'Holzhütte']);
const GRID = 321, CELL = 2;

const baseName = n => n.replace(/_\d+$/, '').replace(/_/g, ' ');

export async function loadWorld(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, e => { if (e.total) onProgress(e.loaded / e.total); });
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const groups = new Map();   // Name -> InstancedMeshes
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const name = baseName(o.name || (o.parent && o.parent.name) || '');
    o.userData.base = name;
    meshes.push(o);
    if (o.isInstancedMesh) { if (!groups.has(name)) groups.set(name, []); groups.get(name).push(o); }
  });

  // ---------- Gelände-Höhenraster ----------
  const terrain = meshes.find(m => m.userData.base === 'Gelaende');
  const heights = new Float32Array(GRID * GRID).fill(-20);
  {
    const p = terrain.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(terrain.matrixWorld);
      const ix = Math.round((v.x + MAP_HALF) / CELL), iz = Math.round((v.z + MAP_HALF) / CELL);
      if (ix >= 0 && iz >= 0 && ix < GRID && iz < GRID) heights[iz * GRID + ix] = v.y;
    }
  }
  G.heights = heights;
  terrain.receiveShadow = true;

  // ---------- Positionen aus Instanzen ----------
  const instPositions = (name) => {
    const list = groups.get(name); if (!list) return [];
    const m = list[0], out = [], mat = new THREE.Matrix4();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat); mat.premultiply(m.matrixWorld);
      const pos = new THREE.Vector3().setFromMatrixPosition(mat);
      const q = new THREE.Quaternion(); mat.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      out.push({ pos, quat: q, index: i });
    }
    return out;
  };

  // Truhen + Munitionskisten
  for (const [name, type] of [['Truhe', 'chest'], ['Munitionskiste', 'ammo']]) {
    const list = groups.get(name) || [];
    for (const p of instPositions(name)) G.chests.push({ type, pos: p.pos, index: p.index, meshes: list.filter(m => m.count > p.index), opened: false });
  }
  // Spawnfelder: unsichtbar, aber begehbar
  for (const p of instPositions('Spawnpunkt')) G.spawnPoints.push(p.pos.clone().add(new THREE.Vector3(0, 0.3, 0)));
  for (const m of groups.get('Spawnpunkt') || []) m.visible = false;
  // Sprungfelder: Pfeil-Textur weg
  for (const p of instPositions('Sprungfeld')) G.jumpPads.push(p.pos);
  for (const m of groups.get('Sprungfeld') || []) {
    if (m.material && m.material.map) m.material = new THREE.MeshStandardMaterial({ color: '#2a5a9a', roughness: 0.6 });
  }
  for (const p of instPositions('Geysir')) G.geysers.push(p.pos);
  for (const p of instPositions('Heiße Quelle')) G.springs.push(p.pos);
  for (const n of HOUSES) for (const p of instPositions(n)) G.houses.push({ pos: p.pos, name: n });
  G.landmarks = [];
  for (const n of ['Leuchtturm', 'Stufentempel', 'Pagode', 'Höhle', 'Wachturm', 'Säulenruine', 'Schrein', 'Steinkreis', 'Torii-Tor'])
    for (const p of instPositions(n)) G.landmarks.push({ name: n, pos: p.pos });
  // Leitern an den Wachtürmen (lokal z = +2.1)
  for (const p of instPositions('Wachturm')) {
    const l = new THREE.Vector3(0, 0, 2.2).applyQuaternion(p.quat).add(p.pos);
    G.ladders.push({ x: l.x, z: l.z, cx: p.pos.x, cz: p.pos.z, y0: p.pos.y - 0.5, top: p.pos.y + 8.3 });
  }

  // ---------- Autos aus den Instanzen lösen (werden fahrbar) ----------
  {
    const byKey = new Map();
    for (const m of meshes) {
      if (!m.isInstancedMesh || !CAR_NAMES.has(m.userData.base)) continue;
      const k = m.userData.base + '#' + m.count;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(m);
      m.visible = false;
    }
    const mat = new THREE.Matrix4();
    for (const [k, parts] of byKey) {
      // Fahrtrichtung: das am weitesten außen liegende leuchtende Teil = Scheinwerfer
      const bb = new THREE.Box3(); let front = new THREE.Vector3(0, 0, 1), best = -1;
      for (const pm of parts) {
        pm.geometry.computeBoundingBox(); bb.union(pm.geometry.boundingBox);
        const e = pm.material.emissive; const lum = e ? e.r + e.g + e.b : 0;
        if (lum > 0.2) {
          const c = pm.geometry.boundingBox.getCenter(new THREE.Vector3());
          const along = Math.max(Math.abs(c.x), Math.abs(c.z));
          if (along > best) { best = along; front = Math.abs(c.x) > Math.abs(c.z) ? new THREE.Vector3(Math.sign(c.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(c.z)); }
        }
      }
      const size = bb.getSize(new THREE.Vector3());
      const alongX = front.x !== 0;
      const half = new THREE.Vector3(alongX ? size.z / 2 : size.x / 2, size.y, alongX ? size.x / 2 : size.z / 2); // x=Breite, z=Länge
      const modelYaw = front.z > 0 ? Math.PI : front.z < 0 ? 0 : front.x > 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let i = 0; i < parts[0].count; i++) {
        parts[0].getMatrixAt(i, mat); mat.premultiply(parts[0].matrixWorld);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(); mat.decompose(pos, q, new THREE.Vector3());
        const model = new THREE.Group();
        for (const pm of parts) { const mm = new THREE.Mesh(pm.geometry, pm.material); mm.castShadow = mm.receiveShadow = true; model.add(mm); }
        model.rotation.y = modelYaw;
        const root = new THREE.Group(); root.add(model);
        const fw = front.clone().applyQuaternion(q);
        G.cars.push({ id: G.cars.length, name: k.split('#')[0], root, pos, yaw: Math.atan2(-fw.x, -fw.z), pitch: 0, roll: 0,
          speed: 0, vy: 0, half, driver: null, steer: 0 });
      }
    }
  }

  // ---------- Abbaubare Objekte (Spitzhacke) ----------
  G.objects = [];
  const objByKey = new Map(), tmpM = new THREE.Matrix4(), v = new THREE.Vector3();
  const objFor = (name, x, y, z) => {
    const k = name + '|' + Math.round(x * 2) + '|' + Math.round(z * 2);
    let o = objByKey.get(k);
    if (!o) {
      const hp = OBJ_HP[name] || (TREES.has(name) ? 150 : 220);
      o = { id: G.objects.length, name, pos: new THREE.Vector3(x, y, z), parts: [], ranges: [], hp, max: hp, alive: true, wobble: 0 };
      objByKey.set(k, o); G.objects.push(o);
    }
    return o;
  };
  for (const m of meshes) {
    const name = m.userData.base;
    if (!m.isInstancedMesh || NO_DESTROY.has(name) || CAR_NAMES.has(name)) continue;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, tmpM);
      const local = tmpM.clone();
      tmpM.premultiply(m.matrixWorld); v.setFromMatrixPosition(tmpM);
      objFor(name, v.x, v.y, v.z).parts.push({ mesh: m, index: i, local });
    }
  }
  let curObj = null;

  // ---------- Kollisionsgeometrie ----------
  const chunks = [];
  let total = 0;
  const triStart = [], triObj = [];
  const addGeometry = (geo, matrix) => {
    if (curObj) { triStart.push(total / 9); triObj.push(curObj); curObj.ranges.push([total / 3, 0]); }
    else if (triObj.length && triObj[triObj.length - 1]) { triStart.push(total / 9); triObj.push(null); }
    const pos = geo.attributes.position, idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(matrix);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    chunks.push(arr); total += arr.length;
    if (curObj) curObj.ranges[curObj.ranges.length - 1][1] = total / 3;
  };
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.5, 5, 8, 1, true).translate(0, 2.5, 0);
  const treeSpots = new Set();
  for (const m of meshes) {
    const name = m.userData.base;
    m.receiveShadow = true;
    if (name !== 'Gelaende' && name !== 'Wasser') m.castShadow = true;
    if (name === 'Wasser') { m.visible = false; continue; }
    if (NO_COLLIDE.has(name) || CAR_NAMES.has(name)) continue;
    if (TREES.has(name)) {
      if (!m.isInstancedMesh) continue;
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, tmpM); tmpM.premultiply(m.matrixWorld);
        v.setFromMatrixPosition(tmpM);
        const key = `${Math.round(v.x * 2)},${Math.round(v.z * 2)}`;
        if (treeSpots.has(key)) continue;
        treeSpots.add(key);
        curObj = objFor(name, v.x, v.y, v.z);
        addGeometry(trunkGeo, new THREE.Matrix4().makeTranslation(v.x, v.y, v.z));
        curObj = null;
      }
      continue;
    }
    if (m.isInstancedMesh) {
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, tmpM); tmpM.premultiply(m.matrixWorld);
        v.setFromMatrixPosition(tmpM);
        curObj = NO_DESTROY.has(name) ? null : objFor(name, v.x, v.y, v.z);
        addGeometry(m.geometry, tmpM);
        curObj = null;
      }
    } else addGeometry(m.geometry, m.matrixWorld);
  }
  const all = new Float32Array(total);
  let off = 0; for (const c of chunks) { all.set(c, off); off += c.length; }
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(all, 3));
  cgeo.boundsTree = new MeshBVH(cgeo, { maxLeafTris: 10 });
  const collider = new THREE.Mesh(cgeo);
  collider.raycast = acceleratedRaycast;
  collider.visible = false;
  G.collider = collider;
  G.colliderOrig = all.slice();
  G.triStart = triStart; G.triObj = triObj;
  G.objects = G.objects.filter(o => o.ranges.length);           // nur Objekte mit Kollision
  G.objects.forEach((o, i) => o.id = i);

  G.scene.add(root);
  for (const c of G.cars) G.scene.add(c.root);
  return root;
}

const NO_DESTROY = new Set(['Gelaende', 'Wasser', 'Spawnpunkt', 'Sprungfeld', 'Geysir', 'Truhe', 'Munitionskiste', 'Höhle', 'Busch', 'Herbstbusch', 'Pinker Busch', 'Pilze']);
const OBJ_HP = { 'Kleines Haus': 500, 'Großes Haus': 800, 'Laden': 600, 'Scheune': 650, 'Holzhütte': 400, 'Stein': 250, 'Felsen': 400,
  'Leuchtturm': 1200, 'Stufentempel': 1500, 'Pagode': 900, 'Wachturm': 450, 'Laterne': 60, 'Zaun': 60, 'Lagerfeuer': 40 };

// Welches Objekt gehört zu diesem Raycast-Treffer?
export function objectAtHit(hit) {
  if (!hit || hit.object !== G.collider || !hit.face) return null;
  const tri = Math.floor(hit.face.a / 3), S = G.triStart;
  let lo = 0, hi = S.length - 1;
  if (hi < 0 || tri < S[0]) return null;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid] <= tri) lo = mid; else hi = mid - 1; }
  const o = G.triObj[lo];
  return o && o.alive ? o : null;
}

// Objekt entfernen: unsichtbar machen und aus der Kollision nehmen
const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
export function destroyObject(o) {
  if (!o.alive) return;
  o.alive = false; o.hp = 0;
  for (const p of o.parts) { p.mesh.setMatrixAt(p.index, zeroM); p.mesh.instanceMatrix.needsUpdate = true; }
  const pos = G.collider.geometry.attributes.position;
  for (const [a, b] of o.ranges) for (let i = a; i < b; i++) pos.setXYZ(i, o.pos.x, -500, o.pos.z);
  pos.needsUpdate = true;
  G.collider.geometry.boundsTree.refit();
}

// Wackeln beim Treffen
const wobM = new THREE.Matrix4(), rotM = new THREE.Matrix4();
export function updateObjects(dt) {
  for (const o of G.wobbling || []) {
    o.wobble -= dt;
    const k = Math.max(0, o.wobble) / 0.35;
    rotM.makeRotationFromEuler(new THREE.Euler(Math.sin(o.wobble * 55) * 0.035 * k, 0, Math.cos(o.wobble * 47) * 0.035 * k));
    for (const p of o.parts) {
      if (!o.alive) break;
      wobM.multiplyMatrices(p.local, rotM);
      p.mesh.setMatrixAt(p.index, wobM); p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  if (G.wobbling) G.wobbling = G.wobbling.filter(o => o.wobble > 0);
}
export function wobbleObject(o) { o.wobble = 0.35; G.wobbling = G.wobbling || []; if (!G.wobbling.includes(o)) G.wobbling.push(o); }

export function hideChest(chest) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  if (!chest.orig) chest.orig = chest.meshes.map(m => { const M = new THREE.Matrix4(); m.getMatrixAt(chest.index, M); return M; });
  for (const m of chest.meshes) { m.setMatrixAt(chest.index, zero); m.instanceMatrix.needsUpdate = true; }
}

// Neue Runde: Truhen und abgebaute Objekte zurückholen
export function restoreWorld() {
  for (const c of G.chests) {
    if (c.opened && c.orig) c.meshes.forEach((m, i) => { m.setMatrixAt(c.index, c.orig[i]); m.instanceMatrix.needsUpdate = true; });
    c.opened = false;
  }
  const pos = G.collider.geometry.attributes.position, orig = G.colliderOrig;
  let changed = false;
  for (const o of G.objects) {
    o.hp = o.max; o.wobble = 0;
    if (o.alive) continue;
    o.alive = true; changed = true;
    for (const p of o.parts) { p.mesh.setMatrixAt(p.index, p.local); p.mesh.instanceMatrix.needsUpdate = true; }
    for (const [a, b] of o.ranges) for (let i = a; i < b; i++) pos.setXYZ(i, orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
  }
  if (changed) { pos.needsUpdate = true; G.collider.geometry.boundsTree.refit(); }
  G.wobbling = [];
}

// Gelände-Höhe (bilinear)
export function heightAt(x, z) {
  const fx = (x + MAP_HALF) / CELL, fz = (z + MAP_HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= GRID - 1 || fz >= GRID - 1) return -20;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, H = G.heights;
  const a = H[iz * GRID + ix], b = H[iz * GRID + ix + 1], c = H[(iz + 1) * GRID + ix], d = H[(iz + 1) * GRID + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
export const isLand = (x, z) => heightAt(x, z) > 0.6;
