// Stil-Punkte mit Kombo-Multiplikator: alles, was man in der Luft macht, zählt, bis man landet
import { best, saveBest } from './settings.js';

export const score = { total: 0, pending: 0, combo: 0, mult: 1, label: '', pts: 0, popT: 0 };

export function addStyle(pts, label) {
  score.combo++;
  score.mult = Math.min(5, 1 + Math.floor(score.combo / 3) * .5);
  const v = Math.round(pts * score.mult);
  score.pending += v; score.label = label; score.pts = v; score.popT = 1.4;
}
export function bank() {
  if (score.pending <= 0) return;
  score.total += score.pending; score.pending = 0; score.combo = 0; score.mult = 1;
  if (score.total > best.score) { best.score = score.total; saveBest(); }
}
export function loseCombo() { score.pending = 0; score.combo = 0; score.mult = 1; }
export function resetScore() { loseCombo(); score.total = 0; }
