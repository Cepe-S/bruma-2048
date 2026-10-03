/** Visual quality presets for mobile performance. */

import { autoDegradeThreshold, getRefreshHz } from "./refresh.js";

export const QUALITY_KEY = "bruma-2048-quality";
export const QUALITY_DEGRADED_KEY = "bruma-2048-quality-degraded";

export const MODES = ["high", "low", "auto"];

const AUTO_SAMPLE_MS = 2000;
const AUTO_RECHECK_MS = 30000;

export function readQualityMode() {
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    if (MODES.includes(raw)) return raw;
  } catch {
    /* private mode */
  }
  return "auto";
}

export function persistQualityMode(mode) {
  try {
    localStorage.setItem(QUALITY_KEY, mode);
  } catch {
    /* private mode */
  }
}

export function readDegradedFlag() {
  try {
    return localStorage.getItem(QUALITY_DEGRADED_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistDegradedFlag(on) {
  try {
    localStorage.setItem(QUALITY_DEGRADED_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** Effective tier used for rendering (auto may map to low). */
export function effectiveTier(mode, degraded = readDegradedFlag()) {
  if (mode === "low") return "low";
  if (mode === "auto" && degraded) return "low";
  return "high";
}

export function qualityLabel(mode, degraded = readDegradedFlag()) {
  if (mode === "high") return "Alta";
  if (mode === "low") return "Baja";
  return degraded ? "Auto (baja)" : "Auto";
}

export function qualityProfile(mode, degraded = readDegradedFlag()) {
  const tier = effectiveTier(mode, degraded);
  const low = tier === "low";
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return {
    tier,
    mode,
    degraded,
    /** Game tile slides: rAF + delta-time at display rate (not capped at 60). */
    nativeMotion: !low,
    /** WebGL background only — does not limit UI or tile motion. */
    targetFps: low ? 20 : 30,
    pixelRatio: low ? 1 : Math.min(dpr, 2),
    maxSegments: low ? 10 : undefined,
    mistBlurMax: low ? 0 : 22,
    grain: !low,
    tileGlow: !low,
    backdropBlur: !low,
    burstScale: low ? 0.35 : 1,
    comboMotion: !low,
  };
}

export function applyQualityClass(profile) {
  document.body.classList.toggle("is-quality-low", profile.tier === "low");
  document.body.classList.toggle("is-native-motion", Boolean(profile.nativeMotion));
  document.body.dataset.quality = profile.mode;
  document.body.dataset.qualityTier = profile.tier;
}

/**
 * Lightweight FPS sampler for Auto mode only. Does not run in High/Low.
 * Calls onDegrade once when sustained FPS drops below threshold.
 */
export function createAutoDegrader({ getMode, onDegrade }) {
  let raf = 0;
  let timer = 0;
  let sampling = false;
  let frames = 0;
  let sampleStart = 0;
  let lastFrame = 0;

  function stopSample() {
    sampling = false;
    frames = 0;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function finishSample() {
    stopSample();
    if (getMode() !== "auto" || readDegradedFlag()) return;
    const elapsed = performance.now() - sampleStart;
    if (elapsed < AUTO_SAMPLE_MS * 0.9) return;
    const fps = (frames * 1000) / elapsed;
    const threshold = autoDegradeThreshold(getRefreshHz());
    if (fps < threshold) {
      persistDegradedFlag(true);
      onDegrade?.();
    }
  }

  function tick(now) {
    if (!sampling) return;
    if (lastFrame) frames += 1;
    lastFrame = now;
    if (now - sampleStart >= AUTO_SAMPLE_MS) {
      finishSample();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function startSample() {
    if (sampling || getMode() !== "auto" || readDegradedFlag()) return;
    if (document.hidden) return;
    stopSample();
    sampling = true;
    frames = 0;
    sampleStart = performance.now();
    lastFrame = 0;
    raf = requestAnimationFrame(tick);
  }

  function schedule() {
    clearTimeout(timer);
    if (getMode() !== "auto" || readDegradedFlag()) return;
    timer = window.setTimeout(startSample, AUTO_RECHECK_MS);
  }

  function onVisibility() {
    if (document.hidden) stopSample();
    else schedule();
  }

  function start() {
    if (getMode() !== "auto" || readDegradedFlag()) return;
    window.setTimeout(startSample, 1200);
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
  }

  function stop() {
    stopSample();
    clearTimeout(timer);
    timer = 0;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function resetDegraded() {
    persistDegradedFlag(false);
  }

  return { start, stop, resetDegraded, schedule };
}
