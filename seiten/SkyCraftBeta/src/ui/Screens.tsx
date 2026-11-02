import { useEffect, useRef, useState, type AnimationEvent, type ChangeEvent } from "react";
import { Net } from "../game/net";
import { SaveData, Settings, deleteWorld, loadWorld, newSave, saveWorld } from "../game/storage";
import { parseWorldFile, serializeWorldFile } from "../game/storage";
import { strSeed } from "../game/noise";
import { activateResourcePack, deleteResourcePack, getActiveResourcePackId, getResourcePacks, importResourcePack, RESOURCE_PACK_STRUCTURE, RESOURCE_TEXTURE_NAMES, type ResourcePack } from "../game/resourcePacks";
import { t } from "../i18n";
import { SettingsForm, WorldForm } from "./SettingsForm";
import { Backdrop, Btn, Logo } from "./ui";

export function MainMenu({ go, notice }: { go: (s: string) => void; notice: string }) {
  const [splash] = useState(() => t("splash." + Math.floor(Math.random() * 5)));
  return (
    <Backdrop>
      <div className="fade-in w-full max-w-md">
        <div className="relative mb-10">
          <Logo size={84} />
          <div className="pulse-text absolute -right-2 top-full -mt-1 text-lg font-black text-yellow-300 [text-shadow:2px_2px_0_#553]">{splash}</div>
        </div>
        {notice && <div className="mc-dark mb-4 p-3 text-center text-sm font-bold text-red-300">{notice}</div>}
        <div className="space-y-3">
          <Btn onClick={() => go("worlds")}>{t("menu.single")}</Btn>
          <Btn onClick={() => go("servers")}>{t("menu.multi")}</Btn>
          <Btn onClick={() => go("settings")}>{t("menu.settings")}</Btn>
          <Btn onClick={() => go("credits")}>{t("credits.title")}</Btn>
        </div>
        <p className="mt-8 text-center text-xs font-bold text-white/90 [text-shadow:1px_1px_0_#000]">SkyCraft 1.0 • {t("menu.foot")}</p>
      </div>
    </Backdrop>
  );
}

export function SettingsScreen({ settings, onChange, back, openResourcePacks }: { settings: Settings; onChange: (p: Partial<Settings>) => void; back: () => void; openResourcePacks: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0; }, []);
  return (
    <Backdrop>
      <div ref={panel} className="mc-panel fade-in max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto p-5">
        <h2 className="text-center text-xl font-black text-neutral-800">{t("menu.settings")}</h2>
        <SettingsForm settings={settings} onChange={onChange} />
        <Btn onClick={openResourcePacks}>{t("resources.title")}</Btn>
        <Btn onClick={back}>{t("back")}</Btn>
      </div>
    </Backdrop>
  );
}

const LICENSE_GROUPS: [string, string][] = [
  ["MIT", "154"],
  ["ISC", "7"],
  ["Apache-2.0", "3"],
  ["CC-BY-4.0", "1"],
  ["MPL-2.0", "12"],
  ["BSD-3-Clause", "2"],
];
const LICENSED_PACKAGES = [
  ["MIT", "@types/three, clsx, fflate, peerjs, react, react-dom, tailwind-merge, three, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, @vitejs/plugin-react, tailwindcss, vite, vite-plugin-singlefile"],
  ["Apache-2.0", "TypeScript"],
  ["CC-BY-4.0", "caniuse-lite"],
  ["MPL-2.0", "lightningcss"],
  ["BSD-3-Clause", "source-map-js, webrtc-adapter"],
  ["ISC", "@msgpack/msgpack, electron-to-chromium, graceful-fs, lru-cache, picocolors, semver, yallist"],
];

const CREDITS_STARS = Array.from({ length: 110 }, (_, index) => ({
  left: `${(index * 47 + 13) % 100}%`,
  top: `${(index * 73 + 7) % 100}%`,
  size: index % 9 === 0 ? 3 : 2,
  delay: `${-((index * 17) % 50) / 10}s`,
  duration: `${4 + (index % 6)}s`,
  travelDuration: `${24 + (index % 13)}s`,
}));

const CREDITS_ROLL_DURATION_MS = 45_000;
const CREDITS_ROLL_COUNT = 1;

export function CreditsScreen({ back }: { back: () => void }) {
  const [ending, setEnding] = useState(false);
  const rollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ending) return;
    const watchdog = window.setTimeout(
      () => setEnding(true),
      CREDITS_ROLL_DURATION_MS * CREDITS_ROLL_COUNT + 1000,
    );
    return () => window.clearTimeout(watchdog);
  }, [ending]);
  useEffect(() => {
    if (!ending) return;
    const timeout = window.setTimeout(back, 2000);
    return () => window.clearTimeout(timeout);
  }, [back, ending]);
  useEffect(() => {
    const setPlaybackRate = (rate: number) => {
      rollRef.current?.getAnimations()[0]?.updatePlaybackRate(rate);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      setPlaybackRate(10);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setPlaybackRate(1);
    };
    const onBlur = () => setPlaybackRate(1);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const finishRoll = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "credits-scroll") setEnding(true);
  };

  return (
    <main className={`credits-scene ${ending ? "credits-finished" : ""}`}>
      <div className="credits-stars" aria-hidden="true">
        {CREDITS_STARS.map((star, index) => (
          <span key={index} className="credits-star" style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            animationDuration: `${star.duration}, ${star.travelDuration}`,
          }} />
        ))}
      </div>
      <div className="credits-nebula" aria-hidden="true" />
      <div className="credits-vignette" aria-hidden="true" />
      {!ending ? (
        <div className="credits-viewport" aria-label={t("credits.title")}>
          <div ref={rollRef} className="credits-roll" onAnimationEnd={finishRoll} style={{
            animationDuration: `${CREDITS_ROLL_DURATION_MS / 1000}s`,
            animationIterationCount: CREDITS_ROLL_COUNT,
          }}>
          <h2 className="mb-8 text-3xl font-black">{t("credits.title")}</h2>
          <div className="mb-8 space-y-2">
          <p className="font-black">{t("credits.createdBy")}: Tewe444</p>
          <p>{t("credits.support")}: Copilot</p>
            <p>{t("credits.audioTools")}</p>
          </div>
          <p className="mb-8 text-sm">{t("credits.licenseInfo")}</p>
          <div className="mb-8 space-y-6">
            {LICENSED_PACKAGES.map(([license, packages]) => (
              <section key={license} className="space-y-2">
                <h3 className="text-xl font-black">{license}</h3>
                <p className="text-sm leading-relaxed">{packages}</p>
              </section>
            ))}
          </div>
          <section className="mb-8">
            <h3 className="mb-2 font-black">{t("credits.counts")}</h3>
            <ul className="space-y-1">
              {LICENSE_GROUPS.map(([license, count]) => <li key={license}>{license}: {count}</li>)}
            </ul>
          </section>
          <p className="text-xs leading-relaxed">{t("credits.notice")}</p>
          </div>
        </div>
      ) : <div className="credits-end">SkyGames</div>}
    </main>
  );
}

export function ResourcePacksScreen({ back }: { back: () => void }) {
  const [packs, setPacks] = useState<ResourcePack[]>(() => getResourcePacks());
  const [activeId, setActiveId] = useState(getActiveResourcePackId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showStructure, setShowStructure] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); }, []);

  const loadFiles = async (files: FileList | null, input: HTMLInputElement | null) => {
    if (!files?.length) return;
    setError(""); setNotice("");
    try {
      const pack = await importResourcePack(files);
      activateResourcePack(pack.id);
      setPacks(getResourcePacks());
      setActiveId(pack.id);
      setNotice(t("resources.imported", pack.name));
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : "resources.importFailed"));
    } finally {
      if (input) input.value = "";
    }
  };
  const selectPack = (id: string) => {
    setError(""); setNotice("");
    try {
      activateResourcePack(id);
      setActiveId(id);
      setNotice(t("resources.selected"));
    } catch (reason) {
      setError(t(reason instanceof Error ? reason.message : "resources.selectFailed"));
    }
  };
  const downloadStructure = () => {
    const url = URL.createObjectURL(new Blob([RESOURCE_PACK_STRUCTURE], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "manifest.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Backdrop>
      <div className="mc-panel fade-in max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto p-5 text-neutral-800">
        <h2 className="text-center text-xl font-black">{t("resources.title")}</h2>
        <p className="text-center text-sm">{t("resources.hint")}</p>
        <input ref={folderInput} type="file" multiple className="hidden" onChange={(event) => void loadFiles(event.currentTarget.files, event.currentTarget)} />
        <input ref={filesInput} type="file" multiple accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(event) => void loadFiles(event.currentTarget.files, event.currentTarget)} />
        <div className="grid grid-cols-3 gap-2">
          <Btn onClick={() => folderInput.current?.click()}>{t("resources.addFolder")}</Btn>
          <Btn onClick={() => filesInput.current?.click()}>{t("resources.addFiles")}</Btn>
          <Btn onClick={() => zipInput.current?.click()}>{t("resources.addZip")}</Btn>
        </div>
        <input ref={zipInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => void loadFiles(event.currentTarget.files, event.currentTarget)} />
        {error && <div role="alert" className="rounded border border-red-800 bg-red-100 p-2 text-sm font-bold text-red-900">{error}</div>}
        {notice && <div role="status" className="rounded border border-green-800 bg-green-100 p-2 text-sm font-bold text-green-900">{notice}</div>}
        <div className="space-y-2">
          {packs.map((pack) => (
            <div key={pack.id} className="flex items-center gap-2 rounded border-2 border-neutral-500 bg-[#ded6c2] p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{pack.name.startsWith("resources.") ? t(pack.name) : pack.name}</div>
                {pack.textures && <div className="text-xs">{t("resources.textureCount", Object.keys(pack.textures).length)}</div>}
              </div>
              <button className={`mc-btn !w-auto !px-3 !py-1 ${activeId === pack.id ? "on" : ""}`} onClick={() => selectPack(pack.id)}>
                {activeId === pack.id ? t("resources.active") : t("resources.select")}
              </button>
              {pack.id.startsWith("custom-") && <button className="mc-btn !w-auto !px-3 !py-1" onClick={() => {
                deleteResourcePack(pack.id); setPacks(getResourcePacks()); setActiveId(getActiveResourcePackId());
              }}>{t("resources.remove")}</button>}
            </div>
          ))}
        </div>
        <button className="mc-btn !py-2 !text-sm" onClick={() => setShowStructure((visible) => !visible)}>{t("resources.structure")}</button>
        {showStructure && (
          <div className="space-y-2 rounded border border-neutral-500 bg-white/70 p-3 text-xs">
            <pre className="overflow-auto">{`MeinPack/\n  manifest.json\n  textures/\n    grass_top.png\n    stone.png\n    yellow_flower.png`}</pre>
            <p>{t("resources.structureHint")}</p>
            <details>
              <summary className="cursor-pointer font-bold">{t("resources.textureNames")}</summary>
              <p className="mt-1 break-words">{RESOURCE_TEXTURE_NAMES.map((name) => name + ".png").join(", ")}</p>
            </details>
            <button className="mc-btn !py-1.5 !text-xs" onClick={downloadStructure}>{t("resources.downloadManifest")}</button>
          </div>
        )}
        <Btn onClick={back}>{t("back")}</Btn>
      </div>
    </Backdrop>
  );
}

type WView = { v: "list" } | { v: "create"; slot: number } | { v: "edit"; slot: number };

export function WorldSelect({ back, play }: { back: () => void; play: (slot: number, d: SaveData) => void }) {
  const [view, setView] = useState<WView>({ v: "list" });
  const [, bump] = useState(0);
  const [confirm, setConfirm] = useState(-1);
  const [form, setForm] = useState<Partial<SaveData> & { seedText?: string }>({});
  const [notice, setNotice] = useState("");
  const [importTarget, setImportTarget] = useState<number | null>(null);
  const importFile = useRef<HTMLInputElement>(null);

  const download = (filename: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportWorld = (world: SaveData) => {
    download(`${safeFileName(world.name)}.skycraft`, serializeWorldFile(world), "application/json");
    setNotice(t("world.exported", world.name));
  };
  const beginImport = (slot: number) => {
    if (loadWorld(slot) && !window.confirm(t("world.importReplace"))) return;
    setImportTarget(slot);
    importFile.current?.click();
  };
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const slot = importTarget;
    event.target.value = "";
    setImportTarget(null);
    if (!file || slot === null) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("world.fileTooLarge");
      const world = parseWorldFile(await file.text());
      world.lastPlayed = Date.now();
      if (!saveWorld(slot, world)) throw new Error("world.saveFailed");
      setNotice(t("world.imported", world.name));
      bump((value) => value + 1);
    } catch (error) {
      const key = error instanceof Error ? error.message : "world.fileInvalid";
      setNotice(t(key));
    }
  };

  if (view.v !== "list") {
    const slot = view.slot, create = view.v === "create";
    return (
      <Backdrop>
        <div className="mc-panel fade-in w-full max-w-md space-y-4 p-5">
          <h2 className="text-center text-xl font-black text-neutral-800">{create ? t("world.create") : t("world.edit")}</h2>
          <WorldForm v={form} onChange={(p) => setForm({ ...form, ...p })} create={create} />
          <div className="grid grid-cols-2 gap-3">
            <Btn onClick={() => setView({ v: "list" })}>{t("cancel")}</Btn>
            <Btn on onClick={() => {
              if (create) {
                const seedText = (form.seedText || "").trim() || String(Math.floor(Math.random() * 1e9));
                const d = newSave({
                  name: form.name?.trim() || t("world.default", slot + 1), seed: strSeed(seedText), seedText, type: form.type || "normal",
                  gm: form.gm || "survival", cheats: form.cheats !== false, trees: form.trees !== false,
                  daylight: form.daylight !== false, keepInv: form.keepInv !== false,
                });
                saveWorld(slot, d);
                play(slot, d);
              } else {
                const d = loadWorld(slot);
                if (d) { Object.assign(d, { name: form.name || d.name, gm: form.gm || d.gm, cheats: form.cheats !== false, daylight: form.daylight !== false, keepInv: form.keepInv !== false }); saveWorld(slot, d); }
                setView({ v: "list" }); bump((x) => x + 1);
              }
            }}>{create ? t("world.createGo") : t("save")}</Btn>
          </div>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <div className="fade-in w-full max-w-xl space-y-4">
        <h2 className="text-center text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">{t("menu.single")}</h2>
        <input ref={importFile} type="file" accept=".skycraft,.json,application/json" className="hidden" onChange={handleImport} />
        {notice && <div className="mc-panel p-3 text-center text-sm font-bold text-neutral-800">{notice}</div>}
        {[0, 1].map((slot) => {
          const d = loadWorld(slot);
          return (
            <div key={slot} className="mc-panel p-4">
              {d ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex-1 text-neutral-800">
                      <div className="text-lg font-black">{d.name}</div>
                      <div className="text-xs font-bold text-neutral-600">
                        {t("world." + d.type)} • {t("gm." + d.gm)} • {t("world.seed")}: {d.seedText}
                      </div>
                      <div className="text-xs text-neutral-500">{t("world.last")}: {new Date(d.lastPlayed).toLocaleString()}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:w-72">
                      <Btn on onClick={() => play(slot, d)}>{t("world.play")}</Btn>
                      <Btn onClick={() => { setForm({ name: d.name, gm: d.gm, cheats: d.cheats, daylight: d.daylight, keepInv: d.keepInv }); setView({ v: "edit", slot }); }}>{t("world.edit")}</Btn>
                      {confirm === slot
                        ? <Btn danger onClick={() => { deleteWorld(slot); setConfirm(-1); }}>{t("world.sure")}</Btn>
                        : <Btn danger onClick={() => setConfirm(slot)}>{t("world.delete")}</Btn>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Btn onClick={() => exportWorld(d)}>{t("world.export")}</Btn>
                    <Btn onClick={() => beginImport(slot)}>{t("world.import")}</Btn>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1 font-bold text-neutral-600">{t("world.slot", slot + 1)} – {t("world.empty")}</div>
                  <div className="grid w-48 gap-2">
                    <Btn on onClick={() => { setForm({ name: t("world.default", slot + 1), gm: "survival", type: "normal" }); setView({ v: "create", slot }); }}>{t("world.new")}</Btn>
                    <Btn onClick={() => beginImport(slot)}>{t("world.import")}</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <Btn onClick={back}>{t("back")}</Btn>
      </div>
    </Backdrop>
  );
}

function safeFileName(name: string) {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 60) || "skycraft-world";
}

export function ServerBrowser({ back, join }: {
  back: () => void;
  join: (net: Net) => void;
}) {
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const connectionError = (error: any) => {
    if (error?.type === "browser-incompatible") return t("srv.browser");
    if (error?.type === "secure-context-required") return t("srv.secure");
    return t("srv.error") + " (" + (error?.type || error?.message || "?") + ")";
  };

  useEffect(() => {
    let active = true;
    let connection: Net | null = null;
    let handedOff = false;
    setBusy(true);
    setErr("");
    void Net.connectHub().then((net) => {
      connection = net;
      if (!active) { net.close(); return; }
      handedOff = true;
      join(net);
    }).catch((error: any) => {
      if (!active) return;
      setBusy(false);
      setErr(connectionError(error));
    });
    return () => {
      active = false;
      if (connection && !handedOff) connection.close();
    };
  }, [join, retry]);

  return (
    <Backdrop>
      <div className="fade-in w-full max-w-md space-y-4">
        <h2 className="text-center text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">{t("hub.title")}</h2>
        <div className="mc-panel p-4 text-center text-sm font-bold text-neutral-800">
          {busy ? t("srv.connecting") : t("hub.connected")}
          <p className="mt-2 text-xs font-normal text-neutral-600">{t("hub.hint")}</p>
        </div>
        {err && <div className="mc-dark p-3 text-center text-sm font-bold text-red-300">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={back}>{t("back")}</Btn>
          <Btn on onClick={() => setRetry((value) => value + 1)} disabled={busy}>{t("hub.retry")}</Btn>
        </div>
        <p className="text-center text-xs font-bold text-white [text-shadow:1px_1px_0_#000]">{t("srv.peer")}</p>
      </div>
    </Backdrop>
  );
}
