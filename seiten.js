/* ================================================================
   SEITEN-LISTE  –  hier trägst du alle Games & Webseiten ein
   ================================================================

   So fügst du eine neue Seite hinzu:
     1. Ordner mit dem Spiel/der Webseite in "seiten/" legen,
        z.B. seiten/MeinSpiel/  (da drin irgendwo eine .html-Datei)
     2. Bild (png/jpg/gif/webp) in den Ordner "bilder/" legen
     3. Unten einen neuen Block { ... } kopieren und anpassen

   Felder:
     id          eindeutige Kennung (frei wählbar, keine Leerzeichen)
     kategorie   "games" oder "useful" (= Nützliche Webseiten)
     name        Name, der in der Liste steht
     ordner      Ordnername in "seiten/"
     datei       (optional) welche HTML im Ordner geöffnet wird,
                 z.B. "turbo-ring/index.html". Weglassen = automatisch:
                 erst index.html, sonst wird im Ordner nach einer
                 .html-Datei gesucht.
     url         (optional) statt "ordner" einen externen Link nehmen
     bild        Dateiname aus "bilder/" (oder kompletter Link).
                 Kein Bild = erster Buchstabe wird angezeigt.
     beschreibung (optional) kleine graue Zeile unter dem Namen
     sichtbar    false = Eintrag ausblenden (Ordner bleibt erhalten)
     zeigeInfo   true = vor dem Öffnen kommt ein Hinweis-Fenster
     infoText    Text für das Hinweis-Fenster

   Die Reihenfolge hier ist die Reihenfolge in der Liste.
   ================================================================ */

/* Ordner, in dem alle Seiten liegen */
const SEITEN_ORDNER = "seiten";

/* Ordner für die Vorschaubilder */
const BILDER_ORDNER = "bilder";

/* GitHub-Repo für die automatische HTML-Suche (Format "Name/Repo").
   Leer lassen = wird auf github.io automatisch erkannt. */
const GITHUB_REPO = "";

const SEITEN = [
  // ======================== GAMES ========================
  {
    id: "ffa_shooter",
    kategorie: "games",
    name: "FFA Shooter",
    ordner: "FFA",
    bild: "FFA.png",
    zeigeInfo: true,
    infoText: "Achtung: Alle Inhalte auf dieser Website sind öffentlich einsehbar und nicht privat!"
  },
  {
    id: "flight_simulator",
    kategorie: "games",
    name: "Flight Simulator",
    ordner: "Flight-sim",
    bild: "Flight_Simulator.jpg",
    zeigeInfo: false
  },
  {
    id: "ballman",
    kategorie: "games",
    name: "Ballman",
    ordner: "ball-man",
    bild: "ball-man.png",
    zeigeInfo: false
  },
  {
    id: "pizza_simulator",
    kategorie: "games",
    name: "Pizza Simulator",
    ordner: "Pizza",
    bild: "Pizza.png",
    zeigeInfo: false
  },
  {
    id: "car_horizon",
    kategorie: "games",
    name: "Car Horizon",
    ordner: "Car-Horizon",
    datei: "turbo-ring/index.html",
    bild: "Car-Horizon.png",
    zeigeInfo: false
  },
  {
    id: "sky_dash",
    kategorie: "games",
    name: "Sky Dash",
    ordner: "Sky-Dash",
    datei: "skydash/index.html",
    bild: "SkyDash.png",
    zeigeInfo: false
  },
  {
    id: "snake",
    kategorie: "games",
    name: "Snake",
    ordner: "Snake",
    bild: "Snake.png",
    zeigeInfo: false
  },
  {
    id: "2048",
    kategorie: "games",
    name: "2048",
    ordner: "2048",
    bild: "2048.png",
    zeigeInfo: false
  },
  {
    id: "schach",
    kategorie: "games",
    name: "Schach",
    ordner: "Schach",
    bild: "Schach.png",
    zeigeInfo: false
  },


  // ================= NÜTZLICHE WEBSEITEN =================
  {
    id: "live-chat",
    kategorie: "useful",
    name: "Live Chat",
    ordner: "live-chat",
    bild: "chat-icon.png",
    zeigeInfo: true,
    infoText: "Achtung: Alle Inhalte auf dieser Website sind öffentlich einsehbar und nicht privat!"
  },
  {
    id: "detect-ai",
    kategorie: "useful",
    name: "Detect.ai",
    ordner: "Detect.ai",
    bild: "detect-ai.png",
    zeigeInfo: false
  },
  {
    id: "wann-ist",
    kategorie: "useful",
    name: "WannIst",
    ordner: "wann-ist",
    bild: "wann-ist.png",
    zeigeInfo: false
  },
  {
    id: "glücksrad",
    kategorie: "useful",
    name: "Glücksrad",
    ordner: "Gluecksrad",
    bild: "Gluecksrad.png",
    zeigeInfo: false
  },
  {
    id: "song_editor",
    kategorie: "useful",
    name: "Song Editor",
    ordner: "song",
    bild: "song_editor.png",
    zeigeInfo: false
  },
];
