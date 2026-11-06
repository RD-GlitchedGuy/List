/* ============================================================
   WEBSITES & GAMES – Liste
   Die Einträge stehen in seiten.js (Reihenfolge dort = Reihenfolge hier).
   ============================================================ */

/* ---------- Toast-Popup (rechts unten, rot) ---------- */
function zeigeToast(text) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast-msg";
  toast.textContent = text;
  container.append(toast);
  setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ---------- Hilfsfunktionen für Seiten ---------- */
function sichtbareSeiten() {
  return SEITEN.filter(s => s.sichtbar !== false);
}

/* Bildpfad: nur Dateiname -> aus dem Bilder-Ordner */
function bildPfad(b) {
  if (!b) return "";
  if (/^(https?:|data:|\/)/.test(b) || b.includes("/")) return b;
  return BILDER_ORDNER + "/" + b;
}

function ordnerBasis(s) {
  return SEITEN_ORDNER + "/" + String(s.ordner).replace(/^\/+|\/+$/g, "") + "/";
}

/* Vorläufiges Ziel (für href / Mittelklick), bevor gesucht wurde */
function vorlaeufigesZiel(s) {
  if (s.url) return s.url;
  if (!s.ordner) return "#";
  return ordnerBasis(s) + (s.datei ? s.datei.replace(/^\/+/, "") : "index.html");
}

/* ============================================================
   HTML IM ORDNER AUTOMATISCH FINDEN
   1. "datei" aus seiten.js, falls angegeben
   2. index.html im Ordner
   3. sonst: GitHub fragen, welche .html-Dateien im Ordner liegen
   ============================================================ */
function erkenneRepo() {
  if (typeof GITHUB_REPO === "string" && GITHUB_REPO.trim()) return GITHUB_REPO.trim();
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return "";
  const teil = location.pathname.split("/").filter(Boolean)[0];
  if (!teil || /\.html?$/i.test(teil)) return m[1] + "/" + location.hostname; // Haupt-Seite name.github.io
  return m[1] + "/" + teil;
}

let repoBaumPromise = null;
function holeRepoBaum() {
  if (repoBaumPromise) return repoBaumPromise;
  const repo = erkenneRepo();
  if (!repo) return (repoBaumPromise = Promise.resolve(null));
  const cacheKey = "repo_dateien_" + repo;
  try {
    const c = sessionStorage.getItem(cacheKey);
    if (c) return (repoBaumPromise = Promise.resolve(JSON.parse(c)));
  } catch (e) {}

  const lade = (ref) => fetch(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`)
    .then(r => r.ok ? r.json() : null);

  repoBaumPromise = lade("HEAD")
    .then(j => (j && j.tree) ? j : lade("main"))
    .then(j => (j && j.tree) ? j : lade("master"))
    .then(j => {
      if (!j || !j.tree) return null;
      const pfade = j.tree
        .filter(t => t.type === "blob")
        .map(t => t.path);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(pfade)); } catch (e) {}
      return pfade;
    })
    .catch(() => null);
  return repoBaumPromise;
}

async function existiert(url) {
  if (location.protocol === "file:") return true; // lokal kann nicht geprüft werden
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

const gefundeneZiele = {};
async function findeZiel(s) {
  if (s.url) return s.url;
  if (!s.ordner) return null;
  const key = s.id || s.ordner;
  if (gefundeneZiele[key]) return gefundeneZiele[key];

  const basis = ordnerBasis(s);
  let ziel = null;

  if (s.datei) {
    ziel = basis + s.datei.replace(/^\/+/, "");
  } else if (await existiert(basis + "index.html")) {
    ziel = basis + "index.html";
  } else {
    const pfade = await holeRepoBaum();
    if (pfade) {
      const tiefe = p => p.split("/").length;
      const istIndex = p => /(^|\/)index\.html?$/i.test(p) ? 1 : 0;
      const kandidaten = pfade
        .filter(p => p.startsWith(basis) && /\.html?$/i.test(p))
        .sort((a, b) => tiefe(a) - tiefe(b) || istIndex(b) - istIndex(a) || a.localeCompare(b));
      if (kandidaten.length) ziel = kandidaten[0];
    }
  }

  if (ziel) gefundeneZiele[key] = ziel;
  return ziel;
}

async function oeffneSeite(item) {
  const ziel = await findeZiel(item);
  if (!ziel) {
    zeigeToast(`Keine HTML-Datei in "${SEITEN_ORDNER}/${item.ordner}/" gefunden.`);
    return;
  }
  setTimeout(() => { window.location.href = ziel; }, 200);
}

/* ---------- Info-Fenster vor dem Öffnen ---------- */
let zielItem = null;

function starteLinkAufruf(e, item) {
  e.preventDefault();
  if (item.zeigeInfo === false) {
    oeffneSeite(item);
    return;
  }
  zielItem = item;
  document.getElementById("modal-titel").textContent = item.name;
  document.getElementById("modal-text").textContent = item.infoText || `Du wirst zu "${item.name}" weitergeleitet. Möchtest du fortfahren?`;
  document.getElementById("info-modal").classList.remove("hidden");
}

function bestaetigeWeiterleitung() {
  const item = zielItem;
  schliesseInfo();
  if (item) oeffneSeite(item);
}

function schliesseInfo() {
  document.getElementById("info-modal").classList.add("hidden");
  zielItem = null;
}

/* ---------- Kategorien & Liste ---------- */
const liste = document.getElementById("liste");
const titel = document.getElementById("titel");
const untertitel = document.getElementById("untertitel");
let aktiveKategorie = "games";

function setKategorie(kat) {
  aktiveKategorie = kat;
  document.getElementById("tab-games").classList.toggle("active", kat === "games");
  document.getElementById("tab-useful").classList.toggle("active", kat === "useful");
  document.getElementById("tab-downloads").classList.toggle("active", kat === "downloads");
  if (kat === "games") {
    titel.textContent = "Games";
    untertitel.textContent = "Wähle ein Game aus";
  } else if (kat === "downloads") {
    titel.textContent = "Downloads";
    untertitel.textContent = "Apps zum Herunterladen";
  } else {
    titel.textContent = "Nützliche Webseiten";
    untertitel.textContent = "Wähle eine Webseite aus";
  }
  zeichne();
}

function zeichne() {
  liste.textContent = "";
  if (aktiveKategorie === "downloads") { zeichneDownloads(); return; }
  sichtbareSeiten()
    .filter(s => s.kategorie === aktiveKategorie)
    .forEach((s, idx) => {
      const li = document.createElement("li");
      li.style.animationDelay = `${idx * 0.06}s`;

      const a = document.createElement("a");
      a.className = "link";
      a.href = vorlaeufigesZiel(s);
      a.target = "_self";
      a.rel = "noopener noreferrer";
      a.addEventListener("click", (e) => starteLinkAufruf(e, s));
      // Beim Drüberfahren schon mal die richtige HTML suchen (für Mittelklick / neuer Tab)
      a.addEventListener("pointerenter", () => {
        findeZiel(s).then(z => { if (z) a.href = z; });
      }, { once: true });

      const ico = document.createElement("span");
      ico.className = "ico";
      if (s.bild) {
        const img = document.createElement("img");
        img.src = bildPfad(s.bild);
        img.alt = "";
        img.onerror = () => { ico.textContent = s.name.charAt(0).toUpperCase(); };
        ico.append(img);
      } else {
        ico.textContent = s.name.charAt(0).toUpperCase();
      }

      let unterzeile = s.beschreibung || s.ordner || s.url || "";
      if (!s.beschreibung && s.url) {
        try { unterzeile = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) {}
      }

      const txt = document.createElement("span");
      txt.className = "txt";
      const n = document.createElement("span");
      n.className = "name";
      n.textContent = s.name;
      const d = document.createElement("span");
      d.className = "dom";
      d.textContent = unterzeile;
      txt.append(n, d);
      a.append(ico, txt);

      li.append(a);
      liste.append(li);
    });
}

zeichne();


/* ============================================================
   DOWNLOADS
   Apps liegen in downloads/apps/<App>/<System>/<Datei>,
   Bilder in downloads/bilder/. Einstellungen: downloads.js
   ============================================================ */
const PFEIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/></svg>';

function systemRang(n) {
  const i = SYSTEM_REIHENFOLGE.findIndex(x => x.toLowerCase() === n.toLowerCase());
  return i < 0 ? 99 : i;
}

/* Fertige Download-Liste: [{ ordner, name, bild, beschreibung, optionen:[{system, datei, pfad}] }] */
async function holeDownloads() {
  const basis = DOWNLOAD_ORDNER.replace(/\/+$/, "") + "/";
  const bildBasis = DOWNLOAD_BILDER.replace(/\/+$/, "") + "/";
  const pfade = await holeRepoBaum();
  const apps = new Map();

  // 1. Einträge aus downloads.js (Reihenfolge + Ersatz-Dateien)
  DOWNLOADS.forEach(d => {
    const optionen = [];
    Object.entries(d.dateien || {}).forEach(([system, dateien]) => {
      [].concat(dateien).forEach(datei => optionen.push({
        system, datei, pfad: basis + d.ordner + "/" + system + "/" + datei
      }));
    });
    apps.set(d.ordner, { ...d, optionen });
  });

  // 2. Was wirklich auf GitHub liegt, ersetzt die Ersatz-Dateien
  if (pfade) {
    const gefunden = new Map();
    pfade.filter(p => p.startsWith(basis)).forEach(p => {
      const teile = p.slice(basis.length).split("/");
      if (teile.length < 2 || teile.some(t => t.startsWith("."))) return;
      const ordner = teile[0];
      const system = teile.length > 2 ? teile[1] : "Download";
      const datei = teile.slice(teile.length > 2 ? 2 : 1).join("/");
      if (!gefunden.has(ordner)) gefunden.set(ordner, []);
      gefunden.get(ordner).push({ system, datei, pfad: p });
    });
    gefunden.forEach((optionen, ordner) => {
      const alt = apps.get(ordner) || { ordner };
      apps.set(ordner, { ...alt, optionen });
    });
    // Bild automatisch: downloads/bilder/<Ordner>.png/.jpg/...
    apps.forEach(a => {
      if (a.bild) return;
      const treffer = pfade.find(p => p.startsWith(bildBasis) &&
        p.slice(bildBasis.length).replace(/\.[^.]+$/, "").toLowerCase() === a.ordner.toLowerCase());
      if (treffer) a.bild = treffer.slice(bildBasis.length);
    });
  }

  return [...apps.values()]
    .filter(a => a.sichtbar !== false && a.optionen.length)
    .map(a => ({
      ...a,
      name: a.name || a.ordner,
      optionen: a.optionen.sort((x, y) =>
        systemRang(x.system) - systemRang(y.system) ||
        x.system.localeCompare(y.system) || x.datei.localeCompare(y.datei))
    }));
}

function downloadBild(b) {
  if (!b) return "";
  if (/^(https?:|data:|\/)/.test(b) || b.includes("/")) return b;
  return DOWNLOAD_BILDER.replace(/\/+$/, "") + "/" + b;
}

async function zeichneDownloads() {
  const apps = await holeDownloads();
  if (aktiveKategorie !== "downloads") return;
  liste.textContent = "";
  if (!apps.length) {
    const li = document.createElement("li");
    li.className = "leer";
    li.textContent = "Noch keine Downloads da.";
    liste.append(li);
    return;
  }
  apps.forEach((app, idx) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${idx * 0.06}s`;

    const a = document.createElement("a");
    a.className = "link";
    a.href = app.optionen[0].pfad;
    a.addEventListener("click", (e) => { e.preventDefault(); starteDownload(app); });

    const ico = document.createElement("span");
    ico.className = "ico";
    if (app.bild) {
      const img = document.createElement("img");
      img.src = downloadBild(app.bild);
      img.alt = "";
      img.onerror = () => { ico.textContent = app.name.charAt(0).toUpperCase(); };
      ico.append(img);
    } else {
      ico.textContent = app.name.charAt(0).toUpperCase();
    }

    const systeme = [...new Set(app.optionen.map(o => o.system))].join(" · ");
    const txt = document.createElement("span");
    txt.className = "txt";
    const n = document.createElement("span");
    n.className = "name";
    n.textContent = app.name;
    const d = document.createElement("span");
    d.className = "dom";
    d.textContent = app.beschreibung ? `${app.beschreibung} · ${systeme}` : systeme;
    txt.append(n, d);

    const pfeil = document.createElement("span");
    pfeil.className = "dl-pfeil";
    pfeil.innerHTML = PFEIL_SVG;

    a.append(ico, txt, pfeil);
    li.append(a);
    liste.append(li);
  });
}

function ladeDatei(o) {
  const a = document.createElement("a");
  a.href = o.pfad;
  a.download = o.datei.split("/").pop();
  document.body.append(a);
  a.click();
  a.remove();
}

/* Nur eine Möglichkeit -> sofort laden, sonst fragen */
function starteDownload(app) {
  if (app.optionen.length === 1) { ladeDatei(app.optionen[0]); return; }

  const zaehler = {};
  app.optionen.forEach(o => { zaehler[o.system] = (zaehler[o.system] || 0) + 1; });

  document.getElementById("download-titel").textContent = app.name;
  const wahl = document.getElementById("download-wahl");
  wahl.textContent = "";
  app.optionen.forEach(o => {
    const b = document.createElement("button");
    b.className = "dl-option";
    const s = document.createElement("span");
    s.className = "dl-system";
    s.textContent = o.system;
    b.append(s);
    if (zaehler[o.system] > 1) {
      const f = document.createElement("span");
      f.className = "dl-datei";
      f.textContent = o.datei.split("/").pop();
      b.append(f);
    }
    b.insertAdjacentHTML("beforeend", PFEIL_SVG);
    b.addEventListener("click", () => { schliesseDownload(); ladeDatei(o); });
    wahl.append(b);
  });
  document.getElementById("download-modal").classList.remove("hidden");
}

function schliesseDownload() {
  document.getElementById("download-modal").classList.add("hidden");
}
