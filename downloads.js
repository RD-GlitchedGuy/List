/* ================================================================
   DOWNLOADS  –  Apps zum Herunterladen (Tab "Downloads")
   ================================================================

   So sieht der Ordner aus:
     downloads/
       apps/
         SkyLauncher/          <- ein Ordner pro App
           Windows/            <- ein Ordner pro System
             SkyLauncher.zip
           Mac/                (optional)
           Linux/              (optional)
       bilder/
         SkyLauncher.png       <- Bild = gleicher Name wie der App-Ordner

   Neue App: Ordner nach downloads/apps/ legen, Bild nach
   downloads/bilder/ – fertig. Auf GitHub Pages wird beides
   automatisch gefunden, auch ohne Eintrag hier unten.

   Beim Klick auf "Download":
     nur ein System / eine Datei  -> lädt sofort
     mehrere Systeme              -> Fenster fragt, welches

   Die Liste unten ist optional. Sie legt Name, Bild, Text und
   Reihenfolge fest und gilt als Ersatz, wenn GitHub nicht gefragt
   werden kann (z. B. lokal getestet):
     ordner        Ordnername in downloads/apps/
     name          angezeigter Name (sonst = Ordnername)
     bild          Datei aus downloads/bilder/ (sonst automatisch)
     beschreibung  graue Zeile unter dem Namen
     dateien       { System: ["Datei", ...] }  nur als Ersatz
     sichtbar      false = ausblenden
   ================================================================ */

const DOWNLOAD_ORDNER = "downloads/apps";
const DOWNLOAD_BILDER = "downloads/bilder";

/* Reihenfolge der Systeme im Auswahlfenster; alles andere danach */
const SYSTEM_REIHENFOLGE = ["Windows", "Mac", "macOS", "Linux", "iOS", "Android"];

const DOWNLOADS = [
  {
    ordner: "SkyLauncher-setup",
    name: "Sky Launcher",
    bild: "SkyLauncher.png",
    beschreibung: "Sky-Launcher",
    dateien: { Windows: ["SkyLauncher.zip"] }
  },
];
