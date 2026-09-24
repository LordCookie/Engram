"""Ermittelt, welche Karten eine Alt-Art (mehr als ein Printing) haben.

ÜBERHOLT (2026-09-24): Die Künstler-Angabe der Quelle ist unzuverlässig (gleiches Bild
mit anderem Künstler, zwei Illustrationen vom selben Künstler). Maßgeblich ist jetzt der
Bildbefund: `python pipeline/hash_images.py --write-altarts`.

Die Listen-API (fetch_cards.py) liefert nur ein Printing je Karte. Der Detail-
Endpoint `…/api/cards/cyberpunk/<slug>` liefert dagegen das `printings`-Array —
> 1 Eintrag = die Karte hat mindestens eine Alt-Art. Wir speichern NUR die Slugs
(keine Bilder/Regeltexte, § 8) nach `app/src/data/altArts.json` (gitignored, wie
cards.json). Die App nutzt die Liste optional, um im Karten-Detail einen Alt-Art-
Zähler anzubieten.

Höflich wie fetch_cards.py: selbstnennender User-Agent + Delay. Nur stdlib.

Lauf:  python pipeline/fetch_altarts.py
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "src" / "data"
CARDS = DATA / "cards.json"
OUT = DATA / "altArts.json"

UA = "engram-tcg-tool/0.1 (local hobby project; github LordCookie/Engram)"
BASE = "https://api.netdeck.gg/api/cards/cyberpunk"
DELAY = 0.4  # höflich


def _get(slug: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/{slug}",
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Origin": "https://cyberpunktcg.com",
            "Referer": "https://cyberpunktcg.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    if not CARDS.exists():
        raise SystemExit("cards.json fehlt — erst `python pipeline/fetch_cards.py`.")
    slugs = [c["id"] for c in json.loads(CARDS.read_text(encoding="utf-8"))]
    print(f"Prüfe {len(slugs)} Karten auf Alt-Arts (Detail-Endpoint) …")

    with_alt: list[str] = []
    failed = 0
    for i, slug in enumerate(slugs):
        try:
            d = _get(slug)
            prints = d.get("printings") or []
            # Echte Alt-Art = alternative ILLUSTRATION: mehr als ein Künstler.
            # (`printings.length > 1` allein zählt auch Reprints/Foils desselben Bildes.)
            artists = {
                (p.get("artist") or "").strip().lower() for p in prints if (p.get("artist") or "").strip()
            }
            if len(artists) > 1:
                with_alt.append(slug)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ! {slug}: {e}")
        if i and i % 25 == 0:
            print(f"  ... {i}/{len(slugs)}")
        time.sleep(DELAY)

    with_alt.sort()
    OUT.write_text(json.dumps(with_alt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Fertig: {len(with_alt)}/{len(slugs)} Karten mit Alt-Art (>1 Kuenstler), {failed} Fehler -> {OUT}")


if __name__ == "__main__":
    main()
