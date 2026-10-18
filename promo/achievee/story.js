// Morphing-UI story ad for Achievee, after the structure of a ride-hailing UI ad: a chat sets up the
// need, then one element keeps changing shape through the product. Frames must be rendered in order.
import { WORDMARK, HERO_BG } from './brand.js';

const FPS = 30, W = 1080, H = 1920, DURATION = 21;
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

// ------------------------------------------------------------ data (October 2026, today is the 18th)

// level 0..4 and tasks done, Oct 1 (Thu) … Oct 18 (Sun)
const DAYS = [[3, 4], [4, 5], [1, 1], [0, 0], [2, 3], [4, 5], [3, 4], [4, 6], [2, 3], [1, 2], [0, 0],
  [3, 4], [4, 5], [4, 6], [2, 3], [4, 5], [1, 2], [1, 1]];
const WEEK = DAYS.slice(11); // Mon 12 … Sun 18
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FILL = ['#ece6e0', '#ffb199', '#ffd980', '#9be3b4', '#ff9ec4'];

// ------------------------------------------------------------ script

const CHAT = [
  { at: 0.15, side: 'L', text: 'Busy week?' },
  { at: 0.95, side: 'R', typing: 1.45 },
  { at: 1.45, side: 'R', text: 'So busy.' },
  { at: 2.0, side: 'R', typing: 2.45 },
  { at: 2.45, side: 'R', text: 'But did I actually get anything done?' },
  { at: 3.05, side: 'L', typing: 3.6 },
  { at: 3.6, side: 'L', text: 'Check Achievee.', last: true },
];
const DETACH = 4.75;
const WHITE = [255, 255, 255], DARK = [15, 17, 21];
const KEYS = [
  { t: 5.15, d: 0.4, cx: 540, cy: 960, w: 420, h: 140, r: 70, bg: [28, 28, 30], line: 0, sh: 0 },
  { t: 5.6, d: 0.35, cx: 540, cy: 960, w: 340, h: 340, r: 76, bg: DARK, line: 0, sh: 0.22 },
  { t: 6.55, d: 0.3, cx: 540, cy: 960, w: 560, h: 210, r: 105, bg: DARK, line: 0, sh: 0.12 },
  { t: 6.95, d: 0.4, cx: 540, cy: 960, w: 800, h: 150, r: 75, bg: WHITE, line: 2, sh: 0.18 },
  { t: 8.15, d: 0.4, cx: 540, cy: 960, w: 980, h: 230, r: 36, bg: WHITE, line: 2, sh: 0.14 },
  { t: 9.65, d: 0.4, cx: 540, cy: 960, w: 980, h: 330, r: 44, bg: WHITE, line: 2, sh: 0.14 },
  { t: 11.55, d: 0.4, cx: 540, cy: 960, w: 980, h: 640, r: 44, bg: WHITE, line: 2, sh: 0.14 },
  { t: 13.0, d: 0.4, cx: 540, cy: 960, w: 980, h: 420, r: 44, bg: [249, 207, 224], line: 0, sh: 0.1 },
  { t: 14.4, d: 0.4, cx: 540, cy: 960, w: 980, h: 520, r: 44, bg: [205, 239, 196], line: 0, sh: 0.1 },
  { t: 15.9, d: 0.5, cx: 540, cy: 960, w: 1080, h: 1920, r: 0, bg: [251, 247, 243], line: 0, sh: 0 },
];
const HERO_END = 18.75;
const LAYERS = {
  bubble: [DETACH, 4.98, 0], pill: [5.0, 5.45], icon: [5.45, 6.35], gbtn: [6.8, 7.95], sum: [8.1, 9.45],
  week: [9.6, 11.32], det: [11.5, 12.85], diary: [12.95, 14.25], ins: [14.35, 15.75], month: [15.85, 99],
};
const CURSOR = [
  { show: 4.0, from: [980, 1700], at: 4.55, target: () => bubbleRect && [bubbleRect.x + bubbleRect.w * 0.6, bubbleRect.y + bubbleRect.h * 0.62], hide: 4.72 },
  { show: 7.05, from: [990, 1520], at: 7.5, target: () => [540 + 170, 960 + 30], hide: 7.75 },
  { show: 10.35, from: [990, 1500], at: 10.9, target: () => centerOf('wk2', 0.62, 0.6), hide: 11.2 },
];
const NOTIF = { at: 17.45, out: 18.55 };

// ------------------------------------------------------------ helpers

function words(text, lt, { stagger = 0.06, dur = 0.22, dy = 14 } = {}) {
  return text.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const e = easeOut(clamp((lt - (i / 2) * stagger) / dur));
    return `<span class="w" style="opacity:${e};filter:blur(${(1 - e) * 10}px);transform:translateY(${(1 - e) * dy}px)">${w}</span>`;
  }).join('');
}

const PETALS = [0, 1, 2, 3, 4, 5].map((i) => [22 + 11 * Math.cos((i * Math.PI) / 3), 22 + 11 * Math.sin((i * Math.PI) / 3)]);
function blobSVG(level, label) {
  const fill = FILL[level];
  const petals = PETALS.map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7.5"/>`).join('');
  const spark = level === 4 ? '<path class="spark" d="M38 2l1.6 4.4L44 8l-4.4 1.6L38 14l-1.6-4.4L32 8l4.4-1.6z"/>' : '';
  const lbl = label ? `<text x="22" y="22" text-anchor="middle" dominant-baseline="central" class="lbl"${level ? '' : ' style="fill:#8d8883"'}>${label}</text>` : '';
  return `<svg class="blob" viewBox="0 0 44 44"><g fill="${fill}">${petals}<circle cx="22" cy="22" r="11"/></g>${spark}${lbl}</svg>`;
}
// blob pop: scale with overshoot and a little twist, the way the app's day badges pop
function popStyle(t, at) {
  const k = spring(t - at);
  return `opacity:${clamp((t - at) / 0.08)};transform:scale(${0.35 + 0.65 * k}) rotate(${(1 - k) * -28}deg)`;
}
const CONFETTI = ['#ff9ec4', '#ffd980', '#9be3b4', '#8fb8ff', '#c3a6ff', '#ffb199'];
function confetti(t, at, scale) {
  const u = (t - at) / 0.9;
  if (u <= 0 || u >= 1) return '';
  const e = 1 - (1 - u) ** 3;
  return Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2, r = (38 + ((i * 29) % 26)) * scale;
    const shape = i % 3;
    const w = (shape === 1 ? 4 : shape === 0 ? 7 : 9) * scale * 0.7, h = (shape === 1 ? 10 : shape === 0 ? 7 : 5) * scale * 0.7;
    const o = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    return `<i style="width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;border-radius:${shape === 0 ? '50%' : '2px'};background:${CONFETTI[i % 6]};opacity:${o};transform:translate(${Math.cos(a) * r * e}px,${Math.sin(a) * r * e + 14 * scale * e}px) rotate(${i * 83 * e}deg)"></i>`;
  }).join('');
}
function centerOf(id, fx = 0.5, fy = 0.5) {
  const el = $(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [r.left + r.width * fx, r.top + r.height * fy];
}
const countUp = (t, a, b, to) => Math.round(to * easeOut(span(t, a, b)));
const CHECK = '<svg viewBox="0 0 18 18"><path d="M5 9.5l2.8 2.8L13 6.5" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ------------------------------------------------------------ chat

let bubbleRect = null;
function renderChat(t) {
  const chat = $('chat');
  if (t >= 5.2) { chat.style.display = 'none'; return; }
  const out = span(t, DETACH, 5.05);
  chat.style.opacity = String(1 - out);
  chat.style.filter = `blur(${out * 12}px)`;
  chat.style.transform = `translateY(${-out * 40}px)`;
  let html = `<div class="stamp" style="opacity:${clamp(t / 0.3)}">Sunday 9:41 PM</div>`;
  for (const m of CHAT) {
    if (t < m.at || (m.typing && t >= m.typing)) continue;
    const lt = t - m.at, k = spring(lt), h = (m.typing ? 76 : 107) * easeOut(clamp(lt / 0.22));
    const pressed = m.last && t >= 4.55 && t < DETACH;
    const style = `opacity:${m.last && t >= DETACH ? 0 : clamp(lt / 0.12)};transform:scale(${0.55 + 0.45 * k});filter:blur(${(1 - clamp(lt / 0.18)) * 8}px);${pressed ? 'background:#48474d;' : ''}`;
    const align = m.side === 'L' ? 'flex-start' : 'flex-end';
    const inner = m.typing
      ? `<div class="dots">${[0, 1, 2].map((d) => `<i style="opacity:${0.35 + 0.65 * Math.max(0, Math.sin(t * 7 - d * 0.9))}"></i>`).join('')}</div>`
      : words(m.text, lt - 0.05);
    html += `<div style="height:${h}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:${align}"><div class="b ${m.side}" ${m.last ? 'id="lastB"' : ''} style="${m.typing ? 'padding:0;' : ''}${style}">${inner}</div></div>`;
  }
  $('chatCol').innerHTML = html;
  const lb = $('lastB');
  if (lb && t < DETACH) { const r = lb.getBoundingClientRect(); bubbleRect = { x: r.left, y: r.top, w: r.width, h: r.height }; }
}

// ------------------------------------------------------------ hero

let LOGO = '';
const G = '<svg width="58" height="58" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"/><path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"/></svg>';

function buildHero() {
  $('hero').innerHTML = `
    <div class="k" data-l="bubble"><span style="font:400 46px/1.2 var(--f);color:#fff;white-space:nowrap">Check Achievee.</span></div>
    <div class="k pill-t" data-l="pill" id="lPill"></div>
    <div class="k" data-l="icon" style="width:340px;height:340px">${LOGO}</div>
    <div class="k gbtn" data-l="gbtn">${G}<span id="lG"></span></div>
    <div class="k sum" data-l="sum">
      <div><dt>Completion</dt><dd id="s1"></dd></div><div><dt>Done</dt><dd id="s2"></dd></div><div><dt>Streak</dt><dd id="s3"></dd></div></div>
    <div class="k week" data-l="week"><div class="hd">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div><div class="row" id="wkRow"></div></div>
    <div class="k det" data-l="det">
      <h2 id="dH"></h2><div class="big" id="dBig"></div><div class="meter"><i id="dMeter"></i></div>
      <div class="tasks" id="dTasks"></div></div>
    <div class="k diary" data-l="diary"><div class="lab">Diary · Wed, Oct 14</div><div class="mood" id="mood"></div><b id="dTxt"></b><div class="chips" id="chips"></div></div>
    <div class="k ins" data-l="ins"><div class="lab" style="color:#557153">Patterns in your records</div><div class="t1" id="iT"></div>
      <div class="bars" id="bars"></div><small>These go together in your records; they do not say one causes the other.</small></div>
    <div class="month" data-l="month"><h4>October 2026</h4>
      <div class="sum"><div><dt>Completion</dt><dd>87%</dd></div><div><dt>Done</dt><dd>59 <small>/ 68</small></dd></div><div><dt>Streak</dt><dd>7 <small>days</small></dd></div></div>
      <div class="hd">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div><div class="grid" id="mGrid"></div></div>`;
}

let heroBuilt = false;
const prev = { cx: 0, cy: 0, w: 0, h: 0 };
function heroShape(t) {
  if (t < DETACH || !bubbleRect) return null;
  const k0 = { cx: bubbleRect.x + bubbleRect.w / 2, cy: bubbleRect.y + bubbleRect.h / 2, w: bubbleRect.w, h: bubbleRect.h, r: 46, bg: [72, 71, 77], line: 0, sh: 0 };
  let from = k0, to = k0, u = 1;
  KEYS.forEach((k, i) => { if (t >= k.t - k.d) { from = i ? KEYS[i - 1] : k0; to = k; u = eio(span(t, k.t - k.d, k.t)); } });
  const s = {};
  for (const p of ['cx', 'cy', 'w', 'h', 'r', 'line', 'sh']) s[p] = lerp(from[p], to[p], u);
  s.bg = mix3(from.bg, to.bg, u);
  s.morph = u < 1 ? Math.sin(Math.PI * u) : 0;
  return s;
}
function layerAlpha(t, name) {
  const [a, b, fin = 0.16] = LAYERS[name];
  if (t < a || t > b + 0.16) return 0;
  return Math.min(fin ? clamp((t - a) / fin) : 1, 1 - clamp((t - b) / 0.16));
}

function renderHero(t) {
  const hero = $('hero');
  const s = t < HERO_END ? heroShape(t) : null;
  if (!s) { hero.style.display = 'none'; return; }
  if (!heroBuilt) { buildHero(); heroBuilt = true; }
  hero.style.display = 'block';
  const v = Math.hypot(s.cx - prev.cx, s.cy - prev.cy) + 0.35 * Math.hypot(s.w - prev.w, s.h - prev.h);
  const vx = s.cx - prev.cx + (s.w - prev.w) * 0.2;
  Object.assign(prev, { cx: s.cx, cy: s.cy, w: s.w, h: s.h });
  const flat = 1 - span(s.w, 990, 1080);
  const blur = s.w >= 1079 ? 0 : Math.min(14, v * 0.09);
  let scale = 1, bg = s.bg;
  if (t >= 4.55 && t < DETACH + 0.05) bg = [72, 71, 77];
  if (t >= 7.5 && t < 7.68) { scale = 0.96; bg = [241, 241, 241]; }
  Object.assign(hero.style, {
    left: `${s.cx - s.w / 2}px`, top: `${s.cy - s.h / 2}px`, width: `${s.w}px`, height: `${s.h}px`,
    borderRadius: `${s.r}px`, background: rgb(bg),
    boxShadow: `0 ${34 * s.sh}px ${100 * s.sh + 1}px rgba(90,40,60,${s.sh * 1.4}), inset 0 0 0 ${s.line}px rgba(60,40,30,.12)`,
    filter: blur > 0.3 ? `blur(${blur}px)` : 'none',
    transform: `perspective(1600px) rotateY(${clamp(vx * 0.25, -10, 10) * flat}deg) rotateZ(${-2.2 * s.morph * flat}deg) scale(${scale})`,
  });

  for (const el of hero.children) {
    const name = el.dataset.l, a = layerAlpha(t, name);
    el.style.display = a > 0.001 ? '' : 'none';
    if (a <= 0.001) continue;
    el.style.opacity = String(a);
    el.style.filter = a < 1 ? `blur(${(1 - a) * 12}px)` : 'none';
    if (name !== 'month') {
      const shift = (1 - a) * (t > LAYERS[name][1] ? -26 : 26);
      el.style.transform = `translate(-50%, calc(-50% + ${shift}px)) scale(${0.96 + 0.04 * a})`;
    }
  }

  $('lPill').innerHTML = words('Achievee.', t - 5.0);
  $('lG').innerHTML = words('Continue with Google', t - 6.85);
  $('s1').innerHTML = `${countUp(t, 8.25, 8.95, 87)}%`;
  $('s2').innerHTML = `${countUp(t, 8.3, 9.0, 59)} <small>/ 68</small>`;
  $('s3').innerHTML = `${countUp(t, 8.35, 8.9, 7)} <small>days</small>`;

  // the week blooms one badge at a time; Wednesday gets picked
  $('wkRow').innerHTML = WEEK.map(([lv, n], i) => {
    const at = 9.75 + i * 0.12;
    const sel = i === 2 && t >= 10.9 ? spring(t - 10.9) : 0;
    const press = i === 2 && t >= 10.9 && t < 11.0 ? 0.9 : 1;
    const extra = sel ? ` scale(${press * (1 + 0.12 * Math.sin(Math.min(1, (t - 10.9) / 0.5) * Math.PI))})` : '';
    return `<span id="wk${i}"><span style="display:block;width:100%;height:100%;${popStyle(t, at)}${extra}">${blobSVG(lv, n)}</span>`
      + `<span class="confetti" style="position:absolute;left:50%;top:50%">${i === 2 ? confetti(t, 10.92, 2.1) : ''}${lv === 4 && i !== 2 ? confetti(t, at + 0.05, 1.5) : ''}</span></span>`;
  }).join('');

  $('dH').innerHTML = `Wed, Oct 14<small>6 tasks</small>`;
  $('dBig').innerHTML = `${countUp(t, 11.6, 12.1, 6)}<span> / 6</span>`;
  $('dMeter').style.width = `${ease(span(t, 11.65, 12.25)) * 100}%`;
  $('dTasks').innerHTML = ['Team standup', 'Ship onboarding copy', 'Lunch with Jin', 'Workout'].map((x, i) => {
    const on = t >= 11.75 + i * 0.16;
    const k = on ? spring(t - 11.75 - i * 0.16) : 0;
    return `<div style="color:${on ? '#1c1b1f' : ''}"><span class="check" style="${on ? `background:#4a5bf0;border-color:#4a5bf0;transform:scale(${0.6 + 0.4 * k})` : ''}">${on ? CHECK : ''}</span>${x}</div>`;
  }).join('');

  $('mood').innerHTML = [0, 1, 2, 3, 4].map((i) => {
    const on = i < 4 && t >= 13.15 + i * 0.1;
    return `<i style="${on ? `background:#ff6fa8;transform:scale(${0.6 + 0.4 * spring(t - 13.15 - i * 0.1)})` : ''}"></i>`;
  }).join('');
  $('dTxt').innerHTML = words('Good day. Finished everything!', t - 13.4);
  $('chips').innerHTML = ['proud', 'relieved', 'grateful'].map((x, i) => {
    const at = 13.75 + i * 0.13;
    return t < at ? '' : `<span style="${popStyle(t, at)}">${x}</span>`;
  }).join('');

  $('iT').innerHTML = words('Mood was 0.8 points higher on exercise days', t - 14.5, { stagger: 0.045 });
  $('bars').innerHTML = [['Exercise days', 4.3, '#4fbf7d'], ['Other days', 3.5, '#a9d3a2']].map(([l, v, c], i) => {
    const k = easeOut(span(t, 14.75 + i * 0.12, 15.3 + i * 0.12));
    return `<div><span>${l}</span><i style="width:${(v / 5) * 100 * k}%;background:${c}"></i><em>${(v * k).toFixed(1)}</em></div>`;
  }).join('');

  // the whole month blooms in a diagonal wave
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const day = i - 2; // Oct 1 is a Thursday
    if (day < 1 || day > 31) { cells.push('<span></span>'); continue; }
    const [lv, n] = DAYS[day - 1] ?? [0, ''];
    const at = 16.2 + ((i % 7) + Math.floor(i / 7)) * 0.07;
    cells.push(`<span><span style="display:block;width:100%;height:100%;${popStyle(t, at)}">${blobSVG(lv, n || (day <= 18 ? '' : ''))}</span>`
      + `<span class="confetti" style="position:absolute;left:50%;top:50%">${lv === 4 ? confetti(t, at + 0.05, 1.6) : ''}</span></span>`);
  }
  $('mGrid').innerHTML = cells.join('');
}

// ------------------------------------------------------------ cursor, notification, end

function renderCursor(t) {
  const el = $('cursor');
  let pos = null, alpha = 0, press = false;
  for (const c of CURSOR) {
    if (t < c.show || t > c.hide + 0.15) continue;
    const target = c.target();
    if (!target) continue;
    const m = eio(span(t, c.show, c.at - 0.08));
    pos = [lerp(c.from[0], target[0], m), lerp(c.from[1], target[1], m)];
    alpha = Math.min(clamp((t - c.show) / 0.15), 1 - clamp((t - c.hide) / 0.15));
    press = t >= c.at && t < c.at + 0.13;
  }
  if (!pos) { el.style.opacity = '0'; return; }
  el.style.opacity = String(alpha);
  el.style.transform = `translate(${pos[0] - 8}px, ${pos[1] - 4}px) scale(${press ? 0.84 : 1})`;
}

const FLOATERS = [[110, 520, 150, 4, 5, -10, 0], [180, 1250, 110, 3, 4, 8, 1.2], [880, 420, 120, 2, 3, 10, 0.6], [900, 1310, 170, 4, 6, -8, 1.8]];
function render(t) {
  // background: chat black → grey → the landing's petal gradient
  let c = [0, 0, 0];
  if (t >= 4.85) c = mix3([0, 0, 0], [130, 122, 126], span(t, 4.85, 5.0));
  $('bg').style.background = rgb(c);
  $('brandBg').style.opacity = String(span(t, 5.3, 5.42));

  renderChat(t);
  renderHero(t);

  const nIn = spring(t - NOTIF.at), nOut = span(t, NOTIF.out, NOTIF.out + 0.25);
  const notif = $('notif');
  notif.style.opacity = String(t < NOTIF.at ? 0 : clamp((t - NOTIF.at) / 0.12) * (1 - nOut));
  notif.style.transform = `translateY(${(1 - nIn) * -260 - nOut * 60}px) scale(${0.94 + 0.06 * nIn})`;
  notif.style.filter = nOut > 0 ? `blur(${nOut * 12}px)` : 'none';
  $('nT1').innerHTML = words('Your weekly review is ready', t - NOTIF.at - 0.15);
  $('nT2').innerHTML = words('26 tasks done · 7-day streak · mostly proud', t - NOTIF.at - 0.3);
  const n = span(t, NOTIF.at, NOTIF.at + 0.3) * (1 - nOut);
  $('dim').style.background = `rgba(40,20,30,${0.18 * n})`;
  $('dim').style.backdropFilter = n > 0.01 ? `blur(${n * 8}px)` : 'none';

  const e = clamp((t - HERO_END - 0.1) / 0.4);
  const end = $('end');
  end.style.opacity = t >= HERO_END ? '1' : '0';
  if (t >= HERO_END) {
    end.innerHTML = FLOATERS.map(([x, y, s, lv, num, r, d], i) => {
      const k = spring(t - HERO_END - 0.2 - i * 0.08);
      const bob = Math.sin((t + d) * 1.05) * 12;
      return `<span class="floater" style="left:${x - s / 2}px;top:${y - s / 2 + bob}px;width:${s}px;height:${s}px;opacity:${clamp(k * 3)};transform:rotate(${r}deg) scale(${k})">${blobSVG(lv, num)}</span>`;
    }).join('')
      + `<svg class="wm" viewBox="${WORDMARK.viewBox}" style="opacity:${easeOut(e)};filter:blur(${(1 - e) * 14}px);transform:scale(${0.94 + 0.06 * easeOut(e)})"><path fill="currentColor" transform="${WORDMARK.transform}" d="${WORDMARK.d}"/></svg>`
      + `<p style="opacity:${easeOut(clamp((t - HERO_END - 0.45) / 0.4))}">Capture your days, beautifully.</p>`;
  }
  renderCursor(t);
}

async function init() {
  $('brandBg').style.background = HERO_BG;
  LOGO = await (await fetch('assets/logo.svg')).text();
  LOGO = LOGO.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
  $('nIcon').innerHTML = LOGO.replace('width:100%;height:100%', 'width:54px;height:54px;border-radius:13px');
  await Promise.all([
    document.fonts.load("500 40px 'Pretendard Variable'"), document.fonts.load("700 40px 'Pretendard Variable'"),
    document.fonts.load("700 40px 'Dunggeun'"),
  ]);
}

let frameNo = -1;
function frame(i) {
  if (i !== frameNo + 1) throw new Error(`frames must be sequential: got ${i} after ${frameNo}`);
  frameNo = i;
  render(i / FPS);
}

window.reel = { ready: init(), frame, fps: FPS, frames: Math.round(DURATION * FPS) };
