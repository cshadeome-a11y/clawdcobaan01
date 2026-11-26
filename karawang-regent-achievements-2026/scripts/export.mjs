// Steps time frame by frame in headless Chromium (window.renderAt(t)) and pipes PNG frames
// into ffmpeg together with the offline-synthesised soundtrack -> out/karawang-2026.mp4
//   npm run build && node scripts/export.mjs
//   FFMPEG=/path/to/ffmpeg node scripts/export.mjs     (if ffmpeg is not on PATH)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 24;
const DURATION = 60;
const FRAMES = FPS * DURATION;
const url = pathToFileURL(path.resolve('dist/index.html')).href + '?capture=1';
mkdirSync('out', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.__ready === true);

console.log('synthesising soundtrack…');
const b64 = await page.evaluate(() => window.renderAudioWAV());
writeFileSync('out/soundtrack.wav', Buffer.from(b64, 'base64'));

const ff = spawn(
  FFMPEG,
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-i', 'out/soundtrack.wav',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-t', String(DURATION),
    '-movflags', '+faststart',
    'out/karawang-2026.mp4',
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] }
);
const done = new Promise((res, rej) => {
  ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  ff.on('error', rej);
});

for (let i = 0; i < FRAMES; i++) {
  const dataUrl = await page.evaluate((i) => {
    window.renderAt(i / 24); // every frame is a pure function of t
    return document.getElementById('stage').toDataURL('image/png');
  }, i);
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 120 === 0) console.log(`frame ${i}/${FRAMES}`);
}
ff.stdin.end();
await done;
await browser.close();
console.log('wrote out/karawang-2026.mp4');
