// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { renderAt, setContext, DURATION, FPS } from "./story/scenes.js";
import { getAudioBuffer, renderAudioWavBase64 } from "./story/audio.js";

// ---- the picture: one canvas, every frame a pure function of t ----
const canvas = document.createElement("canvas");
canvas.width = 1920;
canvas.height = 1080;
canvas.id = "stage";
setContext(canvas.getContext("2d"));

const capture = new URLSearchParams(window.location.search).has("capture");

window.renderAt = (t: number) => renderAt(t);
window.renderAudioWAV = renderAudioWavBase64;
window.STORY = { duration: DURATION, fps: FPS, width: 1920, height: 1080 };
renderAt(0);

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const play = useRef({ ctx: null, src: null, startedAt: 0, offset: 0, raf: 0 });

  useEffect(() => {
    host.current?.appendChild(canvas);
    window.__ready = true;
    return () => {
      canvas.remove();
    };
  }, []);

  // preview-only transport (not used by the exporter)
  const stop = () => {
    const p = play.current;
    cancelAnimationFrame(p.raf);
    try {
      p.src?.stop();
    } catch (e) {
      /* already stopped */
    }
    p.src = null;
    setPlaying(false);
  };

  const start = async (from: number) => {
    stop();
    setBusy(true);
    const buf = await getAudioBuffer();
    setBusy(false);
    const p = play.current;
    p.ctx = p.ctx || new AudioContext();
    await p.ctx.resume();
    const src = p.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(p.ctx.destination);
    src.start(0, from);
    p.src = src;
    p.startedAt = p.ctx.currentTime;
    p.offset = from;
    setPlaying(true);
    const tick = () => {
      const now = p.offset + (p.ctx.currentTime - p.startedAt);
      if (now >= DURATION) {
        renderAt(DURATION - 1 / FPS);
        setT(DURATION - 1 / FPS);
        stop();
        return;
      }
      renderAt(now);
      setT(now);
      p.raf = requestAnimationFrame(tick);
    };
    p.raf = requestAnimationFrame(tick);
  };

  const scrub = (v: number) => {
    const wasPlaying = playing;
    stop();
    renderAt(v);
    setT(v);
    if (wasPlaying) start(v);
  };

  if (capture) {
    return <div ref={host} style={{ position: "fixed", left: 0, top: 0, width: 1920, height: 1080 }} />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#1b1b1b] p-4">
      <div ref={host} className="w-full max-w-[1280px] [&>canvas]:h-auto [&>canvas]:w-full" />
      <div className="flex w-full max-w-[1280px] items-center gap-4 text-[#e9e3d5]">
        <button
          className="rounded bg-[#e76f51] px-5 py-2 font-bold text-[#1b1b1b] disabled:opacity-50"
          disabled={busy}
          onClick={() => (playing ? stop() : start(t >= DURATION - 0.1 ? 0 : t))}
        >
          {busy ? "Synthesising audio…" : playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={DURATION - 1 / FPS}
          step={1 / FPS}
          value={t}
          onChange={(e) => scrub(parseFloat(e.target.value))}
          className="flex-1 accent-[#2a9d8f]"
        />
        <span className="w-24 text-right font-mono text-sm">
          {fmt(t)} / {fmt(DURATION)}
        </span>
      </div>
    </div>
  );
}
