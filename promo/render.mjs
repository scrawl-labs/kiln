// Render promo/reel.html to a 1080×1920 H.264 mp4.
//   node promo/render.mjs --out kiln-reel.mp4 [--frames dir] [--only 0,90,200] [--audio track.wav]
// Needs Playwright with a Chromium build and ffmpeg on PATH.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const out = path.resolve(arg('out', 'kiln-reel.mp4'));
const framesDir = path.resolve(arg('frames', path.join(path.dirname(out), 'reel-frames')));
const only = arg('only') ? new Set(arg('only').split(',').map(Number)) : null;
const audio = arg('audio');
fs.mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
await page.route('http://kiln.local/**', (route) => {
  const file = path.join(root, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
});
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://kiln.local/promo/reel.html', { waitUntil: 'networkidle' });
await page.evaluate(() => window.reel.ready);
const total = await page.evaluate(() => window.reel.frames);

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((n) => window.reel.frame(n), i);
  if (only && !only.has(i)) continue;
  const file = path.join(framesDir, `f${String(i).padStart(4, '0')}.png`);
  for (let attempt = 1; ; attempt++) {
    try { await page.screenshot({ path: file, timeout: 60000 }); break; } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`frame ${i}: screenshot retry ${attempt}`);
    }
  }
  if (i % 30 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (only && i >= Math.max(...only)) break;
}
await browser.close();

if (!only) {
  const input = ['-y', '-framerate', '30', '-i', path.join(framesDir, 'f%04d.png')];
  if (audio) input.push('-i', audio);
  execFileSync('ffmpeg', [
    ...input,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-movflags', '+faststart', out,
  ], { stdio: 'inherit' });
  console.log(`wrote ${out}`);
}
