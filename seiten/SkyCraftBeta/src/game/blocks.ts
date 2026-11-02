import * as THREE from "three";

type RGB = [number, number, number];
interface TS { c: RGB; n?: number; k?: string; a?: RGB }

const TEAM_RGB: Record<string, RGB> = {
  red: [200, 40, 40], blue: [40, 80, 200], green: [60, 160, 50], yellow: [240, 210, 50],
};

const TILES: Record<string, TS> = {
  grass_top: { c: [96, 160, 56], n: 0.12 },
  grass_side: { c: [134, 96, 67], n: 0.12, k: "grass_side", a: [96, 160, 56] },
  dirt: { c: [134, 96, 67], n: 0.14 },
  stone: { c: [125, 125, 125], n: 0.1 },
  cobble: { c: [115, 115, 115], n: 0.15, k: "cobble" },
  sand: { c: [219, 207, 142], n: 0.06 },
  log_top: { c: [170, 135, 80], n: 0.08, k: "rings", a: [120, 90, 50] },
  log_side: { c: [102, 81, 50], n: 0.1, k: "bark", a: [80, 62, 36] },
  leaves: { c: [56, 128, 40], n: 0.2, k: "leaves" },
  planks: { c: [170, 135, 80], n: 0.06, k: "planks", a: [130, 100, 58] },
  glass: { c: [200, 230, 240], k: "glass" },
  bricks: { c: [150, 84, 66], n: 0.08, k: "bricks", a: [190, 190, 185] },
  bedrock: { c: [60, 60, 60], n: 0.35 },
  wool_white: { c: [235, 235, 235], n: 0.04 },
  wool_red: { c: TEAM_RGB.red, n: 0.04 },
  wool_blue: { c: TEAM_RGB.blue, n: 0.04 },
  wool_green: { c: TEAM_RGB.green, n: 0.04 },
  wool_yellow: { c: TEAM_RGB.yellow, n: 0.04 },
  endstone: { c: [220, 222, 160], n: 0.08 },
  gold: { c: [250, 210, 60], k: "metal" },
  iron: { c: [215, 215, 215], k: "metal" },
  diamond: { c: [90, 220, 215], k: "metal" },
  obsidian: { c: [25, 15, 40], n: 0.2 },
  deepslate: { c: [76, 80, 84], n: 0.12, k: "cobble" },
  tnt_top: { c: [190, 45, 35], n: 0.04, k: "planks", a: [235, 220, 180] },
  tnt_side: { c: [190, 45, 35], n: 0.04, k: "bricks", a: [235, 220, 180] },
  apple: { c: [205, 45, 35], n: 0.06, k: "leaves" },
  cooked_meat: { c: [125, 65, 40], n: 0.08 },
  egg_chicken: { c: [245, 238, 216], n: 0.03 },
  egg_cow: { c: [105, 65, 40], n: 0.03 },
  raw_chicken: { c: [205, 125, 110], n: 0.03 },
  raw_beef: { c: [155, 65, 55], n: 0.03 },
  yellow_flower: { c: [247, 208, 48], k: "flower" },
  red_flower: { c: [210, 54, 45], k: "flower" },
  blue_flower: { c: [72, 110, 220], k: "flower" },
  white_flower: { c: [240, 240, 230], k: "flower" },
};
const EXTRA_COLORS: Record<string, RGB> = {
  orange: [235, 125, 45], magenta: [185, 70, 180], light_blue: [80, 155, 210], lime: [125, 190, 55],
  pink: [220, 125, 155], gray: [85, 90, 95], light_gray: [165, 165, 155], cyan: [50, 155, 155],
  purple: [115, 55, 165], brown: [110, 75, 45], black: [35, 35, 40],
};
Object.entries(EXTRA_COLORS).forEach(([name, color]) => {
  TILES["wool_" + name] = { c: color, n: 0.04 };
  TILES["concrete_" + name] = { c: color, n: 0.015 };
});
for (const [name, color] of Object.entries({ white: [235, 235, 235], red: TEAM_RGB.red, blue: TEAM_RGB.blue, green: TEAM_RGB.green, yellow: TEAM_RGB.yellow } as Record<string, RGB>)) {
  TILES["concrete_" + name] = { c: color, n: 0.015 };
}
TILES.wool_orange = { c: EXTRA_COLORS.orange, n: 0.04 };
TILES.wool_magenta = { c: EXTRA_COLORS.magenta, n: 0.04 };
for (const k of Object.keys(TEAM_RGB)) {
  TILES["bed_top_" + k] = { c: TEAM_RGB[k], n: 0.04, k: "bedtop" };
  TILES["bed_side_" + k] = { c: TEAM_RGB[k], n: 0.04, k: "bedside" };
}

export const TILE_NAMES = Object.keys(TILES);
export const TILE = 16;
const COLS = 8;
const ROWS = Math.ceil(Object.keys(TILES).length / COLS);
const tileIdx = (n: string) => TILE_NAMES.indexOf(n);

function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTile(ctx: CanvasRenderingContext2D, idx: number, s: TS) {
  const img = ctx.createImageData(TILE, TILE);
  const rnd = mulberry(idx * 977 + 13);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c = s.c, f = 1, al = 255;
      switch (s.k) {
        case "grass_side": if (y < 3 || (y < 5 && rnd() < 0.45)) c = s.a!; break;
        case "cobble": { const cell = ((x >> 2) * 5 + (y >> 2) * 3 + ((x >> 2) & (y >> 2))) % 3; f = cell === 0 ? 0.8 : cell === 1 ? 1 : 1.12; break; }
        case "rings": { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 6.5 || Math.floor(d) % 2 === 0) c = s.a!; break; }
        case "bark": if (x % 4 === 0 || (x % 4 === 1 && rnd() < 0.5)) c = s.a!; break;
        case "leaves": if (rnd() < 0.2) al = 0; else if (rnd() < 0.3) f = 0.78; break;
        case "planks": if (y % 4 === 3) c = s.a!; break;
        case "glass": {
          const edge = x === 0 || y === 0 || x === 15 || y === 15;
          if (edge) c = [210, 235, 245]; else if ((x + y) % 9 === 0 && x > 2 && x < 8) c = [255, 255, 255]; else al = 0;
          break;
        }
        case "flower": {
          al = 0;
          if (y >= 7 && x >= 7 && x <= 8) { c = [55, 145, 45]; al = 255; }
          else if (y >= 10 && y <= 13 && x >= 4 && x <= 6 && y - x >= 5) { c = [70, 165, 50]; al = 255; }
          else if (y >= 9 && y <= 12 && x >= 9 && x <= 11 && x - y >= -2) { c = [70, 165, 50]; al = 255; }
          else if (y >= 4 && y <= 5 && x >= 7 && x <= 8) { c = [248, 215, 72]; al = 255; }
          else if ((y >= 2 && y <= 5 && x >= 5 && x <= 10) || (y >= 3 && y <= 6 && x >= 4 && x <= 11)) {
            c = s.c; al = 255;
          }
          break;
        }
        case "bricks": { const row = y >> 2; if (y % 4 === 3 || (x + (row % 2 ? 4 : 0)) % 8 === 7) c = s.a!; break; }
        case "metal": f = x === 0 || y === 0 ? 1.18 : x === 15 || y === 15 ? 0.78 : (x > 3 && x < 12 && y > 3 && y < 12) ? 1.06 : 1; break;
        case "bedtop": if (y < 5 && x > 2 && x < 13) c = [240, 240, 240]; break;
        case "bedside": if (y >= 8) c = [170, 135, 80]; break;
      }
      const j = (rnd() - 0.5) * (s.n ?? 0) * 255;
      const o = (y * TILE + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, c[0] * f + j));
      img.data[o + 1] = Math.max(0, Math.min(255, c[1] * f + j));
      img.data[o + 2] = Math.max(0, Math.min(255, c[2] * f + j));
      img.data[o + 3] = al;
    }
  }
  ctx.putImageData(img, (idx % COLS) * TILE, Math.floor(idx / COLS) * TILE);
}

let atlasCanvas: HTMLCanvasElement | null = null;
export function getAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const cv = document.createElement("canvas");
  cv.width = COLS * TILE; cv.height = ROWS * TILE;
  const ctx = cv.getContext("2d")!;
  TILE_NAMES.forEach((n, i) => drawTile(ctx, i, TILES[n]));
  atlasCanvas = cv;
  redrawAtlas();
  return cv;
}
let atlasTex: THREE.CanvasTexture | null = null;
export function getAtlasTexture(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const texture = new THREE.CanvasTexture(getAtlasCanvas());
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  atlasTex = texture;
  return texture;
}

let activeLook = "default";
let activeTextures: Record<string, string> = {};
let atlasRevision = 0;

export function setAtlasResourcePack(look: string, textures: Record<string, string>) {
  activeLook = look;
  activeTextures = textures;
  if (atlasCanvas) redrawAtlas();
  iconCache.clear();
}

function redrawAtlas() {
  if (!atlasCanvas) return;
  const revision = ++atlasRevision;
  const ctx = atlasCanvas.getContext("2d")!;
  const base = document.createElement("canvas");
  base.width = atlasCanvas.width; base.height = atlasCanvas.height;
  const baseCtx = base.getContext("2d")!;
  TILE_NAMES.forEach((name, i) => drawTile(baseCtx, i, TILES[name]));
  ctx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
  ctx.imageSmoothingEnabled = false;
  if (activeLook === "default") ctx.drawImage(base, 0, 0);
  else {
    ctx.filter = activeLook === "classic" ? "saturate(0.72) contrast(1.08)" :
      activeLook === "vibrant" ? "saturate(1.55) contrast(1.08)" : "brightness(0.78) hue-rotate(205deg) saturate(1.2)";
    ctx.drawImage(base, 0, 0);
    ctx.filter = "none";
  }
  for (const [name, url] of Object.entries(activeTextures)) {
    const tile = TILE_NAMES.indexOf(name);
    if (tile < 0) continue;
    const image = new Image();
    image.onload = () => {
      if (revision !== atlasRevision) return;
      ctx.clearRect((tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE);
      ctx.drawImage(image, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE);
      iconCache.clear();
      if (atlasTex) atlasTex.needsUpdate = true;
    };
    image.src = url;
  }
  if (atlasTex) atlasTex.needsUpdate = true;
}

export function tileUV(tile: number): [number, number, number, number] {
  const e = 0.0008;
  const c = tile % COLS, r = Math.floor(tile / COLS);
  return [c / COLS + e, 1 - (r + 1) / ROWS + e, (c + 1) / COLS - e, 1 - r / ROWS - e];
}

export interface BlockDef {
  id: number; name: string; top: number; side: number; bottom: number;
  hard: number; transp?: boolean; drop?: number; height?: number; item?: boolean; food?: number; toolTier?: number; armorTier?: number; plant?: boolean;
}
export const BLOCKS: (BlockDef | undefined)[] = [];
function def(id: number, name: string, top: string, side: string, bottom: string, hard: number, extra: Partial<BlockDef> = {}) {
  BLOCKS[id] = { id, name, top: tileIdx(top), side: tileIdx(side), bottom: tileIdx(bottom), hard, ...extra };
}
const all = (id: number, name: string, tile: string, hard: number, extra: Partial<BlockDef> = {}) => def(id, name, tile, tile, tile, hard, extra);
def(1, "grass", "grass_top", "grass_side", "dirt", 0.5, { drop: 2 });
all(2, "dirt", "dirt", 0.4);
all(3, "stone", "stone", 1.6, { drop: 4 });
all(4, "cobblestone", "cobble", 1.6);
all(5, "sand", "sand", 0.4);
def(6, "log", "log_top", "log_side", "log_top", 1.0);
all(7, "leaves", "leaves", 0.15, { transp: true, drop: 0 });
all(8, "planks", "planks", 0.8);
all(9, "glass", "glass", 0.3, { transp: true, drop: 0 });
all(10, "bricks", "bricks", 1.8);
all(11, "bedrock", "bedrock", -1);
all(12, "white_wool", "wool_white", 0.6);
all(13, "red_wool", "wool_red", 0.6);
all(14, "blue_wool", "wool_blue", 0.6);
all(15, "green_wool", "wool_green", 0.6);
all(16, "yellow_wool", "wool_yellow", 0.6);
all(17, "end_stone", "endstone", 2.0);
["red", "blue", "green", "yellow"].forEach((c, i) => def(18 + i, c + "_bed", "bed_top_" + c, "bed_side_" + c, "planks", 0.4));
all(22, "gold_block", "gold", 2.5);
all(23, "iron_block", "iron", 2.5);
all(24, "diamond_block", "diamond", 2.5);
all(25, "obsidian", "obsidian", 4);
const EXTRA_WOOL = ["orange", "magenta", "light_blue", "lime", "pink", "gray", "light_gray", "cyan", "purple", "brown", "black"];
EXTRA_WOOL.forEach((name, i) => all(26 + i, name + "_wool", "wool_" + name, 0.6));
const CONCRETE = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
CONCRETE.forEach((name, i) => all(37 + i, name + "_concrete", "concrete_" + name, 1.8));
all(53, "stone_slab", "stone", 1.6, { height: 0.5 });
all(54, "deepslate", "deepslate", 3);
def(55, "tnt", "tnt_top", "tnt_side", "tnt_top", 0.1);
all(56, "apple", "apple", -1, { item: true, food: 4, drop: 0 });
all(57, "cooked_meat", "cooked_meat", -1, { item: true, food: 8, drop: 0 });
all(58, "stick", "planks", -1, { item: true, drop: 0 });
all(59, "wooden_pickaxe", "log_side", -1, { item: true, drop: 0, toolTier: 1 });
all(60, "stone_pickaxe", "cobble", -1, { item: true, drop: 0, toolTier: 2 });
all(61, "iron_pickaxe", "iron", -1, { item: true, drop: 0, toolTier: 3 });
all(62, "diamond_pickaxe", "diamond", -1, { item: true, drop: 0, toolTier: 4 });
all(63, "stone_fragment", "stone", -1, { item: true, drop: 0 });
all(64, "iron_armor", "iron", -1, { item: true, drop: 0, armorTier: 2 });
all(65, "diamond_armor", "diamond", -1, { item: true, drop: 0, armorTier: 3 });
all(66, "chicken_spawn_egg", "egg_chicken", -1, { item: true, drop: 0 });
all(67, "cow_spawn_egg", "egg_cow", -1, { item: true, drop: 0 });
all(68, "raw_chicken", "raw_chicken", -1, { item: true, food: 3, drop: 0 });
all(69, "raw_beef", "raw_beef", -1, { item: true, food: 3, drop: 0 });
for (const id of [78, 79, 80, 81]) {
const tile = ["yellow_flower", "red_flower", "blue_flower", "white_flower"][id - 78];
all(id, `flower_${id - 77}`, tile, 0, { transp: true, drop: 0, height: 0.7, plant: true });
}
all(84, "rotten_flesh", "raw_beef", -1, { item: true, food: 2, drop: 0 });

export const MAX_BLOCK = 84;
export const ALL_IDS: number[] = BLOCKS.map((b, i) => (b ? i : 0)).filter(Boolean);

export const ALIASES: Record<string, string> = {
  grass_block: "grass", oak_log: "log", oak_planks: "planks", oak_leaves: "leaves", cobble: "cobblestone",
  wool: "white_wool", endstone: "end_stone", bed: "red_bed", gold: "gold_block", iron: "iron_block", diamond: "diamond_block",
  brick: "bricks", wood: "log", wood_planks: "planks",
};
export function parseBlock(s: string): number | null {
  s = s.toLowerCase().replace(/^minecraft:/, "").replace(/^skycraft:/, "");
  if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return BLOCKS[n] ? n : null; }
  s = ALIASES[s] ?? s;
  const b = BLOCKS.find((x) => x && x.name === s);
  return b ? b.id : null;
}

const iconCache = new Map<number, string>();
export function blockIcon(id: number): string {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const b = BLOCKS[id];
  if (!b) return "";
  const atlas = getAtlasCanvas();
  const cv = document.createElement("canvas");
  cv.width = 40; cv.height = 40;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (id === 66 || id === 67) {
    ctx.fillStyle = "#252525";
    ctx.beginPath(); ctx.ellipse(20, 20, 11, 15, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = id === 66 ? "#efe9dc" : "#985d3b";
    ctx.beginPath(); ctx.ellipse(20, 19, 9, 13, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(15, 11, 3, 5);
    const url = cv.toDataURL();
    iconCache.set(id, url);
    return url;
  }
  if (b.plant) {
    ctx.drawImage(atlas, (b.top % COLS) * TILE, Math.floor(b.top / COLS) * TILE, TILE, TILE, 4, 4, 32, 32);
    const url = cv.toDataURL();
    iconCache.set(id, url);
    return url;
  }
  const draw = (tile: number, m: number[], shade: number, poly: number[][]) => {
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(atlas, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
    ctx.restore();
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
    }
  };
  draw(b.top, [1, -0.5, 1, 0.5, 4, 12], 0, []);
  draw(b.side, [1, 0.5, 0, 1, 4, 12], 0.22, [[4, 12], [20, 20], [20, 36], [4, 28]]);
  draw(b.side, [1, -0.5, 0, 1, 20, 20], 0.4, [[20, 20], [36, 12], [36, 28], [20, 36]]);
  const url = cv.toDataURL();
  iconCache.set(id, url);
  return url;
}
