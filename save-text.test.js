import assert from "node:assert/strict";
import test from "node:test";
import { applySave, boardValues, createState, loadBoard, serializeGame } from "./engine.js";
import { formatSave, parseSaveText, readSave } from "./save-text.js";

function setup(values) {
  const state = createState(() => 0.5, values.length);
  loadBoard(state, values);
  return state;
}

test("formatSave round-trips board, score, flags, best, and undo", () => {
  const state = setup([
    [2, 0, 0, 4],
    [0, 8, 0, 0],
    [0, 0, 16, 0],
    [0, 0, 0, 0],
  ]);
  state.score = 28;
  state.best = 80;
  state.won = false;
  state.continued = true;
  state.over = false;
  state.undo = {
    size: 4,
    nextId: 2,
    tiles: [{ id: 1, value: 2, row: 0, col: 0, removing: false }],
    score: 12,
    won: false,
    continued: false,
    over: false,
  };

  const text = formatSave(state);
  assert.match(text, /^# Bruma 2048/);
  assert.match(text, /Tablero:/);
  assert.match(text, /Deshacer:/);
  assert.match(text, /^ 2 {3}\. {3}\. {3}4$/m);

  const parsed = parseSaveText(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.best, 80);

  const restored = createState();
  restored.best = 10;
  assert.equal(applySave(restored, parsed.save), true);
  assert.deepEqual(boardValues(restored), boardValues(state));
  assert.equal(restored.score, 28);
  assert.equal(restored.won, false);
  assert.equal(restored.continued, true);
  assert.equal(restored.over, false);
  assert.equal(restored.undo.score, 12);
  assert.equal(boardValues(restored.undo)[0][0], 2);
});

test("a notepad file can be messy and still load", () => {
  const parsed = parseSaveText(`\uFEFF# mi partida\r
\r
tamano: 4\r
puntaje: 12   # puntos de ahora\r
mejor: 40\r
llegaste a 2048: no\r
seguis jugando: si\r
partida terminada: no\r
\r
tablero:\r
2  2  .  4\r
.  8  0  .\r
16 -  .  2\r
.  .  4  vacio\r
\r
----------\r
deshacer:\r
puntaje: 8\r
\r
2 2 . 4\r
. 8 . .\r
16 . . 2\r
. . 4 .\r
`);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.best, 40);
  assert.equal(parsed.save.score, 12);
  assert.equal(parsed.save.continued, true);
  assert.deepEqual(parsed.save.tiles.find((tile) => tile.row === 2 && tile.col === 0).value, 16);
  assert.equal(parsed.save.undo.score, 8);
  assert.equal(parsed.save.undo.tiles.length, 7);
});

test("a bare grid is enough", () => {
  const parsed = parseSaveText(`
2 . . 4
. . . .
....
. . 8 .
`);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.save.size, 4);
  assert.equal(parsed.save.score, 0);
  assert.equal(parsed.best, null);
  assert.equal(parsed.save.won, false);
  assert.equal(parsed.save.over, false);
  assert.equal(parsed.save.undo, null);
  assert.equal(parsed.save.tiles.length, 3);
});

test("2048 on the board counts as a win when the flag is omitted", () => {
  const parsed = parseSaveText(`
2048 . . .
. . . .
. . . .
. . . .
`);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.save.won, true);
});

test("an explicit no keeps a 2048 from counting as a win", () => {
  const parsed = parseSaveText(`
Llegaste a 2048: no
2048 . . .
. . . .
. . . .
. . . .
`);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.save.won, false);
});

test("a stuck board is over when the flag is omitted", () => {
  const parsed = parseSaveText(`
2 4 2 4
4 2 4 2
2 4 2 4
4 2 4 8
`);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.save.over, true);
});

test("explicit flags and size errors name the line", () => {
  const badCell = parseSaveText(`
Tablero:
2 . . 3
. . . .
. . . .
. . . .
`);
  assert.equal(badCell.ok, false);
  assert.match(badCell.error, /línea 3, columna 4/);

  const uneven = parseSaveText(`
2 . . .
. . .
. . . .
. . . .
`);
  assert.equal(uneven.ok, false);
  assert.match(uneven.error, /línea 3/);

  const size = parseSaveText(`
Tamaño: 3
2 . . .
. . . .
. . . .
. . . .
`);
  assert.equal(size.ok, false);
  assert.match(size.error, /4, 5, 6 o 7/);

  const mismatch = parseSaveText(`
Tamaño: 5
2 . . .
. . . .
. . . .
. . . .
`);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /Tamaño dice 5/);
});

test("a save without Deshacer has nothing to undo", () => {
  const state = setup([
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const text = formatSave(state);
  assert.equal(text.includes("Deshacer:"), false);
  const parsed = parseSaveText(text);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.save.undo, null);
});

test("5×5 and 7×7 grids keep their size", () => {
  const five = setup([
    [2, 0, 0, 0, 4],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 8],
  ]);
  five.score = 6;
  five.best = 6;
  const parsedFive = parseSaveText(formatSave(five));
  assert.equal(parsedFive.ok, true, parsedFive.error);
  assert.equal(parsedFive.save.size, 5);
  assert.equal(parsedFive.save.tiles.length, 3);

  const seven = Array.from({ length: 7 }, () => Array(7).fill(0));
  seven[6][6] = 32;
  const state = setup(seven);
  const parsedSeven = parseSaveText(formatSave(state));
  assert.equal(parsedSeven.ok, true, parsedSeven.error);
  assert.equal(parsedSeven.save.size, 7);
  assert.equal(parsedSeven.save.tiles[0].row, 6);
  assert.equal(parsedSeven.save.tiles[0].col, 6);
});

test("readSave still accepts the legacy JSON save", () => {
  const state = setup([
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  state.score = 4;
  const parsed = readSave(JSON.stringify(serializeGame(state)));
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.best, null);
  assert.equal(parsed.save.score, 4);
  assert.equal(parsed.save.tiles.length, 2);
});

test("empty and unknown text explain what to fix", () => {
  assert.match(parseSaveText("").error, /No hay ninguna partida/);
  assert.match(parseSaveText("hola\n").error, /No entiendo la línea 1/);
  const unknown = parseSaveText("Puntage: 4\n2 . . .\n. . . .\n. . . .\n. . . .\n");
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /Puntage/);
});
