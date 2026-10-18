// Wordless process cut: macro camera moves over the clay with depth of field, bloom in
// the kiln. Frames must be rendered in order: window.reel.frame(0), frame(1), …
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { BokehPass } from '../vendor/postprocessing/BokehPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { Clay } from '../js/clay.js';
import { GLAZES, createClayMaterial, setBody, setGlaze } from '../js/material.js';

const FPS = 30, W = 1080, H = 1920, WORD = 'clay', DURATION = 20;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp((t - a) / (b - a));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const sm = (t) => t * t * (3 - 2 * t);
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ process timing

const TYPE_AT = [0.3, 0.75, 1.2, 1.65];
const PRESS = { at: [2.75, 3.5], li: 0, x: -0.17, y: 0.36, r: 0.11 };
const CARVE = { at: [4.05, 4.95], li: 1, x: 0, y0: 0.68, y1: 0.1 };
const ADD = { at: [5.3, 5.85], li: 3, x: 0.17, y: 0.58 };
const DRY = [6.3, 7.45];
const BISQUE = [7.6, 10.4, 950];
const DIP = [10.2, 11.25];
const GLOST = [11.6, 14.6, 1240];
const MONTAGE = { at: 16.0, every: 0.4, glazes: ['tenmoku', 'cobalt', 'shino', 'jun'] };
const END = 17.6;

function kiln(u, peak) {
  if (u <= 0 || u >= 1) return 20;
  if (u < 0.55) return 20 + (peak - 20) * ease(u / 0.55);
  if (u < 0.66) return peak;
  return 20 + (peak - 20) * Math.exp(-((u - 0.66) / 0.34) * 3.4);
}

// ------------------------------------------------------------ renderer

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.background = new THREE.Color('#e2e4df');
const camera = new THREE.PerspectiveCamera(26, W / H, 0.02, 100);

const key = new THREE.DirectionalLight(0xfff3e6, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 0.5, far: 14 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
rim.position.set(3.5, 2, -3);
scene.add(rim);
const hemi = new THREE.HemisphereLight(0xeef1ee, 0x5d564d, 0.55);
scene.add(hemi);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.2 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const wheel = new THREE.Group();
scene.add(wheel);
const material = createClayMaterial();
const U = material.userData.uniforms;
const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
mesh.castShadow = mesh.receiveShadow = true;
wheel.add(mesh);
setBody(material, 'stoneware');
setGlaze(material, 'celadon');

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 2, aperture: 0.01, maxblur: 0.009 });
composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------ clay

const clay = new Clay({ budget: 420000 });
let minY = 0;
function remesh() {
  const { positions, indices } = clay.mesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  g.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = g;
  let m = Infinity;
  for (let i = 1; i < positions.length; i += 3) m = Math.min(m, positions[i]);
  if (m !== Infinity) minY = m;
}
const surface = (li, x, y) => clay.raycast([clay.letters[li].cx + x, y, 2], [0, 0, -1]);
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

const sim = { pressP: null, carveLast: null, addP: null };

function stepClay(t, dt) {
  let changed = false;
  if (t < 2.6) {
    clay.letters.forEach((L, k) => { if (t >= TYPE_AT[k]) L.target = 1; });
    for (const L of clay.letters) {
      const h = dt / 4;
      for (let s = 0; s < 4; s++) { L.vel += ((L.target - L.grow) * 90 - L.vel * 10) * h; L.grow += L.vel * h; }
    }
    clay.build();
    changed = true;
  } else if (t - dt < 2.6) {
    clay.letters.forEach((L) => { L.grow = 1; L.vel = 0; });
    clay.build();
    changed = true;
  }
  // a thumb sinking in slowly
  if (t >= PRESS.at[0] && t - dt < PRESS.at[1]) {
    sim.pressP ??= surface(PRESS.li, PRESS.x, PRESS.y);
    const p = sim.pressP, r = PRESS.r, u = ease(span(t, ...PRESS.at));
    const c = [p[0], p[1], p[2] + r * (1 - 0.5 * u)];
    if (p) {
      clay.region(c, r * 1.4, (f, x, y, z) => smax(f, r - Math.hypot(x - c[0], y - c[1], z - c[2]), r * 0.4));
      changed = true;
    }
  }
  // a loop tool pulled down the stem
  if (t >= CARVE.at[0] && t - dt < CARVE.at[1]) {
    const p = surface(CARVE.li, CARVE.x, lerp(CARVE.y0, CARVE.y1, ease(span(t, ...CARVE.at))));
    if (p) {
      if (sim.carveLast) clay.carve(sim.carveLast, p, [0, 0, -1], 0.1);
      sim.carveLast = p;
      changed = true;
    }
  }
  // a lump pinched on and swelling
  if (t >= ADD.at[0] && t - dt < ADD.at[1]) {
    sim.addP ??= surface(ADD.li, ADD.x, ADD.y);
    const p = sim.addP;
    if (p) {
      const rr = 0.085 * easeOut(span(t, ...ADD.at)) + 0.01;
      const c = [p[0], p[1], p[2] + rr * 0.2];
      clay.region(c, rr * 2, (f, x, y, z) => smin(f, Math.hypot(x - c[0], y - c[1], z - c[2]) - rr, rr * 0.6));
      changed = true;
    }
  }
  if (changed) remesh();
}

const look = { water: 22, wet: 1, scale: 1, fired: 0, heat: 0, glazeOn: false, line: 9, drip: 0, melt: 0, T: 20 };
function stepLook(t) {
  const L = look;
  if (t >= DRY[0]) { const d = sm(span(t, ...DRY)); L.water = 22 * (1 - d); L.wet = L.water / 22; L.scale = Math.min(L.scale, 1 - 0.05 * d); }
  let T = 20, hot = 0;
  if (t >= BISQUE[0] && t < 10.0) { T = kiln(span(t, BISQUE[0], BISQUE[1]), BISQUE[2]); hot = 0.85; }
  if (t >= BISQUE[0]) {
    L.fired = Math.max(L.fired, clamp((T - 550) / 400));
    L.scale = Math.min(L.scale, lerp(0.95, 0.936, clamp((T - 400) / 550)));
  }
  if (t >= 10.0) { L.fired = 1; L.scale = Math.min(L.scale, 0.936); }
  if (t >= DIP[0]) {
    const u = span(t, ...DIP);
    const top = clay.capY + 0.08, target = lerp(top, minY - 0.05, 0.7);
    L.glazeOn = true;
    L.line = lerp(top + 0.5, target, sm(clamp(u / 0.75)));
    L.drip = u < 0.75 ? 0 : 0.1 * ease((u - 0.75) / 0.25);
  }
  if (t >= GLOST[0] && t < GLOST[1]) { T = kiln(span(t, GLOST[0], GLOST[1]), GLOST[2]); hot = 1; }
  if (t >= GLOST[0]) {
    L.melt = Math.max(L.melt, clamp((T - 980) / 260));
    L.drip = 0.1 + 0.32 * L.melt;
    L.scale = Math.min(L.scale, lerp(0.936, 0.88, clamp((T - 400) / 840) ** 2));
  }
  if (t >= GLOST[1]) { L.melt = 1; L.drip = 0.42; L.scale = 0.88; }
  L.heat = hot ? clamp((T - 480) / 770) ** 1.1 * hot : 0;
  L.T = T;
}

// ------------------------------------------------------------ shots

const pt = (li, x, y) => [clay.letters[li].cx + x, y, 0.1];
const center = () => [0, clay.capY * 0.45, 0];
let wideDist = 6;

// each shot: camera target (local point), distance, azimuth, elevation, wheel yaw, aperture
const SHOTS = [
  { to: 2.6, label: () => '01 wedge', cam: (u) => ({ p: [0, 0.38, 0], d: wideDist * lerp(0.95, 0.86, u), az: lerp(-0.28, -0.12, u), el: 0.1, yaw: -0.2, ap: 0.006 }) },
  { to: 3.9, label: () => '02 press', cam: (u) => ({ p: pt(PRESS.li, PRESS.x, PRESS.y), d: lerp(4.2, 3.6, u), az: lerp(-0.2, -0.08, u), el: 0.16, yaw: 0, ap: 0.016 }) },
  { to: 5.2, label: () => '03 carve', cam: (u) => ({ p: pt(CARVE.li, 0, lerp(0.62, 0.22, ease(u))), d: 3.9, az: 0.32, el: 0.1, yaw: 0, ap: 0.016 }) },
  { to: 6.2, label: () => '04 add', cam: (u) => ({ p: pt(ADD.li, ADD.x, ADD.y), d: lerp(4.2, 3.7, u), az: lerp(0.35, 0.22, u), el: 0.26, yaw: 0, ap: 0.016 }) },
  { to: 7.6, label: () => `05 dry · ${look.water.toFixed(1)}% water`, cam: (u) => ({ p: center(), d: wideDist * 0.9, az: 0, el: 0.24, yaw: lerp(-0.7, 0.45, sm(u)), ap: 0.006 }) },
  { to: 10.0, label: () => `06 bisque · ${Math.round(look.T)}°c`, cam: (u) => ({ p: pt(2, 0, 0.3), d: lerp(5.0, 4.0, u), az: -0.22, el: 0.1, yaw: -0.05, ap: 0.014 }) },
  { to: 11.6, label: () => '07 dip · celadon', cam: (u) => ({ p: center(), d: wideDist * 0.88, az: lerp(0.7, 0.6, u), el: 0.12, yaw: 0, ap: 0.01 }) },
  { to: 13.8, label: () => `08 glaze fire · ${Math.round(look.T).toLocaleString('en-US')}°c`, cam: (u) => ({ p: pt(1, 0.02, lerp(0.22, 0.12, u)), d: lerp(3.9, 3.3, u), az: -0.12, el: 0.06, yaw: 0, ap: 0.016 }) },
  { to: 16.0, label: () => '09 cone 6', cam: (u) => ({ p: center(), d: wideDist * lerp(0.9, 0.8, u), az: lerp(-0.45, 0.25, sm(u)), el: 0.18, yaw: 0, ap: 0.012 }) },
  ...MONTAGE.glazes.map((g, i) => ({
    to: MONTAGE.at + (i + 1) * MONTAGE.every, glaze: g, label: () => GLAZES[g].name,
    cam: (u) => ({ p: pt([0, 2, 3, 1][i], [-0.12, 0, 0.12, 0][i], [0.35, 0.25, 0.5, 0.45][i]), d: 3.9 - 0.3 * u, az: [-0.3, 0.25, 0.4, -0.15][i], el: [0.12, 0.2, 0.08, 0.16][i], yaw: 0, ap: 0.016 }),
  })),
  { to: DURATION, label: () => '', cam: (u) => ({ p: [0, clay.capY * 0.45 - 0.28, 0], d: wideDist * 0.98, az: lerp(-0.2, 0.15, u), el: 0.2, yaw: 0, ap: 0.004 }) },
];
function shotAt(t) {
  let from = 0;
  for (const s of SHOTS) { if (t < s.to) return { s, u: span(t, from, s.to) }; from = s.to; }
  return { s: SHOTS[SHOTS.length - 1], u: 1 };
}

// ------------------------------------------------------------ frame

const PLASTER = new THREE.Color('#e2e4df'), KILN_DARK = new THREE.Color('#0d0907');
const tmp = new THREE.Vector3();

function render(t) {
  const L = look;
  const { s, u } = shotAt(t);
  setGlaze(material, s.glaze ?? 'celadon');
  U.uWet.value = L.wet; U.uFired.value = L.fired; U.uHeat.value = L.heat; U.uTime.value = t;
  U.uGlazeLine.value = L.glazeOn ? L.line : 9; U.uDrip.value = L.drip; U.uGlazeMelt.value = L.melt;
  mesh.scale.setScalar(L.scale);
  mesh.position.y = -Math.max(minY, -0.035) * L.scale;

  const c = s.cam(u);
  wheel.rotation.y = c.yaw;
  wheel.updateMatrixWorld(true);
  const target = mesh.localToWorld(tmp.set(...c.p)).clone();
  camera.position.set(
    target.x + Math.sin(c.az) * Math.cos(c.el) * c.d,
    target.y + Math.sin(c.el) * c.d,
    target.z + Math.cos(c.az) * Math.cos(c.el) * c.d,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // light: the key sweeps across the glaze on the reveal for a moving highlight
  const sweep = t >= 13.8 && t < 16 ? lerp(-0.7, 0.8, sm(span(t, 13.8, 16))) : 0;
  key.position.set(Math.cos(Math.PI * 0.62 + sweep) * 4.3, 4.2, Math.sin(Math.PI * 0.62 + sweep) * 4.3 + 0.6);
  const heat = L.heat;
  key.intensity = 2.4 * (1 - heat * 0.85);
  rim.intensity = 0.9 * (1 - heat * 0.9);
  hemi.intensity = 0.55 * (1 - heat * 0.8);
  scene.environmentIntensity = 0.5 * (1 - heat * 0.8);
  ground.material.opacity = 0.2 * (1 - heat * 0.7);
  const dark = clamp((L.T - 250) / 300);
  scene.background.copy(PLASTER).lerp(KILN_DARK, dark);

  bokeh.uniforms.focus.value = c.d;
  bokeh.uniforms.aperture.value = c.ap;
  bloom.strength = heat * 0.55;
  composer.render();

  // caption
  const lab = $('label');
  const text = s.label();
  lab.style.color = dark > 0.5 ? '#f2e7dd' : '#191c1a';
  const k = clamp((t - (SHOTS[SHOTS.indexOf(s) - 1]?.to ?? 0)) / 0.25);
  lab.style.opacity = String(easeOut(k) * (t < END ? 1 : 0));
  lab.style.transform = `translateY(${(1 - easeOut(k)) * 16}px)`;
  const [n, ...rest] = text.split(' ');
  lab.innerHTML = /^\d\d$/.test(n) ? `<span class="n">${n}</span><b>${rest.join(' ')}</b>` : `<b>${text}</b>`;

  const e = clamp((t - END - 0.3) / 0.5);
  $('end').style.opacity = String(easeOut(e));
  $('end').style.transform = `translateY(${(1 - easeOut(e)) * 30}px)`;
}

async function init() {
  await Promise.all([
    document.fonts.load("100px 'Bagel Fat One'", WORD),
    document.fonts.load("400 30px 'Martian Mono'"),
    document.fonts.load("500 30px 'Martian Mono'"),
    document.fonts.load("600 50px 'Schibsted Grotesk'"),
  ]);
  clay.setWord(WORD, "'Bagel Fat One', sans-serif", 341);
  clay.letters.forEach((L) => { L.grow = 0; L.vel = 0; L.target = 0; });
  clay.build();
  remesh();
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  wideDist = ((clay.width + 0.15) * 1.04) / 0.9 / (W / H) / (2 * tan);
}

let frameNo = -1;
function frame(i) {
  if (i !== frameNo + 1) throw new Error(`frames must be sequential: got ${i} after ${frameNo}`);
  frameNo = i;
  const dt = 1 / FPS, t = i / FPS;
  stepClay(t, dt);
  stepLook(t);
  render(t);
}

window.reel = { ready: init(), frame, fps: FPS, frames: Math.round(DURATION * FPS) };
