import { MUSIC_ENABLED } from "./config.js";

const MUSIC_KEY = "bruma-2048-music";
const VOLUME_KEY = "bruma-2048-music-volume";
const DEFAULT_VOLUME = 0.4;
const FADE_MS = 600;
const VOLUME_CURVE = 3;

function gainFromPosition(position) {
  const t = Math.min(1, Math.max(0, position));
  return t ** VOLUME_CURVE;
}

function createDisabledMusicPlayer({ rootEl }) {
  rootEl?.setAttribute("hidden", "");
  return {
    load: async () => {},
    toggle: () => false,
    togglePause: () => {},
    next: () => {},
    previous: () => {},
    setEnabled: () => {},
    setVolume: () => {},
    resumeAfterGesture: () => {},
    isEnabled: () => false,
    getVolume: () => 0,
  };
}

export function createMusicPlayer({
  audioEl,
  coverEl,
  titleEl,
  artistEl,
  volumeEl,
  rootEl,
  prevEl,
  pauseEl,
  nextEl,
}) {
  if (!MUSIC_ENABLED) return createDisabledMusicPlayer({ rootEl });
  let tracks = [];
  let order = [];
  let index = 0;
  let enabled = readEnabled();
  let volume = readVolume();
  let fading = null;

  function readEnabled() {
    try {
      const raw = localStorage.getItem(MUSIC_KEY);
      if (raw == null || raw === "") return true;
      return raw === "1" || raw === "true" || raw === "on";
    } catch {
      return true;
    }
  }

  function persistEnabled() {
    try {
      localStorage.setItem(MUSIC_KEY, enabled ? "1" : "0");
    } catch {
      /* private mode / quota */
    }
  }

  function readVolume() {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw == null || raw.trim() === "") return DEFAULT_VOLUME;
      const n = Number(raw);
      if (!Number.isFinite(n)) return DEFAULT_VOLUME;
      return Math.min(1, Math.max(0, n));
    } catch {
      return DEFAULT_VOLUME;
    }
  }

  function persistVolume() {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* private mode / quota */
    }
  }

  function paintVolume() {
    if (!volumeEl) return;
    const pct = Math.round(volume * 100);
    volumeEl.value = String(pct);
    volumeEl.setAttribute("aria-valuenow", String(pct));
    volumeEl.style.setProperty("--fill", `${pct}%`);
    volumeEl.closest(".now-playing-volume")?.classList.toggle("is-muted", pct === 0);
  }

  function setVolume(next, { persist = true } = {}) {
    volume = Math.min(1, Math.max(0, next));
    if (persist) persistVolume();
    paintVolume();
    if (!fading && audioEl) audioEl.volume = gainFromPosition(volume);
  }

  function shuffle(list) {
    const next = list.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function rebuildOrder({ keepCurrent = false } = {}) {
    const current = keepCurrent && order[index] ? order[index].id : null;
    order = shuffle(tracks);
    if (current && order.length > 1) {
      const at = order.findIndex((track) => track.id === current);
      if (at > 0) {
        const [item] = order.splice(at, 1);
        order.unshift(item);
      }
    }
    index = 0;
  }

  function paint(track) {
    if (!track) return;
    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
    if (coverEl) {
      if (track.cover) {
        coverEl.src = trackUrl(track.cover);
        coverEl.hidden = false;
      } else {
        coverEl.removeAttribute("src");
        coverEl.hidden = true;
      }
    }
    rootEl?.classList.toggle("is-playing", enabled && !audioEl.paused);
  }

  function cancelFade() {
    if (!fading) return;
    window.clearInterval(fading.timer);
    window.cancelAnimationFrame(fading.raf);
    fading = null;
  }

  function fadeVolume(from, to, done) {
    cancelFade();
    if (!audioEl || from === to) {
      if (audioEl) audioEl.volume = gainFromPosition(to);
      done?.();
      return;
    }
    const start = performance.now();
    fading = {
      raf: 0,
      timer: 0,
    };
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      audioEl.volume = gainFromPosition(from + (to - from) * t);
      if (t < 1) fading.raf = window.requestAnimationFrame(step);
      else {
        fading = null;
        done?.();
      }
    };
    fading.raf = window.requestAnimationFrame(step);
  }

  function trackUrl(file) {
    return new URL(`music/${file}`, window.location.href).href;
  }

  function playCurrent({ fadeIn = true } = {}) {
    const track = order[index];
    if (!track || !enabled) return;
    audioEl.src = trackUrl(track.file);
    paint(track);
    audioEl.volume = fadeIn ? 0 : gainFromPosition(volume);
    const play = audioEl.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        rootEl?.classList.add("is-blocked");
      });
    }
    if (fadeIn) fadeVolume(0, volume);
  }

  function nextTrack() {
    if (order.length === 0) return;
    index = (index + 1) % order.length;
    if (index === 0) order = shuffle(tracks);
    playCurrent({ fadeIn: false });
  }

  function previousTrack() {
    if (order.length === 0) return;
    if (audioEl && audioEl.currentTime > 2.5) {
      audioEl.currentTime = 0;
      if (audioEl.paused && enabled) {
        const play = audioEl.play();
        if (play && typeof play.catch === "function") play.catch(() => {});
      }
      return;
    }
    index = (index - 1 + order.length) % order.length;
    playCurrent({ fadeIn: false });
  }

  function togglePause() {
    if (!audioEl || tracks.length === 0) return;
    if (!enabled) {
      setEnabled(true);
      return;
    }
    if (audioEl.paused) {
      const play = audioEl.play();
      if (play && typeof play.catch === "function") {
        play.catch(() => rootEl?.classList.add("is-blocked"));
      }
      return;
    }
    audioEl.pause();
  }

  function onEnded() {
    nextTrack();
  }

  function syncPauseButton() {
    if (!pauseEl) return;
    const paused = !enabled || !audioEl || audioEl.paused;
    pauseEl.setAttribute("aria-label", paused ? "Reproducir" : "Pausa");
    pauseEl.setAttribute("aria-pressed", paused ? "false" : "true");
  }

  function onPlay() {
    rootEl?.classList.remove("is-blocked");
    rootEl?.classList.add("is-playing");
    syncPauseButton();
  }

  function onPause() {
    rootEl?.classList.remove("is-playing");
    syncPauseButton();
  }

  function resumeAfterGesture() {
    if (!enabled || tracks.length === 0) return;
    rootEl?.classList.remove("is-blocked");
    if (audioEl.paused) playCurrent({ fadeIn: false });
  }

  function setEnabled(on) {
    enabled = on;
    persistEnabled();
    if (!enabled) {
      cancelFade();
      audioEl.pause();
      rootEl?.classList.remove("is-playing", "is-blocked");
      syncPauseButton();
      return;
    }
    if (tracks.length === 0) return;
    if (!order.length) rebuildOrder();
    playCurrent({ fadeIn: true });
  }

  function toggle() {
    setEnabled(!enabled);
    return enabled;
  }

  function bindVolume() {
    if (!volumeEl) return;
    paintVolume();
    volumeEl.addEventListener("input", () => {
      cancelFade();
      setVolume(Number(volumeEl.value) / 100);
    });
    volumeEl.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    const volumeRoot = volumeEl.closest(".now-playing-volume");
    const volumeBtn = volumeRoot?.querySelector("#music-volume");
    if (!volumeRoot || !volumeBtn) return;

    const coarse = window.matchMedia("(pointer: coarse)");
    const syncExpanded = () => {
      const open =
        volumeRoot.matches(":hover") ||
        volumeRoot.matches(":focus-within") ||
        volumeRoot.classList.contains("is-open") ||
        volumeRoot.classList.contains("is-dragging");
      volumeBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };

    volumeBtn.addEventListener("click", () => {
      if (!coarse.matches) return;
      volumeRoot.classList.toggle("is-open");
      syncExpanded();
    });
    volumeRoot.addEventListener("mouseenter", syncExpanded);
    volumeRoot.addEventListener("mouseleave", syncExpanded);
    volumeRoot.addEventListener("focusin", syncExpanded);
    volumeRoot.addEventListener("focusout", () => {
      window.setTimeout(syncExpanded, 0);
    });
    volumeEl.addEventListener("pointerdown", () => {
      volumeRoot.classList.add("is-dragging");
      syncExpanded();
    });
    window.addEventListener("pointerup", () => {
      if (!volumeRoot.classList.contains("is-dragging")) return;
      volumeRoot.classList.remove("is-dragging");
      syncExpanded();
    });
  }

  function bindTransport() {
    prevEl?.addEventListener("click", () => {
      if (!enabled) return;
      previousTrack();
    });
    nextEl?.addEventListener("click", () => {
      if (!enabled) return;
      nextTrack();
    });
    pauseEl?.addEventListener("click", togglePause);
    syncPauseButton();
  }

  async function load() {
    const res = await fetch("music/playlist.json");
    if (!res.ok) throw new Error("playlist missing");
    const data = await res.json();
    tracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (tracks.length === 0) {
      rootEl?.setAttribute("hidden", "");
      return;
    }
    bindVolume();
    bindTransport();
    rebuildOrder();
    audioEl.addEventListener("ended", onEnded);
    audioEl.addEventListener("play", onPlay);
    audioEl.addEventListener("pause", onPause);
    paint(order[0]);
    if (enabled) playCurrent({ fadeIn: true });
  }

  return {
    load,
    toggle,
    togglePause,
    next: nextTrack,
    previous: previousTrack,
    setEnabled,
    setVolume,
    resumeAfterGesture,
    isEnabled: () => enabled,
    getVolume: () => volume,
  };
}
