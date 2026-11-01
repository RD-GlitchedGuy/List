// =====================================================================
//  Sky Detect – C++ Analyse-Kern
//  Wird zu WebAssembly kompiliert und im Browser ausgeführt.
//  Build:  ./cpp/build.sh   (braucht clang + wasm-ld)
//
//  Liefert stilometrische Kennzahlen über einen UTF-8-Text:
//  Satzrhythmus (Burstiness), Wortlängen, Wortschatz (MATTR),
//  Trigramm-Wiederholung, Absatz-Gleichförmigkeit, Satzzeichen-
//  Profil und einen lokalen "Gleichförmigkeits-Score" pro Satz.
// =====================================================================

typedef unsigned int   u32;
typedef unsigned short u16;
typedef unsigned char  u8;

#define EXPORT(n) extern "C" __attribute__((export_name(n)))

extern "C" void* memset(void* d, int v, unsigned long n) {
    u8* p = (u8*)d; while (n--) *p++ = (u8)v; return d;
}
extern "C" void* memcpy(void* d, const void* s, unsigned long n) {
    u8* a = (u8*)d; const u8* b = (const u8*)s; while (n--) *a++ = *b++; return d;
}

static const u32 TEXT_CAP  = 4u << 20;   // 4 MB Text
static const u32 MAX_WORDS = 1u << 20;
static const u32 MAX_SENT  = 1u << 17;
static const u32 MAX_PARA  = 1u << 16;
static const u32 TRI_BITS  = 18;

static u8    text[TEXT_CAP];
static u32   wordHash[MAX_WORDS];
static u32   sStart[MAX_SENT], sEnd[MAX_SENT], sWords[MAX_SENT];
static float sScore[MAX_SENT];
static u32   paraW[MAX_PARA];
static u16   triTab[1u << TRI_BITS];
static u32   winKey[256], winGen[256];
static float out[32];
static u32   nSent, nPara, gen;

static inline float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
static inline bool  isSpace(u8 c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == 0x0B || c == 0x0C; }

// Länge des UTF-8-Zeichens bei i; *w = ist Wortzeichen
static inline u32 charAt(u32 i, u32 n, bool* w) {
    u8 c = text[i];
    if (c < 0x80) {
        *w = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
        return 1;
    }
    u32 L = c >= 0xF0 ? 4 : (c >= 0xE0 ? 3 : (c >= 0xC0 ? 2 : 1));
    if (i + L > n) L = n - i;
    // C2 = Latin-1-Satzzeichen (« » ¿ ¡ NBSP), E2 = Allg. Satzzeichen (— – … “ ”)
    *w = !(c < 0xC0 || c == 0xC2 || c == 0xE2 || (c == 0xC3 && i + 1 < n && (text[i+1] == 0x97 || text[i+1] == 0xB7)));
    return L;
}

static inline bool startsUpper(u32 k, u32 n) {
    u8 c = text[k];
    if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return true;
    if (c == '"' || c == '\'' || c == '(' || c == '-' || c == '*' || c == '[') return true;
    if (c == 0xC3 && k + 1 < n) return text[k+1] >= 0x80 && text[k+1] <= 0x9E;
    if (c == 0xC2 || c == 0xE2) return true;          // ¿ ¡ « “ – …
    return c >= 0xC4;                                  // andere Schriften: großzügig
}

// Ist nach Position k ein Satzende? (Leerraum + Großbuchstabe / Zeilenende / Textende)
static bool endCheck(u32 k, u32 n) {
    while (k < n) {                                    // schließende Quotes/Klammern
        u8 c = text[k];
        if (c == '"' || c == '\'' || c == ')' || c == ']') { k++; continue; }
        if (c == 0xE2 && k + 2 < n && text[k+1] == 0x80 && (text[k+2] == 0x9D || text[k+2] == 0x99)) { k += 3; continue; }
        if (c == 0xC2 && k + 1 < n && text[k+1] == 0xBB) { k += 2; continue; }
        break;
    }
    if (k >= n) return true;
    if (!isSpace(text[k])) return false;
    while (k < n && (text[k] == ' ' || text[k] == '\t' || text[k] == '\r')) k++;
    if (k >= n || text[k] == '\n') return true;
    return startsUpper(k, n);
}

EXPORT("buf_ptr")    u8*    buf_ptr()    { return text; }
EXPORT("buf_cap")    u32    buf_cap()    { return TEXT_CAP; }
EXPORT("sent_count") u32    sent_count() { return nSent; }
EXPORT("sent_start") u32*   sent_start() { return sStart; }
EXPORT("sent_end")   u32*   sent_end()   { return sEnd; }
EXPORT("sent_words") u32*   sent_words() { return sWords; }
EXPORT("sent_score") float* sent_score() { return sScore; }

EXPORT("analyze") float* analyze(u32 n) {
    if (n > TEXT_CAP) n = TEXT_CAP;
    for (u32 k = 0; k < 32; k++) out[k] = 0;
    for (u32 k = 0; k < (1u << TRI_BITS); k++) triTab[k] = 0;

    u32 nw = 0; nSent = 0; nPara = 0;
    double wlSum = 0, wlSq = 0;
    u32 curStart = 0, curWords = 0, paraWords = 0, lastWordLen = 0, nlRun = 0;
    bool inSent = false, lineStart = true;
    u32 em = 0, en = 0, semi = 0, colon = 0, excl = 0, quest = 0, comma = 0, paren = 0,
        ell = 0, dbl = 0, lowStart = 0, curly = 0, straight = 0, bullets = 0, multi = 0;

    u32 i = 0;
    while (i < n) {
        bool w; u32 L = charAt(i, n, &w);
        u8 c = text[i];

        if (w) {                                       // ---- Wort lesen
            u32 h = 2166136261u, len = 0, j = i;
            while (j < n) {
                bool ww; u32 LL = charAt(j, n, &ww);
                if (!ww) {
                    if ((text[j] == '\'' || text[j] == '-') && j + 1 < n && len > 0) {
                        bool w2; charAt(j + 1, n, &w2);
                        if (w2) { j++; continue; }
                    }
                    break;
                }
                for (u32 k = 0; k < LL; k++) {
                    u8 b = text[j + k];
                    if (LL == 1 && b >= 'A' && b <= 'Z') b += 32;
                    else if (k == 1 && text[j] == 0xC3 && b >= 0x80 && b <= 0x9E && b != 0x97) b += 0x20;
                    h = (h ^ b) * 16777619u;
                }
                len++; j += LL;
            }
            if (lineStart) {                           // "1. Punkt" als Aufzählung
                if (j < n && text[j] == '.' && j + 1 < n && text[j+1] == ' ' && len <= 2 && text[i] >= '0' && text[i] <= '9') bullets++;
            }
            if (!inSent) { inSent = true; curStart = i; curWords = 0; }
            curWords++;
            if (nw < MAX_WORDS) wordHash[nw] = h;
            nw++;
            wlSum += len; wlSq += (double)len * len; lastWordLen = len;
            paraWords++; lineStart = false; nlRun = 0;
            i = j; continue;
        }

        bool boundary = false;
        if (c == '\n') {
            nlRun++;
            if (nlRun >= 2 && paraWords > 0) { if (nPara < MAX_PARA) paraW[nPara++] = paraWords; paraWords = 0; }
            boundary = true; lineStart = true;
        } else if (c == ' ' || c == '\t' || c == '\r') {
            if (c == ' ' && !lineStart && i + 1 < n && text[i+1] == ' ') { dbl++; while (i + 1 < n && text[i+1] == ' ') i++; }
        } else {
            if (lineStart && (c == '-' || c == '*' || c == '#' || c == '>') && i + 1 < n && (text[i+1] == ' ' || text[i+1] == '#')) bullets++;
            if (lineStart && c == 0xE2 && i + 2 < n && text[i+1] == 0x80 && text[i+2] == 0xA2) bullets++;
            lineStart = false; nlRun = 0;

            if (c == '.') {
                if (i + 2 < n && text[i+1] == '.' && text[i+2] == '.') { ell++; L = 3; }
                boundary = endCheck(i + L, n);
                if (!boundary && L == 1) {
                    u32 k = i + 1;
                    if (k < n && text[k] == ' ') {
                        while (k < n && text[k] == ' ') k++;
                        if (k < n && text[k] >= 'a' && text[k] <= 'z' && lastWordLen > 3) lowStart++;
                    }
                }
            } else if (c == '!' || c == '?') {
                u32 run = 0;
                while (i + L < n && (text[i+L] == '!' || text[i+L] == '?')) { L++; }
                for (u32 k = i; k < i + L; k++) { if (text[k] == '!') excl++; else quest++; run++; }
                if (run > 1) multi++;
                boundary = endCheck(i + L, n);
            } else if (c == ',') comma++;
            else if (c == ';') semi++;
            else if (c == ':') colon++;
            else if (c == '(') paren++;
            else if (c == '"') straight++;
            else if (c == 0xE2 && i + 2 < n && text[i+1] == 0x80) {
                u8 d = text[i+2];
                if (d == 0x94) em++;
                else if (d == 0x93) en++;
                else if (d == 0xA6) { ell++; boundary = endCheck(i + 3, n); }
                else if (d == 0x9C || d == 0x9D || d == 0x9E) curly++;
            } else if (c == 0xC2 && i + 1 < n && (text[i+1] == 0xAB || text[i+1] == 0xBB)) curly++;
        }

        if (boundary && inSent) {
            if (nSent < MAX_SENT) { sStart[nSent] = curStart; sEnd[nSent] = i + L; sWords[nSent] = curWords; nSent++; }
            inSent = false;
        }
        i += L;
    }
    if (inSent && nSent < MAX_SENT) { sStart[nSent] = curStart; sEnd[nSent] = n; sWords[nSent] = curWords; nSent++; }
    if (paraWords > 0 && nPara < MAX_PARA) paraW[nPara++] = paraWords;

    // ---- Satzlängen (nur echte Sätze ≥ 3 Wörter)
    double sSum = 0, sSq = 0; u32 sN = 0;
    for (u32 k = 0; k < nSent; k++) if (sWords[k] >= 3) { sSum += sWords[k]; sSq += (double)sWords[k] * sWords[k]; sN++; }
    double sMean = sN ? sSum / sN : 0;
    double sVar  = sN ? sSq / sN - sMean * sMean : 0; if (sVar < 0) sVar = 0;
    double sSd   = __builtin_sqrt(sVar);

    // ---- Wortlängen
    u32 nwc = nw < MAX_WORDS ? nw : MAX_WORDS;
    double wMean = nw ? wlSum / nw : 0;
    double wVar  = nw ? wlSq / nw - wMean * wMean : 0; if (wVar < 0) wVar = 0;

    // ---- MATTR (Fenster à 100 Wörter)
    u32 win = nwc < 100 ? nwc : 100;
    double ttrSum = 0; u32 ttrN = 0;
    for (u32 s = 0; win > 0 && s + win <= nwc; s += win) {
        gen++; u32 uniq = 0;
        for (u32 k = s; k < s + win; k++) {
            u32 h = wordHash[k], slot = (h * 2654435761u) >> 24;
            while (winGen[slot] == gen && winKey[slot] != h) slot = (slot + 1) & 255;
            if (winGen[slot] != gen) { winGen[slot] = gen; winKey[slot] = h; uniq++; }
        }
        ttrSum += (double)uniq / win; ttrN++;
    }

    // ---- Trigramm-Wiederholung
    u32 rep = 0;
    for (u32 k = 2; k < nwc; k++) {
        u32 t = (wordHash[k] * 31u + wordHash[k-1]) * 31u + wordHash[k-2];
        u32 idx = ((t ^ (t >> 15)) * 2654435761u) >> (32 - TRI_BITS);
        if (triTab[idx]) rep++;
        if (triTab[idx] < 65535) triTab[idx]++;
    }

    // ---- Absatz-Gleichförmigkeit
    double pSum = 0, pSq = 0; u32 pN = 0;
    for (u32 k = 0; k < nPara; k++) if (paraW[k] >= 5) { pSum += paraW[k]; pSq += (double)paraW[k] * paraW[k]; pN++; }
    double pMean = pN ? pSum / pN : 0;
    double pVar  = pN ? pSq / pN - pMean * pMean : 0; if (pVar < 0) pVar = 0;

    // ---- Lokaler Gleichförmigkeits-Score pro Satz (Fenster ±3)
    for (u32 k = 0; k < nSent; k++) {
        if (sWords[k] < 3) { sScore[k] = -1; continue; }
        double a = 0, b = 0; u32 m = 0;
        u32 lo = k >= 3 ? k - 3 : 0, hi = k + 3 < nSent ? k + 3 : nSent - 1;
        for (u32 q = lo; q <= hi; q++) if (sWords[q] >= 3) { a += sWords[q]; b += (double)sWords[q] * sWords[q]; m++; }
        float local = 0.5f;
        if (m >= 4) {
            double mu = a / m, v = b / m - mu * mu; if (v < 0) v = 0;
            float cv = (float)(__builtin_sqrt(v) / (mu > 0 ? mu : 1));
            local = clamp01((0.75f - cv) / 0.5f);
        }
        u32 wc = sWords[k];
        float mid = (wc >= 12 && wc <= 30) ? 0.15f : (wc > 45 || wc < 6 ? -0.15f : 0.0f);
        sScore[k] = clamp01(0.85f * local + mid);
    }

    out[0]  = (float)nw;
    out[1]  = (float)sN;
    out[2]  = (float)sMean;
    out[3]  = (float)sSd;
    out[4]  = sMean > 0 ? (float)(sSd / sMean) : 0;
    out[5]  = (float)wMean;
    out[6]  = (float)__builtin_sqrt(wVar);
    out[7]  = ttrN ? (float)(ttrSum / ttrN) : 0;
    out[8]  = nwc > 2 ? (float)rep / (nwc - 2) : 0;
    out[9]  = (float)pN;
    out[10] = pMean > 0 ? (float)(__builtin_sqrt(pVar) / pMean) : 0;
    out[11] = em;  out[12] = en;   out[13] = semi;  out[14] = colon;
    out[15] = excl; out[16] = quest; out[17] = comma; out[18] = paren;
    out[19] = ell; out[20] = dbl;  out[21] = lowStart; out[22] = curly;
    out[23] = straight; out[24] = bullets; out[25] = (float)nSent; out[26] = multi;
    return out;
}
