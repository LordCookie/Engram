"""Ingest-Pipeline für die statistische Synergie (PLAN.md § 12 C, Phase 4a).

Liest Decklisten aus `pipeline/decklists/*.json`, behaelt NUR legale (unser eigener
Regel-Check), und aggregiert das Ko-Vorkommen der Karten zu
`app/src/data/coplay.json`. Die App führt dieses Basis-Korpus mit den live aus
Dexie gebauten eigenen Decks zusammen (`mergeCorpora`) — so wächst die empirische
Synergie mit der Zahl der ingesteten Decks (der EDHREC-Gedanke, lokal).

Deckformat (eine Datei je Deck oder eine Liste von Decks), slug-basiert:
    { "legends": ["slug", "slug", "slug"], "cards": { "slug": anzahl, ... }, "source": "…" }
`cards` sind die Deckkarten OHNE Legends.

Quellen (für die getrennte Ausweisung in der App, Ehrlichkeit § 12):
  - `meta`      — Meta-Decks von cyberpunkmeta.org (`sim/pull_meta.ts`)
  - `community` — öffentliche Decks der offiziellen Deckbuilder-Seite
                  (`pipeline/fetch_community_decks.py`, Feld `source: netdeck-community`)
  - `eigene`    — alles andere in `pipeline/decklists/` (z. B. `sim/import_decklists.ts`)
Exakt gleiche Listen zählen nur einmal (auch über Quellen hinweg).

Ausgabe `ingest-v2` (kompakt, der Chunk bleibt auch bei ~1.000 Decks klein):
    { "version": "ingest-v2", "n": …, "sources": {"meta": …, …},
      "cards": [slug, …], "df": [anzahl je Karte], "pairs": [[i, j, anzahl], …],
      "trios": [[i, j, k, anzahl], …] }
`pairs` nur i < j und erst ab `min_co` gemeinsamen Decks (Einzelfälle sind bei
großem n Rauschen). `trios` = Legend-Trios der Decks (i < j < k, ungefiltert) für den
Legend-Explorer der App. Die App liest v1 (df/co als Maps) und v2 (mit oder ohne trios).

Nur Standardbibliothek. Ehrlichkeit (§ 12): reine Beobachtung; die App kennzeichnet
das als Statistik. Es werden nur Karten-Slugs + Zahlen aggregiert, kein Regeltext.

Lauf:  python pipeline/ingest_decks.py
"""

from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "src" / "data"
CARDS = DATA_DIR / "cards.json"
RULESET = ROOT / "app" / "src" / "rules" / "ruleset.v1.json"
DECKS_DIR = Path(__file__).resolve().parent / "decklists"
# Von `sim/pull_meta.ts` gezogene Online-Meta-Decks (gleiches slug-Format: legends/cards).
META_DIR = ROOT / "sim" / "meta-decks"
OUT = DATA_DIR / "coplay.json"


def load_deck_files() -> list[dict]:
    """Decks aus `pipeline/decklists/` UND den gezogenen Meta-Decks in
    `sim/meta-decks/` (beide gitignored/optional; gleiches slug-Format). Jedes Deck
    bekommt `_origin` = `meta` (aus sim/meta-decks) bzw. `decklists`."""
    decks: list[dict] = []
    for d, origin in ((DECKS_DIR, "decklists"), (META_DIR, "meta")):
        if not d.exists():
            continue
        for p in sorted(d.glob("*.json")):
            if p.name == "index.json":
                continue  # pull_meta-Index, kein Deck
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:  # noqa: BLE001
                print(f"  übersprungen (kein JSON): {p.name} — {e}")
                continue
            # Eine Datei kann ein Deck oder eine Liste von Decks enthalten.
            items = data if isinstance(data, list) else [data]
            decks.extend({**x, "_origin": origin} for x in items if isinstance(x, dict))
    return decks


def source_of(deck: dict) -> str:
    """Quelle für die Ausweisung: meta / community / eigene."""
    if deck.get("_origin") == "meta":
        return "meta"
    if "community" in str(deck.get("source", "")):
        return "community"
    return "eigene"


def deck_signature(deck: dict) -> str:
    """Kartenmenge (Legends + Deckkarten) als Schlüssel für exakte Duplikate."""
    ids = sorted({*deck.get("legends", []), *(deck.get("cards", {}) or {}).keys()})
    return "|".join(ids)


def aggregate(decks: list[dict], min_co: int = 1) -> dict[str, Any]:
    """Legale, deduplizierte Decks → kompaktes `ingest-v2`-Korpus."""
    df: dict[str, int] = {}
    co: dict[tuple[str, str], int] = {}
    trio: dict[tuple[str, ...], int] = {}
    sources: dict[str, int] = {}
    for deck in decks:
        ids = sorted({*deck.get("legends", []), *(deck.get("cards", {}) or {}).keys()})
        src = source_of(deck)
        sources[src] = sources.get(src, 0) + 1
        for i in ids:
            df[i] = df.get(i, 0) + 1
        for a, b in combinations(ids, 2):
            co[(a, b)] = co.get((a, b), 0) + 1
        legends = tuple(sorted(set(deck.get("legends", []))))
        if len(legends) == 3:  # Legend-Trio des Decks (für den Legend-Explorer)
            trio[legends] = trio.get(legends, 0) + 1
    cards = sorted(df)
    idx = {c: i for i, c in enumerate(cards)}
    pairs = sorted(
        ([idx[a], idx[b], cnt] for (a, b), cnt in co.items() if cnt >= min_co),
        key=lambda p: (p[0], p[1]),
    )
    trios = sorted(([*(idx[x] for x in t), cnt] for t, cnt in trio.items()), key=lambda t: t[:3])
    return {
        "version": "ingest-v2",
        "generatedBy": "ingest_decks.py",
        "n": len(decks),
        "sources": dict(sorted(sources.items())),
        "minCo": min_co,
        "cards": cards,
        "df": [df[c] for c in cards],
        "pairs": pairs,
        "trios": trios,
    }


def is_legal(deck: dict, cards: dict[str, dict], rs: dict) -> bool:
    """Port der vier § 1-Regeln (siehe rules/validate.ts)."""
    legend_ids = deck.get("legends", []) or []
    legends = [cards.get(i) for i in legend_ids]
    if any(c is None or c.get("type") != "LEGEND" for c in legends):
        return False
    if len(legends) != rs["legendCount"]:
        return False
    if rs.get("legendNamesMustBeUnique"):
        names = [c["name"] for c in legends]
        if len(set(names)) != len(names):
            return False

    counts: dict[str, int] = {}
    for slug, cnt in (deck.get("cards", {}) or {}).items():
        if not isinstance(cnt, int) or cnt <= 0:
            return False
        counts[slug] = counts.get(slug, 0) + cnt

    deck_size = sum(counts.values())
    if deck_size < rs["deckMin"] or deck_size > rs["deckMax"]:
        return False

    caps: dict[str, int] = {c: 0 for c in rs["colors"]}
    for lg in legends:
        caps[lg["color"]] = caps.get(lg["color"], 0) + (lg.get("ram") or 0)

    for slug, cnt in counts.items():
        card = cards.get(slug)
        if card is None or card.get("type") == "LEGEND":
            return False
        if cnt > rs["maxCopiesPerCard"]:
            return False
        if (card.get("ram") or 0) > caps.get(card["color"], 0):
            return False
    return True


def main() -> None:
    if not CARDS.exists():
        raise SystemExit("cards.json fehlt — erst `python pipeline/fetch_cards.py`.")
    cards = {c["id"]: c for c in json.loads(CARDS.read_text(encoding="utf-8"))}
    rs = json.loads(RULESET.read_text(encoding="utf-8"))

    raw = load_deck_files()
    legal: list[dict] = []
    seen: set[str] = set()
    n_illegal = n_dupes = 0
    for deck in raw:
        if not is_legal(deck, cards, rs):
            n_illegal += 1
            continue
        sig = deck_signature(deck)
        if sig in seen:
            n_dupes += 1
            continue
        seen.add(sig)
        legal.append(deck)

    # Ab ~100 Decks sind Paare, die nur einmal zusammen vorkommen, Rauschen → weglassen.
    out = aggregate(legal, min_co=2 if len(legal) >= 100 else 1)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(
        f"{len(raw)} Decklisten gelesen -> {len(legal)} legal + eindeutig "
        f"({n_illegal} illegal, {n_dupes} Duplikate verworfen)"
    )
    print(f"  Quellen: {out['sources']}")
    print(f"  {len(out['cards'])} Karten, {len(out['pairs'])} Kartenpaare (ab {out['minCo']}×) -> {OUT}")
    print(f"  Dateigröße: {OUT.stat().st_size / 1024:.0f} KB")
    if legal:
        top = sorted(out["pairs"], key=lambda p: -p[2])[:8]
        print("  häufigste Paare:")
        for i, j, cnt in top:
            a, b = out["cards"][i], out["cards"][j]
            print(f"    {cnt:4d}  {cards.get(a, {}).get('name', a)} + {cards.get(b, {}).get('name', b)}")
    else:
        print(f"  (noch keine legalen Decks — lege Decklisten in {DECKS_DIR}/ ab)")


if __name__ == "__main__":
    main()
