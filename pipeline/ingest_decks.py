"""Ingest-Pipeline für die statistische Synergie (PLAN.md § 12 C, Phase 4a).

Liest Decklisten aus `pipeline/decklists/*.json`, behaelt NUR legale (unser eigener
Regel-Check), und aggregiert das Ko-Vorkommen der Karten zu
`app/src/data/coplay.json`. Die App führt dieses Basis-Korpus mit den live aus
Dexie gebauten eigenen Decks zusammen (`mergeCorpora`) — so wächst die empirische
Synergie mit der Zahl der ingesteten Decks (der EDHREC-Gedanke, lokal).

Deckformat (eine Datei je Deck), slug-basiert:
    { "legends": ["slug", "slug", "slug"], "cards": { "slug": anzahl, ... } }
`cards` sind die Deckkarten OHNE Legends.

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
    `sim/meta-decks/` (beide gitignored/optional; gleiches slug-Format)."""
    decks: list[dict] = []
    for d in (DECKS_DIR, META_DIR):
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
            if isinstance(data, list):
                decks.extend(x for x in data if isinstance(x, dict))
            elif isinstance(data, dict):
                decks.append(data)
    return decks


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
    df: dict[str, int] = {}
    co: dict[str, dict[str, int]] = {}
    n_legal = 0
    n_illegal = 0

    for deck in raw:
        if not is_legal(deck, cards, rs):
            n_illegal += 1
            continue
        n_legal += 1
        ids = sorted({*deck.get("legends", []), *(deck.get("cards", {}) or {}).keys()})
        for i in ids:
            df[i] = df.get(i, 0) + 1
        for a, b in combinations(ids, 2):
            co.setdefault(a, {})[b] = co.get(a, {}).get(b, 0) + 1
            co.setdefault(b, {})[a] = co.get(b, {}).get(a, 0) + 1

    out: dict[str, Any] = {
        "version": "ingest-v1",
        "generatedBy": "ingest_decks.py",
        "n": n_legal,
        "df": df,
        "co": co,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(raw)} Decklisten gelesen -> {n_legal} legal, {n_illegal} verworfen")
    print(f"  {len(df)} Karten, {sum(len(r) for r in co.values()) // 2} Kartenpaare -> {OUT}")
    if n_legal:
        pairs = sorted(
            ((cnt, a, b) for a, row in co.items() for b, cnt in row.items() if a < b),
            reverse=True,
        )[:8]
        print("  häufigste Paare:")
        for cnt, a, b in pairs:
            na = cards.get(a, {}).get("name", a)
            nb = cards.get(b, {}).get("name", b)
            print(f"    {cnt:3d}  {na} + {nb}")
    else:
        print(f"  (noch keine legalen Decks — lege Decklisten in {DECKS_DIR}/ ab)")


if __name__ == "__main__":
    main()
