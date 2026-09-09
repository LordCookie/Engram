"""Lädt alle Kartenbilder in einen LOKALEN, gitignoreten Ordner (Offline-Archiv).

§ 8 (feste Projektregel): Kartenbilder werden NICHT ins Repo oder ins Bundle
verteilt. Dieses Skript ist die „trotzdem pullen"-Möglichkeit für den EIGENEN,
lokalen Gebrauch — die Bilder landen in `pipeline/card-images/` (gitignored) und
werden nie committet. Für Offline in der App reicht der Knopf „Alle Bilder offline
laden" (Tab „Mehr"), der sie in den Geräte-Cache legt.

Nur Standardbibliothek (wie `fetch_cards.py`). Höflich: selbst-nennender
User-Agent + kleines Delay; bereits geladene Bilder werden übersprungen.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.netdeck.gg/api/cards/cyberpunk"
OUT = Path(__file__).resolve().parent / "card-images"
UA = "engram-tcg-tool/0.1 (local hobby project; github LordCookie/Engram)"
LIST_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Origin": "https://cyberpunktcg.com",
    "Referer": "https://cyberpunktcg.com/",
}
DELAY = 0.3  # höflich bleiben


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=LIST_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_list() -> list[dict]:
    """Alle Karten (slug + frische, signierte image_url) paginiert holen."""
    items: list[dict] = []
    offset, limit = 0, 100
    while True:
        page = get_json(f"{API}?limit={limit}&offset={offset}")
        items.extend(page.get("items", []))
        total = int(page.get("total", 0))
        offset += limit
        if offset >= total:
            break
        time.sleep(DELAY)
    return items


def ext_from_url(url: str) -> str:
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    return suffix if suffix in (".png", ".jpg", ".jpeg", ".webp") else ".png"


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    dest.write_bytes(data)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    items = fetch_list()
    print(f"{len(items)} Karten. Lade Bilder -> {OUT} (gitignored) ...")
    ok = skip = fail = 0
    for it in items:
        slug = it.get("slug")
        url = it.get("image_url")
        if not slug or not url:
            fail += 1
            continue
        dest = OUT / f"{slug}{ext_from_url(url)}"
        if dest.exists() and dest.stat().st_size > 0:
            skip += 1
            continue
        try:
            download(url, dest)
            ok += 1
            time.sleep(DELAY)
        except Exception as e:  # noqa: BLE001 — einzelnes Bild darf scheitern
            fail += 1
            print(f"  x {slug}: {e}")
    print(f"\nFertig: {ok} geladen, {skip} vorhanden, {fail} fehlgeschlagen.")
    print("Ordner bleibt lokal (§ 8) — wird nicht committet.")


if __name__ == "__main__":
    main()
