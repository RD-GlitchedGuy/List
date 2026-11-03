// Renderer, Szene, Himmel, Licht, Nachbearbeitung (Bloom + Tempo-Effekt), Tageszeit und Qualität
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { V3 } from './util.js';
import { settings } from './settings.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 4000);
export const SUN_DIR = new V3(-0.45, 0.55, -0.7).normalize();
export const envU = { night: { value: 0 } };   // wird von Gebäude-Shadern gelesen
scene.fog = new THREE.Fog(0xd9a68c, 160, 1400);

/* ---------- Himmel ---------- */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
    sun: { value: SUN_DIR }, sunCol: { value: new THREE.Color() }, sunSize: { value: 700 }, night: envU.night,
  },
  vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
  fragmentShader: `uniform vec3 top,mid,hor,sunCol; uniform vec3 sun; uniform float sunSize,night; varying vec3 vD;
    float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    void main(){ vec3 d=normalize(vD); float h=d.y;
      vec3 c=mix(hor,mid,smoothstep(0.0,0.22,h)); c=mix(c,top,smoothstep(0.2,0.78,h));
      if(h<0.0) c=mix(hor,hor*0.75,smoothstep(0.0,-0.25,h));
      float s=max(dot(d,normalize(sun)),0.0);
      c+=sunCol*(pow(s,sunSize)*14.0+pow(s,10.0)*0.45*(1.0-night));
      vec3 g=floor(d*420.); float st=step(.9975,h3(g))*smoothstep(.05,.35,h)*night;
      c+=vec3(.9,.95,1.)*st*(.6+.8*h3(g+7.));
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
export const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
sky.frustumCulled = false;
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); { const sm = new THREE.Mesh(sky.geometry, skyMat); sm.frustumCulled = false; envScene.add(sm); }
let envRT = null;

/* ---------- Licht ---------- */
const hemi = new THREE.HemisphereLight(0xc4d6f5, 0x7a6252, 1.25);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffcfa6, 2.8);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 1200 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.35;
scene.add(sun, sun.target);
export function followSun(p) { sun.position.copy(p).addScaledVector(SUN_DIR, 500); sun.target.position.copy(p); }

/* ---------- Tageszeit: fließender Zyklus oder feste Zeit ---------- */
// Stützpunkte über den Tag: Stunde, Himmel oben/Mitte/Horizont, Nebel, Sonnenfarbe, Sonnenstärke, Himmelslicht, Nacht-Anteil, Scheibengröße
const KEYS = [
  [0, 0x03060f, 0x0b1630, 0x2e3554, 0x1d2440, 0x8fa6ff, .55, .55, 1, 2600],
  [4.6, 0x050a18, 0x101c38, 0x34385a, 0x222842, 0x8fa6ff, .45, .5, 1, 2600],
  [6, 0x2b3f73, 0xc59aa5, 0xffb48a, 0xd9a08c, 0xffb07a, 1.5, .9, .45, 700],
  [8.5, 0x2f6fc4, 0x9cc3e8, 0xdbe8f2, 0xc9d6e2, 0xfff1dc, 3.1, 1.3, 0, 900],
  [15.5, 0x2c66b8, 0x9bbfe2, 0xe4e6e8, 0xcfd5dc, 0xfff0d8, 3.1, 1.3, 0, 900],
  [18.5, 0x27477d, 0x93a9c6, 0xe9ae8c, 0xd9a68c, 0xffcfa6, 2.8, 1.25, .1, 700],
  [20, 0x101d3d, 0x3d4a78, 0xc46f5e, 0x6b4c5a, 0xff8a5a, 1.0, .8, .6, 700],
  [21.5, 0x03060f, 0x0b1630, 0x2e3554, 0x1d2440, 0x8fa6ff, .55, .55, 1, 2600],
  [24, 0x03060f, 0x0b1630, 0x2e3554, 0x1d2440, 0x8fa6ff, .55, .55, 1, 2600],
];
const FIXED = { tag: 12, abend: 18.5, nacht: 23 };
export const tod = { h: 17.5 };                    // aktuelle Uhrzeit (Spielstunden)
const _ca = new THREE.Color(), _cb = new THREE.Color();
const lerpC = (out, a, b, t) => out.copy(_ca.set(a)).lerp(_cb.set(b), t);
let envH = -99, envNight = -1;
function setHour(h) {
  tod.h = h;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = (h - A[0]) / (B[0] - A[0]);
  const m = (k) => A[k] + (B[k] - A[k]) * t;
  const u = skyMat.uniforms;
  lerpC(u.top.value, A[1], B[1], t); lerpC(u.mid.value, A[2], B[2], t); lerpC(u.hor.value, A[3], B[3], t);
  lerpC(scene.fog.color, A[4], B[4], t); lerpC(sun.color, A[5], B[5], t); u.sunCol.value.copy(sun.color).multiplyScalar(1.2);
  sun.intensity = m(6); hemi.intensity = m(7); u.sunSize.value = m(9);
  const n = m(8); envU.night.value = n;
  hemi.color.copy(_ca.set(0xc4d6f5)).lerp(_cb.set(0x5a6a9a), n); hemi.groundColor.copy(_ca.set(0x7a6252)).lerp(_cb.set(0x2a2230), n);
  scene.fog.near = 160 - 40 * n; scene.fog.far = 1450 - 350 * n;
  renderer.toneMappingExposure = 1.05 + .1 * n;
  bloom.strength = .3 + .3 * n; bloom.threshold = .97 - .05 * n;
  // Sonne tagsüber, Mond nachts: Bahn von Osten über Süden nach Westen
  const day = (h - 6) / 12, sunUp = day > 0 && day < 1;
  const ph = sunUp ? day : ((h + 6) % 24) / 12;           // Mond läuft nachts dieselbe Bahn
  const el = Math.max(.12, Math.sin(Math.PI * ph) * (sunUp ? .95 : .7)), az = Math.PI * (1.15 - ph * .9);
  SUN_DIR.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.abs(Math.sin(az)) * Math.cos(el) - .3).normalize();
  // Umgebungslicht nur ab und zu neu berechnen
  if (Math.abs(h - envH) > .3 || Math.abs(n - envNight) > .15) {
    envH = h; envNight = n;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.04); scene.environment = envRT.texture;
  }
}
export function applyTime() { envH = -99; setHour(settings.time === 'zyklus' ? tod.h : FIXED[settings.time] ?? 18.5); }
const HOUR_SEC = 40;                                 // ein Spieltag dauert 16 Minuten
export function updateTime(dt) {
  if (settings.time !== 'zyklus') return;
  setHour((tod.h + dt / HOUR_SEC) % 24);
}

/* ---------- Nachbearbeitung ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .5, .55, .85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- Qualität ---------- */
let pr = 1;
export function applyQuality() {
  const q = settings.quality, dpr = window.devicePixelRatio || 1;
  pr = q === 'hoch' ? Math.min(dpr, 2) : q === 'mittel' ? Math.min(dpr, 1.25) : 1;
  renderer.setPixelRatio(pr);
  const shadows = q !== 'niedrig', size = q === 'hoch' ? 2048 : 1024;
  sun.castShadow = shadows;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (renderer.shadowMap.enabled !== shadows) { renderer.shadowMap.enabled = shadows; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
  bloom.enabled = q !== 'niedrig';
  resize();
}
export function lowerQuality() {
  if (settings.quality === 'hoch') settings.quality = 'mittel';
  else if (settings.quality === 'mittel') settings.quality = 'niedrig';
  else return false;
  applyQuality(); return true;
}
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
}
addEventListener('resize', resize);

export function render() {
  if (settings.quality === 'niedrig') renderer.render(scene, camera);
  else composer.render();
}

applyQuality();
applyTime();
