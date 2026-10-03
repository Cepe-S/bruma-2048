/** Delta-time motion helpers (wall-clock duration, uncapped rAF steps). */

export function easeOutCubic(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/**
 * Runs fn(now, elapsedMs, t) each frame until durationMs; t is 0..1 eased.
 * Returns cancel().
 */
export function animateDuration({ durationMs, ease = easeOutCubic, onFrame, onDone }) {
  let raf = 0;
  let start = 0;

  function cancel() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    start = 0;
  }

  function tick(now) {
    if (!start) start = now;
    const elapsed = now - start;
    const raw = durationMs > 0 ? elapsed / durationMs : 1;
    const t = ease(Math.min(1, raw));
    onFrame?.(now, elapsed, t);
    if (raw >= 1) {
      cancel();
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);
  return cancel;
}
