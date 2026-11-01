export type Mode = "bedwars" | "skywars" | "oneblock" | "buildbattle" | "dropper";
export type Variant = "solo" | "duo";
export const MODES: Mode[] = ["bedwars", "skywars", "oneblock", "buildbattle", "dropper"];

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

export const teamCount = (m: Mode, v: Variant) => ((m === "oneblock" || m === "dropper") && v === "solo" ? 8 : 4);
export const teamSize = (v: Variant) => (v === "duo" ? 2 : 1);
export const capacity = (m: Mode, v: Variant) => teamCount(m, v) * teamSize(v);
export const minPlayers = (m: Mode, v: Variant) => (m === "oneblock" ? 1 : v === "duo" ? 4 : 2);
export const isPvp = (m: Mode) => m === "bedwars" || m === "skywars";

export function spawnFor(mode: Mode, team: number): [number, number, number] {
  switch (mode) {
    case "bedwars": { const c = BW_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 3.5]; }
    case "skywars": { const c = SW_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 0.5]; }
    case "buildbattle": { const c = BB_C[team % 4]; return [c[0] + 0.5, 51, c[1] + 0.5]; }
    case "oneblock": return [team * OB_X + 0.5, 51.2, 0.5];
    case "dropper": return [3.5, DROP_TOP, 3.5];
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

const holes: number[] = [];
function holeX(k: number): [number, number] {
  if (!holes.length) {
    let hx = 0, hz = 0;
    for (let i = 0; i < 12; i++) {
      const r1 = Math.sin(i * 12.9898 + 1.3) * 43758.5453, r2 = Math.sin(i * 78.233 + 5.1) * 12345.678;
      hx = Math.max(-3, Math.min(3, hx + Math.floor((r1 - Math.floor(r1)) * 7) - 3));
      hz = Math.max(-3, Math.min(3, hz + Math.floor((r2 - Math.floor(r2)) * 7) - 3));
      holes.push(hx, hz);
    }
  }
  return [holes[k * 2], holes[k * 2 + 1]];
}
export const DROP_LEVELS = 12;
export const dropLayerY = (k: number) => 84 - k * 6;

export function lobbyBlock(x: number, y: number, z: number): number {
  const dx = Math.abs(x), dz = Math.abs(z - 400);
  if (dx > 12 || dz > 12) return 0;
  if (y === 60) return (x + z) & 1 ? 12 : 3;
  if (y >= 61 && y <= 63 && (dx === 12 || dz === 12)) return 9;
  if (y === 61 && dx <= 1 && dz <= 1 && !(dx === 0 && dz === 0)) return 22;
  return 0;
}

export function serverBlock(mode: Mode, x: number, y: number, z: number): number {
  if (z >= 386 && z <= 414 && x >= -14 && x <= 14) return lobbyBlock(x, y, z);
  switch (mode) {
    case "bedwars": {
      const d = isl(x, z, y, 9, 50);
      if (d >= 0) return 17;
      for (let t = 0; t < 4; t++) {
        const dx = x - BW_C[t][0], dz = z - BW_C[t][1];
        if (Math.abs(dx) <= 4 && Math.abs(dz) <= 4 && y >= 47 && y <= 50) return y === 50 ? TEAMS[t].wool : y === 49 ? 4 : 3;
        if (dx === 0 && dz === 0 && y === 51) return TEAMS[t].bed;
        if (dx === 3 && dz === -3 && y === 51) return 23;
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
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax > 6 || az > 6 || y > 92 || y < 8) return 0;
      if (ax === 6 || az === 6) return 9;
      if (y === 8) return 22;
      if (y === 90) return ax <= 1 && az <= 1 ? 0 : 12;
      for (let k = 0; k < DROP_LEVELS; k++) {
        if (y === dropLayerY(k)) {
          const [hx, hz] = holeX(k);
          return Math.abs(x - hx) <= 1 && Math.abs(z - hz) <= 1 ? 0 : 13 + (k % 4);
        }
      }
      return 0;
    }
  }
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
