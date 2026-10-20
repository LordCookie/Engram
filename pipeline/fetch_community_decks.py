"""Community-Decks von der offiziellen Deckbuilder-Seite (cyberpunktcg.com) fürs
Co-Play-Korpus (PLAN.md § 12 C).

Quelle: die öffentlichen Decks, die cyberpunktcg.com unter „Community decks" zeigt —
geladen über dieselbe NetDeck-API, aus der auch `fetch_cards.py` die Karten holt
(`/api/cyberpunk/decks/public` + `/api/cyberpunk/decks/<id>`). robots der Seiten:
`Allow: /`. Die Slugs sind identisch mit unseren `cards.json`-IDs.

Leitplanken (wie `fetch_cards.py` / `sim/pull_meta.ts`):
  - Höflich: selbst-nennender User-Agent, Pause zwischen Abrufen, Cache je Deck
    (unverändertes `updated_at` → kein erneuter Abruf).
  - § 8 + Datenschutz: gespeichert werden NUR Legend-Slugs + Stückzahlen. Keine
    Decknamen, keine Nutzernamen/-IDs, keine Kartentexte. Alles gitignored.
  - Gegen Verzerrung: höchstens `--per-owner` Decks je Ersteller (die neuesten),
    exakt gleiche Listen (Kopien/Forks) zählen einmal. Legalität prüft danach
    `ingest_decks.py` mit unserem eigenen Regel-Port.

Ehrlichkeit (§ 12): Community-Decks sind KEINE Turnierergebnisse — die App weist
sie getrennt von den Meta-Decks aus.

Lauf:   python pipeline/fetch_community_decks.py            # alle, dann:
        python pipeline/ingest_decks.py
Optionen: --limit N (max. Decks), --per-owner K (Standard 3), --delay S, --refresh
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://api.netdeck.gg/api/cyberpunk/decks"
UA = "engram-tcg-tool/0.2 (local hobby project; github LordCookie/Engram)"
CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "netdeck-decks"
OUT = Path(__file__).resolve().parent / "decklists" / "netdeck-community.json"
SOURCE = "netdeck-community"
PAGE = 100


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (feste https-URL)
        return json.loads(r.read().decode("utf-8"))


def list_public(delay: float) -> list[dict]:
    """Alle öffentlichen Decks (nur Kopfdaten) seitenweise."""
    items: list[dict] = []
    offset = 0
    while True:
        page = get_json(f"{BASE}/public?limit={PAGE}&offset={offset}&sort=recent")
        batch = page.get("items") or []
        items.extend(batch)
        offset += len(batch)
        total = int(page.get("total") or 0)
        print(f"  Liste: {offset}/{total}")
        if not batch or offset >= total:
            return items
        time.sleep(delay)


def reduce_deck(detail: dict) -> dict:
    """Nur Slugs + Stückzahlen behalten (Legends / Deck; Sideboard zählt nicht)."""
    legends: list[str] = []
    cards: dict[str, int] = {}
    for zone in detail.get("zones") or []:
        code = zone.get("zone_code")
        for entry in zone.get("cards") or []:
            slug = (entry.get("card") or {}).get("slug")
            qty = int(entry.get("quantity") or 0)
            if not slug or qty <= 0:
                continue
            if code == "legends":
                legends.append(slug)
            elif code == "deck":
                cards[slug] = cards.get(slug, 0) + qty
    return {"legends": legends, "cards": cards}


def pick_per_owner(items: list[dict], per_owner: int) -> list[dict]:
    """Je Ersteller die `per_owner` zuletzt geänderten Decks (Liste ist schon neu→alt)."""
    seen: dict[str, int] = {}
    out: list[dict] = []
    for it in sorted(items, key=lambda x: x.get("updated_at") or "", reverse=True):
        owner = ((it.get("owner") or {}).get("user_id")) or it.get("id")
        if seen.get(owner, 0) >= per_owner:
            continue
        seen[owner] = seen.get(owner, 0) + 1
        out.append(it)
    return out


def deck_key(d: dict) -> str:
    return json.dumps([sorted(d["legends"]), sorted(d["cards"].items())])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="höchstens so viele Decks (0 = alle)")
    ap.add_argument("--per-owner", type=int, default=3)
    ap.add_argument("--delay", type=float, default=1.0, help="Sekunden zwischen Abrufen")
    ap.add_argument("--refresh", action="store_true", help="Cache ignorieren")
    a = ap.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)

    print("Öffentliche Decks auflisten …")
    items = [x for x in list_public(a.delay) if ((x.get("format") or {}).get("code")) == "standard"]
    chosen = pick_per_owner(items, a.per_owner)
    if a.limit:
        chosen = chosen[: a.limit]
    owners = len({(x.get("owner") or {}).get("user_id") for x in items})
    print(f"{len(items)} Standard-Decks von {owners} Erstellern → {len(chosen)} ausgewählt (≤ {a.per_owner} je Ersteller)")

    decks: list[dict] = []
    fetched = cached = failed = 0
    for i, it in enumerate(chosen, 1):
        cache = CACHE_DIR / f"{it['id']}.json"
        red = None
        if cache.exists() and not a.refresh:
            c = json.loads(cache.read_text(encoding="utf-8"))
            if c.get("updated_at") == it.get("updated_at"):
                red = c["deck"]
                cached += 1
        if red is None:
            try:
                time.sleep(a.delay)
                red = reduce_deck(get_json(f"{BASE}/{it['id']}"))
                cache.write_text(json.dumps({"updated_at": it.get("updated_at"), "deck": red}), encoding="utf-8")
                fetched += 1
            except Exception as e:  # noqa: BLE001 — einzelner Ausfall bricht den Lauf nicht ab
                print(f"  ✗ {it['id']}: {e}")
                failed += 1
                continue
        decks.append(red)
        if i % 50 == 0:
            print(f"  {i}/{len(chosen)} (neu {fetched}, Cache {cached})")

    unique: dict[str, dict] = {}
    for d in decks:
        unique.setdefault(deck_key(d), {"source": SOURCE, **d})
    OUT.write_text(json.dumps(list(unique.values()), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(
        f"\nFertig: {len(decks)} Decks ({fetched} neu, {cached} aus dem Cache, {failed} Fehler), "
        f"{len(decks) - len(unique)} Kopien entfernt → {len(unique)} in {OUT.relative_to(ROOT)}"
    )
    print("Weiter: python pipeline/ingest_decks.py")


if __name__ == "__main__":
    main()
