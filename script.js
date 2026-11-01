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
  const cacheKey = "repo_html_" + repo;
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
        .filter(t => t.type === "blob" && /\.html?$/i.test(t.path))
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
        .filter(p => p.startsWith(basis))
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
  if (kat === "games") {
    titel.textContent = "Games";
    untertitel.textContent = "Wähle ein Game aus";
  } else {
    titel.textContent = "Nützliche Webseiten";
    untertitel.textContent = "Wähle eine Webseite aus";
  }
  zeichne();
}

function zeichne() {
  liste.textContent = "";
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
