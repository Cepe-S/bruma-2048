import assert from "node:assert/strict";
import test from "node:test";
import {
  applySave,
  boardValues,
  canUndo,
  createState,
  finishTurn,
  hasMoves,
  loadBoard,
  move,
  parseSave,
  serializeGame,
  settle,
  snapshotPlayable,
  spawn,
  startGame,
  undoLast,
} from "./engine.js";

function setup(values, rng = () => 0.5) {
  const state = createState(rng, values.length);
  loadBoard(state, values);
  return state;
}

function play(state, dir) {
  const result = move(state, dir);
  settle(state);
  return result;
}

test("two equal tiles merge once when sliding left", () => {
  const state = setup([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const { moved, gained } = play(state, "left");
  assert.equal(moved, true);
  assert.equal(gained, 4);
  assert.deepEqual(boardValues(state)[0], [4, 0, 0, 0]);
  assert.equal(state.score, 4);
});

test("three equal tiles leave a leftover (no double merge)", () => {
  const state = setup([
    [2, 2, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.deepEqual(boardValues(state)[0], [4, 2, 0, 0]);
  assert.equal(state.score, 4);
});

test("two separate pairs merge in one move", () => {
  const state = setup([
    [2, 2, 4, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.deepEqual(boardValues(state)[0], [4, 8, 0, 0]);
  assert.equal(state.score, 12);
});

test("four equal tiles become two merged tiles", () => {
  const state = setup([
    [2, 2, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.deepEqual(boardValues(state)[0], [4, 4, 0, 0]);
});

test("gaps collapse before merging", () => {
  const state = setup([
    [2, 0, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.deepEqual(boardValues(state)[0], [4, 0, 0, 0]);
});

test("tiles do not merge twice across a just-merged tile", () => {
  const state = setup([
    [4, 2, 2, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.deepEqual(boardValues(state)[0], [4, 4, 0, 0]);
});

test("right, up, and down use the same merge rules", () => {
  const right = setup([
    [0, 0, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(right, "right");
  assert.deepEqual(boardValues(right)[0], [0, 0, 0, 4]);

  const up = setup([
    [2, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(up, "up");
  assert.deepEqual(boardValues(up).map((row) => row[0]), [4, 0, 0, 0]);

  const down = setup([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [2, 0, 0, 0],
    [2, 0, 0, 0],
  ]);
  play(down, "down");
  assert.deepEqual(boardValues(down).map((row) => row[0]), [0, 0, 0, 4]);
});

test("a blocked board reports no movement and no score change", () => {
  const state = setup([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]);
  const { moved, gained } = play(state, "left");
  assert.equal(moved, false);
  assert.equal(gained, 0);
  assert.equal(state.score, 0);
});

test("spawn is 2 about 90% of the time and 4 about 10%", () => {
  // Each spawn rolls once for the empty cell, then once for 2 vs 4.
  const seq = [0, 0.5, 0, 0.89, 0, 0.9, 0, 0.99];
  let i = 0;
  const state = createState(() => seq[i++]);
  loadBoard(state, [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const values = [spawn(state).value, spawn(state).value, spawn(state).value, spawn(state).value];
  assert.deepEqual(values, [2, 2, 4, 4]);
});

test("reaching 2048 sets won without ending the game", () => {
  const state = setup([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  play(state, "left");
  assert.equal(state.won, true);
  assert.equal(state.over, false);
  assert.equal(boardValues(state)[0][0], 2048);
});

test("game over when the board is full and no adjacent equals remain", () => {
  const state = setup([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 8],
  ]);
  assert.equal(hasMoves(state), false);
  state.over = !hasMoves(state);
  assert.equal(state.over, true);
});

test("a full board with one merge still has a move", () => {
  const state = setup([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 8, 8],
  ]);
  assert.equal(hasMoves(state), true);
});

test("new game places exactly two tiles", () => {
  const state = createState(() => 0.1);
  startGame(state);
  assert.equal(state.tiles.length, 2);
  assert.equal(state.score, 0);
  assert.equal(state.over, false);
});

function fullTurn(state, dir) {
  const before = snapshotPlayable(state);
  const result = move(state, dir);
  if (!result.moved) return result;
  state.undo = before;
  settle(state);
  finishTurn(state);
  return result;
}

test("undo restores board, score, and the tile spawned after the move", () => {
  let n = 0;
  const state = createState(() => {
    n += 1;
    return 0.01;
  });
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const beforeBoard = boardValues(state);
  fullTurn(state, "left");
  assert.equal(canUndo(state), true);
  assert.equal(state.score, 4);
  assert.notDeepEqual(boardValues(state), beforeBoard);
  assert.equal(undoLast(state), true);
  assert.deepEqual(boardValues(state), beforeBoard);
  assert.equal(state.score, 0);
  assert.equal(canUndo(state), false);
});

test("undo is a no-op when there is no history", () => {
  const state = setup([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.equal(canUndo(state), false);
  assert.equal(undoLast(state), false);
  assert.deepEqual(boardValues(state)[0], [2, 0, 0, 0]);
});

test("only the last successful move can be undone", () => {
  const state = createState(() => 0.01);
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  fullTurn(state, "left");
  const afterFirst = boardValues(state);
  const scoreAfterFirst = state.score;
  fullTurn(state, "down");
  undoLast(state);
  assert.deepEqual(boardValues(state), afterFirst);
  assert.equal(state.score, scoreAfterFirst);
  assert.equal(undoLast(state), false);
});

test("undo does not lower the best-score high-water mark", () => {
  const state = createState(() => 0.01);
  state.best = 0;
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  fullTurn(state, "left");
  assert.equal(state.score, 4);
  assert.equal(state.best, 4);
  undoLast(state);
  assert.equal(state.score, 0);
  assert.equal(state.best, 4);
});

test("a failed move does not replace undo history", () => {
  const state = setup([
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const before = snapshotPlayable(state);
  const merged = move(state, "left");
  assert.equal(merged.moved, true);
  settle(state);
  state.undo = before;
  const blocked = move(state, "left");
  assert.equal(blocked.moved, false);
  assert.equal(canUndo(state), true);
  undoLast(state);
  assert.deepEqual(boardValues(state)[0], [2, 2, 0, 0]);
  assert.equal(state.score, 0);
});

test("undo restores won and over flags", () => {
  const state = setup([
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  fullTurn(state, "left");
  assert.equal(state.won, true);
  undoLast(state);
  assert.equal(state.won, false);
  assert.equal(boardValues(state)[0][0], 1024);

  const trapped = setup([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 0, 8],
  ]);
  const before = snapshotPlayable(trapped);
  const result = move(trapped, "left");
  assert.equal(result.moved, true);
  trapped.undo = before;
  settle(trapped);
  spawn(trapped, { cell: { r: 3, c: 3 }, value: 2 });
  trapped.over = !hasMoves(trapped);
  assert.equal(trapped.over, true);
  undoLast(trapped);
  assert.equal(trapped.over, false);
  assert.deepEqual(boardValues(trapped)[3], [4, 2, 0, 8]);
});

test("new game clears undo history", () => {
  const state = createState(() => 0.1);
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  fullTurn(state, "left");
  assert.equal(canUndo(state), true);
  startGame(state);
  assert.equal(canUndo(state), false);
});

test("finishTurn spawns after a successful move", () => {
  let n = 0;
  const rng = () => {
    n += 1;
    return 0.01;
  };
  const state = createState(rng);
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const { moved } = move(state, "left");
  assert.equal(moved, true);
  settle(state);
  const before = state.tiles.length;
  finishTurn(state);
  assert.equal(state.tiles.length, before + 1);
});

test("serializeGame round-trips board, score, flags, and undo", () => {
  const state = createState(() => 0.01);
  loadBoard(state, [
    [2, 2, 0, 0],
    [0, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  fullTurn(state, "left");
  const saved = serializeGame(state);
  const json = JSON.stringify(saved);
  const restored = createState();
  restored.best = 80;
  assert.equal(applySave(restored, json), true);
  assert.deepEqual(boardValues(restored), boardValues(state));
  assert.equal(restored.score, state.score);
  assert.equal(restored.won, state.won);
  assert.equal(restored.continued, state.continued);
  assert.equal(restored.over, state.over);
  assert.equal(canUndo(restored), true);
  assert.equal(restored.best, 80);
  undoLast(restored);
  undoLast(state);
  assert.deepEqual(boardValues(restored), boardValues(state));
});

test("parseSave rejects missing or corrupt payloads", () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave(""), null);
  assert.equal(parseSave("{not json"), null);
  assert.equal(parseSave({ tiles: [] }), null);
  assert.equal(
    parseSave({
      nextId: 2,
      tiles: [{ id: 1, value: 3, row: 0, col: 0 }],
      score: 0,
      won: false,
      continued: false,
      over: false,
    }),
    null,
  );
  assert.equal(
    parseSave({
      nextId: 3,
      tiles: [
        { id: 1, value: 2, row: 0, col: 0 },
        { id: 2, value: 4, row: 0, col: 0 },
      ],
      score: 0,
      won: false,
      continued: false,
      over: false,
    }),
    null,
  );
});

test("applySave never lowers best score", () => {
  const state = createState();
  state.best = 200;
  const ok = applySave(state, {
    nextId: 3,
    tiles: [
      { id: 1, value: 2, row: 0, col: 0 },
      { id: 2, value: 4, row: 1, col: 1 },
    ],
    score: 12,
    won: false,
    continued: false,
    over: false,
    undo: null,
  });
  assert.equal(ok, true);
  assert.equal(state.best, 200);
  assert.equal(state.score, 12);
});

test("SIZE 5: equal tiles merge when sliding left", () => {
  const state = setup([
    [2, 2, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ]);
  const { moved, gained } = play(state, "left");
  assert.equal(state.size, 5);
  assert.equal(moved, true);
  assert.equal(gained, 4);
  assert.deepEqual(boardValues(state)[0], [4, 0, 0, 0, 0]);
  assert.equal(boardValues(state).length, 5);
  assert.equal(boardValues(state)[0].length, 5);
});

test("SIZE 5: far-edge tiles stay in bounds and can merge", () => {
  const state = setup([
    [0, 0, 0, 0, 2],
    [0, 0, 0, 0, 2],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ]);
  const blocked = play(state, "right");
  assert.equal(blocked.moved, false);
  for (const tile of state.tiles) {
    assert.ok(tile.row >= 0 && tile.row < 5);
    assert.ok(tile.col >= 0 && tile.col < 5);
    assert.equal(tile.col, 4);
  }
  play(state, "down");
  assert.deepEqual(
    boardValues(state).map((row) => row[4]),
    [0, 0, 0, 0, 4],
  );
  for (const tile of state.tiles) {
    assert.ok(tile.row >= 0 && tile.row < 5);
    assert.ok(tile.col >= 0 && tile.col < 5);
  }
});

test("SIZE 5: a 4×4 save is rejected for a 5×5 game", () => {
  const saved = {
    nextId: 3,
    size: 4,
    tiles: [
      { id: 1, value: 2, row: 0, col: 0 },
      { id: 2, value: 4, row: 3, col: 3 },
    ],
    score: 0,
    won: false,
    continued: false,
    over: false,
  };
  assert.equal(parseSave(saved, 5), null);
  const five = createState(Math.random, 5);
  assert.equal(applySave(five, saved, 5), false);
});

test("serializeGame records the board size", () => {
  const state = setup([
    [2, 0, 0, 0, 8],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 4],
  ]);
  const saved = serializeGame(state);
  assert.equal(saved.size, 5);
  const restored = createState(() => 0.5, 5);
  assert.equal(applySave(restored, saved, 5), true);
  assert.equal(restored.size, 5);
  assert.deepEqual(boardValues(restored), boardValues(state));
});
