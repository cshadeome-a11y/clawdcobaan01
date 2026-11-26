// Scene timeline. Everything is a pure function of t (seconds).
// 120 BPM -> beat = 0.5 s = 12 frames @24fps, bar = 2 s. All cuts/events sit on the 0.5 s grid.

import {
  W, H, C, G, clamp, lerp, sstep, eout, ein, eio, prog, hash, tint,
  rrect, rcircle, cutPoly, card, pin, txt, figure,
  poseIdle, poseWalk, poseCheer, poseWave, posePoint, mk,
} from './prim.js';

export const DURATION = 60;
export const FPS = 24;

// ---------------------------------------------------------------- camera
// [t, cx, cy, zoom] — world centre of the screen. Smoothstep between keys, holds where keys repeat.
const KEYS = [
  [0, 960, 540, 1],
  [9, 960, 540, 1],
  [11, 2880, 540, 1],
  [22, 2880, 540, 1],
  [24, 4800, 540, 1],
  [34, 4800, 540, 1],
  [35, 4840, 435, 1.12],
  [38, 4850, 432, 1.14],
  [40, 6720, 540, 1],
  [46, 6720, 540, 1],
  [48, 6720, -540, 1],
  [56, 6720, -540, 1],
  [57, 6720, -1620, 1],
  [61, 6720, -1620, 1],
];

function camAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1][0]) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = sstep((t - a[0]) / (b[0] - a[0]));
  const k = clamp((60 - t) / 2.5); // drift settles to a stop on the last beat
  return {
    x: lerp(a[1], b[1], u) + 16 * Math.sin(t * 0.55) * k,
    y: lerp(a[2], b[2], u) + 7 * Math.sin(t * 0.4 + 1) * k,
    z: lerp(a[3], b[3], u),
  };
}

function layer(cam, f, kz, fn) {
  const ctx = G.ctx;
  const sc = lerp(1, cam.z, kz);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(sc, sc);
  ctx.translate(-cam.x * f, -cam.y * f);
  G.LS = sc;
  fn(cam);
  ctx.restore();
}

// ---------------------------------------------------------------- layer 0: far backdrop
const FAR = [
  [-760, -330, 560, 400, C.teal, 0.12],
  [-120, 210, 660, 300, C.orange, 0.16],
  [520, -420, 440, 420, C.red, 0.1],
  [930, 90, 520, 330, C.teal, 0.11],
  [-420, 360, 400, 260, C.red, 0.09],
  [-300, -700, 520, 260, C.orange, 0.12],
];
function drawFar() {
  const ctx = G.ctx;
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 260; i++) {
    const x = -1400 + hash(i, 1) * 3200;
    const y = -1400 + hash(i, 2) * 2600;
    const r = 1.5 + hash(i, 3) * 2.5;
    ctx.fillRect(x, y, r * 2, r);
  }
  ctx.restore();
  FAR.forEach((s, i) => {
    cutPoly(rrect('far' + i, s[0], s[1], s[2], s[3], 5), tint(s[4], s[5]), { rim: 8, nojit: true });
  });
  // paper sun whose rays turn in 12 fps steps
  const sx = 640;
  const sy = -260;
  const ang = G.STEP * 0.07;
  for (let i = 0; i < 12; i++) {
    const a = ang + (i / 12) * Math.PI * 2;
    const p = [
      [sx + Math.cos(a - 0.1) * 215, sy + Math.sin(a - 0.1) * 215],
      [sx + Math.cos(a) * 285, sy + Math.sin(a) * 285],
      [sx + Math.cos(a + 0.1) * 215, sy + Math.sin(a + 0.1) * 215],
    ];
    cutPoly(p, tint(C.orange, 0.3), { rim: 6, nojit: true });
  }
  cutPoly(rcircle('sun', sx, sy, 175, 3), tint(C.orange, 0.38), { rim: 9, nojit: true });
}

// ---------------------------------------------------------------- layer 1: hills
const HILL = [tint(C.teal, 0.17), tint(C.orange, 0.24), tint(C.red, 0.13)];
function drawHills() {
  for (let k = 0; k < 8; k++) {
    const base = -760 + k * 230;
    const pts = [];
    for (let x = -1500; x <= 2700; x += 150) {
      pts.push([x, base - 70 * Math.sin(x * 0.0046 + k * 1.7) - 40 * hash(k, (x / 150) | 0)]);
    }
    pts.push([2700, base + 900], [-1500, base + 900]);
    cutPoly(pts, HILL[k % 3], { rim: 8, nojit: true });
  }
}

// ---------------------------------------------------------------- layer 2: little paper town
function drawMid() {
  const ctx = G.ctx;
  const GRD = tint(C.ink, 0.16);
  for (let k = 0; k < 6; k++) {
    const base = -1140 + k * 380;
    cutPoly(rrect('gm' + k, -800, base, 4800, 22, 3), GRD, { rim: 6, nojit: true });
    for (let j = 0; j < 15; j++) {
      const id = k * 40 + j;
      const x = -700 + j * 330 + hash(id, 4) * 140;
      const type = Math.floor(hash(id, 6) * 3);
      const s = 0.8 + hash(id, 7) * 0.6;
      ctx.save();
      ctx.translate(x, base);
      ctx.scale(s, s);
      if (type === 0) {
        ctx.rotate(Math.sin(G.STEP * 0.7 + j) * 0.03);
        cutPoly(rrect('tr' + id, -7, -44, 14, 44, 1), tint(C.ink, 0.3), { rim: 5, nojit: true });
        cutPoly([[-44, -40], [0, -150], [44, -40]], tint(C.teal, 0.3), { rim: 5, nojit: true });
      } else if (type === 1) {
        cutPoly(rrect('hs' + id, -45, -70, 90, 70, 1.5), tint(C.orange, 0.34), { rim: 5, nojit: true });
        cutPoly([[-58, -70], [0, -125], [58, -70]], tint(C.red, 0.3), { rim: 5, nojit: true });
      } else {
        cutPoly(rrect('fa' + id, 24, -170, 24, 90, 1), tint(C.ink, 0.22), { rim: 5, nojit: true });
        cutPoly(rrect('fb' + id, -70, -90, 140, 90, 1.5), tint(C.red, 0.28), { rim: 5, nojit: true });
      }
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- layer 4: foreground scraps (screen-space fringe)
function drawFringe(cam) {
  const ctx = G.ctx;
  const cols = [C.ink, C.teal, C.red, C.orange];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  G.LS = 1.2;
  for (let k = 0; k < 11; k++) {
    const wx = hash(k, 77) * 3600;
    const sx = ((((wx - cam.x * 1.35) % 3600) + 3600) % 3600) - 700;
    const top = k % 2 === 0;
    const w = 90 + hash(k, 3) * 150;
    const h = 22 + hash(k, 5) * 24;
    const col = cols[k % 4];
    const pts = top
      ? [[sx, -20], [sx + w, -20], [sx + w * (0.3 + hash(k, 9) * 0.4), -20 + h * 1.5]]
      : [[sx, H + 20], [sx + w, H + 20], [sx + w * (0.3 + hash(k, 9) * 0.4), H + 20 - h * 1.5]];
    cutPoly(pts, col, { rim: 8, nojit: true, lift: 1.3 });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- helpers for scenes
const show = (t0) => G.TS >= t0;
const sign = (i) => (i % 2 ? 1 : -1);

function strip(id, cx, cy, w, h, fill, text, t0, o = {}) {
  if (!show(t0)) return;
  const e = eout(prog(t0, 0.5));
  card(id, cx, cy - (1 - e) * 170, w, h, fill, { rot: (1 - e) * 0.05 * (o.dir || 1) + (o.rot || 0) }, () =>
    txt(text, 0, 2, { size: o.size || 40, fit: w - 70, color: o.color || C.paper })
  );
}

// ---------------------------------------------------------------- hero path (S1 -> S2), world coords
const HS = [
  [0, 7, -120, 1600, 985, 985, 0.8, 0.8, 'walk', 0.667],
  [7, 7.5, 1600, 1600, 985, 985, 0.8, 0.8, 'reach'],
  [7.5, 8, 1600, 1600, 985, 985, 0.8, 0.8, 'slap'],
  [8, 9, 1600, 1600, 985, 985, 0.8, 0.8, 'wave'],
  [9, 10, 1600, 2100, 985, 985, 0.8, 0.8, 'walk', 0.4],
  [10, 11.6, 2100, 2360, 985, 830, 0.8, 0.6, 'walk', 0.667],
  [11.6, 12, 2360, 2360, 830, 830, 0.6, 0.6, 'idle'],
  [12, 13.5, 2360, 2360, 830, 830, 0.6, 0.6, 'point'],
  [13.5, 15, 2360, 2760, 830, 830, 0.6, 0.6, 'walk', 0.667],
  [15, 16.5, 2760, 2760, 830, 830, 0.6, 0.6, 'point'],
  [16.5, 18, 2760, 3160, 830, 830, 0.6, 0.6, 'walk', 0.667],
  [18, 19.5, 3160, 3160, 830, 830, 0.6, 0.6, 'point'],
  [19.5, 20, 3160, 3160, 830, 830, 0.6, 0.6, 'idle'],
  [20, 22.5, 3160, 3160, 830, 830, 0.6, 0.6, 'cheer'],
  [22.5, 99, 3160, 3160, 830, 830, 0.6, 0.6, 'idle'],
];
function drawHero(dx = 0) {
  const ts = G.TS;
  const seg = HS.find((s) => ts >= s[0] && ts < s[1]);
  if (!seg) return;
  const u = (ts - seg[0]) / (seg[1] - seg[0]);
  const x = lerp(seg[2], seg[3], Math.min(u, 1));
  const y = lerp(seg[4], seg[5], sstep(u));
  const s = lerp(seg[6], seg[7], sstep(u));
  let P;
  switch (seg[8]) {
    case 'walk': P = poseWalk(ts, seg[9]); break;
    case 'reach': P = Object.assign(poseIdle(ts), { al: 1.5, ale: -0.15 }); break;
    case 'slap': P = Object.assign(poseIdle(ts), { al: 1.5 + (G.STEP % 2 ? -0.5 : 0.1), ale: -0.15 }); break;
    case 'wave': P = poseWave(ts); break;
    case 'point': P = posePoint(ts, seg[0]); break;
    case 'cheer': P = poseCheer(ts); break;
    default: P = poseIdle(ts);
  }
  figure(x + dx, y, s, P, { id: 'hero' });
}

// ---------------------------------------------------------------- S1: headline number (0–10 s)
function scene1() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(0, -ein(prog(9, 1)) * 1250);

  // title strip slapped on at 0:00
  {
    const e = eout(prog(0, 0.5));
    card('t1', 960, 120 - (1 - e) * 90, 1640, 100, C.red, { rot: (1 - e) * 0.05 }, () =>
      txt('CAPAIAN DAN PENGHARGAAN BUPATI KARAWANG 2026', 0, 3, { size: 52, fit: 1560, color: C.ink })
    );
    pin(-790, -36, 9);
    pin(790, -36, 9);
  }

  // big card
  if (show(2)) {
    const e = eout(prog(2, 0.5));
    card('c1', 960, 520 - (1 - e) * 700, 1120, 560, C.red, { rot: -0.01 + (1 - e) * 0.1, amp: 3 });
  }
  // label strip
  if (show(5)) {
    const e = eout(prog(5, 0.5));
    card('l1', 960, 285 - (1 - e) * 120, 1000, 66, C.orange, { rot: (1 - e) * 0.04 }, () =>
      txt('Indeks Pembangunan Manusia (IPM), 2025', 0, 2, { size: 36, fit: 930 })
    );
  }
  // digits drop in one per half beat
  const digits = [['7', 598, 190], ['4', 804, 190], [',', 960, 90], ['5', 1116, 190], ['9', 1322, 190]];
  digits.forEach(([d, x, w], i) => {
    const t0 = 2.5 + i * 0.5;
    if (!show(t0)) return;
    const e = eout(prog(t0, 0.5));
    card('d' + i, x, 560 - (1 - e) * 620, w, 300, C.paper, { rot: (hash(i, 3) - 0.5) * 0.05 + (1 - e) * 0.2 * sign(i) }, () =>
      txt(d, 0, 14, { size: 270, fit: w - 20 })
    );
  });
  // tag
  if (show(7.5)) {
    const e = eout(prog(7.5, 0.33));
    card('tg', 1240, 805, 470, 84, C.teal, { rot: 0.03 - (1 - e) * 0.12, sx: 1 + (1 - e) * 0.25, sy: 1 + (1 - e) * 0.25 }, () =>
      txt('Meningkat konsisten', 0, 2, { size: 42, fit: 430 })
    );
  }
  ctx.restore();
}

// ---------------------------------------------------------------- S2: IPM chart, point by point (10–22 s)
const P2 = [
  { x: 560, v: 73.82, t0: 12, lab: '73,82', cat: '2024' },
  { x: 960, v: 74.59, t0: 15, lab: '74,59', cat: '2025' },
  { x: 1360, v: 74.65, t0: 18, lab: '74,65', cat: 'Target 2026', target: true },
];
const yv = (v) => 830 - ((v - 73.6) / 1.2) * 480;

function scene2() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(1920, 0);
  card('p2', 960, 540, 1620, 800, C.paper, { rim: 12, amp: 3, lift: 1.6 });
  strip('t2', 960, 112, 980, 78, C.ink, 'Indeks Pembangunan Manusia (IPM)', 10);

  // axis pulled out by a paper roll
  const ub = prog(10.5, 1.5);
  const uy = prog(10.5, 0.75);
  if (ub > 0) {
    const len = 1360 * ub;
    cutPoly(rrect('bl', 280, 824, Math.max(len, 8), 12, 1.2), C.ink, { rim: 5, nojit: true });
    if (ub < 1) {
      ctx.save();
      ctx.translate(280 + len, 812);
      ctx.rotate(ub * 24);
      cutPoly(rcircle('roll', 0, 0, 24, 1), C.orange, { rim: 7, nojit: true });
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();
      ctx.restore();
    }
    const h = 480 * uy;
    cutPoly(rrect('ya', 274, 830 - h, 12, Math.max(h, 8), 1.2), C.ink, { rim: 5, nojit: true });
  }
  if (show(11.5)) {
    // torn axis break
    ctx.fillStyle = C.paper;
    ctx.fillRect(258, 756, 44, 26);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(258, 784);
    ctx.lineTo(302, 756);
    ctx.moveTo(258, 764);
    ctx.lineTo(302, 736);
    ctx.stroke();
    txt('sumbu dipotong', 190, 905, { size: 28, align: 'left' });
  }

  // stems
  P2.forEach((p, i) => {
    if (!show(p.t0)) return;
    const e = eout(prog(p.t0, 1.5));
    const dy = lerp(830, yv(p.v), e);
    cutPoly(rrect('st' + i, p.x - 6, dy, 12, Math.max(830 - dy, 6), 1), C.ink, { rim: 4, nojit: true });
  });
  // line segments (dashed towards the target)
  for (let i = 1; i < P2.length; i++) {
    const s0 = P2[i].t0 + 1.5;
    if (!show(s0)) continue;
    const u = prog(s0, 0.5);
    const A = [P2[i - 1].x, yv(P2[i - 1].v)];
    const B = [P2[i].x, yv(P2[i].v)];
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) * u;
    ctx.save();
    ctx.translate(A[0], A[1]);
    ctx.rotate(ang);
    if (P2[i].target) {
      for (let d = 0; d < L; d += 40) {
        cutPoly(rrect('ds' + d, d, -5, Math.min(26, L - d), 10, 1), C.ink, { rim: 5, nojit: true });
      }
    } else {
      cutPoly(rrect('sg' + i, 0, -5, L, 10, 1), C.ink, { rim: 5, nojit: true });
    }
    ctx.restore();
  }
  // the hero works the chart behind the value labels
  if (G.T < 22.6) drawHero(-1920);
  // dots, category labels, value labels
  P2.forEach((p, i) => {
    if (!show(p.t0)) return;
    const e = eout(prog(p.t0, 1.5));
    const dy = lerp(830, yv(p.v), e);
    if (p.target) {
      cutPoly(rcircle('dt' + i, p.x, dy, 38, 1.4), C.orange, { rim: 8, nojit: true });
      cutPoly(rcircle('dti' + i, p.x, dy, 17, 1), C.paper, { rim: 4, nojit: true, noshadow: true });
    } else {
      cutPoly(rcircle('dt' + i, p.x, dy, 36, 1.4), C.teal, { rim: 8, nojit: true });
      ctx.fillStyle = C.paper;
      ctx.beginPath();
      ctx.arc(p.x, dy, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    txt(p.cat, p.x, 892, { size: 40, fit: 250 });
    if (show(p.t0 + 1.5)) {
      const f = eout(prog(p.t0 + 1.5, 0.33));
      card('lb' + i, p.x, dy - 100, 200, 84, C.orange, { sy: Math.max(0.06, f), rot: (hash(i, 5) - 0.5) * 0.04 }, () =>
        txt(p.lab, 0, 3, { size: 58, fit: 180 })
      );
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- S3: investment bars (22–38 s) + annotation
function scene3() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(3840, 0);
  card('p3', 960, 540, 1620, 800, C.paper, { rim: 12, amp: 3, lift: 1.6 });
  strip('t3', 960, 112, 1150, 78, C.ink, 'Realisasi Investasi, Jan–Sep 2026 (Triwulan III)', 23, { dir: -1 });

  const x0 = 280;
  const sc = 29.7;
  const pma = 35.755491051265;
  const pmdn = 6.328625759091;
  const wA = pma * sc;
  const wD = pmdn * sc;
  const wT = wA + wD;

  // PMA bar
  if (show(24)) {
    const e = eout(prog(24, 1.5));
    card('bA', x0 + (wA * e) / 2, 440, Math.max(wA * e, 10), 120, C.teal, { amp: 2 }, () => {
      if (show(25.5)) txt('Rp 35,76 T', 0, 3, { size: 58, fit: wA - 80 });
    });
    if (show(25.5)) txt('PMA · Penanam Modal Asing', x0, 537, { size: 34, align: 'left' });
  }
  // PMDN bar: grows on the lower row, then slides onto the end of PMA
  if (show(27)) {
    const e = eout(prog(27, 1.5));
    const u = sstep(prog(30, 1));
    const wd = Math.max(wD * e, 10);
    const left = lerp(x0, x0 + wA, u);
    const yc = lerp(720, 440, u);
    card('bD', left + wd / 2, yc, wd, 120, C.orange, { amp: 2 }, () => {
      if (show(28.5)) txt('Rp 6,33 T', 0, 3, { size: 42, fit: wD - 22 });
    });
    if (show(28.5) && !show(30)) txt('PMDN · Penanaman Modal Dalam Negeri', x0, 817, { size: 34, align: 'left' });
    if (show(31)) txt('PMDN', x0 + wA + wD / 2, 537, { size: 34 });
  }
  // bracket closes over both
  if (show(31)) {
    const u = prog(31, 0.5);
    cutPoly(rrect('br', x0 - 4, 350, Math.max(wT * u, 8), 9, 1), C.ink, { rim: 5, nojit: true });
    cutPoly(rrect('bl1', x0 - 4, 350, 9, 26, 1), C.ink, { rim: 5, nojit: true });
    if (u >= 1) cutPoly(rrect('bl2', x0 + wT - 6, 350, 9, 26, 1), C.ink, { rim: 5, nojit: true });
  }
  // total card
  if (show(31.5)) {
    const e = eout(prog(31.5, 0.5));
    card('tot', x0 + wT / 2, 242 - (1 - e) * 130, 400, 88, C.red, { rot: (1 - e) * 0.06 }, () =>
      txt('Rp 42,08 T', 0, 3, { size: 62, fit: 360 })
    );
  }
  // jobs bar
  if (show(32)) {
    txt('Penyerapan tenaga kerja', x0, 628, { size: 34, align: 'left' });
    const e = eout(prog(32, 1.5));
    const total = 27158;
    const jA = (18999 / total) * wT * e;
    const jB = (8159 / total) * wT * e;
    card('jA', x0 + jA / 2, 720, Math.max(jA, 10), 120, C.teal, { amp: 2 }, () => {
      if (show(33.5)) txt('PMA 18.999', 0, 3, { size: 50, fit: jA - 40 });
    });
    card('jB', x0 + jA + jB / 2, 720, Math.max(jB, 10), 120, C.orange, { amp: 2 }, () => {
      if (show(33.5)) txt('PMDN 8.159', 0, 3, { size: 42, fit: jB - 30 });
    });
    if (show(33.5)) txt('27.158 orang bekerja', x0 + wT / 2, 825, { size: 52, fit: 700 });
  }

  // the figure that works the chart
  {
    const ts = G.TS;
    if (ts >= 22.5) {
      const enter = prog(22.5, 1.5);
      const leave = prog(34, 1);
      const x = lerp(2030, 1690, enter) + leave * 420;
      const ptsOn = [[24, 26], [27, 29], [30, 31.5], [32, 34]].find((r) => ts >= r[0] && ts < r[1]);
      let P;
      if (enter < 1 || leave > 0) P = poseWalk(ts, 0.667);
      else if (ptsOn) P = posePoint(ts, ptsOn[0], 'l');
      else P = poseIdle(ts);
      if (leave < 1 || ts < 34) figure(x, 930, 0.8, P, { id: 'h3' });
    }
  }

  // annotation: hand-drawn ring around the total + pinned note
  if (show(34.5)) {
    const u = prog(34.5, 1);
    const a0 = -2.4;
    const a1 = a0 + Math.PI * 2 * 1.06 * u;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    [[17, C.white], [9, C.ink]].forEach(([lw, col]) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let a = a0; a <= a1; a += 0.08) {
        const k = 1 + 0.025 * Math.sin(3 * a + 1);
        const px = 905 + Math.cos(a) * 262 * k;
        const py = 242 + Math.sin(a) * 78 * k;
        if (a === a0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.restore();
  }
  if (show(35.5)) {
    const e = eout(prog(35.5, 0.5));
    ctx.save();
    ctx.translate(1430, 255 - (1 - e) * 60);
    ctx.rotate(0.03 + (1 - e) * 0.35);
    card('note', 0, 0, 400, 150, C.orange, { amp: 2.5 }, () => {
      txt('63.000', 0, -20, { size: 66, fit: 340, edge: 8 });
      txt('NIB telah diterbitkan', 0, 27, { size: 30, fit: 360 });
      txt('2025–2026', 0, 55, { size: 28, fit: 360 });
      pin(0, -66, 8);
    });
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- S4: three tabs flipped by puppets (38–48 s)
const TABS = [
  { t: 40, cy: 300, col: C.teal, cat: 'Pendidikan', num: '778', d: ['ruang kelas direnovasi', 'di 222 sekolah'] },
  { t: 42, cy: 540, col: C.orange, cat: 'Kesehatan', num: '892.720', d: ['orang cek kesehatan gratis', '34,14% · data per 5 Nov 2026'] },
  { t: 44, cy: 780, col: C.red, cat: 'Perumahan', num: '1.694', d: ['unit rutilahu terealisasi', 'dari target 2.420 (2026)'] },
];
function scene4() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(5760, 0);
  strip('h4', 960, 112, 780, 78, C.ink, 'Capaian lain di lapangan', 39.5);

  TABS.forEach((tb, i) => {
    // puppet waits beside its tab and flips it open
    if (show(39.5)) {
      const a = clamp((G.TS - (tb.t - 0.4)) / 0.8);
      const P = poseIdle(G.TS);
      P.al = G.TS < tb.t - 0.4 ? 2.9 : lerp(2.9, 0.9, eio(a));
      P.ale = 0.15;
      figure(1710, tb.cy + 100, 0.55, P, { id: 'f4' + i, body: i === 1 ? C.red : C.teal, arm: i === 1 ? C.teal : C.red });
    }
    if (!show(tb.t)) return;
    const f = eout(prog(tb.t, 0.5));
    ctx.save();
    ctx.translate(900, tb.cy - 100);
    ctx.scale(1, Math.max(0.05, f));
    card('tab' + i, 0, 100, 1360, 200, tb.col, { amp: 2.5 }, () => {
      txt(tb.cat, -650, 0, { size: 38, align: 'left', fit: 230 });
      ctx.fillStyle = C.ink;
      ctx.fillRect(-418, -50, 5, 100);
      txt(tb.num, -150, 6, { size: 124, fit: 520, edge: 9 });
      ctx.fillRect(120, -50, 5, 100);
      txt(tb.d[0], 160, -26, { size: 36, align: 'left', fit: 490 });
      txt(tb.d[1], 160, 22, { size: 34, align: 'left', fit: 490 });
    });
    ctx.restore();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- S5: awards wall (46–57 s)
const AW = [
  { h: ['Opini Wajar Tanpa', 'Pengecualian (WTP)'], s: ['BPK RI Perwakilan Jawa Barat'], col: C.teal },
  { h: ['Terbaik II se-Indonesia', 'Komitmen Anti Kecurangan'], s: ['INAHAFF 2026'], col: C.orange },
  { h: ['Anugerah Cita Negeri 2026'], s: ['Cita Daerah Mandiri &', 'Ekonomi Bertumbuh · KompasTV'], col: C.red },
  { h: ['Leading Inclusive', 'Learning Access Initiative'], s: ['CNN Indonesia Awards 2026'], col: C.orange },
  { h: ['Tata Kelola Pemerintahan', 'Responsif dan Akuntabel'], s: ['Warta Kota Awards 2026'], col: C.red },
  { h: ['Pemimpin Daerah Award 2026'], s: ['iNews Media Group'], col: C.teal },
];
const SLOT_X = [394, 960, 1526];
const SLOT_Y = [350, 720];

function star(cx, cy, ro, ri, fill) {
  const ctx = G.ctx;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function medal(id, x, y, r, fill) {
  cutPoly(rcircle(id, x, y, r, 1.2), fill, { rim: 6, nojit: true });
  star(x, y, r * 0.58, r * 0.26, C.ink);
}

function scene5() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(5760, -1080);
  const lifted = show(54);

  AW.forEach((a, i) => {
    const t0 = 47.5 + i;
    if (!show(t0)) return;
    if (i === 0 && lifted) return;
    const e = eout(prog(t0, 0.5));
    const cx = SLOT_X[i % 3];
    const cy = SLOT_Y[Math.floor(i / 3)];
    ctx.save();
    ctx.translate(cx, cy - 165 - (1 - e) * 50);
    ctx.rotate(sign(i) * 0.012 * (1 + i % 2) + (1 - e) * 0.38 * sign(i));
    card('aw' + i, 0, 165, 530, 330, a.col, { amp: 2.5 }, () => {
      medal('m' + i, -215, -118, 32, C.paper);
      const y0 = a.h.length === 1 ? -22 : -42;
      a.h.forEach((l, k) => txt(l, -240, y0 + k * 50, { size: 44, align: 'left', fit: 480 }));
      const ys = y0 + (a.h.length - 1) * 50 + 62;
      a.s.forEach((l, k) => txt(l, -240, ys + k * 36, { size: 30, align: 'left', fit: 480, color: C.ink }));
    });
    pin(0, 10, 9);
    ctx.restore();
  });

  strip('h5', 960, 112, 640, 78, C.ink, 'Penghargaan 2026', 47);

  if (lifted) {
    // a sheet of tissue paper slides over the wall…
    const e2 = eout(prog(54, 0.5));
    ctx.save();
    ctx.globalAlpha = 0.94;
    cutPoly(rrect('tissue', 960 - 900 + (1 - e2) * 1900, 190, 1800, 730, 3), C.paper, { rim: 10, nojit: true, lift: 1.4 });
    ctx.restore();
    // …and the WTP card is lifted out by a puppet
    const e = sstep(prog(54, 0.75));
    const cx = lerp(SLOT_X[0], 960, e);
    const cy = lerp(SLOT_Y[0], 470, e);
    const w = lerp(530, 800, e);
    const h = lerp(330, 460, e);
    card('wtp', cx, cy, w, h, C.orange, { amp: 3, lift: 1.5 }, () => {
      if (show(54.75)) {
        txt('ke-11', 0, -46, { size: 220, fit: 640, edge: 10 });
        txt('kali berturut-turut', 0, 128, { size: 64, fit: 700 });
        medal('mw', 0, -h / 2, 54, C.red);
      }
    });
    const fy = lerp(1280, 1000, e);
    const P = G.TS < 54.75 ? Object.assign(poseIdle(G.TS), { ar: -2.9, al: 2.9, are: -0.15, ale: 0.15 }) : poseCheer(G.TS);
    if (G.TS >= 54.75) {
      P.bob *= 0.35;
      P.ar = -2.85 - 0.1 * Math.sin(G.STEP);
      P.al = 2.85 + 0.1 * Math.sin(G.STEP);
    }
    figure(960, fy, 0.85, P, { id: 'f5' });
  }
  ctx.restore();
}

// ---------------------------------------------------------------- S6: source line + conclusion (57–60 s)
const CHIPS = [
  { t: 57, y: 330, col: C.teal, s: 'IPM naik' },
  { t: 57.5, y: 490, col: C.orange, s: 'investasi terealisasi' },
  { t: 58, y: 650, col: C.red, s: 'penghargaan diraih' },
];
function scene6() {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(5760, -2160);
  strip('t6', 960, 125, 1640, 100, C.red, 'CAPAIAN DAN PENGHARGAAN BUPATI KARAWANG 2026', 56.5, { size: 52, color: C.ink });
  CHIPS.forEach((c, i) => {
    if (!show(c.t)) return;
    const e = eout(prog(c.t, 0.5));
    const w = 860;
    card('ch' + i, 1000 + sign(i) * (1 - e) * 1200, c.y, w, 130, c.col, { rot: sign(i) * 0.012 }, () =>
      txt(c.s, 0, 4, { size: 84, fit: w - 70 })
    );
  });
  if (show(58)) {
    const P = poseWave(G.TS);
    figure(300, 820, 0.8, P, { id: 'f6' });
  }
  if (show(58.5)) {
    const e = eout(prog(58.5, 0.5));
    card('src', 960, 930 + (1 - e) * 160, 1560, 84, C.ink, { rot: 0 }, () =>
      txt('Sumber: Data Capaian dan Penghargaan Bupati Karawang 2026', 0, 3, { size: 38, fit: 1480, color: C.paper })
    );
  }
  ctx.restore();
}

// ---------------------------------------------------------------- content layer
function drawContent() {
  const t = G.T;
  if (t < 12.6) scene1();
  if (t > 9.5 && t < 24.6) scene2();
  if (t > 21.5 && t < 40.6) scene3();
  if (t > 36.5 && t < 49) scene4();
  if (t > 45 && t < 57.6) scene5();
  if (t > 55.4) scene6();
  if (t < 9.5) drawHero();
}

// ---------------------------------------------------------------- entry point
export function setContext(ctx) {
  G.ctx = ctx;
}

export function renderAt(t) {
  const ctx = G.ctx;
  G.T = t;
  G.TS = Math.floor(t * 12 + 1e-6) / 12;
  G.STEP = Math.round(G.TS * 12);
  G.JC = 0;
  G.boxes = [];
  G.QA = typeof window !== 'undefined' && window.__QA === true;
  const cam = camAt(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  layer(cam, 0.06, 0.25, drawFar);
  layer(cam, 0.18, 0.4, drawHills);
  layer(cam, 0.4, 0.6, drawMid);
  layer(cam, 1, 1, drawContent);
  drawFringe(cam);
  if (G.QA) window.__boxes = G.boxes;
}
