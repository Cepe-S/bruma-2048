# Bruma — 2048

2048 original en español (Argentina). Tableros 4×4–7×7, deshacer, vibración de mando, guardado en un texto editable.

## Cómo jugar

Abrí `index.html` con un servidor estático (módulos ES):

```bash
npm start
```

Luego visitá http://127.0.0.1:47261/

## Controles

Flechas / WASD, swipe, mando. Nueva partida pide confirmación.

## Partidas

**Guardar** descarga `bruma-2048-4x4.txt` (el tamaño va en el nombre). Se abre con el Bloc de notas. **Cargar** pega ese texto o abre el archivo.

Un punto es una casilla vacía. Los números son potencias de 2. Las líneas con `#` son comentarios.

```
Tamaño: 4
Puntaje: 4
Mejor: 4
Llegaste a 2048: no
Seguís jugando: no
Partida terminada: no

Tablero:
 2   2   .   .
 .   .   .   .
 .   .   .   .
 .   .   .   .
```

La partida también se guarda sola en el navegador, en el mismo formato. Un JSON viejo sigue pudiendo cargarse.

## Tests

```bash
npm test
```

## Publicar en GitHub Pages

El repo está listo para GitHub Pages (sitio estático, sin build). La música va desactivada en la versión publicada (`config.js` → `MUSIC_ENABLED = false`).

1. Subí el repo a GitHub.
2. En **Settings → Pages**, elegí **Deploy from branch** → `main` → `/ (root)`.
3. Abrí `https://<usuario>.github.io/bruma-2048/`.

## Música (solo local)

Para probar con playlist en tu máquina:

1. Poné MP3 en `music/` y corré `npm run music:build`.
2. Cambiá `MUSIC_ENABLED` a `true` en `config.js`.
3. No subas `music/` (está en `.gitignore`).
