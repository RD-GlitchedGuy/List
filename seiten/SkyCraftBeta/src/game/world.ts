import { fbm2, fbm3, hash2, hash3, noise2 } from "./noise";

export const CS = 16;
export const H = 96;
export type Kind = "normal" | "flat" | "sky" | "hub" | "server";
export interface WorldOpts {
  kind: Kind; seed: number; trees?: boolean;
  structures?: boolean;
  gen?: (x: number, y: number, z: number) => number;
}
export const ckey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const keyCx = (k: number) => Math.floor(k / 65536) - 32768;
export const keyCz = (k: number) => (k % 65536) - 32768;
const cidx = (lx: number, y: number, lz: number) => (y * CS + lz) * CS + lx;

export class World {
  chunks = new Map<number, Uint8Array>();
  edits = new Map<number, Map<number, number>>();
  dirty = new Set<number>();
  constructor(public opts: WorldOpts) {}

  get seed() { return this.opts.seed; }

  height(x: number, z: number) {
    return Math.floor(34 + fbm2(x / 64, z / 64, this.seed) * 26 + noise2(x / 10, z / 10, this.seed + 7) * 3);
  }

  private biome(x: number, z: number): "forest" | "plains" | "desert" {
    const climate = fbm2(x / 150, z / 150, this.seed + 1201);
    return climate < 0.3 ? "desert" : climate < 0.56 ? "plains" : "forest";
  }

  private dens(x: number, y: number, z: number) {
    const n = fbm3(x / 30, y / 14, z / 30, this.seed);
    const band = 1 - Math.abs(y - 52) / 22;
    return n - 0.7 + band * 0.1;
  }

  private startIsland(x: number, y: number, z: number) {
    const d = 46 - y;
    if (d < 0 || d > 12) return 0;
    const r = Math.hypot(x - 8, z - 8);
    if (r < 12 - d * 1.2) return d === 0 ? 1 : d <= 3 ? 2 : 3;
    return 0;
  }

  getChunk(cx: number, cz: number): Uint8Array {
    const k = ckey(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    c = new Uint8Array(CS * CS * H);
    this.generate(c, cx, cz);
    const e = this.edits.get(k);
    if (e) e.forEach((b, i) => (c![i] = b));
    this.chunks.set(k, c);
    return c;
  }

  private generate(c: Uint8Array, cx: number, cz: number) {
    const { kind } = this.opts;
    const x0 = cx * CS, z0 = cz * CS;
    if (kind === "server") {
      const g = this.opts.gen!;
      for (let y = 0; y < H; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) c[cidx(lx, y, lz)] = g(x0 + lx, y, z0 + lz);
      return;
    }
    if (kind === "flat" || kind === "hub") {
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        c[cidx(lx, 0, lz)] = 11;
        for (let y = 1; y <= 34; y++) c[cidx(lx, y, lz)] = 3;
        for (let y = 35; y <= 37; y++) c[cidx(lx, y, lz)] = 2;
        c[cidx(lx, 38, lz)] = 1;
      }
      if (this.opts.trees !== false) this.trees(c, cx, cz, () => 38);
      if (this.opts.structures) this.structures(c, cx, cz, () => 38);
      return;
    }
    if (kind === "sky") {
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const x = x0 + lx, z = z0 + lz;
        for (let y = 24; y < 86; y++) {
          let b = this.startIsland(x, y, z);
          if (!b && this.dens(x, y, z) > 0) {
            let d = 0;
            while (d < 4 && this.dens(x, y + d + 1, z) > 0) d++;
            b = d === 0 ? 1 : d <= 2 ? 2 : 3;
          }
          c[cidx(lx, y, lz)] = b;
        }
      }
      if (this.opts.structures) this.structures(c, cx, cz, (x, z) => {
        for (let y = 85; y >= 24; y--) if (this.startIsland(x, y, z) || this.dens(x, y, z) > 0) return y;
        return -1;
      });
      return;
    }
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const h = this.height(x, z), biome = this.biome(x, z);
      for (let y = 0; y <= h && y < H; y++) {
        if (y > 3 && y < h - 4 &&
          (fbm3((x0 + lx) / 18, y / 9, (z0 + lz) / 18, this.seed + 301) > 0.64 ||
            fbm3((x0 + lx) / 34, y / 5, (z0 + lz) / 34, this.seed + 419) > 0.73)) continue;
        let b = 3;
        if (y === 0) b = 11;
        else if (y === h) b = biome === "desert" || h <= 38 ? 5 : h > 62 ? 3 : 1;
        else if (y >= h - 3) b = biome === "desert" || h <= 38 ? 5 : h > 62 ? 3 : 2;
        if (b === 3 && y > 5 && y < h - 3) {
          const ore = hash3(x0 + lx, y, z0 + lz, this.seed + 809);
          if (y < 32 && ore < 0.00005) b = 24;
          else if (y < 40 && ore < 0.00025) b = 22;
          else if (ore < 0.0012) b = 23;
        }
        c[cidx(lx, y, lz)] = b;
      }
      if (biome !== "desert" && h < 61 && hash2(x, z, this.seed + 1202) < 0.003) {
        c[cidx(lx, h + 1, lz)] = 78 + Math.floor(hash2(x, z, this.seed + 1203) * 4);
      }
    }
    if (this.opts.trees !== false) this.trees(c, cx, cz, (x, z) => this.height(x, z));
    if (this.opts.structures) this.structures(c, cx, cz, (x, z) => this.height(x, z));
  }

  private structures(c: Uint8Array, cx: number, cz: number, hf: (x: number, z: number) => number) {
    const x0 = cx * CS, z0 = cz * CS;
    const put = (x: number, y: number, z: number, b: number) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= H) return;
      c[cidx(lx, y, lz)] = b;
    };
    for (let gx = Math.floor((x0 - 16) / 64); gx <= Math.floor((x0 + CS + 16) / 64); gx++) {
      for (let gz = Math.floor((z0 - 16) / 64); gz <= Math.floor((z0 + CS + 16) / 64); gz++) {
        const chance = hash2(gx, gz, this.seed + 701);
        if (chance > 0.02) continue;
        const x = gx * 64 + 16 + Math.floor(hash2(gx, gz, this.seed + 702) * 33);
        const z = gz * 64 + 16 + Math.floor(hash2(gx, gz, this.seed + 703) * 33);
        const rawSurface = hf(x, z);
        if (rawSurface < 0) continue;
        const surface = Math.max(rawSurface, 36), y = surface + 1;
        if (y < 12 || y > 70) continue;
        const size = chance < 0.007 ? 3 : 2;
        let level = true;
        for (let dx = -size; dx <= size; dx++) for (let dz = -size; dz <= size; dz++) {
          const ground = hf(x + dx, z + dz);
          if (ground < 0 || ground > rawSurface || rawSurface - ground > 3) level = false;
        }
        if (!level) continue;
        for (let dx = -size; dx <= size; dx++) for (let dz = -size; dz <= size; dz++) {
          const ground = hf(x + dx, z + dz);
          for (let fy = ground + 1; fy < y; fy++) put(x + dx, fy, z + dz, 4);
          put(x + dx, y, z + dz, Math.abs(dx) === size || Math.abs(dz) === size ? 4 : 8);
        }
        const structure = Math.floor(hash2(gx, gz, this.seed + 704) * 5);
        const wallHeight = structure === 0 ? 2 : structure === 1 ? 3 : structure === 2 ? 4 : 5;
        const wallBlock = structure === 1 ? 8 : 10;
        for (let dy = 1; dy <= wallHeight; dy++) {
          for (const dx of [-size, size]) for (let dz = -size; dz <= size; dz++) {
            if (dy < wallHeight && dx === -size && dz === 0) continue;
            put(x + dx, y + dy, z + dz, dy === wallHeight ? 8 : wallBlock);
          }
          for (const dz of [-size, size]) for (let dx = -size + 1; dx < size; dx++) {
            if (dy === wallHeight) put(x + dx, y + dy, z + dz, 8);
            else if (!(dz === -size && dx === 0 && dy < 3)) put(x + dx, y + dy, z + dz, wallBlock);
          }
        }
        if (structure === 0 || structure === 3) for (const dx of [-size, size]) for (const dz of [-size, size]) {
          for (let dy = 1; dy <= wallHeight + 1; dy++) put(x + dx, y + dy, z + dz, 6);
        }
        if (structure === 4) {
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            put(x + dx, y + 1, z + dz, (dx + dz) % 2 ? 78 : 79);
          }
        }
      }
    }
  }

  private trees(c: Uint8Array, cx: number, cz: number, hf: (x: number, z: number) => number) {
    const x0 = cx * CS, z0 = cz * CS;
    for (let tx = x0 - 2; tx < x0 + CS + 2; tx++) for (let tz = z0 - 2; tz < z0 + CS + 2; tz++) {
      const biome = this.biome(tx, tz);
      if (biome === "desert" || hash2(tx, tz, this.seed + 99) >= (biome === "plains" ? 0.0025 : 0.012)) continue;
      const h = hf(tx, tz);
      if (h <= 38 || h > 62) continue;
      const put = (x: number, y: number, z: number, b: number, force: boolean) => {
        const lx = x - x0, lz = z - z0;
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y >= H) return;
        const i = cidx(lx, y, lz);
        if (force || c[i] === 0) c[i] = b;
      };
      for (let y = h + 1; y <= h + 5; y++) put(tx, y, tz, 6, true);
      for (let dy = 3; dy <= 6; dy++) {
        const r = dy <= 4 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          put(tx + dx, h + dy, tz + dz, 7, false);
        }
      }
    }
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= H) return 0;
    const cx = x >> 4, cz = z >> 4;
    return this.getChunk(cx, cz)[cidx(x & 15, y, z & 15)];
  }

  set(x: number, y: number, z: number, b: number) {
    if (y < 0 || y >= H) return;
    if (b >= 70 && b <= 77 || b === 82 || b === 83) b = 0;
    const cx = x >> 4, cz = z >> 4, k = ckey(cx, cz), lx = x & 15, lz = z & 15, i = cidx(lx, y, lz);
    let e = this.edits.get(k);
    if (!e) { e = new Map(); this.edits.set(k, e); }
    e.set(i, b);
    const c = this.chunks.get(k);
    if (!c) return;
    c[i] = b;
    this.dirty.add(k);
    if (lx === 0) this.dirty.add(ckey(cx - 1, cz));
    if (lx === 15) this.dirty.add(ckey(cx + 1, cz));
    if (lz === 0) this.dirty.add(ckey(cx, cz - 1));
    if (lz === 15) this.dirty.add(ckey(cx, cz + 1));
  }

  topY(x: number, z: number): number {
    for (let y = H - 1; y >= 0; y--) if (this.get(x, y, z) > 0) return y;
    return -1;
  }

  editList(): number[] {
    const out: number[] = [];
    this.edits.forEach((m, k) => {
      const cx = keyCx(k), cz = keyCz(k);
      m.forEach((b, i) => out.push(cx * CS + (i % 16), Math.floor(i / 256), cz * CS + (Math.floor(i / 16) % 16), b));
    });
    return out;
  }

  loadEdits(l: number[]) {
    for (let i = 0; i + 3 < l.length; i += 4) this.set(l[i], l[i + 1], l[i + 2], l[i + 3]);
  }

  clearEdits() {
    this.edits.clear();
    this.chunks.clear();
    this.dirty.clear();
  }
}
