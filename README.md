# Websites & Games – Liste

Die `index.html` ist die Startseite (die Liste). Jedes Spiel und jede Webseite liegt in einem eigenen Ordner unter `seiten/`. Klickt man in der Liste auf einen Eintrag, wird im passenden Ordner die HTML-Datei gesucht und geöffnet.

```
index.html        Startseite (nur HTML)
style.css         Design der Startseite
script.js         Logik der Startseite
seiten.js         HIER stehen alle Einträge  ← nur das musst du bearbeiten
bilder/           Vorschaubilder für die Liste
seiten/
  FFA/            ein Ordner pro Spiel / Webseite
    index.html    (meist aufgeteilt in index.html, style.css, script.js)
  Flight-sim/
  Car-Horizon/
  ...
```

## Neues Spiel / neue Webseite hinzufügen

1. Ordner nach `seiten/` legen, z. B. `seiten/MeinSpiel/`. Alles, was zum Spiel gehört (HTML, JS, Modelle, Sounds), kommt da rein, genau so wie im alten Repo.
2. Bild nach `bilder/` legen, z. B. `bilder/MeinSpiel.png`.
3. In `seiten.js` einen Block kopieren und anpassen:

```js
  {
    id: "mein_spiel",
    kategorie: "games",          // oder "useful"
    name: "Mein Spiel",
    ordner: "MeinSpiel",
    bild: "MeinSpiel.png",
    zeigeInfo: false
  },
```

Fertig. Mehr braucht es nicht.

## Welche HTML wird geöffnet?

Der Reihe nach:

1. Steht bei dem Eintrag `datei: "..."`, wird genau die genommen (z. B. Car Horizon: `turbo-ring/index.html`).
2. Sonst `index.html` direkt im Ordner.
3. Gibt es keine, fragt die Seite bei GitHub nach, welche `.html`-Dateien im Ordner liegen, und nimmt die oberste (eine `index.html` wird bevorzugt). Auf `NAME.github.io/REPO/` wird das Repo automatisch erkannt; bei einer eigenen Domain trägst du oben in `seiten.js` `GITHUB_REPO = "Name/Repo"` ein.

## Ändern / ausblenden

- **Name, Bild, Kategorie:** einfach in `seiten.js` ändern.
- **Ausblenden ohne zu löschen:** `sichtbar: false` (so ist Smashball gerade drin).
- **Reihenfolge:** so wie die Blöcke in `seiten.js` stehen.

## Lokal testen

Nicht per Doppelklick öffnen, sondern einen kleinen Server starten (sonst blockiert der Browser einige Spiele):

```
python -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

## Support-Chat & Logo

- **Support:** Der runde Headset-Button unten links in der Liste öffnet den Support-Chat (`support/index.html`). Im Chat bringt der runde Pfeil-Button unten rechts wieder zurück zur Liste.
  Liegt der Chat woanders, die Adresse in `index.html` (`id="support-btn"`) und in `support/config.js` (`listeUrl`) ändern.
- **Logo:** Das Logo (`logo.svg`, Tab-Icon `favicon.svg` / `favicon.ico`) erscheint nur im Browser-Tab. Neue Seiten bekommen es mit dieser Zeile im `<head>` (Pfad je nach Tiefe anpassen):
  `<link rel="icon" href="../../favicon.svg" type="image/svg+xml">`
