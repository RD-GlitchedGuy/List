// Sky Dash — Level-Compiler (Sky Games)
// Liest die Leveldateien aus cpp/levels/*.txt und schreibt js/levels.js.
//
// Bauen:   g++ -O2 -std=c++17 leveltool.cpp -o leveltool
// Nutzen:  ./leveltool levels -o ../js/levels.js
//
// Befehle in einer Leveldatei (eine Zeile = ein Befehl, # = Kommentar):
//   name <Text>            Levelname            diff <easy|normal|hard|harder|insane>
//   stars <n>              Sterne               speed <Blöcke/s>
//   bpm <n>                Tempo der Musik      song <0..2> Musikstil
//   length <x>             Levelende            color <x> <hg> <boden> <akzent>
//   block X Y [B] [H]      Block                slab X Y [B]   halber Block
//   spike X Y [n]          Stachel (n nebeneinander)
//   cspike X Y [n]         hängender Stachel
//   orb X Y | borb X Y     gelber / blauer Ring
//   pad X Y                Sprungpad            coin X Y      Münze
//   deco X Y [B] [H]       Deko-Block im Hintergrund (keine Kollision)
//   ship X [Y] | cube X [Y] | wave X [Y] | gup X [Y] | gdown X [Y]   Portale
//   saw X Y [Größe]        Kreissäge (Größe = Durchmesser in Blöcken)
//   def NAME ... enddef    Muster definieren (relative Koordinaten)
//   use NAME X [Y]         Muster einsetzen
//   loop NAME X ANZAHL ABSTAND [Y]   Muster wiederholen

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

enum Type { BLOCK = 1, SPIKE, CSPIKE, ORB, BORB, PAD, SHIP, CUBE, GUP, GDOWN, COIN, SLAB, DECO, WAVE, SAW };

struct Obj { int t; double x, y, w, h; };
struct ColorTrig { double x; std::string bg, ground, accent; };

struct Level {
  std::string id, name = "Unbenannt", diff = "easy";
  int stars = 1, bpm = 128, song = 0;
  double speed = 10.4, length = 0;
  std::vector<Obj> objs;
  std::vector<ColorTrig> colors;
};

using Tokens = std::vector<std::string>;

static int errors = 0;

static void err(const std::string& file, int line, const std::string& msg) {
  std::cerr << file << ":" << line << ": Fehler: " << msg << "\n";
  ++errors;
}

static Tokens split(const std::string& s) {
  Tokens t; std::istringstream in(s); std::string w;
  while (in >> w) { if (w[0] == '#' && (w.size() != 7 || t.empty() || t[0] != "color")) break; t.push_back(w); }
  return t;
}

static bool num(const std::string& s, double& out) {
  try { size_t p; out = std::stod(s, &p); return p == s.size(); } catch (...) { return false; }
}

static bool isHex(const std::string& s) {
  if (s.size() != 7 || s[0] != '#') return false;
  return std::all_of(s.begin() + 1, s.end(), [](char c) { return std::isxdigit((unsigned char)c); });
}

static std::string fmt(double v) {
  std::ostringstream o; o.setf(std::ios::fixed); o.precision(2); o << v;
  std::string s = o.str();
  while (s.back() == '0') s.pop_back();
  if (s.back() == '.') s.pop_back();
  return s;
}

static std::string jsonStr(const std::string& s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') r += '\\'; r += c; }
  return r + "\"";
}

class Compiler {
 public:
  Level lv;
  std::map<std::string, std::vector<std::pair<int, Tokens>>> defs;
  std::string file;

  void run(const Tokens& t, int line, double ox, double oy, int depth) {
    if (depth > 8) { err(file, line, "Muster zu tief verschachtelt"); return; }
    const std::string& c = t[0];
    auto n = [&](size_t i, double def, bool need) -> double {
      double v;
      if (i < t.size()) { if (num(t[i], v)) return v; err(file, line, "Zahl erwartet: " + t[i]); return def; }
      if (need) err(file, line, "zu wenige Angaben für '" + c + "'");
      return def;
    };
    auto add = [&](int type, double x, double y, double w = 1, double h = 1) {
      lv.objs.push_back({type, x + ox, y + oy, w, h});
    };

    if (c == "name") { lv.name = rest(t); }
    else if (c == "diff") { lv.diff = t.size() > 1 ? t[1] : "easy"; }
    else if (c == "stars") { lv.stars = (int)n(1, 1, true); }
    else if (c == "speed") { lv.speed = n(1, 10.4, true); }
    else if (c == "bpm") { lv.bpm = (int)n(1, 128, true); }
    else if (c == "song") { lv.song = (int)n(1, 0, true); }
    else if (c == "length") { lv.length = n(1, 0, true); }
    else if (c == "color") {
      if (t.size() < 5 || !isHex(t[2]) || !isHex(t[3]) || !isHex(t[4])) { err(file, line, "color X #rrggbb #rrggbb #rrggbb"); return; }
      lv.colors.push_back({n(1, 0, true) + ox, t[2], t[3], t[4]});
    }
    else if (c == "block") { add(BLOCK, n(1, 0, true), n(2, 0, true), n(3, 1, false), n(4, 1, false)); }
    else if (c == "slab") {
      double x = n(1, 0, true), y = n(2, 0, true), w = n(3, 1, false);
      add(SLAB, x, y, w, 0.5);
    }
    else if (c == "spike" || c == "cspike") {
      double x = n(1, 0, true), y = n(2, 0, true); int cnt = (int)n(3, 1, false);
      for (int i = 0; i < cnt; ++i) add(c == "spike" ? SPIKE : CSPIKE, x + i, y);
    }
    else if (c == "deco") { add(DECO, n(1, 0, true), n(2, 0, true), n(3, 1, false), n(4, 1, false)); }
    else if (c == "orb") add(ORB, n(1, 0, true), n(2, 0, true));
    else if (c == "borb") add(BORB, n(1, 0, true), n(2, 0, true));
    else if (c == "pad") add(PAD, n(1, 0, true), n(2, 0, true));
    else if (c == "coin") add(COIN, n(1, 0, true), n(2, 0, true));
    else if (c == "ship") add(SHIP, n(1, 0, true), n(2, 0, false));
    else if (c == "wave") add(WAVE, n(1, 0, true), n(2, 0, false));
    else if (c == "saw") { double sz = n(3, 1, false); add(SAW, n(1, 0, true), n(2, 0, true), sz, sz); }
    else if (c == "cube") add(CUBE, n(1, 0, true), n(2, 0, false));
    else if (c == "gup") add(GUP, n(1, 0, true), n(2, 0, false));
    else if (c == "gdown") add(GDOWN, n(1, 0, true), n(2, 0, false));
    else if (c == "use" || c == "loop") {
      if (t.size() < 3) { err(file, line, "Mustername und X fehlen"); return; }
      auto it = defs.find(t[1]);
      if (it == defs.end()) { err(file, line, "unbekanntes Muster '" + t[1] + "'"); return; }
      double x = n(2, 0, true);
      int count = 1; double stepX = 0, y = 0;
      if (c == "use") y = n(3, 0, false);
      else { count = (int)n(3, 1, true); stepX = n(4, 0, true); y = n(5, 0, false); }
      for (int i = 0; i < count; ++i)
        for (auto& [ln, tk] : it->second) run(tk, ln, ox + x + i * stepX, oy + y, depth + 1);
    }
    else err(file, line, "unbekannter Befehl '" + c + "'");
  }

  static std::string rest(const Tokens& t) {
    std::string s;
    for (size_t i = 1; i < t.size(); ++i) s += (i > 1 ? " " : "") + t[i];
    return s;
  }

  bool load(const fs::path& p) {
    file = p.filename().string();
    lv.id = p.stem().string();
    std::ifstream in(p);
    if (!in) { err(file, 0, "Datei nicht lesbar"); return false; }
    std::string line; int ln = 0; std::string cur;
    while (std::getline(in, line)) {
      ++ln;
      Tokens t = split(line);
      if (t.empty()) continue;
      if (t[0] == "def") { if (t.size() < 2) err(file, ln, "def NAME"); else { cur = t[1]; defs[cur].clear(); } continue; }
      if (t[0] == "enddef") { cur.clear(); continue; }
      if (!cur.empty()) { defs[cur].push_back({ln, t}); continue; }
      run(t, ln, 0, 0, 0);
    }
    validate();
    return true;
  }

  void validate() {
    std::sort(lv.objs.begin(), lv.objs.end(), [](const Obj& a, const Obj& b) {
      return a.x != b.x ? a.x < b.x : a.y < b.y;
    });
    double maxX = 0;
    for (auto& o : lv.objs) maxX = std::max(maxX, o.x + o.w);
    if (lv.length <= 0) lv.length = maxX + 20;
    if (maxX > lv.length) err(file, 0, "Objekte hinter dem Levelende (" + fmt(maxX) + ")");
    int coins = 0;
    for (auto& o : lv.objs) {
      if (o.t == COIN) ++coins;
      if (o.y < 0 || o.y + o.h > 10.001) err(file, 0, "Objekt außerhalb der Höhe 0..10 bei x=" + fmt(o.x));
    }
    if (coins > 3) err(file, 0, "höchstens 3 Münzen pro Level");
    // Stacheln dürfen nicht in Blöcken stecken
    for (auto& s : lv.objs) {
      if (s.t != SPIKE && s.t != CSPIKE) continue;
      for (auto& b : lv.objs) {
        if (b.t != BLOCK && b.t != SLAB) continue;
        if (s.x < b.x + b.w && s.x + 1 > b.x && s.y < b.y + b.h && s.y + 1 > b.y)
          std::cerr << file << ": Warnung: Stachel in Block bei x=" << fmt(s.x) << "\n";
      }
    }
    std::sort(lv.colors.begin(), lv.colors.end(), [](auto& a, auto& b) { return a.x < b.x; });
    if (lv.colors.empty() || lv.colors[0].x > 0) lv.colors.insert(lv.colors.begin(), {0, "#2b1fd6", "#2442ff", "#00eaff"});
    std::cerr << file << ": " << lv.objs.size() << " Objekte, Länge " << fmt(lv.length)
              << " (" << fmt(lv.length / lv.speed) << " s), " << coins << " Münzen\n";
  }

  std::string json() const {
    std::ostringstream o;
    o << "{\"id\":" << jsonStr(lv.id) << ",\"name\":" << jsonStr(lv.name) << ",\"diff\":" << jsonStr(lv.diff)
      << ",\"stars\":" << lv.stars << ",\"speed\":" << fmt(lv.speed) << ",\"bpm\":" << lv.bpm
      << ",\"song\":" << lv.song << ",\"length\":" << fmt(lv.length) << ",\n \"colors\":[";
    for (size_t i = 0; i < lv.colors.size(); ++i) {
      auto& c = lv.colors[i];
      o << (i ? "," : "") << "[" << fmt(c.x) << ",\"" << c.bg << "\",\"" << c.ground << "\",\"" << c.accent << "\"]";
    }
    o << "],\n \"objs\":[";
    for (size_t i = 0; i < lv.objs.size(); ++i) {
      auto& b = lv.objs[i];
      o << (i ? "," : "") << (i % 12 == 0 ? "\n  " : "") << "[" << b.t << "," << fmt(b.x) << "," << fmt(b.y);
      if ((b.t == BLOCK || b.t == DECO) && (b.w != 1 || b.h != 1)) o << "," << fmt(b.w) << "," << fmt(b.h);
      else if (b.t == SAW && b.w != 1) o << "," << fmt(b.w);
      if (b.t == SLAB && b.w != 1) o << "," << fmt(b.w);
      o << "]";
    }
    o << "]}";
    return o.str();
  }
};

int main(int argc, char** argv) {
  std::string in = "levels", out;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "-o" && i + 1 < argc) out = argv[++i]; else in = a;
  }
  std::vector<fs::path> files;
  if (fs::is_directory(in)) {
    for (auto& e : fs::directory_iterator(in)) if (e.path().extension() == ".txt") files.push_back(e.path());
  } else files.push_back(in);
  std::sort(files.begin(), files.end());
  if (files.empty()) { std::cerr << "Keine Leveldateien gefunden in " << in << "\n"; return 1; }

  std::ostringstream js;
  js << "/* Automatisch erzeugt von cpp/leveltool.cpp – nicht von Hand bearbeiten.\n"
        "   Level ändern: cpp/levels/*.txt bearbeiten und das Tool neu laufen lassen. */\n"
        "window.LEVELS = [";
  for (size_t i = 0; i < files.size(); ++i) {
    Compiler c; c.load(files[i]);
    js << (i ? ",\n" : "\n") << c.json();
  }
  js << "\n];\n";
  if (errors) { std::cerr << errors << " Fehler – levels.js wurde nicht geschrieben.\n"; return 1; }
  if (out.empty()) std::cout << js.str();
  else { std::ofstream f(out, std::ios::binary); f << js.str(); std::cerr << "geschrieben: " << out << "\n"; }
  return 0;
}
