// Scripted 9:16 promo. Every frame is a pure step of the timeline so the
// render script can capture it deterministically: window.reel.frame(i).
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { Clay } from '../js/clay.js';
import { GLAZES, createClayMaterial, setBody, setGlaze } from '../js/material.js';

const FPS = 30;
const W = 1080, H = 1920;
const WORD = 'clay';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp((t - a) / (b - a));

// ------------------------------------------------------------ timeline

const SCENES = [
  { at: 0.0, step: '01', name: 'Wedge', head: 'Type a word.' },
  { at: 3.2, step: '02', name: 'Shape', head: 'Shape it\nby hand.' },
  { at: 6.6, step: '03', name: 'Dry', head: 'Let it dry.' },
  { at: 8.8, step: '04', name: 'Bisque', head: 'Fire it.' },
  { at: 11.8, step: '05', name: 'Glaze', head: 'Dip it\nin glaze.' },
  { at: 14.0, step: '06', name: 'Glaze fire', head: 'Fire it\nagain.' },
  { at: 17.8, step: '06', name: 'Done', head: 'Out of\nthe kiln.' },
  { at: 20.2, step: '—', name: 'Glazes', head: 'Pick your\nglaze.' },
  { at: 22.6, step: '', name: '', head: '' },
];
export const DURATION = 25.0;

const TYPE_AT = [0.45, 0.8, 1.15, 1.5];
const TOOLS = [
  { at: 3.55, kind: 'press', name: 'Press', letter: 0, x: -0.17, y: 0.36 },
  { at: 3.95, kind: 'press', name: 'Press', letter: 2, x: -0.06, y: 0.24 },
  { at: 4.35, kind: 'press', name: 'Press', letter: 1, x: 0.0, y: 0.78 },
  { at: 4.85, kind: 'add', name: 'Add', letter: 3, x: 0.17, y: 0.58 },
  { at: 5.35, kind: 'carve', name: 'Carve', letter: 1, x: 0.0, y: 0.62, to: 0.1, dur: 0.7 },
];
const DRY = [6.8, 8.5];
const BISQUE = [9.0, 11.6, 950];
const DIP = [12.1, 13.5];
const GLOST = [14.3, 17.6, 1240];
const MONTAGE = { at: 20.2, every: 0.48, glazes: ['tenmoku', 'cobalt', 'shino', 'jun', 'celadon'] };
const ROT = [[0, -0.6], [3.0, -0.26], [4.6, 0.22], [6.4, -0.12], [9, -0.3], [12, -0.18], [14, -0.3], [17.8, -0.28], [20.2, 0.48], [22.6, -0.18], [25, -0.42]];

function rotAt(t) {
  for (let i = 0; i < ROT.length - 1; i++) {
    const [t0, r0] = ROT[i], [t1, r1] = ROT[i + 1];
    if (t <= t1) return lerp(r0, r1, ease(span(t, t0, t1)));
  }
  return ROT[ROT.length - 1][1];
}

function kiln(u, peak) {
  if (u <= 0) return 20;
  if (u < 0.55) return 20 + (peak - 20) * ease(u / 0.55);
  if (u < 0.66) return peak;
  return 20 + (peak - 20) * Math.exp(-((u - 0.66) / 0.34) * 3.4);
}

// ------------------------------------------------------------ scene

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);

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

// ------------------------------------------------------------ dom

const $ = (id) => document.getElementById(id);
const PLASTER = [0xe2, 0xe4, 0xdf], KILN_DARK = [0x0d, 0x09, 0x07];
const INK = [0x19, 0x1c, 0x1a], INK_HOT = [0xf2, 0xe7, 0xdd];
const INK2 = [0x5a, 0x60, 0x5b], INK2_HOT = [0xa8, 0x90, 0x7f];
const mixRGB = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;

let lastHead = null;
function setHead(sc, lt) {
  if (sc.head !== lastHead) {
    $('head').innerHTML = sc.head.split('\n').map((l) => `<span>${l}</span>`).join('');
    lastHead = sc.head;
  }
  [...$('head').children].forEach((el, i) => {
    const k = easeOut(clamp((lt - i * 0.06) / 0.32));
    el.style.opacity = String(k);
    el.style.transform = `translateY(${(1 - k) * 46}px)`;
  });
  $('step').textContent = sc.step ? `${sc.step} / 06` : '';
  $('stepname').textContent = sc.name;
}

// ------------------------------------------------------------ simulation state

const sim = {
  t: 0, look: { water: 22, wet: 1, scale: 1, fired: 0, heat: 0, glazeOn: false, line: 9, drip: 0, melt: 0 },
  T: 20, carveLast: null, tool: null, toolP: null,
};

function surfacePoint(letter, x, y) {
  const L = clay.letters[letter];
  if (!L) return null;
  return clay.raycast([L.cx + x, y, 2], [0, 0, -1]);
}

function stepTools(t, dt) {
  sim.tool = null; sim.toolP = null;
  for (const e of TOOLS) {
    if (e.kind === 'carve') {
      const u = span(t, e.at, e.at + e.dur);
      if (t >= e.at - 0.2 && t <= e.at + e.dur + 0.15) {
        const y = lerp(e.y, e.to, ease(u));
        const p = surfacePoint(e.letter, e.x, y);
        sim.tool = e; sim.toolP = p;
        if (p && t >= e.at && t - dt < e.at + e.dur) {
          if (sim.carveLast) clay.carve(sim.carveLast, p, [0, 0, -1], 0.09);
          sim.carveLast = p;
          return true;
        }
      }
      continue;
    }
    if (t >= e.at - 0.22 && t <= e.at + 0.2) {
      sim.tool = e;
      if (!e.p) e.p = surfacePoint(e.letter, e.x, e.y);
      sim.toolP = e.p;
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
  const L = sim.look;
  // dry
  const d = ease(span(t, DRY[0], DRY[1]));
  if (t >= DRY[0]) { L.water = 22 * (1 - d); L.wet = L.water / 22; L.scale = 1 - 0.05 * d; }
  // bisque
  let T = 20, peak = 0, phase = null;
  if (t >= BISQUE[0] && t <= BISQUE[1]) { T = kiln(span(t, BISQUE[0], BISQUE[1]), BISQUE[2]); peak = BISQUE[2]; phase = 'bisque'; }
  if (t > BISQUE[0]) L.fired = Math.max(L.fired, clamp((T - 550) / (BISQUE[2] - 550)));
  if (t > BISQUE[1]) { L.fired = 1; L.scale = Math.min(L.scale, 0.95 * 0.985); }
  else if (phase) L.scale = Math.min(L.scale, lerp(0.95, 0.95 * 0.985, clamp((T - 400) / 550)));
  // dip
  const top = clay.capY + 0.08, target = lerp(top, minY - 0.05, 0.7);
  if (t >= DIP[0]) {
    const u = span(t, DIP[0], DIP[1]);
    L.glazeOn = true;
    L.line = lerp(top + 0.6, target, ease(clamp(u / 0.6)));
    L.drip = u < 0.6 ? 0 : 0.1 * ease((u - 0.6) / 0.4);
  }
  // glaze firing
  if (t >= GLOST[0] && t <= GLOST[1]) { T = kiln(span(t, GLOST[0], GLOST[1]), GLOST[2]); peak = GLOST[2]; phase = 'glost'; }
  if (t > GLOST[0]) {
    L.melt = Math.max(L.melt, clamp((T - 980) / (GLOST[2] - 980)));
    L.drip = 0.1 + 0.32 * L.melt;
    L.scale = Math.min(L.scale, lerp(0.95 * 0.985, 0.88, clamp((T - 400) / 840) ** 2));
  }
  if (t > GLOST[1]) { L.melt = 1; L.scale = 0.88; L.drip = 0.42; }
  L.heat = phase ? clamp((T - 480) / 770) ** 1.1 * (phase === 'bisque' ? 0.85 : 1) : 0;
  sim.T = T; sim.peak = peak; sim.phase = phase;
}

// ------------------------------------------------------------ frame

let fitDist = 6;
function fit() {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const cw = (clay.width + 0.15) * 1.04;
  const rectW = 1040;
  fitDist = (cw * H) / rectW / (2 * tan);
}

function render(t) {
  const L = sim.look;
  U.uWet.value = L.wet; U.uFired.value = L.fired; U.uHeat.value = L.heat;
  U.uGlazeLine.value = L.glazeOn ? L.line : 9; U.uDrip.value = L.drip; U.uGlazeMelt.value = L.melt;
  U.uTime.value = t;
  mesh.scale.setScalar(L.scale);
  mesh.position.y = -Math.max(minY, -0.035) * L.scale;
  wheel.rotation.y = rotAt(t);

  const heat = L.heat;
  key.intensity = 2.4 * (1 - heat * 0.85);
  rim.intensity = 0.9 * (1 - heat * 0.9);
  hemi.intensity = 0.55 * (1 - heat * 0.8);
  scene.environmentIntensity = 0.5 * (1 - heat * 0.8);
  ground.material.opacity = 0.2 * (1 - heat * 0.7);

  // camera: slow push-in over the whole piece, a little closer on the hero turn
  const push = 1 - 0.06 * span(t, 0, 17.8) - 0.06 * ease(span(t, 17.8, 20.2)) + 0.05 * ease(span(t, 22.6, 23.6));
  const d = fitDist * push;
  const ty = clay.capY * 0.45 * L.scale;
  const el = 0.2;
  camera.position.set(0, ty + Math.sin(el) * d, Math.cos(el) * d);
  camera.lookAt(0, ty, 0);
  camera.setViewOffset(W, H, 0, -40, W, H);
  renderer.render(scene, camera);

  // kiln darkness
  const dark = clamp((sim.T - 300) / 260);
  document.body.style.background = mixRGB(PLASTER, KILN_DARK, dark);
  document.body.style.color = mixRGB(INK, INK_HOT, dark);
  document.body.style.setProperty('--ink-2', mixRGB(INK2, INK2_HOT, dark));
  document.body.style.setProperty('--ink', mixRGB(INK, INK_HOT, dark));
  $('glow').style.opacity = String(clamp(heat * 1.15));

  // overlays
  let si = 0;
  SCENES.forEach((s, i) => { if (t >= s.at) si = i; });
  const sc = SCENES[si];
  const lt = t - sc.at;
  setHead(sc, lt);
  const end = clamp((t - SCENES[8].at) / 0.4);
  $('end').style.opacity = String(easeOut(end));
  $('top').style.opacity = $('readout').style.opacity = String(1 - end);
  $('readout').innerHTML = readout(si, t, lt);
  const r = $('readout').firstElementChild;
  if (r) { const k = easeOut(clamp(lt / 0.35)); $('readout').style.transform = `translateY(${(1 - k) * 30}px)`; }

  // tool cursor
  const ring = $('ring');
  if (sim.tool && sim.toolP) {
    mesh.updateMatrixWorld();
    const p = new THREE.Vector3(...sim.toolP).applyMatrix4(mesh.matrixWorld).project(camera);
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const rad = sim.tool.kind === 'carve' ? 26 : 62;
    const e = sim.tool;
    const near = e.kind === 'carve' ? 1 : 1 - clamp(Math.abs(t - e.at) / 0.22);
    const press = e.kind === 'carve' ? 1 : 1 - 0.18 * Math.max(0, 1 - Math.abs(t - e.at) / 0.08);
    Object.assign(ring.style, {
      left: `${x - rad * press}px`, top: `${y - rad * press}px`,
      width: `${rad * 2 * press}px`, height: `${rad * 2 * press}px`, opacity: String(0.95 * Math.min(1, near * 2)),
    });
  } else ring.style.opacity = '0';
}

function readout(si, t, lt) {
  const L = sim.look;
  switch (si) {
    case 0: {
      const n = TYPE_AT.filter((a) => t >= a).length;
      const caret = Math.floor(t * 2.2) % 2 === 0 || n < WORD.length ? '<i class="caret"></i>' : '<i class="caret" style="opacity:0"></i>';
      return `<div class="typed">${WORD.slice(0, n)}${caret}</div>`;
    }
    case 1: {
      const cur = TOOLS.filter((e) => t >= e.at - 0.22).pop();
      return `<div class="big">${cur ? cur.name.toLowerCase() : 'press'}<small>tool</small></div><div class="sub">Press · Add · Carve · Smooth</div>`;
    }
    case 2:
      return `<div class="big">${L.water.toFixed(1)}<small>% water</small></div><div class="bar"><i style="width:${(L.water / 22) * 100}%"></i></div><div class="sub">${L.water > 12 ? 'Plastic' : L.water > 0.05 ? 'Leather-hard' : 'Bone dry'} · shrinks 5%</div>`;
    case 3: case 5:
      return `<div class="big">${Math.round(sim.T).toLocaleString('en-US')}<small>°C</small></div><div class="sub">${si === 3 ? 'Bisque · cone 08 · 950°C' : 'Glaze fire · cone 6 · 1,240°C'}</div>`;
    case 4:
      return `<div class="big">Celadon<small>70% dip</small></div><div class="sub">Raw glaze is chalky. The colour comes out in the kiln.</div>`;
    case 6:
      return `<div class="sub">Celadon on speckled stoneware<br>Cone 6 · 12% shrinkage · ${TOOLS.length} marks</div>`;
    case 7: {
      const g = MONTAGE.glazes[Math.min(MONTAGE.glazes.length - 1, Math.floor(lt / MONTAGE.every))];
      return `<div class="big">${GLAZES[g].name}</div><div class="sub">Celadon · Tenmoku · Shino · Cobalt · Jun</div>`;
    }
    default: return '';
  }
}

async function init() {
  await Promise.all([
    document.fonts.load("100px 'Bagel Fat One'", WORD),
    document.fonts.load("600 100px 'Schibsted Grotesk'"),
    document.fonts.load("300 100px 'Martian Mono'"),
    document.fonts.load("400 100px 'Martian Mono'"),
  ]);
  clay.setWord(WORD, "'Bagel Fat One', sans-serif", 341);
  clay.letters.forEach((L) => { L.grow = 0; L.vel = 0; L.target = 0; });
  clay.build();
  remesh();
  fit();
}

let frameNo = -1;
function frame(i) {
  if (i !== frameNo + 1) throw new Error(`frames must be sequential: got ${i} after ${frameNo}`);
  frameNo = i;
  const dt = 1 / FPS, t = i / FPS;
  let changed = false;
  // letters land as they are typed
  clay.letters.forEach((L, k) => { if (t >= TYPE_AT[k]) L.target = 1; });
  if (t < 3.2) {
    for (const L of clay.letters) {
      const h = dt / 4;
      for (let s = 0; s < 4; s++) { L.vel += ((L.target - L.grow) * 120 - L.vel * 13) * h; L.grow += L.vel * h; }
    }
    clay.build();
    changed = true;
  } else if (Math.abs(t - 3.2) < dt / 2) {
    clay.letters.forEach((L) => { L.grow = 1; L.vel = 0; });
    clay.build();
    changed = true;
  }
  if (stepTools(t, dt)) changed = true;
  if (changed) remesh();
  if (t >= MONTAGE.at && t < SCENES[8].at) {
    const g = MONTAGE.glazes[Math.min(MONTAGE.glazes.length - 1, Math.floor((t - MONTAGE.at) / MONTAGE.every))];
    setGlaze(material, g);
  } else if (t >= SCENES[8].at) setGlaze(material, 'celadon');
  stepLook(t);
  render(t);
}

window.reel = { ready: init(), frame, fps: FPS, frames: Math.round(DURATION * FPS) };
