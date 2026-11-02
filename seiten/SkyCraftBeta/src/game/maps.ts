import { CUSTOM_MINIGAME_MAPS, MapKey } from "./customMaps";
import { World } from "./world";

export type Mode = "bedwars" | "skywars" | "oneblock" | "buildbattle" | "dropper";
export type Variant = "solo" | "duo";
export const MODES: Mode[] = ["bedwars", "skywars", "oneblock", "buildbattle", "dropper"];
export const HUB_PORTALS = MODES.map((mode, i) => ({ mode, x: (i - 2) * 4, color: [13, 14, 15, 16, 24][i] }));
export function hubPortalAt(x: number, z: number): Mode | null {
  return HUB_PORTALS.find((portal) => Math.abs(x - portal.x - 0.5) < 0.75 && Math.abs(z - 390.5) < 0.7)?.mode || null;
}

export function isHubPortalOpening(x: number, y: number, z: number) {
  return z === 390 && y >= 61 && y <= 63 && HUB_PORTALS.some((portal) => x === portal.x);
}

export const TEAMS = [
  { key: "red", color: "#ef4444", wool: 13, bed: 18 },
  { key: "blue", color: "#3b82f6", wool: 14, bed: 19 },
  { key: "green", color: "#22c55e", wool: 15, bed: 20 },
  { key: "yellow", color: "#facc15", wool: 16, bed: 21 },
];
export const teamColor = (i: number) => (i < 0 ? "#9ca3af" : TEAMS[i % 4].color);

export const LOBBY = { x: 0.5, y: 61.2, z: 400.5 };
export const BW_C = [[0, -34], [34, 0], [0, 34], [-34, 0]];
export const SW_C = [[-26, -26], [26, -26], [26, 26], [-26, 26]];
export const BB_C = [[-30, -30], [30, -30], [-30, 30], [30, 30]];
export const OB_X = 40;
export const DROP_TOP = 91;
export const DROP_LEVELS = 5;

const DROP_HOLES: [number, number][] = [[6, 6], [3, 6], [9, 6], [6, 3], [6, 9]];
export const dropperSpawn = (team: number, level: number): [number, number, number] =>
  [team * 16 + 1.5, DROP_TOP, level * 16 + 6.5];
export const dropLayerY = (floor: number) => 78 - floor * 16;
export const dropHoleAt = (level: number, floor: number): [number, number] => {
  const index = ((level + floor) % DROP_HOLES.length + DROP_HOLES.length) % DROP_HOLES.length;
  const [x, z] = DROP_HOLES[index];
  return [x, z];
};

export function buildBattleWallBlocks(): [number, number, number][] {
  const blocks: [number, number, number][] = [];
  for (const [cx, cz] of BB_C) {
    for (let y = 51; y <= 80; y++) {
      for (let offset = -10; offset <= 10; offset++) {
        blocks.push([cx - 10, y, cz + offset], [cx + 10, y, cz + offset]);
        if (offset > -10 && offset < 10) blocks.push([cx + offset, y, cz - 10], [cx + offset, y, cz + 10]);
      }
    }
  }
  return blocks;
}

export function isBuildBattleWall(x: number, y: number, z: number) {
  if (y < 51 || y > 80) return false;
  return BB_C.some(([cx, cz]) =>
    Math.abs(x - cx) <= 10 && Math.abs(z - cz) <= 10 &&
    (Math.abs(x - cx) === 10 || Math.abs(z - cz) === 10)
  );
}

export const teamCount = (m: Mode, v: Variant) => ((m === "oneblock" || m === "dropper") && v === "solo" ? 8 : 4);
export const teamSize = (v: Variant) => (v === "duo" ? 2 : 1);
export const capacity = (m: Mode, v: Variant) => teamCount(m, v) * teamSize(v);
export const minPlayers = (m: Mode, v: Variant) => (m === "oneblock" ? 1 : v === "duo" ? 4 : 2);
export const isPvp = (m: Mode) => m === "bedwars" || m === "skywars" || m === "oneblock";

export function spawnFor(mode: Mode, team: number): [number, number, number] {
  const customSpawns = CUSTOM_MINIGAME_MAPS[mode]?.spawns;
  if (customSpawns?.length) return [...customSpawns[team % customSpawns.length]];
  switch (mode) {
    case "bedwars": { const c = BW_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 3.5]; }
    case "skywars": { const c = SW_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 0.5]; }
    case "buildbattle": { const c = BB_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 0.5]; }
    case "oneblock": return [team * OB_X + 0.5, 51.2, 0.5];
    case "dropper": return dropperSpawn(team, 0);
  }
}

export function inPlot(team: number, x: number, y: number, z: number) {
  const c = BB_C[team % 4];
  return Math.abs(x - c[0]) <= 10 && Math.abs(z - c[1]) <= 10 && y >= 51 && y <= 80;
}

function isl(dx: number, dz: number, y: number, r: number, top: number): number {
  const d = top - y;
  if (d < 0 || d > 6) return -1;
  const rr = r - d * 0.7;
  return dx * dx + dz * dz <= rr * rr ? d : -1;
}

export function lobbyBlock(x: number, y: number, z: number): number {
  const dx = Math.abs(x), dz = Math.abs(z - 400);
  if (dx > 12 || dz > 12) return 0;
  for (const portal of HUB_PORTALS) {
    if (z === 390 && y >= 61 && y <= 63 && (x === portal.x - 1 || x === portal.x + 1)) return portal.color;
    if (z === 390 && y === 64 && x >= portal.x - 1 && x <= portal.x + 1) return portal.color;
  }
  if (y === 60) return (x + z) & 1 ? 12 : 3;
  if (y >= 61 && y <= 63 && (dx === 12 || dz === 12)) return 9;
  if (y === 61 && dx <= 1 && dz <= 1 && !(dx === 0 && dz === 0)) return 22;
  return 0;
}

export function serverBlock(mode: Mode, x: number, y: number, z: number): number {
  if (z >= 386 && z <= 414 && x >= -14 && x <= 14) {
    const hubBlock = customMapBlock("hub", x, y, z, 60, 400);
    return hubBlock === null ? lobbyBlock(x, y, z) : hubBlock;
  }
  if (mode === "bedwars" && y === 51) {
    for (let team = 0; team < 4; team++) {
      const dx = x - BW_C[team][0], dz = z - BW_C[team][1];
      if ((dx === 0 || dx === 1) && dz === 0) return TEAMS[team].bed;
    }
  }
  const custom = customMapBlock(mode, x, y, z, 50, 0);
  if (custom !== null) return custom;
  switch (mode) {
    case "bedwars": {
      const d = isl(x, z, y, 9, 50);
      if (d >= 0) return 17;
      for (let t = 0; t < 4; t++) {
        const dx = x - BW_C[t][0], dz = z - BW_C[t][1];
        if (Math.abs(dx) <= 4 && Math.abs(dz) <= 4 && y >= 47 && y <= 50) return y === 50 ? TEAMS[t].wool : y === 49 ? 4 : 3;
        if ((dx === 0 || dx === 1) && dz === 0 && y === 51) return TEAMS[t].bed;
      }
      return 0;
    }
    case "skywars": {
      for (let t = 0; t < 4; t++) {
        const dx = x - SW_C[t][0], dz = z - SW_C[t][1];
        const d = isl(dx, dz, y, 5, 50);
        if (d >= 0) return d === 0 ? 1 : d <= 2 ? 2 : 3;
        if (dx === -2 && dz === -2 && y >= 51 && y <= 53) return 6;
        if (Math.abs(dx + 2) <= 1 && Math.abs(dz + 2) <= 1 && y >= 53 && y <= 54) return 7;
      }
      const d = isl(x, z, y, 8, 50);
      if (d >= 0) return d === 0 ? 1 : d <= 2 ? 2 : 3;
      if (y === 51) {
        if ((Math.abs(x) === 3 && z === 0) || (Math.abs(z) === 3 && x === 0)) return 22;
        if (Math.abs(x) === 2 && Math.abs(z) === 2) return 23;
        if (x === 0 && z === 0) return 24;
      }
      return 0;
    }
    case "buildbattle": {
      for (let t = 0; t < 4; t++) {
        const dx = x - BB_C[t][0], dz = z - BB_C[t][1];
        if (Math.abs(dx) <= 10 && Math.abs(dz) <= 10) {
          if (y === 50) return Math.abs(dx) === 10 || Math.abs(dz) === 10 ? TEAMS[t].wool : 1;
          if (y >= 47 && y < 50) return 2;
        }
      }
      return 0;
    }
    case "oneblock":
      if (y === 50 && z === 0 && x >= 0 && x <= OB_X * 7 && x % OB_X === 0) return 1;
      return 0;
    case "dropper": {
      const lane = Math.floor(x / 16), level = Math.floor(z / 16);
      if (lane < 0 || lane >= 8 || level < 0 || level >= DROP_LEVELS) return 0;
      const lx = x - lane * 16, lz = z - level * 16;
      if (lx > 12 || lz > 12 || y > 92 || y < 8) return 0;
      if (lx === 0 || lx === 12 || lz === 0 || lz === 12) return y >= 8 && y <= 90 ? 9 : 0;
      if (y === 8) return lx >= 5 && lx <= 7 && lz >= 5 && lz <= 7 ? 0 : 22;
      if (y === 90) {
        const [hx, hz] = dropHoleAt(level, -1);
        return Math.abs(lx - hx) <= 1 && Math.abs(lz - hz) <= 1 ? 0 : 12;
      }
      for (let floor = 0; floor < DROP_LEVELS; floor++) {
        if (y !== dropLayerY(floor)) continue;
        const [hx, hz] = dropHoleAt(level, floor);
        if (Math.abs(lx - hx) <= 1 && Math.abs(lz - hz) <= 1) return 0;
        return (level + floor) % 2 ? 13 + ((level + floor) % 4) : 24;
      }
      return 0;
    }
  }
}

const customMapWorlds = new Map<MapKey, World>();

function customMapBlock(key: MapKey, x: number, y: number, z: number, targetY: number, targetZ: number): number | null {
  const customMap = CUSTOM_MINIGAME_MAPS[key];
  if (!customMap) return null;
  let world = customMapWorlds.get(key);
  if (!world) {
    world = new World({ kind: customMap.type, seed: customMap.seed, trees: customMap.trees });
    world.loadEdits(customMap.edits);
    customMapWorlds.set(key, world);
  }
  return world.get(x + customMap.origin[0], y + customMap.origin[1] - targetY, z + customMap.origin[2] - targetZ);
}

export function oneblockNext(count: number, r: number): number {
  const pools = [
    [1, 1, 2, 2],
    [1, 2, 6, 6, 7, 5],
    [3, 3, 4, 5, 6, 8, 2],
    [3, 4, 8, 10, 9, 12, 5, 17],
    [3, 4, 10, 17, 22, 23, 24, 25, 13, 14],
  ];
  const tier = count < 10 ? 0 : count < 30 ? 1 : count < 60 ? 2 : count < 100 ? 3 : 4;
  const p = pools[tier];
  return p[Math.floor(r * p.length) % p.length];
}

export const THEMES = ["house", "castle", "pizza", "spaceship", "tree", "dragon", "car", "robot", "island", "pyramid"];

export const KITS: Partial<Record<Mode, [number, number][]>> = {
  skywars: [[4, 64], [8, 48], [9, 16], [12, 32]],
};
