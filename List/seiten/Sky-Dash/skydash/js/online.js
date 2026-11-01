/* Sky Dash — Online-Modus (Sky Games)
   Mehrspieler über PeerJS (öffentlicher PeerJS-Server). Ein Spieler ist Gastgeber des Raums
   und verteilt die Positionen an alle anderen. Andere Spieler erscheinen als Geister im Level. */
(function () {
  'use strict';
  const PREFIX = 'skydash-sg-room-';
  const O = {
    peer: null, isHost: false, conns: [], hostConn: null,
    room: null, isPublic: false, status: 'offline', error: '',
    players: {}, name: 'Spieler', icon: null, onChange: null, lastSend: 0, last: {}
  };

  const changed = () => { if (O.onChange) O.onChange(); };
  const setStatus = (s, e) => { O.status = s; O.error = e || ''; changed(); };

  O.available = () => typeof window.Peer === 'function';

  function randCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = '';
    for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  const clean = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  function me() { return Object.assign({ id: O.peer && O.peer.id, name: O.name, icon: O.icon }, O.last); }

  function store(d) {
    if (!d || !d.id || (O.peer && d.id === O.peer.id)) return;
    const old = O.players[d.id] || {};
    O.players[d.id] = Object.assign(old, d, { seen: performance.now() });
    if (old.dx === undefined || d.lv !== old.lv || Math.abs(old.dx - d.x) > 4) { old.dx = d.x; old.dy = d.y; }
  }

  // ----- Gastgeber -----
  function hostSetup(c) {
    c.on('open', () => {
      O.conns.push(c);
      c.send({ t: 'all', list: Object.values(O.players).concat([me()]) });
      changed();
    });
    c.on('data', d => {
      if (!d || d.t !== 'st') return;
      d.id = c.peer; store(d);
      for (const o of O.conns) if (o !== c && o.open) o.send(d);
    });
    const bye = () => {
      O.conns = O.conns.filter(o => o !== c);
      delete O.players[c.peer];
      for (const o of O.conns) if (o.open) o.send({ t: 'bye', id: c.peer });
      changed();
    };
    c.on('close', bye); c.on('error', bye);
  }

  // ----- Mitspieler -----
  function clientSetup(c) {
    c.on('open', () => { O.hostConn = c; setStatus('online'); O.send(true); });
    c.on('data', d => {
      if (!d) return;
      if (d.t === 'all') d.list.forEach(store);
      else if (d.t === 'st') store(d);
      else if (d.t === 'bye') delete O.players[d.id];
      changed();
    });
    c.on('close', () => {
      O.hostConn = null; O.players = {};
      // Ist der Gastgeber des öffentlichen Raums weg, übernimmt jemand anderes
      if (O.isPublic && O.status !== 'offline') { O.leave(true); setTimeout(() => O.joinPublic(), 400 + Math.random() * 1200); }
      else setStatus('error', 'Der Gastgeber hat den Raum verlassen.');
    });
  }

  function newPeer(id) {
    const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
    O.peer = p;
    return p;
  }

  O.create = function (code, isPublic) {
    if (!O.available()) return setStatus('error', 'Online-Bibliothek konnte nicht geladen werden (Internet?).');
    O.leave(true);
    code = clean(code) || randCode();
    O.room = code; O.isPublic = !!isPublic; setStatus('connecting');
    const p = newPeer(PREFIX + code);
    p.on('open', () => { O.isHost = true; setStatus('online'); });
    p.on('connection', hostSetup);
    p.on('error', e => {
      if (e.type === 'unavailable-id') { // Raum gibt es schon → beitreten
        if (isPublic) O.join(code, true);
        else setStatus('error', 'Diesen Raumcode gibt es schon. Nimm einen anderen.');
      } else if (O.status === 'connecting') setStatus('error', 'Verbindung fehlgeschlagen (' + e.type + ').');
    });
  };

  O.join = function (code, isPublic) {
    if (!O.available()) return setStatus('error', 'Online-Bibliothek konnte nicht geladen werden (Internet?).');
    O.leave(true);
    code = clean(code);
    if (!code) return setStatus('error', 'Bitte einen Raumcode eingeben.');
    O.room = code; O.isPublic = !!isPublic; setStatus('connecting');
    const p = newPeer();
    p.on('open', () => clientSetup(p.connect(PREFIX + code, { reliable: true })));
    p.on('error', e => {
      if (e.type === 'peer-unavailable') {
        if (isPublic) O.create(code, true); // niemand da → selbst Gastgeber werden
        else setStatus('error', 'Raum „' + code + '“ nicht gefunden.');
      } else setStatus('error', 'Verbindung fehlgeschlagen (' + e.type + ').');
    });
    setTimeout(() => { if (O.status === 'connecting' && O.room === code) setStatus('error', 'Zeitüberschreitung – nochmal versuchen.'); }, 12000);
  };

  O.joinPublic = () => O.create('GLOBAL', true); // erst versuchen, Gastgeber zu werden – geht schneller

  O.leave = function (quiet) {
    if (O.peer) { try { O.peer.destroy(); } catch (e) { /* egal */ } }
    O.peer = null; O.isHost = false; O.conns = []; O.hostConn = null; O.players = {};
    if (!quiet) { O.room = null; O.isPublic = false; setStatus('offline'); }
  };

  O.connected = () => O.status === 'online';
  O.count = () => O.connected() ? Object.keys(O.players).length + 1 : 0;

  // Eigenen Zustand mitteilen (höchstens 15× pro Sekunde)
  O.update = function (state) { O.last = state; O.send(false); };
  O.send = function (force) {
    if (!O.connected()) return;
    const now = performance.now();
    if (!force && now - O.lastSend < 66) return;
    O.lastSend = now;
    const d = Object.assign({ t: 'st' }, me());
    if (O.isHost) { for (const c of O.conns) if (c.open) c.send(d); }
    else if (O.hostConn && O.hostConn.open) O.hostConn.send(d);
  };

  // Geister weich bewegen und alte Einträge entfernen
  O.step = function (dt, speedOf) {
    const now = performance.now();
    for (const id in O.players) {
      const p = O.players[id];
      if (now - p.seen > 6000) { delete O.players[id]; changed(); continue; }
      if (p.lv && !p.dead && !p.done) p.x += (speedOf(p.lv) || 0) * dt; // weiterlaufen bis zum nächsten Paket
      p.dx += (p.x - p.dx) * Math.min(1, dt * 12);
      p.dy += (p.y - p.dy) * Math.min(1, dt * 12);
    }
  };

  window.addEventListener('pagehide', () => O.leave(true));
  window.SDOnline = O;
})();
