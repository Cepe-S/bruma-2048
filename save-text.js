/** Plain-text save for Bruma 2048, meant to be opened and edited in Notepad. */

import { SIZES, WIN_TILE, boardValues, hasMoves, parseSave } from "./engine.js";

const YES = new Set(["si", "yes", "true", "1", "on"]);
const NO = new Set(["no", "false", "0", "off"]);
const EMPTY = new Set([".", "-", "_", "x", "0", "vacio"]);
const KEYS = {
  tamano: "size",
  size: "size",
  puntaje: "score",
  puntos: "score",
  score: "score",
  movimientos: "moves",
  movimiento: "moves",
  moves: "moves",
  mejor: "best",
  record: "best",
  best: "best",
  "llegaste a 2048": "won",
  llegaste: "won",
  ganaste: "won",
  won: "won",
  "seguis jugando": "continued",
  seguis: "continued",
  seguir: "continued",
  continuar: "continued",
  continued: "continued",
  "partida terminada": "over",
  terminada: "over",
  terminado: "over",
  fin: "over",
  over: "over",
};

function fold(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function yesNo(flag) {
  return flag ? "sí" : "no";
}

function whole(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function isPowerOfTwo(n) {
  return Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0 && n <= 1_048_576;
}

function formatGrid(values) {
  let width = 1;
  for (const row of values) {
    for (const value of row) width = Math.max(width, value ? String(value).length : 1);
  }
  return values.map((row) =>
    row.map((value) => (value ? String(value) : ".").padStart(width)).join("  "),
  );
}

function formatFlags(score, moves, won, continued, over) {
  return [
    `Puntaje: ${whole(score)}`,
    `Movimientos: ${whole(moves)}`,
    `Llegaste a 2048: ${yesNo(won)}`,
    `Seguís jugando: ${yesNo(continued)}`,
    `Partida terminada: ${yesNo(over)}`,
  ];
}

/** Text of the current game. Empty cells are a dot. Sections are optional except the board. */
export function formatSave(state) {
  const size = SIZES.includes(state.size) ? state.size : boardValues(state).length;
  const lines = [
    "# Bruma 2048",
    "# Editalo con el Bloc de notas. Las líneas que empiezan con # se ignoran.",
    "# Cada línea de Tablero es una fila. Un punto (.) o un 0 es una casilla vacía.",
    "# Los números tienen que ser 2, 4, 8, 16, 32… (siempre el doble).",
    "# Separá las casillas con espacios.",
    "# Si no querés deshacer, borrá desde Deshacer hasta el final.",
    "# Si Mejor queda debajo del puntaje, al cargar se sube.",
    "",
    `Tamaño: ${size}`,
    `Puntaje: ${whole(state.score)}`,
    `Movimientos: ${whole(state.moves)}`,
    `Mejor: ${whole(state.best)}`,
    `Llegaste a 2048: ${yesNo(state.won)}`,
    `Seguís jugando: ${yesNo(state.continued)}`,
    `Partida terminada: ${yesNo(state.over)}`,
    "",
    "Tablero:",
    ...formatGrid(boardValues(state)),
  ];

  if (state.undo) {
    lines.push(
      "",
      "Deshacer:",
      ...formatFlags(state.undo.score, state.undo.moves, state.undo.won, state.undo.continued, state.undo.over),
      "",
      ...formatGrid(boardValues({ size: state.undo.size || size, tiles: state.undo.tiles || [] })),
    );
  }

  return `${lines.join("\n")}\n`;
}

function fail(error) {
  return { ok: false, error };
}

function stripInline(line) {
  const hash = line.search(/(?:^|\s)#/);
  return (hash === -1 ? line : line.slice(0, hash)).trim();
}

function matchSection(line) {
  const match = line.match(/^([^:]+?):?\s*$/);
  if (!match) return null;
  const name = fold(match[1]);
  if (name === "tablero" || name === "board") return "board";
  if (name === "deshacer" || name === "undo") return "undo";
  return null;
}

function isDecoration(line) {
  return /^[=\-_~*]{3,}$/.test(line);
}

function parseCell(token) {
  const folded = fold(token);
  if (EMPTY.has(folded)) return 0;
  if (!/^\d+$/.test(token)) return null;
  const value = Number(token);
  if (!isPowerOfTwo(value)) return { bad: true };
  return value;
}

function parseGridLine(line) {
  if (line.includes(":")) return null;
  if (/^\.+$/.test(line)) {
    if (line.length < 4 || line.length > 7) return { errorCol: 1, token: line };
    return { cells: Array.from({ length: line.length }, () => 0) };
  }
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const cells = [];
  for (let i = 0; i < tokens.length; i++) {
    const parsed = parseCell(tokens[i]);
    if (parsed == null) return null;
    if (parsed.bad) return { errorCol: i + 1, token: tokens[i] };
    cells.push(parsed);
  }
  return { cells };
}

function matchKey(line) {
  const match = line.match(/^([^:]+):\s*(.*)$/);
  if (!match) return null;
  const label = match[1].trim();
  const name = KEYS[fold(label)];
  if (!name) return { unknown: true, label };
  return { name, label, value: match[2].trim() };
}

function readFlag(keys, name) {
  const entry = keys[name];
  if (!entry) return { ok: true, missing: true, value: false };
  if (entry.value === "") {
    return fail(`Falta el valor de ${entry.label} en la línea ${entry.lineNo}. Escribí sí o no.`);
  }
  const folded = fold(entry.value);
  if (YES.has(folded)) return { ok: true, missing: false, value: true };
  if (NO.has(folded)) return { ok: true, missing: false, value: false };
  return fail(`${entry.label} tiene que ser sí o no (línea ${entry.lineNo}: «${entry.value}»).`);
}

function readNumber(keys, name) {
  const entry = keys[name];
  if (!entry) return { ok: true, missing: true, value: 0 };
  if (!/^\d+$/.test(entry.value)) {
    return fail(
      `${entry.label} tiene que ser un número entero, 0 o mayor (línea ${entry.lineNo}: «${entry.value}»).`,
    );
  }
  const value = Number(entry.value);
  if (!Number.isSafeInteger(value)) return fail(`${entry.label} es demasiado grande (línea ${entry.lineNo}).`);
  return { ok: true, missing: false, value };
}

function rowsToValues(rows) {
  const width = rows[0].cells.length;
  for (const row of rows) {
    if (row.cells.length !== width) {
      return fail(
        `La línea ${row.lineNo} tiene ${row.cells.length} casillas y la línea ${rows[0].lineNo} tiene ${width}. Cada fila tiene que medir lo mismo.`,
      );
    }
  }
  return { ok: true, width, height: rows.length, values: rows.map((row) => row.cells.slice()) };
}

function tilesFromValues(values) {
  const tiles = [];
  let nextId = 1;
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const value = values[row][col];
      if (!value) continue;
      tiles.push({
        id: nextId,
        value,
        row,
        col,
        spawned: false,
        merged: false,
        removing: false,
      });
      nextId += 1;
    }
  }
  return { tiles, nextId };
}

function sectionSave(section, size) {
  const score = readNumber(section.keys, "score");
  if (!score.ok) return score;
  const moves = readNumber(section.keys, "moves");
  if (!moves.ok) return moves;
  const won = readFlag(section.keys, "won");
  if (!won.ok) return won;
  const continued = readFlag(section.keys, "continued");
  if (!continued.ok) return continued;
  const over = readFlag(section.keys, "over");
  if (!over.ok) return over;
  const built = tilesFromValues(section.values);
  const derivedWon = built.tiles.some((tile) => tile.value >= WIN_TILE);
  const derivedOver = !hasMoves({ size, tiles: built.tiles });
  return {
    ok: true,
    save: {
      size,
      nextId: built.nextId,
      tiles: built.tiles,
      score: score.value,
      moves: moves.value,
      won: won.missing ? derivedWon : won.value,
      continued: continued.value,
      over: over.missing ? derivedOver : over.value,
    },
  };
}

/** Parse notepad text. Returns `{ ok, save, best }` or `{ ok: false, error }`. */
export function parseSaveText(raw) {
  if (raw == null || String(raw).trim() === "") return fail("No hay ninguna partida en ese texto.");

  const lines = String(raw).replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const main = { keys: {}, rows: [] };
  const undo = { keys: {}, rows: [] };
  let section = main;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = stripInline(lines[i]);
    if (!line) continue;

    const sectionName = matchSection(line);
    if (sectionName === "board") {
      section = main;
      continue;
    }
    if (sectionName === "undo") {
      section = undo;
      continue;
    }
    if (isDecoration(line)) continue;

    const key = matchKey(line);
    if (key?.unknown) {
      return fail(
        `No reconozco «${key.label}» en la línea ${lineNo}. Usá Tamaño, Puntaje, Movimientos, Mejor, Llegaste a 2048, Seguís jugando o Partida terminada.`,
      );
    }
    if (key?.name) {
      if (section.keys[key.name]) return fail(`«${key.label}» está repetido en la línea ${lineNo}. Dejá una sola.`);
      section.keys[key.name] = { value: key.value, lineNo, label: key.label };
      continue;
    }

    const grid = parseGridLine(line);
    if (grid?.errorCol) {
      return fail(
        `La casilla de la línea ${lineNo}, columna ${grid.errorCol}, dice «${grid.token}». Usá un punto (.) o un número 2, 4, 8, 16, 32…`,
      );
    }
    if (grid) {
      section.rows.push({ cells: grid.cells, lineNo });
      continue;
    }

    return fail(`No entiendo la línea ${lineNo}: «${line}».`);
  }

  if (main.rows.length === 0) {
    return fail("Falta el tablero. Escribí Tablero: y, debajo, una línea por fila. Un punto es una casilla vacía.");
  }

  const sizeEntry = main.keys.size;
  let size = null;
  if (sizeEntry) {
    const parsed = Number(sizeEntry.value);
    if (!SIZES.includes(parsed)) {
      return fail(`Tamaño tiene que ser 4, 5, 6 o 7 (línea ${sizeEntry.lineNo}: «${sizeEntry.value}»).`);
    }
    size = parsed;
  }

  const mainGrid = rowsToValues(main.rows);
  if (!mainGrid.ok) return mainGrid;
  if (size == null) {
    if (mainGrid.width !== mainGrid.height || !SIZES.includes(mainGrid.width)) {
      return fail(
        `El tablero tiene ${mainGrid.height} filas de ${mainGrid.width} casillas. Tiene que ser 4×4, 5×5, 6×6 o 7×7.`,
      );
    }
    size = mainGrid.width;
  } else if (mainGrid.width !== size || mainGrid.height !== size) {
    return fail(`Tamaño dice ${size}, pero el tablero tiene ${mainGrid.height} filas de ${mainGrid.width} casillas.`);
  }

  if (undo.keys.size || undo.keys.best) {
    const entry = undo.keys.size || undo.keys.best;
    return fail(`Tamaño y Mejor van arriba del tablero, no en Deshacer (línea ${entry.lineNo}).`);
  }

  const best = readNumber(main.keys, "best");
  if (!best.ok) return best;

  const playable = sectionSave({ keys: main.keys, values: mainGrid.values }, size);
  if (!playable.ok) return playable;

  let undoSave = null;
  if (undo.rows.length === 0) {
    if (Object.keys(undo.keys).length > 0) {
      return fail("Deshacer no tiene tablero. Borrá esa sección o agregá una línea por fila.");
    }
  } else {
    const undoGrid = rowsToValues(undo.rows);
    if (!undoGrid.ok) return undoGrid;
    if (undoGrid.width !== size || undoGrid.height !== size) {
      return fail(`Deshacer tiene que ser del mismo tamaño que el tablero (${size}×${size}).`);
    }
    const parsedUndo = sectionSave({ keys: undo.keys, values: undoGrid.values }, size);
    if (!parsedUndo.ok) return parsedUndo;
    undoSave = parsedUndo.save;
  }

  return {
    ok: true,
    best: best.missing ? null : best.value,
    save: { version: 1, ...playable.save, undo: undoSave },
  };
}

/**
 * Read notepad text, or a legacy JSON save.
 * `best` is null when the text does not say Mejor.
 */
export function readSave(raw) {
  const text = parseSaveText(raw);
  if (text.ok) return text;
  const trimmed = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  if (trimmed.startsWith("{")) {
    const json = parseSave(trimmed);
    if (json) return { ok: true, save: json, best: null };
    return fail("Ese archivo parece JSON viejo y no se pudo leer.");
  }
  return text;
}
