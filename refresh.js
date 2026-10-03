/** Display refresh-rate estimation from rAF intervals (no hard 60 Hz cap). */

let cachedHz = 0;
let bootPromise = null;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function hzFromFrameDeltas(deltas) {
  const usable = deltas.filter((dt) => dt > 0 && dt < 120);
  if (!usable.length) return 0;
  const med = median(usable);
  if (!med) return 0;
  return Math.round(1000 / med);
}

/**
 * One-shot rAF sampling. Resolves estimated display Hz (e.g. 60, 90, 120).
 */
export function measureRefreshRate(durationMs = 900) {
  return new Promise((resolve) => {
    const samples = [];
    let start = 0;
    let last = 0;
    let raf = 0;

    function finish() {
      if (raf) cancelAnimationFrame(raf);
      const hz = hzFromFrameDeltas(samples) || 60;
      cachedHz = hz;
      resolve(hz);
    }

    function tick(now) {
      if (document.hidden) {
        finish();
        return;
      }
      if (!start) {
        start = now;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = now - last;
      last = now;
      if (dt > 0) samples.push(dt);
      if (now - start >= durationMs) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
  });
}

export function initRefreshRate() {
  if (!bootPromise) {
    bootPromise = measureRefreshRate().catch(() => {
      cachedHz = 60;
      return cachedHz;
    });
  }
  return bootPromise;
}

export function getRefreshHz() {
  return cachedHz || 0;
}

export function autoDegradeThreshold(hz = getRefreshHz()) {
  const base = hz > 0 ? hz : 60;
  return Math.max(30, Math.round(base * 0.55));
}
