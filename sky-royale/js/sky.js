// Comic-Himmel mit Wolken und stilisiertes Wasser mit Schaum an den Küsten
import * as THREE from 'three';
import { G } from './state.js';

export const HORIZON = new THREE.Color('#c3e2f4');
const ZENITH = new THREE.Color('#3f86d4');
const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.32).normalize();

export function createSky() {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: ZENITH }, bot: { value: HORIZON }, sun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sun; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0., 1.);
        vec3 c = mix(bot, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sun), 0.);
        c += vec3(1., .95, .8) * (pow(s, 900.) * 1.2 + pow(s, 12.) * 0.12);
        if (vDir.y < 0.) c = bot;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; dome.userData.noMap = true;
  G.scene.add(dome);
  G.skyDome = dome;
  G.scene.background = HORIZON.clone();

  // Wolken: viele Kugeln, zu dicken Haufen gruppiert (InstancedMesh = schnell)
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#b8c8d8', emissiveIntensity: 0.45, fog: false });
  const N = 40, PER = 7;
  const mesh = new THREE.InstancedMesh(geo, mat, N * PER);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const ang = Math.random() * Math.PI * 2, r = 120 + Math.random() * 900;
    const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r, cy = 165 + Math.random() * 90, size = 10 + Math.random() * 14;
    for (let j = 0; j < PER; j++) {
      const s = size * (0.55 + Math.random() * 0.6) * (j === 0 ? 1.3 : 1);
      p.set(cx + (Math.random() - 0.5) * size * 3.2, cy + Math.random() * size * 0.5, cz + (Math.random() - 0.5) * size * 1.6);
      sc.set(s, s * 0.72, s);
      m4.compose(p, q, sc); mesh.setMatrixAt(k++, m4);
    }
  }
  mesh.userData.noMap = true;
  const group = new THREE.Group(); group.add(mesh); group.userData.noMap = true;
  G.scene.add(group);
  G.clouds = group;
}

export function createWater() {
  // Geländehöhe als Textur, damit das Wasser Tiefe und Schaum kennt
  const N = 321, data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.max(0, Math.min(255, Math.round((G.heights[i] + 20) * 3.9)));
  const ht = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, heights: { value: null }, sun: { value: SUN_DIR }, sky: { value: HORIZON },
    }]),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform sampler2D heights; uniform vec3 sun; uniform vec3 sky; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 uv = (vW.xz + 320.) / 640.;
        float h = -20.;
        if (uv.x > 0. && uv.y > 0. && uv.x < 1. && uv.y < 1.) h = texture2D(heights, uv).r * 255. / 3.9 - 20.;
        float d = clamp(-h / 10., 0., 1.);
        vec3 col = mix(vec3(.27,.78,.80), vec3(.06,.33,.62), smoothstep(0., 1., d));
        float t = time;
        vec3 n = normalize(vec3(cos(vW.x*.21 + t*1.3)*.12 + cos((vW.x+vW.z)*.13 - t*.9)*.08, 1., cos(vW.z*.19 - t*1.1)*.12 + sin((vW.x-vW.z)*.11 + t*.7)*.08));
        vec3 v = normalize(cameraPosition - vW);
        float spec = pow(max(dot(n, normalize(sun + v)), 0.), 120.) * .9;
        float fr = pow(1. - max(v.y, 0.), 4.) * .45;
        col = mix(col, sky, fr) + spec;
        // Schaumkante an der Küste + Wellenlinien
        float shore = smoothstep(0.7, 0., -h);
        float lines = step(.86, sin(-h * 5. + t * 2.) * .5 + .5) * smoothstep(1.3, .7, -h);
        col = mix(col, vec3(.95,.98,1.), clamp(shore * .8 + lines * .35, 0., 1.));
        float a = mix(.55, .93, d) + shore * .3;
        gl_FragColor = vec4(col, clamp(a, 0., 1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.heights.value = ht;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.02;
  G.scene.add(water);
  G.water = water;
  return water;
}

export function updateSky(dt, camPos) {
  if (G.water) G.water.material.uniforms.time.value += dt;
  if (G.skyDome) { G.skyDome.position.copy(camPos); G.skyDome.scale.setScalar(G.camera.far * 0.9 / 1900); }
  if (G.clouds) { G.clouds.position.x += dt * 1.6; if (G.clouds.position.x > 400) G.clouds.position.x = -400; }
}
