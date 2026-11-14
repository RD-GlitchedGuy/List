// Kapsel-Kollision gegen die BVH, Raycasts, Fallschaden
import * as THREE from 'three';
import { G, GRAVITY, WATER_Y, MAP_HALF } from './state.js';
import { heightAt } from './world.js';

const seg = new THREE.Line3(), box = new THREE.Box3();
const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), dir = new THREE.Vector3();
const sA = new THREE.Vector3(), sB = new THREE.Vector3(), step = new THREE.Vector3(), corr = new THREE.Vector3();
const dv = new THREE.Vector3(), target = new THREE.Vector3(), np = new THREE.Vector3(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3();

function resolve(start, end, r) {
  const bvh = G.collider.geometry.boundsTree;
  seg.start.copy(start); seg.end.copy(end);
  box.makeEmpty(); box.expandByPoint(start); box.expandByPoint(end);
  box.min.addScalar(-r); box.max.addScalar(r);
  bvh.shapecast({
    intersectsBounds: b => b.intersectsBox(box),
    intersectsTriangle: tri => {
      const d = tri.closestPointToSegment(seg, t1, t2);
      if (d < r) {
        if (d < 1e-5) tri.getNormal(dir); else dir.subVectors(t2, t1).normalize();
        const depth = r - d;
        seg.start.addScaledVector(dir, depth);
        seg.end.addScaledVector(dir, depth);
      }
    },
  });
  start.copy(seg.start); end.copy(seg.end);
}

// Bewegt einen Akteur (Füße = a.pos) und setzt a.onGround
export function moveActor(a, dt) {
  const r = a.radius, h = a.crouch ? 1.25 : a.height;
  const disp = dv.copy(a.vel).multiplyScalar(dt);
  const ground = heightAt(a.pos.x, a.pos.z);
  // hoch in der Luft: keine Kollisionsprüfung nötig
  if (a.pos.y - Math.max(ground, 0) > 30 && a.pos.y + disp.y - Math.max(ground, 0) > 28) {
    a.pos.add(disp); a.onGround = false; clampMap(a); return;
  }
  const len = disp.length();
  const n = Math.min(8, Math.max(1, Math.ceil(len / (r * 0.7))));
  target.copy(a.pos).add(disp);
  sA.set(a.pos.x, a.pos.y + r, a.pos.z); sB.set(a.pos.x, a.pos.y + h - r, a.pos.z);
  step.copy(disp).divideScalar(n);
  for (let i = 0; i < n; i++) {
    sA.add(step); sB.add(step);
    resolve(sA, sB, r);
  }
  const newPos = np.set(sA.x, sA.y - r, sA.z);
  corr.subVectors(newPos, target);
  const wasGround = a.onGround;
  a.onGround = corr.y > Math.abs(disp.y) * 0.25 + 1e-5;
  const th = heightAt(newPos.x, newPos.z);
  if (newPos.y < th - 0.25 && th > -15) { newPos.y = th; a.onGround = true; }
  if (a.onGround) {
    a.impact = wasGround ? 0 : -a.vel.y;
    a.vel.y = 0;
  } else if (corr.lengthSq() > 1e-8) {
    corr.normalize();
    const dot = corr.dot(a.vel);
    if (dot < 0) a.vel.addScaledVector(corr, -dot);
  }
  a.pos.copy(newPos);
  clampMap(a);
}

function clampMap(a) {
  const L = MAP_HALF + 220;
  a.pos.x = Math.max(-L, Math.min(L, a.pos.x));
  a.pos.z = Math.max(-L, Math.min(L, a.pos.z));
}

export function inDeepWater(a) {
  return heightAt(a.pos.x, a.pos.z) < WATER_Y - 1.1 && a.pos.y < WATER_Y - 1.0;
}

const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
export function raycast(origin, direction, far) {
  rc.set(origin, direction); rc.far = far;
  const hit = rc.intersectObject(G.collider, false);
  return hit.length ? hit[0] : null;
}

export function groundBelow(pos, far = 300) {
  const hit = raycast(q1.set(pos.x, pos.y + 0.2, pos.z), q2.set(0, -1, 0), far);
  const h = Math.max(heightAt(pos.x, pos.z), WATER_Y);
  return hit ? Math.max(hit.point.y, h) : h;
}

export function lineOfSight(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length(); d.divideScalar(len);
  return !raycast(a, d, len - 0.3);
}

export { GRAVITY };
