// Musik über den eingebetteten SoundCloud-Player (Widget API). Kein Konto, kein Schlüssel: nur ein öffentlicher Link.
// Regeln: nichts speichern/herunterladen, keine Werbung, Künstler + SoundCloud nennen und verlinken (Credits).
import { G } from './state.js';
import { hit } from './input.js';

const CREDITS = 'skyroyale.credits.v1';
let widget = null, frame = null, ready = false, playing = false, cur = null, wantPlay = false, loadedUrl = '';
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// Player (neu) laden, wenn sich der Link geändert hat
export async function setMusicUrl(url) {
  url = (url || '').trim();
  if (url === loadedUrl && frame) return true;
  stopMusic();
  if (frame) { frame.remove(); frame = null; widget = null; ready = false; }
  loadedUrl = url; cur = null;
  if (!url || !validUrl(url)) { updateBar(); return !url; }
  try { await loadApi(); } catch (e) { status('SoundCloud konnte nicht geladen werden'); return false; }
  frame = document.createElement('iframe');
  frame.id = 'sc-frame'; frame.allow = 'autoplay'; frame.title = 'SoundCloud-Player';
  frame.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
    '&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false&color=%23e6c14d';
  document.getElementById('music-dock').appendChild(frame);
  widget = window.SC.Widget(frame);
  const E = window.SC.Widget.Events;
  widget.bind(E.READY, () => {
    ready = true; applyVolume();
    widget.getSounds(list => (list || []).forEach(addCredit));       // ganze Playlist in die Credits
    if (wantPlay) widget.play();
  });
  widget.bind(E.PLAY, () => { playing = true; widget.getCurrentSound(s => { if (s) { cur = s; addCredit(s); } updateBar(); }); });
  widget.bind(E.PAUSE, () => { playing = false; updateBar(); });
  widget.bind(E.FINISH, () => { playing = false; updateBar(); });
  widget.bind(E.ERROR, () => status('Dieser Link lässt sich nicht abspielen (privat oder gesperrt?)'));
  return true;
}

export function applyVolume() { if (widget && ready) widget.setVolume(Math.round((G.settings.musicVol ?? 0.5) * 100)); }
export function playMusic() { wantPlay = true; if (widget && ready) widget.play(); }
export function stopMusic() { wantPlay = false; if (widget && ready) widget.pause(); }
export function toggleMusic() { if (!widget) return; if (playing) stopMusic(); else playMusic(); }
export function nextTrack() { if (widget && ready) { widget.next(); wantPlay = true; widget.play(); } }

// Rundenstart: automatisch spielen, wenn eingestellt
export function musicRoundStart() { if (G.settings.musicAuto && widget) playMusic(); }

// Tasten im Spiel
export function updateMusic() {
  if (hit('music')) toggleMusic();
  if (hit('musicNext')) nextTrack();
}

// Anzeige "läuft gerade" (unten links im Spiel und im Pausenmenü)
function updateBar() {
  const t = cur && playing ? `${cur.title} · ${cur.user ? cur.user.username : ''}` : '';
  const bar = document.getElementById('music-now');
  if (bar) { bar.classList.toggle('hidden', !t); bar.querySelector('span').textContent = t; }
  const p = document.getElementById('music-pause');
  if (p) p.innerHTML = cur ? `<b>${playing ? 'Läuft' : 'Pausiert'}:</b> <a href="${esc(cur.permalink_url)}" target="_blank" rel="noopener">${esc(cur.title)}</a> von
    <a href="${esc(cur.user && cur.user.permalink_url)}" target="_blank" rel="noopener">${esc(cur.user && cur.user.username)}</a> · auf <a href="https://soundcloud.com" target="_blank" rel="noopener">SoundCloud</a>` : '';
}
function status(msg) { const s = document.getElementById('music-status'); if (s) s.textContent = msg; }

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
