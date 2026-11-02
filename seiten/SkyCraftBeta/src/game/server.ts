import {
  BB_C, BW_C, KITS, LOBBY, MODES, Mode, OB_X, THEMES, Variant, capacity, dropperSpawn, hubPortalAt, inPlot, isBuildBattleWall, isPvp, minPlayers, oneblockNext, serverBlock,
  spawnFor, teamCount, teamSize, DROP_TOP, DROP_LEVELS,
} from "./maps";
import { BLOCKS } from "./blocks";
import { isSkinSelection } from "./storage";
import { filterChat } from "./chatFilter";

export interface PState { id: string; name: string; team: number; alive: boolean; spec: boolean; kills: number; fails: number; done: boolean; dropLevel: number; armor?: boolean; swordLevel?: number }
export type Phase = "lobby" | "countdown" | "playing" | "voting" | "ended";
export interface GState {
  mode: Mode; variant: Variant; phase: Phase; timer: number; players: Record<string, PState>; hub: boolean;
  beds: boolean[]; theme: string; viewPlot: number; winner: number; counts: number[]; need: number; startTeams: number;
  buildMinutes: 1 | 5 | 10; buildVotes: Record<string, { minutes: 1 | 5 | 10; theme: string }>; walls: boolean;
}

export interface NetLike {
  id: string;
  broadcast(m: any): void;
  sendTo(id: string, m: any): void;
}

export function canEdit(st: GState, me: PState | undefined, x: number, y: number, z: number, b: number, old: number, placed: Set<string>): boolean {
  if (!me || me.spec) return false;
  if (y < 1 || y >= 92) return false;
  if (z >= 386 && z <= 414 && Math.abs(x) <= 14) return false;
  const place = b !== 0;
  if (place && BLOCKS[b]?.item) return false;
  if (place && old !== 0) return false;
  if (!place && (old === 0 || old === 11)) return false;
  switch (st.mode) {
    case "dropper": return false;
    case "oneblock": return st.phase === "playing";
    case "bedwars":
      if (st.phase !== "playing") return false;
      if (!place) {
        if (old >= 18 && old <= 21) return old - 18 !== me.team;
        return placed.has(x + "," + y + "," + z);
      }
      return y < 80;
    case "skywars": return st.phase === "playing";
    case "buildbattle": return st.phase === "playing" && inPlot(me.team, x, y, z) && !(st.walls && isBuildBattleWall(x, y, z));
  }
  return false;
}

export class GameServer {
  st: GState;
  edits = new Map<string, number[]>();
  placed = new Set<string>();
  pos = new Map<string, number[]>();
  skins = new Map<string, string>();
  lastHit = new Map<string, { from: string; t: number }>();
  resp = new Map<string, number>();
  votes: Record<number, Record<string, number>> = {};
  plotOrder: number[] = [];
  plotIdx = 0;
  viewT = 0;
  forced = false;
  hubReturned = false;
  queues = new Map<string, { mode: Mode; variant: Variant; players: string[] }>();
  queueByPlayer = new Map<string, string>();
  dirty = true;
  acc = 0;
  drops = new Map<string, { id: number; n: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; owner: string | null; availableAt: number }>();
  private nextDrop = 0;
  private tntFuses = new Map<string, number>();
  private ironGenerator = 0;
  private goldGenerator = 0;
  private dropMotion = 0;

  constructor(public net: NetLike, public mode: Mode, public variant: Variant, private isHub = false) {
    this.st = {
      mode, variant, phase: isHub || mode === "oneblock" ? "playing" : "lobby", timer: 0, players: {}, hub: isHub, beds: [], theme: "", viewPlot: -1,
      winner: -1, counts: new Array(8).fill(0), need: minPlayers(mode, variant), startTeams: 0,
      buildMinutes: 5, buildVotes: {}, walls: false,
    };
  }

  get players() { return this.st.players; }
  mark() { this.dirty = true; }
  sys(key: string, args: any[] = []) { this.net.broadcast({ t: "sys", key, args }); }
  title(key: string, args: any[] = []) { this.net.broadcast({ t: "title", key, args }); }

  block(x: number, y: number, z: number) {
    const e = this.edits.get(x + "," + y + "," + z);
    return e ? e[3] : serverBlock(this.mode, x, y, z);
  }

  pickTeam() {
    const n = teamCount(this.mode, this.variant), sz = teamSize(this.variant);
    for (let t = 0; t < n; t++) {
      if (Object.values(this.players).filter((p) => p.team === t).length < sz) return t;
    }
    return 0;
  }

  go(p: PState, opts: Partial<{ pos: number[]; gm: string; fly: boolean; spec: boolean; kit: [number, number][] | null; clear: boolean; heal: boolean }> = {}) {
    this.net.sendTo(p.id, { t: "go", team: p.team, pos: LOBBY && [LOBBY.x, LOBBY.y, LOBBY.z], gm: "survival", fly: false, spec: false, kit: null, clear: false, heal: true, ...opts });
  }

  homeGo(p: PState, extra: any = {}) {
    if (this.mode === "oneblock") {
      const pos = !this.isHub && this.st.phase === "playing" ? spawnFor("oneblock", p.team) : [LOBBY.x, LOBBY.y, LOBBY.z];
      return this.go(p, { pos, clear: false, ...extra });
    }
    this.go(p, { clear: true, ...extra });
  }

  join(id: string, name: string, skin = ""): boolean {
    const safeSkin = isSkinSelection(skin) && skin.startsWith("preset:") ? skin : "";
    const existing = this.players[id];
    if (existing) {
      existing.name = String(name).trim().slice(0, 16) || "Player";
      if (safeSkin) this.skins.set(id, safeSkin); else this.skins.delete(id);
      this.net.sendTo(id, { t: "welcome", id, state: this.st, edits: [...this.edits.values()].flat(), drops: [...this.drops.entries()], skins: [...this.skins.entries()] });
      this.net.broadcast({ t: "skin", id, skin: safeSkin });
      this.mark();
      return true;
    }
    if (!this.isHub && Object.keys(this.players).length >= capacity(this.mode, this.variant)) {
      this.net.sendTo(id, { t: "kick", key: "srv.full" });
      return false;
    }
    const spec = this.mode !== "oneblock" && this.st.phase !== "lobby" && this.st.phase !== "countdown";
    const p: PState = { id, name: String(name).trim().slice(0, 16) || "Player", team: spec ? -1 : this.pickTeam(), alive: !spec, spec, kills: 0, fails: 0, done: false, dropLevel: 0, armor: false, swordLevel: 0 };
    this.players[id] = p;
    if (safeSkin) this.skins.set(id, safeSkin);
    this.net.sendTo(id, { t: "welcome", id, state: this.st, edits: [...this.edits.values()].flat(), drops: [...this.drops.entries()], skins: [...this.skins.entries()] });
    this.net.broadcast({ t: "skin", id, skin: safeSkin });
    if (spec) this.go(p, { pos: [0.5, 72, 0.5], spec: true, fly: true, gm: "creative" });
    else this.homeGo(p);
    this.sys("srv.joined", [p.name]);
    this.mark();
    return true;
  }

  leave(id: string) {
    const p = this.players[id];
    if (!p) return;
    this.leaveQueue(id);
    delete this.players[id];
    this.pos.delete(id);
    this.skins.delete(id);
    this.net.broadcast({ t: "skin", id, skin: "" });
    this.resp.delete(id);
    this.sys("srv.left", [p.name]);
    this.mark();
    if (this.st.phase === "playing") this.checkWin();
    if (this.st.phase === "voting") this.plotOrder = this.plotOrder.filter((t) => Object.values(this.players).some((q) => q.team === t));
  }

  apply(x: number, y: number, z: number, b: number) {
    this.edits.set(x + "," + y + "," + z, [x, y, z, b]);
    this.net.broadcast({ t: "set", x, y, z, b });
  }

  onMessage(from: string, m: any) {
    const p = this.players[from];
    if (!p || !m || this.hubReturned) return;
    switch (m.t) {
      case "pos": this.pos.set(from, [m.x, m.y, m.z, m.yaw, m.pitch]); break;
      case "chat": {
        const text = filterChat(String(m.text || "").slice(0, 200));
        if (text) this.net.broadcast({ t: "chat", name: p.name, text, team: p.team });
        break;
      }
      case "set": {
        const { x, y, z, b } = m;
        if (![x, y, z, b].every(Number.isInteger) || (b !== 0 && (!BLOCKS[b] || BLOCKS[b]?.item))) return;
        const old = this.block(x, y, z);
        if (this.isHub || !canEdit(this.st, p, x, y, z, b, old, this.placed)) {
          this.net.sendTo(from, { t: "set", x, y, z, b: old });
          return;
        }
        const key = x + "," + y + "," + z;
        if (b) this.placed.add(key); else this.placed.delete(key);
        this.apply(x, y, z, b);
        if (!b && old > 0 && !(old >= 18 && old <= 21)) {
          const block = BLOCKS[old];
          const drop = block?.drop !== undefined ? block.drop : old;
          if (drop > 0) {
            this.spawnDrop(drop, x + 0.5, y + 0.5, z + 0.5, null, 2);
            this.broadcastDrops();
          }
        }
        if (b === 55) this.tntFuses.set(key, 3);
        if (this.mode === "bedwars" && !b && old >= 18 && old <= 21) {
          const team = old - 18, baseX = BW_C[team][0], baseZ = BW_C[team][1];
          this.st.beds[team] = false;
          for (const bedX of [baseX, baseX + 1]) {
            if (this.block(bedX, y, baseZ) === old) {
              this.placed.delete(bedX + "," + y + "," + baseZ);
              this.apply(bedX, y, baseZ, 0);
            }
          }
          this.sys("srv.bed", [{ team }, p.name]);
          this.title("title.bed", [{ team }]);
          this.mark();
        }
        if (this.mode === "oneblock" && !b && z === 0 && y === 50 && x >= 0 && x % OB_X === 0 && x / OB_X < 8) {
          const slot = x / OB_X;
          this.st.counts[slot]++;
          this.apply(x, y, z, oneblockNext(this.st.counts[slot], Math.random()));
          this.mark();
        }
        break;
      }
      case "start":
        if (!this.isHub && this.st.phase === "lobby") {
          this.forced = true; this.st.phase = "countdown"; this.st.timer = 5; this.mark();
          this.sys("srv.forced", [p.name]);
        }
        break;
      case "hub.queue.join": {
        if (!this.isHub || !MODES.includes(m.mode) || (m.variant !== "solo" && m.variant !== "duo")) return;
        const pos = this.pos.get(from);
        if (!pos || hubPortalAt(pos[0], pos[2]) !== m.mode) {
          this.net.sendTo(from, { t: "hub.queue.error", reason: "portal" });
          return;
        }
        this.leaveQueue(from);
        const key = `${m.mode}:${m.variant}`;
        let queue = this.queues.get(key);
        if (!queue) {
          queue = { mode: m.mode, variant: m.variant, players: [] };
          this.queues.set(key, queue);
        }
        queue.players.push(from);
        this.queueByPlayer.set(from, key);
        this.broadcastQueue(queue);
        const needed = minPlayers(queue.mode, queue.variant);
        while (queue.players.length >= needed) {
          const matchPlayers = queue.players.splice(0, needed);
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          const matchId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          matchPlayers.forEach((id) => {
            this.queueByPlayer.delete(id);
            this.net.sendTo(id, { t: "hub.match", mode: queue!.mode, variant: queue!.variant, matchId });
          });
          this.broadcastQueue(queue);
        }
        break;
      }
      case "hub.queue.leave": this.leaveQueue(from); break;
      case "hub.portal.cancel":
        if (this.isHub) {
          this.leaveQueue(from);
          this.go(p, { pos: [LOBBY.x, LOBBY.y, LOBBY.z], clear: false, heal: false });
        }
        break;
      case "hub": this.returnToHub(); break;
      case "died": this.died(p); break;
      case "hit": {
        const t = this.players[m.target];
        if (this.st.phase !== "playing" || !isPvp(this.mode) || !t || !p.alive || !t.alive || t.team === p.team || p.spec) return;
        const a = this.pos.get(from), b = this.pos.get(t.id);
        if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 6.5) return;
        const amount = Math.max(1, Math.min(12, Number(m.dmg) || 1));
        const d = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        this.lastHit.set(t.id, { from, t: Date.now() });
        this.net.sendTo(t.id, { t: "damage", amount, from, dir: [(b[0] - a[0]) / d, (b[2] - a[2]) / d] });
        break;
      }
      case "drop": {
        const item = Number(m.id), amount = Number(m.n);
        const pos = this.pos.get(from);
        if (!pos || !BLOCKS[item] || item === 11 || !Number.isInteger(amount) || amount < 1 || amount > 16 ||
          ![m.x, m.y, m.z].every(Number.isFinite) || Math.hypot(pos[0] - m.x, pos[1] - m.y, pos[2] - m.z) > 5) return;
        const now = Date.now(), availableAt = now + 3000;
        const yaw = pos[3] || 0;
        const vx = -Math.sin(yaw) * 2.2, vz = -Math.cos(yaw) * 2.2;
        let remaining = amount;
        for (const drop of this.drops.values()) {
          if (drop.id !== item || Math.hypot(drop.x - m.x, drop.y - m.y, drop.z - m.z) > 1 || drop.n >= 16 ||
            (drop.owner !== from && (drop.availableAt > now || availableAt > now))) continue;
          if (drop.owner !== from) continue;
          const moved = Math.min(16 - drop.n, remaining);
          drop.n += moved; remaining -= moved;
          if (drop.owner === from) drop.availableAt = Math.max(drop.availableAt, availableAt);
          if (!remaining) break;
        }
        while (remaining > 0) {
          const n = Math.min(16, remaining), id = `drop-${++this.nextDrop}`;
          this.drops.set(id, { id: item, n, x: m.x, y: m.y, z: m.z, vx, vy: 3.2, vz, owner: from, availableAt });
          remaining -= n;
        }
        this.broadcastDrops();
        break;
      }
      case "pickup": {
        const drop = this.drops.get(String(m.id)), pos = this.pos.get(from);
        if (!drop || !pos || (drop.owner === from && Date.now() < drop.availableAt) ||
          Math.hypot(pos[0] - drop.x, pos[1] - drop.y, pos[2] - drop.z) > 2) return;
        const capacity = Number(m.max);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64) return;
        const picked = Math.min(capacity, drop.n);
        drop.n -= picked;
        if (!drop.n) this.drops.delete(String(m.id));
        this.net.broadcast({ t: "drop.pickup", player: from, id: drop.id, n: picked });
        this.broadcastDrops();
        break;
      }
      case "gear":
        if (typeof m.armor === "boolean") p.armor = m.armor;
        if (Number.isInteger(m.swordLevel) && m.swordLevel >= 0 && m.swordLevel <= 3) p.swordLevel = m.swordLevel;
        this.mark();
        break;

      case "vote":
        if (this.st.phase === "voting" && m.plot === this.st.viewPlot && p.team !== m.plot && m.score >= 1 && m.score <= 5) {
          (this.votes[m.plot] ||= {})[from] = m.score;
        }
        break;
      case "bb.vote":
        if (this.mode === "buildbattle" && (this.st.phase === "lobby" || this.st.phase === "countdown") &&
          [1, 5, 10].includes(m.minutes) && THEMES.includes(m.theme)) {
          this.st.buildVotes[from] = { minutes: m.minutes, theme: m.theme };
          this.mark();
        }
        break;
      case "fail":
        if (this.mode === "dropper" && this.st.phase === "playing" && !p.done) {
          p.fails++;
          this.go(p, { pos: dropperSpawn(p.team, p.dropLevel), heal: true });
          this.mark();
        }
        break;
      case "finish":
        if (this.mode === "dropper" && this.st.phase === "playing" && !p.done) {
          if (p.dropLevel + 1 < DROP_LEVELS) {
            p.dropLevel++;
            this.go(p, { pos: dropperSpawn(p.team, p.dropLevel), heal: true });
            this.sys("srv.dropLevel", [p.name, p.dropLevel + 1]);
          } else {
            p.done = true;
            this.sys("srv.finish", [p.name]);
          }
          this.mark();
          const mates = Object.values(this.players).filter((q) => q.team === p.team && !q.spec);
          if (p.done && mates.every((q) => q.done)) this.end(p.team);
        }
        break;
    }
  }

  private broadcastQueue(queue: { mode: Mode; variant: Variant; players: string[] }) {
    this.net.broadcast({
      t: "hub.queue.state", mode: queue.mode, variant: queue.variant,
      count: queue.players.length, need: minPlayers(queue.mode, queue.variant),
    });
  }

  private leaveQueue(id: string) {
    const key = this.queueByPlayer.get(id);
    if (!key) return;
    this.queueByPlayer.delete(id);
    const queue = this.queues.get(key);
    if (!queue) return;
    queue.players = queue.players.filter((player) => player !== id);
    this.broadcastQueue(queue);
  }

  private broadcastDrops() {
    this.net.broadcast({ t: "drops", drops: [...this.drops.entries()] });
  }

  private spawnDrop(id: number, x: number, y: number, z: number, owner: string | null = null, vy = owner ? 3.2 : 0) {
    const stack = [...this.drops.entries()].find(([, drop]) =>
      drop.id === id && drop.owner === owner && drop.n < 16 && Math.hypot(drop.x - x, drop.y - y, drop.z - z) < 1
    );
    if (stack) { stack[1].n++; return; }
    const key = `drop-${++this.nextDrop}`;
    this.drops.set(key, { id, n: 1, x, y, z, vx: 0, vy, vz: 0, owner, availableAt: owner ? Date.now() + 3000 : 0 });
  }

  private updateDrops(dt: number) {
    let moved = false;
    for (const [key, drop] of this.drops) {
      if (drop.vy === 0 && drop.vx === 0 && drop.vz === 0) continue;
      drop.vy = Math.max(-18, drop.vy - 22 * dt);
      const nx = drop.x + drop.vx * dt, ny = drop.y + drop.vy * dt, nz = drop.z + drop.vz * dt;
      const floor = Math.floor(ny - 0.18);
      if (this.block(Math.floor(nx), floor, Math.floor(nz)) > 0) {
        drop.y = floor + 1.2;
        drop.vx *= 0.35; drop.vz *= 0.35;
        if (drop.vy < -1) drop.vy *= -0.18; else drop.vy = 0;
      } else {
        drop.x = nx; drop.y = ny; drop.z = nz;
      }
      if (drop.y < 0) this.drops.delete(key);
      moved = true;
    }
    if (moved) {
      this.dropMotion += dt;
      if (this.dropMotion >= 0.25) { this.dropMotion = 0; this.broadcastDrops(); }
    }
  }

  private tickGenerators(dt: number) {
    if (this.mode !== "bedwars" || this.st.phase !== "playing") return;
    this.ironGenerator += dt;
    this.goldGenerator += dt;
    let spawned = false;
    while (this.ironGenerator >= 0.8) {
      this.ironGenerator -= 0.8;
      for (const [x, z] of BW_C) { this.spawnDrop(23, x + 3.5, 51.2, z + 2.5); spawned = true; }
    }
    while (this.goldGenerator >= 6) {
      this.goldGenerator -= 6;
      for (const [x, z] of BW_C) { this.spawnDrop(22, x + 3.5, 51.2, z + 2.5); spawned = true; }
    }
    if (spawned) this.broadcastDrops();
  }

  private explodeTnt(x: number, y: number, z: number) {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      if (dx * dx + dy * dy + dz * dz > 6) continue;
      const bx = x + dx, by = y + dy, bz = z + dz, block = this.block(bx, by, bz);
      if (!block || block === 11) continue;
      this.placed.delete(bx + "," + by + "," + bz);
      this.tntFuses.delete(bx + "," + by + "," + bz);
      this.apply(bx, by, bz, 0);
      if (block >= 18 && block <= 21) {
        this.st.beds[block - 18] = false;
        this.sys("srv.bed", [{ team: block - 18 }, "TNT"]);
        this.mark();
      }
    }
    this.pos.forEach((position, id) => {
      if (Math.hypot(position[0] - (x + 0.5), position[1] - (y + 0.5), position[2] - (z + 0.5)) <= 4) {
        const p = this.players[id];
        if (!p?.alive || p.spec) return;
        const amount = Math.max(1, Math.floor(8 - Math.hypot(position[0] - x, position[1] - y, position[2] - z) * 1.5));
        this.net.sendTo(id, { t: "damage", amount, dir: [0, 0] });
      }
    });
  }

  died(p: PState) {
    if (this.resp.has(p.id)) return;
    if (this.st.phase !== "playing" || this.mode === "oneblock" || this.mode === "dropper" || this.mode === "buildbattle") {
      this.homeGo(p, this.st.phase === "playing" && this.mode !== "oneblock" ? { pos: spawnFor(this.mode, p.team), clear: false, gm: this.mode === "buildbattle" ? "creative" : "survival" } : {});
      if (this.st.phase === "playing" && this.mode === "dropper") this.go(p, { pos: spawnFor("dropper", 0) });
      return;
    }
    const h = this.lastHit.get(p.id);
    const killer = h && Date.now() - h.t < 10000 ? this.players[h.from] : null;
    if (killer && killer.id !== p.id) { killer.kills++; this.sys("srv.kill", [p.name, killer.name]); } else this.sys("srv.died", [p.name]);
    this.lastHit.delete(p.id);
    if (this.mode === "bedwars" && this.st.beds[p.team]) {
      this.resp.set(p.id, 3);
      this.net.sendTo(p.id, { t: "dead", wait: 3 });
    } else this.eliminate(p);
    this.mark();
  }

  eliminate(p: PState) {
    p.alive = false; p.spec = true;
    this.go(p, { pos: [0.5, 72, 0.5], spec: true, fly: true, gm: "creative" });
    this.sys("srv.out", [p.name]);
    this.mark();
    this.checkWin();
  }

  checkWin() {
    if (this.st.phase !== "playing" || !isPvp(this.mode)) return;
    const alive = new Set(Object.values(this.players).filter((p) => p.alive && !p.spec).map((p) => p.team));
    if (this.st.startTeams >= 2 && alive.size <= 1) this.end(alive.size === 1 ? [...alive][0] : -1);
  }

  end(winner: number) {
    this.st.phase = "ended"; this.st.timer = 10; this.st.winner = winner;
    if (winner >= 0) this.title("title.win", [{ team: winner }]); else this.title("title.draw");
    this.mark();
  }

  returnToHub() {
    if (this.isHub) return;
    if (this.hubReturned) return;
    this.hubReturned = true;
    this.net.broadcast({ t: "hub.return" });
  }

  startGame() {
    const st = this.st;
    st.phase = "playing"; this.forced = false; st.viewPlot = -1; st.winner = -1;
    const ps = Object.values(this.players);
    st.startTeams = new Set(ps.map((p) => p.team)).size;
    st.beds = [false, false, false, false];
    ps.forEach((p) => { st.beds[p.team % 4] = true; p.alive = true; p.spec = false; p.done = false; p.fails = 0; p.kills = 0; });
    ps.forEach((p) => { p.armor = false; p.swordLevel = 0; p.dropLevel = 0; });
    if (this.mode === "buildbattle") {
      st.buildMinutes = this.chooseBuildMinutes();
      st.timer = st.buildMinutes * 60;
      st.theme = this.chooseBuildTheme();
      st.walls = true;
    } else st.timer = this.mode === "bedwars" ? 900 : this.mode === "skywars" ? 600 : 240;
    this.votes = {};
    for (const p of ps) {
      this.go(p, {
        pos: spawnFor(this.mode, p.team), clear: true, kit: KITS[this.mode] || null,
        gm: this.mode === "buildbattle" ? "creative" : "survival",
      });
    }
    this.title("title.go", this.mode === "buildbattle" ? [st.theme] : []);
    this.mark();
  }

  startVoting() {
    this.st.phase = "voting";
    this.st.walls = false;
    this.plotOrder = [...new Set(Object.values(this.players).filter((p) => !p.spec).map((p) => p.team))];
    this.plotIdx = 0;
    this.showPlot();
  }

  showPlot() {
    if (this.plotIdx >= this.plotOrder.length) return this.finishVoting();
    const t = this.plotOrder[this.plotIdx];
    this.st.viewPlot = t; this.viewT = 10; this.st.timer = 10;
    const c = BB_C[t % 4];
    for (const p of Object.values(this.players)) this.go(p, { pos: [c[0] + 0.5, 56, c[1] + 11.5], gm: "creative", fly: true, spec: false });
    this.title("title.plot", [{ team: t }]);
    this.mark();
  }

  finishVoting() {
    let best = -1, bs = -1;
    for (const t of this.plotOrder) {
      const v = Object.values(this.votes[t] || {});
      const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      this.sys("srv.score", [{ team: t }, avg.toFixed(1)]);
      if (avg > bs) { bs = avg; best = t; }
    }
    this.end(best);
  }

  reset() {
    this.edits.clear(); this.placed.clear(); this.resp.clear(); this.lastHit.clear(); this.tntFuses.clear(); this.drops.clear();
    this.net.broadcast({ t: "reset" });
    this.broadcastDrops();
    const ps = Object.values(this.players);
    ps.forEach((p) => (p.team = -1));
    ps.forEach((p) => { p.team = this.pickTeam(); p.alive = true; p.spec = false; p.done = false; p.fails = 0; p.kills = 0; });
    Object.assign(this.st, { phase: "lobby", beds: [], timer: 0, viewPlot: -1, winner: -1, startTeams: 0, theme: "", walls: false, buildVotes: {} });
    ps.forEach((p) => this.go(p, { clear: true }));
    this.mark();
  }

  private chooseBuildMinutes(): 1 | 5 | 10 {
    const counts = new Map<number, number>();
    Object.keys(this.players).forEach((id) => {
      const minutes = this.st.buildVotes[id]?.minutes;
      if (minutes) counts.set(minutes, (counts.get(minutes) || 0) + 1);
    });
    const max = Math.max(0, ...counts.values());
    if (!max) return 5;
    const tied = [1, 5, 10].filter((minutes) => counts.get(minutes) === max);
    return tied.includes(5) ? 5 : tied[0] as 1 | 5 | 10;
  }

  private chooseBuildTheme(): string {
    const counts = new Map<string, number>();
    Object.keys(this.players).forEach((id) => {
      const theme = this.st.buildVotes[id]?.theme;
      if (theme) counts.set(theme, (counts.get(theme) || 0) + 1);
    });
    const max = Math.max(0, ...counts.values());
    if (!max) return THEMES[Math.floor(Math.random() * THEMES.length)];
    const tied = THEMES.filter((theme) => counts.get(theme) === max);
    return tied[Math.floor(Math.random() * tied.length)];
  }

  tick(dt: number) {
    if (this.hubReturned) return;
    const st = this.st, n = Object.keys(this.players).length;
    this.updateDrops(dt);
    this.tickGenerators(dt);
    for (const [key, fuse] of this.tntFuses) {
      const next = fuse - dt;
      if (next > 0) { this.tntFuses.set(key, next); continue; }
      this.tntFuses.delete(key);
      const [x, y, z] = key.split(",").map(Number);
      if (this.block(x, y, z) === 55) this.explodeTnt(x, y, z);
    }
    if (n > 1) {
      const list: any[] = [];
      this.pos.forEach((v, id) => list.push([id, ...v]));
      this.net.broadcast({ t: "pos", p: list });
    }
    for (const [id, left] of this.resp) {
      const r = left - dt;
      const p = this.players[id];
      if (r <= 0 || !p) {
        this.resp.delete(id);
        if (p) this.go(p, { pos: spawnFor(this.mode, p.team), heal: true });
      } else this.resp.set(id, r);
    }
    switch (st.phase) {
      case "lobby":
        if (n >= st.need) { st.phase = "countdown"; st.timer = 10; this.mark(); }
        break;
      case "countdown": {
        if (n < (this.forced ? 1 : st.need)) { st.phase = "lobby"; this.forced = false; this.mark(); break; }
        const before = Math.ceil(st.timer);
        st.timer -= dt;
        if (Math.ceil(st.timer) !== before) this.mark();
        if (st.timer <= 0) this.startGame();
        break;
      }
      case "playing": {
        if (this.mode === "oneblock") break;
        const before = Math.ceil(st.timer);
        st.timer -= dt;
        if (Math.ceil(st.timer) !== before) this.mark();
        if (st.timer <= 0) {
          if (this.mode === "buildbattle") this.startVoting(); else this.end(-1);
        }
        break;
      }
      case "voting": {
        this.viewT -= dt;
        const t = Math.ceil(this.viewT);
        if (t !== st.timer) { st.timer = t; this.mark(); }
        if (this.viewT <= 0) { this.plotIdx++; this.showPlot(); }
        break;
      }
      case "ended": {
        const before = Math.ceil(st.timer);
        st.timer -= dt;
        if (Math.ceil(st.timer) !== before) this.mark();
        if (st.timer <= 0) this.returnToHub();
        break;
      }
    }
    this.acc += dt;
    if (this.dirty || this.acc >= 1) {
      this.dirty = false; this.acc = 0;
      this.net.broadcast({ t: "state", state: st });
    }
  }
}

export { DROP_TOP };
