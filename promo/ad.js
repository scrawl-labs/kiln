// UI-animation ad: the site in a phone, kinetic type, and full-bleed clay.
// Deterministic: window.reel.frame(i) must be called for i = 0, 1, 2, …
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { Clay } from '../js/clay.js';
import { GLAZES, createClayMaterial, setBody, setGlaze } from '../js/material.js';

const FPS = 30, W = 1080, H = 1920, WORD = 'clay';
const DURATION = 21;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp((t - a) / (b - a));
// underdamped spring settling to 1, t in seconds since start
const spring = (t) => (t <= 0 ? 0 : 1 - Math.exp(-8 * t) * Math.cos(13 * t));

// ------------------------------------------------------------ timeline (120 bpm: a beat every 0.5 s)

const T = {
  card1: [0, 2], phone1: [2, 5], card2: [5, 6], macro: [6, 9], dry: [9, 10],
  fire: [10, 12], phone2: [12, 14.5], fire2: [14.5, 16.5], hero: [16.5, 18.5], end: [18.5, DURATION],
};
const TYPE_AT = [3.0, 3.25, 3.5, 3.75];
const TOOLS = [
  { at: 6.45, kind: 'press', name: 'Press', letter: 0, x: -0.17, y: 0.36 },
  { at: 6.95, kind: 'press', name: 'Press', letter: 2, x: -0.06, y: 0.24 },
  { at: 7.45, kind: 'add', name: 'Add', letter: 3, x: 0.17, y: 0.58 },
  { at: 7.95, kind: 'carve', name: 'Carve', letter: 1, x: 0.0, y: 0.66, to: 0.08, dur: 0.6 },
];
const TOUCHES = [
  { at: 2.8, el: 'pInput' },
  { at: 12.85, el: 'glaze-celadon' },
  { at: 13.35, el: 'pDip' },
];
const DIP = [13.4, 14.25];
const FIRE1 = [10.0, 12.0, 950];
const FIRE2 = [14.5, 16.6, 1240];
const SWAPS = [[16.5, 'celadon'], [17.0, 'cobalt'], [17.5, 'tenmoku'], [18.0, 'shino'], [18.5, 'celadon']];
const ROT = [[2, -0.7], [3.8, -0.22], [5, -0.15], [6, -0.45], [9, 0.25], [10, -0.2], [12, -0.05], [14.5, -0.25],
  [16.5, -0.35], [18.5, 0.45], [21, -0.25]];

function rotAt(t) {
  for (let i = 0; i < ROT.length - 1; i++) {
    const [t0, r0] = ROT[i], [t1, r1] = ROT[i + 1];
    if (t <= t1) return lerp(r0, r1, ease(span(t, t0, t1)));
  }
  return ROT[ROT.length - 1][1];
}
const inScene = (t, k) => t >= T[k][0] && t < T[k][1];

function kiln(u, peak) {
  if (u <= 0) return 20;
  if (u < 0.55) return 20 + (peak - 20) * ease(u / 0.55);
  if (u < 0.66) return peak;
  return 20 + (peak - 20) * Math.exp(-((u - 0.66) / 0.34) * 3.4);
}

// ------------------------------------------------------------ 3D

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
const key = new THREE.DirectionalLight(0xfff3e6, 2.4);
key.position.set(-2.6, 4.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 0.5, far: 14 });
scene.add(key);
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

const clay = new Clay({ budget: 380000 });
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

// ------------------------------------------------------------ simulation

const look = { water: 22, wet: 1, scale: 1, fired: 0, heat: 0, glazeOn: false, line: 9, drip: 0, melt: 0, T: 20 };
let carveLast = null;
let tool = null, toolP = null;

function surfacePoint(letter, x, y) {
  const L = clay.letters[letter];
  return L ? clay.raycast([L.cx + x, y, 2], [0, 0, -1]) : null;
}

function stepTools(t, dt) {
  tool = null; toolP = null;
  for (const e of TOOLS) {
    if (e.kind === 'carve') {
      if (t >= e.at - 0.25 && t <= e.at + e.dur + 0.15) {
        const p = surfacePoint(e.letter, e.x, lerp(e.y, e.to, ease(span(t, e.at, e.at + e.dur))));
        tool = e; toolP = p;
        if (p && t >= e.at && t - dt < e.at + e.dur) {
          if (carveLast) clay.carve(carveLast, p, [0, 0, -1], 0.09);
          carveLast = p;
          return true;
        }
      }
      continue;
    }
    if (t >= e.at - 0.3 && t <= e.at + 0.22) {
      tool = e;
      if (!e.p) e.p = surfacePoint(e.letter, e.x, e.y);
      toolP = e.p;
    }
    if (t >= e.at && t - dt < e.at && e.p) {
      if (e.kind === 'press') clay.press(e.p, [0, 0, -1], 0.1);
      else clay.add(e.p, [0, 0, -1], 0.095);
      return true;
    }
  }
  return false;
}

function stepLook(t) {
  const L = look;
  if (t >= T.dry[0]) {
    const d = ease(span(t, T.dry[0] + 0.05, T.dry[1] - 0.1));
    L.water = 22 * (1 - d); L.wet = L.water / 22; L.scale = Math.min(L.scale, 1 - 0.05 * d);
  }
  let temp = 20, peak = 0;
  if (t >= FIRE1[0] && t < FIRE1[1]) { temp = kiln(span(t, FIRE1[0], FIRE1[1]), FIRE1[2]); peak = FIRE1[2]; }
  if (t >= FIRE1[0]) {
    L.fired = Math.max(L.fired, clamp((temp - 550) / 400));
    L.scale = Math.min(L.scale, lerp(0.95, 0.936, clamp((temp - 400) / 550)));
  }
  if (t >= FIRE1[1]) { L.fired = 1; L.scale = Math.min(L.scale, 0.936); }
  if (t >= DIP[0]) {
    const u = span(t, DIP[0], DIP[1]);
    const top = clay.capY + 0.08, target = lerp(top, minY - 0.05, 0.7);
    L.glazeOn = true;
    L.line = lerp(top + 0.6, target, ease(clamp(u / 0.65)));
    L.drip = u < 0.65 ? 0 : 0.1 * ease((u - 0.65) / 0.35);
  }
  if (t >= FIRE2[0] && t < FIRE2[1]) { temp = kiln(span(t, FIRE2[0], FIRE2[1]), FIRE2[2]); peak = FIRE2[2]; }
  if (t >= FIRE2[0]) {
    L.melt = Math.max(L.melt, clamp((temp - 980) / 260));
    L.drip = 0.1 + 0.32 * L.melt;
    L.scale = Math.min(L.scale, lerp(0.936, 0.88, clamp((temp - 400) / 840) ** 2));
  }
  if (t >= T.hero[0]) { L.melt = 1; L.drip = 0.42; L.scale = 0.88; }
  L.heat = peak ? clamp((temp - 480) / 770) ** 1.1 * (peak < 1000 ? 0.9 : 1) : 0;
  L.T = temp;
}

// ------------------------------------------------------------ layout helpers

const $ = (id) => document.getElementById(id);
const PHONE_W = 390, PHONE_H = 844, PHONE_CANVAS = { x: 0, y: 150, w: 390, h: 370 };

function phoneTransform(t) {
  // returns {x, y, s} placing phone px → stage px, or null when the phone is off
  let s = 1.86, ax = 195, ay = 422, px = 540, py = 990, k = 1;
  if (inScene(t, 'phone1')) {
    k = spring(t - T.phone1[0]);
    py += (1 - k) * 1500;
    const z = ease(span(t, 4.3, 5.0));
    // zoom into the clay: anchor on the canvas centre and blow the phone up
    ax = 195; ay = lerp(422, PHONE_CANVAS.y + PHONE_CANVAS.h / 2, z);
    py = lerp(py, 940, z);
    s = s * lerp(1, 4.6, easeIn(z));
  } else if (inScene(t, 'phone2')) {
    k = spring(t - T.phone2[0]);
    py += (1 - k) * 1500;
    s *= lerp(0.92, 1, k);
    const z = ease(span(t, 14.1, 14.5));
    s *= lerp(1, 1.12, z);
  } else return null;
  return { x: px - ax * s, y: py - ay * s, s };
}

// canvas virtual rect (may extend past the stage) in stage px
function canvasRect(t, ph) {
  if (ph) return { x: ph.x + PHONE_CANVAS.x * ph.s, y: ph.y + PHONE_CANVAS.y * ph.s, w: PHONE_CANVAS.w * ph.s, h: PHONE_CANVAS.h * ph.s };
  if (inScene(t, 'card1') || inScene(t, 'card2')) return null;
  if (t >= T.end[0]) return { x: 0, y: -lerp(0, 330, ease(span(t, T.end[0], T.end[0] + 0.4))), w: W, h: H };
  return { x: 0, y: 0, w: W, h: H };
}

// how much of the rect's width the word should fill, and where the camera looks
function framing(t, ph, rect) {
  let frac = ph ? 0.84 : 0.9, tx = 0, push = 1;
  if (ph && inScene(t, 'phone1')) frac = 0.84;
  if (inScene(t, 'macro')) {
    const u = span(t, T.macro[0], T.macro[1]);
    frac = 1.9;
    const a = clay.letters[0]?.cx ?? 0, b = clay.letters[3]?.cx ?? 0;
    tx = lerp(a + 0.15, b - 0.1, ease(u));
  }
  if (inScene(t, 'dry')) push = lerp(1.08, 1, easeOut(span(t, ...T.dry)));
  if (inScene(t, 'fire') || inScene(t, 'fire2')) push = lerp(1.1, 0.96, span(t, t < 13 ? T.fire[0] : T.fire2[0], t < 13 ? T.fire[1] : T.fire2[1]));
  if (inScene(t, 'hero')) push = lerp(1.0, 0.9, ease(span(t, ...T.hero)));
  if (t >= T.end[0]) frac = lerp(0.9, 0.72, ease(span(t, T.end[0], T.end[0] + 0.4)));
  return { frac, tx, push, aspect: rect.w / rect.h };
}

function placeCanvas(rect) {
  if (!rect) { canvas.style.display = 'none'; return null; }
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(W, Math.ceil(rect.x + rect.w)), y1 = Math.min(H, Math.ceil(rect.y + rect.h));
  if (x1 - x0 < 2 || y1 - y0 < 2) { canvas.style.display = 'none'; return null; }
  canvas.style.display = 'block';
  canvas.style.left = `${x0}px`; canvas.style.top = `${y0}px`;
  renderer.setSize(x1 - x0, y1 - y0);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// ------------------------------------------------------------ text

const words = (txt, lt, opts = {}) => txt.split(' ').map((w, i) => {
  const k = spring(lt - (opts.delay ?? 0) - i * (opts.stagger ?? 0.25));
  const o = clamp((lt - (opts.delay ?? 0) - i * (opts.stagger ?? 0.25)) / 0.08);
  return `<span class="w" style="opacity:${o};transform:translateY(${(1 - k) * 140}px) scale(${0.92 + 0.08 * k})">${w}</span>`;
}).join(' ');

function textLayer(t) {
  const L = look;
  if (inScene(t, 'card1')) return `<div class="card" style="color:#f4f4f1"><div class="words">${words('Type a word.', t - 0.15)}</div></div>`;
  if (inScene(t, 'card2')) return `<div class="card" style="color:#f4f4f1"><div class="words">${words('Shape it.', t - T.card2[0] - 0.05)}</div></div>`;
  if (inScene(t, 'macro')) {
    const cur = TOOLS.filter((e) => t >= e.at - 0.3).pop();
    if (!cur) return '';
    const k = spring(t - cur.at + 0.3);
    return `<div class="pill" style="transform:translateX(-50%) scale(${0.8 + 0.2 * k});opacity:${clamp(k * 2)}">${cur.name}</div>`;
  }
  if (inScene(t, 'dry')) {
    const lt = t - T.dry[0];
    return `<div class="big-top">${words('Dry.', lt, { stagger: 0 })}</div><div class="counter">${Math.round(L.water)}<small>% water</small></div>`;
  }
  if (inScene(t, 'fire') || inScene(t, 'fire2')) {
    const lt = t - (inScene(t, 'fire') ? T.fire[0] : T.fire2[0]);
    const head = inScene(t, 'fire') ? 'Fire.' : 'Fire again.';
    const dark = clamp((L.T - 200) / 260);
    const col = dark > 0.5 ? '#f4ece4' : '#191c1a';
    return `<div class="big-top" style="color:${col}">${words(head, lt)}</div><div class="counter" style="color:${col}">${Math.round(L.T).toLocaleString('en-US')}<small>°C</small></div>`;
  }
  if (inScene(t, 'hero')) {
    const sw = SWAPS.filter(([a]) => t >= a).pop();
    const k = spring(t - sw[0]);
    return `<div class="pill" style="transform:translateX(-50%) scale(${0.85 + 0.15 * k})">${GLAZES[sw[1]].name}</div>`;
  }
  if (t >= T.end[0]) {
    const lt = t - T.end[0];
    const k = (d) => spring(lt - d), o = (d) => clamp((lt - d) / 0.1);
    return `<div class="end">
      <div class="mark" style="opacity:${o(0.35)};transform:translateY(${(1 - k(0.35)) * 80}px)">KILN</div>
      <div class="tag" style="opacity:${o(0.55)};transform:translateY(${(1 - k(0.55)) * 60}px)">Type a word. Fire it.</div>
      <div class="cta" style="opacity:${o(0.8)}">Clay typo studio · link in bio</div></div>`;
  }
  return '';
}

// ------------------------------------------------------------ phone UI

function phoneUI(t) {
  const glaze = inScene(t, 'phone2');
  $('sheetWedge').style.display = glaze ? 'none' : 'flex';
  $('sheetGlaze').style.display = glaze ? 'flex' : 'none';
  $('pType').style.display = glaze ? 'none' : 'block';
  const n = TYPE_AT.filter((a) => t >= a).length;
  const caretOn = t < 2.8 ? Math.floor(t * 2) % 2 === 0 : n < 4 || Math.floor(t * 2.4) % 2 === 0;
  $('pInput').innerHTML = `${WORD.slice(0, n)}<i class="p-caret" style="opacity:${caretOn ? 1 : 0}"></i>`;
  const cur = glaze ? 4 : 0;
  $('pSteps').innerHTML = [1, 2, 3, 4, 5, 6].map((i) => `<span class="${i - 1 < cur ? 'past' : i - 1 === cur ? 'cur' : ''}">0${i}</span>`).join('');
  $('pNext').textContent = glaze ? (t >= DIP[1] ? 'Load the kiln →' : 'Load the kiln →') : 'Start shaping →';
  $('pNext').style.opacity = glaze && t < DIP[1] ? 0.35 : 1;
  document.querySelectorAll('.p-glaze').forEach((el) => el.classList.toggle('on', el.id === 'glaze-celadon' && t >= 12.85));
  $('pDip').classList.toggle('press', t >= 13.35 && t < 13.55);
  $('pDip').textContent = t >= DIP[1] ? 'Wash off and dip again' : 'Dip';
}

function touch(t, ph) {
  const el = $('touch');
  let pos = null, k = 0, tap = -1;
  if (ph) {
    const list = TOUCHES.filter((x) => (inScene(t, 'phone1') ? x.at < 5 : x.at > 12));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i], prev = list[i - 1];
      if (t < cur.at - 0.45 || t > cur.at + 0.35) continue;
      const r = $(cur.el).getBoundingClientRect();
      const target = [r.left + r.width / 2, r.top + r.height / 2];
      let from = [target[0] + 160, target[1] + 260];
      if (prev && cur.at - prev.at < 0.8) { const q = $(prev.el).getBoundingClientRect(); from = [q.left + q.width / 2, q.top + q.height / 2]; }
      const m = ease(span(t, cur.at - 0.45, cur.at - 0.05));
      pos = [lerp(from[0], target[0], m), lerp(from[1], target[1], m)];
      k = Math.min(clamp((t - cur.at + 0.45) / 0.12), clamp((cur.at + 0.35 - t) / 0.12));
      tap = t - cur.at;
    }
  } else if (inScene(t, 'macro') && tool && toolP) {
    mesh.updateMatrixWorld();
    const p = new THREE.Vector3(...toolP).applyMatrix4(mesh.matrixWorld).project(camera);
    const vr = lastView;
    pos = [vr.x0 + (p.x * 0.5 + 0.5) * vr.w, vr.y0 + (-p.y * 0.5 + 0.5) * vr.h];
    tap = tool.kind === 'carve' ? (t >= tool.at ? 0.05 : -1) : t - tool.at;
    k = tool.kind === 'carve' ? 1 : Math.min(clamp((t - tool.at + 0.3) / 0.1), clamp((tool.at + 0.22 - t) / 0.1));
  }
  if (!pos) { el.style.opacity = '0'; return; }
  const press = tap >= 0 && tap < 0.18 ? 0.82 : 1;
  el.style.opacity = String(k);
  el.style.left = `${pos[0]}px`; el.style.top = `${pos[1]}px`;
  el.querySelector('.dot').style.transform = `scale(${press * (inScene(t, 'macro') ? 1.5 : 1)})`;
  const rp = el.querySelector('.ripple');
  if (tap >= 0 && tap < 0.45) {
    const u = tap / 0.45;
    rp.style.opacity = String(1 - u);
    rp.style.transform = `scale(${(1 + u * 1.4) * (inScene(t, 'macro') ? 1.5 : 1)})`;
  } else rp.style.opacity = '0';
}

// ------------------------------------------------------------ frame

let lastView = { x0: 0, y0: 0, w: W, h: H };
const NIGHT = [0x0b, 0x0b, 0x0a], PLASTER = [0xe2, 0xe4, 0xdf], KILN_DARK = [0x0d, 0x09, 0x07];
const mixRGB = (a, b, k) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;

function render(t) {
  const L = look;
  U.uWet.value = L.wet; U.uFired.value = L.fired; U.uHeat.value = L.heat; U.uTime.value = t;
  U.uGlazeLine.value = L.glazeOn ? L.line : 9; U.uDrip.value = L.drip; U.uGlazeMelt.value = L.melt;
  mesh.scale.setScalar(L.scale);
  mesh.position.y = -Math.max(minY, -0.035) * L.scale;
  wheel.rotation.y = rotAt(t);
  const heat = L.heat;
  key.intensity = 2.4 * (1 - heat * 0.85);
  rim.intensity = 0.9 * (1 - heat * 0.9);
  hemi.intensity = 0.55 * (1 - heat * 0.8);
  scene.environmentIntensity = 0.5 * (1 - heat * 0.8);
  ground.material.opacity = 0.2 * (1 - heat * 0.7);

  // background
  const card = inScene(t, 'card1') || inScene(t, 'card2');
  const dark = clamp((L.T - 200) / 260);
  $('bg').style.background = card ? mixRGB(NIGHT, NIGHT, 0) : mixRGB(PLASTER, KILN_DARK, dark);
  $('glow').style.opacity = String(clamp(heat * 1.15));

  // phone
  const ph = phoneTransform(t);
  for (const id of ['phoneBack', 'phoneFront']) {
    const el = $(id);
    el.style.display = ph ? 'block' : 'none';
    if (ph) el.style.transform = `translate(${ph.x}px, ${ph.y}px) scale(${ph.s})`;
  }
  if (ph) phoneUI(t);

  // 3D
  const rect = canvasRect(t, ph);
  const view = placeCanvas(rect);
  if (view) {
    lastView = view;
    const f = framing(t, ph, rect);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const cw = (clay.width + 0.15) * 1.04;
    const dist = ((cw / f.frac) / f.aspect / (2 * tan)) * f.push;
    const ty = clay.capY * 0.45 * L.scale;
    const el = inScene(t, 'macro') ? 0.12 : 0.2;
    camera.aspect = f.aspect;
    camera.setViewOffset(rect.w, rect.h, view.x0 - rect.x, view.y0 - rect.y, view.w, view.h);
    camera.position.set(f.tx, ty + Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(f.tx, ty, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  $('text').innerHTML = textLayer(t);
  touch(t, ph);
}

async function init() {
  await Promise.all([
    document.fonts.load("100px 'Bagel Fat One'", WORD),
    document.fonts.load("800 100px 'Schibsted Grotesk'"),
    document.fonts.load("600 100px 'Schibsted Grotesk'"),
    document.fonts.load("500 100px 'Schibsted Grotesk'"),
    document.fonts.load("300 100px 'Martian Mono'"),
    document.fonts.load("400 100px 'Martian Mono'"),
  ]);
  $('pGlazes').innerHTML = Object.entries(GLAZES).map(([k, g]) =>
    `<div class="p-glaze" id="glaze-${k}"><div class="p-tile" style="background:linear-gradient(180deg, ${g.base} 0 62%, ${g.pool} 62% 70%, ${g.raw} 70%)"></div>${g.name}</div>`).join('');
  clay.setWord(WORD, "'Bagel Fat One', sans-serif", 341);
  clay.letters.forEach((L) => { L.grow = 0; L.vel = 0; L.target = 0; });
  clay.build();
  remesh();
}

let frameNo = -1;
function frame(i) {
  if (i !== frameNo + 1) throw new Error(`frames must be sequential: got ${i} after ${frameNo}`);
  frameNo = i;
  const dt = 1 / FPS, t = i / FPS;
  let changed = false;
  clay.letters.forEach((L, k) => { if (t >= TYPE_AT[k]) L.target = 1; });
  if (t < 5) {
    if (t >= TYPE_AT[0] - dt) {
      for (const L of clay.letters) {
        const h = dt / 4;
        for (let s = 0; s < 4; s++) { L.vel += ((L.target - L.grow) * 120 - L.vel * 13) * h; L.grow += L.vel * h; }
      }
      clay.build();
      changed = true;
    }
  } else if (Math.abs(t - 5) < dt / 2) {
    clay.letters.forEach((L) => { L.grow = 1; L.vel = 0; });
    clay.build();
    changed = true;
  }
  if (stepTools(t, dt)) changed = true;
  if (changed) remesh();
  if (t >= T.hero[0]) setGlaze(material, SWAPS.filter(([a]) => t >= a).pop()[1]);
  stepLook(t);
  render(t);
}

window.reel = { ready: init(), frame, fps: FPS, frames: Math.round(DURATION * FPS) };
