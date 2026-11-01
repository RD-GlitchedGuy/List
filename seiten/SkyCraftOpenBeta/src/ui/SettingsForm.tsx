import type { Lang, SaveData, Settings } from "../game/storage";
import { t } from "../i18n";
import { Seg, Slider, Toggle } from "./ui";

const LANGS: [Lang, string][] = [["de", "Deutsch"], ["en", "English"], ["es", "Español"], ["fr", "Français"]];

export function SettingsForm({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-sm font-bold text-neutral-800">{t("set.language")}</div>
        <div className="grid grid-cols-2 gap-2">
          {LANGS.map(([l, n]) => (
            <button key={l} className={`mc-btn !py-1.5 !text-sm ${settings.lang === l ? "on" : ""}`} onClick={() => onChange({ lang: l })}>{n}</button>
          ))}
        </div>
      </div>
      <label className="block text-sm font-bold text-neutral-800">
        <div className="mb-1">{t("set.name")}</div>
        <input className="mc-input" maxLength={16} value={settings.name} onChange={(e) => onChange({ name: e.target.value || "Steve" })} />
      </label>
      <Slider label={t("set.sens")} value={settings.sens} min={0.3} max={2.5} step={0.1} onChange={(v) => onChange({ sens: v })} fmt={(v) => v.toFixed(1) + "x"} />
      <Slider label={t("set.fov")} value={settings.fov} min={50} max={110} onChange={(v) => onChange({ fov: v })} />
      <Slider label={t("set.render")} value={settings.renderDist} min={2} max={10} onChange={(v) => onChange({ renderDist: v })} fmt={(v) => v + " " + t("set.chunks")} />
    </div>
  );
}

export function WorldForm({ v, onChange, create }: { v: Partial<SaveData> & { seedText?: string }; onChange: (p: Partial<SaveData>) => void; create?: boolean }) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-neutral-800">
        <div className="mb-1">{t("world.name")}</div>
        <input className="mc-input" maxLength={24} value={v.name || ""} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {create && (
        <>
          <label className="block text-sm font-bold text-neutral-800">
            <div className="mb-1">{t("world.seed")}</div>
            <input className="mc-input" placeholder={t("world.seedHint")} value={v.seedText || ""} onChange={(e) => onChange({ seedText: e.target.value })} />
          </label>
          <div>
            <div className="mb-1 text-sm font-bold text-neutral-800">{t("world.type")}</div>
            <Seg options={[["normal", t("world.normal")], ["flat", t("world.flat")], ["sky", t("world.sky")]]} value={(v.type as any) || "normal"} onChange={(x) => onChange({ type: x })} />
          </div>
          <Toggle label={t("world.trees")} value={v.trees !== false} onChange={(x) => onChange({ trees: x })} />
        </>
      )}
      <div>
        <div className="mb-1 text-sm font-bold text-neutral-800">{t("world.gm")}</div>
        <Seg options={[["survival", t("gm.survival")], ["creative", t("gm.creative")]]} value={v.gm || "survival"} onChange={(x) => onChange({ gm: x })} />
      </div>
      <Toggle label={t("world.cheats")} value={v.cheats !== false} onChange={(x) => onChange({ cheats: x })} />
      <Toggle label={t("world.daylight")} value={v.daylight !== false} onChange={(x) => onChange({ daylight: x })} />
      <Toggle label={t("world.keepInv")} value={v.keepInv !== false} onChange={(x) => onChange({ keepInv: x })} />
    </div>
  );
}
