import { useEffect, useReducer, useRef, useState } from "react";
import { Engine } from "../game/engine";
import { ALL_IDS, BLOCKS, blockIcon } from "../game/blocks";
import { Mode, THEMES, TEAMS, Variant, teamColor } from "../game/maps";
import { Net } from "../game/net";
import { SaveData, Settings, Slot, saveWorld } from "../game/storage";
import { t } from "../i18n";
import { SettingsForm } from "./SettingsForm";
import { Btn, Seg, Toggle } from "./ui";
import { commandSuggestions } from "../game/commands";

export type GameCfg =
  | { kind: "single"; slot: number; data: SaveData }
  | { kind: "server"; net: Net; mode: Mode; variant: Variant; hub?: boolean };

type UI = "play" | "chat" | "inv" | "shop" | "settings" | "world";

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const controlName = (code: string) => code.replace(/^Key|^Digit/, "").replace("ControlLeft", "Ctrl").replace("ShiftLeft", "Shift");

export default function GameView({ cfg, settings, onSettings, onExit, onReturnHub, onStartMatch }: {
  cfg: GameCfg; settings: Settings; onSettings: (p: Partial<Settings>) => void; onExit: (reason?: string) => void; onReturnHub: () => void;
  onStartMatch: (mode: Mode, variant: Variant, matchId: string) => Promise<void>;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const eng = useRef<Engine | null>(null);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [locked, setLocked] = useState(false);
  const [started, setStarted] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [ui, setUi] = useState<UI>("play");
  const uiRef = useRef<UI>("play");
  uiRef.current = ui;
  const [portalMode, setPortalMode] = useState<Mode | null>(null);
  const portalModeRef = useRef<Mode | null>(null);
  portalModeRef.current = portalMode;
  const [queuedVariant, setQueuedVariant] = useState<Variant | null>(null);
  const [matchConnecting, setMatchConnecting] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [chatInit, setChatInit] = useState("");
  const exited = useRef(false);
  const single = cfg.kind === "single";
  const exit = (r?: string) => { if (exited.current) return; exited.current = true; onExit(r); };
  const returnHub = () => { if (exited.current) return; exited.current = true; onReturnHub(); };
  const startMatch = (mode: Mode, variant: Variant, matchId: string) => {
    setMatchConnecting(true);
    setPortalError("");
    void onStartMatch(mode, variant, matchId).catch((error: any) => {
      setMatchConnecting(false);
      setQueuedVariant(null);
      setPortalMode(mode);
      setPortalError(t("srv.error") + " (" + (error?.type || error?.message || "?") + ")");
    });
  };

  useEffect(() => {
    let e: Engine;
    try {
      e = new Engine({
        canvas: cv.current!, settings,
        single: cfg.kind === "single" ? { slot: cfg.slot, data: cfg.data } : undefined,
        server: cfg.kind === "server" ? { net: cfg.net, mode: cfg.mode, variant: cfg.variant, hub: cfg.hub } : undefined,
        onUpdate: () => tick(), onLock: (l) => { setLocked(l); if (l) setStarted(true); },
        onLeave: (r) => exit(r), onReturnHub: returnHub,
        onHubPortal: (mode) => {
          setPortalMode(mode);
          setQueuedVariant(null);
          setPortalError("");
          setMatchConnecting(false);
          if (mode) e.releaseInput();
        },
        onHubMatch: startMatch,
      });
    } catch (error) {
      if (cfg.kind === "server") cfg.net.close();
      setStartupError(error instanceof Error ? error.message : String(error));
      return;
    }
    eng.current = e;
    if (cfg.kind === "single") {
      e.setSaveHook(() => { const d = e.getSave(); if (d) saveWorld(cfg.slot, d); });
    }
    const iv = setInterval(() => e.save(), 20000);
    const bu = () => e.save();
    window.addEventListener("beforeunload", bu);
    tick();
    return () => {
      clearInterval(iv); window.removeEventListener("beforeunload", bu);
      e.save(); e.dispose(); eng.current = null;
    };
    // eslint-disable-next-line
  }, []);

  const e = eng.current;
  if (e) {
    e.cfg.settings = settings;
    e.frozen = (single && (ui === "settings" || ui === "world" || (ui === "play" && !locked))) || (e.isHub && !!portalMode);
  }
  useEffect(() => {
    if (cfg.kind === "server") cfg.net.start(settings.name, settings.skin || "");
  }, [cfg, settings.name, settings.skin]);
  useEffect(() => { if (eng.current) eng.current.lastPc = [1e9, 1e9]; }, [settings.renderDist]);

  const openUi = (u: UI, init = "") => { setChatInit(init); setUi(u); eng.current?.releaseInput(); };
  const closeUi = () => { setUi("play"); eng.current?.requestLock(); };

  useEffect(() => {
    const kd = (ev: KeyboardEvent) => {
      const en = eng.current; if (!en) return;
      const u = uiRef.current;
      const controls = en.cfg.settings.controls;
      const inInput = (ev.target as HTMLElement)?.tagName === "INPUT";
      if (portalModeRef.current && ev.code === "Escape") {
        ev.preventDefault();
        eng.current?.closeHubPortal();
        eng.current?.requestLock();
        setQueuedVariant(null);
        return;
      }
      if (u === "play") {
        if (!en.locked) return;
        if (en.st?.phase === "voting" && /^Digit[1-5]$/.test(ev.code) && en.st.viewPlot !== en.team) {
          en.net?.send({ t: "vote", plot: en.st.viewPlot, score: parseInt(ev.code.slice(5), 10) });
          en.votedPlot = en.st.viewPlot; en.myVote = parseInt(ev.code.slice(5), 10); en.touch();
        }
        if (ev.code === "KeyT") { ev.preventDefault(); openUi("chat"); }
        else if (ev.key === "/" || ev.code === "Slash") { ev.preventDefault(); openUi("chat", "/"); }
        else if (ev.code === controls.inventory && !en.spec) { ev.preventDefault(); openUi(en.mode === "bedwars" && en.isNearShop() ? "shop" : "inv"); }
        else if (ev.code === controls.shop && en.mode === "bedwars" && !en.spec) {
          ev.preventDefault();
          if (en.isNearShop()) openUi("shop");
          else en.addChat(t("shop.findVendor"), "#ffd54a");
        }
      } else if (ev.code === "Escape") closeUi();
      else if (ev.code === controls.inventory && !inInput && (u === "inv" || u === "shop")) closeUi();
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  const showStart = ui === "play" && !portalMode && !locked && !started && !!e && !e.dead && !(cfg.kind === "server" && !e.st);
  const showPause = ui === "play" && !portalMode && !locked && started && !!e && !e.dead && !(cfg.kind === "server" && !e.st);
  const isMatchLobby = cfg.kind === "server" && !cfg.hub && !!e?.st && (e.st.phase === "lobby" || e.st.phase === "countdown");
  const now = performance.now();

  if (startupError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-sky-900 p-6 text-center text-white">
        <div className="mc-panel w-full max-w-lg space-y-4 p-6 text-neutral-900">
          <h1 className="text-2xl font-black">{t("game.startupFailed")}</h1>
          <p>{t("game.graphicsHelp")}</p>
          <pre className="overflow-auto whitespace-pre-wrap rounded bg-black p-3 text-left text-xs text-red-200">{startupError}</pre>
          <Btn on onClick={() => exit()}>{t("back")}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <canvas ref={cv} className="block h-full w-full" style={{ touchAction: "none" }} />
      {e && (
        <>
          {e.locked && typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 && (
            <div className="pointer-events-none absolute inset-0 select-none">
              <div className="pointer-events-auto absolute bottom-28 left-3 grid grid-cols-3 gap-1" style={{ touchAction: "none" }}>
                <span />
                <TouchControlButton label="▲" onDown={() => e.touchKey(settings.controls.forward, true)} onUp={() => e.touchKey(settings.controls.forward, false)} />
                <span />
                <TouchControlButton label="◀" onDown={() => e.touchKey(settings.controls.left, true)} onUp={() => e.touchKey(settings.controls.left, false)} />
                <TouchControlButton label="▼" onDown={() => e.touchKey(settings.controls.back, true)} onUp={() => e.touchKey(settings.controls.back, false)} />
                <TouchControlButton label="▶" onDown={() => e.touchKey(settings.controls.right, true)} onUp={() => e.touchKey(settings.controls.right, false)} />
                <TouchControlButton label={t("controls.sneak")} onDown={() => e.touchKey(settings.controls.sneak, true)} onUp={() => e.touchKey(settings.controls.sneak, false)} />
                <TouchControlButton label={t("controls.sprint")} onDown={() => e.touchKey(settings.controls.sprint, true)} onUp={() => e.touchKey(settings.controls.sprint, false)} />
              </div>
              <div className="pointer-events-auto absolute bottom-28 right-3 flex flex-col gap-2" style={{ touchAction: "none" }}>
                <TouchControlButton label={t("controls.jump")} onDown={() => e.touchKey(settings.controls.jump, true)} onUp={() => e.touchKey(settings.controls.jump, false)} />
                <TouchControlButton label={t("touch.mine")} onDown={() => e.touchAttack(true)} onUp={() => e.touchAttack(false)} />
                <TouchControlButton label={t("touch.place")} onDown={() => e.touchPlace(true)} onUp={() => e.touchPlace(false)} />
                <TouchControlButton label={t("touch.drop")} onDown={() => e.touchDrop()} />
                <TouchControlButton label={t("touch.inventory")} onDown={() => openUi("inv")} />
              </div>
            </div>
          )}
          {/* Koordinaten */}
          <div className="mc-dark pointer-events-none absolute left-2 top-2 px-3 py-1.5 text-sm font-bold">
            XYZ: {e.pos.x.toFixed(1)} / {e.pos.y.toFixed(1)} / {e.pos.z.toFixed(1)}
          </div>
          {/* Fadenkreuz */}
          {!e.spec && <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
            <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white" /><div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white" />
          </div>}
          {e.hurtT > 0 && <div className="pointer-events-none absolute inset-0 bg-red-600" style={{ opacity: e.hurtT * 0.9 }} />}
          {e.spec && <div className="mc-dark pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 px-4 py-1 text-sm font-black text-sky-300">👁 {t("hud.spectator")}</div>}
          {e.titleText && now < e.titleText.until && (
            <div className="pointer-events-none absolute left-0 right-0 top-[22%] text-center text-4xl font-black text-white [text-shadow:3px_3px_0_#000] md:text-6xl">{e.titleText.text}</div>
          )}
          {e.net && !e.isHub && <Scoreboard e={e} />}
          {e.isHub && !portalMode && <div className="mc-dark pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 px-4 py-2 text-center text-sm font-bold">{t("hub.hint")}</div>}
          {e.net && !e.isHub && e.st && (e.st.phase === "lobby" || e.st.phase === "countdown") && (
            <div className="mc-dark pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 px-4 py-2 text-center text-sm font-bold">
              {e.st.phase === "lobby" ? t("lobby.wait", Object.keys(e.st.players).length, e.st.need) : t("lobby.count", Math.ceil(e.st.timer))}
              <div className="text-xs text-yellow-300">{t("lobby.hint")}</div>
            </div>
          )}
          {e.st?.phase === "voting" && e.st.viewPlot !== e.team && (
            <div className="mc-dark pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 px-4 py-2 text-center text-sm font-bold">
              {t("vote.plot", t("team." + TEAMS[e.st.viewPlot % 4].key))} — {t("vote.hint")}
              <div className="mt-1 text-xl">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={e.votedPlot === e.st!.viewPlot && e.myVote >= n ? "text-yellow-300" : "text-neutral-500"}>★</span>)}</div>
            </div>
          )}
          {e.mode === "bedwars" && e.st?.phase === "playing" && (
            <div className="mc-dark pointer-events-none absolute bottom-24 right-2 px-3 py-2 text-sm font-bold">
              <div>⚙ {t("res.iron")}: {e.res.iron}</div>
              <div className="text-yellow-300">★ {t("res.gold")}: {e.res.gold}</div>
              <div className="text-xs text-neutral-300">[{controlName(settings.controls.shop)}] {t("shop.title")}</div>
              <div className="text-xs text-neutral-300">[{controlName(settings.controls.drop)}] {t("touch.drop")} · [{controlName(settings.controls.zoom)}] {t("controls.zoom")}</div>
            </div>
          )}

          {/* Herzen + Hotbar */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
            {e.gm === "survival" && !e.spec && (
              <div className="mb-1 flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => {
                  const full = e.hp >= i * 2 + 2, half = !full && e.hp >= i * 2 + 1;
                  return (
                    <span key={i} className="relative inline-block text-xl leading-none text-neutral-800">
                      ♥
                      <span className="absolute left-0 top-0 overflow-hidden text-red-500" style={{ width: full ? "100%" : half ? "50%" : "0%" }}>♥</span>
                    </span>
                  );
                })}
              </div>
            )}
            {(e.armor || e.armorTier > 0) && <div className="mb-1 text-center text-sm font-black text-sky-200">🛡 {t("shop.armor")}</div>}
            {!e.spec && (
              <div className="mc-dark flex gap-0.5 p-1">
                {e.inv.slice(0, 9).map((s, i) => (
                  <div key={i} className="mc-slot !cursor-default" style={i === e.sel ? { outline: "3px solid #fff", outlineOffset: "-1px", zIndex: 1 } : undefined}>
                    {s && <><img src={blockIcon(s.id)} alt="" />{e.gm === "survival" && s.n > 1 && <span className="mc-count">{s.n}</span>}</>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ChatBox e={e} open={ui === "chat"} init={chatInit} close={closeUi} />

          {e.dead && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/60 text-center">
              <div className="text-5xl font-black text-white [text-shadow:3px_3px_0_#000]">{t("hud.dead")}</div>
              {e.net && e.deadWait > 0 && <div className="mt-2 text-xl font-bold">{t("hud.respawn", Math.ceil(e.deadWait))}</div>}
            </div>
          )}
          {cfg.kind === "server" && !e.st && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xl font-black">{t("srv.connecting")}</div>
          )}
          {portalMode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-4">
              <div className="mc-panel fade-in w-full max-w-sm space-y-3 p-5 text-neutral-800">
                <h2 className="text-center text-xl font-black">{t("hub.portal")} · {t("mode." + portalMode)}</h2>
                <p className="text-center text-sm font-bold text-neutral-600">{t("hub.chooseVariant")}</p>
                {(["solo", "duo"] as Variant[]).map((variant) => {
                  const inQueue = queuedVariant === variant;
                  const queue = e.hubQueue?.mode === portalMode && e.hubQueue.variant === variant ? e.hubQueue : null;
                  return (
                    <Btn key={variant} on={!inQueue} disabled={matchConnecting || (!!queuedVariant && !inQueue)}
                      onClick={() => { setQueuedVariant(variant); setPortalError(""); e.joinHubQueue(variant); }}>
                      {inQueue ? `${t("hub.queued")} ${queue ? `${queue.count}/${queue.need}` : ""}` : `${t("var." + variant)} · ${t("hub.joinQueue")}`}
                    </Btn>
                  );
                })}
                {(portalError || e.hubQueueError) && <p className="text-center text-sm font-bold text-red-700">{portalError || e.hubQueueError}</p>}
                {matchConnecting && <p className="text-center text-sm font-bold">{t("hub.matchConnecting")}</p>}
                {queuedVariant && !matchConnecting && <Btn onClick={() => { e.net?.send({ t: "hub.queue.leave" }); setQueuedVariant(null); }}>{t("hub.cancelQueue")}</Btn>}
                <Btn danger onClick={() => { e.closeHubPortal(); e.requestLock(); setQueuedVariant(null); }}>{t("cancel")}</Btn>
              </div>
            </div>
          )}
          {ui === "inv" && <Inventory e={e} close={closeUi} />}
          {ui === "shop" && <Shop e={e} close={closeUi} />}
          {(showStart || showPause || ui === "settings" || ui === "world") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
              <div className="mc-panel fade-in max-h-full w-full max-w-sm space-y-3 overflow-auto p-5">
                {ui === "settings" ? (
                  <>
                    <h2 className="text-center text-xl font-black text-neutral-800">{t("menu.settings")}</h2>
                    <SettingsForm settings={settings} onChange={onSettings} />
                    <Btn onClick={() => setUi("play")}>{t("back")}</Btn>
                  </>
                ) : ui === "world" ? (
                  <WorldPanel e={e} back={() => setUi("play")} />
                ) : showStart ? (
                  <>
                    <h2 className="text-center text-xl font-black text-neutral-800">
                      {isMatchLobby ? t("lobby.realTitle") : t("game.ready")}
                    </h2>
                    {isMatchLobby && e.st && (
                      <div className="text-center text-sm font-bold text-neutral-700">
                        <div>{t("mode." + e.st.mode)} • {t("var." + e.st.variant)}</div>
                        <div>{e.st.phase === "countdown"
                          ? t("lobby.count", Math.ceil(e.st.timer))
                          : t("lobby.wait", Object.keys(e.st.players).length, e.st.need)}</div>
                      </div>
                    )}
                    {isMatchLobby && e.st?.mode === "buildbattle" && <BuildBattleOptions e={e} />}
                    <Btn on onClick={() => e.requestLock()}>
                      {isMatchLobby ? t("lobby.enter") : t("game.play")}
                    </Btn>
                    <p className="text-center text-xs font-bold text-neutral-600">{t("pause.keys")}</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-center text-xl font-black text-neutral-800">{t("pause.title")}</h2>
                    <Btn on onClick={() => e.requestLock()}>{t("pause.resume")}</Btn>
                    <Btn onClick={() => setUi("settings")}>{t("menu.settings")}</Btn>
                    {single && <Btn onClick={() => setUi("world")}>{t("world.settings")}</Btn>}
                    <Btn danger onClick={() => {
                      if (single) exit();
                      else if (e.isHub) exit();
                      else e.net?.send({ t: "hub" });
                    }}>{single ? t("pause.saveQuit") : t("pause.leave")}</Btn>
                    <p className="text-center text-[11px] font-bold text-neutral-600">{t("pause.keys")}</p>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChatBox({ e, open, init, close }: { e: Engine; open: boolean; init: string; close: () => void }) {
  const [v, setV] = useState(init);
  const [hi, setHi] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestionList = useRef<string[]>([]);
  const suggestionIndex = useRef(-1);
  useEffect(() => {
    if (open) { setV(init); setHi(-1); suggestionList.current = []; suggestionIndex.current = -1; setSuggestions([]); }
  }, [open, init]);
  const now = Date.now();
  const lines = e.chat.filter((l) => open || now - l.t < 9000).slice(open ? -14 : -7);
  return (
    <div className="absolute bottom-24 left-2 w-[min(520px,70vw)]">
      <div className={`${open ? "mc-dark" : ""} space-y-0.5 p-1 text-sm font-bold`}>
        {lines.map((l, i) => (
          <div key={i} className="bg-black/45 px-1.5 py-0.5 [text-shadow:1px_1px_0_#000]" style={{ color: l.color }}>{l.text}</div>
        ))}
      </div>
      {open && (
        <>
        <input autoFocus className="mc-input mt-1" value={v} maxLength={200} placeholder={t("chat.hint")}
          onChange={(x) => {
            const value = x.target.value;
            setV(value); suggestionList.current = []; suggestionIndex.current = -1;
            const next = commandSuggestions(e, value); setSuggestions(next);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") { e.submitChat(v); close(); }
            else if (ev.key === "Tab") {
              ev.preventDefault();
              if (!suggestionList.current.length) suggestionList.current = commandSuggestions(e, v);
              if (suggestionList.current.length) {
                suggestionIndex.current = (suggestionIndex.current + 1) % suggestionList.current.length;
                const next = suggestionList.current[suggestionIndex.current];
                setV(next); setSuggestions(suggestionList.current);
              }
            }
            else if (ev.key === "ArrowUp") { const n = Math.min(e.history.length - 1, hi + 1); setHi(n); if (n >= 0) setV(e.history[e.history.length - 1 - n] || ""); ev.preventDefault(); }
            else if (ev.key === "ArrowDown") { const n = hi - 1; setHi(n); setV(n >= 0 ? e.history[e.history.length - 1 - n] : ""); ev.preventDefault(); }
          }} />
        {suggestions.length > 0 && (
          <div className="mc-dark mt-1 max-h-32 overflow-auto p-1 text-sm">
            {suggestions.slice(0, 12).map((suggestion, index) => (
              <button key={suggestion} className={`block w-full px-2 py-1 text-left ${index === suggestionIndex.current ? "bg-white/20" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setV(suggestion); suggestionList.current = []; suggestionIndex.current = -1; setSuggestions([]); }}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        </>
      )}
    </div>
  );
}

function TouchControlButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp?: () => void }) {
  return (
    <button className="pointer-events-auto min-h-12 min-w-12 rounded-lg border-2 border-white/60 bg-black/55 px-2 text-sm font-black text-white"
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onDown(); }}
      onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); onUp?.(); }}
      onPointerCancel={() => onUp?.()}
      onPointerLeave={() => onUp?.()}>
      {label}
    </button>
  );
}

function BuildBattleOptions({ e }: { e: Engine }) {
  const state = e.st;
  if (!state || state.mode !== "buildbattle") return null;
  const vote = state.buildVotes[e.myId];
  const minutes = vote?.minutes ?? 5;
  const theme = vote?.theme ?? THEMES[0];
  const sendVote = (nextMinutes: number, nextTheme: string) => {
    e.net?.send({ t: "bb.vote", minutes: nextMinutes, theme: nextTheme });
  };
  return (
    <div className="space-y-2 rounded border border-neutral-300 p-2 text-sm text-neutral-800">
      <label className="block text-left font-bold">
        {t("bb.minutes")}
        <select className="mc-input mt-1" value={minutes} onChange={(event) => sendVote(Number(event.target.value), theme)}>
          {[1, 5, 10].map((value) => <option key={value} value={value}>{value} {t("bb.minuteUnit")}</option>)}
        </select>
      </label>
      <label className="block text-left font-bold">
        {t("bb.theme")}
        <select className="mc-input mt-1" value={theme} onChange={(event) => sendVote(minutes, event.target.value)}>
          {THEMES.map((value) => <option key={value} value={value}>{t("theme." + value)}</option>)}
        </select>
      </label>
      <p className="text-center text-xs text-neutral-600">{t("bb.majority")}</p>
    </div>
  );
}

function Scoreboard({ e }: { e: Engine }) {
  const st = e.st;
  if (!st) return null;
  const ps = Object.values(st.players);
  const groups = new Map<number, typeof ps>();
  ps.filter((p) => p.team >= 0 && (!p.spec || p.alive)).forEach((p) => groups.set(p.team, [...(groups.get(p.team) || []), p]));
  const specs = ps.filter((p) => p.spec).length;
  let status = "";
  if (st.phase === "lobby") status = t("sb.waiting", ps.length, st.need);
  else if (st.phase === "countdown") status = t("sb.starting", Math.ceil(st.timer));
  else if (st.phase === "voting") status = t("sb.voting", Math.ceil(st.timer));
  else if (st.phase === "ended") status = t("sb.ended");
  else if (st.mode !== "oneblock") status = t("sb.time", mmss(st.timer));
  return (
    <div className="mc-dark pointer-events-none absolute right-2 top-2 w-60 space-y-1 p-2 text-xs font-bold">
      <div className="text-center text-sm font-black text-yellow-300">{t("mode." + st.mode)} • {t("var." + st.variant)}</div>
      {status && <div className="text-center text-neutral-200">{status}</div>}
      {st.mode === "buildbattle" && st.theme && st.phase === "playing" && <div className="text-center text-sky-300">{t("sb.theme", t("theme." + st.theme))}</div>}
      <hr className="border-neutral-600" />
      {st.mode === "oneblock" ? (
        ps.map((p) => <div key={p.id} className="flex justify-between"><span style={{ color: teamColor(p.team) }}>{p.name}</span><span>{st.counts[p.team] || 0} ⛏</span></div>)
      ) : st.mode === "dropper" ? (
        ps.map((p) => <div key={p.id} className="flex justify-between"><span style={{ color: teamColor(p.team) }}>{p.name}</span><span>{p.done ? "✔" : ""} ☠{p.fails}</span></div>)
      ) : (
        [...groups.entries()].map(([team, members]) => (
          <div key={team} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3" style={{ background: teamColor(team) }} />
            <span style={{ color: teamColor(team) }}>{t("team." + TEAMS[team % 4].key)}</span>
            <span className="flex-1 truncate text-neutral-300">{members.map((m) => m.name).join(", ")}</span>
            {st.mode === "bedwars" && st.phase !== "lobby" && st.phase !== "countdown" && <span>{st.beds[team] ? "🛏️" : members.some((m) => m.alive) ? "✔" : "✖"}</span>}
          </div>
        ))
      )}
      {specs > 0 && <div className="text-neutral-400">👁 {specs} {t("hud.spectator")}</div>}
      <hr className="border-neutral-600" />
      <div className="text-center text-neutral-400">{t("sb.visitor")}</div>
    </div>
  );
}

function SlotView({ s, onClick, creative }: { s: Slot | null; onClick: (right: boolean) => void; creative: boolean }) {
  return (
    <div className="mc-slot" title={s ? t("b." + BLOCKS[s.id]!.name) : ""}
      onMouseDown={(ev) => { ev.preventDefault(); onClick(ev.button === 2); }} onContextMenu={(ev) => ev.preventDefault()}>
      {s && <img src={blockIcon(s.id)} alt="" />}
      {s && (s.n > 1 || creative) && <span className="mc-count">{s.n}</span>}
    </div>
  );
}

function Inventory({ e, close }: { e: Engine; close: () => void }) {
  const [held, setHeld] = useState<Slot | null>(null);
  const heldRef = useRef<Slot | null>(null);
  heldRef.current = held;
  const [mp, setMp] = useState({ x: -100, y: -100 });
  const [q, setQ] = useState("");
  const creative = e.gm === "creative";
  const recipes: { output: number; count: number; ingredients: [number, number][] }[] = [
    { output: 8, count: 4, ingredients: [[6, 1]] },
    { output: 58, count: 4, ingredients: [[8, 2]] },
    { output: 59, count: 1, ingredients: [[8, 3], [58, 2]] },
    { output: 60, count: 1, ingredients: [[4, 3], [58, 2]] },
    { output: 61, count: 1, ingredients: [[23, 3], [58, 2]] },
    { output: 62, count: 1, ingredients: [[24, 3], [58, 2]] },
    { output: 64, count: 1, ingredients: [[23, 8]] },
    { output: 65, count: 1, ingredients: [[24, 8]] },
  ];
  useEffect(() => () => { const h = heldRef.current; if (h && e.gm === "survival") e.addItem(h.id, h.n); }, [e]);

  const click = (i: number, right: boolean) => {
    const s = e.inv[i];
    if (!held) {
      if (!s) return;
      if (right && s.n > 1) { const half = Math.ceil(s.n / 2); setHeld({ id: s.id, n: half }); s.n -= half; }
      else { setHeld({ ...s }); e.inv[i] = null; }
    } else if (!s) {
      if (right) { e.inv[i] = { id: held.id, n: 1 }; setHeld(held.n > 1 ? { id: held.id, n: held.n - 1 } : null); }
      else { e.inv[i] = { ...held }; setHeld(null); }
    } else if (s.id === held.id) {
      const a = Math.min(64 - s.n, right ? 1 : held.n);
      s.n += a;
      setHeld(held.n - a > 0 ? { id: held.id, n: held.n - a } : null);
    } else { e.inv[i] = { ...held }; setHeld({ ...s }); }
    e.touch();
  };

  const ids = ALL_IDS.filter((id) => id !== 63 && !(e.mode === "buildbattle" && (id === 66 || id === 67)) &&
    (!q || t("b." + BLOCKS[id]!.name).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-2" onMouseMove={(ev) => setMp({ x: ev.clientX, y: ev.clientY })}>
      <div className="mc-panel fade-in max-h-full overflow-auto p-4 text-neutral-800">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black">{creative ? t("inv.creative") : t("inv.title")}</h2>
          <button className="mc-btn !w-auto !px-3 !py-1" onClick={close}>✕</button>
        </div>
        {creative && (
          <div className="mb-3">
            <input className="mc-input mb-2" placeholder={t("inv.search")} value={q} onChange={(x) => setQ(x.target.value)} />
            <div className="grid max-h-[190px] grid-cols-9 gap-0.5 overflow-auto bg-[#a0a0a0] p-1">
              {ids.map((id) => (
                <div key={id} className="mc-slot" title={t("b." + BLOCKS[id]!.name)}
                  onMouseDown={(ev) => { ev.preventDefault(); setHeld(held ? null : { id, n: ev.button === 2 ? 1 : 64 }); }} onContextMenu={(ev) => ev.preventDefault()}>
                  <img src={blockIcon(id)} alt="" />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              <div className="mc-slot !w-auto px-3 text-sm font-bold" onClick={() => { if (held) setHeld(null); }}>🗑 {t("inv.trash")}</div>
              <button className="mc-btn !w-auto !px-3 !py-1 !text-sm" onClick={() => { e.clearInv(); }}>{t("inv.clear")}</button>
            </div>
          </div>
        )}
        {!creative && !e.net && (
          <div className="mb-2">
            <details>
              <summary className="cursor-pointer text-xs font-bold">{t("inv.craft")}</summary>
              <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto">
            {recipes.map((recipe) => {
              const canCraft = recipe.ingredients.every(([id, n]) => e.countItem(id) >= n);
              const needs = recipe.ingredients.map(([id, n]) => `${t("b." + BLOCKS[id]!.name)} ${e.countItem(id)}/${n}`).join(" · ");
              return (
                <button key={recipe.output} className="flex items-center gap-2 rounded border border-neutral-500 bg-[#d2d2d2] px-2 py-1 text-left text-xs font-bold disabled:opacity-50"
                  title={needs} disabled={!canCraft} onClick={() => e.craft(recipe.output, recipe.count, recipe.ingredients)}>
                  <img src={blockIcon(recipe.output)} alt="" className="h-7 w-7 [image-rendering:pixelated]" />
                  <span className="flex-1">{t("b." + BLOCKS[recipe.output]!.name)} ×{recipe.count}</span>
                  <span>{t("inv.craftButton")}</span>
                </button>
              );
            })}
              </div>
            </details>
          </div>
        )}
        <div className="grid grid-cols-9 gap-0.5">
          {e.inv.slice(9).map((s, i) => <SlotView key={i + 9} s={s} creative={creative} onClick={(r) => click(i + 9, r)} />)}
        </div>
        <div className="mt-3 grid grid-cols-9 gap-0.5">
          {e.inv.slice(0, 9).map((s, i) => <SlotView key={i} s={s} creative={creative} onClick={(r) => click(i, r)} />)}
        </div>
        <p className="mt-2 text-[11px] font-bold text-neutral-600">{t("inv.help")}</p>
      </div>
      {held && (
        <div className="pointer-events-none fixed z-50" style={{ left: mp.x - 17, top: mp.y - 17 }}>
          <img src={blockIcon(held.id)} alt="" className="h-[34px] w-[34px] [image-rendering:pixelated]" />
          <span className="mc-count">{held.n}</span>
        </div>
      )}
    </div>
  );
}

const SHOP: { key: string; category: "blocks" | "combat" | "food"; id?: number; n: number; iron: number; gold: number; kind?: "sword1" | "sword2" | "sword3" | "armor" }[] = [
  { key: "wool", category: "blocks", n: 16, iron: 8, gold: 0 },
  { key: "planks", category: "blocks", id: 8, n: 8, iron: 0, gold: 3 },
  { key: "cobblestone", category: "blocks", id: 4, n: 16, iron: 16, gold: 0 },
  { key: "glass", category: "blocks", id: 9, n: 8, iron: 6, gold: 0 },
  { key: "end_stone", category: "blocks", id: 17, n: 8, iron: 20, gold: 0 },
  { key: "obsidian", category: "blocks", id: 25, n: 2, iron: 0, gold: 4 },
  { key: "tnt", category: "blocks", id: 55, n: 1, iron: 0, gold: 4 },
  { key: "apple", category: "food", id: 56, n: 2, iron: 4, gold: 0 },
  { key: "cooked_meat", category: "food", id: 57, n: 1, iron: 8, gold: 0 },
  { key: "sword", category: "combat", n: 1, iron: 0, gold: 8, kind: "sword1" },
  { key: "sword2", category: "combat", n: 1, iron: 16, gold: 8, kind: "sword2" },
  { key: "sword3", category: "combat", n: 1, iron: 32, gold: 16, kind: "sword3" },
  { key: "armor", category: "combat", n: 1, iron: 0, gold: 8, kind: "armor" },
];

function Shop({ e, close }: { e: Engine; close: () => void }) {
  const [category, setCategory] = useState<"blocks" | "combat" | "food">("blocks");
  const buy = (it: (typeof SHOP)[number]) => {
    if (e.res.iron < it.iron || e.res.gold < it.gold) return;
    if (it.kind?.startsWith("sword")) {
      const level = Number(it.kind.slice(-1));
      if (e.swordLevel >= level) return;
      e.setSwordLevel(level);
    }
    else if (it.kind === "armor") { if (e.armor) return; e.setArmor(); }
    else {
      const id = it.id ?? (TEAMS[e.team % 4]?.wool || 12);
      if (e.addItem(id, it.n) >= it.n) return;
    }
    e.res.iron -= it.iron; e.res.gold -= it.gold; e.touch();
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-2">
      <div className="mc-panel fade-in w-full max-w-lg p-4 text-neutral-800">
        <div className="mb-3 flex items-center justify-between border-b-2 border-neutral-500 pb-2">
          <div><h2 className="text-xl font-black">🛒 {t("shop.title")}</h2><p className="text-xs">{t("shop.pickupHint")}</p></div>
          <div className="flex gap-2 text-sm font-black">
            <span className="rounded border border-neutral-500 bg-white px-2 py-1">⚙ {e.res.iron}</span>
            <span className="rounded border border-neutral-500 bg-white px-2 py-1 text-yellow-700">★ {e.res.gold}</span>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1">
          {(["blocks", "combat", "food"] as const).map((tab) => (
            <button key={tab} className={`rounded border-2 px-2 py-1 text-sm font-black ${category === tab ? "border-neutral-900 bg-[#b9b9b9]" : "border-neutral-500 bg-[#dedede]"}`}
              onClick={() => setCategory(tab)}>{t("shop.category." + tab)}</button>
          ))}
        </div>
        <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-auto">
          {SHOP.filter((it) => it.category === category).map((it) => {
            const owned = (it.kind?.startsWith("sword") && e.swordLevel >= Number(it.kind.slice(-1))) || (it.kind === "armor" && e.armor);
            const can = !owned && e.res.iron >= it.iron && e.res.gold >= it.gold;
            const id = it.id ?? (TEAMS[e.team % 4]?.wool || 12);
            return (
              <button key={it.key} disabled={!can} onClick={() => buy(it)} className="flex min-h-16 items-center gap-2 rounded border-2 border-[#66533b] bg-[#c4b38d] p-2 text-left text-sm font-bold shadow-[inset_2px_2px_0_#e8d9b8,inset_-2px_-2px_0_#88775a] hover:bg-[#d4c39d] disabled:opacity-45">
                {!it.kind ? <img src={blockIcon(id)} alt="" className="h-8 w-8 [image-rendering:pixelated]" /> : <span className="text-2xl">{it.kind.startsWith("sword") ? "⚔️" : "🛡️"}</span>}
                <span className="flex-1">
                  <span className="block">{t("shop." + it.key)}{it.n > 1 ? ` ×${it.n}` : ""}</span>
                  <span className="block text-xs">{owned ? t("shop.owned") : `${it.iron ? "⚙ " + it.iron : ""} ${it.gold ? "★ " + it.gold : ""}`}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3"><Btn onClick={close}>{t("back")}</Btn></div>
      </div>
    </div>
  );
}

function WorldPanel({ e, back }: { e: Engine; back: () => void }) {
  return (
    <>
      <h2 className="text-center text-xl font-black text-neutral-800">{t("world.settings")}</h2>
      <div>
        <div className="mb-1 text-sm font-bold text-neutral-800">{t("world.gm")}</div>
        <Seg options={[["survival", t("gm.survival")], ["creative", t("gm.creative")]]} value={e.gm} onChange={(g) => e.setGM(g)} />
      </div>
      <Toggle label={t("world.cheats")} value={e.cheats} onChange={(v) => { e.cheats = v; e.touch(); }} />
      <Toggle label={t("world.daylight")} value={e.daylight} onChange={(v) => { e.daylight = v; e.touch(); }} />
      <Toggle label={t("world.keepInv")} value={e.keepInv} onChange={(v) => { e.keepInv = v; e.touch(); }} />
      <div>
        <div className="mb-1 text-sm font-bold text-neutral-800">{t("world.time")}</div>
        <div className="grid grid-cols-4 gap-1">
          {([["day", 1000], ["noon", 6000], ["sunset", 12500], ["night", 18000]] as [string, number][]).map(([k, v]) => (
            <button key={k} className="mc-btn !px-1 !py-1 !text-xs" onClick={() => { e.time = v; e.touch(); }}>{t("time." + k)}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-bold text-neutral-800">{t("world.weather")}</div>
        <Seg options={[["clear", t("weather.clear")], ["rain", t("weather.rain")]]} value={e.weather} onChange={(w) => { e.weather = w; e.touch(); }} />
      </div>
      <Btn onClick={back}>{t("back")}</Btn>
    </>
  );
}
