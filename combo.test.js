import assert from "node:assert/strict";
import test from "node:test";
import {
  clampComboGap,
  comboBurst,
  comboHeat,
  COMBO_BURST_PEAK,
  COMBO_PEAK,
  COMBO_SHOW_MIN,
  createCombo,
  DEFAULT_COMBO_GAP_MS,
  expireCombo,
  MAX_COMBO_GAP_MS,
  MIN_COMBO_GAP_MS,
  noteComboMove,
  resetCombo,
} from "./combo.js";

const GAP = 600;

test("moves inside the gap join one combo", () => {
  const combo = createCombo();
  noteComboMove(combo, { dir: "left", gained: 4, at: 1000, gapMs: GAP });
  assert.equal(combo.phase, "arming");
  assert.equal(combo.count, 1);

  noteComboMove(combo, { dir: "up", gained: 8, at: 1400, gapMs: GAP });
  noteComboMove(combo, { dir: "right", gained: 16, at: 1999, gapMs: GAP });

  assert.equal(combo.phase, "live");
  assert.equal(combo.count, 3);
  assert.equal(combo.gained, 28);
  assert.deepEqual(combo.dirs, ["left", "up", "right"]);
});

test("a pause of at least the gap starts a new chain", () => {
  const combo = createCombo();
  noteComboMove(combo, { dir: "left", gained: 4, at: 1000, gapMs: GAP });
  noteComboMove(combo, { dir: "up", gained: 8, at: 1300, gapMs: GAP });
  const next = noteComboMove(combo, { dir: "down", gained: 32, at: 1300 + GAP, gapMs: GAP });

  assert.equal(next.state, "arming");
  assert.equal(next.count, 1);
  assert.equal(next.gained, 32);
  assert.deepEqual(next.dirs, ["down"]);
});

test("the gap closes a live combo and drops a lone move", () => {
  const live = createCombo();
  noteComboMove(live, { dir: "left", gained: 4, at: 0, gapMs: GAP });
  noteComboMove(live, { dir: "left", gained: 8, at: 200, gapMs: GAP });
  const ended = expireCombo(live, 200 + GAP, GAP);
  assert.equal(ended.state, "ended");
  assert.equal(ended.count, 2);
  assert.equal(ended.gained, 12);

  const lone = createCombo();
  noteComboMove(lone, { dir: "up", gained: 0, at: 0, gapMs: GAP });
  const idle = expireCombo(lone, GAP, GAP);
  assert.equal(idle.state, "idle");
  assert.equal(idle.count, 0);
});

test("expiring early leaves the chain open", () => {
  const combo = createCombo();
  noteComboMove(combo, { dir: "left", gained: 4, at: 0, gapMs: GAP });
  noteComboMove(combo, { dir: "right", gained: 4, at: 100, gapMs: GAP });
  const still = expireCombo(combo, 100 + GAP - 1, GAP);
  assert.equal(still.state, "live");
  assert.equal(still.count, 2);
});

test("reset clears the chain", () => {
  const combo = createCombo();
  noteComboMove(combo, { dir: "left", gained: 4, at: 0, gapMs: GAP });
  noteComboMove(combo, { dir: "up", gained: 4, at: 10, gapMs: GAP });
  resetCombo(combo);
  assert.equal(combo.phase, "idle");
  assert.equal(combo.count, 0);
  assert.deepEqual(combo.dirs, []);
});

test("combo heat stays off until the badge, then fills in at the peak", () => {
  assert.equal(comboHeat(COMBO_SHOW_MIN - 1), 0);
  assert.equal(comboHeat(COMBO_SHOW_MIN), 0.1);
  assert.equal(comboHeat(COMBO_PEAK), 1);
  assert.equal(comboHeat(80), 1);
  assert.ok(comboHeat(30) > comboHeat(COMBO_SHOW_MIN));
  assert.ok(comboHeat(30) < 1);
});

test("the ending burst grows until 100", () => {
  assert.equal(comboBurst(COMBO_SHOW_MIN - 1), 0);
  assert.equal(comboBurst(COMBO_SHOW_MIN), 0.18);
  assert.equal(comboBurst(COMBO_BURST_PEAK), 1);
  assert.equal(comboBurst(140), 1);
  assert.ok(comboBurst(50) > comboBurst(COMBO_SHOW_MIN));
  assert.ok(comboBurst(50) < 1);
});

test("gap clamps to the editable range", () => {
  assert.equal(clampComboGap("nope"), DEFAULT_COMBO_GAP_MS);
  assert.equal(clampComboGap(10), MIN_COMBO_GAP_MS);
  assert.equal(clampComboGap(9000), MAX_COMBO_GAP_MS);
  assert.equal(clampComboGap(750.4), 750);
});
