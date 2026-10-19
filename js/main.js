import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { Clay } from './clay.js';
import { BODIES, GLAZES, createClayMaterial, setBody, setGlaze } from './material.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth <= 760;

// ---------------------------------------------------------------- data

const MOULDS = {
  bagel: { name: 'Puff', family: "'Bagel Fat One'" },
  block: { name: 'Block', family: "'Black Han Sans'" },
  gasoek: { name: 'Slab', family: "'Gasoek One'" },
  jua: { name: 'Coil', family: "'Jua'" },
};
// Peak temperature (°C), Orton cone, total shrinkage after the glaze firing.
const FIRING = {
  terracotta: { bisque: 950, bisqueCone: '08', peak: 1080, cone: '03', shrink: 0.08 },
  stoneware: { bisque: 950, bisqueCone: '08', peak: 1240, cone: '6', shrink: 0.12 },
  porcelain: { bisque: 950, bisqueCone: '08', peak: 1280, cone: '9', shrink: 0.14 },
};
const TOOLS = {
  press: { name: 'Press', key: '1', svg: '<path d="M8 20c0-5 2-9 5-11s6-1 6 2-2 4-2 7 1 4 1 4"/><ellipse cx="13" cy="21" rx="7" ry="2"/>' },
  add: { name: 'Add', key: '2', svg: '<circle cx="13" cy="13" r="6"/><path d="M13 3v4M13 19v4M3 13h4M19 13h4"/>' },
  carve: { name: 'Carve', key: '3', svg: '<path d="M4 22L16 10"/><path d="M16 10c1-3 4-5 6-4s0 5-3 6l-3-2z"/>' },
  smooth: { name: 'Smooth', key: '4', svg: '<path d="M3 17c3-3 5-3 7 0s4 3 7 0 4-2 6 0"/><path d="M3 11c3-3 5-3 7 0s4 3 7 0 4-2 6 0" opacity=".45"/>' },
};
const BRUSH = [0.05, 0.085, 0.13];
const BRUSH_LABEL = ['S', 'M', 'L'];
const NEXT_LABEL = ['Start shaping', 'Put it on the shelf', 'Load the kiln', 'Go to glazing', 'Load the kiln', 'New piece'];
const STAGE_NAME = ['Wedge', 'Shape', 'Dry', 'Bisque', 'Glaze', 'Glaze fire'];

const debug = { speed: 1 };

const state = {
  stage: 0,
  reached: 0,
  body: 'stoneware',
  mould: 'bagel',
  glaze: 'celadon',
  tool: 'press',
  brush: 1,
  depth: 0.7,
  piece: 1 + Math.floor(Math.random() * 400),
  marks: 0,
  anim: null,
  dipped: false,
  bisqued: false,
  fired: false,
  look: null,
  stageLooks: [],
};

const freshLook = () => ({
  water: 22, wet: 1, scale: 1, fired: 0, heat: 0,
  glazeOn: false, glazeLine: 9, drip: 0, melt: 0,
  bisqueCurve: null, fireCurve: null,
});
state.look = freshLook();

// ---------------------------------------------------------------- three

const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

const key = new THREE.DirectionalLight(0xfff3e6, 2.4);
key.position.set(-2.6, 4.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
key.shadow.radius = 6;
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 4, bottom: -2, near: 0.5, far: 14 });
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
mesh.castShadow = true;
mesh.receiveShadow = true;
wheel.add(mesh);

const clay = new Clay({ budget: narrow() ? 200000 : 340000 });
let minY = 0;
// Letters stand on the baseline; descenders sink a little into the board.
const groundY = () => Math.max(minY, (clay.baseY ?? 0) - 0.035);
let dirty = false;

function remesh() {
  const { positions, indices } = clay.mesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  mesh.geometry.dispose();
  mesh.geometry = g;
  let m = Infinity;
  for (let i = 1; i < positions.length; i += 3) if (positions[i] < m) m = positions[i];
  if (m !== Infinity) minY = m;
  dirty = false;
}

// ---------------------------------------------------------------- word & growth

let wordToken = 0;
let prevChars = [];

async function setWord(word, { regrowAll = false } = {}) {
  const token = ++wordToken;
  const family = `${MOULDS[state.mould].family}, 'Black Han Sans', sans-serif`;
  try { await document.fonts.load(`100px ${MOULDS[state.mould].family}`, word || 'a'); } catch (e) { /* fall back */ }
  if (token !== wordToken) return;
  const chars = [...word];
  const old = clay.letters.map((l) => l.grow);
  clay.setWord(word, family, state.piece);
  clay.letters.forEach((L, i) => {
    const kept = !regrowAll && prevChars[i] === chars[i] && old[i] !== undefined;
    L.grow = kept ? old[i] : 0;
    L.vel = 0;
    L.delay = kept ? 0 : (regrowAll ? i * 0.085 : 0);
    L.target = 1;
  });
  prevChars = chars;
  clay.build();
  remesh();
  U.uTop.value = clay.capY;
  updateLog();
  updateNext();
}

function growStep(dt) {
  if (!clay.letters.length) return false;
  let moving = false;
  for (const L of clay.letters) {
    if (L.delay > 0) { L.delay -= dt; moving = true; continue; }
    if (reduceMotion) { if (L.grow !== 1) { L.grow = 1; moving = true; } continue; }
    const k = 120, c = 13;
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      L.vel += ((L.target - L.grow) * k - L.vel * c) * h;
      L.grow += L.vel * h;
    }
    if (Math.abs(L.target - L.grow) > 0.002 || Math.abs(L.vel) > 0.01) moving = true;
    else if (L.grow !== L.target) { L.grow = L.target; moving = true; }
  }
  return moving;
}
function settleGrowth() {
  if (!clay.letters.length || !growing()) return;
  clay.letters.forEach((L) => { L.grow = 1; L.vel = 0; L.delay = 0; });
  clay.build();
  remesh();
}
const growing = () => clay.letters.some((L) => L.delay > 0 || Math.abs(L.grow - 1) > 0.01);

// ---------------------------------------------------------------- camera fit & turntable

const view = { rot: -0.95, rotTarget: -0.24, vel: 0, dist: 6, distTarget: 6, el: 0.2, zoom: 1, panX: 0, panY: 0, px: 0, py: 0 };
const ZOOM_MIN = 0.6, ZOOM_MAX = 3.5;

// world units per screen pixel on the plane through the piece, at a given zoom
function worldPerPx(zoom) {
  return (2 * (view.distTarget / zoom) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / innerHeight;
}
function clampPan() {
  const s = mesh.scale.x || 1;
  const maxX = ((clay.width || 1) / 2) * s, top = (clay.capY || 0.8) * s;
  view.panX = clamp(view.panX, -maxX, maxX);
  view.panY = clamp(view.panY, -top * 0.6, top * 0.6);
  if (view.zoom <= 1) { view.panX *= view.zoom; view.panY *= view.zoom; }
}
// zoom so the point under (sx, sy) stays under it
function zoomAt(z, sx, sy) {
  z = clamp(z, ZOOM_MIN, ZOOM_MAX);
  const r = layoutRect();
  const dx = sx - r.cx, dy = sy - r.cy;
  const before = worldPerPx(view.zoom), after = worldPerPx(z);
  view.panX += dx * (before - after);
  view.panY -= dy * (before - after);
  view.zoom = z;
  clampPan();
  updateZoomUI();
}
function panBy(dx, dy) {
  const w = worldPerPx(view.zoom);
  view.panX -= dx * w;
  view.panY += dy * w;
  clampPan();
}
function resetZoom() { view.zoom = 1; view.panX = 0; view.panY = 0; updateZoomUI(); }
function updateZoomUI() {
  const out = document.getElementById('zfit');
  if (out) out.textContent = `${Math.round(view.zoom * 100)}%`;
  // zoomed-in clay runs under the side panels; give them a backing so they stay readable
  document.body.classList.toggle('zoomed', view.zoom > 1.12);
}

function layoutRect() {
  const W = innerWidth, H = innerHeight;
  const rail = narrow() ? 56 : 64;
  if (narrow()) {
    const panel = $('#panel').getBoundingClientRect();
    const top = state.stage === 0 ? 140 : 70;
    const bottom = Math.min(panel.top || H - rail, H - rail);
    return { cx: W / 2, cy: (top + bottom) / 2, w: W - 32, h: Math.max(120, bottom - top - 20) };
  }
  const side = W > 1020 ? 330 : 320;
  const left = side, right = W > 1020 ? W - 260 : W - 40;
  const bottom = H - rail - (state.stage === 0 ? 120 : 30);
  return { cx: (left + right) / 2, cy: (80 + bottom) / 2, w: right - left - 40, h: bottom - 80 - 20 };
}

function fitCamera() {
  const W = innerWidth, H = innerHeight;
  const r = layoutRect();
  camera.aspect = W / H;
  camera.setViewOffset(W, H, W / 2 - r.cx, H / 2 - r.cy, W, H);
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const cw = (Math.max(clay.width || 1, 1.2) + 0.4) * 1.22;
  const ch = ((clay.capY - clay.descY) || 1) * 1.2 + 0.5;
  const dW = (cw * H) / r.w / (2 * tan);
  const dH = (ch * H) / r.h / (2 * tan);
  view.distTarget = Math.max(dW, dH, 2.4);
  camera.updateProjectionMatrix();
}

function placeCamera() {
  const s = mesh.scale.x;
  const ty = ((clay.capY || 0.8) * 0.48) * s + 0.02;
  const d = view.dist;
  const tx = view.px, tyy = ty + view.py;
  camera.position.set(tx, tyy + Math.sin(view.el) * d, Math.cos(view.el) * d);
  camera.lookAt(tx, tyy, 0);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  fitCamera();
}
addEventListener('resize', () => { resize(); updateNext(); });

// ---------------------------------------------------------------- picking & tools

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const inv = new THREE.Matrix4();
const cursor = $('#cursor');

function pick(ev) {
  if (!clay.field) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  mesh.updateMatrixWorld();
  inv.copy(mesh.matrixWorld).invert();
  const o = raycaster.ray.origin.clone().applyMatrix4(inv);
  const d = raycaster.ray.direction.clone().transformDirection(inv);
  const hit = clay.raycast([o.x, o.y, o.z], [d.x, d.y, d.z]);
  return hit ? { p: hit, dir: [d.x, d.y, d.z] } : null;
}

function cursorRadius(p) {
  const r = BRUSH[state.brush] * mesh.scale.x;
  const w = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(mesh.matrixWorld);
  const a = w.clone().project(camera);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r);
  const b = w.clone().add(right).project(camera);
  return Math.max(10, Math.abs(b.x - a.x) * innerWidth * 0.5);
}

const undo = [];
const pointer = { mode: null, x: 0, lastP: null, id: null };

function applyTool(p, dir) {
  const r = BRUSH[state.brush];
  if (state.tool === 'press') clay.press(p, dir, r);
  else if (state.tool === 'add') clay.add(p, dir, r);
  else if (state.tool === 'smooth') clay.smooth(p, r * 1.2);
  dirty = true;
}

function stroke(hit) {
  const r = BRUSH[state.brush];
  const last = pointer.lastP;
  if (state.tool === 'carve') {
    if (!last) { pointer.lastP = hit.p; return; }
    const dist = Math.hypot(hit.p[0] - last[0], hit.p[1] - last[1], hit.p[2] - last[2]);
    if (dist < clay.vs * 1.2) return;
    if (dist > r * 3) { pointer.lastP = hit.p; return; } // jumped across a gap
    clay.carve(last, hit.p, hit.dir, r);
    pointer.lastP = hit.p;
    dirty = true;
    return;
  }
  if (!last) { applyTool(hit.p, hit.dir); pointer.lastP = hit.p; return; }
  const dist = Math.hypot(hit.p[0] - last[0], hit.p[1] - last[1], hit.p[2] - last[2]);
  const gap = r * 0.4;
  if (dist < gap) return;
  const n = Math.min(8, Math.floor(dist / gap));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q = [lerp(last[0], hit.p[0], t), lerp(last[1], hit.p[1], t), lerp(last[2], hit.p[2], t)];
    applyTool(q, hit.dir);
  }
  pointer.lastP = hit.p;
}

// Two fingers (or a trackpad pinch / wheel) zoom; the point under the fingers stays put.
const touches = new Map();
let pinch = null;
const touchSpread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const touchMid = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

canvas.addEventListener('pointerdown', (ev) => {
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  canvas.setPointerCapture(ev.pointerId);
  if (touches.size === 2) {
    // a second finger turns whatever the first one started into a pinch
    if (pointer.mode === 'tool' && undo.length) { clay.field.set(undo.pop()); state.marks = Math.max(0, state.marks - 1); dirty = true; updateLog(); }
    pointer.mode = 'pinch';
    pointer.id = null;
    pointer.lastP = null;
    canvas.classList.remove('grabbing');
    pinch = { d: touchSpread(), mid: touchMid() };
    return;
  }
  if (touches.size > 2 || pointer.id !== null) return;
  pointer.id = ev.pointerId;
  pointer.x = ev.clientX;
  const hit = state.stage === 1 && !state.anim ? pick(ev) : null;
  if (hit) {
    pointer.mode = 'tool';
    undo.push(clay.field.slice());
    if (undo.length > 14) undo.shift();
    pointer.lastP = null;
    stroke(hit);
    state.marks++;
    updateLog();
  } else {
    pointer.mode = 'turn';
    view.vel = 0;
    canvas.classList.add('grabbing');
  }
});

canvas.addEventListener('pointermove', (ev) => {
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointer.mode === 'pinch') {
    if (touches.size < 2 || !pinch) return;
    const d = touchSpread(), mid = touchMid();
    zoomAt(view.zoom * (d / pinch.d), mid.x, mid.y);
    panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
    pinch = { d, mid };
    return;
  }
  if (pointer.mode === 'turn' && ev.pointerId === pointer.id) {
    const dx = ev.clientX - pointer.x;
    pointer.x = ev.clientX;
    view.rotTarget += dx * 0.007;
    view.vel = dx * 0.007;
    return;
  }
  if (state.stage !== 1 || ev.pointerType === 'touch') { cursor.classList.remove('on'); canvas.classList.remove('tooling'); }
  const hit = state.stage === 1 && !state.anim ? pick(ev) : null;
  if (hit && ev.pointerType !== 'touch') {
    const r = cursorRadius(hit.p);
    cursor.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    cursor.style.width = cursor.style.height = `${r * 2}px`;
    cursor.style.margin = `${-r}px 0 0 ${-r}px`;
    cursor.classList.add('on');
    canvas.classList.add('tooling');
  } else if (pointer.mode !== 'tool') {
    cursor.classList.remove('on');
    canvas.classList.remove('tooling');
  }
  if (pointer.mode === 'tool' && ev.pointerId === pointer.id && hit) stroke(hit);
});

function endPointer(ev) {
  touches.delete(ev.pointerId);
  if (pointer.mode === 'pinch') {
    if (touches.size < 2) { pointer.mode = touches.size ? 'pinch-tail' : null; pinch = null; }
    return;
  }
  if (pointer.mode === 'pinch-tail') { if (!touches.size) pointer.mode = null; return; }
  if (ev.pointerId !== pointer.id) return;
  pointer.id = null;
  pointer.mode = null;
  pointer.lastP = null;
  canvas.classList.remove('grabbing');
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  // trackpad pinches arrive as ctrl+wheel with small deltas
  const k = ev.ctrlKey ? 0.012 : 0.0016;
  zoomAt(view.zoom * Math.exp(-ev.deltaY * k), ev.clientX, ev.clientY);
}, { passive: false });
canvas.addEventListener('pointerleave', () => { if (pointer.mode !== 'tool') cursor.classList.remove('on'); });

function doUndo() {
  if (state.stage !== 1 || !undo.length) return;
  clay.field.set(undo.pop());
  state.marks = Math.max(0, state.marks - 1);
  dirty = true;
  updateLog();
}

// ---------------------------------------------------------------- process

function look() { return state.look; }

function applyLook() {
  const L = look();
  U.uWet.value = L.wet;
  U.uFired.value = L.fired;
  U.uHeat.value = L.heat;
  U.uGlazeLine.value = L.glazeOn ? L.glazeLine : 9;
  U.uDrip.value = L.drip;
  U.uGlazeMelt.value = L.melt;
  mesh.scale.setScalar(L.scale);
  const heat = L.heat;
  key.intensity = 2.4 * (1 - heat * 0.85);
  rim.intensity = 0.9 * (1 - heat * 0.9);
  hemi.intensity = 0.55 * (1 - heat * 0.8);
  scene.environmentIntensity = 0.5 * (1 - heat * 0.8);
  ground.material.opacity = 0.2 * (1 - heat * 0.7);
  $('.glow').style.opacity = String(clamp(heat * 1.15));
}

function kilnProfile(t, peak) {
  // ramp, soak at peak, then cool; t in 0..1
  if (t < 0.6) return 20 + (peak - 20) * ease(t / 0.6);
  if (t < 0.7) return peak;
  return 20 + (peak - 20) * Math.exp(-((t - 0.7) / 0.3) * 3.2);
}

function startAnim(type, dur, onTick, onDone) {
  state.anim = { type, t: 0, dur: reduceMotion ? 0.01 : dur, onTick, onDone };
  updateNext();
}

function stepAnim(dt) {
  const a = state.anim;
  if (!a) return;
  a.t = Math.min(1, a.t + (dt * debug.speed) / a.dur);
  a.onTick(a.t);
  if (a.t >= 1) {
    state.anim = null;
    a.onDone && a.onDone();
    updateNext();
  }
}

function runDry() {
  const L = look();
  const fromWater = L.water, fromScale = L.scale;
  startAnim('dry', 5.5, (t) => {
    const e = 1 - (1 - t) ** 2.2;
    L.water = fromWater * (1 - e);
    L.wet = clamp(L.water / 22);
    L.scale = fromScale * (1 - 0.05 * e);
    renderDry();
    updateLog();
  }, () => { L.water = 0; L.wet = 0; renderDry(); toast('Bone dry. Ready for the kiln.'); });
}

function renderDry() {
  const w = look().water;
  $('#moist').textContent = w.toFixed(1);
  $('#moist-bar').style.width = `${(w / 22) * 100}%`;
  $$('#dry-phases li').forEach((li) => {
    const at = +li.dataset.at;
    li.classList.toggle('on', at === 22 ? w > 12 : at === 12 ? w <= 12 && w > 0.05 : w <= 0.05);
  });
}

function runFiring(kind) {
  if (state.anim || state.stage !== (kind === 'bisque' ? 3 : 5)) return;
  const L = look();
  const F = FIRING[state.body];
  const peak = kind === 'bisque' ? F.bisque : F.peak;
  const pane = $(`[data-pane="${kind === 'bisque' ? 3 : 5}"]`);
  const tempEl = $('[data-temp]', pane);
  const cv = $('[data-curve]', pane);
  const pts = [];
  const fromScale = L.scale;
  let shrunk = 0;
  const targetScale = kind === 'bisque' ? fromScale * 0.985 : (1 - F.shrink);
  $('[data-fire]', pane).disabled = true;
  L[kind === 'bisque' ? 'bisqueCurve' : 'fireCurve'] = pts;
  startAnim(kind, kind === 'bisque' ? 7.5 : 9, (t) => {
    const T = kilnProfile(t, peak);
    pts.push([t, T]);
    L.heat = clamp((T - 480) / (1250 - 480)) ** 1.1 * (kind === 'bisque' ? 0.85 : 1);
    if (kind === 'bisque') L.fired = Math.max(L.fired, clamp((T - 550) / (peak - 550)));
    else {
      L.melt = Math.max(L.melt, clamp((T - 980) / (peak - 980)));
      L.drip = 0.1 + 0.32 * L.melt;
    }
    shrunk = Math.max(shrunk, clamp((T - 400) / (peak - 400)) ** 2);
    L.scale = lerp(fromScale, targetScale, shrunk);
    document.body.classList.toggle('firing', T > 320);
    tempEl.textContent = Math.round(T).toLocaleString('en-US');
    drawCurve(cv, pts, peak, kind);
    updateLog();
  }, () => {
    L.heat = 0;
    L.scale = targetScale;
    document.body.classList.remove('firing');
    tempEl.textContent = '20';
    if (kind === 'bisque') { L.fired = 1; state.bisqued = true; toast(`Bisque done. Cone ${F.bisqueCone}, ${F.bisque}°C.`); }
    else {
      L.melt = 1; state.fired = true;
      $('#done').hidden = false;
      toast(`Cone ${F.cone}. ${GLAZES[state.glaze].name} on ${BODIES[state.body].name.toLowerCase()}.`);
    }
    updateLog();
  });
}

function cssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

function drawCurve(cv, pts, peak, kind) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const pad = { l: 64, r: 34, t: 34, b: 34 };
  const maxT = 1300, hours = kind === 'bisque' ? 10 : 12;
  const x = (t) => pad.l + t * (W - pad.l - pad.r);
  const y = (T) => H - pad.b - (T / maxT) * (H - pad.t - pad.b);
  ctx.clearRect(0, 0, W, H);
  ctx.font = `20px ${getComputedStyle(document.body).getPropertyValue('--f-mono')}`;
  ctx.textBaseline = 'middle';
  const ink2 = cssVar('--ink-2'), rule = cssVar('--rule'), ink = cssVar('--ink');
  ctx.lineWidth = 1;
  for (const T of [0, 500, 1000]) {
    ctx.strokeStyle = rule;
    ctx.beginPath(); ctx.moveTo(pad.l, y(T)); ctx.lineTo(W - pad.r, y(T)); ctx.stroke();
    ctx.fillStyle = ink2; ctx.textAlign = 'right';
    ctx.fillText(String(T), pad.l - 12, y(T));
  }
  ctx.textAlign = 'center';
  for (let h = 0; h <= hours; h += hours / 2) {
    ctx.fillStyle = ink2;
    ctx.fillText(`${h}h`, x(h / hours), H - pad.b + 18);
  }
  // red heat line
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = cssVar('--heat');
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(pad.l, y(525)); ctx.lineTo(W - pad.r, y(525)); ctx.stroke();
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  if (!pts || !pts.length) return;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([t, T], i) => (i ? ctx.lineTo(x(t), y(T)) : ctx.moveTo(x(t), y(T))));
  ctx.stroke();
  const [lt, lT] = pts[pts.length - 1];
  ctx.fillStyle = cssVar('--heat');
  ctx.beginPath(); ctx.arc(x(lt), y(lT), 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.textAlign = 'left';
  ctx.fillText(`cone ${kind === 'bisque' ? FIRING[state.body].bisqueCone : FIRING[state.body].cone}`, x(0.6) - 10, y(peak) - 14 < 10 ? 12 : y(peak) - 14);
}

function runDip() {
  if (state.anim || state.stage !== 4) return;
  const L = look();
  const top = clay.capY + 0.08, bottom = minY - 0.05;
  const target = lerp(top, bottom, state.depth);
  L.glazeOn = true; L.melt = 0;
  $('#dip').disabled = true;
  startAnim('dip', 2.4, (t) => {
    const down = t < 0.55 ? ease(t / 0.55) : 1;
    L.glazeLine = lerp(top + 0.6, target, down);
    L.drip = t < 0.55 ? 0 : 0.1 * ease((t - 0.55) / 0.45);
  }, () => {
    L.drip = 0.1;
    state.dipped = true;
    $('#dip').disabled = false;
    $('#dip').textContent = 'Wash off and dip again';
    toast(`${GLAZES[state.glaze].name}, ${Math.round(state.depth * 100)}% dip.`);
    updateLog();
  });
}

function washGlaze() {
  const L = look();
  if (!L.glazeOn) return;
  L.glazeOn = false; L.drip = 0; L.melt = 0;
  state.dipped = false;
  $('#dip').textContent = 'Dip';
  updateLog();
}

// Entering a stage restores how the piece looked when it first arrived there.
function goTo(s, { forward = false } = {}) {
  if (state.anim) return;
  if (s > state.reached + (forward ? 1 : 0)) return;
  const back = s < state.stage;
  if (state.stage === 0 && s > 0) settleGrowth();
  if (forward) state.stageLooks[s] = structuredClone(state.look);
  if (back) {
    state.look = structuredClone(state.stageLooks[s] || freshLook());
    state.reached = s;
    if (s <= 3) state.bisqued = false;
    if (s <= 4) { state.dipped = false; $('#dip').textContent = 'Dip'; }
    state.fired = false;
    $('#done').hidden = true;
    $$('[data-fire]').forEach((b) => (b.disabled = false));
    $$('[data-temp]').forEach((el) => (el.textContent = '20'));
    $$('[data-curve]').forEach((cv) => drawCurve(cv, null, 0, cv.closest('[data-pane="3"]') ? 'bisque' : 'glaze'));
    if (s === 0) setWord($('#word').value);
    if (s === 1 && state.stage > 1) toast('Back to the wheel. Later steps were undone.');
  }
  state.stage = s;
  state.reached = Math.max(state.reached, s);
  document.body.dataset.stage = String(s);
  cursor.classList.remove('on');
  canvas.classList.remove('tooling');
  if (s === 2 && forward) runDry();
  if (s === 2) renderDry();
  if (s === 3 || s === 5) {
    const pane = $(`[data-pane="${s}"]`);
    drawCurve($('[data-curve]', pane), s === 3 ? look().bisqueCurve : look().fireCurve, 0, s === 3 ? 'bisque' : 'glaze');
  }
  if (s === 5) $('#fire-title').textContent = `Second firing, to cone ${FIRING[state.body].cone}.`;
  if (s === 0) setTimeout(() => $('#word').focus({ preventScroll: true }), 60);
  updateRail();
  updateNext();
  updateLog();
  fitCamera();
}

function canAdvance() {
  if (state.anim) return false;
  switch (state.stage) {
    case 0: return $('#word').value.trim().length > 0;
    case 1: return true;
    case 2: return look().water <= 0.01;
    case 3: return state.bisqued;
    case 4: return state.dipped;
    case 5: return state.fired;
    default: return false;
  }
}

function updateNext() {
  const n = $('#next');
  n.disabled = !canAdvance();
  // phones show the step name in the rail, so the button only needs to say what it does next
  n.firstChild.textContent = `${narrow() ? (state.stage === 5 ? 'New piece' : 'Next') : NEXT_LABEL[state.stage]} `;
}

function updateRail() {
  $$('#steps button').forEach((b) => {
    const i = +b.dataset.step;
    b.classList.toggle('past', i < state.stage);
    if (i === state.stage) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.disabled = i > state.reached;
  });
}

function updateLog() {
  const L = look();
  const F = FIRING[state.body];
  $('#log-word').textContent = $('#word').value.trim() || '—';
  $('#log-body').textContent = BODIES[state.body].name;
  $('#log-water').textContent = `${L.water.toFixed(1)}%`;
  $('#log-shrink').textContent = `${((1 - L.scale) * 100).toFixed(1)}%`;
  $('#log-bisque').textContent = state.bisqued ? `${F.bisque}°C / ^${F.bisqueCone}` : state.anim?.type === 'bisque' ? 'firing' : '—';
  $('#log-glaze').textContent = L.glazeOn ? `${GLAZES[state.glaze].name} ${Math.round(state.depth * 100)}%` : '—';
  $('#log-fire').textContent = state.fired ? `${F.peak}°C / ^${F.cone}` : state.anim?.type === 'glaze' ? 'firing' : '—';
  $('#log-marks').textContent = String(state.marks);
  $('#piece').textContent = `No. ${String(state.piece).padStart(4, '0')}`;
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------------------------------------------------------------- controls

function radioGroup(container, items, current, render, onPick) {
  container.innerHTML = '';
  Object.entries(items).forEach(([k, v]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.key = k;
    b.innerHTML = render(k, v);
    b.addEventListener('click', () => {
      $$('[role="radio"]', container).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onPick(k);
    });
    b.setAttribute('aria-checked', String(k === current));
    container.append(b);
  });
}

radioGroup($('#bodies'), BODIES, state.body,
  (k, v) => `<span class="dot" style="background:${v.dry}"></span><span class="nm">${v.name}</span><span class="sub">^${FIRING[k].cone}</span>`,
  (k) => { state.body = k; setBody(material, k); $('#body-note').textContent = BODIES[k].note; updateLog(); });
$$('#bodies .chip, #bodies button').forEach((b) => b.classList.add('chip'));

radioGroup($('#moulds'), MOULDS, state.mould,
  (k, v) => `<span class="glyph" style="font-family:${v.family}">a</span><span class="nm">${v.name}</span><span class="sub" style="font-family:${v.family}">Clay</span>`,
  (k) => { state.mould = k; setWord($('#word').value, { regrowAll: true }); });
$$('#moulds button').forEach((b) => b.classList.add('chip'));

radioGroup($('#tools'), TOOLS, state.tool,
  (k, v) => `<svg viewBox="0 0 26 26" aria-hidden="true">${v.svg}</svg><span>${v.name}</span><kbd>${v.key}</kbd>`,
  (k) => { state.tool = k; });
$$('#tools button').forEach((b) => b.classList.add('tool'));

radioGroup($('#glazes'), GLAZES, state.glaze,
  (k, v) => `<span class="tile" style="background:linear-gradient(180deg, ${v.base} 0 62%, ${v.pool} 62% 70%, ${v.raw} 70%)"></span><span class="nm">${v.name}</span>`,
  (k) => { state.glaze = k; setGlaze(material, k); washGlaze(); updateNext(); });
$$('#glazes button').forEach((b) => b.classList.add('glaze'));

function selectRadio(container, k) {
  const b = $(`[data-key="${k}"]`, container);
  if (b) b.click();
}

$('#brush').addEventListener('input', (e) => { state.brush = +e.target.value; $('#brush-out').textContent = BRUSH_LABEL[state.brush]; });
$('#depth').addEventListener('input', (e) => {
  state.depth = +e.target.value / 100;
  $('#depth-out').textContent = `${e.target.value}%`;
  if (state.dipped && !state.anim) { washGlaze(); updateNext(); }
});
$('#undo').addEventListener('click', doUndo);
$('#reform').addEventListener('click', () => {
  if (!clay.field) return;
  clay.build(); dirty = true; undo.length = 0; state.marks = 0; updateLog();
  toast('Re-wedged. Fresh clay.');
});
$('#dip').addEventListener('click', () => { if (state.anim) return; washGlaze(); runDip(); });
$$('[data-fire]').forEach((b) => b.addEventListener('click', () => runFiring(b.dataset.fire)));
$('#next').addEventListener('click', () => {
  if (!canAdvance()) return;
  if (state.stage === 5) return newPiece();
  goTo(state.stage + 1, { forward: true });
});
$$('#steps button').forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.step)));
$('#again').addEventListener('click', newPiece);
$('#save').addEventListener('click', saveImage);
$('#zin').addEventListener('click', () => { const r = layoutRect(); zoomAt(view.zoom * 1.3, r.cx, r.cy); });
$('#zout').addEventListener('click', () => { const r = layoutRect(); zoomAt(view.zoom / 1.3, r.cx, r.cy); });
$('#zfit').addEventListener('click', resetZoom);
// keep the zoom controls clear of the sheet that holds the controls on phones
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--sheet', `${narrow() ? $('#panel').offsetHeight : 0}px`);
}).observe($('#panel'));
$('#save2').addEventListener('click', saveImage);

const wordInput = $('#word');
wordInput.addEventListener('input', () => {
  const v = [...wordInput.value.replace(/\s+/g, ' ')].slice(0, 12).join('');
  if (v !== wordInput.value) wordInput.value = v;
  setWord(v.trim());
});
wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && canAdvance()) { wordInput.blur(); goTo(1, { forward: true }); }
});

addEventListener('keydown', (e) => {
  if (e.target === wordInput) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
  if (e.target instanceof HTMLInputElement) return;
  const mid = layoutRect();
  if (e.key === '+' || e.key === '=') { zoomAt(view.zoom * 1.25, mid.cx, mid.cy); return; }
  if (e.key === '-' || e.key === '_') { zoomAt(view.zoom / 1.25, mid.cx, mid.cy); return; }
  if (e.key === '0') { resetZoom(); return; }
  if (state.stage === 1) {
    const t = Object.entries(TOOLS).find(([, v]) => v.key === e.key);
    if (t) selectRadio($('#tools'), t[0]);
    if (e.key === '[' || e.key === ']') {
      state.brush = clamp(state.brush + (e.key === ']' ? 1 : -1), 0, 2);
      $('#brush').value = String(state.brush);
      $('#brush-out').textContent = BRUSH_LABEL[state.brush];
    }
  }
});

function newPiece() {
  state.piece++;
  state.marks = 0;
  state.reached = 0;
  state.stageLooks = [];
  state.look = freshLook();
  state.bisqued = state.dipped = state.fired = false;
  undo.length = 0;
  view.rotTarget = -0.24 + (Math.random() - 0.5) * 0.3;
  resetZoom();
  goTo(0);
  state.stage = 0;
  document.body.dataset.stage = '0';
  $('#done').hidden = true;
  $('#dip').textContent = 'Dip';
  $$('[data-fire]').forEach((b) => (b.disabled = false));
  $$('[data-curve]').forEach((cv) => drawCurve(cv, null, 0, 'bisque'));
  prevChars = [];
  setWord($('#word').value.trim(), { regrowAll: true });
  wordInput.select();
  updateRail(); updateNext(); updateLog();
}

function saveImage() {
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = cssVar('--bg');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  const s = out.width / innerWidth;
  ctx.fillStyle = cssVar('--ink');
  ctx.font = `${11 * s}px ${cssVar('--f-mono')}`;
  const F = FIRING[state.body];
  const line = [
    `KILN No. ${String(state.piece).padStart(4, '0')}`,
    BODIES[state.body].name,
    look().glazeOn ? GLAZES[state.glaze].name : 'unglazed',
    state.fired ? `cone ${F.cone}` : state.bisqued ? `bisque ^${F.bisqueCone}` : look().water > 0 ? 'greenware' : 'bone dry',
  ].join('   ');
  ctx.fillText(line, 24 * s, out.height - 24 * s);
  const a = document.createElement('a');
  a.download = `kiln-${($('#word').value.trim() || 'piece').replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
  toast('Image saved.');
}

// ---------------------------------------------------------------- loop

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  U.uTime.value += dt;

  if (state.stage === 0 && growStep(dt)) { clay.build(); dirty = true; }
  stepAnim(dt);
  if (dirty) remesh();

  // turntable with a little inertia
  if (pointer.mode !== 'turn') {
    view.rotTarget += view.vel;
    view.vel *= 0.92;
  }
  view.rot = lerp(view.rot, view.rotTarget, 1 - Math.exp(-dt * (reduceMotion ? 60 : 7)));
  wheel.rotation.y = view.rot;
  const zk = 1 - Math.exp(-dt * (reduceMotion ? 60 : 10));
  view.dist = lerp(view.dist, view.distTarget / view.zoom, zk);
  view.px = lerp(view.px, view.panX, zk);
  view.py = lerp(view.py, view.panY, zk);

  applyLook();
  mesh.position.y = -groundY() * mesh.scale.x;
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

document.body.dataset.stage = '0';
setBody(material, state.body);
setGlaze(material, state.glaze);
$('#body-note').textContent = BODIES[state.body].note;
$$('[data-curve]').forEach((cv) => drawCurve(cv, null, 0, 'bisque'));
resize();
updateRail();
updateLog();
setWord(wordInput.value, { regrowAll: true }).then(() => {
  fitCamera();
  view.dist = view.distTarget * 1.25;
  wordInput.focus({ preventScroll: true });
  wordInput.setSelectionRange(wordInput.value.length, wordInput.value.length);
});
requestAnimationFrame(frame);

// for quick checks from the console
window.__kiln = { state, clay, goTo, view, debug };
