# Sky Swing – ein Sky-Games-Spiel

Den ganzen Ordner so wie er ist ins GitHub-Repo hochladen und GitHub Pages einschalten. Dann die Pages-Adresse öffnen.

Per Doppelklick auf `index.html` startet das Spiel nicht, weil Browser JavaScript-Module von der Festplatte blockieren. Lokal testen geht mit `python -m http.server` im Ordner und dann `localhost:8000`.

```
index.html          Seite (nur HTML)
css/style.css       Aussehen von Menüs, HUD und Touch-Buttons
js/main.js          Einstieg und Spielschleife
js/engine.js        Renderer, Himmel, Licht, Bloom, Tag-Nacht-Ablauf, Grafikstufen
js/city.js          Stadt, Fassaden, Dach-Ausstattung, Hochbahn-Strecke, U-Bahn-Eingänge, Verkehr, Park, Sky-Funken, Kollision
js/hero.js          Held: Modell, Skelett, Animationen, Tricks, Seile, Tempo-Spuren
js/player.js        Physik und alle Moves
js/camera.js        Verfolgerkamera mit Wackeln
js/input.js         Tastatur, Maus, Controller, Touch
js/race.js          Ring-Rennen
js/missions.js      Kurier-Missionen und Verfolgungsjagd
js/life.js          Fußgänger, Tauben, Hubschrauber
js/trains.js        Hochbahn-Züge (fahren, halten, man kann mitfahren)
js/roofs.js         Dachgärten, Pools, Helipads, Werbetafeln, U-Bahn-Laternen
js/net.js           Online-Modus (PeerJS): Räume, öffentliche Lobby, Mitspieler
js/score.js         Kombo-Punkte
js/minimap.js       Minikarte
js/menu.js          Pausemenü und Einstellungen
js/hud.js           Anzeigen und Hilfe
js/audio.js         Sound-Engine: Raumklang, Hall in Häuserschluchten, Varianten, Wind nach Tempo
js/settings.js      gespeicherte Einstellungen und Bestwerte
js/state.js         gemeinsamer Spielzustand
js/util.js          Helfer
js/lib/             three.js, Zusatzmodule und PeerJS (lokal, kein CDN nötig)
assets/             Icon und Logo
sounds/             sfx.mp3 + sfx.json (alle kurzen Effekte in einer Datei), Schleifen für Wind, Stadt, Verkehr,
                    Hubschrauber, Drohne, Hochbahn, Aufladen; CREDITS.txt mit allen Quellen und Lizenzen
```

## Online
Online spielen nutzt den kostenlosen öffentlichen PeerJS-Server (0.peerjs.com) für den Verbindungsaufbau, danach gehen die Daten direkt von Browser zu Browser.
Die öffentliche Lobby ist selbst ein Spieler: Wer zuerst online geht, verwaltet die Raumliste. Geht er offline, übernimmt automatisch der nächste.
In manchen Firmen- oder Schulnetzen blockiert eine Firewall direkte Verbindungen, dann klappt das Beitreten dort nicht.

## Sounds
Kurze Effekte stecken zusammen in `sounds/sfx.mp3`, ihre Start- und Endzeiten stehen in `sounds/sfx.json`. So bleibt die Dateianzahl für den GitHub-Upload klein.
Quellen: Kenney (CC0 / MIT), Godot TPS Demo (CC-BY 3.0) und eigene Klangsynthese. Details und Lizenztexte in `sounds/CREDITS.txt`.

## Strg+W
Im Vollbild (Menü → Vollbild: An) sperrt das Spiel in Chrome und Edge die Tastatur, dann schließt Strg+W den Tab nicht. Zum Verlassen Esc gedrückt halten.
Außerhalb des Vollbilds fragt der Browser vor dem Schließen nach. Sturzflug liegt nur noch auf C.
