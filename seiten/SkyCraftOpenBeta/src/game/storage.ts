import type { Kind } from "./world";

export type Lang = "de" | "en" | "es" | "fr";
export interface Settings {
  lang: Lang; sens: number; fov: number; renderDist: number; name: string;
}
export const DEFAULT_SETTINGS: Settings = { lang: "de", sens: 1, fov: 75, renderDist: 5, name: "Steve" + Math.floor(Math.random() * 900 + 100) };

export type GM = "survival" | "creative";
export interface Slot { id: number; n: number }
export interface SaveData {
  name: string; seed: number; seedText: string; type: Kind; gm: GM; cheats: boolean; trees: boolean;
  daylight: boolean; keepInv: boolean; weather: "clear" | "rain";
  time: number; pos: [number, number, number] | null; yaw: number; pitch: number;
  spawn: [number, number, number] | null; inv: (Slot | null)[]; hp: number; edits: number[];
  created: number; lastPlayed: number;
}

const SKEY = "skycraft.settings";
const WKEY = (slot: number) => "skycraft.world." + slot;

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "null");
    if (s) return { ...DEFAULT_SETTINGS, ...s };
  } catch { /* ignore */ }
  const s = { ...DEFAULT_SETTINGS };
  localStorage.setItem(SKEY, JSON.stringify(s));
  return s;
}
export function saveSettings(s: Settings) { localStorage.setItem(SKEY, JSON.stringify(s)); }

export function loadWorld(slot: number): SaveData | null {
  try { return JSON.parse(localStorage.getItem(WKEY(slot)) || "null"); } catch { return null; }
}
export function saveWorld(slot: number, d: SaveData): boolean {
  try { localStorage.setItem(WKEY(slot), JSON.stringify(d)); return true; } catch { return false; }
}
export function deleteWorld(slot: number) { localStorage.removeItem(WKEY(slot)); }

export function newSave(p: Partial<SaveData> & { name: string; seed: number; seedText: string; type: Kind }): SaveData {
  return {
    gm: "survival", cheats: true, trees: true, daylight: true, keepInv: true, weather: "clear",
    time: 1000, pos: null, yaw: 0, pitch: 0, spawn: null, inv: new Array(36).fill(null), hp: 20, edits: [],
    created: Date.now(), lastPlayed: Date.now(), ...p,
  };
}
