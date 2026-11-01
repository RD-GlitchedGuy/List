import { fbm2, fbm3, hash2, noise2 } from "./noise";

export const CS = 16;
export const H = 96;
export type Kind = "normal" | "flat" | "sky" | "server";
export interface WorldOpts {
  kind: Kind; seed: number; trees?: boolean;
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
    if (kind === "flat") {
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        c[cidx(lx, 0, lz)] = 11;
        for (let y = 1; y <= 34; y++) c[cidx(lx, y, lz)] = 3;
        for (let y = 35; y <= 37; y++) c[cidx(lx, y, lz)] = 2;
        c[cidx(lx, 38, lz)] = 1;
      }
      if (this.opts.trees !== false) this.trees(c, cx, cz, () => 38);
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
      return;
    }
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const h = this.height(x0 + lx, z0 + lz);
      for (let y = 0; y <= h && y < H; y++) {
        let b = 3;
        if (y === 0) b = 11;
        else if (y === h) b = h <= 38 ? 5 : h > 62 ? 3 : 1;
        else if (y >= h - 3) b = h <= 38 ? 5 : h > 62 ? 3 : 2;
        c[cidx(lx, y, lz)] = b;
      }
    }
    if (this.opts.trees !== false) this.trees(c, cx, cz, (x, z) => this.height(x, z));
  }

  private trees(c: Uint8Array, cx: number, cz: number, hf: (x: number, z: number) => number) {
    const x0 = cx * CS, z0 = cz * CS;
    for (let tx = x0 - 2; tx < x0 + CS + 2; tx++) for (let tz = z0 - 2; tz < z0 + CS + 2; tz++) {
      if (hash2(tx, tz, this.seed + 99) >= 0.012) continue;
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
