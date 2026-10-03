/** Lightweight performance overlay — measures only while open. */

import { getRefreshHz, hzFromFrameDeltas } from "./refresh.js";

const OPEN_KEY = "bruma-2048-perf-open";
const GRAPH_LEN = 60;
const JANK_MS = 50;

export function readPerfOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistPerfOpen(open) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function formatMb(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createPerfPanel({ getCanvasInfo } = {}) {
  const toggleBtn = document.getElementById("perf-toggle");
  const panel = document.getElementById("perf-panel");
  const fpsEl = document.getElementById("perf-fps");
  const avgEl = document.getElementById("perf-fps-avg");
  const frameEl = document.getElementById("perf-frame");
  const worstEl = document.getElementById("perf-worst");
  const jankEl = document.getElementById("perf-jank");
  const memEl = document.getElementById("perf-mem");
  const dprEl = document.getElementById("perf-dpr");
  const hzEl = document.getElementById("perf-hz");
  const canvasEl = document.getElementById("perf-canvas");
  const graphEl = document.getElementById("perf-graph");

  let open = readPerfOpen();
  let raf = 0;
  let lastTs = 0;
  let fpsInstant = 0;
  let fpsSum = 0;
  let fpsCount = 0;
  let fpsAvg = 0;
  let worst = 0;
  let jank = 0;
  let lastDt = 0;
  const graph = [];

  function drawGraph() {
    if (!graphEl) return;
    const w = graphEl.width;
    const h = graphEl.height;
    const ctx = graphEl.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(7, 16, 20, 0.35)";
    ctx.fillRect(0, 0, w, h);
    const cap = 100;
    ctx.strokeStyle = "rgba(240, 195, 90, 0.35)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h * (1 - JANK_MS / cap));
    ctx.lineTo(w, h * (1 - JANK_MS / cap));
    ctx.stroke();
    ctx.setLineDash([]);
    if (graph.length < 2) return;
    ctx.strokeStyle = "#3ecfb0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    graph.forEach((ms, i) => {
      const x = (i / (GRAPH_LEN - 1)) * w;
      const y = h - Math.min(ms, cap) / cap * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function refreshHzEstimate() {
    const boot = getRefreshHz();
    const live = hzFromFrameDeltas(graph);
    const hz = live > 0 ? live : boot;
    if (hzEl) hzEl.textContent = hz > 0 ? `${hz} Hz` : "—";
    return hz;
  }

  function refreshStatic() {
    if (dprEl) dprEl.textContent = String(window.devicePixelRatio || 1);
    refreshHzEstimate();
    const info = getCanvasInfo?.();
    if (canvasEl && info?.canvases?.length) {
      canvasEl.textContent = info.canvases
        .map((c) => `${c.label} ${c.bufW}×${c.bufH}`)
        .join(" · ");
    } else if (canvasEl) {
      canvasEl.textContent = "—";
    }
    const mem = performance.memory;
    if (memEl) {
      memEl.textContent = mem ? formatMb(mem.usedJSHeapSize) : "—";
    }
  }

  function paint() {
    if (fpsEl) fpsEl.textContent = fpsInstant.toFixed(0);
    if (avgEl) avgEl.textContent = fpsAvg.toFixed(0);
    if (frameEl) frameEl.textContent = lastDt ? `${lastDt.toFixed(1)} ms` : "—";
    if (worstEl) worstEl.textContent = worst ? `${worst.toFixed(1)} ms` : "—";
    if (jankEl) jankEl.textContent = String(jank);
    refreshHzEstimate();
    drawGraph();
  }

  function tick(now) {
    if (!open) return;
    if (lastTs) {
      const dt = now - lastTs;
      lastDt = dt;
      fpsInstant = 1000 / dt;
      fpsSum += fpsInstant;
      fpsCount += 1;
      fpsAvg = fpsSum / fpsCount;
      if (dt > worst) worst = dt;
      if (dt > JANK_MS) jank += 1;
      graph.push(dt);
      if (graph.length > GRAPH_LEN) graph.shift();
      paint();
    }
    lastTs = now;
    raf = requestAnimationFrame(tick);
  }

  function setOpen(next) {
    open = next;
    persistPerfOpen(open);
    if (panel) {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      toggleBtn.classList.toggle("is-on", open);
    }
    if (open) {
      lastTs = 0;
      worst = 0;
      jank = 0;
      fpsSum = 0;
      fpsCount = 0;
      fpsAvg = 0;
      graph.length = 0;
      refreshStatic();
      paint();
      if (!raf) raf = requestAnimationFrame(tick);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTs = 0;
    }
  }

  toggleBtn?.addEventListener("click", () => setOpen(!open));
  setOpen(open);

  return {
    isOpen() {
      return open;
    },
    setOpen,
    refreshStatic,
  };
}
