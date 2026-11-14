// HUD: Fadenkreuz, Lebensbalken, Hotbar, Killfeed, Schadenszahlen, Pings, Minimap und große Karte (M)
import * as THREE from 'three';
import { G, on, RARITIES } from './state.js';
import { DEFS, AMMO, stat } from './items.js';
import { aliveCount, mateOf } from './actors.js';
import { stormInfo, outside } from './storm.js';
import { camState } from './player.js';
import { interactLabel } from './loot.js';
import { sfx } from './audio.js';
import { hit, down, bindLabel } from './input.js';
import { netStatus } from './net.js';

const $ = id => document.getElementById(id);
const el = {};
const dmgNums = [];
let toastT = 0, bigMap = false, hitT = 0, hurtT = 0, bannerT = 0, poiT = 0, elimT = 0;
let lastStorm = null, curPoi = null, fpsT = 0, fpsN = 0, objT = 0;

export function initHud() {
  for (const id of ['cross', 'hitmarker', 'scope', 'dmg-layer', 'ping-layer', 'feed', 'minimap', 'st-alive', 'st-kills', 'st-storm', 'center-msg', 'sub-msg',
    'prompt', 'channel', 'sh-num', 'hp-num', 'sh-bar', 'hp-bar', 'wname', 'mag', 'reserve', 'hotbar', 'ammo-list', 'bigmap', 'bigmap-wrap', 'storm-tint', 'hurt', 'speedo', 'banner', 'poi-banner', 'poi-now', 'elim-pop', 'scoreboard', 'fps']) el[id] = $(id);
  el.square = el.cross.querySelector('.square');
  el.slots = [];
  for (let s = 0; s <= 5; s++) {
    const d = document.createElement('div'); d.className = 'slot' + (s === 0 ? ' pick' : '');
    d.innerHTML = `<span class="key">${s === 0 ? 'F' : s}</span><svg><use href=""></use></svg><div class="rar"></div><span class="cnt"></span>`;
    el.hotbar.appendChild(d); el.slots.push(d);
  }
  snapshotMap();
  computePOIs();
  el.objhp = $('objhp');
  on('objHit', o => {
    el.objhp.querySelector('span').textContent = o.name + (o.alive ? `  ${Math.max(0, Math.round(o.hp))} / ${o.max}` : '  abgebaut');
    el.objhp.querySelector('i').style.width = Math.max(0, o.hp / o.max * 100) + '%';
    objT = 1.6;
  });
  on('kill', (victim, total) => {
    el['elim-pop'].querySelector('b').textContent = victim.name;
    el['elim-pop'].querySelector('small').textContent = total === 1 ? '1 Eliminierung' : total + ' Eliminierungen';
    elimT = 2.6;
  });
  on('dealt', e => {
    G.player.dmgDealt = (G.player.dmgDealt || 0) + e.amount;
    hitT = 0.15; el.hitmarker.classList.toggle('head', e.head);
    sfx(e.head ? 'head' : e.shield ? 'shieldhit' : 'hit');
    if (!G.settings.damageNumbers) return;
    const n = document.createElement('div');
    n.className = 'dmgnum' + (e.head ? ' head' : e.shield ? ' sh' : '');
    n.textContent = e.amount;
    el['dmg-layer'].appendChild(n);
    dmgNums.push({ n, pos: (e.pos || e.target.pos.clone().add(new THREE.Vector3(0, 1.2, 0))).clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, 0)), t: 0 });
  });
  on('hurt', () => { hurtT = 0.35; });
  on('feed', (txt, me) => {
    const d = document.createElement('div'); if (me) d.className = 'me'; d.textContent = txt;
    el.feed.prepend(d);
    while (el.feed.children.length > 6) el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  });
  on('toast', txt => { el['sub-msg'].textContent = txt; toastT = 2; });
}

export function banner(title, sub = '', time = 4) {
  el.banner.querySelector('.b-title').textContent = title;
  el.banner.querySelector('.b-sub').textContent = sub;
  el.banner.style.opacity = 1; bannerT = time; sfx('banner');
}

export function message(main, sub = '') { el['center-msg'].textContent = main; if (sub !== null) { el['sub-msg'].textContent = sub; toastT = 0; } }

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const v3 = new THREE.Vector3();
function toScreen(p) {
  v3.copy(p).project(G.camera);
  if (v3.z > 1) return null;
  return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight];
}

export function updateHud(dt) {
  const a = G.player;
  if (hit('map')) { bigMap = !bigMap; sfx(bigMap ? 'mapopen' : 'invclose'); el['bigmap-wrap'].classList.toggle('hidden', !bigMap); el['bigmap-wrap'].querySelector('.maphint').textContent = bindLabel('map') + ' – Karte schließen'; }
  // FPS
  fpsT += dt; fpsN++; if (fpsT > 0.5) { el.fps.textContent = Math.round(fpsN / fpsT) + ' FPS'; fpsT = fpsN = 0; }
  bannerT -= dt; if (bannerT <= 0) el.banner.style.opacity = 0;
  if (fpsN === 0) { const ns = netStatus(); const ni = $('netinfo'); ni.textContent = ns ? ns.text : ''; ni.classList.toggle('bad', !!(ns && ns.bad)); }
  poiT -= dt; if (poiT <= 0) el['poi-banner'].style.opacity = 0;
  elimT -= dt; el['elim-pop'].style.opacity = elimT > 0 ? 1 : 0;
  objT -= dt; el.objhp.style.opacity = objT > 0 ? 1 : 0;
  stormBanners();
  updatePoi(a);
  updateMate(a);
  el.scoreboard.classList.toggle('hidden', !down('scoreboard'));
  if (down('scoreboard')) scoreboard();
  el['hp-num'].textContent = Math.ceil(Math.max(0, a.hp));
  el['sh-num'].textContent = Math.ceil(a.shield);
  el['hp-bar'].style.width = Math.max(0, a.hp) + '%';
  el['sh-bar'].style.width = a.shield + '%';
  hurtT -= dt; el.hurt.style.opacity = hurtT > 0 ? hurtT * 1.6 : 0;

  // Fadenkreuz
  const it = a.inv[a.slot], d = it ? DEFS[it.key] : null;
  let crossType = 'dot';
  if (!a.alive || ['bus', 'skydive', 'glide', 'launch'].includes(a.state) || (a.state === 'car' && !a.lean) || camState.scoped || a.sprint) crossType = 'none';
  else if (d && d.cross === 'square') crossType = 'square';
  el.cross.className = crossType;
  if (crossType === 'square') {
    const s = stat(it), ads = a.adsT > 0.6;
    const spread = (ads ? s.adsSpread : s.spread) * (a.state !== 'ground' ? 1.5 : 1);
    const px = Math.tan(spread * Math.PI / 180) / Math.tan(G.camera.fov * Math.PI / 360) * innerHeight / 2;
    const size = Math.max(12, px * 2);
    Object.assign(el.square.style, { width: size + 'px', height: size + 'px', left: -size / 2 + 'px', top: -size / 2 + 'px' });
  }
  el.scope.style.display = camState.scoped ? 'block' : 'none';
  hitT -= dt; el.hitmarker.style.opacity = hitT > 0 ? 1 : 0;

  if (d && d.type === 'gun') {
    el.wname.textContent = `${d.name} · ${RARITIES[it.rarity].name}`;
    el.mag.textContent = a.reloadT > 0 ? '…' : it.mag;
    el.reserve.textContent = '/ ' + a.ammo[d.ammo];
  } else {
    el.wname.textContent = d ? d.name : ''; el.mag.textContent = d && it.count > 1 ? it.count : ''; el.reserve.textContent = '';
  }
  for (let s = 0; s <= 5; s++) {
    const slot = el.slots[s], item = a.inv[s];
    slot.classList.toggle('sel', s === a.slot);
    const icon = item ? 'assets/icons/items.svg#' + DEFS[item.key].icon : '';
    const use = slot.querySelector('use');
    if (use.getAttribute('href') !== icon) use.setAttribute('href', icon);
    const rc = item && s > 0 ? RARITIES[item.rarity || 0].color : null;
    slot.querySelector('.rar').style.background = rc || 'transparent';
    slot.querySelector('.cnt').textContent = item ? (item.count !== undefined ? item.count : DEFS[item.key].type === 'gun' ? item.mag : '') : '';
  }
  el['ammo-list'].innerHTML = Object.keys(AMMO).filter(k => a.ammo[k] > 0).map(k => `<span>${AMMO[k].short} <b>${a.ammo[k]}</b></span>`).join('');

  if (a.channel) { el.channel.style.display = 'block'; el.channel.querySelector('.lbl').textContent = a.channel.label; el.channel.querySelector('i').style.width = (a.channel.t / a.channel.total * 100) + '%'; }
  else if (a.reloadT > 0) { el.channel.style.display = 'block'; el.channel.querySelector('.lbl').textContent = 'Nachladen'; el.channel.querySelector('i').style.width = ((1 - a.reloadT / a.reloadMax) * 100) + '%'; }
  else el.channel.style.display = 'none';

  // Interaktion
  const o = camState.interact;
  let prompt = null, col = '#888';
  if (a.alive && a.state === 'car') prompt = a.seat > 0 ? `<kbd>${bindLabel('interact')}</kbd>Aussteigen &nbsp; <kbd>${bindLabel('aim')}</kbd>Aus dem Fenster lehnen` : '<kbd>E</kbd>Aussteigen &nbsp; <kbd>Leertaste</kbd>Handbremse';
  else if (a.alive && o) { prompt = `<kbd>E</kbd>${interactLabel(o)}`; if (o.item && !o.item.ammo) col = RARITIES[o.item.rarity || 0].color; }
  else if (a.alive && camState.car) prompt = `<kbd>E</kbd>${camState.car.driver ? 'Mitfahren' : 'Einsteigen'} · ${camState.car.name}`;
  if (prompt) { el.prompt.style.display = 'block'; el.prompt.innerHTML = prompt; el.prompt.style.borderLeftColor = col; }
  else el.prompt.style.display = 'none';
  if (a.state === 'car' && a.car) { el.speedo.style.display = 'block'; el.speedo.textContent = Math.round(Math.abs(a.car.speed) * 3.6) + ' km/h'; }
  else el.speedo.style.display = 'none';

  el['st-alive'].textContent = aliveCount();
  el['st-kills'].textContent = a.kills;
  const si = stormInfo();
  el['st-storm'].textContent = si ? (si.final ? '0:00' : fmt(si.left)) : '–';
  el['storm-tint'].style.opacity = a.alive && a.state !== 'bus' && outside(a.pos) ? 1 : 0;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) el['sub-msg'].textContent = ''; }

  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const n = dmgNums[i]; n.t += dt; n.pos.y += dt * 0.9;
    const s = toScreen(n.pos);
    if (!s || n.t > 0.9) { n.n.remove(); dmgNums.splice(i, 1); continue; }
    n.n.style.left = s[0] + 'px'; n.n.style.top = s[1] + 'px'; n.n.style.opacity = 1 - n.t / 0.9;
  }
  const layer = el['ping-layer'];
  G.pings = G.pings.filter(p => G.time - p.t < 30);
  while (layer.children.length < G.pings.length) { const dv = document.createElement('div'); dv.className = 'ping'; dv.innerHTML = '<i></i><span></span>'; layer.appendChild(dv); }
  while (layer.children.length > G.pings.length) layer.lastChild.remove();
  G.pings.forEach((p, i) => {
    const node = layer.children[i], s = toScreen(p.pos);
    if (!s) { node.style.display = 'none'; return; }
    node.style.display = 'block';
    node.style.left = Math.max(20, Math.min(innerWidth - 20, s[0])) + 'px'; node.style.top = Math.max(30, Math.min(innerHeight - 10, s[1])) + 'px';
    node.classList.toggle('mate', !!p.mate);
    node.querySelector('span').textContent = (p.mate ? p.name + ' · ' : '') + Math.round(p.pos.distanceTo(a.pos)) + ' m';
  });

  drawMinimap();
  if (bigMap) drawBigMap();
}

// ---------- Duo: Teamkamerad (Markierung über dem Kopf + Lebensanzeige) ----------
function updateMate(a) {
  const m = G.mode === 'duo' && G.phase !== 'warmup' && !a.wait ? mateOf(a) : null;
  const box = $('mate-box'), tag = $('mate-tag');
  box.classList.toggle('hidden', !m); 
  if (!m) { tag.style.display = 'none'; return; }
  box.querySelector('b').textContent = m.name;
  box.querySelector('.mh').style.width = Math.max(0, m.hp) + '%';
  box.querySelector('.ms').style.width = Math.max(0, m.shield) + '%';
  box.classList.toggle('out', !m.alive);
  const show = m.alive && m.state !== 'bus' && m.model.visible;
  const s = show ? toScreen(v3.copy(m.pos).setY(m.pos.y + 2.25)) : null;
  if (!s || (G.spectate === m && !a.alive)) { tag.style.display = 'none'; return; }
  tag.style.display = 'block';
  tag.style.left = Math.max(30, Math.min(innerWidth - 30, s[0])) + 'px'; tag.style.top = Math.max(20, Math.min(innerHeight - 20, s[1])) + 'px';
  tag.querySelector('span').textContent = `${m.name} · ${Math.round(m.pos.distanceTo(a.pos))} m`;
}

// ---------- Kartenbild: einmal die echte Map von oben rendern ----------
const MAP_PX = 1536, SC = MAP_PX / 640;
let mapImg, waterCol = '#2b5f8c';
function snapshotMap() {
  const R = G.renderer, sun = G.sun, sc = G.scene;
  mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = MAP_PX;
  const cam = new THREE.OrthographicCamera(-320, 320, 320, -320, 1, 900);
  cam.position.set(0, 450, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  const keep = { fog: sc.fog, size: R.getSize(new THREE.Vector2()), pr: R.getPixelRatio(), sunPos: sun.position.clone(), tgt: sun.target.position.clone(),
    sh: { ...sun.shadow.camera }, hidden: [] };
  sc.fog = null;
  sc.traverse(o => { if (o.userData.noMap && o.visible) { o.visible = false; keep.hidden.push(o); } });
  sun.position.set(80, 400, 60); sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, far: 900 }); sun.shadow.camera.updateProjectionMatrix();
  R.setPixelRatio(1); R.setSize(MAP_PX, MAP_PX, false);
  R.render(sc, cam);
  mapImg.getContext('2d').drawImage(R.domElement, 0, 0, MAP_PX, MAP_PX);
  sc.fog = keep.fog; keep.hidden.forEach(o => o.visible = true);
  sun.position.copy(keep.sunPos); sun.target.position.copy(keep.tgt);
  Object.assign(sun.shadow.camera, { left: keep.sh.left, right: keep.sh.right, top: keep.sh.top, bottom: keep.sh.bottom, far: keep.sh.far }); sun.shadow.camera.updateProjectionMatrix();
  R.setPixelRatio(keep.pr); R.setSize(keep.size.x, keep.size.y);
  const x = mapImg.getContext('2d');
  const px = x.getImageData(4, 4, 1, 1).data; waterCol = `rgb(${px[0]},${px[1]},${px[2]})`;
  // Grenze der Spawn-Insel einzeichnen
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3; x.setLineDash([10, 8]);
  x.beginPath(); x.arc((G.spawnCenter.x + 320) * SC, (G.spawnCenter.z + 320) * SC, G.spawnRadius * SC, 0, Math.PI * 2); x.stroke();
}

const stormCanvas = document.createElement('canvas');
function drawMap(ctx, size, cx, cz, span, big) {
  const k = size / span, ox = cx - span / 2, oz = cz - span / 2;
  ctx.fillStyle = waterCol; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(mapImg, (ox + 320) * SC, (oz + 320) * SC, span * SC, span * SC, 0, 0, size, size);
  const X = x => (x - ox) * k, Z = z => (z - oz) * k;
  // Raster (alle 64 m, wie A–J / 1–10)
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  for (let g = -320; g <= 320; g += 64) {
    ctx.beginPath(); ctx.moveTo(X(g), 0); ctx.lineTo(X(g), size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, Z(g)); ctx.lineTo(size, Z(g)); ctx.stroke();
  }
  if (big) {
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 13px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < 10; i++) { ctx.fillText('ABCDEFGHIJ'[i], X(-320 + 32 + i * 64), 16); ctx.fillText(String(i + 1), 12, Z(-320 + 32 + i * 64) + 5); }
  }
  const s = G.storm;
  if (s && s.active) {
    stormCanvas.width = stormCanvas.height = size;
    const sc = stormCanvas.getContext('2d');
    sc.fillStyle = 'rgba(120,60,170,.45)'; sc.fillRect(0, 0, size, size);
    sc.globalCompositeOperation = 'destination-out';
    sc.beginPath(); sc.arc(X(s.cx), Z(s.cz), Math.max(0, s.r * k), 0, Math.PI * 2); sc.fill();
    ctx.drawImage(stormCanvas, 0, 0);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(s.nx), Z(s.nz), Math.max(0, s.nr * k), 0, Math.PI * 2); ctx.stroke();
  }
  if (G.bus && !G.bus.done) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(G.bus.start.x), Z(G.bus.start.z)); ctx.lineTo(X(G.bus.end.x), Z(G.bus.end.z)); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#2f62a8'; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(G.bus.pos.x), Z(G.bus.pos.z), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const poi of G.pois || []) {
    if (!big && span > 260) continue;
    const x = X(poi.x), y = Z(poi.z);
    if (x < -40 || y < -10 || x > size + 40 || y > size + 10) continue;
    ctx.font = big ? 'italic 800 15px Bahnschrift, Arial Narrow, sans-serif' : 'italic 700 11px Bahnschrift, Arial Narrow, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(15,20,28,.85)'; ctx.fillStyle = '#fff';
    const t = poi.name.toUpperCase(); ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
  }
  for (const p of G.pings) {
    ctx.fillStyle = p.mate ? '#4aa3ff' : '#f2c230'; ctx.save(); ctx.translate(X(p.pos.x), Z(p.pos.z)); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  }
  const mt = G.mode === 'duo' && G.phase !== 'warmup' ? mateOf(G.player) : null;
  if (mt && mt.alive && mt.state !== 'bus') {
    ctx.fillStyle = '#4aa3ff'; ctx.strokeStyle = '#0d1a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(mt.pos.x), Z(mt.pos.z), big ? 6 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const a = !G.player.alive && G.spectate && G.spectate.alive ? G.spectate : G.player;
  const px = a.state === 'bus' && G.bus ? G.bus.pos.x : a.pos.x, pz = a.state === 'bus' && G.bus ? G.bus.pos.z : a.pos.z;
  ctx.save(); ctx.translate(X(px), Z(pz)); ctx.rotate(-a.yaw);
  ctx.fillStyle = '#f1efe8'; ctx.strokeStyle = '#1d1f22'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
let mmT = 0;
function drawMinimap() {
  if (--mmT > 0) return; mmT = 2;
  const c = el.minimap, ctx = c.getContext('2d');
  const a = !G.player.alive && G.spectate && G.spectate.alive ? G.spectate : G.player;
  const p = a.state === 'bus' && G.bus ? G.bus.pos : a.pos;
  const span = (a.state === 'bus' ? 420 : a.state === 'skydive' || a.state === 'glide' ? 300 : 200) / (G.settings.minimapZoom || 1);
  drawMap(ctx, c.width, p.x, p.z, span, false);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 12px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', c.width / 2, 13);
}
function drawBigMap() { const c = el.bigmap; drawMap(c.getContext('2d'), c.width, 0, 0, 640, true); }

// ---------- Benannte Orte ----------
const TOWN_NAMES = ['Sonnige Siedlung', 'Rostige Rampen', 'Kieselkreuz', 'Laubhausen', 'Fischerdorf', 'Moosmühle', 'Knusperkamm', 'Bröselbach', 'Salzhafen', 'Lärchenlauf', 'Ziegelzentrum', 'Hummelhof'];
const LM_NAMES = { Leuchtturm: 'Leuchtturm-Klippe', Stufentempel: 'Tempelstufen', Pagode: 'Pagodenhain', Höhle: 'Echohöhle', Wachturm: 'Wachposten', 'Säulenruine': 'Alte Ruinen', Schrein: 'Stiller Schrein', Steinkreis: 'Steinkreis', 'Torii-Tor': 'Rote Tore' };
function computePOIs() {
  const pois = [], used = new Set();
  const houses = G.houses.filter(h => Math.hypot(h.pos.x - G.spawnCenter.x, h.pos.z - G.spawnCenter.z) > G.spawnRadius);
  let n = 0;
  for (let i = 0; i < houses.length; i++) {
    if (used.has(i)) continue;
    const grp = [i]; used.add(i);
    for (let k = 0; k < grp.length; k++) for (let j = 0; j < houses.length; j++) {
      if (used.has(j)) continue;
      if (houses[grp[k]].pos.distanceTo(houses[j].pos) < 38) { grp.push(j); used.add(j); }
    }
    if (grp.length < 3) continue;
    let x = 0, z = 0, r = 0; for (const g of grp) { x += houses[g].pos.x; z += houses[g].pos.z; }
    x /= grp.length; z /= grp.length;
    for (const g of grp) r = Math.max(r, Math.hypot(houses[g].pos.x - x, houses[g].pos.z - z));
    pois.push({ name: TOWN_NAMES[n++ % TOWN_NAMES.length], x, z, r: r + 18 });
  }
  const seen = {};
  for (const l of G.landmarks || []) {
    const nm = LM_NAMES[l.name]; if (!nm) continue;
    if (seen[nm] || Math.hypot(l.pos.x - G.spawnCenter.x, l.pos.z - G.spawnCenter.z) < G.spawnRadius) continue;
    if (pois.some(p => Math.hypot(p.x - l.pos.x, p.z - l.pos.z) < p.r + 10)) continue;
    seen[nm] = 1;
    pois.push({ name: nm, x: l.pos.x, z: l.pos.z, r: 30 });
  }
  pois.push({ name: 'Startinsel', x: G.spawnCenter.x, z: G.spawnCenter.z, r: G.spawnRadius });
  G.pois = pois;
}
function updatePoi(a) {
  if (!a.alive || a.state === 'bus') return;
  let found = null;
  for (const p of G.pois) if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < p.r) { found = p; break; }
  if (found !== curPoi) {
    curPoi = found;
    el['poi-now'].textContent = found ? found.name : '';
    if (found && a.state !== 'skydive') { el['poi-banner'].textContent = found.name; el['poi-banner'].style.opacity = 1; poiT = 2.5; }
  }
}
function stormBanners() {
  const s = G.storm; if (!s || !s.active) { lastStorm = null; return; }
  const key = s.phase + ':' + (s.shrinking ? 1 : 0);
  if (key === lastStorm) return;
  const first = lastStorm === null; lastStorm = key;
  const si = stormInfo();
  if (s.shrinking) banner('Der Sturm zieht sich zusammen!', 'Bring dich ins Sturmauge');
  else banner(first ? 'Sturm entdeckt' : 'Sturmauge schrumpft', 'in ' + fmt(si.left));
}
function scoreboard() {
  const list = G.actors.slice().sort((x, y) => y.kills - x.kills || (y.alive - x.alive));
  el.scoreboard.innerHTML = `<h3>Spieler · ${aliveCount()} übrig</h3>` + list.slice(0, 14).map(a =>
    `<div class="${a === G.player ? 'me' : ''} ${a.alive ? '' : 'dead'}"><span>${a.name.replace(/</g, '&lt;')}${a.isBot ? '' : ' ●'}</span><span>${a.kills} Kills</span></div>`).join('');
}
