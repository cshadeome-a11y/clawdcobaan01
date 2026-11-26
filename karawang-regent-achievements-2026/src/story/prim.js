// Drawing primitives for the paper cut-out look.
// Everything here is deterministic: randomness comes from a seeded integer hash.

export const W = 1920;
export const H = 1080;

export const C = {
  paper: '#e9e3d5',
  red: '#e76f51',
  teal: '#2a9d8f',
  orange: '#f4a261',
  ink: '#1b1b1b',
  white: '#ffffff',
  // pure green screen — enable via the `greenscreen` URL param (see renderAt)
  green: '#00ff00',
};

export const FONT =
  '"Arial Black", "Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif';

// ---------- shared per-frame state (reset at the start of every renderAt) ----------
export const G = {
  ctx: null,
  T: 0, // continuous time (camera, background)
  TS: 0, // time quantised to 12 fps (stop-motion pieces)
  STEP: 0, // integer 12 fps step index
  JC: 0, // per-frame piece counter used for stop-motion "boil"
  LS: 1, // current layer scale (shadow size)
  QA: false,
  boxes: [],
};

// ---------- math ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const eio = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const eout = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const ein = (x) => {
  x = clamp(x);
  return x * x * x;
};
// progress of the stop-motion clock between t0 and t0+d
export const prog = (t0, d) => clamp((G.TS - t0) / d);

export function hash(a, b = 0) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export function sid(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
export function mix(a, b, t) {
  const A = hex(a);
  const B = hex(b);
  const m = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
// flat, desaturated version of a card colour for far layers
export const tint = (c, k) => mix(C.paper, c, k);

// ---------- rough cut shapes ----------
export function rrect(id, x, y, w, h, amp = 2.2) {
  const s = sid(id);
  const pts = [];
  let k = 0;
  const edges = [
    [x, y, x + w, y],
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
  ];
  for (const [ax, ay, bx, by] of edges) {
    for (let i = 0; i < 3; i++) {
      const u = i / 3;
      pts.push([
        lerp(ax, bx, u) + (hash(s, k) - 0.5) * 2 * amp,
        lerp(ay, by, u) + (hash(s, k + 1) - 0.5) * 2 * amp,
      ]);
      k += 2;
    }
  }
  return pts;
}

export function rcircle(id, cx, cy, r, amp = 1.6, n = 22) {
  const s = sid(id);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + (hash(s, i) - 0.5) * 2 * amp;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function pathPoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export const SHADOW = 'rgba(27,27,27,0.30)';

export function jit(amp = 1.0) {
  const k = G.JC++;
  return [(hash(k, G.STEP) - 0.5) * 2 * amp, (hash(k, G.STEP + 7919) - 0.5) * 2 * amp];
}

// One paper piece: hard shadow on the layer below, rough white cut edge, flat colour.
export function cutPoly(pts, fill, o = {}) {
  const ctx = G.ctx;
  const rim = o.rim ?? 11;
  const j = o.nojit ? [0, 0] : jit(o.jit ?? 1.0);
  ctx.save();
  ctx.translate(j[0], j[1]);
  ctx.lineJoin = 'round';
  if (!o.noshadow) {
    const m = ctx.getTransform();
    const k = (o.lift ?? 1) * G.LS;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e + 6 * k, m.f + 8 * k);
    pathPoly(ctx, pts);
    ctx.fillStyle = SHADOW;
    ctx.strokeStyle = SHADOW;
    ctx.lineWidth = rim;
    ctx.fill();
    ctx.stroke();
    ctx.setTransform(m);
  }
  pathPoly(ctx, pts);
  ctx.lineWidth = rim;
  ctx.strokeStyle = C.white;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

// Card centred on (cx,cy); callback draws children in the card's local space (origin = centre).
export function card(id, cx, cy, w, h, fill, o = {}, cb) {
  const ctx = G.ctx;
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rot) ctx.rotate(o.rot);
  if (o.sx !== undefined || o.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1);
  cutPoly(rrect(id, -w / 2, -h / 2, w, h, o.amp ?? 2.2), fill, o);
  if (cb) cb();
  ctx.restore();
}

export function pin(x, y, r = 8) {
  const ctx = G.ctx;
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- text ----------
export function fitSize(str, size, maxW) {
  const ctx = G.ctx;
  ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(str).width;
  return w > maxW ? (size * maxW) / w : size;
}

// Text centred vertically on y. o: size, fit, align, color, edge
export function txt(str, x, y, o = {}) {
  const ctx = G.ctx;
  const size = o.fit ? fitSize(str, o.size, o.fit) : o.size;
  ctx.save();
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (o.edge) {
    ctx.lineWidth = o.edge;
    ctx.strokeStyle = C.white;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || C.ink;
  ctx.fillText(str, x, y);
  if (G.QA && o.qa !== false) {
    const w = ctx.measureText(str).width;
    const x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    const m = ctx.getTransform();
    const corners = [
      [x0, y - size * 0.5],
      [x0 + w, y + size * 0.5],
    ].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
    G.boxes.push({
      s: str,
      x0: Math.min(corners[0][0], corners[1][0]),
      y0: Math.min(corners[0][1], corners[1][1]),
      x1: Math.max(corners[0][0], corners[1][0]),
      y1: Math.max(corners[0][1], corners[1][1]),
    });
  }
  ctx.restore();
}

// ---------- split-pin puppets ----------
function limb(id, len, w, ang, col, child) {
  const ctx = G.ctx;
  ctx.save();
  ctx.rotate(ang);
  cutPoly(rrect(id, -w / 2, -5, w, len + 10, 1.2), col, { rim: 7, nojit: true });
  pin(0, 0, 5.5);
  if (child) {
    ctx.translate(0, len);
    child();
  }
  ctx.restore();
}

const P0 = { bob: 0, lh: 0, lk: 0, rh: 0, rk: 0, ar: -0.12, are: -0.12, al: 0.12, ale: 0.12, tilt: 0, look: 0 };
export const mk = (o) => Object.assign({}, P0, o);

// Poses are pure functions of the (already quantised) time.
export function poseIdle(ts) {
  const b = Math.floor(ts * 2) % 2;
  const sw = Math.sin(ts * 3.1) * 0.05;
  return mk({ bob: -b * 2, ar: -0.14 - sw, al: 0.14 + sw, tilt: sw });
}
export function poseWalk(ts, per = 0.667) {
  const ph = (ts / per) * Math.PI * 2;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return mk({
    bob: -Math.abs(s) * 5,
    lh: 0.55 * s,
    rh: -0.55 * s,
    lk: 0.8 * Math.max(0, c),
    rk: 0.8 * Math.max(0, -c),
    ar: -0.12 + 0.45 * s,
    al: 0.12 + 0.45 * s,
    are: -0.3,
    ale: 0.3,
    tilt: 0.05 * s,
  });
}
export function poseCheer(ts) {
  const ph = ts * Math.PI * 2 * 1.5;
  const j = Math.abs(Math.sin(ph));
  const f = Math.sin(ph * 2);
  return mk({
    bob: -j * 34,
    lh: 0.25 * j,
    rh: -0.25 * j,
    lk: 0.6 * j,
    rk: 0.6 * j,
    ar: -2.5 - 0.35 * f,
    are: -0.3,
    al: 2.5 + 0.35 * f,
    ale: 0.3,
    tilt: 0.08 * f,
  });
}
export function poseWave(ts) {
  const f = Math.sin(ts * Math.PI * 2 * 2);
  return mk({
    bob: -(Math.floor(ts * 2) % 2) * 2,
    ar: -2.55 + 0.2 * f,
    are: -0.5 + 0.55 * f,
    tilt: 0.06 * f,
  });
}
export function posePoint(ts, t0, side = 'r') {
  const a = eout(clamp((ts - t0) / 0.5));
  const wob = Math.sin(ts * 9) * 0.05 * a;
  const base = poseIdle(ts);
  if (side === 'r') return Object.assign(base, { ar: lerp(-0.14, -2.7, a) + wob, are: -0.25 });
  return Object.assign(base, { al: lerp(0.14, 1.65, a) + wob, ale: 0.2 });
}

export function figure(x, y, s, P, o = {}) {
  const ctx = G.ctx;
  const id = o.id || 'f';
  const bodyC = o.body || C.teal;
  const armC = o.arm || C.red;
  const j = jit(0.9);
  ctx.save();
  ctx.translate(x + j[0], y + j[1]);
  ctx.scale(s, s);
  ctx.translate(0, P.bob);
  const hip = -124;

  // legs (behind the torso)
  const leg = (sx, a, k, name) => {
    ctx.save();
    ctx.translate(sx, hip);
    limb(id + name + '1', 66, 26, a, C.ink, () =>
      limb(id + name + '2', 62, 23, k, C.ink, () =>
        cutPoly(rrect(id + name + 'f', -14, -4, 42, 16, 1), C.ink, { rim: 6, nojit: true })
      )
    );
    ctx.restore();
  };
  leg(-20, P.lh, P.lk, 'a');
  leg(20, P.rh, P.rk, 'b');

  // torso
  cutPoly(rrect(id + 't', -44, hip - 110, 88, 112, 2), bodyC, { rim: 8, nojit: true });
  ctx.fillStyle = C.ink;
  ctx.fillRect(-44, hip - 14, 88, 7);
  ctx.fillStyle = C.paper;
  ctx.fillRect(-4, hip - 96, 8, 70);

  // arms
  const arm = (sx, a, e, name) => {
    ctx.save();
    ctx.translate(sx, hip - 96);
    limb(id + name + '1', 60, 22, a, armC, () =>
      limb(id + name + '2', 58, 20, e, armC, () => {
        cutPoly(rcircle(id + name + 'h', 0, 6, 11, 1), C.orange, { rim: 6, nojit: true });
      })
    );
    ctx.restore();
  };
  arm(-52, P.al, P.ale, 'c');
  arm(52, P.ar, P.are, 'd');

  // head
  ctx.save();
  ctx.translate(0, hip - 108);
  ctx.rotate(P.tilt);
  cutPoly(rcircle(id + 'hd', 0, -40, 40, 1.4), C.orange, { rim: 8, nojit: true });
  // hair cap
  const hair = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    hair.push([Math.cos(a) * 41, -40 + Math.sin(a) * 41]);
  }
  hair.push([30, -52], [-30, -52]);
  ctx.fillStyle = C.ink;
  pathPoly(ctx, hair);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(-14 + P.look * 5, -36, 5, 0, Math.PI * 2);
  ctx.arc(14 + P.look * 5, -36, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(P.look * 5, -26, 10, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
