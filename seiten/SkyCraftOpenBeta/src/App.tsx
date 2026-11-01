import { useState } from "react";
import GameView, { GameCfg } from "./ui/GameView";
import { MainMenu, ServerBrowser, SettingsScreen, WorldSelect } from "./ui/Screens";
import { Settings, loadSettings, saveSettings } from "./game/storage";
import { setLang, t } from "./i18n";

type Screen = "menu" | "worlds" | "servers" | "settings" | "game";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  setLang(settings.lang);
  // Das Spiel startet immer im Hauptmenü
  const [screen, setScreen] = useState<Screen>("menu");
  const [cfg, setCfg] = useState<GameCfg | null>(null);
  const [notice, setNotice] = useState("");

  const update = (p: Partial<Settings>) => {
    const s = { ...settings, ...p };
    setSettings(s);
    saveSettings(s);
  };
  const go = (s: string) => { setNotice(""); setScreen(s as Screen); };

  if (screen === "game" && cfg) {
    return (
      <GameView
        key={cfg.kind + (cfg.kind === "single" ? cfg.slot : cfg.mode + cfg.variant)}
        cfg={cfg} settings={settings} onSettings={update}
        onExit={(reason) => { setCfg(null); setNotice(reason ? t(reason) : ""); setScreen("menu"); }}
      />
    );
  }
  if (screen === "worlds") {
    return <WorldSelect back={() => go("menu")} play={(slot, data) => { setCfg({ kind: "single", slot, data }); setScreen("game"); }} />;
  }
  if (screen === "servers") {
    return <ServerBrowser back={() => go("menu")} join={(net, mode, variant) => { setCfg({ kind: "server", net, mode, variant }); setScreen("game"); }} />;
  }
  if (screen === "settings") return <SettingsScreen settings={settings} onChange={update} back={() => go("menu")} />;
  return <MainMenu go={go} notice={notice} />;
}
