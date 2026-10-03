import { MeshGradient } from "./vendor/mesh-gradient.js";

const HARD_TILE = 128;
const HARD_SPAN = 5;
const SOFT_TILE = 32;
const MIST_BLUR = 22;
const NUDGE = 20;
const NUDGE_FOLLOW = 2.4;
const NUDGE_RETURN = 1.5;
const NUDGE_HOLD_MS = 420;

const CALM = ["#14532d", "#0f766e", "#0e7490", "#1e3a8a"];
const SHIFT = ["#1e3a8a", "#4338ca", "#6d28d9", "#7e22ce"];
const BLOOM = ["#9d174d", "#be185d", "#7e22ce", "#4c1d95"];
const REST = [CALM, SHIFT, BLOOM];
const REWARD = ["#0f766e", "#e7c56a", "#5eead4", "#f0c35a"];
const HEAT_RETURN_MS = 640;

const DIRS = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function toHex(rgb) {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function paletteAt(t, reward = 0) {
  const clamped = Math.min(1, Math.max(0, t));
  const glow = Math.min(1, Math.max(0, reward));
  const scaled = clamped * (REST.length - 1);
  const index = Math.min(REST.length - 2, Math.floor(scaled));
  const u = scaled - index;
  const from = REST[index];
  const to = REST[index + 1];
  return from.map((hex, i) => {
    const base = mix(hexRgb(hex), hexRgb(to[i]), u);
    return toHex(mix(base, hexRgb(REWARD[i]), glow * 0.78));
  });
}

function difficultyFromState(state) {
  const tiles = state?.tiles;
  if (!tiles) return 0;
  let hard = 0;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile.removing && tile.value >= HARD_TILE) hard += 1;
  }
  return Math.min(1, hard / HARD_SPAN);
}

function mistFromState(state) {
  const tiles = state?.tiles;
  const size = state?.size || 4;
  const cells = size * size;
  if (!tiles || cells <= 0) return 0;
  let soft = 0;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile.removing && tile.value <= SOFT_TILE) soft += 1;
  }
  return Math.min(1, soft / cells);
}

export function createBrumaBackground(canvas, initialProfile = {}) {
  const shift = canvas.parentElement;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const gradient = new MeshGradient();
  let profile = {
    pixelRatio: initialProfile.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2),
    targetFps: initialProfile.targetFps ?? 30,
    maxSegments: initialProfile.maxSegments,
    mistBlurMax: initialProfile.mistBlurMax ?? MIST_BLUR,
  };
  let ready = false;
  let shown = 0;
  let target = 0;
  let heat = 0;
  let heatTarget = 0;
  let heatDrop = null;
  let mist = 0;
  let mistTarget = 0;
  let lastBlur = -1;
  const easeSeconds = 0.55;
  let lastSpeed = 0.16;
  let colorRaf = 0;
  let nudgeRaf = 0;
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let holdUntil = 0;
  let nudgeLast = 0;
  let lastColor = "";
  let reduced = motion.matches;
  let hidden = document.hidden;

  function onVisibility() {
    hidden = document.hidden;
    if (hidden) {
      if (colorRaf) {
        cancelAnimationFrame(colorRaf);
        colorRaf = 0;
      }
      if (nudgeRaf) {
        cancelAnimationFrame(nudgeRaf);
        nudgeRaf = 0;
      }
    }
  }

  document.addEventListener("visibilitychange", onVisibility);

  const initOpts = {
    colors: paletteAt(0),
    seed: 8,
    animationSpeed: 0.16,
    frequency: { x: 0.00011, y: 0.00018, delta: 0.00002 },
    darkenTop: true,
    reducedMotion: "auto",
    appearance: "smooth",
    appearanceDuration: 500,
    pauseOnOutsideViewport: true,
    pixelRatio: profile.pixelRatio,
    targetFps: profile.targetFps,
    callbacks: {
      onReady() {
        ready = true;
        paintColors();
      },
    },
  };
  if (profile.maxSegments) initOpts.maxSegments = profile.maxSegments;

  gradient.init(canvas, initOpts);

  function paintColors() {
    if (!ready) return;
    const colors = paletteAt(shown, heat);
    const key = colors.join(",");
    if (key === lastColor) return;
    lastColor = key;
    gradient.update({ colors, transition: false });
  }

  function applySpeed() {
    const speed = 0.16 + heat * 0.22;
    if (!ready || Math.abs(speed - lastSpeed) < 0.02) return;
    lastSpeed = speed;
    gradient.update({ animationSpeed: speed, transition: false });
  }

  function applyBlur() {
    const cap = profile.mistBlurMax ?? MIST_BLUR;
    const px = cap <= 0 ? 0 : mist * mist * cap;
    if (Math.abs(px - lastBlur) < 0.2) return;
    lastBlur = px;
    canvas.style.filter = px < 0.4 ? "" : `blur(${px.toFixed(1)}px)`;
  }

  function easeColors(now = performance.now()) {
    if (hidden) {
      colorRaf = 0;
      return;
    }
    const prev = easeColors.last ?? now;
    const dt = Math.min(0.05, (now - prev) / 1000);
    easeColors.last = now;
    const toward = 1 - Math.exp(-dt / easeSeconds);
    shown += (target - shown) * toward;
    if (heatDrop) {
      const span = Math.max(1, heatDrop.ms);
      const u = Math.min(1, (now - heatDrop.start) / span);
      heat = heatDrop.from + (heatDrop.to - heatDrop.from) * u;
      if (u >= 1) heatDrop = null;
    } else {
      heat += (heatTarget - heat) * toward;
    }
    mist += (mistTarget - mist) * toward;
    paintColors();
    applySpeed();
    applyBlur();
    if (
      heatDrop ||
      Math.abs(target - shown) > 0.004 ||
      Math.abs(heatTarget - heat) > 0.004 ||
      Math.abs(mistTarget - mist) > 0.004
    ) {
      colorRaf = window.requestAnimationFrame(easeColors);
      return;
    }
    shown = target;
    heat = heatTarget;
    mist = mistTarget;
    paintColors();
    applySpeed();
    applyBlur();
    colorRaf = 0;
  }

  function wakeColors() {
    if (colorRaf || hidden) return;
    easeColors.last = performance.now();
    colorRaf = window.requestAnimationFrame(easeColors);
  }

  function settleNudge(now) {
    if (hidden) {
      nudgeRaf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - nudgeLast) / 1000);
    nudgeLast = now;
    if (now >= holdUntil) {
      const back = 1 - Math.exp(-dt * NUDGE_RETURN);
      tx += -tx * back;
      ty += -ty * back;
    }
    const follow = 1 - Math.exp(-dt * NUDGE_FOLLOW);
    x += (tx - x) * follow;
    y += (ty - y) * follow;
    if (Math.hypot(x, y, tx, ty) < 0.2) {
      x = 0;
      y = 0;
      tx = 0;
      ty = 0;
      shift.style.transform = "";
      nudgeRaf = 0;
      return;
    }
    shift.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    nudgeRaf = window.requestAnimationFrame(settleNudge);
  }

  function onMotion() {
    reduced = motion.matches;
  }

  motion.addEventListener("change", onMotion);

  function setQuality(nextProfile) {
    profile = {
      ...profile,
      ...nextProfile,
    };
    applyBlur();
    if (!ready) return;
    const patch = {
      transition: false,
      pixelRatio: profile.pixelRatio,
      targetFps: profile.targetFps,
    };
    if (profile.maxSegments) patch.maxSegments = profile.maxSegments;
    gradient.update(patch);
  }

  function canvasInfo() {
    const rect = canvas.getBoundingClientRect();
    return {
      label: "bruma-bg",
      cssW: Math.round(rect.width),
      cssH: Math.round(rect.height),
      bufW: canvas.width,
      bufH: canvas.height,
    };
  }

  return {
    setQuality,
    canvasInfo,
    sync(state) {
      target = difficultyFromState(state);
      mistTarget = mistFromState(state);
      wakeColors();
    },
    combo(level) {
      const next = Math.min(1, Math.max(0, Number(level) || 0));
      if (next + 0.02 < heatTarget) {
        heatDrop = { from: heat, to: next, start: performance.now(), ms: HEAT_RETURN_MS };
      } else if (next > heatTarget + 0.02) {
        heatDrop = null;
      }
      heatTarget = next;
      wakeColors();
    },
    nudge(dir) {
      if (reduced) return;
      const vector = DIRS[dir];
      if (!vector) return;
      const goalX = vector[0] * NUDGE;
      const goalY = vector[1] * NUDGE;
      tx = goalX;
      ty = goalY;
      holdUntil = performance.now() + NUDGE_HOLD_MS;
      if (!nudgeRaf) {
        nudgeLast = performance.now();
        nudgeRaf = window.requestAnimationFrame(settleNudge);
      }
    },
    destroy() {
      window.cancelAnimationFrame(colorRaf);
      window.cancelAnimationFrame(nudgeRaf);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      gradient.destroy();
    },
  };
}
