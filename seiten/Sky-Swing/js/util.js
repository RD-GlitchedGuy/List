// Kleine Helfer, die überall gebraucht werden
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const $ = id => document.getElementById(id);
export const isTouch = matchMedia('(pointer: coarse)').matches;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const UP = new V3(0, 1, 0);
export const DOWN = new V3(0, -1, 0);

// fester Zufall, damit die Stadt bei jedem Start gleich aussieht
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rand = mulberry32(20261101);
export const rr = (a, b) => a + (b - a) * rand();
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
