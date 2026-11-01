import * as THREE from "three";
import { CS, H, World, ckey, keyCx, keyCz } from "./world";
import { BLOCKS, getAtlasTexture } from "./blocks";
import { blockGeom, buildChunk } from "./mesher";
import type { GM, SaveData, Settings, Slot } from "./storage";
import { Net } from "./net";
import { GState, canEdit } from "./server";
import { DROP_TOP, LOBBY, Mode, TEAMS, THEMES, Variant, isPvp, serverBlock, teamColor } from "./maps";
import { t as tr } from "../i18n";
import { runCommand } from "./commands";

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  settings: Settings;
  single?: { slot: number; data: SaveData };
  server?: { net: Net; mode: Mode; variant: Variant };
  onUpdate: () => void;
  onLock: (locked: boolean) => void;
  onLeave: (reason?: string) => void;
}

interface Remote {
  id: string; group: THREE.Group; target: THREE.Vector3; yaw: number; body: THREE.Mesh; name: string; team: number;
}
export interface ChatLine { text: string; color: string; t: number }

const R = 0.3, HGT = 1.8, EYE = 1.62;

export class Engine {
  cfg: EngineConfig;
  world: World;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  mat: THREE.MeshBasicMaterial;
  meshes = new Map<number, THREE.Mesh | null>();
  queue: number[] = [];
  lastPc = [1e9, 1e9];

  pos = new THREE.Vector3(8.5, 60, 8.5);
  vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  onGround = false; flying = false; fallY = 0;
  gm: GM = "survival";
  hp = 20; hurtT = 0;
  inv: (Slot | null)[] = new Array(36).fill(null);
  sel = 0;
  chat: ChatLine[] = [];
  history: string[] = [];
  op = true; spec = false; dead = false; deadWait = 0; respawnT = 0;
  keys = new Set<string>();
  mouse = { l: false, r: false };
  locked = false; frozen = false;
  time = 1000; daylight = true; keepInv = true; weather: "clear" | "rain" = "clear"; cheats = true;
  spawn: [number, number, number] = [8.5, 60, 8.5];
  seedText = "";

  // Server
  net: Net | null = null;
  mode: Mode | null = null; variant: Variant = "solo";
  st: GState | null = null;
  myId = ""; team = -1;
  placed = new Set<string>();
  remotes = new Map<string, Remote>();
  res = { iron: 0, gold: 0 };
  sword = false; armor = false;
  titleText: { text: string; until: number } | null = null;
  votedPlot = -1; myVote = 0;
  hitCd = 0;

  mining: { x: number; y: number; z: number; p: number; cd: number } | null = null;
  placeCd = 0; swing = 0; lastSpace = 0; failCd = 0;
  private raf = 0; private last = 0; private uiAcc = 0; private posAcc = 0; private resAcc = [0, 0];
  private hand: THREE.Mesh; private handId = -1;
  private selBox: THREE.LineSegments; private crack: THREE.Mesh;
  private sun: THREE.Mesh; private moon: THREE.Mesh; private stars: THREE.Points;
  private rain: THREE.LineSegments; private rainOff: Float32Array;
  private listeners: [EventTarget, string, any][] = [];
  disposed = false;
  private saveFn: (() => void) | null = null;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    const { canvas, settings } = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 600);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.mat = new THREE.MeshBasicMaterial({ map: getAtlasTexture(), vertexColors: true, alphaTest: 0.5 });
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 80);

    if (cfg.server) {
      const { mode, net, variant } = cfg.server;
      this.mode = mode; this.variant = variant; this.net = net; this.op = false; this.cheats = false;
      this.world = new World({ kind: "server", seed: 0, gen: (x, y, z) => serverBlock(mode, x, y, z) });
      this.time = 6000; this.daylight = false;
      this.spawn = [LOBBY.x, LOBBY.y, LOBBY.z];
      this.pos.set(LOBBY.x, LOBBY.y, LOBBY.z);
    } else {
      const d = cfg.single!.data;
      this.world = new World({ kind: d.type, seed: d.seed, trees: d.trees });
      this.world.loadEdits(d.edits);
      this.gm = d.gm; this.cheats = d.cheats; this.daylight = d.daylight; this.keepInv = d.keepInv;
      this.weather = d.weather; this.time = d.time; this.hp = d.hp || 20; this.seedText = d.seedText;
      this.inv = d.inv.length === 36 ? d.inv.map((s) => (s ? { ...s } : null)) : this.inv;
      this.yaw = d.yaw; this.pitch = d.pitch;
      this.spawn = d.spawn || this.findSpawn();
      if (d.pos) this.pos.set(...d.pos); else this.pos.set(...this.spawn);
      this.flying = false;
      if (this.gm === "creative") this.fillCreative();
    }

    this.hand = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.hand.frustumCulled = false;
    this.camera.add(this.hand);
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.selBox.visible = false; this.scene.add(this.selBox);
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }));
    this.crack.visible = false; this.scene.add(this.crack);

    const sg = new THREE.PlaneGeometry(70, 70);
    this.sun = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xfff2a8, fog: false }));
    this.moon = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false }));
    this.scene.add(this.sun, this.moon);
    const sp: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.acos(Math.random() * 0.95 + 0.05);
      sp.push(Math.sin(e) * Math.cos(a) * 400, Math.cos(e) * 400, Math.sin(e) * Math.sin(a) * 400);
    }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false }));
    this.scene.add(this.stars);
    this.rainOff = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) { this.rainOff[i * 3] = (Math.random() - 0.5) * 24; this.rainOff[i * 3 + 1] = Math.random() * 16; this.rainOff[i * 3 + 2] = (Math.random() - 0.5) * 24; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(500 * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9db4ff, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);

    this.bind();
    this.resize();
    if (this.net) {
      this.net.onMsg = (m) => this.onNet(m);
      this.net.onClose = (r) => this.cfg.onLeave(r);
      this.net.start(settings.name);
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- Setup helpers ----------
  findSpawn(): [number, number, number] {
    const x = 8, z = 8;
    for (let y = this.world.opts.kind === "sky" ? 52 : H - 1; y >= 0; y--) {
      const b = this.world.get(x, y, z);
      if (b > 0 && b !== 6 && b !== 7) return [x + 0.5, y + 1, z + 0.5];
    }
    return [x + 0.5, 60, z + 0.5];
  }

  private on(t: EventTarget, ev: string, fn: any, opt?: any) { t.addEventListener(ev, fn, opt); this.listeners.push([t, ev, fn]); }

  private bind() {
    const cv = this.cfg.canvas;
    this.on(window, "resize", () => this.resize());
    this.on(document, "pointerlockchange", () => {
      this.locked = document.pointerLockElement === cv;
      if (!this.locked) { this.mouse.l = false; this.mouse.r = false; this.keys.clear(); }
      this.cfg.onLock(this.locked);
    });
    this.on(document, "mousemove", (e: MouseEvent) => {
      if (!this.locked) return;
      const s = 0.0022 * this.cfg.settings.sens;
      this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * s));
    });
    this.on(cv, "mousedown", (e: MouseEvent) => {
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.l = true; this.swing = 1; this.attack(); }
      else if (e.button === 2) { this.mouse.r = true; this.placeCd = 0; }
      else if (e.button === 1) this.pickBlock();
    });
    this.on(document, "mouseup", (e: MouseEvent) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    this.on(cv, "contextmenu", (e: Event) => e.preventDefault());
    this.on(cv, "wheel", (e: WheelEvent) => {
      if (!this.locked) return;
      this.sel = (this.sel + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.touch();
    }, { passive: true });
    this.on(window, "keydown", (e: KeyboardEvent) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) { this.sel = n - 1; this.touch(); }
      }
      if (e.code === "Space" && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpace < 300 && (this.gm === "creative" || this.spec)) this.flying = !this.flying;
        this.lastSpace = now;
      }
      if (["Space", "Tab"].includes(e.code)) e.preventDefault();
    });
    this.on(window, "keyup", (e: KeyboardEvent) => this.keys.delete(e.code));
    this.on(window, "blur", () => { this.keys.clear(); this.mouse.l = false; this.mouse.r = false; });
  }

  requestLock() { try { (this.cfg.canvas.requestPointerLock() as any)?.catch?.(() => {}); } catch { /* ignore */ } }
  resize() {
    const cv = this.cfg.canvas;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setSaveHook(fn: () => void) { this.saveFn = fn; }
  touch() { this.cfg.onUpdate(); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(([t, e, f]) => t.removeEventListener(e, f));
    if (document.pointerLockElement) document.exitPointerLock();
    this.meshes.forEach((m) => m?.geometry.dispose());
    this.renderer.dispose();
    if (this.net) this.net.close();
  }

  // ---------- Chat / messages ----------
  addChat(text: string, color = "#ffffff") {
    this.chat.push({ text, color, t: Date.now() });
    if (this.chat.length > 60) this.chat.shift();
    this.touch();
  }
  msg(key: string, ...args: (string | number)[]) { this.addChat(tr(key, ...args)); }
  fmt(key: string, args: any[] = []) {
    const a = args.map((x) => {
      if (x && typeof x === "object" && "team" in x) return tr("team." + TEAMS[x.team % 4].key);
      if (typeof x === "string" && THEMES.includes(x)) return tr("theme." + x);
      return String(x);
    });
    return tr(key, ...a);
  }
  title(text: string, ms = 3000) { this.titleText = { text, until: performance.now() + ms }; this.touch(); }

  submitChat(text: string) {
    text = text.trim();
    if (!text) return;
    this.history.push(text);
    if (text.startsWith("/")) { runCommand(this, text.slice(1)); return; }
    if (this.net) this.net.send({ t: "chat", text });
    else this.addChat(`<${this.cfg.settings.name}> ${text}`);
  }

  // ---------- Inventory ----------
  addItem(id: number, n: number): number {
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inv[i];
      if (s && s.id === id && s.n < 64) { const a = Math.min(64 - s.n, n); s.n += a; n -= a; }
    }
    for (let i = 0; i < 36 && n > 0; i++) {
      if (!this.inv[i]) { const a = Math.min(64, n); this.inv[i] = { id, n: a }; n -= a; }
    }
    this.touch();
    return n;
  }
  countItem(id: number) { return this.inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }
  clearInv() { this.inv = new Array(36).fill(null); this.touch(); }
  held(): Slot | null { return this.inv[this.sel]; }

  // ---------- World interaction ----------
  private dir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  get reach() { return this.gm === "creative" ? 6 : 5; }

  raycast(maxD: number) {
    const o = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z), d = this.dir();
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = d.x ? Math.abs(1 / d.x) : Infinity, tdy = d.y ? Math.abs(1 / d.y) : Infinity, tdz = d.z ? Math.abs(1 / d.z) : Infinity;
    let tx = d.x ? (sx > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
    let ty = d.y ? (sy > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
    let tz = d.z ? (sz > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    if (this.world.get(x, y, z) > 0) return null;
    for (let i = 0; i < 40; i++) {
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxD) return null;
      if (this.world.get(x, y, z) > 0) return { x, y, z, nx, ny, nz, d: t };
    }
    return null;
  }

  canEditLocal(x: number, y: number, z: number, b: number) {
    const old = this.world.get(x, y, z);
    if (y < 0 || y >= H) return false;
    if (this.net) {
      if (!this.st) return false;
      return canEdit(this.st, this.st.players[this.myId], x, y, z, b, old, this.placed);
    }
    if (!this.op && !this.cheats) { /* Überleben ohne Cheats darf trotzdem bauen */ }
    return b !== 0 || old !== 11;
  }

  setBlock(x: number, y: number, z: number, b: number) {
    this.world.set(x, y, z, b);
    const k = x + "," + y + "," + z;
    if (this.net) { if (b) this.placed.add(k); else this.placed.delete(k); this.net.send({ t: "set", x, y, z, b }); }
  }

  breakBlock(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    if (!id) return;
    this.setBlock(x, y, z, 0);
    this.swing = 1;
    if (this.gm === "survival") {
      const def = BLOCKS[id]!;
      const drop = def.drop !== undefined ? def.drop : id;
      if (drop > 0) this.addItem(drop, 1);
    }
  }

  tryPlace() {
    const h = this.raycast(this.reach);
    const item = this.inv[this.sel];
    if (!h || !item) return;
    const px = h.x + h.nx, py = h.y + h.ny, pz = h.z + h.nz;
    if (this.world.get(px, py, pz) !== 0) return;
    if (px + 1 > this.pos.x - R && px < this.pos.x + R && pz + 1 > this.pos.z - R && pz < this.pos.z + R && py + 1 > this.pos.y && py < this.pos.y + HGT) return;
    if (!this.canEditLocal(px, py, pz, item.id)) return;
    this.setBlock(px, py, pz, item.id);
    this.swing = 1;
    if (this.gm === "survival") { item.n--; if (item.n <= 0) this.inv[this.sel] = null; this.touch(); }
  }

  pickBlock() {
    if (this.gm !== "creative" || this.net) return;
    const h = this.raycast(this.reach);
    if (!h) return;
    const id = this.world.get(h.x, h.y, h.z);
    if (id > 0) { this.inv[this.sel] = { id, n: 64 }; this.touch(); }
  }

  attack() {
    if (!this.net || !this.st || this.spec || this.dead || !isPvp(this.mode!) || this.st.phase !== "playing" || this.hitCd > 0) return;
    const o = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z), d = this.dir();
    const bh = this.raycast(4.5);
    let best: string | null = null, bt = bh ? bh.d : 4.5;
    this.remotes.forEach((r) => {
      const ps = this.st!.players[r.id];
      if (!ps || ps.spec || !ps.alive || ps.team === this.team || !r.group.visible) return;
      const p = r.group.position;
      const mn = [p.x - R, p.y, p.z - R], mx = [p.x + R, p.y + HGT, p.z + R];
      let t0 = 0, t1 = bt;
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dd[i]) < 1e-8) { if (oo[i] < mn[i] || oo[i] > mx[i]) return; continue; }
        let a = (mn[i] - oo[i]) / dd[i], b = (mx[i] - oo[i]) / dd[i];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) return;
      }
      if (t0 < bt) { bt = t0; best = r.id; }
    });
    if (best) { this.net.send({ t: "hit", target: best, dmg: this.sword ? 7 : 2 }); this.hitCd = 0.5; }
  }

  // ---------- Health ----------
  hurt(n: number, dir?: number[]) {
    if (this.gm === "creative" || this.dead || this.spec) return;
    if (this.net && this.st && this.st.phase !== "playing") return;
    this.hp -= n * (this.armor ? 0.6 : 1);
    this.hurtT = 0.35;
    if (dir) { this.vel.x += dir[0] * 7; this.vel.z += dir[1] * 7; this.vel.y = 5; this.onGround = false; }
    if (this.hp <= 0) this.die();
    this.touch();
  }

  die() {
    if (this.dead) return;
    this.hp = 0; this.dead = true;
    if (this.net) { this.net.send({ t: "died" }); return; }
    this.addChat(tr("msg.died"), "#ff6666");
    if (!this.keepInv && this.gm === "survival") this.clearInv();
    this.respawnT = 1.5;
    this.touch();
  }

  respawn() {
    this.dead = false; this.hp = 20; this.vel.set(0, 0, 0);
    this.pos.set(...this.spawn);
    this.fallY = this.pos.y;
    this.touch();
  }

  // ---------- Physics ----------
  private hits(px: number, py: number, pz: number) {
    const x0 = Math.floor(px - R), x1 = Math.floor(px + R - 1e-4), z0 = Math.floor(pz - R), z1 = Math.floor(pz + R - 1e-4);
    const y0 = Math.floor(py), y1 = Math.floor(py + HGT - 1e-4);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (this.world.get(x, y, z) > 0) return true;
    return false;
  }

  private step(dt: number) {
    const active = this.locked && !this.dead;
    const k = this.keys;
    let fx = 0, fz = 0;
    if (active) {
      if (k.has("KeyW")) fz -= 1; if (k.has("KeyS")) fz += 1;
      if (k.has("KeyA")) fx -= 1; if (k.has("KeyD")) fx += 1;
    }
    const l = Math.hypot(fx, fz);
    if (l > 0) { fx /= l; fz /= l; }
    const sprint = k.has("ControlLeft") || k.has("ControlRight");
    const speed = this.flying ? (sprint ? 22 : 11) : sprint ? 5.8 : 4.3;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const tx = (fx * c + fz * s) * speed, tz = (-fx * s + fz * c) * speed;
    const a = 1 - Math.exp(-dt * (this.onGround || this.flying ? 18 : 5));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;
    const noclip = this.spec;
    if (this.flying) {
      const up = active ? (k.has("Space") ? 1 : 0) - (k.has("ShiftLeft") || k.has("ShiftRight") ? 1 : 0) : 0;
      this.vel.y += (up * (sprint ? 14 : 8) - this.vel.y) * (1 - Math.exp(-dt * 10));
    } else {
      this.vel.y = Math.max(this.vel.y - 28 * dt, -55);
      if (active && k.has("Space") && this.onGround) { this.vel.y = 8.6; this.onGround = false; }
    }
    if (!noclip && this.hits(this.pos.x, this.pos.y, this.pos.z)) this.pos.y += 0.25;
    const nx = this.pos.x + this.vel.x * dt;
    if (!noclip && this.hits(nx, this.pos.y, this.pos.z)) this.vel.x = 0; else this.pos.x = nx;
    const nz = this.pos.z + this.vel.z * dt;
    if (!noclip && this.hits(this.pos.x, this.pos.y, nz)) this.vel.z = 0; else this.pos.z = nz;
    const ny = this.pos.y + this.vel.y * dt;
    const wasGround = this.onGround;
    if (!noclip && this.hits(this.pos.x, ny, this.pos.z)) {
      if (this.vel.y < 0) { this.pos.y = Math.floor(ny) + 1; this.onGround = true; } else this.pos.y = Math.floor(ny + HGT) - HGT - 0.001;
      this.vel.y = 0;
    } else { this.pos.y = ny; this.onGround = false; }
    if (this.onGround || this.flying) {
      if (this.onGround && !wasGround && !this.flying) {
        const dist = this.fallY - this.pos.y;
        const noFall = this.mode === "dropper" || this.mode === "buildbattle";
        if (dist > 3.2 && !noFall && this.gm === "survival") this.hurt(Math.floor(dist - 3));
      }
      this.fallY = this.pos.y;
    } else this.fallY = Math.max(this.fallY, this.pos.y);
  }

  // ---------- Net ----------
  private onNet(m: any) {
    switch (m.t) {
      case "welcome":
        this.myId = m.id; this.st = m.state;
        for (let i = 0; i + 3 < m.edits.length; i += 4) this.world.set(m.edits[i], m.edits[i + 1], m.edits[i + 2], m.edits[i + 3]);
        break;
      case "state": {
        this.st = m.state;
        const me = this.st!.players[this.myId];
        if (me) this.team = me.team;
        this.remotes.forEach((_r, id) => { if (!this.st!.players[id]) this.removeRemote(id); });
        this.touch();
        break;
      }
      case "pos":
        for (const [id, x, y, z, yaw] of m.p) {
          if (id === this.myId) continue;
          this.remote(id).target.set(x, y, z);
          this.remote(id).yaw = yaw;
        }
        break;
      case "set": {
        this.world.set(m.x, m.y, m.z, m.b);
        const k = m.x + "," + m.y + "," + m.z;
        if (m.b) this.placed.add(k); else this.placed.delete(k);
        break;
      }
      case "chat": this.addChat(`<${m.name}> ${m.text}`, m.team >= 0 ? teamColor(m.team) : "#ffffff"); break;
      case "sys": this.addChat(this.fmt(m.key, m.args), "#ffd54a"); break;
      case "title": this.title(this.fmt(m.key, m.args), 3500); break;
      case "go": {
        this.pos.set(m.pos[0], m.pos[1], m.pos[2]); this.vel.set(0, 0, 0); this.fallY = this.pos.y;
        this.dead = false; if (m.heal) this.hp = 20;
        this.gm = m.gm; this.spec = !!m.spec; this.flying = !!m.fly; this.team = m.team;
        if (m.clear) { this.clearInv(); this.res = { iron: 0, gold: 0 }; this.sword = false; this.armor = false; }
        if (m.kit) for (const [id, n] of m.kit) this.addItem(id, n);
        if (m.gm === "creative" && !m.spec) this.fillCreative();
        this.touch();
        break;
      }
      case "dead": this.deadWait = m.wait; break;
      case "damage": this.hurt(m.amount, m.dir); break;
      case "reset":
        this.world.clearEdits(); this.placed.clear(); this.rebuildAll();
        this.votedPlot = -1;
        break;
      case "kick": this.cfg.onLeave(m.key); break;
    }
  }

  private remote(id: string): Remote {
    let r = this.remotes.get(id);
    if (r) return r;
    const ps = this.st?.players[id];
    const group = new THREE.Group();
    const mk = (w: number, h: number, d: number, color: number, y: number, x = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, 0); group.add(m); return m;
    };
    mk(0.25, 0.75, 0.25, 0x3a3f8f, 0.375, -0.13); mk(0.25, 0.75, 0.25, 0x3a3f8f, 0.375, 0.13);
    const body = mk(0.5, 0.75, 0.25, 0x888888, 1.125);
    mk(0.2, 0.7, 0.2, 0xe0ac69, 1.15, -0.36); mk(0.2, 0.7, 0.2, 0xe0ac69, 1.15, 0.36);
    mk(0.5, 0.5, 0.5, 0xe0ac69, 1.75);
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sp.scale.set(2, 0.5, 1); sp.position.y = 2.3; sp.renderOrder = 10;
    group.add(sp);
    this.scene.add(group);
    r = { id, group, target: new THREE.Vector3(), yaw: 0, body, name: "", team: -9 };
    (r as any).sprite = sp; (r as any).cv = cv;
    group.position.set(0, -100, 0);
    (r as any).fresh = true;
    this.remotes.set(id, r);
    void ps;
    return r;
  }

  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.group);
    this.remotes.delete(id);
  }

  private syncRemotes(dt: number) {
    this.remotes.forEach((r) => {
      const ps = this.st?.players[r.id];
      if (!ps) return;
      if ((r as any).fresh) { r.group.position.copy(r.target); (r as any).fresh = false; }
      if (ps.name !== r.name || ps.team !== r.team) {
        r.name = ps.name; r.team = ps.team;
        (r.body.material as THREE.MeshBasicMaterial).color.set(ps.team >= 0 ? teamColor(ps.team) : "#888888");
        const cv = (r as any).cv as HTMLCanvasElement, ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 12, 256, 40);
        ctx.fillStyle = ps.team >= 0 ? teamColor(ps.team) : "#fff"; ctx.font = "bold 30px monospace"; ctx.textAlign = "center";
        ctx.fillText(ps.name, 128, 43);
        ((r as any).sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
      }
      r.group.visible = !ps.spec;
      r.group.position.lerp(r.target, 1 - Math.exp(-dt * 14));
      r.group.rotation.y = r.yaw;
    });
  }

  // ---------- Chunks ----------
  private buildMesh(cx: number, cz: number) {
    const k = ckey(cx, cz);
    const old = this.meshes.get(k);
    if (old) { this.scene.remove(old); old.geometry.dispose(); }
    const geo = buildChunk(this.world, cx, cz);
    if (geo) { const m = new THREE.Mesh(geo, this.mat); this.scene.add(m); this.meshes.set(k, m); } else this.meshes.set(k, null);
  }

  rebuildAll() {
    this.meshes.forEach((m) => { if (m) { this.scene.remove(m); m.geometry.dispose(); } });
    this.meshes.clear(); this.queue = []; this.lastPc = [1e9, 1e9];
  }

  private updateChunks() {
    const pcx = Math.floor(this.pos.x / CS), pcz = Math.floor(this.pos.z / CS), rd = this.cfg.settings.renderDist;
    const t0 = performance.now();
    for (const k of this.world.dirty) {
      this.world.dirty.delete(k);
      if (this.meshes.has(k)) this.buildMesh(keyCx(k), keyCz(k));
      if (performance.now() - t0 > 8) break;
    }
    if (pcx !== this.lastPc[0] || pcz !== this.lastPc[1]) {
      this.lastPc = [pcx, pcz];
      this.meshes.forEach((m, k) => {
        if (Math.max(Math.abs(keyCx(k) - pcx), Math.abs(keyCz(k) - pcz)) > rd + 1) { if (m) { this.scene.remove(m); m.geometry.dispose(); } this.meshes.delete(k); }
      });
      const list: [number, number][] = [];
      for (let dx = -rd; dx <= rd; dx++) for (let dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) continue;
        const k = ckey(pcx + dx, pcz + dz);
        if (!this.meshes.has(k)) list.push([dx * dx + dz * dz, k]);
      }
      list.sort((a, b) => a[0] - b[0]);
      this.queue = list.map((l) => l[1]);
    }
    while (this.queue.length && performance.now() - t0 < 10) {
      const k = this.queue.shift()!;
      if (!this.meshes.has(k)) this.buildMesh(keyCx(k), keyCz(k));
    }
  }

  // ---------- Main loop ----------
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    if (!this.frozen) {
      const n = Math.ceil(dt / 0.02), h = dt / n;
      for (let i = 0; i < n; i++) this.step(h);
      if (this.pos.y < -20 && !this.dead) {
        if (this.mode === "dropper") { if (this.failCd <= 0) { this.failCd = 1.2; this.net!.send({ t: "fail" }); } }
        else this.die();
      }
      if (this.mode === "dropper" && this.st?.phase === "playing" && this.onGround && this.pos.y < DROP_TOP - 3 && !this.dead && this.failCd <= 0) {
        this.failCd = 1.2;
        this.net!.send({ t: this.pos.y < 12 ? "finish" : "fail" });
      }
      this.updateMining(dt);
    }
    this.failCd -= dt; this.hitCd -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    this.swing = Math.max(0, this.swing - dt * 5);
    if (this.dead && !this.net) { this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(); }
    if (this.dead && this.net && this.deadWait > 0) { this.deadWait -= dt; }

    // Regeneration
    if (this.gm === "survival" && !this.dead && this.hp < 20 && !this.spec) { this.hp = Math.min(20, this.hp + dt * 0.25); }
    // Resources (Bedwars)
    if (this.mode === "bedwars" && this.st?.phase === "playing" && !this.dead && !this.spec) {
      this.resAcc[0] += dt; this.resAcc[1] += dt;
      if (this.resAcc[0] >= 0.8) { this.resAcc[0] = 0; this.res.iron++; }
      if (this.resAcc[1] >= 6) { this.resAcc[1] = 0; this.res.gold++; }
    }
    // Time
    if (this.daylight && !this.net) this.time = (this.time + dt * 20) % 24000;
    this.updateSky();
    // Camera
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.camera.fov !== this.cfg.settings.fov) { this.camera.fov = this.cfg.settings.fov; this.camera.updateProjectionMatrix(); }
    this.updateHand();
    this.updateChunks();
    this.syncRemotes(dt);
    // Net pos
    if (this.net && this.st) {
      this.posAcc += dt;
      if (this.posAcc >= 0.066) {
        this.posAcc = 0;
        this.net.send({ t: "pos", x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(2), pitch: +this.pitch.toFixed(2) });
      }
    }
    this.uiAcc += dt;
    if (this.uiAcc > 0.12) { this.uiAcc = 0; this.touch(); }
  }

  private updateMining(dt: number) {
    this.placeCd -= dt;
    const can = this.locked && !this.dead && !this.spec;
    let target: ReturnType<Engine["raycast"]> = null;
    if (can) target = this.raycast(this.reach);
    this.selBox.visible = !!target;
    if (target) this.selBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    if (can && this.mouse.r && this.placeCd <= 0) { this.tryPlace(); this.placeCd = 0.22; }
    if (!can || !this.mouse.l || !target) { this.mining = null; this.crack.visible = false; return; }
    const m = this.mining;
    if (!m || m.x !== target.x || m.y !== target.y || m.z !== target.z) this.mining = { x: target.x, y: target.y, z: target.z, p: 0, cd: 0 };
    const mi = this.mining!;
    const def = BLOCKS[this.world.get(mi.x, mi.y, mi.z)];
    if (!def || def.hard < 0 || !this.canEditLocal(mi.x, mi.y, mi.z, 0)) { this.crack.visible = false; return; }
    if (this.gm === "creative") {
      mi.cd -= dt;
      if (mi.cd <= 0) { this.breakBlock(mi.x, mi.y, mi.z); mi.cd = 0.25; }
      this.crack.visible = false;
    } else {
      mi.p += dt / (def.hard * (this.net ? 0.6 : 1));
      this.crack.visible = true;
      this.crack.position.set(mi.x + 0.5, mi.y + 0.5, mi.z + 0.5);
      (this.crack.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, mi.p * 0.7);
      if (mi.p >= 1) { this.breakBlock(mi.x, mi.y, mi.z); this.mining = null; this.crack.visible = false; }
    }
  }

  private updateHand() {
    const it = this.inv[this.sel];
    const id = it && !this.spec ? it.id : 0;
    if (id !== this.handId) {
      this.handId = id;
      this.hand.geometry.dispose();
      this.hand.geometry = id ? blockGeom(id) : new THREE.BufferGeometry();
    }
    const sw = Math.sin(this.swing * Math.PI);
    this.hand.position.set(0.5 - sw * 0.1, -0.45 - sw * 0.12, -0.8 - sw * 0.2);
    this.hand.rotation.set(-sw * 0.8, 0.6, 0);
    this.hand.scale.setScalar(0.34);
    this.hand.visible = !!id;
  }

  private updateSky() {
    const a = ((this.time - 6000) / 24000) * Math.PI * 2;
    const sun = Math.cos(a);
    const rainy = this.weather === "rain";
    let light = Math.max(0.2, Math.min(1, sun * 1.3 + 0.5));
    if (rainy) light *= 0.78;
    const day = new THREE.Color(rainy ? 0x6d7a8a : 0x87ceeb), night = new THREE.Color(0x0a0e24), dusk = new THREE.Color(0xe08a4a);
    const f = Math.max(0, Math.min(1, (sun + 0.1) * 2.5));
    const sky = night.clone().lerp(day, f);
    const duskF = Math.max(0, 1 - Math.abs(sun) * 4) * (rainy ? 0.3 : 0.7);
    sky.lerp(dusk, duskF);
    this.scene.background = sky;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    const rd = this.cfg.settings.renderDist * CS;
    fog.near = rainy ? rd * 0.15 : rd * 0.45; fog.far = rainy ? rd * 0.7 : rd * 0.98;
    this.mat.color.setScalar(light);
    const c = this.camera.position;
    this.sun.position.set(c.x + Math.sin(a) * 300, c.y + Math.cos(a) * 300, c.z + 60);
    this.moon.position.set(c.x - Math.sin(a) * 300, c.y - Math.cos(a) * 300, c.z - 60);
    this.sun.lookAt(c); this.moon.lookAt(c);
    this.sun.visible = !rainy; this.moon.visible = !rainy;
    this.stars.position.copy(c);
    (this.stars.material as THREE.PointsMaterial).opacity = rainy ? 0 : Math.max(0, Math.min(1, -sun * 2.5));
    this.rain.visible = rainy;
    if (rainy) {
      const p = (this.rain.geometry.attributes.position as THREE.BufferAttribute);
      for (let i = 0; i < 500; i++) {
        this.rainOff[i * 3 + 1] -= 0.4;
        if (this.rainOff[i * 3 + 1] < -4) this.rainOff[i * 3 + 1] = 14;
        const x = c.x + this.rainOff[i * 3], y = c.y + this.rainOff[i * 3 + 1], z = c.z + this.rainOff[i * 3 + 2];
        p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x, y - 0.7, z);
      }
      p.needsUpdate = true;
    }
  }

  // ---------- Save ----------
  getSave(): SaveData | null {
    if (!this.cfg.single) return null;
    const d = this.cfg.single.data;
    Object.assign(d, {
      gm: this.gm, cheats: this.cheats, daylight: this.daylight, keepInv: this.keepInv, weather: this.weather, time: this.time,
      pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, pitch: this.pitch, spawn: this.spawn, inv: this.inv, hp: Math.max(1, this.hp),
      edits: this.world.editList(), lastPlayed: Date.now(),
    });
    return d;
  }
  save() { this.saveFn?.(); }

  fillCreative() {
    if (this.inv.slice(0, 9).some(Boolean)) return;
    [1, 2, 3, 4, 8, 6, 7, 9, 10].forEach((id, i) => (this.inv[i] = { id, n: 64 }));
  }
  setGM(gm: GM) {
    this.gm = gm;
    if (gm === "survival") this.flying = false; else this.fillCreative();
    this.touch();
  }
  teleport(x: number, y: number, z: number) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.fallY = y;
    this.lastPc = [1e9, 1e9];
  }
}
