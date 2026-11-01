# Sky Dash

Ein Rhythmus-Jump-Spiel im Stil von Geometry Dash – von **Sky Games**.
Läuft direkt im Browser, auf PC und Handy (Querformat).

**Steuerung:** Leertaste / Pfeil hoch / W / Klick / Tippen = springen (gedrückt halten = immer wieder springen, beim Schiff = steigen).
Esc oder P = Pause, R = Neustart. Im Übungsmodus: Z = Checkpoint setzen, X = Checkpoint löschen.

## Ordner

| Ordner | Inhalt |
|---|---|
| `index.html` | Startseite – leitet automatisch zum Spiel weiter |
| `html/` | Spielseite (`index.html`) und Aussehen (`style.css`) |
| `js/` | Spiel-Code: Physik, Grafik, Musik, Menüs, Level-Daten |
| `cpp/` | Level-Compiler in C++ und die Leveldateien (`levels/*.txt`) |

## Level ändern oder neue bauen

1. Eine Datei in `cpp/levels/` bearbeiten (oder eine neue anlegen, z. B. `4_mein_level.txt`). Alle Befehle stehen oben in `cpp/leveltool.cpp`.
2. `cpp/build.bat` (Windows) bzw. `cpp/build.sh` (Mac/Linux) starten. Das braucht einen C++-Compiler (g++).
3. Das Tool prüft die Datei und schreibt `js/levels.js` neu.

## Auf GitHub Pages

Alle Dateien und Ordner so wie sie sind ins Repository hochladen (es sind weniger als 20 Dateien),
dann unter **Settings → Pages** den Branch `main` und `/ (root)` wählen.

## Online-Modus

Im Menü auf **🌐 Online**: dem öffentlichen Raum beitreten oder einen eigenen Raum mit Code erstellen und den Code an Freunde schicken. Alle, die dasselbe Level spielen, sieht man als Geister mit Namen. Läuft über PeerJS (direkte Verbindung zwischen den Browsern, der Gastgeber verteilt die Daten).

## Credits

- Logo-Animation, Spielidee & Leveldesign: Sky Games (rd-glitchedguy)
- Programmierung: Sky Games mit Claude (Anthropic)
- Grafik & Musik: komplett selbst erzeugt (im Code gezeichnet, Musik live im Browser komponiert)
- Online-Modus: PeerJS (MIT-Lizenz)
- Schrift: „Lilita One“ von Juan Montoreano, SIL Open Font License (Google Fonts)
- Inspiriert von *Geometry Dash* von RobTop Games. Sky Dash ist ein eigenständiges Fanprojekt, nicht mit RobTop Games verbunden, und enthält keine Grafiken, Sounds oder Musik aus Geometry Dash.
