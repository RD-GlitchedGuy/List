// Sky Detect – Datei-Parser: macht aus jedem Dokument reinen Text
(() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let pdfReady = null;

  const loadPdfJs = () => pdfReady ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(); };
    s.onerror = () => rej(new Error('PDF-Bibliothek konnte nicht geladen werden (offline?)'));
    document.head.appendChild(s);
  });

  // ---- ZIP (für DOCX/ODT/PPTX) ohne Bibliothek
  async function unzip(buf, want) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--)
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Datei ist beschädigt oder kein Office-Dokument');
    let p = dv.getUint32(eocd + 16, true);
    const count = dv.getUint16(eocd + 10, true), files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nLen));
      p += 46 + nLen + xLen + cLen;
      if (!want(name)) continue;
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const raw = u8.subarray(start, start + size);
      if (method === 0) files[name] = dec.decode(raw);
      else if (method === 8) {
        const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        files[name] = await new Response(ds).text();
      }
    }
    return files;
  }

  const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(x?)([0-9a-f]+);/gi, (_, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10)))
    .replace(/&amp;/g, '&');
  const stripXml = s => ent(s.replace(/<[^>]+>/g, ''));

  // Absätze einzeln, Listenpunkte mit "• " markieren
  function joinParas(paras) {
    let out = '';
    paras.forEach((p, i) => { if (i) out += p.list && paras[i - 1].list ? '\n' : '\n\n'; out += (p.list ? '• ' : '') + p.t; });
    return out;
  }
  function fromDocx(x) {
    return joinParas((x.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(p => ({
      list: /<w:numPr>|<w:pStyle w:val="[^"]*(List|Liste|Aufz)/i.test(p),
      t: stripXml(p.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n')).trim()
    })).filter(p => p.t));
  }
  function fromOdt(x) {
    x = x.replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<text:s[^>]*\/>/g, ' ');
    const paras = [];
    x.replace(/<text:(p|h)[ >][\s\S]*?<\/text:\1>|<text:list-item[ >]/g, m => {
      if (m.startsWith('<text:list-item')) paras.pendingList = true;
      else { const t = stripXml(m).trim(); if (t) paras.push({ t, list: !!paras.pendingList }); paras.pendingList = false; }
      return m;
    });
    return joinParas(paras);
  }
  function fromPptx(files) {
    return Object.keys(files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))
      .map(n => stripXml(files[n].replace(/<\/a:p>/g, '\n'))).join('\n\n');
  }

  function fromRtf(s) {
    return s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(h, 16)])))
      .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((+n + 65536) % 65536))
      .replace(/\{\\\*[^{}]*\}/g, '').replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '')
      .replace(/\\par[d]?\b ?/g, '\n\n').replace(/\\line\b ?/g, '\n').replace(/\\tab\b ?/g, '\t')
      .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\');
  }

  function fromHtml(s) {
    const doc = new DOMParser().parseFromString(s, 'text/html');
    doc.querySelectorAll('script,style,noscript,nav,header,footer').forEach(e => e.remove());
    doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,section,article').forEach(e => e.append('\n\n'));
    doc.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
    return doc.body ? doc.body.textContent : '';
  }

  // PDF: Text über Positionen rekonstruieren (Zeilen, Absätze, Überschriften, Listen)
  const BULLET = /^([•●▪◦○■□➢➤►▶✓✔✅☐→·]|[-–—*+]\s|\d{1,2}[.)]\s|[a-z][.)]\s)/u;
  async function fromPdf(buf) {
    await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 400); p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      const lines = [];
      let L = null;
      for (const it of tc.items) {
        if (!it.str) continue;
        const x = it.transform[4], y = it.transform[5];
        const size = Math.abs(it.transform[3]) || it.height || 10;
        if (!L || Math.abs(y - L.y) > size * 0.5) {
          if (L && L.text.trim()) lines.push(L);
          L = { text: '', x, y, size: 0, right: x };
        } else if (x - L.right > size * 0.2 && !/\s$/.test(L.text) && !/^\s/.test(it.str)) L.text += ' ';
        L.text += it.str; L.right = Math.max(L.right, x + (it.width || 0));
        if (it.str.trim().length > (L.len || 0)) { L.len = it.str.trim().length; L.size = size; }   // Größe des Haupttexts, nicht des Bullets
      }
      if (L && L.text.trim()) lines.push(L);
      lines.forEach(l => l.text = l.text.replace(/\s+/g, ' ').trim());
      pages.push(lines);
    }
    // Kopf-/Fußzeilen und Seitenzahlen entfernen
    const freq = {};
    pages.forEach(ls => new Set(ls.map(l => l.text)).forEach(t => freq[t] = (freq[t] || 0) + 1));
    const all = pages.map(ls => ls.filter(l => !/^(seite|page|página)?\s*\d+(\s*(\/|von|of|de)\s*\d+)?$/i.test(l.text) && !(pages.length >= 3 && freq[l.text] >= 3)));
    const sizes = {};
    all.flat().forEach(l => { const k = Math.round(l.size); sizes[k] = (sizes[k] || 0) + l.text.length; });
    const body = +Object.entries(sizes).sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
    let out = '';
    for (const ls of all) {
      const right = Math.max(...ls.map(l => l.right), 0);
      const gaps = [];
      for (let i = 1; i < ls.length; i++) { const g = ls[i - 1].y - ls[i].y; if (g > 0) gaps.push(g); }
      gaps.sort((a, b) => a - b);
      const lead = gaps[Math.floor(gaps.length / 2)] || body * 1.3;
      let prev = null;
      for (const l of ls) {
        const head = l.size > body * 1.12 && l.text.split(' ').length <= 15;
        if (!prev) out += out ? '\n\n' : '';
        else {
          const gap = prev.y - l.y;
          if (head && prev.head && Math.abs(l.size - prev.size) < 0.5 && gap < l.size * 1.6) out += ' ';   // mehrzeilige Überschrift
          else if (head || prev.head || gap > lead * 1.45 || gap < 0) out += '\n\n';
          else if (BULLET.test(l.text) || (prev.right < right * 0.8 && /[.!?:]$/.test(prev.text))) out += '\n';
          else if (/\p{Ll}-$/u.test(prev.text) && /^\p{Ll}/u.test(l.text)) out = out.slice(0, -1);
          else out += ' ';
        }
        out += l.text; l.head = head; prev = l;
      }
    }
    if (!out.trim()) throw new Error('PDF enthält keinen Text (eingescannt?)');
    return out;
  }

  // Harte Zeilenumbrüche (PDF, Mails) zu Fließtext zusammenführen
  function reflow(t) {
    t = t.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/­/g, '');
    t = t.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2');               // Silbentrennung
    const lines = t.split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i], next = lines[i + 1];
      out.push(cur);
      if (next === undefined) break;
      const join = cur.trim().length > 45 && !BULLET.test(cur.trim()) && /[\p{L},;\-–]$/u.test(cur.trim()) &&
        next.trim() && !/^\s*([-*•#>]|\d+[.)]\s)/u.test(next);
      out.push(join ? ' ' : '\n');
    }
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function fileToText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let text;
    if (ext === 'pdf') text = await fromPdf(await file.arrayBuffer());
    else if (ext === 'docx') text = fromDocx((await unzip(await file.arrayBuffer(), n => n === 'word/document.xml'))['word/document.xml'] || '');
    else if (ext === 'odt') text = fromOdt((await unzip(await file.arrayBuffer(), n => n === 'content.xml'))['content.xml'] || '');
    else if (ext === 'pptx') text = fromPptx(await unzip(await file.arrayBuffer(), n => n.startsWith('ppt/slides/slide')));
    else if (ext === 'rtf') text = fromRtf(await file.text());
    else if (ext === 'html' || ext === 'htm') text = fromHtml(await file.text());
    else if (['txt', 'md', 'csv', 'json', 'tex', ''].includes(ext) || file.type.startsWith('text/')) text = await file.text();
    else if (ext === 'doc') throw new Error('Altes .doc-Format – bitte als .docx oder PDF speichern');
    else throw new Error('Format nicht unterstützt');
    text = reflow(text);
    if (text.split(/\s+/).length < 5) throw new Error('Kein lesbarer Text gefunden');
    return text;
  }

  window.SkyParsers = { fileToText, reflow };
})();
