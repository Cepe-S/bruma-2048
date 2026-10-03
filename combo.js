/** Pause, in milliseconds, that ends a combo. Edit this value in code. */

/** Same threshold as the combo badge. Below this, nothing answers. */
export const COMBO_SHOW_MIN = 15;
/** Chain length where the board and background reach full intensity. */
export const COMBO_PEAK = 50;
/** Chain length where the ending burst is at full size. */
export const COMBO_BURST_PEAK = 100;

/**
 * Quiet at the first shown combo, full at the peak.
 * 0 before the badge exists.
 */
export function comboHeat(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < COMBO_SHOW_MIN) return 0;
  const span = COMBO_PEAK - COMBO_SHOW_MIN;
  const t = Math.min(1, (n - COMBO_SHOW_MIN) / span);
  return 0.1 + t * 0.9;
}

/** 0 before the badge. Small at ×15, full at ×100. */
export function comboBurst(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < COMBO_SHOW_MIN) return 0;
  const span = COMBO_BURST_PEAK - COMBO_SHOW_MIN;
  const t = Math.min(1, (n - COMBO_SHOW_MIN) / span);
  return 0.18 + t * 0.82;
}

export const DEFAULT_COMBO_GAP_MS = 600;
export const MIN_COMBO_GAP_MS = 160;
export const MAX_COMBO_GAP_MS = 5000;

export function clampComboGap(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COMBO_GAP_MS;
  return Math.min(MAX_COMBO_GAP_MS, Math.max(MIN_COMBO_GAP_MS, Math.round(n)));
}

export function createCombo() {
  return {
    count: 0,
    gained: 0,
    dirs: [],
    lastAt: null,
    phase: "idle",
  };
}

function snapshot(combo) {
  return {
    state: combo.phase,
    count: combo.count,
    gained: combo.gained,
    dirs: combo.dirs.slice(),
    lastAt: combo.lastAt,
  };
}

/**
 * Fold a successful move into the open chain when it lands before `gapMs`
 * since the previous one. A pause of `gapMs` or more starts a new chain.
 * Phase is `arming` for a single move and `live` from the second.
 */
export function noteComboMove(combo, { dir, gained = 0, at, gapMs }) {
  const open = combo.phase === "arming" || combo.phase === "live";
  const continues = open && combo.lastAt != null && at - combo.lastAt < gapMs;

  if (!continues) {
    combo.count = 0;
    combo.gained = 0;
    combo.dirs = [];
  }

  combo.count += 1;
  combo.gained += gained;
  combo.dirs.push(dir);
  combo.lastAt = at;
  combo.phase = combo.count >= 2 ? "live" : "arming";
  return snapshot(combo);
}

/** Close the chain once `gapMs` has passed since the last move. */
export function expireCombo(combo, at, gapMs) {
  const open = combo.phase === "arming" || combo.phase === "live";
  if (!open || combo.lastAt == null || at - combo.lastAt < gapMs) return snapshot(combo);

  if (combo.count >= 2) {
    combo.phase = "ended";
  } else {
    combo.count = 0;
    combo.gained = 0;
    combo.dirs = [];
    combo.lastAt = null;
    combo.phase = "idle";
  }
  return snapshot(combo);
}

export function resetCombo(combo) {
  combo.count = 0;
  combo.gained = 0;
  combo.dirs = [];
  combo.lastAt = null;
  combo.phase = "idle";
  return snapshot(combo);
}
