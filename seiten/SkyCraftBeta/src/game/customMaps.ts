import type { Mode } from "./maps";
import type { Kind } from "./world";

export interface CustomMiniGameMap {
  type: Exclude<Kind, "server">;
  seed: number;
  trees: boolean;
  // Source-world voxel coordinates that line up with arena coordinates (0, 50, 0).
  origin: [number, number, number];
  edits: number[];
  // Optional per-team spawn coordinates in the arena.
  spawns?: [number, number, number][];
}

export type MapKey = Mode | "hub";

const availableMaps: Partial<Record<MapKey, CustomMiniGameMap>> = {};
const mapFiles = import.meta.glob<CustomMiniGameMap>("./minigameMaps/*.json", { eager: true, import: "default" });
const mapKeys: MapKey[] = ["bedwars", "skywars", "oneblock", "buildbattle", "dropper", "hub"];
for (const [path, map] of Object.entries(mapFiles)) {
  const key = path.slice(path.lastIndexOf("/") + 1, -5);
  if (mapKeys.includes(key as MapKey)) availableMaps[key as MapKey] = map;
}

export const CUSTOM_MINIGAME_MAPS: Partial<Record<MapKey, CustomMiniGameMap>> = availableMaps;
