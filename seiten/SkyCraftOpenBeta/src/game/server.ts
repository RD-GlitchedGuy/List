import {
  BB_C, KITS, LOBBY, Mode, OB_X, THEMES, Variant, capacity, inPlot, isPvp, minPlayers, oneblockNext, serverBlock,
  spawnFor, teamCount, teamSize, DROP_TOP,
} from "./maps";

export interface PState { id: string; name: string; team: number; alive: boolean; spec: boolean; kills: number; fails: number; done: boolean }
export type Phase = "lobby" | "countdown" | "playing" | "voting" | "ended";
export interface GState {
  mode: Mode; variant: Variant; phase: Phase; timer: number; players: Record<string, PState>;
  beds: boolean[]; theme: string; viewPlot: number; winner: number; counts: number[]; need: number; startTeams: number;
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
  if (place && old !== 0) return false;
  if (!place && (old === 0 || old === 11)) return false;
  switch (st.mode) {
    case "dropper": return false;
    case "oneblock": return true;
    case "bedwars":
      if (st.phase !== "playing") return false;
      if (!place) {
        if (old >= 18 && old <= 21) return old - 18 !== me.team;
        return placed.has(x + "," + y + "," + z);
      }
      return y < 80;
    case "skywars": return st.phase === "playing";
    case "buildbattle": return st.phase === "playing" && inPlot(me.team, x, y, z);
  }
  return false;
}

export class GameServer {
  st: GState;
  edits = new Map<string, number[]>();
  placed = new Set<string>();
  pos = new Map<string, number[]>();
  lastHit = new Map<string, { from: string; t: number }>();
  resp = new Map<string, number>();
  votes: Record<number, Record<string, number>> = {};
  plotOrder: number[] = [];
  plotIdx = 0;
  viewT = 0;
  forced = false;
  dirty = true;
  acc = 0;

  constructor(public net: NetLike, public mode: Mode, public variant: Variant) {
    this.st = {
      mode, variant, phase: mode === "oneblock" ? "playing" : "lobby", timer: 0, players: {}, beds: [], theme: "", viewPlot: -1,
      winner: -1, counts: new Array(8).fill(0), need: minPlayers(mode, variant), startTeams: 0,
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
    if (this.mode === "oneblock") return this.go(p, { pos: spawnFor("oneblock", p.team), clear: false, ...extra });
    this.go(p, { clear: true, ...extra });
  }

  join(id: string, name: string): boolean {
    if (Object.keys(this.players).length >= capacity(this.mode, this.variant)) {
      this.net.sendTo(id, { t: "kick", key: "srv.full" });
      return false;
    }
    const spec = this.mode !== "oneblock" && this.st.phase !== "lobby" && this.st.phase !== "countdown";
    const p: PState = { id, name: name.slice(0, 16), team: spec ? -1 : this.pickTeam(), alive: !spec, spec, kills: 0, fails: 0, done: false };
    this.players[id] = p;
    this.net.sendTo(id, { t: "welcome", id, state: this.st, edits: [...this.edits.values()].flat() });
    if (spec) this.go(p, { pos: [0.5, 72, 0.5], spec: true, fly: true, gm: "creative" });
    else this.homeGo(p);
    this.sys("srv.joined", [p.name]);
    this.mark();
    return true;
  }

  leave(id: string) {
    const p = this.players[id];
    if (!p) return;
    delete this.players[id];
    this.pos.delete(id);
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
    if (!p || !m) return;
    switch (m.t) {
      case "pos": this.pos.set(from, [m.x, m.y, m.z, m.yaw, m.pitch]); break;
      case "chat": {
        const text = String(m.text || "").slice(0, 200);
        if (text) this.net.broadcast({ t: "chat", name: p.name, text, team: p.team });
        break;
      }
      case "set": {
        const { x, y, z, b } = m;
        if (![x, y, z, b].every(Number.isInteger)) return;
        const old = this.block(x, y, z);
        if (!canEdit(this.st, p, x, y, z, b, old, this.placed)) {
          this.net.sendTo(from, { t: "set", x, y, z, b: old });
          return;
        }
        const key = x + "," + y + "," + z;
        if (b) this.placed.add(key); else this.placed.delete(key);
        this.apply(x, y, z, b);
        if (this.mode === "bedwars" && !b && old >= 18 && old <= 21) {
          this.st.beds[old - 18] = false;
          this.sys("srv.bed", [{ team: old - 18 }, p.name]);
          this.title("title.bed", [{ team: old - 18 }]);
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
        if (this.st.phase === "lobby" && this.mode !== "oneblock") {
          this.forced = true; this.st.phase = "countdown"; this.st.timer = 5; this.mark();
          this.sys("srv.forced", [p.name]);
        }
        break;
      case "died": this.died(p); break;
      case "hit": {
        const t = this.players[m.target];
        if (this.st.phase !== "playing" || !isPvp(this.mode) || !t || !p.alive || !t.alive || t.team === p.team || p.spec) return;
        const a = this.pos.get(from), b = this.pos.get(t.id);
        if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 6.5) return;
        const amount = Math.max(1, Math.min(9, Number(m.dmg) || 1));
        const d = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        this.lastHit.set(t.id, { from, t: Date.now() });
        this.net.sendTo(t.id, { t: "damage", amount, from, dir: [(b[0] - a[0]) / d, (b[2] - a[2]) / d] });
        break;
      }
      case "vote":
        if (this.st.phase === "voting" && m.plot === this.st.viewPlot && p.team !== m.plot && m.score >= 1 && m.score <= 5) {
          (this.votes[m.plot] ||= {})[from] = m.score;
        }
        break;
      case "fail":
        if (this.mode === "dropper" && this.st.phase === "playing" && !p.done) {
          p.fails++;
          this.go(p, { pos: spawnFor("dropper", 0), heal: true });
          this.mark();
        }
        break;
      case "finish":
        if (this.mode === "dropper" && this.st.phase === "playing" && !p.done) {
          p.done = true;
          this.sys("srv.finish", [p.name]);
          this.mark();
          const mates = Object.values(this.players).filter((q) => q.team === p.team && !q.spec);
          if (mates.every((q) => q.done)) this.end(p.team);
        }
        break;
    }
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

  startGame() {
    const st = this.st;
    st.phase = "playing"; this.forced = false; st.viewPlot = -1; st.winner = -1;
    const ps = Object.values(this.players);
    st.startTeams = new Set(ps.map((p) => p.team)).size;
    st.beds = [false, false, false, false];
    ps.forEach((p) => { st.beds[p.team % 4] = true; p.alive = true; p.spec = false; p.done = false; p.fails = 0; p.kills = 0; });
    st.timer = this.mode === "bedwars" ? 900 : this.mode === "skywars" ? 600 : this.mode === "buildbattle" ? 150 : 240;
    if (this.mode === "buildbattle") st.theme = THEMES[Math.floor(Math.random() * THEMES.length)];
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
    this.edits.clear(); this.placed.clear(); this.resp.clear(); this.lastHit.clear();
    this.net.broadcast({ t: "reset" });
    const ps = Object.values(this.players);
    ps.forEach((p) => (p.team = -1));
    ps.forEach((p) => { p.team = this.pickTeam(); p.alive = true; p.spec = false; p.done = false; p.fails = 0; p.kills = 0; });
    Object.assign(this.st, { phase: "lobby", beds: [], timer: 0, viewPlot: -1, winner: -1, startTeams: 0, theme: "" });
    ps.forEach((p) => this.go(p, { clear: true }));
    this.mark();
  }

  tick(dt: number) {
    const st = this.st, n = Object.keys(this.players).length;
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
        if (this.mode !== "oneblock" && n >= st.need) { st.phase = "countdown"; st.timer = 10; this.mark(); }
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
        if (st.timer <= 0) this.reset();
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
