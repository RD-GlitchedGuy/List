// 3D-Lobby im Hauptmenü: Party steht auf blauen Pads vor einem in Blender gerenderten Hintergrund
import * as THREE from 'three';
import { makeCharacter, animateCharacter } from './models.js';
import { skinCharacter } from './skins.js';

// Kamera exakt wie beim Hintergrund-Render (Blender: (0,-8,1.6) -> (0,0,1.0), 84° horizontal, 2560x1600)
const CAM = new THREE.Vector3(0, 1.6, 8), LOOK = new THREE.Vector3(0, 1.0, 0), BG_H = 84, BG_ASPECT = 2560 / 1600;
const SLOTS = [[0, 0], [-1.7, -0.35], [1.7, -0.35], [-3.1, -1.1], [3.1, -1.1], [-0.95, -2.5], [0.95, -2.5], [-2.75, -3.1], [2.75, -3.1], [0, -4.8], [-1.95, -5.1], [1.95, -5.1]];
const rowOf = i => (i < 5 ? 0 : i < 9 ? 1 : 2);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 300);
const pads = [], chars = new Map();
let tagsEl = null, members = [], meId = 0, shown = 3, onPlus = null, tagNodes = [];

export function initLobby(env, tags, plus) {
  tagsEl = tags; onPlus = plus;
  scene.background = new THREE.Color('#0c1326');
  scene.environment = env; scene.environmentIntensity = 0.3;
  scene.add(new THREE.HemisphereLight('#8ea4ff', '#3a2c26', 1.0));
  const rim = new THREE.DirectionalLight('#ffb070', 2.4); rim.position.set(-5, 2.2, -8.2); scene.add(rim);     // Abendsonne von hinten links
  const key = new THREE.DirectionalLight('#dfe6ff', 1.7); key.position.set(2.5, 5, 8); scene.add(key);
  camera.position.copy(CAM); camera.lookAt(LOOK); scene.add(camera);
  const D = 120, w = 2 * D * Math.tan(THREE.MathUtils.degToRad(BG_H / 2));
  const tex = new THREE.TextureLoader().load('assets/lobby.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, w / BG_ASPECT), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, depthWrite: false, fog: false }));
  camera.updateMatrixWorld(true);                                              // Hintergrund steht fest in der Welt, die Kamera darf sich danach drehen
  bg.quaternion.copy(camera.quaternion); bg.position.copy(CAM).add(new THREE.Vector3(0, 0, -D).applyQuaternion(camera.quaternion)); bg.renderOrder = -10; scene.add(bg);
  const base = new THREE.CylinderGeometry(0.74, 0.8, 0.07, 48), ring = new THREE.RingGeometry(0.52, 0.66, 48), disc = new THREE.CircleGeometry(0.5, 48);
  for (const [x, z] of SLOTS) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const b = new THREE.Mesh(base, new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.45, metalness: 0.6 })); b.position.y = 0.035;
    const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#2f8cff', toneMapped: false })); r.rotation.x = -Math.PI / 2; r.position.y = 0.073;
    const d = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: '#10335c', toneMapped: false })); d.rotation.x = -Math.PI / 2; d.position.y = 0.072;
    g.add(b, r, d); scene.add(g); pads.push({ g, r, d });
  }
  lobbyResize();
}

export function lobbyResize() {
  const aspect = innerWidth / innerHeight;
  const need = Math.atan(4.9 / 8);                                            // halbe Breite, die sichtbar bleiben soll
  const v = 2 * Math.atan(Math.tan(need) / aspect), maxV = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BG_H / 2)) / BG_ASPECT) * 0.98;
  camera.fov = THREE.MathUtils.radToDeg(Math.min(maxV, Math.max(THREE.MathUtils.degToRad(36), v)));
  camera.aspect = aspect; camera.updateProjectionMatrix();
  // Party nach links rücken, damit sie nicht hinter den Feldern am rechten Rand steht (reine Drehung, passt weiter zum Hintergrund)
  const focal = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), panel = innerWidth > 760 ? 352 : 256;
  const yaw = Math.min(THREE.MathUtils.degToRad(10.5), Math.atan(panel * 0.45 / focal));
  camera.lookAt(LOOK); camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -yaw);
}

const fake = model => ({ model, vel: new THREE.Vector3(), inv: [null], slot: 0, pitch: 0, state: 'ground', crouch: false, sprint: false, emoteT: 0, emoteStyle: 2 });
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Party-Mitglieder anzeigen (ich selbst stehe immer vorn in der Mitte)
export function setLobbyMembers(list, me, max) {
  members = [...list.filter(m => m.id === me), ...list.filter(m => m.id !== me)]; meId = me;
  shown = Math.min(max, Math.max(3, members.length + 1));
  const seen = new Set();
  members.forEach((m, i) => {
    seen.add(m.id);
    const look = m.look >= 100 ? m.look : (m.id * 3 + 1) % 8;
    let c = chars.get(m.id);
    if (!c || c.look !== look) {
      if (c) scene.remove(c.a.model);
      const model = makeCharacter(look); skinCharacter(model, look);
      model.traverse(o => { if (o.isMesh) o.castShadow = false; });
      scene.add(model); c = { a: fake(model), look, st: m.st }; chars.set(m.id, c);
    }
    if (m.st === 1 && c.st !== 1) c.a.emoteT = 1.8;                               // kurz winken, wenn jemand bereit ist
    c.st = m.st;
    const [x, z] = SLOTS[i];
    c.a.model.position.set(x, 0.075, z); c.a.model.rotation.y = Math.PI - Math.atan2(x, 9 - z) * 0.9;
    c.a.model.visible = m.st !== 2;
  });
  for (const [id, c] of chars) if (!seen.has(id)) { scene.remove(c.a.model); chars.delete(id); }
  pads.forEach((p, i) => {
    p.g.visible = i < shown;
    const m = members[i], on = m && m.st !== 2;
    p.r.material.color.set(on ? (m.st === 1 ? '#7fd0ff' : '#2f8cff') : '#1c4f8c');
    p.d.material.color.set(on ? (m.st === 1 ? '#2f7fd0' : '#143f72') : '#0c2038');
  });
  if (!tagsEl) return;
  tagsEl.innerHTML = ''; tagNodes = [];
  for (let i = 0; i < shown; i++) {
    const m = members[i], el = document.createElement(m ? 'div' : 'button');
    if (m) {
      el.className = 'ltag' + (m.st === 1 ? ' rdy' : m.st === 2 ? ' ing' : '') + (m.id === me ? ' me' : '') + (rowOf(i) ? ' sm' : '');
      el.innerHTML = `<b>${m.lead ? '<i>Leader</i> ' : ''}${esc(m.name)}</b><span>${m.st === 1 ? 'Bereit' : m.st === 2 ? 'Im Spiel' : 'Nicht bereit'}</span>`;
    } else { el.className = 'lplus'; el.textContent = '+'; el.title = 'Freunde einladen'; el.onclick = () => onPlus && onPlus(); }
    tagsEl.appendChild(el); tagNodes.push({ el, i, h: m ? 2.12 + rowOf(i) * 0.5 : 0.95 });
  }
}

const v = new THREE.Vector3();
export function updateLobby(dt, renderer) {
  for (const c of chars.values()) { if (c.a.emoteT > 0) c.a.emoteT -= dt; if (c.a.model.visible) animateCharacter(c.a, dt); }
  const t = performance.now() / 1000;
  pads.forEach((p, i) => { if (i >= members.length && p.g.visible) p.r.material.opacity = 1; p.r.scale.setScalar(1 + (i < members.length ? Math.sin(t * 2 + i) * 0.012 : 0)); });
  for (const n of tagNodes) {
    const [x, z] = SLOTS[n.i];
    v.set(x, n.h, z).project(camera);
    n.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px';
    n.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px';
  }
  renderer.render(scene, camera);
}
