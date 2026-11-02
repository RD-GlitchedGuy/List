import type { Kind } from "./world";

export type Lang = "de" | "en" | "es" | "fr";
export type ControlAction = "forward" | "back" | "left" | "right" | "jump" | "sprint" | "sneak" | "drop" | "zoom" | "inventory" | "shop";
export type Controls = Record<ControlAction, string>;
export const DEFAULT_CONTROLS: Controls = {
  forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", jump: "Space",
  sprint: "ControlLeft", sneak: "ShiftLeft", drop: "KeyQ", zoom: "KeyC", inventory: "KeyE", shop: "KeyB",
};
export interface Settings {
  lang: Lang; sens: number; fov: number; renderDist: number; name: string; skin: string | null; controls: Controls; aiMusic: boolean;
}
export const SKIN_PRESETS = ["classic", "emerald", "ocean", "sunset", "violet"] as const;
export const isSkinSelection = (value: unknown): value is string =>
  typeof value === "string" && SKIN_PRESETS.some((preset) => value === `preset:${preset}`);
export const DEFAULT_SETTINGS: Settings = { lang: "de", sens: 1, fov: 75, renderDist: 5, name: "Steve" + Math.floor(Math.random() * 900 + 100), skin: "preset:classic", controls: DEFAULT_CONTROLS, aiMusic: true };

export function normalizePlayerName(name: string) {
  return name.trim().slice(0, 16) || DEFAULT_SETTINGS.name;
}

export type GM = "survival" | "creative";
export interface Slot { id: number; n: number }
export interface SavedMob { kind: "chicken" | "cow" | "zombie"; x: number; y: number; z: number; yaw: number; health?: number }
export interface SaveData {
  name: string; seed: number; seedText: string; type: Kind; gm: GM; cheats: boolean; trees: boolean;
  daylight: boolean; keepInv: boolean; weather: "clear" | "rain";
  time: number; pos: [number, number, number] | null; yaw: number; pitch: number;
  spawn: [number, number, number] | null; inv: (Slot | null)[]; hp: number; edits: number[];
  mobs?: SavedMob[]; armorTier?: number;
  created: number; lastPlayed: number;
}

const WORLD_FILE_FORMAT = "skycraft-world";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPosition = (value: unknown): value is [number, number, number] | null =>
  value === null || (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite));
const isSavedMob = (value: unknown): value is SavedMob =>
  isRecord(value) && (value.kind === "chicken" || value.kind === "cow" || value.kind === "zombie") &&
  typeof value.x === "number" && Number.isFinite(value.x) && Math.abs(value.x) < 500_000 &&
  typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y < 96 &&
  typeof value.z === "number" && Number.isFinite(value.z) && Math.abs(value.z) < 500_000 &&
  typeof value.yaw === "number" && Number.isFinite(value.yaw) &&
  (value.health === undefined || (typeof value.health === "number" && Number.isFinite(value.health) && value.health > 0 && value.health <= 20));

export function serializeWorldFile(world: SaveData): string {
  return JSON.stringify({ format: WORLD_FILE_FORMAT, version: 1, world }, null, 2);
}

export function parseWorldFile(contents: string): SaveData {
  let file: unknown;
  try {
    file = JSON.parse(contents);
  } catch {
    throw new Error("world.fileInvalid");
  }
  if (!isRecord(file) || file.format !== WORLD_FILE_FORMAT || file.version !== 1 || !isRecord(file.world)) {
    throw new Error("world.fileInvalid");
  }
  const world = file.world;
  if (
    typeof world.name !== "string" || !world.name.trim() ||
    !Number.isFinite(world.seed) || typeof world.seedText !== "string" ||
    !["normal", "flat", "sky", "hub"].includes(String(world.type)) ||
    !["survival", "creative"].includes(String(world.gm)) ||
    typeof world.cheats !== "boolean" || typeof world.trees !== "boolean" ||
    typeof world.daylight !== "boolean" || typeof world.keepInv !== "boolean" ||
    !["clear", "rain"].includes(String(world.weather)) ||
    !Number.isFinite(world.time) || !isPosition(world.pos) ||
    !Number.isFinite(world.yaw) || !Number.isFinite(world.pitch) || !isPosition(world.spawn) ||
    !Number.isFinite(world.hp) || !Number.isFinite(world.created) || !Number.isFinite(world.lastPlayed) ||
    !Array.isArray(world.inv) || world.inv.length !== 36 ||
    !world.inv.every((slot) => slot === null || (
      isRecord(slot) && Number.isInteger(slot.id) && Number(slot.id) >= 0 && Number(slot.id) <= 255 &&
      Number.isInteger(slot.n) && Number(slot.n) >= 1 && Number(slot.n) <= 64
    )) ||
    !Array.isArray(world.edits) || world.edits.length > 1_000_000 || world.edits.length % 4 !== 0 ||
    !world.edits.every(Number.isSafeInteger) ||
    world.edits.some((value, index) => index % 4 === 1 && (value < 0 || value >= 96)) ||
    world.edits.some((value, index) => index % 4 === 3 && (value < 0 || value > 255))
  ) {
    throw new Error("world.fileInvalid");
  }
  if (world.mobs !== undefined && (!Array.isArray(world.mobs) || world.mobs.length > 500 || !world.mobs.every(isSavedMob))) {
    throw new Error("world.fileInvalid");
  }
  if (world.armorTier !== undefined && (typeof world.armorTier !== "number" || !Number.isInteger(world.armorTier) || world.armorTier < 0 || world.armorTier > 3)) {
    throw new Error("world.fileInvalid");
  }
  return world as unknown as SaveData;
}

const SKEY = "skycraft.settings";
const WKEY = (slot: number) => "skycraft.world." + slot;

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "null");
    if (s) return {
      ...DEFAULT_SETTINGS,
      ...s,
      name: typeof s.name === "string" ? normalizePlayerName(s.name) : DEFAULT_SETTINGS.name,
      skin: isSkinSelection(s.skin) ? s.skin : DEFAULT_SETTINGS.skin,
      aiMusic: typeof s.aiMusic === "boolean" ? s.aiMusic : DEFAULT_SETTINGS.aiMusic,
      controls: Object.fromEntries(Object.entries(DEFAULT_CONTROLS).map(([action, code]) => [
        action, typeof s.controls?.[action] === "string" && s.controls[action].length <= 32 ? s.controls[action] : code,
      ])) as Controls,
    };
  } catch { /* ignore */ }
  const s = { ...DEFAULT_SETTINGS };
  localStorage.setItem(SKEY, JSON.stringify(s));
  return s;
}
export function saveSettings(s: Settings) { localStorage.setItem(SKEY, JSON.stringify({ ...s, name: normalizePlayerName(s.name) })); }

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
