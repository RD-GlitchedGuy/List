// Gemeinsamer Spielzustand – alle Module lesen und schreiben hier.
import * as THREE from 'three';

export const G = {
  phase: 'loading',          // loading | menu | warmup | bus | match | end
  time: 0,
  phaseT: 0,
  paused: false,
  scene: null, camera: null, renderer: null, sun: null,
  collider: null,            // ein Mesh mit BVH für alle Kollisionen
  heights: null,             // Höhenraster des Geländes
  actors: [], player: null,
  chests: [], loot: [], pads: [], ladders: [], cars: [], jumpPads: [], geysers: [], springs: [], houses: [],
  spawnPoints: [],
  spawnCenter: new THREE.Vector3(265, 0, 226),
  spawnRadius: 72,
  projectiles: [], throwables: [],
  storm: null, bus: null,
  pings: [],
  settings: { sens: 1 },
  baseFov: 80,
};

export const WATER_Y = 0;
export const GRAVITY = 26;
export const MAP_HALF = 320;

export const RARITIES = [
  { name: 'Gewöhnlich',   color: '#8f9297' },
  { name: 'Ungewöhnlich', color: '#4f9a3a' },
  { name: 'Selten',       color: '#3b78c0' },
  { name: 'Episch',       color: '#8550bd' },
  { name: 'Legendär',     color: '#c58a2c' },
];

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export function weighted(table) {
  let sum = 0; for (const k in table) sum += table[k];
  let r = Math.random() * sum;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// kleiner Event-Bus, damit die Module nicht im Kreis importieren müssen
const listeners = {};
export const on = (name, fn) => (listeners[name] ||= []).push(fn);
export const emit = (name, ...args) => (listeners[name] || []).forEach(fn => fn(...args));
