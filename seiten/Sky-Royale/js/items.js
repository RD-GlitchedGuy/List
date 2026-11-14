// Waffen, Items, Munition und Loot-Tabellen
import { weighted } from './state.js';

export const AMMO = {
  light:   { name: 'Leichte Munition',  short: 'Leicht',  pile: 30, color: '#c9c2a0' },
  medium:  { name: 'Mittlere Munition', short: 'Mittel',  pile: 20, color: '#8fa36a' },
  heavy:   { name: 'Schwere Munition',  short: 'Schwer',  pile: 6,  color: '#5e7287' },
  shells:  { name: 'Schrotpatronen',    short: 'Schrot',  pile: 8,  color: '#b0623c' },
  rockets: { name: 'Raketen',           short: 'Raketen', pile: 3,  color: '#a14a3a' },
};

// spread/adsSpread/recoil in Grad, speed in m/s, grav = Kugelfall in m/s²
export const DEFS = {
  pickaxe: { type: 'melee', cls: 'pickaxe', name: 'Spitzhacke', dmg: 20, rate: 1.6, range: 2.4, cross: 'dot', icon: 'pickaxe' },

  ar:        { type: 'gun', cls: 'ar', name: 'Sturmgewehr', ammo: 'medium', dmg: 30, head: 1.5, rate: 5.5, mag: 30, reload: 2.3,
               spread: 2.0, adsSpread: 0.35, bloom: 0.25, recoil: 0.9, kick: 0.35, speed: 420, grav: 14, life: 1.4, auto: true,
               cross: 'dot', adsFov: 55, rar: [0, 4], icon: 'ar', model: { len: 0.82, h: 0.12, stock: 0.22, mag: 0.18, sight: 1 } },
  burst:     { type: 'gun', cls: 'ar', name: 'Burst-Sturmgewehr', ammo: 'medium', dmg: 27, head: 1.5, rate: 2.2, mag: 30, reload: 2.5,
               burst: 3, burstGap: 0.075, spread: 2.2, adsSpread: 0.4, bloom: 0.2, recoil: 0.75, kick: 0.3, speed: 420, grav: 14, life: 1.4,
               auto: false, cross: 'dot', adsFov: 55, rar: [0, 4], icon: 'burst', model: { len: 0.78, h: 0.13, stock: 0.2, mag: 0.16, sight: 1 } },
  heavyar:   { type: 'gun', cls: 'ar', name: 'Schweres Sturmgewehr', ammo: 'medium', dmg: 36, head: 1.5, rate: 3.75, mag: 25, reload: 2.7,
               spread: 2.4, adsSpread: 0.5, bloom: 0.35, recoil: 1.9, kick: 0.5, speed: 400, grav: 14, life: 1.4, auto: true,
               cross: 'dot', adsFov: 55, rar: [1, 4], icon: 'heavyar', model: { len: 0.9, h: 0.15, stock: 0.25, mag: 0.2, sight: 1 } },
  smg:       { type: 'gun', cls: 'smg', name: 'Taktische MP', ammo: 'light', dmg: 17, head: 1.75, rate: 11, mag: 30, reload: 2.2,
               spread: 3.0, adsSpread: 1.4, bloom: 0.15, recoil: 0.45, kick: 0.25, speed: 330, grav: 16, life: 0.9, auto: true,
               cross: 'dot', adsFov: 65, rar: [0, 3], icon: 'smg', model: { len: 0.55, h: 0.12, stock: 0.08, mag: 0.2, sight: 0 } },
  csmg:      { type: 'gun', cls: 'smg', name: 'Kompakt-MP', ammo: 'light', dmg: 16, head: 1.75, rate: 14, mag: 40, reload: 2.7,
               spread: 3.6, adsSpread: 1.8, bloom: 0.12, recoil: 0.4, kick: 0.2, speed: 320, grav: 16, life: 0.9, auto: true,
               cross: 'dot', adsFov: 65, rar: [2, 4], icon: 'csmg', model: { len: 0.5, h: 0.14, stock: 0, mag: 0.26, sight: 0 } },
  pistol:    { type: 'gun', cls: 'pistol', name: 'Pistole', ammo: 'light', dmg: 24, head: 2, rate: 6.75, mag: 16, reload: 1.4,
               spread: 2.4, adsSpread: 0.9, bloom: 0.2, recoil: 0.9, kick: 0.45, speed: 300, grav: 16, life: 1.0, auto: false,
               cross: 'dot', adsFov: 68, rar: [0, 2], icon: 'pistol', model: { len: 0.26, h: 0.12, stock: 0, mag: 0.12, sight: 0, pistol: 1 } },
  handcannon:{ type: 'gun', cls: 'pistol', name: 'Handkanone', ammo: 'heavy', dmg: 60, head: 2, rate: 0.85, mag: 7, reload: 2.0,
               spread: 2.6, adsSpread: 0.6, bloom: 0, recoil: 6, kick: 1.0, speed: 330, grav: 14, life: 1.2, auto: false,
               cross: 'dot', adsFov: 62, rar: [3, 4], icon: 'handcannon', model: { len: 0.34, h: 0.15, stock: 0, mag: 0.12, sight: 0, pistol: 1 } },
  pump:      { type: 'gun', cls: 'shotgun', name: 'Pump-Shotgun', ammo: 'shells', dmg: 9.5, pellets: 10, head: 2, rate: 0.7, mag: 5, reload: 4.4,
               spread: 2.4, adsSpread: 1.8, bloom: 0, recoil: 5, kick: 1.0, speed: 260, grav: 22, life: 0.35, auto: false,
               cross: 'square', adsFov: 70, rar: [1, 4], icon: 'pump', model: { len: 0.85, h: 0.12, stock: 0.25, mag: 0, sight: 0, pump: 1 } },
  tac:       { type: 'gun', cls: 'shotgun', name: 'Taktische Shotgun', ammo: 'shells', dmg: 9, pellets: 8, head: 1.75, rate: 1.5, mag: 8, reload: 6.0,
               spread: 2.9, adsSpread: 2.2, bloom: 0, recoil: 3.5, kick: 0.8, speed: 260, grav: 22, life: 0.35, auto: false,
               cross: 'square', adsFov: 70, rar: [0, 3], icon: 'tac', model: { len: 0.8, h: 0.14, stock: 0.2, mag: 0.1, sight: 0, pump: 1 } },
  sniper:    { type: 'gun', cls: 'sniper', name: 'Repetier-Scharfschützengewehr', ammo: 'heavy', dmg: 105, head: 2.5, rate: 0.36, mag: 1, reload: 2.6,
               spread: 6.0, adsSpread: 0, bloom: 0, recoil: 7, kick: 1.2, speed: 330, grav: 12, life: 3.0, auto: false,
               cross: 'dot', adsFov: 14, scope: true, rar: [2, 4], icon: 'sniper', model: { len: 1.15, h: 0.12, stock: 0.28, mag: 0.08, sight: 2 } },
  hunting:   { type: 'gun', cls: 'sniper', name: 'Jagdgewehr', ammo: 'heavy', dmg: 86, head: 2.5, rate: 0.6, mag: 1, reload: 1.9,
               spread: 4.0, adsSpread: 0.15, bloom: 0, recoil: 5, kick: 1.0, speed: 300, grav: 14, life: 2.6, auto: false,
               cross: 'dot', adsFov: 36, rar: [0, 3], icon: 'hunting', model: { len: 1.05, h: 0.11, stock: 0.3, mag: 0, sight: 0 } },
  rocket:    { type: 'gun', cls: 'rocket', name: 'Raketenwerfer', ammo: 'rockets', dmg: 100, splash: 5, head: 1, rate: 0.8, mag: 1, reload: 3.6,
               spread: 0.6, adsSpread: 0.2, bloom: 0, recoil: 4, kick: 1.1, speed: 70, grav: 3, life: 4, auto: false,
               cross: 'dot', adsFov: 60, rar: [2, 4], icon: 'rocket', model: { len: 1.0, h: 0.2, stock: 0, mag: 0, sight: 1, tube: 1 } },

  grenade:   { type: 'throw', name: 'Granate', stack: 6, dmg: 100, radius: 4.5, fuse: 2.0, icon: 'grenade', color: '#4d5a3a' },
  shockwave: { type: 'throw', name: 'Schockwellengranate', stack: 2, knock: true, radius: 5.5, fuse: 0, icon: 'shockwave', color: '#3a7fc2' },
  launchpad: { type: 'place', name: 'Startrampe', stack: 1, icon: 'launchpad', color: '#c9a23a' },
  grappler:  { type: 'grapple', name: 'Enterhaken', stack: 10, range: 70, icon: 'grappler', color: '#7a4a2a', charges: true },
  rift:      { type: 'rift', name: 'Riss-Gerät', stack: 1, icon: 'rift', color: '#6a4abf' },

  bandage:   { type: 'heal', name: 'Verband', stack: 15, hp: 15, cap: 75, time: 3.5, icon: 'bandage', color: '#d6d0c0' },
  medkit:    { type: 'heal', name: 'Medikit', stack: 3, hp: 100, cap: 100, time: 10, icon: 'medkit', color: '#c84a3a' },
  minishield:{ type: 'shield', name: 'Kleiner Schildtrank', stack: 6, sh: 25, cap: 50, time: 2, icon: 'minishield', color: '#4a97cf' },
  shield:    { type: 'shield', name: 'Schildtrank', stack: 3, sh: 50, cap: 100, time: 5, icon: 'shield', color: '#2f6fae' },
};

const DMG_MULT = [1, 1.05, 1.1, 1.16, 1.22];
const RELOAD_MULT = [1, 0.95, 0.9, 0.85, 0.8];

export function stat(item) {
  const d = DEFS[item.key];
  if (d.type !== 'gun') return d;
  const r = item.rarity || 0;
  return Object.assign({}, d, { dmg: d.dmg * DMG_MULT[r], reload: d.reload * RELOAD_MULT[r] });
}

export function createItem(key, rarity = 0, count = 1) {
  const d = DEFS[key];
  if (d.type === 'gun') {
    const r = Math.max(d.rar[0], Math.min(d.rar[1], rarity));
    return { key, rarity: r, mag: d.mag };
  }
  if (d.type === 'melee') return { key, rarity: 0 };
  return { key, rarity: 1, count: d.charges ? d.stack : count };
}

export function itemLabel(item) {
  if (item.ammo) return `${AMMO[item.ammo].name} (${item.amount})`;
  const d = DEFS[item.key];
  return item.count > 1 ? `${d.name} ×${item.count}` : d.name;
}

const WEAPON_POOL = { ar: 14, burst: 7, heavyar: 6, smg: 10, csmg: 5, pistol: 9, handcannon: 3, pump: 10, tac: 8, sniper: 4, hunting: 5, rocket: 2 };
const ITEM_POOL = { bandage: 10, medkit: 4, minishield: 10, shield: 6, grenade: 6, shockwave: 4, launchpad: 3, grappler: 3, rift: 3 };
const RARITY_CHEST = { 0: 22, 1: 36, 2: 26, 3: 12, 4: 4 };
const RARITY_FLOOR = { 0: 45, 1: 32, 2: 17, 3: 5, 4: 1 };
const ITEM_COUNT = { bandage: [3, 5], medkit: [1, 1], minishield: [2, 3], shield: [1, 1], grenade: [2, 3], shockwave: [1, 2], launchpad: [1, 1], grappler: [1, 1], rift: [1, 1] };

function rollWeapon(rTable) {
  const key = weighted(WEAPON_POOL);
  return createItem(key, +weighted(rTable));
}
function rollItem() {
  const key = weighted(ITEM_POOL);
  const [a, b] = ITEM_COUNT[key];
  return createItem(key, 1, a + ((Math.random() * (b - a + 1)) | 0));
}
const ammoFor = key => ({ ammo: DEFS[key].ammo, amount: AMMO[DEFS[key].ammo].pile });
const randomAmmo = () => { const t = weighted({ light: 4, medium: 4, heavy: 2, shells: 3, rockets: 0.6 }); return { ammo: t, amount: AMMO[t].pile }; };

export function rollChest() {
  const w = rollWeapon(RARITY_CHEST);
  const out = [w, ammoFor(w.key), rollItem()];
  if (Math.random() < 0.35) out.push(randomAmmo());
  return out;
}
export function rollAmmoBox() {
  const out = [randomAmmo(), randomAmmo()];
  if (Math.random() < 0.5) out.push(randomAmmo());
  if (Math.random() < 0.25) out.push(createItem('grenade', 1, 2));
  return out;
}
export function rollFloor() {
  const r = Math.random();
  if (r < 0.55) { const w = rollWeapon(RARITY_FLOOR); return [w, ammoFor(w.key)]; }
  if (r < 0.85) return [rollItem()];
  return [randomAmmo()];
}
