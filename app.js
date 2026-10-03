import { createBrumaBackground } from "./background.js";
import {
  comboBurst,
  comboHeat,
  COMBO_SHOW_MIN,
  createCombo,
  DEFAULT_COMBO_GAP_MS,
  expireCombo,
  noteComboMove,
  resetCombo,
} from "./combo.js";
import {
  applySave,
  canUndo,
  createState,
  finishTurn,
  move,
  normalizeSize,
  settle,
  snapshotPlayable,
  startGame,
  undoLast,
} from "./engine.js";
import { formatSave, readSave } from "./save-text.js";
import { MUSIC_ENABLED } from "./config.js";
import { createMusicPlayer } from "./music.js";

const SIZE_KEY = "bruma-2048-size";
const RUMBLE_KEY = "bruma-2048-rumble";
const LEGACY_BEST_KEY = "bruma-2048-best";
const LEGACY_SAVE_KEY = "bruma-2048-save";
const MOVE_MS = 150;
const RUMBLE_MIN = 512;
const KEY_DIRS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  A: "left",
  D: "right",
  W: "up",
  S: "down",
};

const scoreEl = document.getElementById("score");
const movesEl = document.getElementById("moves");
const bestEl = document.getElementById("best");
const scorePopEl = document.getElementById("score-pop");
const tilesEl = document.getElementById("tiles");
const gridEl = document.getElementById("grid");
const boardEl = document.getElementById("board");
const burstEl = document.getElementById("burst");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayContinue = document.getElementById("overlay-continue");
const overlayNew = document.getElementById("overlay-new");
const newGameBtn = document.getElementById("new-game");
const undoBtn = document.getElementById("undo");
const saveGameBtn = document.getElementById("save-game");
const loadGameBtn = document.getElementById("load-game");
const saveDialog = document.getElementById("save-dialog");
const saveText = document.getElementById("save-text");
const saveDialogMsg = document.getElementById("save-dialog-msg");
const saveBrowseBtn = document.getElementById("save-browse");
const saveDownloadBtn = document.getElementById("save-download");
const saveApplyBtn = document.getElementById("save-apply");
const saveFileInput = document.getElementById("save-file");
const saveStatus = document.getElementById("save-status");
const rumbleBtn = document.getElementById("rumble");
const comboEl = document.getElementById("combo");
const comboCountEl = document.getElementById("combo-count");
const comboDirsEl = document.getElementById("combo-dirs");
const sizeSwitchEl = document.getElementById("size-switch");
const eyebrowEl = document.getElementById("eyebrow");
const menuOpenBtn = document.getElementById("menu-open");
const drawerEl = document.getElementById("drawer");
const drawerPanel = document.querySelector(".drawer-panel");
const drawerCloseBtn = document.getElementById("drawer-close");
const drawerScrim = document.getElementById("drawer-scrim");
const musicToggleBtn = document.getElementById("music-toggle");
const nowPlayingEl = document.getElementById("now-playing");
const nowPlayingCover = document.getElementById("now-playing-cover");
const nowPlayingTitle = document.getElementById("now-playing-title");
const nowPlayingArtist = document.getElementById("now-playing-artist");
const nowPlayingVolume = document.getElementById("now-playing-volume");
const musicPrevBtn = document.getElementById("music-prev");
const musicPauseBtn = document.getElementById("music-pause");
const musicNextBtn = document.getElementById("music-next");
const musicAudio = document.getElementById("music-audio");

function bestKey(size) {
  return `bruma-2048-best-${size}`;
}

function saveKey(size) {
  return `bruma-2048-save-${size}`;
}

function readSize() {
  try {
    return normalizeSize(localStorage.getItem(SIZE_KEY));
  } catch {
    return normalizeSize(4);
  }
}

function persistSize(size) {
  try {
    localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    /* private mode / quota */
  }
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function readRumble() {
  const raw = storageGet(RUMBLE_KEY);
  if (raw == null || raw === "") return true;
  return raw === "1" || raw === "true" || raw === "on";
}

function persistRumble(on) {
  storageSet(RUMBLE_KEY, on ? "1" : "0");
}

function readBest(size) {
  let raw = storageGet(bestKey(size));
  if ((raw == null || raw === "") && size === 4) raw = storageGet(LEGACY_BEST_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function persistBest({ allowLower = false } = {}) {
  const stored = readBest(state.size);
  if (!allowLower && state.best < stored) state.best = stored;
  storageSet(bestKey(state.size), String(state.best));
}

function persistGame({ allowLowerBest = false } = {}) {
  persistBest({ allowLower: allowLowerBest });
  persistSize(state.size);
  try {
    storageSet(saveKey(state.size), formatSave(state));
  } catch {
    /* private mode / quota */
  }
}

function restoreGame() {
  state.best = Math.max(state.best, readBest(state.size));
  let raw = storageGet(saveKey(state.size));
  if ((raw == null || raw === "") && state.size === 4) raw = storageGet(LEGACY_SAVE_KEY);
  if (raw == null || raw === "") return false;
  const loaded = readSave(raw);
  if (!loaded.ok || loaded.save.size !== state.size) return false;
  if (!applySave(state, loaded.save, state.size)) return false;
  state.best = Math.max(state.best, loaded.best ?? 0, readBest(state.size));
  persistBest();
  return true;
}

const state = createState(Math.random, readSize());
state.best = readBest(state.size);

const brumaBg = createBrumaBackground(document.getElementById("bruma-bg"));
const music = createMusicPlayer({
  audioEl: musicAudio,
  coverEl: nowPlayingCover,
  titleEl: nowPlayingTitle,
  artistEl: nowPlayingArtist,
  volumeEl: nowPlayingVolume,
  rootEl: nowPlayingEl,
  prevEl: musicPrevBtn,
  pauseEl: musicPauseBtn,
  nextEl: musicNextBtn,
});

function syncBackground() {
  brumaBg.sync(state);
}

const tileNodes = new Map();
let animating = false;
let overlayMode = null;
let overlayBeforeConfirm = null;
let pointerOrigin = null;
let moveTimer = 0;
let rumbleOn = readRumble();
let comboGapMs = DEFAULT_COMBO_GAP_MS;
let comboTimer = 0;
let comboSettleTimer = 0;
let comboBreakTimer = 0;
let comboFinale = false;
let comboPayTimer = 0;
let burstTimer = 0;
const combo = createCombo();
const COMBO_BLOOM_MS = 280;
const COMBO_BREAK_MS = 420;

const COMBO_ARROW_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 8h11.2M9.1 3.7 13.6 8 9.1 12.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function buildGrid() {
  const size = state.size;
  gridEl.replaceChildren();
  gridEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
  gridEl.style.gridTemplateRows = `repeat(${size}, var(--cell))`;
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    gridEl.appendChild(cell);
  }
}

function syncBoardLayout() {
  const size = state.size;
  document.documentElement.style.setProperty("--size", String(size));
  boardEl.dataset.size = String(size);
  boardEl.style.setProperty("--size", String(size));
  if (eyebrowEl) eyebrowEl.textContent = `rompecabezas · ${size}×${size}`;
  if (sizeSwitchEl) {
    for (const btn of sizeSwitchEl.querySelectorAll("[data-size]")) {
      const active = Number(btn.dataset.size) === size;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-on", active);
    }
  }
  syncRumbleButton();
}

function syncRumbleButton() {
  if (!rumbleBtn) return;
  rumbleBtn.setAttribute("aria-pressed", rumbleOn ? "true" : "false");
  rumbleBtn.classList.toggle("is-on", rumbleOn);
  rumbleBtn.textContent = rumbleOn ? "Vibración: sí" : "Vibración: no";
}

function syncMusicButton() {
  if (!musicToggleBtn) return;
  const on = music.isEnabled();
  musicToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
  musicToggleBtn.classList.toggle("is-on", on);
  musicToggleBtn.textContent = on ? "Música: sí" : "Música: no";
}

function toggleMusic() {
  music.toggle();
  syncMusicButton();
}

function shownValue(tile) {
  return tile.merged ? tile.value / 2 : tile.value;
}

function fontClass(value) {
  if (value >= 1000) return "tile--tiny";
  if (value >= 100) return "tile--small";
  return "";
}

function positionTile(node, tile) {
  node.style.setProperty("--r", String(tile.row));
  node.style.setProperty("--c", String(tile.col));
}

function syncTile(node, tile, { popping = false, spawning = false, instant = false } = {}) {
  const value = popping || !tile.merged ? tile.value : shownValue(tile);
  node.dataset.v = String(value);
  node.textContent = String(value);
  node.className = `tile ${fontClass(value)}`;
  if (tile.removing) node.classList.add("is-removing");
  if (tile.merged && !popping) node.classList.add("is-waiting");
  if (popping) node.classList.add("is-pop");
  if (spawning) node.classList.add("is-spawn");
  if (instant) node.classList.add("is-instant");
  positionTile(node, tile);
}

function render({ poppingIds = new Set(), spawnIds = new Set() } = {}) {
  const seen = new Set();

  for (const tile of state.tiles) {
    seen.add(tile.id);
    let node = tileNodes.get(tile.id);
    const isSpawn = spawnIds.has(tile.id) || tile.spawned;
    if (!node) {
      node = document.createElement("div");
      node.className = "tile is-instant";
      tilesEl.appendChild(node);
      tileNodes.set(tile.id, node);
      syncTile(node, tile, { instant: true, spawning: isSpawn, popping: poppingIds.has(tile.id) });
      node.offsetHeight;
      node.classList.remove("is-instant");
      if (isSpawn) node.classList.add("is-spawn");
    } else {
      syncTile(node, tile, {
        popping: poppingIds.has(tile.id),
        spawning: isSpawn,
      });
    }
  }

  for (const [id, node] of tileNodes) {
    if (!seen.has(id)) {
      node.remove();
      tileNodes.delete(id);
    }
  }

  scoreEl.textContent = String(state.score);
  if (movesEl) movesEl.textContent = String(state.moves || 0);
  bestEl.textContent = String(state.best);
  syncUndoButton();
  syncBackground();
}

function syncUndoButton() {
  undoBtn.disabled = animating || !canUndo(state);
}

function remountBoard({ spawnIds } = {}) {
  tileNodes.forEach((node) => node.remove());
  tileNodes.clear();
  render({ spawnIds });
}

function flashGain(gained) {
  if (!gained) return;
  scorePopEl.textContent = `+${gained}`;
  scorePopEl.classList.remove("is-on");
  scorePopEl.offsetHeight;
  scorePopEl.classList.add("is-on");
}

function comboDetail() {
  return {
    state: combo.phase,
    count: combo.count,
    gained: combo.gained,
    dirs: combo.dirs.slice(),
    gapMs: comboGapMs,
  };
}

function comboShown(detail) {
  return detail.count >= COMBO_SHOW_MIN && (detail.state === "live" || detail.state === "ended");
}

function paintDirs(dirs) {
  if (!comboDirsEl) return;
  while (comboDirsEl.children.length > dirs.length) comboDirsEl.lastElementChild.remove();
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    let node = comboDirsEl.children[i];
    if (!node) {
      node = document.createElement("i");
      node.className = "combo-dir is-new";
      comboDirsEl.appendChild(node);
    }
    if (!node.querySelector("svg")) node.innerHTML = COMBO_ARROW_SVG;
    if (node.dataset.dir !== dir) node.dataset.dir = dir;
  }
}

function arriveComboDirs() {
  if (!comboDirsEl) return;
  const arrows = [...comboDirsEl.children];
  if (arrows.length === 0) return;
  const turn = Math.random() * Math.PI * 2;
  arrows.forEach((arrow, index) => {
    const angle = turn + (index * Math.PI * 2) / arrows.length;
    const distance = 64 + (index % 4) * 22;
    arrow.classList.remove("is-new");
    arrow.classList.remove("is-arrive");
    void arrow.offsetWidth;
    arrow.classList.add("is-arrive");
    arrow.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    arrow.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    arrow.style.setProperty("--spin", `${(index % 2 === 0 ? -1 : 1) * (18 + (index % 4) * 7)}deg`);
    arrow.style.setProperty("--delay", `${index * 4}ms`);
  });
}

function scatterComboDirs() {
  if (!comboDirsEl) return;
  const arrows = [...comboDirsEl.children];
  if (arrows.length === 0) return;
  const turn = Math.random() * Math.PI * 2;
  arrows.forEach((arrow, index) => {
    const angle = turn + (index * Math.PI * 2) / arrows.length;
    const distance = 64 + (index % 4) * 22;
    arrow.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    arrow.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    arrow.style.setProperty("--spin", `${(index % 2 === 0 ? -1 : 1) * (14 + (index % 4) * 6)}deg`);
  });
}

function pulseBoard() {
  boardEl.classList.remove("is-chain");
  void boardEl.offsetWidth;
  boardEl.classList.add("is-chain");
}

const BURST_COLORS = ["#f0c35a", "#ffe08a", "#9ee7d2", "#3ecfb0", "#fff6d8"];

function clearBurst() {
  window.clearTimeout(burstTimer);
  burstTimer = 0;
  boardEl.classList.remove("is-burst");
  boardEl.style.removeProperty("--burst");
  if (!burstEl) return;
  burstEl.replaceChildren();
  burstEl.hidden = true;
}

function addBurstBit(className, power, extra = {}) {
  const node = document.createElement("i");
  node.className = className;
  node.style.setProperty("--power", power.toFixed(3));
  for (const [key, value] of Object.entries(extra)) node.style.setProperty(key, value);
  burstEl.appendChild(node);
}

function edgeOrigin(index, total) {
  const along = ((index + 0.5) / Math.max(total, 1)) % 1;
  const side = index % 4;
  const pad = 10 + along * 80;
  if (side === 0) return { x: pad, y: 0, nx: 0, ny: -1 };
  if (side === 1) return { x: 100, y: pad, nx: 1, ny: 0 };
  if (side === 2) return { x: 100 - pad, y: 100, nx: 0, ny: 1 };
  return { x: 0, y: 100 - pad, nx: -1, ny: 0 };
}

function burstBoard(count) {
  if (!burstEl) return;
  clearBurst();
  const power = comboBurst(count);
  if (power <= 0) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  boardEl.style.setProperty("--burst", power.toFixed(3));
  boardEl.classList.add("is-burst");
  burstEl.hidden = false;
  if (reduce) {
    burstTimer = window.setTimeout(clearBurst, 160);
    return;
  }
  const rings = power >= 0.72 ? 4 : power >= 0.4 ? 3 : 2;
  const sparks = Math.round(6 + power * 18);
  const shards = power < 0.34 ? 0 : Math.round((power - 0.22) * 12);
  for (let i = 0; i < rings; i++) {
    addBurstBit("burst-ring", power, {
      "--delay": `${i * 90}ms`,
      "--ring": String(i),
    });
  }
  for (let i = 0; i < sparks; i++) {
    const edge = edgeOrigin(i, sparks);
    const reach = (16 + power * 54) * (0.55 + Math.random() * 0.5);
    addBurstBit("burst-spark", power, {
      "--x": `${edge.x}%`,
      "--y": `${edge.y}%`,
      "--dx": `${edge.nx * reach}px`,
      "--dy": `${edge.ny * reach}px`,
      "--size": `${2.5 + power * 3.5}px`,
      "--delay": `${Math.random() * 60}ms`,
      "--color": BURST_COLORS[i % BURST_COLORS.length],
    });
  }
  for (let i = 0; i < shards; i++) {
    const edge = edgeOrigin(i + 1, shards);
    const reach = (24 + power * 70) * (0.65 + Math.random() * 0.4);
    addBurstBit("burst-shard", power, {
      "--x": `${edge.x}%`,
      "--y": `${edge.y}%`,
      "--dx": `${edge.nx * reach}px`,
      "--dy": `${edge.ny * reach}px`,
      "--size": `${4 + power * 5}px`,
      "--spin": `${(Math.random() - 0.5) * 120}deg`,
      "--delay": `${30 + Math.random() * 50}ms`,
      "--color": BURST_COLORS[(i + 2) % BURST_COLORS.length],
    });
  }
  burstTimer = window.setTimeout(clearBurst, 760);
}

function clearBoardChain() {
  boardEl.classList.remove("is-hot", "is-chain", "is-chain-pay");
  boardEl.style.setProperty("--chain", "0");
  document.documentElement.style.setProperty("--chain", "0");
  clearBurst();
}

function syncComboFeel(detail) {
  const live = detail.state === "live";
  const ended = detail.state === "ended";
  const heat = comboHeat(detail.count);
  const felt = heat > 0 && (live || ended);
  if (!felt) {
    clearBoardChain();
    brumaBg.combo(0);
    return;
  }
  const level = heat.toFixed(3);
  boardEl.style.setProperty("--chain", level);
  document.documentElement.style.setProperty("--chain", level);
  boardEl.classList.toggle("is-hot", live);
  if (live) {
    clearBurst();
    pulseBoard();
  }
  if (ended) burstBoard(detail.count);
  brumaBg.combo(ended ? 0 : heat);
}

function releaseEndedCombo() {
  window.clearTimeout(comboPayTimer);
  comboPayTimer = 0;
  if (combo.phase !== "ended" || comboShown(comboDetail())) return;
  const stamp = combo.lastAt;
  comboPayTimer = window.setTimeout(() => {
    comboPayTimer = 0;
    if (combo.phase === "ended" && combo.lastAt === stamp) {
      resetCombo(combo);
      publishCombo();
    }
  }, 320);
}

function hideCombo() {
  if (!comboEl) return;
  comboEl.hidden = true;
  comboEl.classList.remove("is-in", "is-settle", "is-break");
  comboDirsEl?.replaceChildren();
}

function cancelComboFinale() {
  window.clearTimeout(comboSettleTimer);
  window.clearTimeout(comboBreakTimer);
  window.clearTimeout(comboPayTimer);
  comboSettleTimer = 0;
  comboBreakTimer = 0;
  comboPayTimer = 0;
  comboFinale = false;
  comboEl?.classList.remove("is-settle", "is-break");
}

function startComboFinale() {
  if (!comboEl || comboFinale) return;
  comboFinale = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bloom = reduce ? 0 : COMBO_BLOOM_MS;
  const breaking = reduce ? 160 : COMBO_BREAK_MS;
  scatterComboDirs();
  comboEl.classList.remove("is-break");
  comboEl.classList.add("is-settle");
  comboSettleTimer = window.setTimeout(() => {
    comboSettleTimer = 0;
    if (!comboFinale) return;
    comboEl.classList.add("is-break");
    comboBreakTimer = window.setTimeout(() => {
      comboBreakTimer = 0;
      comboFinale = false;
      comboEl.classList.remove("is-settle", "is-break", "is-in");
      if (combo.phase === "ended") resetCombo(combo);
      publishCombo();
    }, breaking);
  }, bloom);
}

function paintCombo() {
  const detail = comboDetail();
  const show = comboShown(detail);
  if (comboEl) {
    comboEl.dataset.state = detail.state;
    comboEl.dataset.count = String(detail.count);
    comboEl.dataset.gained = String(detail.gained);
    comboEl.dataset.dirs = detail.dirs.join(" ");
    comboEl.dataset.gap = String(detail.gapMs);
  }
  document.documentElement.dataset.combo = detail.state;

  const nextComboAppears = show && detail.state === "live";
  if (comboFinale && nextComboAppears) cancelComboFinale();
  else if (comboFinale) return detail;

  if (!show) {
    if (!comboFinale) hideCombo();
    if (detail.state === "ended") releaseEndedCombo();
    syncComboFeel(detail);
    return detail;
  }

  if (comboCountEl) comboCountEl.textContent = `×${detail.count}`;
  paintDirs(detail.dirs);
  if (comboEl) {
    const reveal = comboEl.hidden;
    comboEl.hidden = false;
    comboEl.setAttribute("aria-label", `Combo por ${detail.count}`);
    if (reveal && detail.state === "live") {
      comboEl.classList.remove("is-in", "is-arrive", "is-tick");
      comboEl.offsetHeight;
      comboEl.classList.add("is-in", "is-arrive");
      arriveComboDirs();
    } else if (detail.state === "live") {
      comboEl.classList.remove("is-arrive", "is-tick");
      void comboEl.offsetWidth;
      comboEl.classList.add("is-tick");
    }
  }
  if (detail.state === "ended") startComboFinale();
  syncComboFeel(detail);
  return detail;
}

function publishCombo() {
  const detail = paintCombo();
  window.dispatchEvent(new CustomEvent("bruma-combo", { detail }));
}

function armComboExpiry() {
  window.clearTimeout(comboTimer);
  comboTimer = 0;
  if (combo.phase !== "arming" && combo.phase !== "live") return;
  const elapsed = performance.now() - combo.lastAt;
  const wait = Math.max(0, comboGapMs - elapsed);
  comboTimer = window.setTimeout(() => {
    comboTimer = 0;
    expireCombo(combo, combo.lastAt + comboGapMs, comboGapMs);
    publishCombo();
  }, wait);
}

function clearCombo() {
  window.clearTimeout(comboTimer);
  comboTimer = 0;
  cancelComboFinale();
  resetCombo(combo);
  publishCombo();
}

function recordComboMove(dir, gained) {
  noteComboMove(combo, {
    dir,
    gained,
    at: performance.now(),
    gapMs: comboGapMs,
  });
  armComboExpiry();
  publishCombo();
}

function showOverlay(mode) {
  overlayMode = mode;
  overlayEl.hidden = false;
  overlayNew.className = "veil-choice is-main";
  if (mode === "win") {
    overlayTitle.textContent = "¡Llegaste a 2048!";
    overlayText.textContent = "Las fichas se unieron hasta el tesoro. Podés seguir empujando o arrancar de cero.";
    overlayContinue.hidden = false;
    overlayContinue.textContent = "Seguí jugando";
    overlayNew.textContent = "Nueva partida";
  } else if (mode === "over") {
    overlayTitle.textContent = "Se acabó";
    overlayText.textContent = "No queda ningún movimiento. El tablero está trabado.";
    overlayContinue.hidden = true;
    overlayContinue.textContent = "Seguí jugando";
    overlayNew.textContent = "Intentá de nuevo";
  } else if (mode === "confirm") {
    overlayTitle.textContent = "¿Nueva partida?";
    overlayText.textContent = "Se pierde el avance de esta ronda. El mejor puntaje se queda.";
    overlayContinue.hidden = false;
    overlayContinue.textContent = "Cancelar";
    overlayNew.className = "veil-choice is-warn";
    overlayNew.textContent = "Sí, reiniciar";
  }
}

function hideOverlay() {
  overlayMode = null;
  overlayBeforeConfirm = null;
  overlayEl.hidden = true;
}

function shouldConfirmNewGame() {
  return !(state.score === 0 && !canUndo(state) && !state.won && !state.over);
}

function requestNewGame() {
  setMenu(false);
  if (!shouldConfirmNewGame()) {
    newGame();
    return;
  }
  overlayBeforeConfirm = overlayMode === "confirm" ? overlayBeforeConfirm : overlayMode;
  showOverlay("confirm");
}

function dismissConfirm() {
  if (overlayMode !== "confirm") return;
  const prev = overlayBeforeConfirm;
  overlayBeforeConfirm = null;
  if (prev === "win" || prev === "over") showOverlay(prev);
  else hideOverlay();
}

function continueFromWin() {
  if (overlayMode !== "win") return;
  state.continued = true;
  hideOverlay();
  persistGame();
}

function maybeAnnounce() {
  if (state.over) {
    showOverlay("over");
    return;
  }
  if (state.won && !state.continued) {
    showOverlay("win");
  }
}

function flushMoveIfAnimating() {
  if (!animating) return;
  window.clearTimeout(moveTimer);
  const mergedIds = new Set(state.tiles.filter((t) => t.merged).map((t) => t.id));
  settle(state);
  finishTurn(state);
  const spawnIds = new Set(state.tiles.filter((t) => t.spawned).map((t) => t.id));
  animating = false;
  persistGame();
  render({ poppingIds: mergedIds, spawnIds });
  syncBackground({ merge: mergedIds.size > 0 });
  maybeAnnounce();
}

function newGame() {
  hideOverlay();
  window.clearTimeout(moveTimer);
  animating = false;
  resetPadHold();
  clearCombo();
  startGame(state);
  persistGame();
  remountBoard({ spawnIds: new Set(state.tiles.map((t) => t.id)) });
}

function applyUndo() {
  if (overlayMode === "confirm") return;
  if (animating) {
    window.clearTimeout(moveTimer);
    animating = false;
  }
  if (!undoLast(state)) {
    syncUndoButton();
    return;
  }
  clearCombo();
  hideOverlay();
  persistGame();
  remountBoard();
  setMenu(false);
  maybeAnnounce();
}

function rumbleProfile(value) {
  if (value >= 2048) return { duration: 180, weakMagnitude: 0.42, strongMagnitude: 0.92 };
  if (value >= 1024) return { duration: 130, weakMagnitude: 0.28, strongMagnitude: 0.68 };
  return { duration: 90, weakMagnitude: 0.16, strongMagnitude: 0.42 };
}

function playRumble(value) {
  if (!rumbleOn || value < RUMBLE_MIN) return;
  const effect = rumbleProfile(value);
  for (const pad of listGamepads()) {
    const actuator = pad.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== "function") continue;
    try {
      const result = actuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: effect.duration,
        weakMagnitude: effect.weakMagnitude,
        strongMagnitude: effect.strongMagnitude,
      });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      /* missing API or permission — fail silently */
    }
  }
}

function rumbleFromMerges(merges) {
  if (!rumbleOn || !merges?.length) return;
  let peak = 0;
  for (const value of merges) {
    if (value >= RUMBLE_MIN && value > peak) peak = value;
  }
  if (peak) playRumble(peak);
}

let menuOpen = false;

function setMenu(open) {
  menuOpen = open;
  document.body.classList.toggle("is-menu", open);
  if (!drawerEl || !drawerPanel || !menuOpenBtn) return;
  drawerEl.classList.toggle("is-open", open);
  drawerEl.setAttribute("aria-hidden", open ? "false" : "true");
  menuOpenBtn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    drawerPanel.removeAttribute("inert");
    drawerCloseBtn?.focus();
    return;
  }
  if (drawerEl.contains(document.activeElement)) menuOpenBtn.focus();
  drawerPanel.setAttribute("inert", "");
}

function menuFocusables() {
  if (!drawerPanel) return [];
  return [...drawerPanel.querySelectorAll("button, [href], textarea, input, select")].filter(
    (el) => !el.disabled && !el.hidden,
  );
}

function trapMenuTab(event) {
  if (!menuOpen || event.key !== "Tab") return;
  const items = menuFocusables();
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function applyDirection(dir) {
  if (animating || overlayMode || menuOpen || saveDialog?.open) return;
  const before = snapshotPlayable(state);
  const result = move(state, dir);
  if (!result.moved) return;

  state.undo = before;
  animating = true;
  syncUndoButton();
  persistBest();
  flashGain(result.gained);
  recordComboMove(dir, result.gained);
  rumbleFromMerges(result.merges);
  brumaBg.nudge(dir);
  render();

  moveTimer = window.setTimeout(() => {
    const mergedIds = new Set(state.tiles.filter((t) => t.merged).map((t) => t.id));
    settle(state);
    finishTurn(state);
    const spawnIds = new Set(state.tiles.filter((t) => t.spawned).map((t) => t.id));
    animating = false;
    persistGame();
    render({ poppingIds: mergedIds, spawnIds });
    maybeAnnounce();
  }, MOVE_MS);
}

function resetStateForSize(size) {
  const next = createState(Math.random, size);
  next.best = readBest(size);
  state.size = next.size;
  state.nextId = next.nextId;
  state.tiles = next.tiles;
  state.score = next.score;
  state.moves = next.moves;
  state.best = next.best;
  state.won = next.won;
  state.continued = next.continued;
  state.over = next.over;
  state.undo = next.undo;
  state.rng = next.rng;
}

function switchSize(nextSize) {
  const size = normalizeSize(nextSize);
  if (size === state.size) return;
  flushMoveIfAnimating();
  persistGame();
  hideOverlay();
  resetPadHold();
  clearCombo();
  persistSize(size);
  resetStateForSize(size);
  if (!restoreGame()) {
    startGame(state);
    persistGame();
  }
  buildGrid();
  syncBoardLayout();
  remountBoard({ spawnIds: new Set(state.tiles.map((t) => t.id)) });
  setMenu(false);
  maybeAnnounce();
}

function toggleRumble() {
  rumbleOn = !rumbleOn;
  persistRumble(rumbleOn);
  syncRumbleButton();
}

function onKey(event) {
  if (saveDialog?.open) return;
  if (event.key === "Escape") {
    if (menuOpen) {
      event.preventDefault();
      setMenu(false);
      return;
    }
    if (overlayMode === "confirm") {
      event.preventDefault();
      dismissConfirm();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z") && !event.shiftKey) {
    event.preventDefault();
    applyUndo();
    return;
  }
  const dir = KEY_DIRS[event.key];
  if (!dir || menuOpen) return;
  if (event.target?.closest?.("input, textarea")) return;
  event.preventDefault();
  applyDirection(dir);
}

function swipeDir(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < 28) return null;
  if (absX > absY) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

function onPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  pointerOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
  boardEl.setPointerCapture?.(event.pointerId);
}

function onPointerUp(event) {
  if (!pointerOrigin || event.pointerId !== pointerOrigin.id) {
    pointerOrigin = null;
    return;
  }
  const dir = swipeDir(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y);
  pointerOrigin = null;
  if (dir) applyDirection(dir);
}

function onPointerCancel() {
  pointerOrigin = null;
}

const PAD_DEADZONE = 0.45;
const PAD_REPEAT_FIRST = 260;
const PAD_REPEAT_NEXT = 140;
const PAD_SOUTH = 0;
const PAD_EAST = 1;
const PAD_START = 9;
const PAD_UP = 12;
const PAD_DOWN = 13;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

let padRaf = 0;
const padPrevButtons = new Map();
const padHold = { dir: null, nextAt: 0 };

function listGamepads() {
  if (typeof navigator.getGamepads !== "function") return [];
  try {
    return [...navigator.getGamepads()].filter(Boolean);
  } catch {
    return [];
  }
}

function padButtonDown(pad, index) {
  const button = pad.buttons[index];
  if (button == null) return false;
  return typeof button === "object" ? Boolean(button.pressed) || button.value > 0.5 : button > 0.5;
}

function padWasPressed(pad, index) {
  const prev = padPrevButtons.get(pad.index);
  return padButtonDown(pad, index) && !(prev?.[index]);
}

function snapshotPadButtons(pad) {
  const count = Math.max(pad.buttons.length, 16);
  const pressed = [];
  for (let i = 0; i < count; i++) pressed[i] = padButtonDown(pad, i);
  padPrevButtons.set(pad.index, pressed);
}

function padDpadDir(pad) {
  if (padButtonDown(pad, PAD_UP)) return "up";
  if (padButtonDown(pad, PAD_DOWN)) return "down";
  if (padButtonDown(pad, PAD_LEFT)) return "left";
  if (padButtonDown(pad, PAD_RIGHT)) return "right";
  return null;
}

function padStickDir(pad) {
  const x = Number(pad.axes[0]) || 0;
  const y = Number(pad.axes[1]) || 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (Math.max(ax, ay) < PAD_DEADZONE) return null;
  if (ax > ay) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function resetPadHold() {
  padHold.dir = null;
  padHold.nextAt = 0;
}

function handlePad(pad, now) {
  if (saveDialog?.open || menuOpen) {
    snapshotPadButtons(pad);
    return;
  }
  if (!padPrevButtons.has(pad.index)) {
    snapshotPadButtons(pad);
    return;
  }

  if (padWasPressed(pad, PAD_START)) {
    resetPadHold();
    requestNewGame();
    snapshotPadButtons(pad);
    return;
  }

  if (padWasPressed(pad, PAD_EAST)) {
    if (overlayMode === "confirm") dismissConfirm();
    snapshotPadButtons(pad);
    return;
  }

  if (padWasPressed(pad, PAD_SOUTH)) {
    if (overlayMode === "confirm") newGame();
    else if (overlayMode === "win") continueFromWin();
    else applyUndo();
    snapshotPadButtons(pad);
    return;
  }

  if (animating || overlayMode) {
    resetPadHold();
    snapshotPadButtons(pad);
    return;
  }

  const dir = padDpadDir(pad) || padStickDir(pad);
  if (!dir) {
    resetPadHold();
    snapshotPadButtons(pad);
    return;
  }

  if (dir !== padHold.dir) {
    padHold.dir = dir;
    padHold.nextAt = now + PAD_REPEAT_FIRST;
    applyDirection(dir);
  } else if (now >= padHold.nextAt) {
    padHold.nextAt = now + PAD_REPEAT_NEXT;
    applyDirection(dir);
  }

  snapshotPadButtons(pad);
}

function pollGamepads(stamp) {
  const pads = listGamepads();
  if (pads.length === 0) {
    padRaf = 0;
    padPrevButtons.clear();
    resetPadHold();
    return;
  }
  const now = typeof stamp === "number" ? stamp : performance.now();
  for (const pad of pads) handlePad(pad, now);
  padRaf = window.requestAnimationFrame(pollGamepads);
}

function startPadLoop() {
  if (padRaf) return;
  padRaf = window.requestAnimationFrame(pollGamepads);
}

function bindGamepad() {
  if (typeof navigator.getGamepads !== "function") return;
  window.addEventListener("gamepadconnected", startPadLoop);
  window.addEventListener("gamepaddisconnected", () => {
    if (listGamepads().length === 0) {
      if (padRaf) window.cancelAnimationFrame(padRaf);
      padRaf = 0;
      padPrevButtons.clear();
      resetPadHold();
    }
  });
  if (listGamepads().length > 0) startPadLoop();
}

function bindSizeSwitch() {
  if (!sizeSwitchEl) return;
  sizeSwitchEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-size]");
    if (!btn) return;
    switchSize(Number(btn.dataset.size));
  });
}

function hideMusicUi() {
  nowPlayingEl?.setAttribute("hidden", "");
  musicToggleBtn?.closest(".drawer-section")?.setAttribute("hidden", "");
}

function boot() {
  persistSize(state.size);
  paintCombo();
  buildGrid();
  syncBoardLayout();
  if (!MUSIC_ENABLED) {
    hideMusicUi();
  } else {
    syncMusicButton();
    music.load().catch(() => {
      hideMusicUi();
    });
  }
  if (restoreGame()) {
    remountBoard();
    maybeAnnounce();
    return;
  }
  startGame(state);
  persistGame();
  remountBoard({ spawnIds: new Set(state.tiles.map((t) => t.id)) });
}

let statusTimer = 0;

function setStatus(message, ok = true) {
  if (!saveStatus) return;
  window.clearTimeout(statusTimer);
  saveStatus.hidden = !message;
  saveStatus.textContent = message;
  saveStatus.classList.toggle("is-bad", Boolean(message) && !ok);
  if (!message) return;
  statusTimer = window.setTimeout(() => {
    saveStatus.hidden = true;
    saveStatus.textContent = "";
  }, 5200);
}

function setDialogMsg(message, kind = "info") {
  if (!saveDialogMsg) return;
  saveDialogMsg.textContent = message;
  saveDialogMsg.classList.toggle("is-ok", kind === "ok");
  saveDialogMsg.classList.toggle("is-bad", kind === "bad");
}

function downloadText(filename, text) {
  const blob = new Blob([`\uFEFF${String(text).replace(/^\uFEFF/, "")}`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function saveFileName() {
  return `bruma-2048-${state.size}x${state.size}.txt`;
}

function downloadCurrentSave() {
  flushMoveIfAnimating();
  const name = saveFileName();
  downloadText(name, formatSave(state));
  setStatus(`Se descargó ${name}. Abrilo con el Bloc de notas.`);
}

function applyLoaded(loaded) {
  const nextSize = loaded.save.size;
  flushMoveIfAnimating();
  if (nextSize !== state.size) persistGame();
  if (!applySave(state, loaded.save, nextSize)) {
    return { ok: false, error: "No pude usar ese tablero." };
  }
  const writtenBest = loaded.best != null;
  if (writtenBest) state.best = Math.max(loaded.best, state.score);
  else state.best = Math.max(state.best, readBest(nextSize), state.score);
  persistGame({ allowLowerBest: writtenBest });
  hideOverlay();
  resetPadHold();
  clearCombo();
  animating = false;
  buildGrid();
  syncBoardLayout();
  remountBoard();
  maybeAnnounce();
  return { ok: true };
}

function applySaveText(text) {
  const loaded = readSave(text);
  if (!loaded.ok) return loaded;
  return applyLoaded(loaded);
}

function openLoadDialog() {
  flushMoveIfAnimating();
  saveText.value = formatSave(state);
  setDialogMsg("Este texto es la partida. Editalo acá o abrí el archivo del Bloc de notas. Después tocá Aplicar.");
  if (!saveDialog.open) saveDialog.showModal();
  saveText.focus();
  saveText.setSelectionRange(0, 0);
}

function applyFromDialog() {
  const result = applySaveText(saveText.value);
  if (!result.ok) {
    setDialogMsg(result.error, "bad");
    return;
  }
  saveDialog.close();
  setStatus("Partida cargada.");
}

menuOpenBtn?.addEventListener("click", () => setMenu(true));
drawerCloseBtn?.addEventListener("click", () => setMenu(false));
drawerScrim?.addEventListener("click", () => setMenu(false));
window.addEventListener("keydown", trapMenuTab);
newGameBtn.addEventListener("click", requestNewGame);
saveGameBtn?.addEventListener("click", downloadCurrentSave);
loadGameBtn?.addEventListener("click", openLoadDialog);
saveApplyBtn?.addEventListener("click", applyFromDialog);
saveDownloadBtn?.addEventListener("click", () => {
  const text = saveText.value;
  if (!text.trim()) {
    setDialogMsg("No hay texto para descargar.", "bad");
    return;
  }
  const loaded = readSave(text);
  const size = loaded.ok ? loaded.save.size : state.size;
  const name = `bruma-2048-${size}x${size}.txt`;
  downloadText(name, text);
  setDialogMsg(`Se descargó ${name}.`, "ok");
});
saveBrowseBtn?.addEventListener("click", () => {
  saveFileInput.value = "";
  saveFileInput.click();
});
saveFileInput?.addEventListener("change", () => {
  const file = saveFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "").replace(/^\uFEFF/, "");
    saveText.value = text;
    if (!saveDialog.open) saveDialog.showModal();
    const loaded = readSave(text);
    if (!loaded.ok) {
      setDialogMsg(loaded.error, "bad");
      return;
    }
    setDialogMsg(`Listo: ${file.name}. Revisá el tablero y tocá Aplicar.`, "ok");
    saveText.focus();
  };
  reader.onerror = () => setDialogMsg("No pude leer ese archivo.", "bad");
  reader.readAsText(file, "utf-8");
});
saveText?.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    applyFromDialog();
  }
});
saveDialog?.addEventListener("keydown", (event) => {
  event.stopPropagation();
});
undoBtn.addEventListener("click", applyUndo);
rumbleBtn?.addEventListener("click", toggleRumble);
musicToggleBtn?.addEventListener("click", toggleMusic);
window.addEventListener(
  "pointerdown",
  () => {
    music.resumeAfterGesture();
  },
  { once: true, passive: true },
);
overlayNew.addEventListener("click", () => {
  if (overlayMode === "confirm") newGame();
  else requestNewGame();
});
overlayContinue.addEventListener("click", () => {
  if (overlayMode === "confirm") dismissConfirm();
  else continueFromWin();
});
window.addEventListener("keydown", onKey, { passive: false });
boardEl.addEventListener("pointerdown", onPointerDown);
boardEl.addEventListener("pointerup", onPointerUp);
boardEl.addEventListener("pointercancel", onPointerCancel);
boardEl.addEventListener("lostpointercapture", onPointerCancel);
bindSizeSwitch();
bindGamepad();
boot();
