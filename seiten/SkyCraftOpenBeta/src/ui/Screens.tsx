import { useState } from "react";
import { Net } from "../game/net";
import { MODES, Mode, Variant, capacity, minPlayers } from "../game/maps";
import { SaveData, Settings, deleteWorld, loadWorld, newSave, saveWorld } from "../game/storage";
import { strSeed } from "../game/noise";
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
        </div>
        <p className="mt-8 text-center text-xs font-bold text-white/90 [text-shadow:1px_1px_0_#000]">SkyCraft 1.0 • {t("menu.foot")}</p>
      </div>
    </Backdrop>
  );
}

export function SettingsScreen({ settings, onChange, back }: { settings: Settings; onChange: (p: Partial<Settings>) => void; back: () => void }) {
  return (
    <Backdrop>
      <div className="mc-panel fade-in w-full max-w-md space-y-4 p-5">
        <h2 className="text-center text-xl font-black text-neutral-800">{t("menu.settings")}</h2>
        <SettingsForm settings={settings} onChange={onChange} />
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
        {[0, 1].map((slot) => {
          const d = loadWorld(slot);
          return (
            <div key={slot} className="mc-panel p-4">
              {d ? (
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
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1 font-bold text-neutral-600">{t("world.slot", slot + 1)} – {t("world.empty")}</div>
                  <div className="w-48"><Btn on onClick={() => { setForm({ name: t("world.default", slot + 1), gm: "survival", type: "normal" }); setView({ v: "create", slot }); }}>{t("world.new")}</Btn></div>
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

const ICONS: Record<Mode, string> = { bedwars: "🛏️", skywars: "☁️", oneblock: "🟩", buildbattle: "🏗️", dropper: "⬇️" };

export function ServerBrowser({ back, join }: { back: () => void; join: (net: Net, mode: Mode, variant: Variant) => void }) {
  const [sel, setSel] = useState<Mode>("bedwars");
  const [variant, setVariant] = useState<Variant>("solo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const net = await Net.connect(sel, variant);
      join(net, sel, variant);
    } catch (e: any) {
      setErr(t("srv.error") + " (" + (e?.type || e?.message || "?") + ")");
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <div className="fade-in w-full max-w-2xl space-y-3">
        <h2 className="text-center text-3xl font-black text-white [text-shadow:3px_3px_0_#000]">{t("menu.multi")}</h2>
        <div className="mc-panel space-y-2 p-3">
          {MODES.map((m) => (
            <button key={m} onClick={() => setSel(m)} disabled={busy}
              className={`flex w-full items-center gap-3 border-2 p-3 text-left transition ${sel === m ? "border-black bg-[#8fd37f]" : "border-transparent bg-[#b5b5b5] hover:bg-[#d0d0d0]"}`}>
              <span className="text-3xl">{ICONS[m]}</span>
              <span className="flex-1 text-neutral-900">
                <span className="block font-black">{t("mode." + m)}</span>
                <span className="block text-xs font-bold text-neutral-700">{t("srv." + m + ".desc")}</span>
              </span>
              <span className="text-xs font-bold text-neutral-700">{capacity(m, variant)} max</span>
            </button>
          ))}
        </div>
        <div className="mc-panel p-3">
          <div className="mb-2 text-sm font-black text-neutral-800">{t("srv.variant")}</div>
          <div className="grid grid-cols-2 gap-3">
            <Btn on={variant === "solo"} onClick={() => setVariant("solo")}>{t("var.solo")}</Btn>
            <Btn on={variant === "duo"} onClick={() => setVariant("duo")}>{t("var.duo")}</Btn>
          </div>
          <p className="mt-2 text-xs font-bold text-neutral-600">
            {t("srv.info", capacity(sel, variant), minPlayers(sel, variant))}
          </p>
        </div>
        {err && <div className="mc-dark p-3 text-center text-sm font-bold text-red-300">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={back} disabled={busy}>{t("back")}</Btn>
          <Btn on onClick={connect} disabled={busy}>{busy ? t("srv.connecting") : t("srv.join")}</Btn>
        </div>
        <p className="text-center text-xs font-bold text-white [text-shadow:1px_1px_0_#000]">{t("srv.peer")}</p>
      </div>
    </Backdrop>
  );
}
