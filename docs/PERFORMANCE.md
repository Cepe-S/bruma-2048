# Análisis de performance — Bruma 2048

Hallazgos ordenados por **impacto estimado** en un teléfono de gama media (Safari/Chrome móvil, DPR 2–3). Revisado sobre `app.js`, `background.js`, `vendor/mesh-gradient.js` y `styles.css`.

## 1. Fondo WebGL a pantalla completa (impacto: muy alto)

El canvas `#bruma-bg` monta `MeshGradient` con un shader de ruido simplex que **renderiza en cada frame** mientras la pestaña está visible. Por defecto:

- Tamaño = viewport completo (`.bruma-shift` con `inset: -6%`).
- `devicePixelRatio` hasta **2** → en un móvil 390×844 eso puede ser ~780×1688 px de buffer WebGL.
- `skipEveryOtherFrame: true` → ~30 FPS constantes, no se detiene en reposo.
- `antialias: true` en el contexto WebGL.

**Síntoma:** consumo GPU/CPU continuo aunque el tablero no se mueva.

**Mitigación aplicada:** modo Calidad (Alta/Baja/Auto), `pixelRatio` reducido, `targetFps` más bajo, `maxSegments` limitado en Baja.

## 2. `filter: blur()` sobre el canvas WebGL (impacto: alto)

`background.js` aplica `canvas.style.filter = blur(...)` según la “niebla” del tablero (hasta 22 px). Un blur CSS sobre un canvas animado obliga a **recomponer y filtrar cada frame** encima del costo del shader.

**Mitigación aplicada:** blur desactivado en Calidad Baja; tope reducido en Auto degradado.

## 3. Capa `.grain` con `mix-blend-mode: overlay` (impacto: medio-alto)

El grano usa un SVG con `feTurbulence` y `mix-blend-mode: overlay` sobre todo el viewport. En móvil esto añade una pasada de composición extra permanente.

**Mitigación aplicada:** grano oculto en Calidad Baja.

## 4. `backdrop-filter: blur()` en UI (impacto: medio)

Varios paneles usan desenfoque de fondo:

- `.veil` — 18 px
- `.drawer-panel` — 18 px
- `.now-playing-card` — 16 px
- `.save-dialog::backdrop` — 6 px

En iOS/Android el backdrop-filter es costoso cuando hay animación detrás (el WebGL).

**Mitigación aplicada:** backdrop-filter eliminado en Calidad Baja.

## 5. Sombras y animaciones del tablero/combos (impacto: medio, picos)

- Fichas ≥128 llevan `box-shadow` con glow.
- `.board.is-hot` anima `box-shadow`.
- Combos crean decenas de nodos `.burst-*` con `mix-blend-mode: screen` y animaciones simultáneas.
- `@keyframes board-pay` interpola `box-shadow` (propiedad costosa).

**Mitigación aplicada:** glow reducido en Baja; partículas de burst escaladas; menos anillos/chispas en Baja.

## 6. Bucles `requestAnimationFrame` adicionales (impacto: bajo-medio)

Además del WebGL:

- `background.js`: `easeColors` y `settleNudge` (solo cuando hay cambio de paleta o nudge).
- `app.js`: polling de gamepad **solo si hay mando conectado** (correcto).

**Mitigación aplicada:** bucles de color/nudge pausados cuando `document.hidden`.

## 7. Actualización del DOM del tablero (impacto: bajo-medio)

Cada movimiento llama `render()` → actualiza `textContent`, clases y `--r`/`--c` de cada ficha. Las **posiciones usan `transform`** (bien), pero cambiar texto/clases en muchas fichas puede provocar layout/paint.

No se cambió la lógica del juego; el costo es aceptable frente al fondo WebGL.

## 8. Fuentes de Google Fonts (impacto: bajo)

Dos familias (`Fraunces`, `Outfit`) desde CDN. Afecta carga inicial y FOUT, no tanto FPS sostenido.

## 9. Imágenes pesadas (impacto: potencial, no presente en repo)

El contexto menciona `arrow-flight.png` y `combo-start.png` (~1,4 MB). **No están en este repositorio**; si se añaden, conviene WebP/AVIF y dimensiones ≤2× display.

## 10. Audio (impacto: bajo en Pages)

`MUSIC_ENABLED = false` en GitHub Pages; el reproductor no carga playlist. Sin impacto en la build publicada.

---

## Cómo usar el panel de métricas

1. Tocá el botón **Rendimiento** (ícono de pulso, arriba a la izquierda).
2. Compará **FPS** y **prom** antes/después de cambiar Calidad en el menú.
3. **Frame** = último frame; **Peor** = peor frame reciente; **>50 ms** cuenta frames largos (jank).
4. **Mem** aparece solo en Chromium (`performance.memory`).
5. **DPR** y **Canvas** muestran ratio de píxeles y tamaño del buffer WebGL.
6. El mini gráfico registra los últimos ~60 frames (ms por frame).

El panel **no mide** cuando está cerrado, para no sumar overhead.

## Modo Calidad

| Modo | Comportamiento |
|------|----------------|
| **Alta** | WebGL a DPR limitado (máx. 2), ~30 FPS, efectos completos |
| **Baja** | DPR 1, ~20 FPS, mesh más simple, sin blur/grano/backdrop |
| **Auto** | Empieza en Alta; si FPS promedio < 45 sostenido 2 s, baja a perfil reducido (persistido como auto+degradado) |

Preferencia guardada en `localStorage` (`bruma-2048-quality`).
