// Node-side renderer for the story: rasterises src/story/scenes.js with a small
// 2D context mock (no browser needed) and writes PNG frames plus a text-draw log.
//
//   node scripts/render-greenscreen.mjs [outDir] [maxFrames]
//
// The browser exporter (scripts/export.mjs) needs headless Chromium, which is
// unavailable in some environments, so this script reuses the story's pure
// rendering functions directly. Shapes are rasterised here; the text draws are
// recorded to outDir/texts.json and overlaid with fonts by scripts/greenscreen_texts.py.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { setContext, renderAt, DURATION, FPS } from '../src/story/scenes.js';
import { W, H } from '../src/story/prim.js';

// enable greenscreen mode (?greenscreen) in scenes.js
globalThis.window = { location: { search: '?greenscreen' } };

// ---------------------------------------------------------------- png writer
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = _crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const buf = Buffer.alloc(8 + data.length + 4);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'ascii');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, buf.length - 4)), buf.length - 4);
  return buf;
}
function writePng(file, w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1);
    raw[off] = 0; // filter type "none"
    for (let i = 0; i < stride; i++) raw[off + 1 + i] = rgba[y * stride + i];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  writeFileSync(
    file,
    Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
  );
}

// ---------------------------------------------------------------- colour helpers
function hexToRgb(c) {
  const s = String(c ?? '').trim();
  let m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s);
  if (!m) {
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(s);
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    return [255, 255, 255];
  }
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function fontSize(font) {
  return parseFloat(/\d+(?:\.\d+)?/.exec(String(font || ''))?.[0] || '16');
}

// ---------------------------------------------------------------- transform math (canvas-like: column vectors, m * p)
const tTranslate = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const tRotate = (deg) => {
  const r = (deg * Math.PI) / 180;
  return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 };
};
const tScale = (x, y) => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
// m * n: n is applied to points first
function mul(m, n) {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}
function apply(m, x, y) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}
function det(m) {
  return m.a * m.d - m.b * m.c;
}

// ---------------------------------------------------------------- mock 2D context
class MockCtx {
  constructor() {
    this.width = W;
    this.height = H;
    this.buf = new Uint8Array(W * H * 4);
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this._M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this._stack = [];
    this._subpaths = [];
    this._cur = null;
    this.texts = [];
    this._frame = 0;
  }
  save() {
    this._stack.push({
      M: { ...this._M },
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
    });
  }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._M = { ...s.M };
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.globalAlpha = s.globalAlpha;
  }
  translate(x, y) {
    this._M = mul(tTranslate(x, y), this._M);
  }
  rotate(deg) {
    this._M = mul(tRotate(deg), this._M);
  }
  scale(x, y = x) {
    this._M = mul(tScale(x, y), this._M);
  }
  setTransform(a, b, c, d, e, f) {
    this._M = { a, b, c, d, e, f };
  }
  getTransform() {
    return { ...this._M };
  }
  _abs(x, y) {
    const p = apply(this._M, x, y);
    return [p.x, p.y];
  }
  _pix(x, y, rgb) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    this.buf[i] = rgb[0];
    this.buf[i + 1] = rgb[1];
    this.buf[i + 2] = rgb[2];
    this.buf[i + 3] = Math.round((this.globalAlpha || 0) * 255);
  }
  _fillPoly(pts, rgb) {
    if (pts.length < 3) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const y0 = Math.max(0, Math.ceil(minY - 0.5));
    const y1 = Math.min(H - 1, Math.floor(maxY - 0.5));
    const x0 = Math.max(0, Math.ceil(minX - 0.5));
    const x1 = Math.min(W - 1, Math.floor(maxX - 0.5));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= py && by > py) || (by <= py && ay > py)) {
          xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(x0, Math.ceil(xs[i] - 0.5));
        const xb = Math.min(x1, Math.floor(xs[i + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this._pix(x, y, rgb);
      }
    }
  }
  _strokePoly(rgb, w) {
    for (const sp of this._subpaths) {
      const p = sp.pts;
      if (p.length < 2) continue;
      let minY = Infinity, maxY = -Infinity;
      for (const [, py] of p) {
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      const y0 = Math.max(0, Math.floor(minY - w - 1));
      const y1 = Math.min(H - 1, Math.ceil(maxY + w + 1));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        const xs = [];
        for (let i = 0; i < p.length; i++) {
          const [ax, ay] = p[i];
          const [bx, by] = p[(i + 1) % p.length];
          if ((ay <= py && by > py) || (by <= py && ay > py)) {
            xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay));
          }
        }
        for (const cx of xs) {
          const xa = Math.max(0, Math.round(cx - w / 2));
          const xb = Math.min(W - 1, Math.round(cx + w / 2));
          for (let x = xa; x <= xb; x++) this._pix(x, y, rgb);
        }
      }
    }
  }
  beginPath() {
    this._subpaths = [];
    this._cur = null;
  }
  moveTo(x, y) {
    const p = this._abs(x, y);
    this._cur = { pts: [p], closed: false };
    this._subpaths.push(this._cur);
  }
  lineTo(x, y) {
    const p = this._abs(x, y);
    if (!this._cur) {
      this._cur = { pts: [p], closed: false };
      this._subpaths.push(this._cur);
    } else {
      this._cur.pts.push(p);
    }
  }
  closePath() {
    if (this._cur) this._cur.closed = true;
  }
  arc(x, y, r, a0, a1) {
    const c = this._abs(x, y);
    this._cur = { pts: [c], closed: false };
    this._subpaths.push(this._cur);
    const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 0.35));
    const step = (a1 - a0) / n;
    for (let i = 1; i <= n; i++) {
      const a = a0 + step * i;
      this._cur.pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  }
  fill() {
    const rgb = hexToRgb(this.fillStyle);
    // geometry rasterised against the current transform (captured at the call site)
    const m = this._M;
    this._fillPoly(
      [apply(m, 0, 0), apply(m, 10, 0), apply(m, 10, 10), apply(m, 0, 10)].map((p) => [p.x, p.y]),
      rgb
    );
  }
  stroke() {
    const rgb = hexToRgb(this.strokeStyle);
    const w = Math.max(0.5, this.lineWidth || 1);
    this._strokePoly(rgb, w);
  }
  fillRect(x, y, w, h) {
    const pts = [
      this._abs(x, y),
      this._abs(x + w, y),
      this._abs(x + w, y + h),
      this._abs(x, y + h),
    ];
    this._fillPoly(pts, hexToRgb(this.fillStyle));
  }
  measureText(str) {
    // crude advance estimate; fitSize only needs a positive width
    return { width: Math.max(0, String(str).length * fontSize(this.font) * 0.72) };
  }
  _recordText(kind, str, x, y) {
    const [ax, ay] = this._abs(x, y);
    const size = fontSize(this.font);
    const sx = Math.sqrt(Math.abs(det(this._M)));
    this.texts.push({
      frame: this._frame,
      kind,
      x: Math.round(ax * 100) / 100,
      y: Math.round(ay * 100) / 100,
      size: size * sx,
      str: String(str),
      align: this.textAlign || 'center',
      color: this.fillStyle || '#000000',
    });
  }
  fillText(str, x, y) {
    this._recordText('fill', str, x, y);
  }
  strokeText(str, x, y) {
    this._recordText('stroke', str, x, y);
  }
  writeFrame(i, dir) {
    writePng(path.join(dir, `frame-${String(i).padStart(4, '0')}.png`), W, H, this.buf);
  }
}

// ---------------------------------------------------------------- main
const outDir = process.argv[2] || 'out/greenscreen';
mkdirSync(outDir, { recursive: true });

const ctx = new MockCtx();
setContext(ctx);

const FRAMES = FPS * DURATION;
const maxFrames = Number(process.argv[3] || 0) || null; // optional smoke-test limit
const nFrames = maxFrames ? Math.min(maxFrames, FRAMES) : FRAMES;
for (let i = 0; i < nFrames; i++) {
  renderAt(i / FPS);
  ctx._frame = i;
  ctx.writeFrame(i, outDir);
}
writeFileSync(path.join(outDir, 'texts.json'), JSON.stringify(ctx.texts));
console.log(`rendered ${nFrames} frames at ${FPS} fps into ${outDir}`);
