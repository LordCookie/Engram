"""Holt die Cyberpunk-TCG-Kartendaten und normalisiert sie ins Card-Schema.

PLAN.md § 5 Phase 1 Aufgabe 2, § 11.2. Quelle ist die NetDeck-API, die hinter
der Filtermaske von cyberpunktcg.com liegt (Spike 0.2, geklaert in DECISIONS.md):

    https://api.netdeck.gg/api/cards/cyberpunk?limit=100&offset=0

Die Listenantwort liefert bereits alle noetigen Felder (Farbe, Typ, Tags,
Regeltext, Printing-UUID, Bild-URL, Sammlernummer) — keine Detailseiten noetig.

Ausgabe:
    app/src/data/cards.json      Card[]      (Katalog fuer die App)
    app/src/data/printings.json  Printing[]  (Printing-UUID -> Karte, Bild-Link)

Nur Standardbibliothek, laeuft ohne pip. Adapter-Muster: `CardSource` als
Schnittstelle, `NetDeckSource` als eine Implementierung — ein Quellenwechsel
kostet nur eine neue Klasse.

Leitplanken (PLAN.md § 8, § 11): robots.txt erlaubt alles (Allow: /), wir
bleiben trotzdem hoeflich — Rate-Limit und ein User-Agent, der das Tool nennt.
Keine Kartenbilder herunterladen/verteilen; wir speichern nur Links.
"""

from __future__ import annotations

import abc
import json
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

# Trage hier bei Bedarf eine Kontaktadresse ein (hoefliche Scraping-Konvention).
CONTACT = ""
USER_AGENT = "engram-tcg-tool/0.1 (local hobby project" + (
    f"; {CONTACT}" if CONTACT else ""
) + ")"

OUT_DIR = Path(__file__).resolve().parent.parent / "app" / "src" / "data"

COLOR_MAP = {"red": "RED", "green": "GREEN", "blue": "BLUE", "yellow": "YELLOW"}
TYPE_MAP = {"legend": "LEGEND", "unit": "UNIT", "gear": "GEAR", "program": "PROGRAM"}


class CardSource(abc.ABC):
    """Schnittstelle fuer eine Kartendatenquelle (Adapter-Muster)."""

    @abc.abstractmethod
    def fetch_raw(self) -> List[Dict[str, Any]]:
        """Liefert die rohen Karten-Dicts der Quelle."""


class NetDeckSource(CardSource):
    BASE = "https://api.netdeck.gg/api/cards/cyberpunk"

    def __init__(self, page_size: int = 100, delay: float = 1.0) -> None:
        self.page_size = page_size
        self.delay = delay

    def _get(self, offset: int) -> Dict[str, Any]:
        url = f"{self.BASE}?limit={self.page_size}&offset={offset}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Origin": "https://cyberpunktcg.com",
                "Referer": "https://cyberpunktcg.com/",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def fetch_raw(self) -> List[Dict[str, Any]]:
        first = self._get(0)
        total = int(first.get("total", 0))
        items: List[Dict[str, Any]] = list(first.get("items", []))
        offset = self.page_size
        while offset < total:
            time.sleep(self.delay)  # hoeflich bleiben
            page = self._get(offset)
            items.extend(page.get("items", []))
            offset += self.page_size
        return items


def normalize_card(item: Dict[str, Any]) -> Dict[str, Any]:
    """Rohes API-Item -> Card (PLAN.md § 2). Optionale Felder nur bei Wert."""
    color = (item.get("color") or "").lower()
    ctype = (item.get("card_type") or "").lower()

    card: Dict[str, Any] = {
        "id": item["slug"],
        "setCode": (item.get("set") or {}).get("code", ""),
        "name": item.get("name") or item.get("display_name") or item["slug"],
        "type": TYPE_MAP.get(ctype),
        "color": COLOR_MAP.get(color),
        "tags": list(item.get("classifications") or []) + list(item.get("keywords") or []),
        "rarity": item.get("rarity") or "",
        "rulesText": item.get("rules_text") or "",
    }
    if item.get("subname"):
        card["subtitle"] = item["subname"]
    if item.get("print_number"):
        card["collectorNumber"] = item["print_number"]
    for key in ("ram", "cost", "power"):
        if item.get(key) is not None:
            card[key] = item[key]
    return card


def normalize_printing(item: Dict[str, Any]) -> Dict[str, Any]:
    """Rohes API-Item -> Printing (PLAN.md § 2). Nur Bild-LINK, nie das Bild."""
    slug = item["slug"]
    return {
        "id": item.get("printing_id") or slug,
        "cardId": slug,
        "variant": "STANDARD",
        # Stabiler (unsignierter) Bild-Link; die signierte image_url laeuft ab.
        "imageUrl": item.get("source_image_url") or "",
        # Offizielle DB-Seite zum Ansehen (PLAN.md § 8: auf die DB verlinken).
        "pageUrl": f"https://cyberpunktcg.com/cards/{slug}?printing={item.get('printing_id', '')}",
    }


def _write(path: Path, data: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(source: Optional[CardSource] = None) -> None:
    source = source or NetDeckSource()
    print(f"Hole Kartendaten (User-Agent: {USER_AGENT}) ...")
    raw = source.fetch_raw()
    print(f"  {len(raw)} rohe Karten erhalten.")

    cards = [normalize_card(it) for it in raw]
    printings = [normalize_printing(it) for it in raw]

    cards.sort(key=lambda c: c["id"])
    printings.sort(key=lambda p: p["id"])

    # --- Qualitaets-Report (deckt Schemaaenderungen und Luecken auf) ---
    colors = sorted({c["color"] for c in cards if c["color"]})
    types = sorted({c["type"] for c in cards if c["type"]})
    sets = sorted({c["setCode"] for c in cards})
    bad_color = [c["id"] for c in cards if c["color"] is None]
    bad_type = [c["id"] for c in cards if c["type"] is None]
    slugs = [c["id"] for c in cards]
    dupes = sorted({s for s in slugs if slugs.count(s) > 1})

    print(f"  Farben:  {colors}")
    print(f"  Typen:   {types}")
    print(f"  Sets:    {sets}")
    print(f"  ohne RAM: {sum(1 for c in cards if 'ram' not in c)}  "
          f"ohne Cost: {sum(1 for c in cards if 'cost' not in c)}")
    if bad_color:
        print(f"  WARNUNG: {len(bad_color)} Karten mit unbekannter Farbe: {bad_color}")
    if bad_type:
        print(f"  WARNUNG: {len(bad_type)} Karten mit unbekanntem Typ: {bad_type}")
    if dupes:
        print(f"  WARNUNG: doppelte slugs: {dupes}")

    _write(OUT_DIR / "cards.json", cards)
    _write(OUT_DIR / "printings.json", printings)
    print(f"Geschrieben: {OUT_DIR / 'cards.json'} ({len(cards)} Karten)")
    print(f"Geschrieben: {OUT_DIR / 'printings.json'} ({len(printings)} Printings)")


if __name__ == "__main__":
    main()
