// Musik über den eingebetteten SoundCloud-Player (Widget API). Kein Konto, kein Schlüssel: nur ein öffentlicher Link.
// Regeln: nichts speichern/herunterladen, keine Werbung, Künstler + SoundCloud nennen und verlinken (Credits).
import { G } from './state.js';
import { hit } from './input.js';

const CREDITS = 'skyroyale.credits.v1';
let widget = null, frame = null, ready = false, playing = false, cur = null, wantPlay = false, loadedUrl = '';
let dock = null, peekUntil = 0, closed = false, playAsked = 0, readyWait = null;
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Link aufräumen: Tracking-Anhänge (?utm_…) weg, nur der eigentliche SoundCloud-Pfad bleibt
export function cleanUrl(u) {
  try { const x = new URL(u.trim()); if (!x.pathname.includes('/s-')) x.search = ''; x.hash = ''; return x.toString().replace(/\/$/, ''); } catch (e) { return u.trim(); }
}
// Profil-Link (soundcloud.com/name) statt Playlist (…/sets/…) oder Track?
export const isProfile = u => { try { return new URL(u).pathname.split('/').filter(Boolean).length === 1; } catch (e) { return false; } };

// Nur echte SoundCloud-Adressen annehmen
export function validUrl(u) {
  try { const x = new URL(u.trim()); return /(^|\.)soundcloud\.com$/.test(x.hostname) && x.protocol === 'https:'; } catch (e) { return false; }
}

function loadApi() {
  return new Promise((res, rej) => {
    if (window.SC && window.SC.Widget) return res();
    const s = document.createElement('script');
    s.src = 'https://w.soundcloud.com/player/api.js';
    s.onload = res; s.onerror = () => rej(new Error('SoundCloud nicht erreichbar'));
    document.head.appendChild(s);
  });
}

// ---------- Pop-up unten links: der echte SoundCloud-Player (zeigt Titel, Künstler, Play-Knopf) ----------
function buildDock() {
  dock = document.getElementById('music-dock');
  dock.innerHTML = `<div class="md-head"><b>♪ Musik</b><a class="md-open" href="https://soundcloud.com" target="_blank" rel="noopener">Auf SoundCloud öffnen</a><button class="md-x" title="Ausblenden">✕</button></div>
    <div class="md-frame"></div><div class="md-msg"></div>`;
  dock.querySelector('.md-x').onclick = () => { closed = true; peekUntil = 0; show(); };
  document.getElementById('music-tab').onclick = () => { closed = false; show(); };
  setInterval(show, 250);
}
function msg(t) { if (dock) dock.querySelector('.md-msg').textContent = t || ''; status(t); }
export function peekMusic(sec = 6) { peekUntil = performance.now() + sec * 1000; show(); }
// Sichtbar: in Menüs immer (außer weggeklickt), im Spiel nur kurz als Pop-up bei neuem Song oder Tastendruck
function show() {
  if (!dock) return;
  const inGame = !!document.pointerLockElement;
  const has = !!frame;
  const on = has && (inGame ? performance.now() < peekUntil : !closed);
  dock.classList.toggle('on', on);
  dock.classList.toggle('peek', inGame);
  const tab = document.getElementById('music-tab');
  tab.classList.toggle('hidden', !has || on || inGame);
  // Abspielen angefordert, aber nichts passiert: meist blockiert der Browser das automatische Abspielen
  if (playAsked && !playing && performance.now() - playAsked > 4000) {
    playAsked = 0;
    msg('Dein Browser hat das automatische Abspielen blockiert – klick einmal im Player auf ▶ (Esc öffnet das Menü).');
    closed = false; peekMusic(12);
  }
}

// Player (neu) laden, wenn sich der Link geändert hat. Rückgabe: true, sobald der Player wirklich bereit ist.
export async function setMusicUrl(url) {
  if (!dock) buildDock();
  url = url ? cleanUrl(url) : '';
  if (url === loadedUrl && frame) return ready;
  stopMusic();
  if (frame) { frame.remove(); frame = null; widget = null; ready = false; }
  loadedUrl = url; cur = null; msg('');
  if (!url) { show(); return true; }
  if (!validUrl(url)) { show(); return false; }
  try { await loadApi(); } catch (e) { msg('SoundCloud konnte nicht geladen werden (Internet / Werbeblocker?).'); return false; }
  frame = document.createElement('iframe');
  frame.id = 'sc-frame'; frame.title = 'SoundCloud-Player';
  frame.setAttribute('allow', 'autoplay; encrypted-media');        // neuere SoundCloud-Streams sind verschlüsselt
  frame.setAttribute('scrolling', 'no'); frame.setAttribute('frameborder', 'no');
  frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
    '&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&color=%23e6c14d';
  dock.querySelector('.md-frame').appendChild(frame);
  closed = false; show();
  widget = window.SC.Widget(frame);
  const E = window.SC.Widget.Events;
  const ok = await new Promise(res => {
    readyWait = setTimeout(() => res(false), 12000);
    widget.bind(E.READY, () => { clearTimeout(readyWait); res(true); });
  });
  if (!ok) { msg('Der Player lädt nicht. Ist der Link öffentlich und richtig?'); return false; }
  // Gibt es unter dem Link überhaupt öffentliche Titel? (Profile ohne Uploads oder private Playlists sind leer)
  let list = [];
  for (let i = 0; i < 6 && !list.length; i++) { list = await new Promise(r => widget.getSounds(s => r(s || []))); if (!list.length) await new Promise(r => setTimeout(r, 500)); }
  if (!list.length) {
    msg(isProfile(url) ? 'Dieses Profil hat keine öffentlichen Tracks. Ein Profil-Link spielt nur eigene Uploads – nimm den Link einer öffentlichen Playlist (…/sets/…).'
      : 'Unter diesem Link gibt es keine öffentlichen Titel. Ist die Playlist privat? Dann in SoundCloud auf öffentlich stellen.');
    return false;
  }
  ready = true; applyVolume();
  list.forEach(addCredit);                                           // ganze Playlist in die Credits
  dock.querySelector('.md-open').href = url;
  widget.bind(E.PLAY, () => {
    playing = true; playAsked = 0; msg('');
    widget.getCurrentSound(s => { if (s) { if (!cur || cur.id !== s.id) peekMusic(6); cur = s; addCredit(s); } });
  });
  widget.bind(E.PAUSE, () => { playing = false; });
  widget.bind(E.FINISH, () => { playing = false; });
  widget.bind(E.ERROR, () => msg('Dieser Titel lässt sich hier nicht abspielen (privat, Go+ oder vom Künstler gesperrt).'));
  if (wantPlay) playMusic();
  return true;
}

export function applyVolume() { if (widget && ready) widget.setVolume(Math.round((G.settings.musicVol ?? 0.5) * 100)); }
export function playMusic() { wantPlay = true; if (widget && ready) { widget.play(); playAsked = performance.now(); } }
export function stopMusic() { wantPlay = false; playAsked = 0; if (widget && ready) widget.pause(); }
export function toggleMusic() { if (!widget) return; peekMusic(4); if (playing) stopMusic(); else playMusic(); }
export function nextTrack() { if (widget && ready) { widget.next(); wantPlay = true; widget.play(); peekMusic(6); } }

// Rundenstart: automatisch spielen, wenn eingestellt
export function musicRoundStart() { if (G.settings.musicAuto && widget && !playing) playMusic(); }

// Tasten im Spiel
export function updateMusic() {
  if (hit('music')) toggleMusic();
  if (hit('musicNext')) nextTrack();
}
function status(t) { const s = document.getElementById('music-status'); if (s && t) s.textContent = t; }

// ---------- Credits ----------
function loadCredits() { try { return JSON.parse(localStorage.getItem(CREDITS) || '[]'); } catch (e) { return []; } }
function addCredit(s) {
  if (!s || !s.permalink_url || !s.title) return;
  const list = loadCredits();
  if (list.some(c => c.url === s.permalink_url)) return;
  list.push({ title: s.title, artist: s.user ? s.user.username : '', artistUrl: s.user ? s.user.permalink_url : '', url: s.permalink_url });
  try { localStorage.setItem(CREDITS, JSON.stringify(list.slice(-500))); } catch (e) {}
}
export function creditsHtml() {
  const list = loadCredits();
  const music = list.length
    ? list.map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a> – <a href="${esc(c.artistUrl)}" target="_blank" rel="noopener">${esc(c.artist)}</a></li>`).join('')
    : '<li class="dim">Noch keine Musik gehört. Den Link zu einer Playlist trägst du in den Einstellungen unter „Musik“ ein.</li>';
  return `<h3>Musik</h3><p class="dim">Gestreamt über <a href="https://soundcloud.com" target="_blank" rel="noopener">SoundCloud</a>. Alle Rechte bei den Künstlern. Hier stehen alle Titel, die in diesem Browser im Spiel gelaufen sind.</p>
    <ul class="cred">${music}</ul>
    <h3>Soundeffekte</h3><p class="dim">Alle CC0 (gemeinfrei). Danke an:</p>
    <ul class="cred"><li>The Free Firearm Sound Library, geschnitten im Projekt <a href="https://github.com/mrellcrane/smokeem" target="_blank" rel="noopener">smokeem</a></li>
    <li><a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a> (Interface, Impact, RPG Audio)</li>
    <li>Still North Media, Versilian Community Sample Library, Freesound-Aufnahmen unter CC0 – über das Projekt <a href="https://github.com/hoffspot/conquest" target="_blank" rel="noopener">conquest</a></li></ul>
    <h3>Technik</h3><ul class="cred"><li><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a>, <a href="https://github.com/gkjohnson/three-mesh-bvh" target="_blank" rel="noopener">three-mesh-bvh</a>, <a href="https://peerjs.com" target="_blank" rel="noopener">PeerJS</a></li></ul>`;
}
