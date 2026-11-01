import type { Engine } from "./engine";
import { BLOCKS, parseBlock } from "./blocks";
import { H } from "./world";
import { t } from "../i18n";

const SERVER_CMDS = ["help", "list", "leave", "start", "me"];
const NOCHEAT_CMDS = ["help", "seed", "me", "say", "list"];
export const COMMAND_LIST = [
  "help", "gamemode", "gm", "tp", "give", "clear", "time", "weather", "seed", "setblock", "fill", "kill",
  "spawn", "setworldspawn", "spawnpoint", "say", "me", "gamerule", "fly", "heal", "list", "difficulty",
];

const rel = (s: string, base: number) => (s.startsWith("~") ? base + (parseFloat(s.slice(1)) || 0) : parseFloat(s));

export function runCommand(e: Engine, line: string) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const a = parts.slice(1);
  if (!cmd) return;
  e.addChat("/" + line.trim(), "#9ca3af");
  if (e.net) {
    if (!SERVER_CMDS.includes(cmd)) {
      e.addChat(COMMAND_LIST.includes(cmd) ? t("cmd.noop") : t("cmd.unknown", cmd), "#ff6666");
      return;
    }
  } else if (!e.cheats && !NOCHEAT_CMDS.includes(cmd)) {
    e.addChat(t("cmd.nocheats"), "#ff6666");
    return;
  }
  const err = (k: string, ...x: string[]) => e.addChat(t(k, ...x), "#ff6666");
  const ok = (k: string, ...x: (string | number)[]) => e.addChat(t(k, ...x), "#aaffaa");
  const p = e.pos;

  switch (cmd) {
    case "help": e.addChat(t("cmd.help") + " /" + (e.net ? SERVER_CMDS : COMMAND_LIST).join(", /"), "#ffd54a"); break;
    case "gamemode": case "gm": {
      const v = (a[0] || "").toLowerCase();
      if (["survival", "s", "0"].includes(v)) { e.setGM("survival"); ok("cmd.gm", t("gm.survival")); }
      else if (["creative", "c", "1"].includes(v)) { e.setGM("creative"); ok("cmd.gm", t("gm.creative")); }
      else err("cmd.usage", "/gamemode <survival|creative>");
      break;
    }
    case "tp": case "teleport": {
      if (a.length < 3) return err("cmd.usage", "/tp <x> <y> <z>");
      const x = rel(a[0], p.x), y = rel(a[1], p.y), z = rel(a[2], p.z);
      if ([x, y, z].some(isNaN)) return err("cmd.usage", "/tp <x> <y> <z>");
      e.teleport(x, y, z);
      ok("cmd.tp", x.toFixed(1), y.toFixed(1), z.toFixed(1));
      break;
    }
    case "give": {
      const args = a[0]?.startsWith("@") ? a.slice(1) : a;
      const id = args[0] ? parseBlock(args[0]) : null;
      if (!id) return err("cmd.badblock", args[0] || "?");
      const n = Math.max(1, Math.min(2304, parseInt(args[1] || "1", 10) || 1));
      e.addItem(id, n);
      ok("cmd.give", n, t("b." + BLOCKS[id]!.name));
      break;
    }
    case "clear": e.clearInv(); ok("cmd.clear"); break;
    case "time": {
      const sub = a[0], v = a[1];
      if (sub === "set" && v) {
        const names: Record<string, number> = { day: 1000, noon: 6000, sunset: 12500, night: 13000, midnight: 18000, sunrise: 23000 };
        const n = names[v] ?? parseInt(v, 10);
        if (isNaN(n)) return err("cmd.usage", "/time set <day|night|noon|midnight|0-24000>");
        e.time = ((n % 24000) + 24000) % 24000; ok("cmd.time", Math.floor(e.time));
      } else if (sub === "add" && v) {
        e.time = (((e.time + (parseInt(v, 10) || 0)) % 24000) + 24000) % 24000; ok("cmd.time", Math.floor(e.time));
      } else if (sub === "query") ok("cmd.time", Math.floor(e.time));
      else err("cmd.usage", "/time <set|add|query> ...");
      break;
    }
    case "weather": {
      const v = a[0];
      if (v === "clear") { e.weather = "clear"; ok("cmd.weather", t("weather.clear")); }
      else if (v === "rain" || v === "thunder") { e.weather = "rain"; ok("cmd.weather", t("weather.rain")); }
      else err("cmd.usage", "/weather <clear|rain|thunder>");
      break;
    }
    case "seed": ok("cmd.seed", e.seedText || "0"); break;
    case "setblock": {
      if (a.length < 4) return err("cmd.usage", "/setblock <x> <y> <z> <block>");
      const x = Math.floor(rel(a[0], p.x)), y = Math.floor(rel(a[1], p.y)), z = Math.floor(rel(a[2], p.z));
      const b = a[3] === "air" ? 0 : parseBlock(a[3]);
      if ([x, y, z].some(isNaN) || b === null) return err("cmd.badblock", a[3]);
      if (y < 0 || y >= H) return err("cmd.range");
      e.world.set(x, y, z, b);
      ok("cmd.setblock", x, y, z);
      break;
    }
    case "fill": {
      if (a.length < 7) return err("cmd.usage", "/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>");
      const v = [rel(a[0], p.x), rel(a[1], p.y), rel(a[2], p.z), rel(a[3], p.x), rel(a[4], p.y), rel(a[5], p.z)].map(Math.floor);
      const b = a[6] === "air" ? 0 : parseBlock(a[6]);
      if (v.some(isNaN) || b === null) return err("cmd.badblock", a[6]);
      const [x1, x2] = [Math.min(v[0], v[3]), Math.max(v[0], v[3])];
      const [y1, y2] = [Math.max(0, Math.min(v[1], v[4])), Math.min(H - 1, Math.max(v[1], v[4]))];
      const [z1, z2] = [Math.min(v[2], v[5]), Math.max(v[2], v[5])];
      const total = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
      if (total > 40000) return err("cmd.toobig");
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) e.world.set(x, y, z, b);
      ok("cmd.fill", total);
      break;
    }
    case "kill": e.hp = 0; e.die(); break;
    case "spawn": e.teleport(...e.spawn); ok("cmd.tp", e.spawn[0].toFixed(1), e.spawn[1].toFixed(1), e.spawn[2].toFixed(1)); break;
    case "setworldspawn": case "spawnpoint":
      e.spawn = [p.x, p.y, p.z]; ok("cmd.spawnset", p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)); break;
    case "say": e.addChat(`[${t("cmd.server")}] ${a.join(" ")}`, "#ffd54a"); break;
    case "me":
      if (e.net) e.net.send({ t: "chat", text: "* " + a.join(" ") });
      else e.addChat(`* ${e.cfg.settings.name} ${a.join(" ")}`); break;
    case "gamerule": {
      const r = (a[0] || "").toLowerCase(), v = a[1] === "true";
      if (r === "dodaylightcycle") { e.daylight = v; ok("cmd.rule", "doDaylightCycle", String(v)); }
      else if (r === "keepinventory") { e.keepInv = v; ok("cmd.rule", "keepInventory", String(v)); }
      else err("cmd.usage", "/gamerule <doDaylightCycle|keepInventory> <true|false>");
      break;
    }
    case "fly":
      if (e.gm === "creative") { e.flying = !e.flying; ok("cmd.fly", e.flying ? "ON" : "OFF"); } else err("cmd.flyc");
      break;
    case "heal": e.hp = 20; ok("cmd.heal"); break;
    case "difficulty": ok("cmd.difficulty"); break;
    case "list": {
      const names = e.net && e.st ? Object.values(e.st.players).map((x) => x.name) : [e.cfg.settings.name];
      ok("cmd.list", names.length, names.join(", "));
      break;
    }
    case "leave": e.cfg.onLeave(); break;
    case "start": e.net?.send({ t: "start" }); break;
    default: err("cmd.unknown", cmd);
  }
  e.touch();
}
