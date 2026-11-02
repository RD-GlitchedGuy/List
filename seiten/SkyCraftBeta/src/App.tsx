import { useEffect, useState } from "react";
import GameView, { GameCfg } from "./ui/GameView";
import { CreditsScreen, MainMenu, ResourcePacksScreen, ServerBrowser, SettingsScreen, WorldSelect } from "./ui/Screens";
import { Settings, loadSettings, saveSettings } from "./game/storage";
import { initializeResourcePack } from "./game/resourcePacks";
import { playButtonSound, resumeAudioAfterGesture, setMusicTrack, setSoundsEnabled } from "./game/audio";
import { Net } from "./game/net";
import type { Mode, Variant } from "./game/maps";
import { setLang, t } from "./i18n";

type Screen = "menu" | "worlds" | "servers" | "settings" | "resource-packs" | "credits" | "game";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  setLang(settings.lang);
  // Das Spiel startet immer im Hauptmenü
  const [screen, setScreen] = useState<Screen>("menu");
  const [cfg, setCfg] = useState<GameCfg | null>(null);
  const [notice, setNotice] = useState("");
  const [hubNet, setHubNet] = useState<Net | null>(null);
  useEffect(() => { initializeResourcePack(); }, []);
  useEffect(() => { setSoundsEnabled(settings.aiMusic); }, [settings.aiMusic]);
  useEffect(() => {
    setMusicTrack(screen === "menu" ? "menu_music" : screen === "game" ? "game_music" : null);
  }, [screen]);
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button")) playButtonSound();
      resumeAudioAfterGesture();
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const update = (p: Partial<Settings>) => {
    const s = { ...settings, ...p, controls: { ...settings.controls, ...p.controls } };
    setSettings(s);
    saveSettings(s);
  };
  const go = (s: string) => { setNotice(""); setScreen(s as Screen); };
  const startMatch = async (mode: Mode, variant: Variant, matchId: string) => {
    const net = await Net.connectMatch(matchId, mode, variant);
    net.start(settings.name, settings.skin || "");
    setCfg({ kind: "server", net, mode, variant });
    setScreen("game");
  };

  if (screen === "game" && cfg) {
    const returnToHub = () => {
      if (cfg.kind === "server" && !cfg.hub && hubNet && !hubNet.closed) {
        setCfg({ kind: "server", net: hubNet, mode: "oneblock", variant: "solo", hub: true });
        setScreen("game");
        return;
      }
      if (hubNet?.closed) setHubNet(null);
      setCfg(null);
      setNotice("");
      setScreen(cfg.kind === "server" ? "servers" : "menu");
    };
    return (
      <GameView
        key={cfg.kind + (cfg.kind === "single" ? cfg.slot : cfg.mode + cfg.variant + (cfg.hub ? "hub" : ""))}
        cfg={cfg} settings={settings} onSettings={update}
        onReturnHub={returnToHub}
        onStartMatch={startMatch}
        onExit={(reason) => {
          setCfg(null);
          setNotice(reason ? t(reason) : "");
          if (cfg.kind === "server" && cfg.hub) {
            hubNet?.close();
            setHubNet(null);
            setScreen("menu");
          } else if (cfg.kind === "server" && hubNet && !hubNet.closed) {
            setCfg({ kind: "server", net: hubNet, mode: "oneblock", variant: "solo", hub: true });
            setScreen("game");
          } else {
            if (hubNet) { hubNet.close(); setHubNet(null); }
            setScreen(cfg.kind === "server" ? "servers" : "menu");
          }
        }}
      />
    );
  }
  if (screen === "worlds") {
    return <WorldSelect back={() => go("menu")} play={(slot, data) => { setCfg({ kind: "single", slot, data }); setScreen("game"); }} />;
  }
  if (screen === "servers") {
    return (
      <ServerBrowser
        back={() => go("menu")}
        join={(net) => { setHubNet(net); setCfg({ kind: "server", net, mode: "oneblock", variant: "solo", hub: true }); setScreen("game"); }}
      />
    );
  }
  if (screen === "settings") return <SettingsScreen settings={settings} onChange={update} back={() => go("menu")} openResourcePacks={() => go("resource-packs")} />;
  if (screen === "resource-packs") return <ResourcePacksScreen back={() => go("settings")} />;
  if (screen === "credits") return <CreditsScreen back={() => go("menu")} />;
  return <MainMenu go={go} notice={notice} />;
}
