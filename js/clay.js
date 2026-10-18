// Clay body: a signed scalar field on a voxel grid (negative = clay),
// built from rasterised type and polygonised with surface nets.

const INF = 1e20;

// ---------- 2D signed distance from canvas alpha (Felzenszwalb EDT) ----------

function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

function signedDistance(alpha, w, h) {
  const len = w * h;
  const outer = new Float64Array(len).fill(INF);
  const inner = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const a = alpha[i] / 255;
    if (a === 0) continue;
    if (a === 1) { outer[i] = 0; inner[i] = INF; }
    else {
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
  return out; // pixels, negative inside
}

// ---------- small value noise for hand-made lumps ----------

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------- the clay ----------

export class Clay {
  constructor({ budget = 340000 } = {}) {
    this.budget = budget;
    this.halfT = 0.15;      // half thickness of a coil, in em
    this.letters = [];
  }

  // Lay out the word, rasterise each glyph with a slight hand-set wobble,
  // and prepare everything that does not change while the letters grow.
  setWord(word, fontFamily, seed = 1) {
    const chars = [...word];
    this.word = word;
    const rnd = mulberry(seed * 9301 + chars.length * 49297);

    const measure = document.createElement('canvas').getContext('2d');
    const probe = 100;
    measure.font = `${probe}px ${fontFamily}`;
    const advances = chars.map((c) => measure.measureText(c).width / probe);
    const track = -0.02;
    const totalW = Math.max(0.6, advances.reduce((a, b) => a + b, 0) + track * (chars.length - 1));
    const m = measure.measureText(word || 'H');
    const asc = Math.max(0.72, (m.actualBoundingBoxAscent || 72) / probe);
    const desc = Math.max(0.02, (m.actualBoundingBoxDescent || 2) / probe);

    // Pick a voxel size that fits the cell budget.
    const pad = 0.34;
    const zHalf = this.halfT + 0.26;
    const W = totalW + pad * 2, H = asc + desc + pad * 2, D = zHalf * 2;
    let vs = Math.cbrt((W * H * D) / this.budget);
    vs = Math.max(vs, 1 / 90);
    const nx = Math.ceil(W / vs) + 1, ny = Math.ceil(H / vs) + 1, nz = Math.ceil(D / vs) + 1;
    Object.assign(this, { vs, nx, ny, nz });
    this.x0 = -W / 2; this.y0 = -desc - pad; this.z0 = -zHalf;
    this.baseY = 0; this.capY = asc; this.descY = -desc;
    this.width = totalW;

    // Rasterise at 2x the voxel resolution.
    const ss = 2, ppu = ss / vs;
    const cw = Math.ceil(W * ppu), ch = Math.ceil(H * ppu);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.font = `${ppu}px ${fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    this.letters = [];
    let cursor = -totalW / 2;
    chars.forEach((c, i) => {
      const adv = advances[i];
      const cx = cursor + adv / 2;
      const rot = (rnd() - 0.5) * 0.09;
      const dy = (rnd() - 0.5) * 0.035;
      const sc = 1 + (rnd() - 0.5) * 0.05;
      ctx.save();
      ctx.translate((cx - this.x0) * ppu, (H - (0 - this.y0)) * ppu - dy * ppu);
      ctx.translate(0, -asc * 0.45 * ppu);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.translate(0, asc * 0.45 * ppu);
      ctx.fillText(c, 0, 0);
      ctx.restore();
      this.letters.push({ char: c, cx, grow: 0, target: 0, vel: 0 });
      cursor += adv + track;
    });

    const img = ctx.getImageData(0, 0, cw, ch).data;
    const alpha = new Uint8ClampedArray(cw * ch);
    for (let i = 0; i < cw * ch; i++) alpha[i] = img[i * 4 + 3];
    const sd = signedDistance(alpha, cw, ch);

    // Sample to voxel columns (world units, negative inside).
    const d2 = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const py = (H - j * vs) * ppu; // canvas y grows downward
      for (let i = 0; i < nx; i++) {
        const px = i * vs * ppu;
        d2[i + j * nx] = bilinear(sd, cw, ch, px - 0.5, py - 0.5) / ppu;
      }
    }
    this.d2 = d2;

    // Column → letter weights for per-letter growth.
    this.colLetter = new Uint8Array(nx);
    this.colMix = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * vs;
      let best = 0, bd = INF, second = 0, sd2 = INF;
      this.letters.forEach((L, li) => {
        const d = Math.abs(x - L.cx);
        if (d < bd) { second = best; sd2 = bd; best = li; bd = d; }
        else if (d < sd2) { second = li; sd2 = d; }
      });
      this.colLetter[i] = best;
      this.colMix[i] = second;
    }
    this.colW = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * vs;
      const a = this.letters[this.colLetter[i]], b = this.letters[this.colMix[i]];
      if (!a || !b || a === b) { this.colW[i] = 0; continue; }
      const da = Math.abs(x - a.cx), db = Math.abs(x - b.cx);
      const t = da / (da + db); // 0 at a, 0.5 at boundary
      this.colW[i] = smoothstep(0.32, 0.5, t) * 0.5;
    }

    // Lumpy hand-made noise, fixed per word.
    const N = nx * ny * nz;
    this.noise = new Float32Array(N);
    const off = rnd() * 100;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * vs, y = this.y0 + j * vs, z = this.z0 + k * vs;
      this.noise[i + nx * (j + ny * k)] =
        vnoise(x * 3.2 + off, y * 3.2, z * 3.2) * 0.016 +
        vnoise(x * 9 + off, y * 9, z * 9) * 0.006;
    }
    this.field = new Float32Array(N);
    this.edited = false;
    return this;
  }

  // Rebuild the field from the type at the current per-letter growth.
  build() {
    const { nx, ny, nz, vs, d2, field, noise, letters } = this;
    const halfT = this.halfT;
    for (let i = 0; i < nx; i++) {
      const a = letters[this.colLetter[i]], b = letters[this.colMix[i]];
      const ga = a ? a.grow : 0, gb = b ? b.grow : ga;
      const g = ga + (gb - ga) * this.colW[i];
      const gc = Math.max(0, g);
      const thin = (1 - Math.min(gc, 1)) * 0.11;
      const ht = halfT * gc;
      const R = Math.max(ht, 1e-4);
      for (let j = 0; j < ny; j++) {
        const d = d2[i + j * nx] + thin - 0.012;
        let h = 0;
        if (d < 0) {
          const s = Math.min(-d / R, 1);
          h = ht * Math.sqrt(s * (2 - s));
        }
        for (let k = 0; k < nz; k++) {
          const z = this.z0 + k * vs;
          const idx = i + nx * (j + ny * k);
          let f = Math.max(d, Math.abs(z) - h);
          if (gc <= 0.001) f = Math.max(f, 0.02);
          field[idx] = f + noise[idx] * Math.min(gc, 1);
        }
      }
    }
    this.sealBorder();
  }

  sealBorder() {
    const { nx, ny, nz, field } = this;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) {
        field[i + nx * (j + ny * k)] = 1;
      }
    }
  }

  // ---------- sampling & picking ----------

  sample(x, y, z) {
    const { nx, ny, nz, vs } = this;
    const gx = (x - this.x0) / vs, gy = (y - this.y0) / vs, gz = (z - this.z0) / vs;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= nx - 1 || gy >= ny - 1 || gz >= nz - 1) return 1;
    const i = gx | 0, j = gy | 0, k = gz | 0;
    const fx = gx - i, fy = gy - j, fz = gz - k;
    const F = this.field, sy = nx, sz = nx * ny;
    const b = i + j * sy + k * sz;
    const c00 = F[b] * (1 - fx) + F[b + 1] * fx;
    const c10 = F[b + sy] * (1 - fx) + F[b + sy + 1] * fx;
    const c01 = F[b + sz] * (1 - fx) + F[b + sz + 1] * fx;
    const c11 = F[b + sy + sz] * (1 - fx) + F[b + sy + sz + 1] * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }

  // Ray in local space → first surface hit, or null.
  raycast(o, d) {
    const { vs } = this;
    const lo = [this.x0, this.y0, this.z0];
    const hi = [this.x0 + (this.nx - 1) * vs, this.y0 + (this.ny - 1) * vs, this.z0 + (this.nz - 1) * vs];
    let t0 = 0, t1 = 100;
    for (let a = 0; a < 3; a++) {
      const inv = 1 / (d[a] || 1e-9);
      let ta = (lo[a] - o[a]) * inv, tb = (hi[a] - o[a]) * inv;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    let t = t0, prev = t0, fPrev = 1;
    while (t < t1) {
      const f = this.sample(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
      if (f < 0) {
        let a = prev, b = t;
        for (let n = 0; n < 8; n++) {
          const m = (a + b) / 2;
          if (this.sample(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m) < 0) b = m; else a = m;
        }
        return [o[0] + d[0] * b, o[1] + d[1] * b, o[2] + d[2] * b];
      }
      prev = t; fPrev = f;
      t += Math.min(Math.max(f * 0.6, vs * 0.35), vs * 3);
    }
    return null;
  }

  // ---------- hand tools ----------

  region(c, r, fn) {
    const { nx, ny, nz, vs, field } = this;
    const i0 = Math.max(1, Math.floor((c[0] - r - this.x0) / vs));
    const i1 = Math.min(nx - 2, Math.ceil((c[0] + r - this.x0) / vs));
    const j0 = Math.max(1, Math.floor((c[1] - r - this.y0) / vs));
    const j1 = Math.min(ny - 2, Math.ceil((c[1] + r - this.y0) / vs));
    const k0 = Math.max(1, Math.floor((c[2] - r - this.z0) / vs));
    const k1 = Math.min(nz - 2, Math.ceil((c[2] + r - this.z0) / vs));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + i * vs, y = this.y0 + j * vs, z = this.z0 + k * vs;
      const idx = i + nx * (j + ny * k);
      field[idx] = fn(field[idx], x, y, z, idx);
    }
    this.edited = true;
  }

  // Thumb press: a shallow dimple with a soft rim of displaced clay.
  press(p, dir, r) {
    const c = [p[0] - dir[0] * r * 0.62, p[1] - dir[1] * r * 0.62, p[2] - dir[2] * r * 0.62];
    this.region(c, r * 1.7, (f, x, y, z) => {
      const dist = Math.hypot(x - c[0], y - c[1], z - c[2]);
      const ring = Math.exp(-(((dist - r * 1.12) / (r * 0.28)) ** 2));
      return smax(f, r - dist, r * 0.35) - ring * 0.0035 * (f > -0.03 && f < 0.03 ? 1 : 0);
    });
  }

  // Pinch on a small lump of fresh clay.
  add(p, dir, r) {
    const c = [p[0] + dir[0] * r * 0.25, p[1] + dir[1] * r * 0.25, p[2] + dir[2] * r * 0.25];
    const rr = r * 0.8;
    this.region(c, rr * 1.8, (f, x, y, z) => {
      const dist = Math.hypot(x - c[0], y - c[1], z - c[2]);
      return smin(f, dist - rr, rr * 0.6);
    });
  }

  // Loop tool: a narrow groove along the stroke.
  carve(a, b, dir, r) {
    const w = Math.max(r * 0.2, this.vs * 1.4);
    const sink = w * 0.35;
    const A = [a[0] + dir[0] * sink, a[1] + dir[1] * sink, a[2] + dir[2] * sink];
    const B = [b[0] + dir[0] * sink, b[1] + dir[1] * sink, b[2] + dir[2] * sink];
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    const reach = Math.sqrt(L2) / 2 + w * 2;
    this.region(mid, reach, (f, x, y, z) => {
      const ap = [x - A[0], y - A[1], z - A[2]];
      const t = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2));
      const dist = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
      return smax(f, w - dist, w * 0.5);
    });
  }

  // Wet finger: relax the surface toward its neighbourhood average.
  smooth(p, r) {
    const { nx, ny, field } = this;
    const sy = nx, sz = nx * ny;
    const src = field.slice();
    this.region(p, r, (f, x, y, z, idx) => {
      const dist = Math.hypot(x - p[0], y - p[1], z - p[2]);
      const w = Math.max(0, 1 - dist / r) * 0.6;
      if (w <= 0) return f;
      const avg = (src[idx - 1] + src[idx + 1] + src[idx - sy] + src[idx + sy] + src[idx - sz] + src[idx + sz]) / 6;
      return f + (avg - f) * w;
    });
  }

  // ---------- surface nets ----------

  mesh() {
    const { nx, ny, nz, vs, field } = this;
    const sy = nx, sz = nx * ny;
    const cellIdx = this._cellIdx && this._cellIdx.length === nx * ny * nz
      ? this._cellIdx : (this._cellIdx = new Int32Array(nx * ny * nz));
    let pos = this._pos || (this._pos = new Float32Array(60000 * 3));
    let ind = this._ind || (this._ind = new Uint32Array(120000 * 6));
    let vc = 0, ic = 0;
    const corner = new Float32Array(8);
    const offs = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
    const edges = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [0, 2], [1, 3], [4, 6], [5, 7],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const cp = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];

    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const b = i + j * sy + k * sz;
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = field[b + offs[c]];
        corner[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;

      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const [p, q] = edges[e];
        const ip = (mask >> p) & 1, iq = (mask >> q) & 1;
        if (ip === iq) continue;
        const t = corner[p] / (corner[p] - corner[q]);
        ax += cp[p][0] + (cp[q][0] - cp[p][0]) * t;
        ay += cp[p][1] + (cp[q][1] - cp[p][1]) * t;
        az += cp[p][2] + (cp[q][2] - cp[p][2]) * t;
        n++;
      }
      if (vc * 3 + 3 > pos.length) { const g = new Float32Array(pos.length * 2); g.set(pos); pos = this._pos = g; }
      pos[vc * 3] = this.x0 + (i + ax / n) * vs;
      pos[vc * 3 + 1] = this.y0 + (j + ay / n) * vs;
      pos[vc * 3 + 2] = this.z0 + (k + az / n) * vs;
      cellIdx[b] = vc++;

      if (ic + 18 > ind.length) { const g = new Uint32Array(ind.length * 2); g.set(ind); ind = this._ind = g; }
      const inside = mask & 1;
      // edge along x from corner 0 → cells (j,k),(j-1,k),(j-1,k-1),(j,k-1)
      if (j > 0 && k > 0 && ((mask >> 1) & 1) !== inside) {
        ic = quad(ind, ic, cellIdx[b], cellIdx[b - sy], cellIdx[b - sy - sz], cellIdx[b - sz], inside);
      }
      // edge along y → cells (i,k),(i,k-1),(i-1,k-1),(i-1,k)
      if (i > 0 && k > 0 && ((mask >> 2) & 1) !== inside) {
        ic = quad(ind, ic, cellIdx[b], cellIdx[b - sz], cellIdx[b - 1 - sz], cellIdx[b - 1], inside);
      }
      // edge along z → cells (i,j),(i-1,j),(i-1,j-1),(i,j-1)
      if (i > 0 && j > 0 && ((mask >> 4) & 1) !== inside) {
        ic = quad(ind, ic, cellIdx[b], cellIdx[b - 1], cellIdx[b - 1 - sy], cellIdx[b - sy], inside);
      }
    }
    return { positions: pos.subarray(0, vc * 3), indices: ind.subarray(0, ic), vertexCount: vc };
  }
}

function quad(ind, ic, a, b, c, d, flip) {
  if (flip) {
    ind[ic++] = a; ind[ic++] = b; ind[ic++] = c;
    ind[ic++] = a; ind[ic++] = c; ind[ic++] = d;
  } else {
    ind[ic++] = a; ind[ic++] = c; ind[ic++] = b;
    ind[ic++] = a; ind[ic++] = d; ind[ic++] = c;
  }
  return ic;
}

function bilinear(arr, w, h, x, y) {
  x = Math.min(Math.max(x, 0), w - 1.001);
  y = Math.min(Math.max(y, 0), h - 1.001);
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j;
  const a = arr[i + j * w], b = arr[i + 1 + j * w], c = arr[i + (j + 1) * w], d = arr[i + 1 + (j + 1) * w];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
