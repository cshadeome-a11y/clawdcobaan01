// Contact sheet: one frame per second, 20 frames per page (4 x 5), plus automatic text QA
// (safe-margin violations and overlapping text boxes).
//   node scripts/contact-sheet.mjs [offsetSeconds=0.9]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const offset = parseFloat(process.argv[2] ?? '0.9');
const url = pathToFileURL(path.resolve('dist/index.html')).href + '?capture=1';
mkdirSync('out', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true);

const pages = await page.evaluate(
  async ({ offset }) => {
    const stage = document.getElementById('stage');
    const sheets = [];
    const TW = 640, TH = 360;
    for (let p = 0; p < 3; p++) {
      const sheet = document.createElement('canvas');
      sheet.width = TW * 4;
      sheet.height = TH * 5;
      const sc = sheet.getContext('2d');
      for (let i = 0; i < 20; i++) {
        const sec = p * 20 + i;
        window.renderAt(sec + offset);
        const x = (i % 4) * TW, y = Math.floor(i / 4) * TH;
        sc.drawImage(stage, x, y, TW, TH);
        // safe-margin guide (5%)
        sc.strokeStyle = 'rgba(0,120,255,0.5)';
        sc.lineWidth = 1;
        sc.strokeRect(x + TW * 0.05, y + TH * 0.05, TW * 0.9, TH * 0.9);
        sc.fillStyle = '#000';
        sc.fillRect(x, y, 92, 22);
        sc.fillStyle = '#fff';
        sc.font = 'bold 16px monospace';
        sc.fillText(`t=${(sec + offset).toFixed(2)}`, x + 4, y + 16);
      }
      sheets.push(sheet.toDataURL('image/png'));
    }
    return sheets;
  },
  { offset }
);
pages.forEach((d, i) => writeFileSync(`out/contact-${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')));

// ---- automatic text QA, sampled at 12 fps ----
const issues = await page.evaluate(() => {
  window.__QA = true;
  const res = [];
  const lo = 1920 * 0.05, hi = 1920 * 0.95, tlo = 1080 * 0.05, thi = 1080 * 0.95;
  const seenOut = new Set();
  const seenOv = new Set();
  for (let f = 0; f < 60 * 12; f++) {
    const t = f / 12 + 0.001;
    window.renderAt(t);
    const b = window.__boxes || [];
    for (const r of b) {
      if (r.x0 < lo - 2 || r.x1 > hi + 2 || r.y0 < tlo - 2 || r.y1 > thi + 2) {
        const k = r.s;
        if (!seenOut.has(k)) {
          seenOut.add(k);
          res.push(`OUTSIDE SAFE t=${t.toFixed(2)} "${r.s}" [${r.x0 | 0},${r.y0 | 0},${r.x1 | 0},${r.y1 | 0}]`);
        }
      }
    }
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        const a = b[i], c = b[j];
        const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
        const oy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
        if (ox > 4 && oy > 4) {
          const k = a.s + '|' + c.s;
          if (!seenOv.has(k)) {
            seenOv.add(k);
            res.push(`OVERLAP t=${t.toFixed(2)} "${a.s}" x "${c.s}"`);
          }
        }
      }
  }
  return res;
});
console.log(issues.length ? issues.join('\n') : 'text QA: no overlaps or safe-margin violations');
await browser.close();
