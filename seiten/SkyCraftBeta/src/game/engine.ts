import * as THREE from "three";
import { CS, H, World, ckey, keyCx, keyCz } from "./world";
import { BLOCKS, getAtlasTexture } from "./blocks";
import { blockGeom, buildChunk } from "./mesher";
import { isSkinSelection } from "./storage";
import type { GM, SavedMob, SaveData, Settings, Slot } from "./storage";
import { Net } from "./net";
import { GState, canEdit } from "./server";
import { buildBattleWallBlocks, BW_C, DROP_TOP, HUB_PORTALS, LOBBY, Mode, TEAMS, THEMES, Variant, hubPortalAt, isHubPortalOpening, isPvp, serverBlock, teamColor } from "./maps";
import { t as tr } from "../i18n";
import { runCommand } from "./commands";
import { filterChat } from "./chatFilter";
import { playSoundFile } from "./audio";

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  settings: Settings;
  single?: { slot: number; data: SaveData };
  server?: { net: Net; mode: Mode; variant: Variant; hub?: boolean };
  onUpdate: () => void;
  onLock: (locked: boolean) => void;
  onLeave: (reason?: string) => void;
  onReturnHub: () => void;
  onHubPortal: (mode: Mode | null) => void;
  onHubMatch: (mode: Mode, variant: Variant, matchId: string) => void;
}
interface Remote {
  id: string; group: THREE.Group; target: THREE.Vector3; yaw: number; body: THREE.Mesh; armorMesh: THREE.Mesh; name: string; team: number; skin: string;
}
export interface ChatLine { text: string; color: string; t: number }
interface DropState { id: number; n: number; x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; owner: string | null; availableAt: number }
interface MobState extends SavedMob {
  health: number; group: THREE.Group; timer: number; groundTimer: number; goalX: number; goalZ: number; maxHealth: number;
  healthBack: THREE.Mesh; healthFill: THREE.Mesh; flashTimer: number; attackTimer: number;
}

const R = 0.3, HGT = 1.8, EYE = 1.62;
const GRAVITY = 28, JUMP_HEIGHT = 1.45, JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

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
  hp = 20; hurtT = 0; armorTier = 0;
  inv: (Slot | null)[] = new Array(36).fill(null);
  sel = 0;
  chat: ChatLine[] = [];
  history: string[] = [];
  op = true; spec = false; dead = false; deadWait = 0; respawnT = 0; dropperFinished = false;
  keys = new Set<string>();
  mouse = { l: false, r: false };
  locked = false; frozen = false;
  touchControlsActive = false;
  controllerAttached = false;
  private gamepadMove = [0, 0];
  private gamepadLook = [0, 0];
  private gamepadJump = false;
  private gamepadSprint = false;
  private gamepadSneak = false;
  private gamepadAttack = false;
  private gamepadPlace = false;
  private previousGamepadButtons: boolean[] = [];
  private lookTouchId: number | null = null;
  private lastTouch = [0, 0];
  time = 1000; daylight = true; keepInv = true; weather: "clear" | "rain" = "clear"; cheats = true;
  spawn: [number, number, number] = [8.5, 60, 8.5];
  seedText = "";

  // Server
  net: Net | null = null;
  mode: Mode | null = null; variant: Variant = "solo";
  isHub = false;
  hubPortalMode: Mode | null = null;
  hubQueue: { mode: Mode; variant: Variant; count: number; need: number } | null = null;
  hubQueueError = "";
  st: GState | null = null;
  myId = ""; team = -1;
  placed = new Set<string>();
  remotes = new Map<string, Remote>();
  remoteSkins = new Map<string, string>();
  res = { iron: 0, gold: 0 };
  sword = false; swordLevel = 0; armor = false;
  titleText: { text: string; until: number } | null = null;
  votedPlot = -1; myVote = 0;
  hitCd = 0;
  zoomed = false;
  zoomLevel = 0.5;
  private zoomFov = 75;
  drops = new Map<string, DropState & { mesh: THREE.Mesh; target: THREE.Vector3 }>();
  private mobs: MobState[] = [];
  private pickupRequests = new Set<string>();
  private localTnt = new Map<string, number>();
  private shopPositions: THREE.Vector3[] = [];
  private mineSoundTimer = 0;
  private stepSoundTimer = 0;
  private caveSpawnTimer = 4;

  mining: { x: number; y: number; z: number; p: number } | null = null;
  private creativeBreakCooldown = 0;
  placeCd = 0; swing = 0; lastSpace = 0; failCd = 0;
  private raf = 0; private last = 0; private uiAcc = 0; private posAcc = 0; 
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
      const { mode, net, variant, hub } = cfg.server;
      this.mode = mode; this.variant = variant; this.net = net; this.op = false; this.cheats = false;
      this.isHub = !!hub;
      this.world = new World({ kind: "server", seed: 0, gen: (x, y, z) => serverBlock(mode, x, y, z) });
      this.time = 6000; this.daylight = false;
      this.spawn = [LOBBY.x, LOBBY.y, LOBBY.z];
      this.pos.set(LOBBY.x, LOBBY.y, LOBBY.z);
      if (mode === "bedwars") this.addBedwarsVendors();
    } else {
      const d = cfg.single!.data;
      this.world = new World({ kind: d.type, seed: d.seed, trees: d.trees, structures: true });
      this.world.loadEdits(d.edits);
      this.gm = d.gm; this.cheats = d.cheats; this.daylight = d.daylight; this.keepInv = d.keepInv; this.armorTier = d.armorTier || 0;
      this.weather = d.weather; this.time = d.time; this.hp = d.hp || 20; this.seedText = d.seedText;
      this.inv = d.inv.length === 36 ? d.inv.map((s) => s && !((s.id >= 70 && s.id <= 77) || s.id === 82 || s.id === 83) ? { ...s } : null) : this.inv;
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

    if (this.isHub) this.addHubLabels();
    for (const mob of cfg.single?.data.mobs || []) this.addMob(mob.kind, mob.x, mob.y, mob.z, mob.yaw, mob.health);
    this.bind();
    this.resize();
    if (this.net) {
      this.net.onMsg = (m) => this.onNet(m);
      this.net.onClose = (r) => this.cfg.server ? this.cfg.onReturnHub() : this.cfg.onLeave(r);
      this.net.start(settings.name, settings.skin || "");
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
      if (!this.locked) { this.mouse.l = false; this.mouse.r = false; this.creativeBreakCooldown = 0; this.zoomed = false; this.keys.clear(); }
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
    this.on(document, "mouseup", (e: MouseEvent) => {
      if (e.button === 0) { this.mouse.l = false; this.creativeBreakCooldown = 0; }
      if (e.button === 2) this.mouse.r = false;
    });
    this.on(cv, "contextmenu", (e: Event) => e.preventDefault());
    this.on(cv, "touchstart", (event: TouchEvent) => {
      if (!this.locked || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      this.lookTouchId = touch.identifier;
      this.lastTouch = [touch.clientX, touch.clientY];
      event.preventDefault();
    }, { passive: false });
    this.on(cv, "touchmove", (event: TouchEvent) => {
      if (!this.locked || this.lookTouchId === null) return;
      const touch = Array.from(event.touches).find((candidate) => candidate.identifier === this.lookTouchId);
      if (!touch) return;
      const dx = touch.clientX - this.lastTouch[0], dy = touch.clientY - this.lastTouch[1];
      this.lastTouch = [touch.clientX, touch.clientY];
      this.yaw -= dx * 0.006 * this.cfg.settings.sens;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.006 * this.cfg.settings.sens));
      event.preventDefault();
    }, { passive: false });
    this.on(cv, "touchend", (event: TouchEvent) => {
      if (Array.from(event.changedTouches).some((touch) => touch.identifier === this.lookTouchId)) this.lookTouchId = null;
    });
    this.on(cv, "wheel", (e: WheelEvent) => {
      if (!this.locked) return;
      if (this.zoomed) {
        this.zoomLevel = Math.max(0.08, Math.min(0.9, this.zoomLevel + (e.deltaY < 0 ? 0.06 : -0.06)));
        e.preventDefault();
        return;
      }
      this.sel = (this.sel + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.touch();
    }, { passive: false });
    this.on(window, "keydown", (e: KeyboardEvent) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      const controls = this.cfg.settings.controls;
      if (e.code === controls.zoom) this.zoomed = true;
      if (e.code === controls.drop && !e.repeat) this.dropHeld();
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) { this.sel = n - 1; this.touch(); }
      }
      if (e.code === controls.jump && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpace < 300 && (this.gm === "creative" || this.spec)) this.flying = !this.flying;
        this.lastSpace = now;
      }
      if ([controls.jump, "Tab"].includes(e.code)) e.preventDefault();
    });
    this.on(window, "keyup", (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === this.cfg.settings.controls.zoom) this.zoomed = false;
    });
    this.on(window, "blur", () => { this.keys.clear(); this.mouse.l = false; this.mouse.r = false; this.zoomed = false; this.creativeBreakCooldown = 0; });
  }

  requestLock() {
    if (navigator.maxTouchPoints > 0) {
      this.touchControlsActive = true; this.locked = true; this.cfg.onLock(true); return;
    }
    if (this.controllerAttached) {
      this.locked = true; this.cfg.onLock(true); return;
    }
    try { (this.cfg.canvas.requestPointerLock() as any)?.catch?.(() => {}); } catch { /* ignore */ }
  }
  releaseInput() {
    const pointerLocked = document.pointerLockElement === this.cfg.canvas;
    if (pointerLocked) document.exitPointerLock();
    else {
      this.locked = false; this.keys.clear();
      this.cfg.onLock(false);
    }
    this.touchControlsActive = false;
  }
  touchKey(code: string, down: boolean) { if (down) this.keys.add(code); else this.keys.delete(code); }
  touchAttack(down: boolean) {
    this.mouse.l = down;
    if (down) this.attack();
    else this.creativeBreakCooldown = 0;
  }
  touchPlace(down: boolean) { this.mouse.r = down; if (down) this.placeCd = 0; }
  touchDrop() { this.dropHeld(); }
  resize() {
    const cv = this.cfg.canvas;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setSaveHook(fn: () => void) { this.saveFn = fn; }
  touch() { this.cfg.onUpdate(); }

  private playSound(kind: "mine" | "place" | "pickup" | "drop" | "hit" | "damage" | "jump" | "land" | "step" | "chicken" | "cow" | "zombie") {
    const settings = {
      mine: "block_break",
      place: "block_place",
      pickup: "item_pickup",
      drop: "item_drop",
      hit: "mob_hit",
      damage: "player_damage",
      jump: "jump",
      land: "land",
      step: "walk_on_stone",
      chicken: "chicken",
      cow: "cow",
      zombie: "zombie",
    }[kind];
    playSoundFile(settings);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(([t, e, f]) => t.removeEventListener(e, f));
    if (document.pointerLockElement) document.exitPointerLock();
    this.meshes.forEach((m) => m?.geometry.dispose());
    this.mobs.forEach((mob) => {
      this.scene.remove(mob.group);
      mob.group.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      });
    });
    this.hubLabelMaterials.forEach((material) => { material.map?.dispose(); material.dispose(); });
    this.renderer.dispose();
    if (this.net) {
      if (this.isHub) {
        this.net.onMsg = () => {};
        this.net.onClose = () => {};
      } else {
        this.net.close();
      }
    }
  }

  private hubLabelMaterials: THREE.SpriteMaterial[] = [];

  private addHubLabels() {
    HUB_PORTALS.forEach((portal) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 42px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tr("mode." + portal.mode), 256, 48);
      const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
      const label = new THREE.Sprite(material);
      label.scale.set(3.2, 0.6, 1);
      label.position.set(portal.x + 0.5, 65.2, 389.5);
      label.renderOrder = 10;
      this.scene.add(label);
      this.hubLabelMaterials.push(material);
    });
  }

  joinHubQueue(variant: Variant) {
    if (!this.isHub || !this.hubPortalMode || !this.net) return;
    this.hubQueueError = "";
    this.net.send({ t: "hub.queue.join", mode: this.hubPortalMode, variant });
    this.touch();
  }

  closeHubPortal() {
    if (!this.isHub || !this.hubPortalMode) return;
    this.net?.send({ t: "hub.portal.cancel" });
    this.teleport(LOBBY.x, LOBBY.y, LOBBY.z);
    this.hubPortalMode = null;
    this.hubQueue = null;
    this.hubQueueError = "";
    this.cfg.onHubPortal(null);
    this.touch();
  }

  isNearShop() {
    return this.shopPositions.some((position) => this.pos.distanceTo(position) < 3.5);
  }

  private addBedwarsVendors() {
    for (const [x, z] of BW_C) {
      const position = new THREE.Vector3(x + 3.5, 51, z + 4.5);
      this.shopPositions.push(position);
      const vendor = new THREE.Group();
      const piece = (w: number, h: number, d: number, color: number, y: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
        mesh.position.y = y;
        vendor.add(mesh);
      };
      piece(0.65, 0.8, 0.45, 0x4b8a52, 0.4);
      piece(0.5, 0.5, 0.5, 0xc98d5c, 1.05);
      piece(0.12, 0.12, 0.08, 0x302a25, 1.1);
      vendor.position.copy(position);
      this.scene.add(vendor);
    }
  }

  private dropHeld() {
    if (this.dead || this.spec) return;
    const item = this.inv[this.sel];
    if (!item) return;
    const id = item.id;
    item.n--;
    if (item.n <= 0) this.inv[this.sel] = null;
    const direction = this.dir();
    const x = this.pos.x + direction.x * 0.7, y = this.pos.y + 0.5, z = this.pos.z + direction.z * 0.7;
    if (this.net) this.net.send({ t: "drop", id, n: 1, x, y, z });
    else this.spawnLocalDrop(id, 1, x, y, z, "local", Date.now() + 3000, direction.x * 2.2, 3.2, direction.z * 2.2);
    this.playSound("drop");
    this.touch();
  }

  private spawnLocalDrop(id: number, amount: number, x: number, y: number, z: number, owner: string | null, availableAt = 0, vx = 0, vy = 0, vz = 0) {
    let remaining = amount;
    const entries: [string, DropState][] = [...this.drops.entries()].map(([key, drop]) => [key, {
      id: drop.id, n: drop.n, x: drop.x, y: drop.y, z: drop.z, vx: drop.vx, vy: drop.vy, vz: drop.vz,
      owner: drop.owner, availableAt: drop.availableAt,
    }]);
    while (remaining > 0) {
      const stack = entries.find(([, drop]) => drop.id === id && drop.owner === owner && drop.n < 16 &&
        Math.hypot(drop.x - x, drop.y - y, drop.z - z) <= 1);
      if (stack) {
        const moved = Math.min(16 - stack[1].n, remaining);
        stack[1].n += moved; stack[1].availableAt = Math.max(stack[1].availableAt, availableAt);
        remaining -= moved;
      } else {
        const count = Math.min(16, remaining);
        entries.push([`local-${performance.now()}-${Math.random()}`, { id, n: count, x, y, z, vx, vy, vz, owner, availableAt }]);
        remaining -= count;
      }
    }
    this.setDrops(entries);
  }

  private setDrops(entries: [string, DropState][]) {
    const incoming = new Set(entries.map(([id]) => id));
    this.drops.forEach((drop, id) => {
      if (!incoming.has(id)) { this.scene.remove(drop.mesh); drop.mesh.geometry.dispose(); this.drops.delete(id); }
    });
    entries.forEach(([id, value]) => {
      let drop = this.drops.get(id);
      if (!drop || drop.id !== value.id) {
        if (drop) { this.scene.remove(drop.mesh); drop.mesh.geometry.dispose(); }
        const mesh = new THREE.Mesh(blockGeom(value.id), this.mat);
        mesh.scale.setScalar(0.32);
        this.scene.add(mesh);
        drop = { ...value, mesh, target: new THREE.Vector3(value.x, value.y + 0.2, value.z) };
        this.drops.set(id, drop);
      }
      drop.n = value.n;
      drop.x = value.x; drop.y = value.y; drop.z = value.z;
      drop.owner = value.owner ?? null;
      drop.availableAt = value.availableAt ?? 0;
      drop.vx = value.vx; drop.vy = value.vy; drop.vz = value.vz;
      drop.target.set(value.x, value.y + 0.2, value.z);
      if (!this.net) drop.mesh.position.copy(drop.target);
    });
  }

  private updateDropPickups() {
    if (this.dead || this.spec) return;
    for (const [id, drop] of this.drops) {
      if ((drop.owner === "local" || (this.myId && drop.owner === this.myId)) && Date.now() < drop.availableAt) continue;
      if (Math.hypot(this.pos.x - drop.x, this.pos.y - drop.y, this.pos.z - drop.z) >= 1.35 || this.pickupRequests.has(id)) continue;
      const max = Math.min(64, this.itemCapacity(drop.id));
      const capacity = this.mode === "bedwars" && (drop.id === 22 || drop.id === 23) ? 64 : max;
      if (capacity < 1) continue;
      this.pickupRequests.add(id);
      if (this.net) this.net.send({ t: "pickup", id, max: capacity });
      else {
        const picked = Math.min(capacity, drop.n);
        this.addItem(drop.id, picked);
        this.playSound("pickup");
        const entries: [string, DropState][] = [...this.drops.entries()]
          .filter(([key, item]) => key !== id || item.n > picked)
          .map(([key, item]) => [key, { id: item.id, n: key === id ? item.n - picked : item.n, x: item.x, y: item.y, z: item.z,
            vx: item.vx, vy: item.vy, vz: item.vz, owner: item.owner, availableAt: item.availableAt }]);
        this.setDrops(entries);
      }
    }
  }

  private updateDrops(dt: number) {
    for (const drop of this.drops.values()) {
      drop.mesh.rotation.y += dt * 1.8;
      if (this.net) {
        drop.mesh.position.lerp(drop.target, 1 - Math.exp(-dt * 12));
        continue;
      }
      if (drop.vy === undefined || drop.vy === 0 && !drop.vx && !drop.vz) continue;
      drop.vy = Math.max(-18, drop.vy - 22 * dt);
      const nx = drop.x + (drop.vx || 0) * dt, ny = drop.y + drop.vy * dt, nz = drop.z + (drop.vz || 0) * dt;
      const floor = Math.floor(ny - 0.18);
      const floorBlock = this.world.get(Math.floor(nx), floor, Math.floor(nz));
      if (floorBlock > 0 && !BLOCKS[floorBlock]?.plant) {
        drop.y = floor + 1.2;
        drop.vx = (drop.vx || 0) * 0.35; drop.vz = (drop.vz || 0) * 0.35;
        drop.vy = drop.vy < -1 ? drop.vy * -0.18 : 0;
      } else {
        drop.x = nx; drop.y = ny; drop.z = nz;
      }
      drop.mesh.position.set(drop.x, drop.y + 0.2, drop.z);
    }
  }

  private addMob(kind: SavedMob["kind"], x: number, y: number, z: number, yaw: number, health?: number) {
    if (this.mobs.length >= 500) return false;
    const group = new THREE.Group();
    const fur = new THREE.MeshBasicMaterial({ color: kind === "chicken" ? 0xf2eee2 : kind === "zombie" ? 0x648f57 : 0x8b5a35 });
    const face = new THREE.MeshBasicMaterial({ color: 0xd99846 });
    const eye = new THREE.MeshBasicMaterial({ color: 0x202020 });
    const part = (w: number, h: number, d: number, material: THREE.Material, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(px, py, pz);
      group.add(mesh);
    };
    const chicken = kind === "chicken", zombie = kind === "zombie";
    const height = chicken ? 0.95 : zombie ? 1.8 : 1.42;
    if (zombie) {
      const shirt = new THREE.MeshBasicMaterial({ color: 0x286b4b });
      const pants = new THREE.MeshBasicMaterial({ color: 0x293d7a });
      part(0.55, 0.78, 0.3, shirt, 0, 1.02, 0);
      part(0.52, 0.5, 0.5, fur, 0, 1.68, 0);
      part(0.25, 0.6, 0.25, pants, -0.15, 0.3, 0);
      part(0.25, 0.6, 0.25, pants, 0.15, 0.3, 0);
      part(0.2, 0.7, 0.22, shirt, -0.38, 1.04, -0.08);
      part(0.2, 0.7, 0.22, shirt, 0.38, 1.04, -0.08);
      part(0.08, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: 0xf0f0d0 }), -0.12, 1.74, -0.26);
      part(0.08, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: 0xf0f0d0 }), 0.12, 1.74, -0.26);
    }
    if (!zombie) {
      part(chicken ? 0.58 : 0.95, chicken ? 0.54 : 0.76, chicken ? 0.58 : 0.66, fur, 0, chicken ? 0.52 : 0.66, 0);
      part(chicken ? 0.3 : 0.44, chicken ? 0.34 : 0.4, chicken ? 0.3 : 0.42, fur, 0, chicken ? 0.92 : 1.25, -0.08);
      part(0.1, 0.1, 0.08, eye, -0.1, chicken ? 0.98 : 1.31, -0.25);
      part(0.1, 0.1, 0.08, eye, 0.1, chicken ? 0.98 : 1.31, -0.25);
      part(chicken ? 0.2 : 0.18, 0.1, 0.17, face, 0, chicken ? 0.88 : 1.13, -0.3);
    }
    if (chicken) {
      part(0.16, 0.18, 0.1, new THREE.MeshBasicMaterial({ color: 0xc8443e }), 0, 1.18, 0.02);
      part(0.44, 0.16, 0.1, fur, -0.28, 0.65, 0);
      part(0.44, 0.16, 0.1, fur, 0.28, 0.65, 0);
    } else if (!zombie) {
      const spots = new THREE.MeshBasicMaterial({ color: 0xeee4d0 });
      part(0.28, 0.3, 0.04, spots, -0.24, 0.76, -0.34);
      part(0.28, 0.3, 0.04, spots, 0.24, 0.52, 0.34);
      const horn = new THREE.MeshBasicMaterial({ color: 0xe7d8b8 });
      part(0.1, 0.22, 0.1, horn, -0.2, 1.52, -0.08);
      part(0.1, 0.22, 0.1, horn, 0.2, 1.52, -0.08);
    }
    if (!zombie) for (const px of [-0.28, 0.28]) for (const pz of [-0.18, 0.18]) {
      part(chicken ? 0.1 : 0.16, chicken ? 0.3 : 0.42, chicken ? 0.1 : 0.16, face, px, 0.2, pz);
    }
    const healthBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x411111 }));
    healthBack.position.set(0, height + 0.3, 0); healthBack.visible = false; group.add(healthBack);
    const healthFill = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x55cc55 }));
    healthFill.position.set(0, height + 0.3, -0.03); healthFill.visible = false; group.add(healthFill);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    const maxHealth = chicken ? 4 : zombie ? 20 : 10;
    this.mobs.push({
      kind, x, y, z, yaw, health: Math.max(1, Math.min(maxHealth, health || maxHealth)), maxHealth,
      group, timer: Math.random() * 2, groundTimer: 0, goalX: x, goalZ: z, healthBack, healthFill, flashTimer: 0, attackTimer: 0,
    });
    return true;
  }

  private updateMobs(dt: number) {
    if (this.net) return;
    for (const mob of this.mobs) {
      if (mob.kind === "zombie") {
        const distanceToPlayer = Math.hypot(this.pos.x - mob.x, this.pos.z - mob.z);
        if (distanceToPlayer < 14) {
          mob.goalX = this.pos.x; mob.goalZ = this.pos.z;
          if (distanceToPlayer < 1.25) {
            mob.attackTimer -= dt;
            if (mob.attackTimer <= 0) { this.hurt(2); mob.attackTimer = 1.3; }
          }
        } else {
          mob.timer -= dt;
          if (mob.timer <= 0) {
            mob.timer = 2 + Math.random() * 4;
            mob.goalX = mob.x + (Math.random() - 0.5) * 5;
            mob.goalZ = mob.z + (Math.random() - 0.5) * 5;
          }
        }
      } else {
        mob.timer -= dt;
        if (mob.timer <= 0) {
          mob.timer = 2 + Math.random() * 4;
          mob.goalX = mob.x + (Math.random() - 0.5) * 5;
          mob.goalZ = mob.z + (Math.random() - 0.5) * 5;
        }
      }
      const dx = mob.goalX - mob.x, dz = mob.goalZ - mob.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.12) {
        const step = Math.min(distance, dt * (mob.kind === "zombie" ? 1.05 : 0.65));
        mob.x += dx / distance * step;
        mob.z += dz / distance * step;
        mob.yaw = Math.atan2(-dx, -dz);
        mob.group.rotation.y = mob.yaw;
        mob.group.position.x = mob.x;
        mob.group.position.z = mob.z;
      }
      if (mob.flashTimer > 0) {
        mob.flashTimer -= dt;
        if (mob.flashTimer <= 0) mob.group.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) object.material.color.set(object.userData.baseColor);
        });
      }
      mob.groundTimer -= dt;
      if (mob.groundTimer <= 0) {
        mob.groundTimer = 0.5;
        if (mob.kind === "zombie") {
          for (let y = Math.floor(mob.y + 1); y >= Math.max(1, Math.floor(mob.y) - 6); y--) {
            if (this.world.get(Math.floor(mob.x), y, Math.floor(mob.z)) > 0) { mob.y = y + 1; break; }
          }
        } else mob.y = this.world.topY(Math.floor(mob.x), Math.floor(mob.z)) + 1;
        mob.group.position.y = mob.y;
      }
    }
  }

  private trySpawnCaveZombie(dt: number) {
    if (this.net || this.cfg.single?.data.type !== "normal" || this.gm !== "survival" || this.dead ||
      this.mobs.filter((mob) => mob.kind === "zombie").length >= 8) return;
    this.caveSpawnTimer -= dt;
    if (this.caveSpawnTimer > 0) return;
    this.caveSpawnTimer = 8;
    for (let attempt = 0; attempt < 18; attempt++) {
      const x = Math.floor(this.pos.x + (Math.random() - 0.5) * 24);
      const z = Math.floor(this.pos.z + (Math.random() - 0.5) * 24);
      const surface = this.world.height(x, z);
      const maxY = Math.min(surface - 5, Math.floor(this.pos.y) - 3);
      const y = Math.floor(5 + Math.random() * Math.max(1, maxY - 5));
      if (y < 5 || y >= surface - 4 || Math.hypot(x + 0.5 - this.pos.x, z + 0.5 - this.pos.z) < 7) continue;
      if (this.world.get(x, y, z) || this.world.get(x, y + 1, z) || this.world.get(x, y - 1, z) === 0) continue;
      let enclosed = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.world.get(x + dx, y, z + dz) > 0) enclosed++;
      }
      if (enclosed < 2) continue;
      this.addMob("zombie", x + 0.5, y, z + 0.5, 0);
      this.playSound("zombie");
      this.touch();
      break;
    }
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
    const filtered = filterChat(text);
    if (this.net) this.net.send({ t: "chat", text: filtered });
    else this.addChat(`<${this.cfg.settings.name}> ${filtered}`);
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
  itemCapacity(id: number) {
    return this.inv.reduce((n, slot) => n + (!slot ? 64 : slot.id === id ? 64 - slot.n : 0), 0);
  }
  craft(outputId: number, outputCount: number, ingredients: [number, number][]) {
    if (this.net || this.gm !== "survival" || !BLOCKS[outputId] ||
      !Number.isInteger(outputCount) || outputCount < 1 || outputCount > 64 ||
      ingredients.some(([id, n]) => !Number.isInteger(id) || !Number.isInteger(n) || n < 1 || this.countItem(id) < n)) return false;
    const next = this.inv.map((slot) => slot ? { ...slot } : null);
    for (const [id, amount] of ingredients) {
      let remaining = amount;
      for (let i = 0; i < next.length && remaining > 0; i++) {
        const slot = next[i];
        if (!slot || slot.id !== id) continue;
        const used = Math.min(slot.n, remaining);
        slot.n -= used;
        remaining -= used;
        if (!slot.n) next[i] = null;
      }
    }
    let remaining = outputCount;
    for (const slot of next) {
      if (!slot || slot.id !== outputId || slot.n >= 64) continue;
      const added = Math.min(64 - slot.n, remaining);
      slot.n += added;
      remaining -= added;
      if (!remaining) break;
    }
    for (let i = 0; i < next.length && remaining > 0; i++) {
      if (next[i]) continue;
      const added = Math.min(64, remaining);
      next[i] = { id: outputId, n: added };
      remaining -= added;
    }
    if (remaining) return false;
    this.inv = next;
    this.save();
    this.touch();
    return true;
  }
  setSwordLevel(level: number) {
    this.swordLevel = Math.max(0, Math.min(3, level));
    this.sword = this.swordLevel > 0;
    this.net?.send({ t: "gear", swordLevel: this.swordLevel });
  }
  setArmor() {
    this.armor = true;
    this.net?.send({ t: "gear", armor: true });
  }
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
    let nx = 0, ny = 0, nz = 0, t = 0, prevT = 0;
    if (this.world.get(x, y, z) > 0) return null;
    for (let i = 0; i < 40; i++) {
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxD) return null;
      const id = this.world.get(x, y, z), height = BLOCKS[id]?.height ?? 1;
      if (id > 0) {
        if (height >= 1 || o.y + d.y * t <= y + height) return { x, y, z, nx, ny, nz, d: t };
        if (d.y < 0) {
          const top = (y + height - o.y) / d.y;
          if (top >= prevT && top <= t) return { x, y, z, nx: 0, ny: 1, nz: 0, d: top };
        }
      }
      prevT = t;
    }
    return null;
  }

  canEditLocal(x: number, y: number, z: number, b: number) {
    const old = this.world.get(x, y, z);
    if (y < 0 || y >= H) return false;
    if (this.isHub) return false;
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
    this.playSound("mine");
    if (this.gm === "survival") {
      const def = BLOCKS[id]!;
      const drop = def.drop !== undefined ? def.drop : id;
      const tier = BLOCKS[this.inv[this.sel]?.id || 0]?.toolTier || 0;
      const requiredTier = id === 3 ? 1 : id === 23 ? 2 : id === 22 || id === 24 ? 3 : id === 25 ? 4 : 0;
      if (drop > 0 && tier >= requiredTier && !this.net) this.spawnLocalDrop(drop, 1, x + 0.5, y + 0.35, z + 0.5, null, 0, (Math.random() - 0.5) * 1.4, 2.2, (Math.random() - 0.5) * 1.4);
    }
  }

  tryPlace() {
    const item = this.inv[this.sel];
    if (item?.id === 64 || item?.id === 65) {
      if (this.net || this.mode === "buildbattle") return;
      this.armorTier = BLOCKS[item.id]!.armorTier!;
      item.n--;
      if (item.n <= 0) this.inv[this.sel] = null;
      this.swing = 1; this.save(); this.touch();
      return;
    }
    if (item?.id === 66 || item?.id === 67) {
      if (this.net || this.mode === "buildbattle") return;
      const hit = this.raycast(this.reach);
      if (!hit) return;
      const x = hit.x + hit.nx, z = hit.z + hit.nz;
      let groundY = hit.y + hit.ny - 1;
      while (groundY >= 0 && this.world.get(x, groundY, z) === 0) groundY--;
      const y = groundY + 1;
      if (y <= 0 || y + 1 >= H || this.world.get(x, y, z) !== 0 || this.world.get(x, y + 1, z) !== 0) return;
      if (!this.addMob(item.id === 66 ? "chicken" : "cow", x + 0.5, y, z + 0.5, 0)) return;
      this.playSound(item.id === 66 ? "chicken" : "cow");
      if (this.gm === "survival") {
        item.n--;
        if (item.n <= 0) this.inv[this.sel] = null;
      }
      this.save(); this.touch();
      return;
    }
    if (item && BLOCKS[item.id]?.food) {
      if (this.hp < 20 && !this.dead) {
        this.hp = Math.min(20, this.hp + BLOCKS[item.id]!.food!);
        item.n--;
        if (item.n <= 0) this.inv[this.sel] = null;
        this.swing = 1; this.touch();
      }
      return;
    }
    if (item && BLOCKS[item.id]?.item) return;
    const h = this.raycast(this.reach);
    if (!h || !item) return;
    const px = h.x + h.nx, py = h.y + h.ny, pz = h.z + h.nz;
    if (this.world.get(px, py, pz) !== 0) return;
    if (px + 1 > this.pos.x - R && px < this.pos.x + R && pz + 1 > this.pos.z - R && pz < this.pos.z + R && py + 1 > this.pos.y && py < this.pos.y + HGT) return;
    if (!this.canEditLocal(px, py, pz, item.id)) return;
    this.setBlock(px, py, pz, item.id);
    this.playSound("place");
    if (item.id === 55 && !this.net) this.localTnt.set(px + "," + py + "," + pz, 3);
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
    if (!this.net) {
      if (this.dead || this.spec || this.hitCd > 0) return;
      const origin = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z), direction = this.dir();
      const block = this.raycast(4.5);
      let target = -1, distance = block?.d ?? 4.5;
      this.mobs.forEach((mob, index) => {
        const center = mob.group.position.clone().add(new THREE.Vector3(0, 0.6, 0));
        const along = center.sub(origin).dot(direction);
        if (along < 0 || along >= distance) return;
        const point = origin.clone().addScaledVector(direction, along);
        if (point.distanceTo(mob.group.position.clone().add(new THREE.Vector3(0, 0.6, 0))) < 0.8) {
          target = index; distance = along;
        }
      });
      if (target >= 0) {
        const mob = this.mobs[target];
        mob.health--;
        mob.healthBack.visible = mob.healthFill.visible = true;
        const ratio = mob.health / mob.maxHealth;
        mob.healthFill.scale.x = ratio;
        mob.healthFill.position.x = -(1 - ratio) * 0.38;
        mob.flashTimer = 0.2;
        mob.group.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) {
            object.userData.baseColor ??= object.material.color.getHex();
            object.material.color.setHex(0xf44444);
          }
        });
        this.playSound("damage");
        if (mob.health <= 0) {
          this.mobs.splice(target, 1);
          this.scene.remove(mob.group);
          mob.group.traverse((object) => {
            if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
          });
          const loot = mob.kind === "chicken" ? 68 : mob.kind === "zombie" ? 84 : 69;
          this.spawnLocalDrop(loot, 1, mob.x, mob.y + 0.5, mob.z, null, 0, 0, 1.5, 0);
        }
        this.save();
        this.hitCd = 0.35;
        this.touch();
      }
      return;
    }
    if (!this.st || this.spec || this.dead || !isPvp(this.mode!) || this.st.phase !== "playing" || this.hitCd > 0) return;
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
    if (best) { this.net.send({ t: "hit", target: best, dmg: 2 + this.swordLevel * 2 }); this.hitCd = 0.5; }
  }

  // ---------- Health ----------
  hurt(n: number, dir?: number[]) {
    if (this.gm === "creative" || this.dead || this.spec) return;
    if (this.net && this.st && this.st.phase !== "playing") return;
    this.playSound("hit");
    this.hp -= n * (this.armor ? 0.6 : this.armorTier > 0 ? Math.max(0.35, 1 - this.armorTier * 0.12) : 1);
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
    if (!this.keepInv && this.gm === "survival") { this.clearInv(); this.armorTier = 0; }
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
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const id = this.world.get(x, y, z), height = BLOCKS[id]?.height ?? 1;
      if (id > 0 && !BLOCKS[id]?.plant && py < y + height && py + HGT > y && !(this.isHub && isHubPortalOpening(x, y, z))) return true;
    }
    return false;
  }

  private step(dt: number) {
    const active = this.locked && !this.dead;
    const k = this.keys;
    const controls = this.cfg.settings.controls;
    let fx = 0, fz = 0;
    if (active) {
      if (k.has(controls.forward)) fz -= 1; if (k.has(controls.back)) fz += 1;
      if (k.has(controls.left)) fx -= 1; if (k.has(controls.right)) fx += 1;
      fx += this.gamepadMove[0]; fz += this.gamepadMove[1];
    }
    const l = Math.hypot(fx, fz);
    if (l > 0) { fx /= l; fz /= l; }
    const sprint = this.gamepadSprint || k.has(controls.sprint) || (controls.sprint === "ControlLeft" && k.has("ControlRight"));
    const sneak = (this.gamepadSneak || k.has(controls.sneak) || (controls.sneak === "ShiftLeft" && k.has("ShiftRight"))) && !this.flying;
    const speed = this.flying ? (sprint ? 22 : 11) : sneak ? 2.2 : sprint ? 5.8 : 4.3;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const tx = (fx * c + fz * s) * speed, tz = (-fx * s + fz * c) * speed;
    const a = 1 - Math.exp(-dt * (this.onGround || this.flying ? 18 : 5));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;
    const noclip = this.spec;
    if (this.flying) {
      const up = active ? (k.has(controls.jump) || this.gamepadJump ? 1 : 0) - (k.has(controls.sneak) || this.gamepadSneak ? 1 : 0) : 0;
      this.vel.y += (up * (sprint ? 14 : 8) - this.vel.y) * (1 - Math.exp(-dt * 10));
    } else {
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -55);
      if (active && (k.has(controls.jump) || this.gamepadJump) && this.onGround) {
        this.vel.y = JUMP_VELOCITY; this.onGround = false; this.playSound("jump");
      }
    }
    if (!noclip && this.hits(this.pos.x, this.pos.y, this.pos.z)) this.pos.y += 0.25;
    const nx = this.pos.x + this.vel.x * dt;
    if (!noclip && this.hits(nx, this.pos.y, this.pos.z)) this.vel.x = 0; else this.pos.x = nx;
    const nz = this.pos.z + this.vel.z * dt;
    if (!noclip && this.hits(this.pos.x, this.pos.y, nz)) this.vel.z = 0; else this.pos.z = nz;
    const ny = this.pos.y + this.vel.y * dt;
    const wasGround = this.onGround;
    if (!noclip && this.hits(this.pos.x, ny, this.pos.z)) {
      if (this.vel.y < 0) {
        let surface = ny;
        const x0 = Math.floor(this.pos.x - R), x1 = Math.floor(this.pos.x + R - 1e-4);
        const z0 = Math.floor(this.pos.z - R), z1 = Math.floor(this.pos.z + R - 1e-4);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          for (let y = Math.floor(this.pos.y); y >= Math.floor(ny); y--) {
            const id = this.world.get(x, y, z), top = y + (BLOCKS[id]?.height ?? 1);
            if (id > 0 && top <= this.pos.y + 0.01 && top >= ny - 0.01) surface = Math.max(surface, top);
          }
        }
        this.pos.y = surface; this.onGround = true;
      } else this.pos.y = Math.floor(ny + HGT) - HGT - 0.001;
      this.vel.y = 0;
    } else { this.pos.y = ny; this.onGround = false; }
    if (this.onGround || this.flying) {
      if (this.onGround && !wasGround && !this.flying) {
        this.playSound("land");
        const dist = this.fallY - this.pos.y;
        const noFall = this.mode === "dropper" || this.mode === "buildbattle";
        if (dist > 3.2 && !noFall && this.gm === "survival") this.hurt(Math.floor(dist - 3));
      }
      this.fallY = this.pos.y;
    } else this.fallY = Math.max(this.fallY, this.pos.y);
    this.stepSoundTimer -= dt;
    if (this.onGround && active && l > 0 && this.stepSoundTimer <= 0) {
      this.playSound("step");
      this.stepSoundTimer = sprint ? 0.28 : 0.4;
    }
    if (this.isHub && !this.hubPortalMode && this.pos.y >= 60 && this.pos.y < 64) {
      const mode = hubPortalAt(this.pos.x, this.pos.z);
      if (mode) {
        this.hubPortalMode = mode;
        this.net?.send({ t: "hub.queue.leave" });
        this.cfg.onHubPortal(mode);
      }
    }
  }

  // ---------- Net ----------
  private onNet(m: any) {
    switch (m.t) {
      case "welcome":
        this.myId = m.id; this.st = m.state;
        if (this.mode === "buildbattle" && this.st?.walls) this.setBuildBattleWalls(true);
        for (let i = 0; i + 3 < m.edits.length; i += 4) this.world.set(m.edits[i], m.edits[i + 1], m.edits[i + 2], m.edits[i + 3]);
        this.setDrops(m.drops || []);
        for (const [id, skin] of m.skins || []) this.setRemoteSkin(id, skin);
        break;
      case "state": {
        const wallsChanged = this.st?.walls !== m.state?.walls;
        this.st = m.state;
        if (this.mode === "buildbattle" && wallsChanged) this.setBuildBattleWalls(!!this.st?.walls);
        const me = this.st!.players[this.myId];
        if (me) this.team = me.team;
        this.remotes.forEach((_r, id) => { if (!this.st!.players[id]) this.removeRemote(id); });
        this.touch();
        break;
      }
      case "drops":
        this.pickupRequests.clear();
        this.setDrops(m.drops || []);
        break;
      case "drop.pickup":
        if (m.player === this.myId) {
          if (this.mode === "bedwars" && m.id === 23) this.res.iron += m.n;
          else if (this.mode === "bedwars" && m.id === 22) this.res.gold += m.n;
          else this.addItem(m.id, m.n);
          this.playSound("pickup");
          this.touch();
        }
        break;
      case "skin":
        this.setRemoteSkin(m.id, m.skin);
        break;
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
      case "hub.return": this.cfg.onReturnHub(); break;
      case "hub.queue.state":
        this.hubQueue = { mode: m.mode, variant: m.variant, count: m.count, need: m.need };
        this.touch();
        break;
      case "hub.queue.error":
        this.hubQueueError = m.reason === "portal" ? tr("hub.portalRequired") : tr("hub.queueError");
        this.touch();
        break;
      case "hub.match":
        if (this.isHub && HUB_PORTALS.some((portal) => portal.mode === m.mode) && (m.variant === "solo" || m.variant === "duo") && typeof m.matchId === "string") {
          this.hubQueue = null;
          this.cfg.onHubMatch(m.mode, m.variant, m.matchId);
        }
        break;
      case "go": {
        this.pos.set(m.pos[0], m.pos[1], m.pos[2]); this.vel.set(0, 0, 0); this.fallY = this.pos.y;
        this.dropperFinished = false;
        this.dead = false; if (m.heal) this.hp = 20;
        this.gm = m.gm; this.spec = !!m.spec; this.flying = !!m.fly; this.team = m.team;
        if (m.clear) { this.clearInv(); this.res = { iron: 0, gold: 0 }; this.sword = false; this.swordLevel = 0; this.armor = false; }
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
    const armorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.29), new THREE.MeshBasicMaterial({ color: 0xbec8d4 }));
    armorMesh.position.y = 1.12; armorMesh.visible = !!ps?.armor; group.add(armorMesh);
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
    sp.scale.set(2, 0.5, 1); sp.position.y = 2.3; sp.renderOrder = 10;
    group.add(sp);
    this.scene.add(group);
    r = { id, group, target: new THREE.Vector3(), yaw: 0, body, armorMesh, name: "", team: -9, skin: "" };
    (r as any).sprite = sp; (r as any).cv = cv;
    group.position.set(0, -100, 0);
    (r as any).fresh = true;
    this.remotes.set(id, r);
    const skin = this.remoteSkins.get(id);
    if (skin) this.applyRemoteSkin(r, skin);
    void ps;
    return r;
  }

  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.group);
    const material = r.body.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    this.remotes.delete(id);
  }

  private setRemoteSkin(id: string, skin: string) {
    if (typeof id !== "string") return;
    if (!isSkinSelection(skin)) {
      this.remoteSkins.delete(id);
      const remote = this.remotes.get(id);
      if (remote) {
        remote.skin = "";
        const material = remote.body.material as THREE.MeshBasicMaterial;
        material.map?.dispose(); material.map = null; material.needsUpdate = true;
        material.color.set(remote.team >= 0 ? teamColor(remote.team) : "#888888");
      }
      return;
    }
    this.remoteSkins.set(id, skin);
    const remote = this.remotes.get(id);
    if (remote) this.applyRemoteSkin(remote, skin);
  }

  private applyRemoteSkin(remote: Remote, skin: string) {
    if (remote.skin === skin) return;
    remote.skin = skin;
    const colors: Record<string, number> = {
      "preset:classic": 0x4b75a8, "preset:emerald": 0x42a36a, "preset:ocean": 0x35a5b8,
      "preset:sunset": 0xe8754a, "preset:violet": 0x9162b5,
    };
    const color = colors[skin];
    if (!color) return;
    const material = remote.body.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = null;
    material.color.setHex(color);
    material.needsUpdate = true;
  }

  private setBuildBattleWalls(visible: boolean) {
    for (const [x, y, z] of buildBattleWallBlocks()) this.world.set(x, y, z, visible ? 17 : 0);
  }

  private syncRemotes(dt: number) {
    this.remotes.forEach((r) => {
      const ps = this.st?.players[r.id];
      if (!ps) return;
      if ((r as any).fresh) { r.group.position.copy(r.target); (r as any).fresh = false; }
      if (ps.name !== r.name || ps.team !== r.team) {
        r.name = ps.name; r.team = ps.team;
        if (!r.skin) (r.body.material as THREE.MeshBasicMaterial).color.set(ps.team >= 0 ? teamColor(ps.team) : "#888888");
        const cv = (r as any).cv as HTMLCanvasElement, ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 12, 256, 40);
        ctx.fillStyle = ps.team >= 0 ? teamColor(ps.team) : "#fff"; ctx.font = "bold 30px monospace"; ctx.textAlign = "center";
        ctx.fillText(ps.name, 128, 43);
        ((r as any).sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
      }
      r.armorMesh.visible = !!ps.armor;
      r.group.visible = !ps.spec &&
        !(this.mode === "buildbattle" && this.st?.phase === "playing" && ps.team !== this.team);
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
    this.pollGamepad(dt);
    if (!this.frozen) {
      const n = Math.ceil(dt / 0.02), h = dt / n;
      for (let i = 0; i < n; i++) this.step(h);
      if (this.pos.y < -20 && !this.dead) {
        if (this.mode === "dropper") { if (!this.dropperFinished && this.failCd <= 0) { this.failCd = 1.2; this.net!.send({ t: "fail" }); } }
        else this.die();
      }

      if (this.mode === "dropper" && this.st?.phase === "playing" && !this.dropperFinished &&
        this.onGround && this.pos.y < DROP_TOP - 3 && !this.dead && this.failCd <= 0) {
        this.failCd = 1.2;
        this.net!.send({ t: this.pos.y < 12 ? "finish" : "fail" });
        if (this.pos.y < 12) this.dropperFinished = true;
      }
      this.updateMining(dt);
      this.updateDropPickups();
      this.updateMobs(dt);
      this.trySpawnCaveZombie(dt);
      this.updateDrops(dt);
    }
    this.failCd -= dt; this.hitCd -= dt; this.hurtT = Math.max(0, this.hurtT - dt);
    this.swing = Math.max(0, this.swing - dt * 5);
    if (this.dead && !this.net) { this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(); }
    if (this.dead && this.net && this.deadWait > 0) { this.deadWait -= dt; }

    // Regeneration
    if (this.gm === "survival" && !this.dead && this.hp < 20 && !this.spec) { this.hp = Math.min(20, this.hp + dt * 0.25); }
    // Time
    if (this.daylight && !this.net) this.time = (this.time + dt * 20) % 24000;
    this.updateSky();
    // Camera
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const targetFov = this.cfg.settings.fov * (this.zoomed ? 1 - this.zoomLevel * 0.92 : 1);
    this.zoomFov += (targetFov - this.zoomFov) * (1 - Math.exp(-dt * 14));
    if (Math.abs(this.camera.fov - this.zoomFov) > 0.01) { this.camera.fov = this.zoomFov; this.camera.updateProjectionMatrix(); }
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
    if (!this.net) {
      for (const [key, fuse] of this.localTnt) {
        const next = fuse - dt;
        if (next > 0) { this.localTnt.set(key, next); continue; }
        this.localTnt.delete(key);
        const [x, y, z] = key.split(",").map(Number);
        if (this.world.get(x, y, z) !== 55) continue;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dy * dy + dz * dz > 6) continue;
          const bx = x + dx, by = y + dy, bz = z + dz;
          if (this.world.get(bx, by, bz) !== 11) this.setBlock(bx, by, bz, 0);
        }
      }
    }
    this.uiAcc += dt;
    if (this.uiAcc > 0.12) { this.uiAcc = 0; this.touch(); }
  }

  private pollGamepad(dt: number) {
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
    this.controllerAttached = !!pad;
    if (!pad) {
      this.gamepadMove = [0, 0]; this.gamepadLook = [0, 0];
      this.gamepadJump = this.gamepadSprint = this.gamepadSneak = this.gamepadAttack = this.gamepadPlace = false;
      this.previousGamepadButtons = [];
      return;
    }
    const pressed = (index: number) => !!pad.buttons[index]?.pressed;
    const edge = (index: number) => pressed(index) && !this.previousGamepadButtons[index];
    if (!this.locked) {
      if (edge(0)) {
        const buttons = Array.from(document.querySelectorAll<HTMLElement>("button:not(:disabled)"));
        const active = document.activeElement;
        const next = buttons.indexOf(active as HTMLElement);
        buttons[(next + 1 + buttons.length) % buttons.length]?.click();
      }
      if (edge(12) || edge(13)) {
        const buttons = Array.from(document.querySelectorAll<HTMLElement>("button:not(:disabled)"));
        const current = buttons.indexOf(document.activeElement as HTMLElement);
        const delta = edge(13) ? 1 : -1;
        buttons[(current + delta + buttons.length) % buttons.length]?.focus();
      }
      this.previousGamepadButtons = pad.buttons.map((button) => button.pressed);
      return;
    }
    this.gamepadMove = [Math.abs(pad.axes[0] || 0) > 0.16 ? pad.axes[0] : 0, Math.abs(pad.axes[1] || 0) > 0.16 ? pad.axes[1] : 0];
    this.gamepadLook = [Math.abs(pad.axes[2] || 0) > 0.16 ? pad.axes[2] : 0, Math.abs(pad.axes[3] || 0) > 0.16 ? pad.axes[3] : 0];
    this.yaw -= this.gamepadLook[0] * dt * 2.4;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + this.gamepadLook[1] * dt * 2.4));
    this.gamepadJump = pressed(0);
    this.gamepadSneak = pressed(6);
    this.gamepadSprint = pressed(7);
    this.gamepadAttack = pressed(2);
    this.gamepadPlace = pressed(3);
    if (edge(2)) this.attack();
    if (edge(4)) this.dropHeld();
    if (edge(1)) window.dispatchEvent(new KeyboardEvent("keydown", { code: this.cfg.settings.controls.inventory }));
    if (edge(5)) window.dispatchEvent(new KeyboardEvent("keydown", { code: this.cfg.settings.controls.shop }));
    if (edge(9)) this.releaseInput();
    this.previousGamepadButtons = pad.buttons.map((button) => button.pressed);
  }

  private updateMining(dt: number) {
    this.placeCd -= dt;
    const can = this.locked && !this.dead && !this.spec;
    const breaking = this.mouse.l || this.gamepadAttack;
    if (this.gm === "creative") {
      if (!breaking) this.creativeBreakCooldown = 0;
      else this.creativeBreakCooldown = Math.max(0, this.creativeBreakCooldown - dt);
    } else this.creativeBreakCooldown = 0;
    let target: ReturnType<Engine["raycast"]> = null;
    if (can) target = this.raycast(this.reach);
    this.selBox.visible = !!target;
    if (target) this.selBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    if (can && (this.mouse.r || this.gamepadPlace) && this.placeCd <= 0) { this.tryPlace(); this.placeCd = 0.22; }
    if (!can || (!this.mouse.l && !this.gamepadAttack) || !target) { this.mining = null; this.crack.visible = false; return; }
    const m = this.mining;
    if (!m || m.x !== target.x || m.y !== target.y || m.z !== target.z) this.mining = { x: target.x, y: target.y, z: target.z, p: 0 };
    const mi = this.mining!;
    const def = BLOCKS[this.world.get(mi.x, mi.y, mi.z)];
    if (!def || def.hard < 0 || !this.canEditLocal(mi.x, mi.y, mi.z, 0)) { this.crack.visible = false; return; }
    if (this.gm === "creative") {
      if (this.creativeBreakCooldown <= 0) {
        this.breakBlock(mi.x, mi.y, mi.z);
        this.creativeBreakCooldown = 0.3;
      }
      this.crack.visible = false;
    } else {
      const heldId = this.inv[this.sel]?.id;
      const toolTier = BLOCKS[heldId || 0]?.toolTier || 0;
      mi.p += dt * (toolTier ? 1 + toolTier * 0.7 : 1) / (def.hard * (this.net ? 0.6 : 1));
      this.swing = (this.swing + dt * 2.8) % 1;
      this.crack.visible = true;
      this.crack.position.set(mi.x + 0.5, mi.y + 0.5, mi.z + 0.5);
      this.crack.scale.setScalar(1 + Math.min(0.08, mi.p * 0.08));
      (this.crack.material as THREE.MeshBasicMaterial).opacity = Math.min(0.78, mi.p * 0.78);
      this.mineSoundTimer -= dt;
      if (this.mineSoundTimer <= 0) { this.mineSoundTimer = 0.28; this.playSound("mine"); }
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
      edits: this.world.editList(), mobs: this.mobs.map(({ kind, x, y, z, yaw, health }) => ({ kind, x, y, z, yaw, health })),
      armorTier: this.armorTier, lastPlayed: Date.now(),
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
