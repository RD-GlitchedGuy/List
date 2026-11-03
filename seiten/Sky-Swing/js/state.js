// Gemeinsamer Spielzustand (alle Module lesen und schreiben hier)
import { V3 } from './util.js';

export const game = { started: false, paused: false, won: false, playTime: 0, collected: 0, clock: 0 };
export const cam = { yaw: Math.PI, pitch: 0.1, idle: 0, zoom: 1, tgt: new V3() };
export const I = { mx: 0, mz: 0, lx: 0, ly: 0, look: false };
export const camF = new V3(0, 0, -1);
export const camR = new V3();
export const wish = new V3();

export const P = {
  pos: new V3(), vel: new V3(), state: 'ground', onGround: false, hasWall: false, wallN: new V3(),
  anchor: new V3(), anchors: [new V3(), new V3()], nAnch: 0, L: 0, dbl: false, side: 1,
  airZips: 2, wallCD: 0, wallGrace: 0, swingCD: 0, zip: null, zipFx: null, charge: 0, coyote: 0, land: 0,
  phase: 0, diving: false, faceYaw: Math.PI, cOff: new V3(0, .95, 0), webT: 1, crouch: -.95, wishLen: 0,
  trick: null, trickN: 0, roll: 0, lowSwing: false, groundT: 0, sling: [], carrier: null,
};
export const fx = { shake: 0, punch: 0, impact: 0 };    // Kamerawackeln und Sichtfeld-Stoß
export const mode = { name: 'free' };         // 'free' = Freies Schwingen, 'race' = Ring-Rennen
