/** Original 2048 rules engine — written from scratch, not derived from public clones. */

export const SIZES = [4, 5, 6, 7];
export const DEFAULT_SIZE = 4;
export const WIN_TILE = 2048;

/** @deprecated use DEFAULT_SIZE; kept so callers that imported SIZE still default to 4×4. */
export const SIZE = DEFAULT_SIZE;

const VECTORS = {
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
};

export function normalizeSize(n) {
  const size = Number(n);
  return SIZES.includes(size) ? size : DEFAULT_SIZE;
}

export function createState(rng = Math.random, size = DEFAULT_SIZE) {
  return {
    size: normalizeSize(size),
    nextId: 1,
    tiles: [],
    score: 0,
    moves: 0,
    best: 0,
    won: false,
    continued: false,
    over: false,
    undo: null,
    rng,
  };
}

function cloneTiles(tiles) {
  return tiles.map((tile) => ({ ...tile }));
}

function boardSize(state) {
  return normalizeSize(state?.size);
}

/** Snapshot of the playable board, excluding best score (high-water mark). */
export function snapshotPlayable(state) {
  return {
    size: boardSize(state),
    nextId: state.nextId,
    tiles: cloneTiles(state.tiles),
    score: state.score,
    moves: state.moves || 0,
    won: state.won,
    continued: state.continued,
    over: state.over,
  };
}

export function canUndo(state) {
  return Boolean(state.undo);
}

/** Keep a single undo checkpoint taken *before* a successful move. */
export function commitUndo(state, snapshot) {
  state.undo = snapshot;
}

export function clearUndo(state) {
  state.undo = null;
}

/**
 * Restore the last successful move (board, score, won/over).
 * Best score is never decreased. Returns false if there is nothing to undo.
 */
export function undoLast(state) {
  if (!state.undo) return false;
  const snap = state.undo;
  const best = state.best;
  if (snap.size) state.size = boardSize(snap);
  state.nextId = snap.nextId;
  state.tiles = cloneTiles(snap.tiles);
  state.score = snap.score;
  state.moves = snap.moves || 0;
  state.won = snap.won;
  state.continued = snap.continued;
  state.over = snap.over;
  state.best = best;
  state.undo = null;
  return true;
}

export function occupancies(tiles, size) {
  const n = normalizeSize(size);
  const grid = Array.from({ length: n }, () => Array(n).fill(null));
  for (const tile of tiles) {
    if (!tile.removing) grid[tile.row][tile.col] = tile;
  }
  return grid;
}

export function emptyCells(tiles, size) {
  const n = normalizeSize(size);
  const grid = occupancies(tiles, n);
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid[r][c]) cells.push({ r, c });
    }
  }
  return cells;
}

export function spawn(state, forced) {
  const size = boardSize(state);
  const cells = emptyCells(state.tiles, size);
  if (cells.length === 0) return null;
  const pick = forced?.cell ?? cells[Math.floor(state.rng() * cells.length)];
  const value = forced?.value ?? (state.rng() < 0.9 ? 2 : 4);
  const tile = {
    id: state.nextId++,
    value,
    row: pick.r,
    col: pick.c,
    spawned: true,
    merged: false,
    removing: false,
  };
  state.tiles.push(tile);
  return tile;
}

function inBounds(r, c, size) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function traversals(dir, size) {
  const rows = Array.from({ length: size }, (_, i) => i);
  const cols = Array.from({ length: size }, (_, i) => i);
  const v = VECTORS[dir];
  if (v.dr === 1) rows.reverse();
  if (v.dc === 1) cols.reverse();
  return { rows, cols };
}

export function clearTurnFlags(state) {
  for (const tile of state.tiles) {
    tile.spawned = false;
    tile.merged = false;
    tile.removing = false;
  }
}

/**
 * Slide and merge once per tile in `dir`.
 * Does not spawn. Returns whether anything changed, points gained, and merge values.
 */
export function move(state, dir) {
  const size = boardSize(state);
  if (state.over) return { moved: false, gained: 0, merges: [] };
  if (!VECTORS[dir]) return { moved: false, gained: 0, merges: [] };

  clearTurnFlags(state);

  const v = VECTORS[dir];
  const { rows, cols } = traversals(dir, size);
  const grid = occupancies(state.tiles, size);
  let moved = false;
  let gained = 0;
  const merges = [];

  for (const row of rows) {
    for (const col of cols) {
      const tile = grid[row][col];
      if (!tile) continue;

      let r = row;
      let c = col;
      let nr = r + v.dr;
      let nc = c + v.dc;

      while (inBounds(nr, nc, size) && grid[nr][nc] === null) {
        r = nr;
        c = nc;
        nr = r + v.dr;
        nc = c + v.dc;
      }

      let didMerge = false;
      if (inBounds(nr, nc, size)) {
        const other = grid[nr][nc];
        if (other && other.value === tile.value && !other.merged) {
          grid[row][col] = null;
          tile.row = nr;
          tile.col = nc;
          tile.removing = true;
          other.value *= 2;
          other.merged = true;
          gained += other.value;
          merges.push(other.value);
          didMerge = true;
          moved = true;
        }
      }

      if (!didMerge && (r !== row || c !== col)) {
        grid[row][col] = null;
        grid[r][c] = tile;
        tile.row = r;
        tile.col = c;
        moved = true;
      }
    }
  }

  if (moved) {
    state.moves = (state.moves || 0) + 1;
    state.score += gained;
    if (state.score > state.best) state.best = state.score;
    if (!state.won && state.tiles.some((t) => !t.removing && t.value >= WIN_TILE)) {
      state.won = true;
    }
  }

  return { moved, gained, merges };
}

export function settle(state) {
  state.tiles = state.tiles.filter((t) => !t.removing);
  for (const tile of state.tiles) {
    tile.removing = false;
    tile.spawned = false;
  }
}

export function hasMoves(state) {
  const size = boardSize(state);
  if (emptyCells(state.tiles, size).length > 0) return true;
  const grid = occupancies(state.tiles, size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const tile = grid[r][c];
      if (!tile) continue;
      if (c + 1 < size && grid[r][c + 1]?.value === tile.value) return true;
      if (r + 1 < size && grid[r + 1][c]?.value === tile.value) return true;
    }
  }
  return false;
}

export function finishTurn(state) {
  spawn(state);
  if (!hasMoves(state)) state.over = true;
}

export function startGame(state) {
  state.nextId = 1;
  state.tiles = [];
  state.score = 0;
  state.moves = 0;
  state.won = false;
  state.continued = false;
  state.over = false;
  state.undo = null;
  spawn(state);
  spawn(state);
}

export function loadBoard(state, values) {
  const size = boardSize(state);
  state.tiles = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = values[r]?.[c];
      if (value) {
        state.tiles.push({
          id: state.nextId++,
          value,
          row: r,
          col: c,
          spawned: false,
          merged: false,
          removing: false,
        });
      }
    }
  }
}

export function boardValues(state) {
  const size = boardSize(state);
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (const tile of state.tiles) {
    if (!tile.removing) grid[tile.row][tile.col] = tile.value;
  }
  return grid;
}

function isInt(n) {
  return Number.isInteger(n);
}

function isPowerOfTwo(n) {
  return isInt(n) && n >= 2 && (n & (n - 1)) === 0;
}

function compactTile(tile) {
  return {
    id: tile.id,
    value: tile.value,
    row: tile.row,
    col: tile.col,
  };
}

function sanitizeTile(raw, size) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  const value = Number(raw.value);
  const row = Number(raw.row ?? raw.r);
  const col = Number(raw.col ?? raw.c);
  if (!isInt(id) || id < 1) return null;
  if (!isPowerOfTwo(value) || value > 1_048_576) return null;
  if (!isInt(row) || !isInt(col) || row < 0 || row >= size || col < 0 || col >= size) return null;
  return {
    id,
    value,
    row,
    col,
    spawned: false,
    merged: false,
    removing: false,
  };
}

function sanitizePlayable(data, size) {
  if (!data || typeof data !== "object") return null;
  const nextId = Number(data.nextId);
  const score = Number(data.score);
  const moves = data.moves == null || data.moves === "" ? 0 : Number(data.moves);
  if (!isInt(nextId) || nextId < 1) return null;
  if (!Number.isFinite(score) || score < 0) return null;
  if (!isInt(moves) || moves < 0) return null;
  if (typeof data.won !== "boolean" || typeof data.continued !== "boolean" || typeof data.over !== "boolean") {
    return null;
  }
  if (!Array.isArray(data.tiles) || data.tiles.length > size * size) return null;

  const tiles = [];
  const seenIds = new Set();
  const seenCells = new Set();
  for (const raw of data.tiles) {
    const tile = sanitizeTile(raw, size);
    if (!tile) return null;
    const cell = `${tile.row},${tile.col}`;
    if (seenIds.has(tile.id) || seenCells.has(cell)) return null;
    seenIds.add(tile.id);
    seenCells.add(cell);
    tiles.push(tile);
  }

  const maxId = tiles.reduce((m, t) => Math.max(m, t.id), 0);
  return {
    size,
    nextId: Math.max(nextId, maxId + 1),
    tiles,
    score,
    moves,
    won: data.won,
    continued: data.continued,
    over: data.over,
  };
}

function compactPlayable(snap) {
  return {
    size: boardSize(snap),
    nextId: snap.nextId,
    tiles: (snap.tiles || []).filter((t) => !t.removing).map(compactTile),
    score: snap.score,
    moves: snap.moves || 0,
    won: snap.won,
    continued: snap.continued,
    over: snap.over,
  };
}

function resolveSaveSize(data, expectedSize) {
  if (data && data.size != null && data.size !== "") {
    const size = Number(data.size);
    if (!SIZES.includes(size)) return null;
    if (expectedSize != null && size !== expectedSize) return null;
    return size;
  }
  return expectedSize ?? DEFAULT_SIZE;
}

/** JSON-ready save of the in-progress game. Does not include best score. */
export function serializeGame(state) {
  return {
    version: 1,
    ...compactPlayable(state),
    undo: state.undo ? compactPlayable(state.undo) : null,
  };
}

/** Parse a save object or JSON string. Returns null if missing or corrupt. */
export function parseSave(raw, expectedSize) {
  if (raw == null || raw === "") return null;
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const size = resolveSaveSize(data, expectedSize);
  if (!size) return null;
  const playable = sanitizePlayable(data, size);
  if (!playable) return null;
  let undo = null;
  if (data.undo != null) {
    undo = sanitizePlayable(data.undo, size);
    if (!undo) return null;
  }
  return { version: 1, ...playable, undo };
}

/**
 * Restore a parsed save into `state`. Best score is never decreased.
 * Returns false if the payload is invalid.
 */
export function applySave(state, raw, expectedSize) {
  const parsed = parseSave(raw, expectedSize ?? state.size);
  if (!parsed) return false;
  const best = state.best;
  state.size = parsed.size;
  state.nextId = parsed.nextId;
  state.tiles = cloneTiles(parsed.tiles);
  state.score = parsed.score;
  state.moves = parsed.moves || 0;
  state.won = parsed.won;
  state.continued = parsed.continued;
  state.over = parsed.over;
  state.undo = parsed.undo
    ? {
        size: parsed.undo.size,
        nextId: parsed.undo.nextId,
        tiles: cloneTiles(parsed.undo.tiles),
        score: parsed.undo.score,
        moves: parsed.undo.moves || 0,
        won: parsed.undo.won,
        continued: parsed.undo.continued,
        over: parsed.undo.over,
      }
    : null;
  state.best = Math.max(best, parsed.score);
  return true;
}
