// Morphing-UI story ad. One element (#hero) changes shape from step to step; everything
// is a pure function of the frame index except velocity-based motion blur, so frames
// must be rendered in order: window.reel.frame(0), frame(1), …
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { Clay } from '../js/clay.js';
import { createClayMaterial, setBody, setGlaze } from '../js/material.js';

const FPS = 30, W = 1080, H = 1920, WORD = 'clay', DURATION = 20.5;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp((t - a) / (b - a));
const eio = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const spring = (t) => (t <= 0 ? 0 : 1 - Math.exp(-9 * t) * Math.cos(12 * t));
const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;
const mix3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ script

const CHAT = [
  { at: 0.15, side: 'L', text: 'Wanna do pottery this weekend?' },
  { at: 0.95, side: 'R', typing: 1.45 },
  { at: 1.45, side: 'R', text: 'No studio near me.' },
  { at: 2.0, side: 'R', typing: 2.45 },
  { at: 2.45, side: 'R', text: "And I don't own any clay." },
  { at: 3.05, side: 'L', typing: 3.6 },
  { at: 3.6, side: 'L', text: 'Just use Kiln.', last: true },
];
const DETACH = 4.75;
const TYPE_AT = [7.3, 7.45, 7.6, 7.75];

const WHITE = [255, 255, 255], INK = [17, 17, 17];
// hero shape keys: reached at t, morphing over d seconds from the previous key
const KEYS = [
  { t: 5.15, d: 0.4, cx: 540, cy: 960, w: 330, h: 140, r: 70, bg: [28, 28, 30], line: 0, sh: 0 },
  { t: 5.6, d: 0.35, cx: 540, cy: 960, w: 330, h: 330, r: 80, bg: INK, line: 0, sh: 0.18 },
  { t: 6.55, d: 0.3, cx: 540, cy: 960, w: 560, h: 210, r: 105, bg: INK, line: 0, sh: 0.1 },
  { t: 6.95, d: 0.4, cx: 540, cy: 960, w: 940, h: 160, r: 80, bg: [241, 241, 238], line: 0, sh: 0 },
  { t: 8.45, d: 0.35, cx: 540, cy: 960, w: 940, h: 200, r: 34, bg: WHITE, line: 1, sh: 0.1 },
  { t: 10.1, d: 0.45, cx: 540, cy: 960, w: 940, h: 520, r: 40, bg: WHITE, line: 1, sh: 0.12 },
  { t: 11.45, d: 0.3, cx: 540, cy: 1082, w: 840, h: 120, r: 18, bg: INK, line: 0, sh: 0.2 },
  { t: 11.85, d: 0.4, cx: 540, cy: 960, w: 940, h: 330, r: 36, bg: [243, 243, 240], line: 0, sh: 0.06 },
  { t: 14.3, d: 0.3, cx: 540, cy: 960, w: 960, h: 290, r: 30, bg: WHITE, line: 3, sh: 0.06 },
  { t: 15.85, d: 0.5, cx: 540, cy: 960, w: 1080, h: 1920, r: 0, bg: [16, 10, 7], line: 0, sh: 0 },
];
const HERO_END = 18.75;

// content layers inside the hero: [fade in at, fade out at]
const LAYERS = {
  bubble: [DETACH, 4.98, 0], pill: [5.0, 5.45], icon: [5.45, 6.35], field: [6.8, 8.3],
  opt1: [8.4, 8.78], opt2: [8.78, 9.14], opt3: [9.14, 9.95], prod: [10.0, 11.3], btn: [11.25, 11.62],
  prog1: [11.72, 12.95], prog2: [12.95, 14.15], ready: [14.25, 15.5],
};
const CURSOR = [
  { show: 4.0, from: [980, 1700], at: 4.55, target: () => bubbleRect && [bubbleRect.x + bubbleRect.w * 0.62, bubbleRect.y + bubbleRect.h * 0.62], hide: 4.72 },
  { show: 8.92, from: [990, 1500], at: 9.4, target: () => [540 + 210, 960 + 40] },
  { at: 11.0, target: () => [540 + 160, 1082 + 20], hide: 11.28 },
];
const HERO3D = { from: 15.6, cool: [16.1, 17.2] };
const NOTIF = { at: 17.55, out: 18.6 };

// ------------------------------------------------------------ 3D

const canvas = $('c');
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
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

function buildClay() {
  clay.setWord(WORD, "'Bagel Fat One', sans-serif", 341);
  clay.letters.forEach((L) => { L.grow = 1; });
  clay.build();
  // a few hand marks so the piece looks worked
  const mark = (li, x, y, fn) => { const p = clay.raycast([clay.letters[li].cx + x, y, 2], [0, 0, -1]); if (p) fn(p); };
  mark(0, -0.17, 0.36, (p) => clay.press(p, [0, 0, -1], 0.1));
  mark(2, -0.06, 0.24, (p) => clay.press(p, [0, 0, -1], 0.1));
  mark(3, 0.17, 0.58, (p) => clay.add(p, [0, 0, -1], 0.095));
  const { positions, indices } = clay.mesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  g.computeVertexNormals();
  mesh.geometry = g;
  minY = Infinity;
  for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]);
}

function render3D(t, rect, opts) {
  if (!rect) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  canvas.style.left = `${Math.round(rect.x)}px`;
  canvas.style.top = `${Math.round(rect.y)}px`;
  canvas.style.opacity = String(opts.opacity ?? 1);
  canvas.style.filter = opts.blur ? `blur(${opts.blur}px)` : 'none';
  renderer.setSize(Math.round(rect.w), Math.round(rect.h));

  const s = opts.scale;
  U.uWet.value = opts.wet; U.uFired.value = opts.fired; U.uHeat.value = opts.heat; U.uTime.value = t;
  U.uGlazeLine.value = opts.glazeLine; U.uDrip.value = opts.drip; U.uGlazeMelt.value = opts.melt;
  mesh.scale.setScalar(s);
  mesh.position.y = -Math.max(minY, -0.035) * s;
  wheel.rotation.y = opts.rot;
  const heat = opts.heat;
  key.intensity = 2.4 * (1 - heat * 0.85);
  rim.intensity = 0.9 * (1 - heat * 0.9);
  hemi.intensity = 0.55 * (1 - heat * 0.8);
  scene.environmentIntensity = 0.5 * (1 - heat * 0.8);
  ground.material.opacity = (opts.shadow ?? 0.16) * (1 - heat * 0.7);

  const aspect = rect.w / rect.h;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const cw = (clay.width + 0.15) * 1.04;
  const dist = (cw / opts.frac / aspect / (2 * tan)) * (opts.push ?? 1);
  const ty = clay.capY * 0.45 * s + (opts.lift ?? 0);
  camera.aspect = aspect;
  camera.clearViewOffset();
  camera.position.set(0, ty + Math.sin(0.2) * dist, Math.cos(0.2) * dist);
  camera.lookAt(0, ty, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------ text helpers

// words blur in one after another
function words(text, lt, { stagger = 0.06, dur = 0.22, dy = 14 } = {}) {
  return text.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const k = clamp((lt - (i / 2) * stagger) / dur);
    const e = easeOut(k);
    return `<span class="w" style="opacity:${e};filter:blur(${(1 - e) * 10}px);transform:translateY(${(1 - e) * dy}px)">${w}</span>`;
  }).join('');
}

// ------------------------------------------------------------ chat

let bubbleRect = null;
const BUBBLE_H = 107, DOTS_H = 76;

function renderChat(t) {
  const chat = $('chat');
  if (t >= 5.2) { chat.style.display = 'none'; return; }
  chat.style.display = 'block';
  const out = span(t, DETACH, 5.05);
  chat.style.opacity = String(1 - out);
  chat.style.filter = `blur(${out * 12}px)`;
  chat.style.transform = `translateY(${-out * 40}px)`;
  let html = `<div class="stamp" style="opacity:${clamp(t / 0.3)}">Today 9:41 PM</div>`;
  for (const m of CHAT) {
    if (t < m.at) continue;
    if (m.typing && t >= m.typing) continue;
    const lt = t - m.at;
    const k = spring(lt);
    const grow = easeOut(clamp(lt / 0.22));
    const h = (m.typing ? DOTS_H : BUBBLE_H) * grow;
    const pressed = m.last && t >= 4.55 && t < DETACH;
    const hidden = m.last && t >= DETACH;
    const bg = m.side === 'L' ? (pressed ? 'background:#48474d;' : '') : '';
    const style = `opacity:${hidden ? 0 : clamp(lt / 0.12)};transform:scale(${0.55 + 0.45 * k});filter:blur(${(1 - clamp(lt / 0.18)) * 8}px);${bg}`;
    let inner;
    if (m.typing) {
      inner = `<div class="dots">${[0, 1, 2].map((d) => `<i style="opacity:${0.35 + 0.65 * Math.max(0, Math.sin((t * 7) - d * 0.9))}"></i>`).join('')}</div>`;
      html += `<div style="height:${h}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:${m.side === 'L' ? 'flex-start' : 'flex-end'}"><div class="b ${m.side}" style="padding:0;${style}">${inner}</div></div>`;
    } else {
      inner = words(m.text, lt - 0.05);
      html += `<div style="height:${h}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:${m.side === 'L' ? 'flex-start' : 'flex-end'}"><div class="b ${m.side}" ${m.last ? 'id="lastB"' : ''} style="${style}">${inner}</div></div>`;
    }
  }
  $('chatCol').innerHTML = html;
  const lb = $('lastB');
  if (lb && t < DETACH) {
    const r = lb.getBoundingClientRect();
    bubbleRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  }
}

// ------------------------------------------------------------ hero

const prev = { cx: 0, cy: 0, w: 0, h: 0 };
let heroBuilt = false;

function buildHero() {
  const search = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
  $('hero').innerHTML = `
    <div class="k" data-l="bubble"><span style="font:400 46px/1.2 var(--f);color:#fff;letter-spacing:-0.01em">Just use Kiln.</span></div>
    <div class="k pill-t" data-l="pill" id="lPill"></div>
    <div class="k icon-t" data-l="icon">KILN</div>
    <div class="k field" data-l="field">${search}<div class="grow" id="lField"></div><div class="chip" id="lChip"><b>a</b>Puff<span style="font-size:24px">▾</span></div></div>
    <div class="k opt" data-l="opt1"><i class="sw" style="background:#c08a6c"></i><div><div class="t1" id="o1a"></div><div class="t2" id="o1b"></div></div></div>
    <div class="k opt" data-l="opt2"><i class="sw" style="background:#e4e1d9"></i><div><div class="t1" id="o2a"></div><div class="t2" id="o2b"></div></div></div>
    <div class="k opt" data-l="opt3"><i class="sw" style="background:#c7c0b3"></i><div><div class="t1" id="o3a"></div><div class="t2" id="o3b"></div></div></div>
    <div class="k prod" data-l="prod">
      <div class="row"><div class="thumb" id="thumb"></div>
        <div><div class="t1">clay</div><div class="t2">Puff · Speckled stoneware</div><span class="tag">Wet · 22% water</span></div>
        <div class="temp">^6</div></div>
      <div class="btn" id="fireBtn">Fire it</div>
    </div>
    <div class="k btn-t" data-l="btn">Fire it</div>
    <div class="k prog" data-l="prog1"><div class="t1" id="p1a"></div><div class="t2" id="p1b"></div><div class="bar"><i id="bar1" style="background:#0a84ff"></i></div></div>
    <div class="k prog" data-l="prog2"><div class="t1" id="p2a"></div><div class="t2" id="p2b"></div><div class="bar"><i id="bar2" style="background:#2fb457"></i></div></div>
    <div class="k prog" data-l="ready"><div class="t1" id="r1" style="font-size:72px"></div><div class="t2" id="r2"></div></div>`;
  heroBuilt = true;
}

function heroShape(t) {
  if (t < DETACH || !bubbleRect) return null;
  const k0 = { cx: bubbleRect.x + bubbleRect.w / 2, cy: bubbleRect.y + bubbleRect.h / 2, w: bubbleRect.w, h: bubbleRect.h, r: 46, bg: [72, 71, 77], line: 0, sh: 0 };
  let from = k0, to = k0, u = 1, idx = -1;
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i];
    if (t >= k.t - k.d) { from = i ? KEYS[i - 1] : k0; to = k; u = eio(span(t, k.t - k.d, k.t)); idx = i; }
  }
  const s = {};
  for (const p of ['cx', 'cy', 'w', 'h', 'r', 'line', 'sh']) s[p] = lerp(from[p], to[p], u);
  s.bg = mix3(from.bg, to.bg, u);
  s.morph = u < 1 ? Math.sin(Math.PI * u) : 0;
  s.idx = idx;
  return s;
}

function layerAlpha(t, name) {
  const [a, b, fin = 0.16] = LAYERS[name];
  if (t < a || t > b + 0.16) return 0;
  const i = fin ? clamp((t - a) / fin) : 1;
  const o = 1 - clamp((t - b) / 0.16);
  return Math.min(i, o);
}

function renderHero(t) {
  const hero = $('hero');
  const s = t < HERO_END ? heroShape(t) : null;
  if (!s) { hero.style.display = 'none'; return null; }
  if (!heroBuilt) buildHero();
  hero.style.display = 'block';

  // velocity → motion blur and a little tilt, like a camera chasing the element
  const v = Math.hypot(s.cx - prev.cx, s.cy - prev.cy) + 0.35 * Math.hypot(s.w - prev.w, s.h - prev.h);
  const vx = s.cx - prev.cx + (s.w - prev.w) * 0.2;
  Object.assign(prev, { cx: s.cx, cy: s.cy, w: s.w, h: s.h });
  const blur = s.w >= 1079 ? 0 : Math.min(14, v * 0.09);
  const flat = 1 - span(s.w, 960, 1080); // no tilt once the element fills the screen
  let rz = -2.2 * s.morph * flat, ry = clamp(vx * 0.25, -10, 10) * flat;
  let scale = 1, bg = s.bg;
  if (t >= 9.4 && t < 9.62) { scale = 0.97; bg = mix3(bg, [232, 232, 228], 1); }
  if (t >= 4.55 && t < DETACH + 0.05) bg = [72, 71, 77];
  // full-screen: the kiln cools to white
  if (t >= KEYS[KEYS.length - 1].t - 0.5) {
    const cool = ease(span(t, HERO3D.cool[0], HERO3D.cool[1]));
    bg = mix3(bg, WHITE, cool);
  }
  Object.assign(hero.style, {
    left: `${s.cx - s.w / 2}px`, top: `${s.cy - s.h / 2}px`, width: `${s.w}px`, height: `${s.h}px`,
    borderRadius: `${s.r}px`, background: rgb(bg),
    boxShadow: `0 ${30 * s.sh}px ${90 * s.sh + 1}px rgba(0,0,0,${s.sh}), inset 0 0 0 ${s.line}px rgba(17,17,17,${s.line > 2 ? 0.9 : 0.1})`,
    filter: blur > 0.3 ? `blur(${blur}px)` : 'none',
    transform: `perspective(1600px) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`,
  });

  // layers
  for (const el of hero.children) {
    const name = el.dataset.l;
    const a = layerAlpha(t, name);
    el.style.display = a > 0.001 ? '' : 'none';
    if (a <= 0.001) continue;
    const goingOut = t > LAYERS[name][1];
    const shift = (1 - a) * (goingOut ? -26 : 26);
    el.style.opacity = String(a);
    el.style.filter = a < 1 ? `blur(${(1 - a) * 12}px)` : 'none';
    el.style.transform = `translate(-50%, calc(-50% + ${shift}px)) scale(${0.96 + 0.04 * a})`;
  }
  // per-layer text
  $('lPill').innerHTML = words('Kiln.', t - 5.0);
  const typed = TYPE_AT.filter((x) => t >= x).length;
  const caret = typed > 0 && (typed < 4 || Math.floor(t * 2.5) % 2 === 0) ? '<i class="caret"></i>' : '';
  $('lField').innerHTML = typed === 0
    ? `<span class="ph">${words('Type a word', t - 6.88)}</span>`
    : WORD.slice(0, typed).split('').map((c, i) => {
      const e = easeOut(clamp((t - TYPE_AT[i]) / 0.15));
      return `<span class="w" style="opacity:${e};filter:blur(${(1 - e) * 8}px)">${c}</span>`;
    }).join('') + caret;
  const chipK = easeOut(clamp((t - 7.0) / 0.25));
  $('lChip').style.opacity = String(chipK);
  $('lChip').style.transform = `scale(${0.8 + 0.2 * chipK})`;
  $('o1a').innerHTML = words('Terracotta', t - 8.42); $('o1b').innerHTML = words('Earthenware · 1,060°C', t - 8.5);
  $('o2a').innerHTML = words('Porcelain', t - 8.8); $('o2b').innerHTML = words('Fine and white · 1,280°C', t - 8.86);
  $('o3a').innerHTML = words('Speckled stoneware', t - 9.16); $('o3b').innerHTML = words('Iron speckle · 1,240°C', t - 9.22);
  $('fireBtn').style.background = t >= 11.0 && t < 11.3 ? '#55554f' : '#111';
  $('p1a').innerHTML = words('Firing', t - 11.75); $('p1b').innerHTML = words('Bisque · cone 08 · 950°C', t - 11.85);
  $('bar1').style.width = `${ease(span(t, 11.95, 12.85)) * 100}%`;
  $('p2a').innerHTML = words('Glaze on', t - 13.0); $('p2b').innerHTML = words('Celadon · 70% dip', t - 13.1);
  $('bar2').style.width = `${easeOut(span(t, 13.05, 13.5)) * 100}%`;
  $('r1').innerHTML = words('Into the kiln', t - 14.3); $('r2').innerHTML = words('Glaze firing · cone 6 · 1,240°C', t - 14.42);
  return s;
}

// ------------------------------------------------------------ cursor

let cursorPos = null;
function renderCursor(t) {
  const el = $('cursor');
  let pos = null, alpha = 0, press = false;
  for (let i = 0; i < CURSOR.length; i++) {
    const c = CURSOR[i];
    const start = c.show ?? CURSOR[i - 1].at + 0.05;
    const end = c.hide ?? (CURSOR[i + 1] ? CURSOR[i + 1].at - 0.5 : c.at + 0.4);
    if (t < start || t > end + 0.15) continue;
    const from = c.from ?? CURSOR[i - 1].target();
    const target = c.target();
    if (!from || !target) continue;
    const m = eio(span(t, c.show !== undefined ? start : c.at - 0.5, c.at - 0.08));
    pos = [lerp(from[0], target[0], m), lerp(from[1], target[1], m)];
    alpha = Math.min(c.show !== undefined ? clamp((t - start) / 0.15) : 1, c.hide !== undefined ? 1 - clamp((t - end) / 0.15) : 1);
    press = t >= c.at && t < c.at + 0.13;
  }
  if (!pos) { el.style.opacity = '0'; return; }
  cursorPos = pos;
  el.style.opacity = String(alpha);
  el.style.transform = `translate(${pos[0] - 8}px, ${pos[1] - 4}px) scale(${press ? 0.84 : 1})`;
}

// ------------------------------------------------------------ frame

function background(t) {
  let c = [0, 0, 0];
  if (t >= 4.85) c = mix3([0, 0, 0], [118, 118, 116], span(t, 4.85, 5.0));
  if (t >= 5.3) c = mix3([118, 118, 116], WHITE, span(t, 5.3, 5.42));
  $('bg').style.background = rgb(c);
}

function render(t) {
  background(t);
  renderChat(t);
  const s = renderHero(t);

  // 3D: thumbnail inside the product card, then full screen
  const prodA = t < HERO_END ? layerAlpha(t, 'prod') : 0;
  if (prodA > 0.01) {
    const r = $('thumb').getBoundingClientRect();
    render3D(t, { x: r.left, y: r.top, w: r.width, h: r.height }, {
      opacity: prodA, wet: 1, fired: 0, heat: 0, glazeLine: 9, drip: 0, melt: 0, scale: 1,
      rot: -0.5 + (t - 10) * 0.35, frac: 0.92, shadow: 0.1,
    });
    $('glow').style.opacity = '0';
  } else if (t >= HERO3D.from && t < HERO_END + 0.6) {
    const heat = 1 - ease(span(t, HERO3D.cool[0], HERO3D.cool[1]));
    const n = span(t, NOTIF.at, NOTIF.at + 0.3) * (1 - span(t, NOTIF.out, NOTIF.out + 0.25));
    render3D(t, { x: 0, y: 0, w: W, h: H }, {
      opacity: span(t, HERO3D.from, HERO3D.from + 0.35) * (1 - span(t, HERO_END, HERO_END + 0.25)),
      blur: n * 10, wet: 0, fired: 1, heat, glazeLine: clay.capY + 0.08 - 0.7 * (clay.capY + 0.08 - (minY - 0.05)),
      drip: 0.42, melt: 1, scale: 0.88, rot: lerp(-0.55, 0.35, ease(span(t, HERO3D.from, HERO_END))),
      frac: 0.9, push: lerp(1.15, 0.98, easeOut(span(t, HERO3D.from, HERO_END))),
    });
    $('glow').style.opacity = String(heat * clamp((t - HERO3D.from) / 0.3));
    $('dim').style.background = `rgba(0,0,0,${0.22 * n})`;
  } else {
    render3D(t, null, {});
    $('glow').style.opacity = '0';
  }

  // notification
  const nIn = spring(t - NOTIF.at), nOut = span(t, NOTIF.out, NOTIF.out + 0.25);
  const notif = $('notif');
  notif.style.opacity = String(t < NOTIF.at ? 0 : clamp((t - NOTIF.at) / 0.12) * (1 - nOut));
  notif.style.transform = `translateY(${(1 - nIn) * -260 - nOut * 60}px) scale(${0.94 + 0.06 * nIn})`;
  notif.style.filter = nOut > 0 ? `blur(${nOut * 12}px)` : 'none';
  $('nT1').innerHTML = words('Your piece is out of the kiln', t - NOTIF.at - 0.15);
  $('nT2').innerHTML = words('clay · Celadon on speckled stoneware', t - NOTIF.at - 0.3);

  // sign-off
  const e = clamp((t - HERO_END - 0.15) / 0.35);
  $('end').style.opacity = String(easeOut(e));
  $('end').style.filter = `blur(${(1 - e) * 14}px)`;
  $('end').style.background = t >= HERO_END ? '#fff' : 'transparent';
  if (t >= HERO_END) $('end').style.opacity = '1';
  $('end').firstElementChild.style.opacity = String(easeOut(e));
  $('end').firstElementChild.style.transform = `scale(${0.94 + 0.06 * easeOut(e)})`;

  renderCursor(t);
}

async function init() {
  await Promise.all([
    document.fonts.load("100px 'Bagel Fat One'", WORD + 'a'),
    document.fonts.load("400 100px 'Schibsted Grotesk'"),
    document.fonts.load("500 100px 'Schibsted Grotesk'"),
    document.fonts.load("600 100px 'Schibsted Grotesk'"),
    document.fonts.load("700 100px 'Schibsted Grotesk'"),
    document.fonts.load("500 100px 'Martian Mono'"),
  ]);
  buildClay();
}

let frameNo = -1;
function frame(i) {
  if (i !== frameNo + 1) throw new Error(`frames must be sequential: got ${i} after ${frameNo}`);
  frameNo = i;
  render(i / FPS);
}

window.reel = { ready: init(), frame, fps: FPS, frames: Math.round(DURATION * FPS) };
