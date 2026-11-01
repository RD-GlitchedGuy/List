// Sky Detect – Bewertung & Oberfläche
(() => {
  const $ = id => document.getElementById(id);
  const clamp = x => Math.max(0, Math.min(1, x));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cvOf = a => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return m ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m : 0; };

  // ---------- C++/WASM-Engine ----------
  let W = null;
  const enc = new TextEncoder(), dec = new TextDecoder();
  (async () => {
    try {
      const bin = Uint8Array.from(atob(window.SKY_WASM), c => c.charCodeAt(0));
      W = (await WebAssembly.instantiate(bin)).instance.exports;
      $('engine').className = 'engine on';
      $('engine').lastElementChild.textContent = 'Prüfmodul (C++) bereit';
    } catch (e) {
      $('engine').className = 'engine off';
      $('engine').lastElementChild.textContent = 'Prüfmodul nicht geladen';
      console.error(e);
    }
  })();

  const KEYS = ['words', 'sents', 'sMean', 'sSd', 'cv', 'wMean', 'wSd', 'mattr', 'tri', 'paras', 'paraCv', 'em', 'en', 'semi',
    'colon', 'excl', 'quest', 'comma', 'paren', 'ell', 'dbl', 'lowStart', 'curly', 'straight', 'bullets', 'allSents', 'multi'];
  function core(text, withSents) {
    let bytes = enc.encode(text);
    if (bytes.length > W.buf_cap()) bytes = bytes.subarray(0, W.buf_cap());
    new Uint8Array(W.memory.buffer, W.buf_ptr(), bytes.length).set(bytes);
    const o = new Float32Array(W.memory.buffer, W.analyze(bytes.length), KEYS.length);
    const s = {}; KEYS.forEach((k, i) => s[k] = o[i]);
    if (!withSents) return { s };
    const n = W.sent_count(), m = W.memory.buffer;
    const st = new Uint32Array(m, W.sent_start(), n), en = new Uint32Array(m, W.sent_end(), n);
    const sw = new Uint32Array(m, W.sent_words(), n), sc = new Float32Array(m, W.sent_score(), n);
    const sents = []; let prev = 0;
    for (let i = 0; i < n; i++) {
      sents.push({ gap: dec.decode(bytes.subarray(prev, st[i])), text: dec.decode(bytes.subarray(st[i], en[i])), words: sw[i], score: sc[i] });
      prev = en[i];
    }
    return { s, sents, tail: dec.decode(bytes.subarray(prev)) };
  }

  // ---------- Lexikon: Gewicht 1 = starkes KI-Signal, 0.35 = schwaches ----------
  const STRONG = {
    de: ['zusammenfassend lässt sich sagen', 'zusammenfassend lässt sich festhalten', 'abschließend lässt sich sagen', 'es lässt sich festhalten',
      'es ist wichtig zu beachten', 'es ist wichtig zu betonen', 'es ist erwähnenswert', 'es sei darauf hingewiesen', 'spielt eine entscheidende rolle',
      'spielt eine zentrale rolle', 'spielt eine wichtige rolle', 'eine entscheidende rolle', 'von entscheidender bedeutung', 'von zentraler bedeutung',
      'in der heutigen zeit', 'in der heutigen schnelllebigen', 'in einer zunehmend', 'in einer sich ständig wandelnden', 'vielschichtig', 'facettenreich',
      'eintauchen', 'tauchen wir ein', 'ein weiterer wichtiger aspekt', 'ein zentraler aspekt', 'insgesamt zeigt sich', 'dies verdeutlicht',
      'dies unterstreicht', 'unterstreicht die bedeutung', 'wertvolle einblicke', 'einen wichtigen beitrag', 'auf einen blick', 'im überblick',
      'kurz gesagt', 'mit anderen worten', 'nächste schritte', 'die wichtigsten punkte', 'die wichtigsten erkenntnisse', 'zentrale erkenntnisse',
      'kernaussagen', 'handlungsempfehlungen', 'dreh- und angelpunkt', 'im spannungsfeld', 'rückt in den fokus', 'steht im fokus', 'stellschrauben',
      'chancen und risiken', 'chancen und herausforderungen', 'trägt maßgeblich', 'ein ganzheitlicher ansatz', 'best practices', 'der schlüssel liegt'],
    en: ['delve', 'delves', 'delving', 'tapestry', 'it is important to note', "it's important to note", 'it is worth noting', "it's worth noting",
      'in conclusion', 'plays a crucial role', 'plays a pivotal role', 'plays a vital role', 'a testament to', 'navigate the complexities',
      "in today's fast-paced", "in today's digital", 'in the realm of', 'ever-evolving', 'multifaceted', 'underscores', 'seamlessly', 'holistic',
      'intricacies', 'embark', 'showcasing', 'paramount', 'meticulous', 'meticulously', 'a myriad of', 'sheds light', 'valuable insights',
      'key takeaways', 'game-changer', 'unlock the potential', 'harness the power', 'serves as a', 'stands as a', "here's the thing",
      "here's why", "here's what", 'the bottom line', 'next steps', 'at a glance', 'a nuanced', 'rich tapestry', 'it’s not just'],
    es: ['en conclusión', 'es importante destacar', 'es importante señalar', 'cabe destacar', 'cabe señalar', 'vale la pena mencionar',
      'juega un papel crucial', 'juega un papel fundamental', 'desempeña un papel fundamental', 'desempeña un papel crucial', 'un papel clave',
      'en el mundo actual', 'en un mundo cada vez más', 'multifacético', 'multifacética', 'sin lugar a dudas', 'adentrarnos', 'un testimonio de',
      'valiosas perspectivas', 'en pocas palabras', 'dicho de otro modo', 'próximos pasos', 'puntos clave', 'de manera integral']
  };
  const WEAK = {
    de: ['darüber hinaus', 'gezielt', 'gezielte', 'konkret', 'fundiert', 'fundierte', 'nachvollziehbar', 'praxisnah', 'praxisnahe', 'strukturiert',
      'zielgerichtet', 'mehrwert', 'synergien', 'rahmenbedingungen', 'maßgeblich', 'ganzheitlich', 'ganzheitliche', 'nachhaltig', 'essenziell',
      'nahtlos', 'unterstreicht', 'beleuchtet', 'umfassend', 'umfassende', 'vielfältige', 'zahlreiche', 'herausforderungen', 'potenziale',
      'erkenntnisse', 'fazit', 'ausblick', 'zusammengefasst', 'im mittelpunkt', 'trägt dazu bei', 'ermöglicht es', 'gleichermaßen', 'zentrale',
      'entscheidende', 'wesentliche', 'transparent', 'effizient', 'robust', 'resilienz', 'skalierbar', 'wichtig:', 'hinweis:', 'tipp:'],
    en: ['comprehensive', 'robust', 'crucial', 'essential', 'ensure', 'ensuring', 'enhance', 'enhancing', 'streamline', 'insights', 'framework',
      'landscape', 'navigate', 'navigating', 'empower', 'elevate', 'journey', 'genuinely', 'straightforward', 'overview', 'foster', 'fostering',
      'leverage', 'leveraging', 'pivotal', 'nuanced', 'intricate', 'vibrant', 'seamless', 'realm', 'resonate', 'moreover', 'furthermore', 'additionally'],
    es: ['fundamental', 'clave', 'integral', 'sinergias', 'enfoque', 'potenciar', 'optimizar', 'garantizar', 'desafíos', 'retos', 'perspectiva',
      'fomentar', 'aprovechar', 'panorama', 'profundizar', 'además', 'asimismo', 'crucial', 'significativa', 'holístico']
  };
  const TRANS = {
    de: ['darüber hinaus', 'zudem', 'außerdem', 'des weiteren', 'ferner', 'insgesamt', 'zusammenfassend', 'abschließend', 'letztlich',
      'letztendlich', 'gleichzeitig', 'folglich', 'somit', 'nichtsdestotrotz', 'kurz gesagt', 'konkret', 'wichtig ist'],
    en: ['furthermore', 'moreover', 'additionally', 'in addition', 'overall', 'ultimately', 'consequently', 'in conclusion', 'importantly',
      'notably', 'similarly', 'conversely', 'in short', 'put simply', 'crucially'],
    es: ['además', 'asimismo', 'por otro lado', 'en conclusión', 'en resumen', 'por lo tanto', 'por último', 'de igual manera', 'en definitiva']
  };
  // Satzbau-Muster, die Sprachmodelle lieben
  const PATTERNS = {
    de: [/\bnicht (nur |bloß |einfach )?[^.!?\n]{1,70}?,\s*sondern\b/giu, /\bes geht (nicht|weniger) (nur |darum |um )/giu,
      /\b(das|der|die) (ergebnis|grund|folge|problem|ziel|fazit|kernproblem|entscheidende|wichtigste|gute|frage)( ist)?:/giu,
      /\b(ob|egal ob) [^.!?\n]{1,50} oder [^.!?\n]{1,50}[:—–]/giu, /\bkurz:\s/giu, /[→✓✔✅]/gu,
      /(^|[.!?]\s+)(dies|das|diese|damit|somit) (zeigt|verdeutlicht|unterstreicht|macht deutlich|wird deutlich)/giu, /\b(lässt sich|kann man) (festhalten|sagen|zusammenfassen),? dass\b/giu],
    en: [/\bnot (just|only|merely) [^.!?\n]{1,70}?[,;—–]\s*(but|it'?s|it is)\b/giu, /\bit'?s not (about )?[^.!?\n]{1,40}[,;—–]\s*(it'?s|but)\b/giu,
      /\b(the|this) (result|key|catch|reason|goal|problem|takeaway)( is)?:/giu, /\bwhether you'?re\b/giu, /\bthink of it as\b/giu, /[→✓✔✅]/gu,
      /(^|[.!?]\s+)this (highlights|underscores|demonstrates|shows|illustrates)\b/giu, /\bnot because [^.!?\n]{1,60}, but because\b/giu],
    es: [/\bno (solo|sólo|se trata de) [^.!?\n]{1,70}?,?\s*sino\b/giu, /\b(el|la) (resultado|clave|razón|objetivo|problema)( es)?:/giu, /[→✓✔✅]/gu]
  };
  const STOP = {
    de: /\b(der|die|das|und|ist|nicht|ein|eine|mit|auch|sich|dass|wird|werden)\b/gi,
    en: /\b(the|and|is|of|to|that|it|with|are|this|for|was|be)\b/gi,
    es: /\b(el|la|los|las|que|y|es|del|por|una|con|para|se)\b/gi
  };
  const escRe = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
  const LEX = {};
  for (const l in STRONG) {
    const map = new Map();
    WEAK[l].forEach(p => map.set(p, .35)); STRONG[l].forEach(p => map.set(p, 1));
    const list = [...map.keys()].sort((a, b) => b.length - a.length).map(escRe);
    LEX[l] = { map, re: new RegExp('(?<![\\p{L}\\p{N}])(' + list.join('|') + ')(?![\\p{L}\\p{N}])', 'giu'),
      trans: new RegExp('^[\\s"„“*•\\-–]*(' + TRANS[l].map(escRe).join('|') + ')(?![\\p{L}])', 'iu') };
  }
  const lang = t => { let best = 'en', bv = -1; for (const l in STOP) { const v = (t.slice(0, 20000).match(STOP[l]) || []).length; if (v > bv) { bv = v; best = l; } } return best; };

  // ---------- Aufbau des Dokuments ----------
  const BUL = /^(?:[•●▪◦○■□➢➤►▶✓✔✅☐→·\uf0b7\uf0a7]\s*|[-–—*+]\s+|\d{1,2}[.)]\s+|[a-z][.)]\s+)/u;
  function structure(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const r = { lines: lines.length, head: 0, bullet: 0, label: 0, prose: 0, bLens: [], proseParts: [], bold: (text.match(/\*\*[^*\n]+\*\*/g) || []).length };
    for (const l of lines) {
      const plain = l.replace(/\*\*/g, ''), words = plain.split(/\s+/).length;
      if (/^#{1,6}\s/.test(l)) { r.head++; continue; }
      if (BUL.test(plain)) {
        const body = plain.replace(BUL, ''), bw = body.split(/\s+/).length;
        if (/^\d/.test(plain) && bw <= 8 && !/[.!?:;,]$/.test(plain)) { r.head++; continue; }   // "2. Methodik"
        r.bullet++; r.bLens.push(bw);
        if (/^[^:]{2,45}:\s+\S/.test(body) && body.split(':')[0].split(/\s+/).length <= 5) r.label++;
        continue;
      }
      if (words <= 10 && !/[.!?:;,…)"“”]$/.test(plain) && /^[\p{Lu}\d]/u.test(plain)) { r.head++; continue; }
      if (/^[^:]{2,45}:\s+\S/.test(plain) && plain.split(':')[0].split(/\s+/).length <= 5) r.label++;
      r.prose++; r.proseParts.push(l);
    }
    return r;
  }

  // Gegenindizien: persönliche Stimme, Umgangssprache, Belege
  const FP = { de: /(?<![\p{L}])(ich|mir|mich|mein|meine|meiner|meinen|meinem|meines)(?![\p{L}])/giu,
    en: /(?<![\p{L}])(I|me|my|mine|I'm|I've|I'd|I'll)(?![\p{L}])/gu, es: /(?<![\p{L}])(yo|mí|conmigo|creo|pienso|opino)(?![\p{L}])/giu };
  const COLL = { de: /(?<![\p{L}])(halt|irgendwie|naja|quasi|sozusagen|ehrlich gesagt|krass|echt|bisschen|eigentlich|ziemlich|okay)(?![\p{L}])/giu,
    en: /(?<![\p{L}])(kinda|gonna|wanna|pretty much|honestly|stuff|yeah|guess|anyway|lol)(?![\p{L}])/giu,
    es: /(?<![\p{L}])(pues|bueno|o sea|vale|la verdad|igual)(?![\p{L}])/giu };
  const CITE = /\([^()]{0,60}?(?:19|20)\d\d[a-z]?(?:[:,]\s?(?:S\.|p\.|pp\.)?\s?\d+(?:[-–]\d+)?)?\)|(?<![\p{L}])(?:vgl\.|ebd\.|a\.a\.O\.|ibid\.|cf\.)|(?<![\p{L}])S\.\s?\d+|https?:\/\/\S+/giu;
  const count = (t, re) => (t.match(re) || []).length;

  // ---------- Gesamtbewertung ----------
  function analyze(text) {
    const t0 = performance.now();
    const full = core(text, true);
    const st = structure(text);
    const proseText = st.proseParts.join('\n\n');
    const prose = proseText.split(/\s+/).length >= 60 ? core(proseText).s : full.s;
    const s = full.s, L = lang(text), lx = LEX[L];
    const words = Math.max(s.words, 1), per1k = x => x / words * 1000;

    // Phrasen + Muster pro Satz
    const found = {}; let strong = 0, weak = 0, trans = 0, pat = 0;
    for (const se of full.sents) {
      se.why = [];
      let sw = 0, ww = 0;
      se.html = esc(se.text).replace(lx.re, m => {
        const k = m.toLowerCase().replace(/’/g, "'"), w = lx.map.get(k) || .35;
        found[k] = (found[k] || 0) + 1;
        if (w === 1) { strong++; sw++; return '<mark>' + m + '</mark>'; }
        weak++; ww++; return '<mark class="w">' + m + '</mark>';
      });
      if (sw) se.why.push(sw + '× typische KI-Formulierung');
      else if (ww) se.why.push(ww + '× KI-nahes Wort');
      se.trans = se.words >= 3 && lx.trans.test(se.text);
      if (se.trans) { trans++; se.why.push('beginnt mit Übergangswort'); }
      se.pat = PATTERNS[L].reduce((a, r) => a + (se.text.match(r) || []).length, 0);
      if (se.pat) { pat += se.pat; se.why.push('typisches Satzbau-Muster'); }
      se.dash = /—| – /.test(se.text);
      if (se.dash) se.why.push('Gedankenstrich');
      se.sw = sw; se.ww = ww;
      se.note = sw ? 'KI-Floskel' : se.pat ? 'typisches KI-Satzmuster' : se.trans ? 'Übergangswort am Satzanfang' : ww ? 'KI-nahes Wort' : se.dash ? 'Gedankenstrich' : 'gleichförmiger Rhythmus';
    }
    const triads = (text.match(/[\p{L}-]{3,}, [\p{L}-]{3,},? (und|and|y|sowie|oder|or) [\p{L}-]{3,}/giu) || []).length;
    const dashes = s.em + (text.match(/ – /g) || []).length;
    const vocab = per1k(strong + weak * .35);
    const content = Math.max(st.bullet + st.prose, 1);
    const headPer1k = per1k(st.head), bulletShare = st.bullet / content, labelShare = st.label / content;
    const hasStruct = st.lines >= 6;
    const paraLens = st.proseParts.map(p => p.split(/\s+/).length).filter(n => n >= 8);
    const noise = per1k(s.dbl + s.lowStart * 2 + s.multi * 2) + (/(\b\p{L}+\b) \1\b/iu.test(text) ? 1 : 0);
    const realSents = Math.max(prose.sents, 1);

    const sig = [];
    const add = (o) => sig.push(o);
    add({ key: 'rhythm', n: 'Satzrhythmus', w: .17, s: prose.sents >= 5 ? clamp((0.62 - prose.cv) / 0.32) : .45,
      tech: `Variationskoeffizient ${prose.cv.toFixed(2)} · Ø ${prose.sMean.toFixed(1)} Wörter/Satz`,
      ai: `Die Sätze sind auffällig gleich lang (meist um die ${Math.round(prose.sMean)} Wörter). Menschen schreiben unregelmäßiger.`,
      mid: 'Die Satzlängen schwanken mäßig, weder klar menschlich noch klar KI-typisch.',
      hu: 'Kurze und lange Sätze wechseln sich stark ab. Das ist typisch für Menschen.' });
    add({ key: 'vocab', n: 'Wortwahl', w: .18, s: clamp(vocab / 9),
      tech: `${strong} starke + ${weak} schwache Treffer · ${vocab.toFixed(1)} Punkte / 1000 Wörter`,
      ai: `${strong + weak} Formulierungen, die Sprachmodelle besonders gern benutzen (z. B. „${Object.keys(found).sort((a, b) => (lx.map.get(b) || 0) - (lx.map.get(a) || 0))[0] || ''}“).`,
      mid: `Einige KI-nahe Wörter (${strong + weak}), aber nicht auffällig gehäuft.`,
      hu: 'Kaum typische KI-Formulierungen.' });
    add({ key: 'pattern', n: 'Satzbau-Muster', w: .10, s: clamp(per1k(pat + triads * .25) / 5),
      tech: `${pat} Muster + ${triads} Dreier-Aufzählungen`,
      ai: `${pat} typische KI-Satzmuster wie „nicht X, sondern Y“, „Das Ergebnis: …“ oder Pfeile/Häkchen, dazu viele Dreier-Aufzählungen.`,
      mid: 'Vereinzelt KI-typische Satzmuster.', hu: 'Keine auffälligen KI-Satzmuster.' });
    add({ key: 'trans', n: 'Satzanfänge', w: .08, s: clamp(trans / realSents / 0.15),
      tech: `${trans} von ${full.s.sents} Sätzen beginnen mit Übergangswort`,
      ai: `Viele Sätze starten mit Bindewörtern wie „Darüber hinaus“, „Zudem“, „Insgesamt“ (${trans}-mal).`,
      mid: `Einige Sätze beginnen mit Übergangswörtern (${trans}-mal).`, hu: 'Satzanfänge wirken natürlich und abwechslungsreich.' });
    add({ key: 'struct', n: 'Aufbau', w: .16, s: hasStruct ? clamp(0.45 * clamp((headPer1k - 6) / 18) + 0.4 * clamp((bulletShare - 0.08) / 0.35) + 0.3 * clamp(labelShare / 0.15) + clamp(st.bold / 10) * .3) : .3,
      tech: `${st.head} Überschriften (${headPer1k.toFixed(1)}/1000 W.) · ${Math.round(bulletShare * 100)} % Listen · ${st.label} „Stichwort: Erklärung“-Zeilen`,
      ai: `Sehr viel Struktur: ${st.head} Überschriften, ${st.bullet} Listenpunkte, ${st.label} Zeilen im Stil „Stichwort: Erklärung“. So sehen KI-Dokumente typischerweise aus.`,
      mid: 'Etwas mehr Gliederung als in normalem Fließtext.',
      hu: hasStruct ? 'Überwiegend Fließtext mit wenigen Überschriften, wie bei den meisten menschlichen Texten.' : 'Reiner Fließtext, keine Gliederung erkennbar.' });
    const uni = [];
    if (st.bLens.length >= 4) uni.push(clamp((0.6 - cvOf(st.bLens)) / 0.4));
    if (paraLens.length >= 4) uni.push(clamp((0.55 - cvOf(paraLens)) / 0.35));
    add({ key: 'uniform', n: 'Gleichförmigkeit', w: .08, s: uni.length ? uni.reduce((a, b) => a + b) / uni.length : .4,
      tech: `Listenpunkte CV ${cvOf(st.bLens).toFixed(2)} · Absätze CV ${cvOf(paraLens).toFixed(2)}`,
      ai: 'Absätze und Listenpunkte sind fast gleich lang, als wären sie in einem Zug erzeugt worden.',
      mid: 'Absätze und Listen sind teils gleichförmig.', hu: 'Absätze sind unterschiedlich lang, wie beim natürlichen Schreiben.' });
    add({ key: 'dash', n: 'Gedankenstriche', w: .08, s: dashes >= 3 ? clamp((per1k(dashes) - 1.5) / 7) : Math.min(.45, clamp((per1k(dashes) - 1.5) / 7)),
      tech: `${dashes} Gedankenstriche (${per1k(dashes).toFixed(1)} / 1000 W.)`,
      ai: `Sehr viele Gedankenstriche (${dashes}-mal). Das ist ein Markenzeichen von ChatGPT und Claude.`,
      mid: `Einige Gedankenstriche (${dashes}-mal).`, hu: 'Kaum Gedankenstriche.' });
    add({ key: 'clean', n: 'Fehlerfreiheit', w: .08, s: clamp(1 - noise / 5),
      tech: `${noise.toFixed(1)} Tipp-/Flüchtigkeitsspuren / 1000 W.`,
      ai: 'Keine Tippfehler-Spuren, doppelten Leerzeichen oder Flüchtigkeiten. Der Text ist auffällig glatt.',
      mid: 'Wenige Flüchtigkeitsspuren.', hu: 'Typisch menschliche Flüchtigkeiten (doppelte Leerzeichen, „!!“, kleine Satzanfänge).' });
    add({ key: 'lex', n: 'Wortschatz', w: .07, s: prose.words >= 100 ? clamp(1 - Math.abs(prose.mattr - 0.74) / 0.12) : .45,
      tech: `MATTR ${prose.mattr.toFixed(2)} · ${(s.tri * 100).toFixed(1)} % wiederholte 3-Wort-Folgen`,
      ai: 'Die Wortvielfalt liegt genau im „mittleren“ Bereich, in dem Sprachmodelle fast immer landen.',
      mid: 'Wortvielfalt im normalen Bereich.', hu: 'Ungewöhnliche Wortvielfalt, eher menschlich.' });

    // Gegenindizien
    const fp = count(text, FP[L]), coll = count(text, COLL[L]), cites = count(text, CITE);
    const voice = clamp(per1k(fp) / 12 + per1k(coll) / 8), cite = clamp(per1k(cites) / 6);
    add({ key: 'voice', n: 'Persönliche Stimme', w: 0, s: .45 - .45 * voice, human: true,
      tech: `${fp} Ich-Formen, ${coll} umgangssprachliche Wörter`,
      hu: `Der Text klingt nach einer echten Person: ${fp}-mal „ich“ oder „mein“, ${coll} umgangssprachliche Wörter. Sprachmodelle schreiben meist unpersönlich.`,
      mid: 'Kaum persönliche Stimme, kein „ich“ und keine Umgangssprache. Bei Sachtexten ist das normal und spricht nicht automatisch für KI.' });
    add({ key: 'cite', n: 'Belege', w: 0, s: .45 - .45 * cite, human: true,
      tech: `${cites} Quellenangaben, Seitenverweise oder Links`,
      hu: `${cites === 1 ? 'Eine Quellenangabe oder ein Seitenverweis' : cites + ' Quellenangaben oder Seitenverweise'} (etwa „vgl.“ oder „(Autor 2019: 12)“). So präzise belegen Sprachmodelle selten von sich aus.`,
      mid: 'Keine Quellenangaben oder Seitenverweise gefunden.' });
    sig.forEach(x => { if (x.human) x.ai = x.mid; });

    const raw = sig.reduce((a, x) => a + x.w * x.s, 0) - .10 * voice - .08 * cite;
    let score = 100 / (1 + Math.exp(-(raw - 0.36) * 10));
    const conf = s.words < 80 ? 0 : s.words < 250 ? 1 : s.words < 700 ? 2 : 3;
    if (conf === 0) score = 50 + (score - 50) * 0.4;
    score = Math.round(score);

    for (const se of full.sents) {
      if (se.score < 0) { se.cls = -1; continue; }
      if (se.score > 0.65) se.why.push('gleichmäßiger Satzrhythmus');
      const v = clamp(0.45 * se.score + Math.min(1, se.sw * 0.6 + se.ww * 0.2) * 0.35 + (se.trans ? .15 : 0) + (se.pat ? .2 : 0) + (se.dash ? .1 : 0) - .05);
      se.cls = v < 0.35 ? 0 : v < 0.6 ? 1 : 2;
    }

    // Abschnitte à ~150 Wörter
    const chunks = []; let cur = null;
    full.sents.forEach(se => {
      if (!cur || cur.words >= 150) { cur = { words: 0, ss: [] }; chunks.push(cur); }
      cur.ss.push(se); cur.words += se.words;
    });
    if (chunks.length > 1 && chunks[chunks.length - 1].words < 60) {
      const last = chunks.pop(); chunks[chunks.length - 1].ss.push(...last.ss); chunks[chunks.length - 1].words += last.words;
    }
    chunks.forEach((c, i) => {
      c.ss.forEach(se => se.chunk = i);
      const lens = c.ss.filter(x => x.words >= 3).map(x => x.words), w = Math.max(c.words, 1), k = x => x / w * 1000;
      const t = c.ss.map(x => x.text).join(' ');
      const rc = .28 * (lens.length >= 4 ? clamp((0.62 - cvOf(lens)) / 0.32) : .45)
        + .32 * clamp(k(c.ss.reduce((a, x) => a + x.sw + x.ww * .35, 0)) / 9)
        + .15 * clamp(k(c.ss.reduce((a, x) => a + x.pat, 0)) / 5)
        + .12 * clamp(c.ss.filter(x => x.trans).length / Math.max(lens.length, 1) / .15)
        + .13 * clamp((k(c.ss.filter(x => x.dash).length) - 1.5) / 7)
        - .15 * clamp(k(count(t, FP[L]) + count(t, COLL[L]) + count(t, CITE)) / 10);
      c.score = Math.round(100 / (1 + Math.exp(-(rc - 0.3) * 9)));
    });
    const cs = chunks.map(c => c.score);
    const mixed = chunks.length >= 3 && Math.max(...cs) >= 65 && Math.min(...cs) <= 35;

    const feat = { sMean: prose.sMean, cv: prose.cv, wMean: s.wMean, mattr: prose.mattr, comma: s.comma / Math.max(s.sents, 1),
      semi: per1k(s.semi + s.colon), dash: per1k(dashes), paren: per1k(s.paren), voice: per1k(fp + coll), vocab, bullets: bulletShare };
    return { s, st, sents: full.sents, tail: full.tail, sig, score, conf, lang: L, found, chunks, mixed, feat, ms: performance.now() - t0 };
  }

  // ---------- Oberfläche ----------
  const items = [];
  let active = null, ref = null, pasteMode = 'doc';
  const band = v => v < 35 ? 0 : v < 65 ? 1 : 2;
  const VERD = [
    ['Wahrscheinlich von einem Menschen', 'Der Text hat die Unregelmäßigkeiten und Eigenheiten, die für menschliches Schreiben typisch sind.'],
    ['Unklar, teils KI-typisch', 'Einige Merkmale sind KI-typisch, andere nicht. Das passt zum Beispiel zu einem KI-Entwurf, den jemand überarbeitet hat, oder zu einem sehr glatten menschlichen Text.'],
    ['Wahrscheinlich KI-generiert', 'Sehr viele Merkmale, die Sprachmodelle wie ChatGPT oder Claude hinterlassen. Das ist ein starkes Indiz, aber kein Beweis.']];
  const CONF = ['sehr gering, weil der Text zu kurz ist', 'gering, weil der Text kurz ist', 'mittel', 'gut'];
  const LANGN = { de: 'Deutsch', en: 'Englisch', es: 'Spanisch' };

  function addItem(name) {
    const it = { id: Math.random().toString(36).slice(2), name, state: 'busy' };
    items.unshift(it); renderQueue(); return it;
  }
  function renderQueue() {
    const q = $('queue');
    if (!items.length) { q.innerHTML = '<li class="empty">Noch nichts geprüft.</li>'; return; }
    q.innerHTML = items.map(it => `<li class="${it === active ? 'active' : ''} ${it.state === 'err' ? 'err' : ''}" data-id="${it.id}" tabindex="0">
      <span class="nm" title="${esc(it.name)}">${esc(it.name)}</span>
      ${it.state === 'busy' ? '<span class="busy"></span>' : it.state === 'err' ? '<span class="sc">Fehler</span>'
        : `<span class="sc" style="color:${['var(--green)', '#9a6a00', 'var(--pen)'][band(it.res.score)]}">${it.res.score}</span>`}</li>`).join('');
  }
  const pick = e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const it = items.find(x => x.id === li.dataset.id);
    if (it?.state === 'done') show(it); else if (it?.state === 'err') alert(it.name + ': ' + it.err);
  };
  $('queue').addEventListener('click', pick);
  $('queue').addEventListener('keydown', e => { if (e.key === 'Enter') pick(e); });

  async function waitEngine() { for (let i = 0; !W && i < 100; i++) await new Promise(r => setTimeout(r, 50)); if (!W) throw new Error('Das Prüfmodul konnte nicht geladen werden. Lade die Seite neu.'); }
  async function processFile(file) {
    const it = addItem(file.name);
    try { await waitEngine(); run(it, await SkyParsers.fileToText(file)); }
    catch (e) { it.state = 'err'; it.err = e.message; renderQueue(); }
  }
  function run(it, text) { it.res = analyze(text); it.state = 'done'; show(it); }

  function show(it) {
    active = it; renderQueue();
    const r = it.res, v = band(r.score);
    $('welcome').classList.add('hidden'); $('report').classList.remove('hidden');

    $('fileName').textContent = it.name;
    $('verdict').textContent = VERD[v][0];
    $('verdictText').textContent = VERD[v][1];
    $('meta').textContent = `${LANGN[r.lang]}, ${Math.round(r.s.words).toLocaleString('de')} Wörter, ${r.s.sents} Sätze, ${r.st.head} Überschriften, ${r.st.bullet} Listenpunkte. Aussagekraft: ${CONF[r.conf]}.`;

    const g = $('gradeNum'); g.className = 'grade-num c' + v; void g.offsetWidth; g.classList.add('drawn');
    countUp($('score'), r.score);
    const ru = document.querySelector('.ruler'); ru.classList.remove('go'); $('pin').style.left = '0%';
    void ru.offsetWidth; ru.classList.add('go'); $('pin').style.left = r.score + '%';

    $('mixed').classList.toggle('hidden', !r.mixed);
    if (r.mixed) $('mixed').textContent = 'Der Text wirkt nicht einheitlich: Manche Abschnitte sind deutlich KI-typisch, andere deutlich menschlich. Das kommt oft vor, wenn nur Teile mit KI geschrieben wurden. Im Verlauf unten siehst du, welche.';

    const ranked = [...r.sig].sort((a, b) => Math.max(b.w, .09) * Math.abs(b.s - .45) - Math.max(a.w, .09) * Math.abs(a.s - .45));
    $('reasons').innerHTML = ranked.map(x => {
      const t = x.s >= .6 ? 2 : x.s <= .3 ? 0 : 1;
      return `<li class="r${t}"><span class="tag">${['für Mensch', 'neutral', 'für KI'][t]}</span><div><b>${x.n}</b><p>${esc([x.hu, x.mid, x.ai][t])}</p></div></li>`;
    }).join('');

    const tw = Math.max(r.chunks.reduce((a, c) => a + c.words, 0), 1);
    $('strip').innerHTML = r.chunks.map((c, i) => `<button type="button" class="s${band(c.score)}" style="flex:${c.words}" data-c="${i}"
      title="Abschnitt ${i + 1} von ${r.chunks.length}: KI-Score ${c.score}" aria-label="Abschnitt ${i + 1}, KI-Score ${c.score}"></button>`).join('');

    const st = r.st, tot = Math.max(st.head + st.bullet + st.prose, 1), pc = n => (n / tot * 100).toFixed(1) + '%';
    $('structure').innerHTML = `<div class="bar"><i class="p" style="width:${pc(st.prose)}"></i><i class="b" style="width:${pc(st.bullet)}"></i><i class="h" style="width:${pc(st.head)}"></i></div>
      <ul class="legend-list"><li><span><i style="background:#e7ebf0"></i>Fließtext-Absätze</span><b>${st.prose}</b></li>
      <li><span><i style="background:var(--hl-yellow)"></i>Listenpunkte</span><b>${st.bullet}</b></li>
      <li><span><i style="background:var(--hl-pink)"></i>Überschriften</span><b>${st.head}</b></li>
      <li><span>Zeilen im Stil „Stichwort: Erklärung“</span><b>${st.label}</b></li></ul>
      <p class="hint" style="margin-top:12px">KI-Dokumente bestehen oft zu großen Teilen aus Überschriften und Stichpunkten. Hausarbeiten und andere menschliche Texte sind meist überwiegend Fließtext.</p>`;

    const lm = LEX[r.lang].map;
    const f = Object.entries(r.found).sort((a, b) => (lm.get(b[0]) || 0) - (lm.get(a[0]) || 0) || b[1] - a[1]).slice(0, 36);
    $('phrases').innerHTML = f.length ? f.map(([p, n]) => `<span class="${lm.get(p) === 1 ? '' : 'w'}">${esc(p)}<small>${n}×</small></span>`).join(' ')
      : '<span class="none">Keine typischen KI-Formulierungen gefunden.</span>';

    renderCompare();

    const fmt = x => esc(x.tech);
    $('tech').innerHTML = '<tr><th>Merkmal</th><th>Messwert</th><th class="num">Wert</th><th class="num">Gewicht</th></tr>' +
      r.sig.map(x => `<tr><td>${x.n}</td><td>${fmt(x)}</td><td class="num">${Math.round(x.s * 100)}</td><td class="num">${x.human ? 'Gegenindiz' : x.w}</td></tr>`).join('');

    // Text mit Markierungen
    const MAX = 2000;
    let h = '', lastChunk = -1;
    r.sents.slice(0, MAX).forEach(se => {
      h += esc(se.gap);
      if (se.chunk !== lastChunk) { h += `<a id="c${se.chunk}"></a>`; lastChunk = se.chunk; }
      h += se.cls < 1 ? se.html : `<s class="h${se.cls}" data-note="${esc(se.note)}" title="${esc(se.why.join(', ') || 'unauffällig')}">${se.html}</s>`;
    });
    h += r.sents.length > MAX ? `<span class="more">Die restlichen ${r.sents.length - MAX} Sätze werden nicht angezeigt, sind aber in der Bewertung enthalten.</span>` : esc(r.tail);
    const ht = $('highlight'); ht.classList.remove('drawn'); ht.innerHTML = h;
    ht.querySelectorAll('s').forEach((el, i) => el.style.setProperty('--d', Math.min(i * 0.025, 1.4) + 's'));
    requestAnimationFrame(() => requestAnimationFrame(() => ht.classList.add('drawn')));
    placeNotes();
    if (innerWidth < 920) $('report').scrollIntoView({ behavior: 'smooth' });
  }

  function placeNotes() {
    const m = $('margin'); m.innerHTML = '';
    if (getComputedStyle(m).display === 'none') return;
    const top0 = m.getBoundingClientRect().top; let last = -100, n = 0;
    for (const el of document.querySelectorAll('#highlight s.h2')) {
      if (n > 400) break;
      const y = el.getBoundingClientRect().top - top0, t = Math.max(y, last + 6);
      if (t - y > 90) continue;
      const d = document.createElement('div'); d.className = 'note'; d.style.top = t + 'px'; d.textContent = el.dataset.note;
      m.appendChild(d); last = t + d.offsetHeight; n++;
    }
  }
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => active && placeNotes(), 150); });
  if (document.fonts) document.fonts.ready.then(() => active && placeNotes());

  $('strip').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = document.getElementById('c' + b.dataset.c); if (!a) return;
    a.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const s = a.nextElementSibling;
    if (s && s.tagName === 'S') { s.classList.add('focus'); setTimeout(() => s.classList.remove('focus'), 1800); }
  });

  // Stilvergleich mit einem echten Text derselben Person
  const FEAT = [['sMean', 'Durchschnittliche Satzlänge', 5, 1], ['cv', 'Wie stark Satzlängen schwanken', .15, 2], ['wMean', 'Durchschnittliche Wortlänge', .5, 1],
    ['mattr', 'Wortvielfalt', .05, 2], ['comma', 'Kommas pro Satz', .6, 1], ['semi', 'Doppelpunkte und Semikolons je 1000 Wörter', 4, 1],
    ['dash', 'Gedankenstriche je 1000 Wörter', 3, 1], ['paren', 'Klammern je 1000 Wörter', 4, 1], ['voice', 'Ich-Formen und Umgangssprache je 1000 Wörter', 6, 1],
    ['vocab', 'KI-typische Wörter je 1000 Wörter', 4, 1], ['bullets', 'Anteil Listenpunkte', .15, 2]];
  function renderCompare() {
    const box = $('compare');
    if (!ref || !active) { box.innerHTML = ''; return; }
    const a = ref.res.feat, b = active.res.feat;
    const rows = FEAT.map(([k, n, tol, d]) => { const diff = Math.abs(a[k] - b[k]) / tol; return { n, a: a[k].toFixed(d), b: b[k].toFixed(d), diff }; });
    const sim = Math.round(rows.reduce((x, r) => x + clamp(1 - (r.diff - .5) / 2.5), 0) / rows.length * 100);
    const say = sim >= 70 ? 'Der Stil passt gut zum Vergleichstext.' : sim >= 45 ? 'Der Stil ist dem Vergleichstext nur teilweise ähnlich.'
      : 'Der Stil weicht deutlich vom Vergleichstext ab. Das kann auf KI oder fremde Hilfe hindeuten, aber auch daran liegen, dass es eine andere Textsorte ist.';
    box.innerHTML = `<div class="cmp"><p class="cmp-head">Stil-Übereinstimmung mit „${esc(ref.name)}“: <b>${sim}</b> von 100. ${say}</p>
      <table><tr><th>Merkmal</th><th class="num">Vergleichstext</th><th class="num">Dieses Dokument</th><th>Ergebnis</th></tr>
      ${rows.map(r => `<tr><td>${r.n}</td><td class="num">${r.a}</td><td class="num">${r.b}</td><td><span class="diff ${r.diff <= 1 ? 'same' : 'off'}">${r.diff <= 1 ? 'ähnlich' : 'weicht ab'}</span></td></tr>`).join('')}</table></div>`;
  }
  async function setRef(name, getText) {
    try { await waitEngine(); const text = await getText(); ref = { name, res: analyze(text) }; renderCompare(); }
    catch (e) { alert('Vergleichstext: ' + e.message); }
  }
  $('refFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) setRef(f.name, () => SkyParsers.fileToText(f)); e.target.value = ''; });

  function countUp(el, to) {
    const t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step); setTimeout(() => el.textContent = to, 1000);
  }

  // Ablegen per Drag & Drop
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
  addEventListener('drop', e => [...e.dataTransfer.files].forEach(processFile));
  $('file').addEventListener('change', e => { [...e.target.files].forEach(processFile); e.target.value = ''; });

  // Text einfügen (Dokument oder Vergleichstext)
  const openModal = mode => {
    pasteMode = mode;
    $('modalTitle').textContent = mode === 'ref' ? 'Vergleichstext einfügen' : 'Text einfügen';
    $('runPaste').textContent = mode === 'ref' ? 'Als Vergleich verwenden' : 'Prüfen';
    $('modal').classList.remove('hidden'); $('pasteArea').focus();
  };
  $('pasteBtn').onclick = () => openModal('doc');
  $('refPaste').onclick = () => openModal('ref');
  $('cancelPaste').onclick = () => $('modal').classList.add('hidden');
  addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').classList.add('hidden'); });
  $('runPaste').onclick = async () => {
    const t = $('pasteArea').value.trim();
    if (t.split(/\s+/).length < 5) return alert('Bitte füge mindestens ein paar Sätze ein.');
    $('modal').classList.add('hidden'); $('pasteArea').value = '';
    if (pasteMode === 'ref') return setRef('eingefügter Vergleichstext', async () => SkyParsers.reflow(t));
    const it = addItem('Eingefügter Text, ' + new Date().toLocaleTimeString('de').slice(0, 5) + ' Uhr');
    try { await waitEngine(); run(it, SkyParsers.reflow(t)); } catch (e) { it.state = 'err'; it.err = e.message; renderQueue(); }
  };
  $('clearBtn').onclick = () => { items.length = 0; active = null; renderQueue(); $('report').classList.add('hidden'); $('welcome').classList.remove('hidden'); };

  // Bericht speichern
  $('exportBtn').onclick = () => {
    if (!active) return;
    const r = active.res, v = band(r.score);
    const txt = ['Sky Detect, Prüfbericht', `Dokument: ${active.name}`, `Datum: ${new Date().toLocaleString('de')}`, '',
      `KI-Score: ${r.score} von 100 (${VERD[v][0]})`, `Aussagekraft: ${CONF[r.conf]}`, r.mixed ? 'Hinweis: Der Text wirkt abschnittsweise sehr unterschiedlich.' : '', '', 'Begründung:',
      ...r.sig.map(x => { const t = x.s >= .6 ? 2 : x.s <= .3 ? 0 : 1; return `  ${x.n} (${['für Mensch', 'neutral', 'für KI'][t]}): ${[x.hu, x.mid, x.ai][t]}`; }), '',
      'Verlauf (KI-Score je Abschnitt): ' + r.chunks.map(c => c.score).join(', '), '',
      'Auffällige Formulierungen: ' + (Object.entries(r.found).map(([p, n]) => `${p} (${n})`).join(', ') || 'keine'), '',
      'Besonders KI-typische Sätze:', ...r.sents.filter(s => s.cls === 2).slice(0, 60).map(s => '  » ' + s.text.replace(/\s+/g, ' ')), '',
      'Hinweis: Sky Detect erkennt Stilmuster. Das Ergebnis ist ein Indiz, kein Beweis.'].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = active.name.replace(/\.[^.]+$/, '') + '_pruefbericht.txt';
    a.click(); URL.revokeObjectURL(a.href);
  };
})();
