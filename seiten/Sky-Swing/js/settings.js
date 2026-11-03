// Einstellungen und Bestwerte, im Browser gespeichert
import { isTouch } from './util.js';

const KEY = 'skyweaver.settings.v1', BEST = 'skyweaver.best.v1';
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };

export const settings = Object.assign({
  quality: isTouch ? 'mittel' : 'hoch', time: 'zyklus', sens: 1, invertY: false, volume: .8, fullscreen: !isTouch,
  colors: { base: '#1b2231', panel: '#34465f', acc: '#ff7a1a', dark: '#141922', visor: '#ff8a2a' },
  name: 'Weaver' + Math.floor(100 + Math.random() * 900),
}, load(KEY));
if (settings.night !== undefined) { if (!load(KEY).time) settings.time = settings.night ? 'nacht' : 'abend'; delete settings.night; }
export const best = Object.assign({ race: null, score: 0, courier: 0, chase: null }, load(BEST));

export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {} }
export function saveBest() { try { localStorage.setItem(BEST, JSON.stringify(best)); } catch (e) {} }
