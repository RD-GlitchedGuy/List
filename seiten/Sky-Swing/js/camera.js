// Verfolgerkamera mit Schulterversatz, Kollision und Tempo-Sichtfeld
import { V3, clamp, angDiff } from './util.js';
import { camera } from './engine.js';
import { P, I, cam, game, fx } from './state.js';
import { raycast } from './city.js';

const _t = new V3(), d = new V3(), side = new V3(), look = new V3(), back = new V3();

export function updateCamera(dt) {
  cam.yaw -= I.lx; cam.pitch = clamp(cam.pitch + I.ly, -1.0, 1.25);
  cam.idle = I.look ? 0 : cam.idle + dt;
  const hs = Math.hypot(P.vel.x, P.vel.z), sp = P.vel.length();
  // Kamera dreht sich langsam hinter den Spieler, wenn man sie nicht selbst bewegt
  if (game.started && cam.idle > .9 && hs > 7 && P.state !== 'wall') cam.yaw += angDiff(Math.atan2(P.vel.x, P.vel.z), cam.yaw) * (1 - Math.exp(-1.6 * dt));
  if (!game.started) cam.yaw += dt * .12;
  cam.tgt.lerp(_t.copy(P.pos).setY(P.pos.y + 1.5), 1 - Math.exp(-14 * dt));
  const dist = (5.2 + Math.min(sp, 60) * .055) * cam.zoom;
  d.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), -Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  side.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  look.copy(cam.tgt).addScaledVector(side, .55);
  back.copy(d).negate();
  let dd = dist; const hit = raycast(look, back, dist); if (hit) dd = Math.max(.6, hit.t - .35);
  camera.position.copy(look).addScaledVector(back, dd); if (camera.position.y < .4) camera.position.y = .4;
  // Wackeln bei Landungen und Stößen
  if (fx.shake > 0) { const a = fx.shake * fx.shake * .6; camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a; camera.position.z += (Math.random() - .5) * a; fx.shake = Math.max(0, fx.shake - dt * 1.8); }
  camera.lookAt(look);
  const f = 68 + Math.min(sp, 70) * .28 + fx.punch * 10; fx.punch = Math.max(0, fx.punch - dt * 2.2);
  camera.fov += (f - camera.fov) * (1 - Math.exp(-6 * dt)); camera.updateProjectionMatrix();
}
