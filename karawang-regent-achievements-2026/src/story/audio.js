// Soundtrack synthesised in code (Web Audio, rendered offline => identical every time).
// 120 BPM, 4/4: beat = 0.5 s, bar = 2 s. Every cue below sits on the 0.5 s grid used by the picture.

const SR = 44100;
const DUR = 60;

let cached = null;

export function getAudioBuffer() {
  if (!cached) cached = build();
  return cached;
}

async function build() {
  const oc = new OfflineAudioContext(2, SR * DUR, SR);
  const comp = oc.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(oc.destination);
  const bus = oc.createGain();
  bus.gain.value = 1.6;
  bus.connect(comp);

  // seeded noise
  const nb = oc.createBuffer(1, SR, SR);
  const nd = nb.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < nd.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    nd[i] = (s >>> 8) / 8388608 - 1;
  }

  const out = (node, pan = 0) => {
    const p = oc.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(bus);
  };
  function tone(t, f, d, g, o = {}) {
    const osc = oc.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + d);
    const ga = oc.createGain();
    const a = o.att || 0.004;
    ga.gain.setValueAtTime(0.0001, t);
    ga.gain.linearRampToValueAtTime(g, t + a);
    ga.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(ga);
    out(ga, o.pan || 0);
    osc.start(t);
    osc.stop(t + d + 0.02);
  }
  function hit(t, d, g, freq, q, pan = 0) {
    const src = oc.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = oc.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const ga = oc.createGain();
    ga.gain.setValueAtTime(g, t);
    ga.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(ga);
    out(ga, pan);
    src.start(t);
    src.stop(t + d + 0.02);
  }
  function swell(t, d, g, f0, f1) {
    const src = oc.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const f = oc.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + d);
    const ga = oc.createGain();
    ga.gain.setValueAtTime(0.0001, t);
    ga.gain.linearRampToValueAtTime(g, t + d * 0.5);
    ga.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(ga);
    out(ga, 0);
    src.start(t);
    src.stop(t + d + 0.02);
  }
  const marimba = (t, f, g, pan = 0) => {
    tone(t, f, 0.5, g, { att: 0.003, pan });
    tone(t, f * 4, 0.11, g * 0.32, { att: 0.002, pan });
  };
  const thud = (t, g = 0.3) => tone(t, 130, 0.16, g, { glide: 52, att: 0.002 });

  const chords = [
    { r: 130.81, n: [261.63, 329.63, 392.0, 523.25, 659.25] }, // C
    { r: 110.0, n: [220.0, 261.63, 329.63, 440.0, 523.25] }, // Am
    { r: 87.31, n: [174.61, 220.0, 261.63, 349.23, 440.0] }, // F
    { r: 98.0, n: [196.0, 293.66, 392.0, 493.88, 587.33] }, // G
  ];

  for (let b = 0; b < 30; b++) {
    const t0 = b * 2;
    const ch = chords[b % 4];
    const last = b === 29;
    for (let k = 0; k < 4; k++) {
      const tb = t0 + k * 0.5;
      if (last && k > 0) break;
      // paper tick on every beat, softer 8th between from bar 6
      hit(tb, 0.025, b < 5 ? 0.05 : 0.08, 6500, 2, k % 2 ? 0.25 : -0.25);
      if (b >= 5 && !last) hit(tb + 0.25, 0.02, 0.03, 7500, 2, 0.1);
      // marimba
      if (b < 5) {
        if (k === 0) marimba(tb, ch.n[1], 0.17, -0.2);
        if (k === 2) marimba(tb, ch.n[3], 0.15, 0.2);
      } else if (b < 23) {
        marimba(tb, ch.n[[0, 2, 1, 3][k]], 0.15, k % 2 ? 0.25 : -0.25);
        if (k % 2) marimba(tb + 0.25, ch.n[4], 0.09, 0.3);
      } else if (!last) {
        const idx = [0, 2, 1, 3, 2, 4, 3, 1];
        marimba(tb, ch.n[idx[k * 2]], 0.15, k % 2 ? 0.25 : -0.25);
        marimba(tb + 0.25, ch.n[idx[k * 2 + 1]], 0.1, 0.3);
      }
      // bass + wooden thud
      if (b >= 5 && !last && (k === 0 || k === 2)) {
        tone(tb, k === 0 ? ch.r : ch.r * 1.5, 0.45, 0.2, { att: 0.01 });
        thud(tb, 0.26);
      }
      // snare-like paper tap
      if (b >= 17 && !last && (k === 1 || k === 3)) hit(tb, 0.09, 0.11, 1800, 0.8, 0);
    }
    // counter melody and pad
    if (b >= 17 && b < 23) {
      tone(t0, ch.n[3] * 2, 1.7, 0.05, { type: 'triangle', att: 0.05, pan: 0.15 });
      tone(t0 + 1, ch.n[4], 0.9, 0.045, { type: 'triangle', att: 0.05, pan: -0.15 });
    }
    if (b >= 23 && !last) {
      [0, 2, 3].forEach((i) => tone(t0, ch.n[i], 1.9, 0.035, { type: 'triangle', att: 0.3, pan: (i - 2) * 0.15 }));
    }
  }

  // ---- picture cues (all on the beat grid)
  thud(0, 0.35);
  hit(0, 0.12, 0.12, 900, 0.7, 0);
  [2.5, 3, 3.5, 4, 4.5].forEach((t, i) => marimba(t, [523.25, 587.33, 659.25, 783.99, 880][i], 0.2, -0.1 + i * 0.05));
  swell(0, 1.0, 0.04, 400, 1400); // title slap whoosh
  hit(2, 0.1, 0.1, 700, 0.8);
  hit(7.5, 0.08, 0.14, 2500, 1.2);
  tone(7.5, 783.99, 0.25, 0.1);
  swell(9, 1.0, 0.07, 500, 2500);
  swell(10.5, 1.5, 0.05, 300, 1500); // axis roll
  [12, 15, 18].forEach((t) => {
    thud(t, 0.28);
    tone(t, 1318.5, 0.14, 0.09);
  });
  [13.5, 16.5, 19.5].forEach((t, i) => marimba(t, [659.25, 783.99, 880][i], 0.17));
  swell(22, 2, 0.06, 400, 1800);
  [24, 27, 30, 31.5, 32].forEach((t) => {
    thud(t, 0.28);
    tone(t, 1174.7, 0.14, 0.08);
  });
  [25.5, 28.5, 33.5].forEach((t) => marimba(t, 880, 0.15));
  swell(30, 1, 0.06, 500, 2200);
  swell(34, 1, 0.07, 300, 1200);
  hit(34.5, 0.9, 0.08, 3500, 1.5); // ring scratch
  hit(35.5, 0.08, 0.16, 2200, 1.2);
  tone(35.5, 1046.5, 0.3, 0.1);
  swell(38, 2, 0.07, 400, 2000);
  [40, 42, 44].forEach((t, i) => {
    swell(t - 0.25, 0.5, 0.12, 900, 2500);
    marimba(t, [659.25, 783.99, 1046.5][i], 0.2);
  });
  swell(46, 2, 0.07, 400, 1800);
  for (let i = 0; i < 6; i++) {
    hit(47.5 + i, 0.07, 0.15, 3000, 1.1, sign(i) * 0.3);
    marimba(47.5 + i, [523.25, 587.33, 659.25, 783.99, 880, 1046.5][i], 0.14, sign(i) * 0.3);
  }
  [54, 54.5, 55].forEach((t, i) => marimba(t, [659.25, 783.99, 1046.5][i], 0.22));
  swell(54, 0.7, 0.06, 600, 2400);
  swell(56, 1, 0.07, 400, 1800);
  [57, 57.5, 58].forEach((t, i) => {
    thud(t, 0.3);
    marimba(t, [523.25, 659.25, 783.99][i], 0.2);
  });
  hit(58.5, 0.08, 0.14, 2600, 1.2);
  // final held chord on the last downbeat
  [261.63, 329.63, 392.0, 523.25].forEach((f, i) => tone(58, f, 1.95, 0.1, { att: 0.02, pan: (i - 1.5) * 0.2 }));
  tone(58, 130.81, 1.95, 0.16, { att: 0.02 });

  return oc.startRendering();
}

function sign(i) {
  return i % 2 ? 1 : -1;
}

export function bufferToWav(buf) {
  const n = buf.length;
  const ab = new ArrayBuffer(44 + n * 4);
  const v = new DataView(ab);
  const ws = (o, str) => {
    for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i));
  };
  ws(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ws(36, 'data');
  v.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let o = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 0x7fff, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 0x7fff, true);
    o += 4;
  }
  return new Uint8Array(ab);
}

export async function renderAudioWavBase64() {
  const wav = bufferToWav(await getAudioBuffer());
  let bin = '';
  for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
  return btoa(bin);
}
