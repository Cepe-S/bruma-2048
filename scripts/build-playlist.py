"""Extract MP3 metadata and embedded cover art into music/playlist.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

from mutagen.id3 import ID3
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parent.parent
MUSIC = ROOT / "music"
COVERS = MUSIC / "covers"


def slug(name: str) -> str:
    safe = re.sub(r"[^\w\-]+", "-", name.lower()).strip("-")
    return safe or "track"


def read_tags(path: Path) -> tuple[str, str, bytes | None]:
    audio = MP3(path, ID3=ID3)
    tags = audio.tags or {}
    title = str(tags.get("TIT2", path.stem)).strip()
    artist = str(tags.get("TPE1", "Desconocido")).strip()
    cover = None
    for key in tags:
        if key.startswith("APIC"):
            cover = tags[key].data
            break
    return title, artist, cover


def main() -> None:
    COVERS.mkdir(parents=True, exist_ok=True)
    tracks = []
    used_slugs: dict[str, int] = {}

    for mp3 in sorted(MUSIC.glob("*.mp3")):
        title, artist, cover = read_tags(mp3)
        base = slug(f"{artist}-{title}")
        count = used_slugs.get(base, 0)
        used_slugs[base] = count + 1
        track_id = base if count == 0 else f"{base}-{count + 1}"

        cover_rel = None
        if cover:
            cover_path = COVERS / f"{track_id}.jpg"
            cover_path.write_bytes(cover)
            cover_rel = f"covers/{track_id}.jpg"

        tracks.append(
            {
                "id": track_id,
                "title": title,
                "artist": artist,
                "file": mp3.name,
                "cover": cover_rel,
            }
        )

    playlist = {"tracks": tracks}
    (MUSIC / "playlist.json").write_text(
        json.dumps(playlist, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(tracks)} tracks to music/playlist.json")


if __name__ == "__main__":
    main()
