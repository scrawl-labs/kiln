// Screenshot promo/favicon.html and write the site icons into icons/.
//   node promo/favicon.mjs   (needs Playwright with Chromium, and Python with Pillow)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, ignoreHTTPSErrors: true });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
await page.route('http://kiln.local/**', (route) => {
  const file = path.join(root, decodeURIComponent(new URL(route.request().url()).pathname));
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
});
await page.goto('http://kiln.local/promo/favicon.html');
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
const master = path.join(out, 'icon-512.png');
await page.screenshot({ path: master, omitBackground: true });
await browser.close();

execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(master)}).convert('RGBA')
for name, s in [('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-32.png', 32)]:
    im.resize((s, s), Image.LANCZOS).save(${JSON.stringify(out)} + '/' + name)
im.save(${JSON.stringify(path.join(root, 'favicon.ico'))}, sizes=[(16, 16), (32, 32), (48, 48)])
`]);
console.log('wrote icons/ and favicon.ico');
