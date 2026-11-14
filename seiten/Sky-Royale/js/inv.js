// Inventar: Alt (bzw. Steuerkreuz hoch) halten. Anklicken = ausrüsten/markieren, zweiter Klick tauscht, Rechtsklick legt ab.
import * as THREE from 'three';
import { G } from './state.js';
import { down, hit, mouse, analog, touchMode, bindLabel, bindShort, padConnected, virtDown, padState } from './input.js';
import { DEFS, AMMO, stat } from './items.js';
import { RARITIES } from './state.js';
import { switchSlot } from './actors.js';
import { setHeldModel } from './models.js';
import { spawnLoot } from './loot.js';
import { sfx } from './audio.js';

let root, slotsEl, infoEl, ammoEl, cursor, open = false, mark = null, hover = null;
const cur = { x: 0, y: 0 };
const esc = s => String(s).replace(/</g, '&lt;');

export function initInventory() {
  root = document.getElementById('inv');
  root.innerHTML = `<div class="inv-box"><div class="inv-head">Inventar <small></small><span class="inv-close" data-act="close">Schließen</span></div><div class="inv-slots"></div>
    <div class="inv-row"><div class="inv-info"></div><div class="inv-drop" data-act="drop">Ablegen</div></div>
    <div class="inv-ammo"></div></div><div class="inv-cursor"></div>`;
  slotsEl = root.querySelector('.inv-slots'); infoEl = root.querySelector('.inv-info'); ammoEl = root.querySelector('.inv-ammo');
  cursor = root.querySelector('.inv-cursor');
  for (let s = 0; s <= 5; s++) {
    const d = document.createElement('div'); d.className = 'inv-slot'; d.dataset.slot = s;
    d.innerHTML = `<span class="key">${s === 0 ? 'F' : s}</span><svg><use href=""></use></svg><div class="rar"></div><b></b><small></small>`;
    slotsEl.appendChild(d);
  }
  // Touch (und normale Maus ohne Fangen): direkt antippen
  root.addEventListener('pointerdown', e => {
    if (!open || document.pointerLockElement) return;
    e.preventDefault();
    const t = e.target.closest('[data-slot],[data-ammo],[data-act]');
    if (e.button === 2) dropAt(t); else clickAt(t);
  });
}

function itemOf(t) {
  const a = G.player;
  if (!t) return null;
  if (t.dataset.slot !== undefined) return { slot: +t.dataset.slot, item: a.inv[+t.dataset.slot] };
  if (t.dataset.ammo) return { ammo: t.dataset.ammo };
  if (t.dataset.act) return { act: t.dataset.act };
  return null;
}
const same = (x, y) => x && y && x.slot === y.slot && x.ammo === y.ammo;

function clickAt(t) {
  const a = G.player, o = itemOf(t);
  if (!o) { mark = null; return; }
  if (o.act === 'drop') { if (mark) dropThing(mark); mark = null; return; }
  if (o.act === 'close') { virtDown.delete('inventory'); padState.inv = false; const b = document.querySelector('.b-inv'); if (b) b.classList.remove('on'); return; }
  if (o.ammo) { mark = same(mark, o) ? null : o; return; }
  if (mark && mark.slot !== undefined && !same(mark, o) && mark.slot > 0 && o.slot > 0) {   // tauschen
    const i = mark.slot, j = o.slot;
    [a.inv[i], a.inv[j]] = [a.inv[j], a.inv[i]];
    if (a.slot === i) a.slot = j; else if (a.slot === j) a.slot = i;
    if (!a.inv[a.slot]) a.slot = 0;
    setHeldModel(a); sfx('equip'); mark = null; return;
  }
  if (same(mark, o)) { mark = null; return; }
  if (o.item || o.slot === 0) switchSlot(a, o.slot);
  mark = o.slot > 0 && o.item ? o : null;
}
function dropAt(t) { const o = itemOf(t); if (o && (o.item || o.ammo)) dropThing(o); }

function dropThing(o) {
  const a = G.player;
  const at = a.pos.clone().add(new THREE.Vector3(-Math.sin(a.yaw) * 1.2, 0.1, -Math.cos(a.yaw) * 1.2));
  if (o.ammo) {
    const n = a.ammo[o.ammo]; if (!n) return;
    a.ammo[o.ammo] = 0; spawnLoot({ ammo: o.ammo, amount: n }, at, true);
  } else {
    if (!o.slot || !a.inv[o.slot]) return;
    const it = a.inv[o.slot]; a.inv[o.slot] = null;
    spawnLoot(it, at, true);
    if (a.slot === o.slot) { a.slot = 0; a.reloadT = 0; a.channel = null; }
    setHeldModel(a);
  }
  if (same(mark, o)) mark = null;
  sfx('drop');
}

export function updateInventory(dt) {
  const a = G.player;
  const can = a && a.alive && !G.ended && !G.victory && a.state !== 'bus' && a.state !== 'car';
  if (!can) padState.inv = false;
  const want = can && (down('inventory') || padState.inv);
  if (want !== open) {
    open = want; G.invOpen = open; mark = null;
    root.classList.toggle('hidden', !open);
    document.body.classList.toggle('inv-open', open);
    if (open) { cur.x = innerWidth / 2; cur.y = innerHeight / 2; }
    sfx(open ? 'invopen' : 'invclose');
  }
  if (!open) return;
  // Zeiger: Maus (gefangen) oder rechter Stick
  const usesCursor = !touchMode || padConnected;
  cursor.style.display = usesCursor ? 'block' : 'none';
  if (usesCursor) {
    cur.x = THREE.MathUtils.clamp(cur.x + mouse.dx + analog.lookX * 900 * dt, 0, innerWidth - 2);
    cur.y = THREE.MathUtils.clamp(cur.y + mouse.dy + analog.lookY * 900 * dt, 0, innerHeight - 2);
    cursor.style.left = cur.x + 'px'; cursor.style.top = cur.y + 'px';
    cursor.style.visibility = 'hidden';
    const el = document.elementFromPoint(cur.x, cur.y);
    cursor.style.visibility = '';
    const t = el && el.closest ? el.closest('[data-slot],[data-ammo],[data-act]') : null;
    if (t && t !== hover) sfx('hover');
    hover = t;
    if (hit('fire') || (padConnected && hit('jump'))) clickAt(t);
    if (hit('aim') || hit('padUse')) dropAt(t);
  }
  render();
}

function render() {
  const a = G.player;
  root.querySelector('.inv-head small').textContent = padConnected ? 'Steuerkreuz ↑ zum Schließen · A: ausrüsten / tauschen · X: ablegen · rechter Stick: Zeiger'
    : touchMode ? 'Antippen: ausrüsten / tauschen · Ablegen-Feld: wegwerfen' : `${bindLabel('inventory')} loslassen zum Schließen · Klick: ausrüsten / tauschen · Rechtsklick: ablegen`;
  [...slotsEl.children].forEach((d, s) => {
    const it = a.inv[s];
    d.firstChild.textContent = padConnected || touchMode ? '' : bindShort(s === 0 ? 'pickaxe' : 'slot' + s);
    d.classList.toggle('sel', s === a.slot);
    d.classList.toggle('mark', !!mark && mark.slot === s);
    d.classList.toggle('hov', hover === d);
    const icon = it ? 'assets/icons/items.svg#' + DEFS[it.key].icon : '';
    const use = d.querySelector('use'); if (use.getAttribute('href') !== icon) use.setAttribute('href', icon);
    d.querySelector('.rar').style.background = it && s > 0 ? RARITIES[it.rarity || 0].color : 'transparent';
    d.querySelector('b').textContent = it ? DEFS[it.key].name : s === 0 ? '' : 'Leer';
    d.querySelector('small').textContent = it ? (it.count !== undefined ? '×' + it.count : DEFS[it.key].type === 'gun' ? `${it.mag} / ${DEFS[it.key].mag}` : '') : '';
  });
  const keys = Object.keys(AMMO);
  if (ammoEl.children.length !== keys.length) ammoEl.innerHTML = keys.map(k => `<div class="inv-am" data-ammo="${k}"><span>${AMMO[k].name}</span><b></b></div>`).join('');
  [...ammoEl.children].forEach(d => {
    const k = d.dataset.ammo; d.querySelector('b').textContent = a.ammo[k] || 0;
    d.classList.toggle('mark', !!mark && mark.ammo === k); d.classList.toggle('hov', hover === d); d.classList.toggle('empty', !a.ammo[k]);
  });
  root.querySelector('.inv-drop').classList.toggle('hov', hover && hover.dataset.act === 'drop');
  root.querySelector('.inv-drop').classList.toggle('on', !!mark);
  // Infos zum Gegenstand unter dem Zeiger (oder dem markierten / ausgerüsteten)
  const o = itemOf(hover) || mark || { slot: a.slot, item: a.inv[a.slot] };
  let html = '';
  if (o && o.item) {
    const it = o.item, d = DEFS[it.key], s = stat(it);
    html = `<b style="color:${o.slot > 0 ? RARITIES[it.rarity || 0].color : '#ddd'}">${esc(d.name)}</b>` + (o.slot > 0 && d.type === 'gun' ? ` · ${RARITIES[it.rarity || 0].name}` : '');
    if (d.type === 'gun') html += `<br>Schaden ${Math.round(s.dmg * (d.pellets || 1))} · Feuerrate ${d.rate} · Magazin ${d.mag} · Nachladen ${s.reload.toFixed(1)} s · ${AMMO[d.ammo].name}`;
    else if (d.type === 'melee') html += '<br>Baut Gebäude, Bäume und Steine ab';
    else if (it.count !== undefined) html += `<br>Anzahl ${it.count}`;
  } else if (o && o.ammo) html = `<b>${AMMO[o.ammo].name}</b><br>${a.ammo[o.ammo] || 0} Schuss`;
  infoEl.innerHTML = html;
}
