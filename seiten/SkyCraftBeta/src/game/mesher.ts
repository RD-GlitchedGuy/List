import * as THREE from "three";
import { BLOCKS, tileUV } from "./blocks";
import { CS, H, World } from "./world";

interface Face { n: number[]; o: number[]; u: number[]; v: number[]; sh: number }
const FACES: Face[] = [
  { n: [1, 0, 0], o: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], sh: 0.8 },
  { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], sh: 0.8 },
  { n: [0, 1, 0], o: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], sh: 1 },
  { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], sh: 0.5 },
  { n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], sh: 0.65 },
  { n: [0, 0, -1], o: [0, 0, 0], u: [0, 1, 0], v: [1, 0, 0], sh: 0.65 },
];
const st = (f: number, p: number[]): [number, number] => {
  switch (f) {
    case 0: return [1 - p[2], p[1]];
    case 1: return [p[2], p[1]];
    case 2: case 3: return [p[0], p[2]];
    case 4: return [p[0], p[1]];
    default: return [1 - p[0], p[1]];
  }
};
const AO = [0.5, 0.68, 0.84, 1];

export function buildChunk(world: World, cx: number, cz: number): THREE.BufferGeometry | null {
  const data = world.getChunk(cx, cz);
  const x0 = cx * CS, z0 = cz * CS;
  const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
  const g = (x: number, y: number, z: number) => {
    if (y < 0 || y >= H) return 0;
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) return data[(y * CS + lz) * CS + lx];
    return world.get(x, y, z);
  };
  const opq = (x: number, y: number, z: number) => {
    const id = g(x, y, z);
    return id > 0 && !BLOCKS[id]?.transp ? 1 : 0;
  };
  let vc = 0;
  for (let y = 0; y < H; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const id = data[(y * CS + lz) * CS + lx];
    if (!id) continue;
    const b = BLOCKS[id];
    if (!b) continue;
    const wx = x0 + lx, wz = z0 + lz;
    if (b.plant) {
      appendPlant(pos, uvs, col, idx, wx, y, wz, b.top);
      vc += 8;
      continue;
    }
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nid = g(wx + F.n[0], y + F.n[1], wz + F.n[2]);
      const neighbor = BLOCKS[nid], neighborHeight = neighbor?.height ?? 1, blockHeight = b.height ?? 1;
      const sharesCoveredFace = f === 2 ? blockHeight >= 1 : f === 3 ? neighborHeight >= 1 : blockHeight <= neighborHeight;
      if (nid !== 0 && !neighbor?.transp && sharesCoveredFace) continue;
      const [u0, v0, u1, v1] = tileUV(f === 2 ? b.top : f === 3 ? b.bottom : b.side);
      const ao: number[] = [];
      for (let q = 0; q < 4; q++) {
        const iu = q === 1 || q === 2 ? 1 : 0, iv = q >= 2 ? 1 : 0;
        const p = [F.o[0] + iu * F.u[0] + iv * F.v[0], F.o[1] + iu * F.u[1] + iv * F.v[1], F.o[2] + iu * F.u[2] + iv * F.v[2]];
        pos.push(wx + p[0], y + p[1] * (b.height ?? 1), wz + p[2]);
        const su = iu ? 1 : -1, sv = iv ? 1 : -1;
        const bx = wx + F.n[0], by = y + F.n[1], bz = wz + F.n[2];
        const s1 = opq(bx + su * F.u[0], by + su * F.u[1], bz + su * F.u[2]);
        const s2 = opq(bx + sv * F.v[0], by + sv * F.v[1], bz + sv * F.v[2]);
        const c = opq(bx + su * F.u[0] + sv * F.v[0], by + su * F.u[1] + sv * F.v[1], bz + su * F.u[2] + sv * F.v[2]);
        const a = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
        ao.push(a);
        const sh = F.sh * AO[a];
        col.push(sh, sh, sh);
        const [s, t] = st(f, p);
        uvs.push(u0 + s * (u1 - u0), v0 + t * (v1 - v0));
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
      else idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
    }
  }
  if (!vc) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export function blockGeom(id: number): THREE.BufferGeometry {
  const b = BLOCKS[id]!;
  if (b.plant) {
    const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
    appendPlant(pos, uvs, col, idx, -0.5, -0.5, -0.5, b.top);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }
  const pos: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
  let vc = 0;
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const [u0, v0, u1, v1] = tileUV(f === 2 ? b.top : f === 3 ? b.bottom : b.side);
    for (let q = 0; q < 4; q++) {
      const iu = q === 1 || q === 2 ? 1 : 0, iv = q >= 2 ? 1 : 0;
      const p = [F.o[0] + iu * F.u[0] + iv * F.v[0], F.o[1] + iu * F.u[1] + iv * F.v[1], F.o[2] + iu * F.u[2] + iv * F.v[2]];
      pos.push(p[0] - 0.5, p[1] * (b.height ?? 1) - (b.height ?? 1) / 2, p[2] - 0.5);
      col.push(F.sh, F.sh, F.sh);
      const [s, t] = st(f, p);
      uvs.push(u0 + s * (u1 - u0), v0 + t * (v1 - v0));
    }
    idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
    vc += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

function appendPlant(pos: number[], uvs: number[], colors: number[], indices: number[], x: number, y: number, z: number, tile: number) {
  const [u0, v0, u1, v1] = tileUV(tile);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const dx = Math.cos(angle) * 0.44, dz = Math.sin(angle) * 0.44;
    const start = pos.length / 3;
    pos.push(x + 0.5 - dx, y, z + 0.5 - dz, x + 0.5 + dx, y, z + 0.5 + dz,
      x + 0.5 + dx, y + 0.95, z + 0.5 + dz, x + 0.5 - dx, y + 0.95, z + 0.5 - dz);
    uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
    colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3,
      start + 2, start + 1, start, start + 3, start + 2, start);
  }
}
