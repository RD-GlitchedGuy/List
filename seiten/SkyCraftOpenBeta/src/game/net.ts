import Peer, { DataConnection } from "peerjs";
import { GameServer } from "./server";
import type { Mode, Variant } from "./maps";

/**
 * Jeder "Server" hat eine feste PeerJS-ID. Der erste Spieler, der diese ID
 * registrieren kann, wird automatisch Host (führt die Spiellogik aus),
 * alle weiteren Spieler verbinden sich per WebRTC mit ihm.
 */
export class Net {
  peer!: Peer;
  isHost = false;
  id = "";
  hostConn: DataConnection | null = null;
  conns = new Map<string, DataConnection>();
  server: GameServer | null = null;
  onMsg: (m: any) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private timer: any = null;
  closed = false;

  static serverId(mode: Mode, variant: Variant) { return `skycraft-v1-${mode}-${variant}`; }

  static async connect(mode: Mode, variant: Variant, tries = 0): Promise<Net> {
    const sid = Net.serverId(mode, variant);
    const net = new Net();
    const hostPeer = await new Promise<Peer | null>((res, rej) => {
      const p = new Peer(sid);
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; p.destroy(); rej(new Error("timeout")); } }, 12000);
      p.on("open", () => { if (!done) { done = true; clearTimeout(to); res(p); } });
      p.on("error", (e: any) => {
        if (done) return;
        done = true; clearTimeout(to); p.destroy();
        if (e.type === "unavailable-id") res(null); else rej(e);
      });
    });
    if (hostPeer) { net.setupHost(hostPeer, mode, variant); return net; }
    try {
      await net.setupClient(sid);
    } catch (e: any) {
      if (tries < 2 && e?.type === "peer-unavailable") {
        await new Promise((r) => setTimeout(r, 900));
        return Net.connect(mode, variant, tries + 1);
      }
      throw e;
    }
    return net;
  }

  private setupHost(peer: Peer, mode: Mode, variant: Variant) {
    this.isHost = true; this.peer = peer; this.id = peer.id;
    this.server = new GameServer(this, mode, variant);
    peer.on("connection", (conn) => {
      conn.on("data", (m: any) => {
        if (m?.t === "hello") {
          this.conns.set(conn.peer, conn);
          if (!this.server!.join(conn.peer, String(m.name || "Player"))) setTimeout(() => conn.close(), 400);
        } else this.server!.onMessage(conn.peer, m);
      });
      const gone = () => { if (this.conns.delete(conn.peer)) this.server?.leave(conn.peer); };
      conn.on("close", gone);
      conn.on("error", gone);
    });
    peer.on("error", () => { /* einzelne Verbindungsfehler ignorieren */ });
    this.timer = setInterval(() => this.server?.tick(0.1), 100);
  }

  private setupClient(sid: string): Promise<void> {
    return new Promise((res, rej) => {
      const p = new Peer();
      this.peer = p;
      let done = false;
      const fail = (e: any) => { if (!done) { done = true; clearTimeout(to); p.destroy(); rej(e); } };
      const to = setTimeout(() => fail(new Error("timeout")), 12000);
      p.on("error", (e: any) => { if (done) { this.finish("srv.closed"); } else fail(e); });
      p.on("open", (id) => {
        this.id = id;
        const conn = p.connect(sid, { reliable: true, serialization: "json" });
        conn.on("open", () => { if (!done) { done = true; clearTimeout(to); this.hostConn = conn; res(); } });
        conn.on("data", (m: any) => this.onMsg(m));
        conn.on("close", () => this.finish("srv.closed"));
        conn.on("error", () => this.finish("srv.closed"));
      });
    });
  }

  private finish(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.onClose(reason);
  }

  start(name: string) {
    if (this.isHost) this.server!.join(this.id, name);
    else this.hostConn?.send({ t: "hello", name });
  }

  send(m: any) {
    if (this.isHost) this.server?.onMessage(this.id, m);
    else if (this.hostConn?.open) this.hostConn.send(m);
  }

  broadcast(m: any) {
    this.conns.forEach((c) => { if (c.open) c.send(m); });
    this.onMsg(m);
  }

  sendTo(id: string, m: any) {
    if (id === this.id) this.onMsg(m);
    else { const c = this.conns.get(id); if (c?.open) c.send(m); }
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}
