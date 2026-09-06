"""Baut app/src/data/features.json aus der kuratierten LLM-Lesefassung.

PLAN.md § 12, Variante A. Trennung Extraktion vs. Urteil: die Merkmale stammen
aus einem sorgfaeltigen Lesedurchgang durch die Regeltexte (Agent/Opus, kein
API-Key) und liegen in `pipeline/features_curated.json` (gitignored, enthaelt
kurze Regeltext-Belege = CDPR-IP, § 8). Dieses Skript fuegt nur die Tags aus
cards.json hinzu, VALIDIERT streng gegen das kontrollierte Vokabular und die
Belegpflicht und schreibt die finale features.json.

Reihenfolge der Verfeinerung:
  bootstrap_features.py  -> heuristische Muster (Fallback ohne Quelle)
  build_features.py      -> kuratierter Lesedurchgang (dieser, Standard)
  extract_features.py    -> reproduzierbarer LLM-Lauf per API (neue Sets)

Belegpflicht (§ 12): `evidence` ist ein echter Teilstring des `rules_text` oder
leer. Tokens ausschliesslich aus `feature-vocab.json`. Jede Katalogkarte kommt
genau einmal vor. Bricht bei jedem Verstoss mit klarer Meldung ab.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "app" / "src" / "data"
CARDS = DATA_DIR / "cards.json"
VOCAB = DATA_DIR / "feature-vocab.json"
CURATED = Path(__file__).resolve().parent / "features_curated.json"
OUT = DATA_DIR / "features.json"


def tag_token(tag: str) -> str:
    return tag.upper().replace(" ", "_")


def main() -> None:
    if not CURATED.exists():
        raise SystemExit(
            f"{CURATED.name} fehlt. Das ist die kuratierte Lesefassung (gitignored, "
            "CDPR-IP). Ohne sie nutze bootstrap_features.py."
        )

    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    curated = json.loads(CURATED.read_text(encoding="utf-8"))["cards"]

    state_tokens = set(vocab["state"])
    theme_tokens = set(vocab["themes"])
    tagpayoff_tokens = set(vocab["tagPayoff"])

    by_id = {c["id"]: c for c in cards}
    errors: List[str] = []

    # Deckung: jede Karte genau einmal, keine Karteileichen.
    missing = [cid for cid in by_id if cid not in curated]
    extra = [cid for cid in curated if cid not in by_id]
    if missing:
        errors.append(f"{len(missing)} Karten ohne Merkmale: {missing[:5]}...")
    if extra:
        errors.append(f"{len(extra)} unbekannte Karten-IDs in der Quelle: {extra[:5]}...")

    out_cards: Dict[str, Any] = {}
    for cid, card in by_id.items():
        f = curated.get(cid)
        if f is None:
            continue
        text = card.get("rulesText") or ""

        for tok in [*f.get("provides", []), *f.get("payoffFor", [])]:
            if tok not in state_tokens:
                errors.append(f"{cid}: STATE-Token '{tok}' nicht im Vokabular")
        for tok in f.get("themes", []):
            if tok not in theme_tokens:
                errors.append(f"{cid}: THEME-Token '{tok}' nicht im Vokabular")
        for tok in f.get("tagPayoff", []):
            if tok not in tagpayoff_tokens:
                errors.append(f"{cid}: TAGPAYOFF-Token '{tok}' nicht im Vokabular")

        ev = f.get("evidence", "")
        if ev and ev not in text:
            errors.append(f"{cid}: evidence ist kein Teilstring des rules_text: {ev!r}")

        out_cards[cid] = {
            "provides": sorted(f.get("provides", [])),
            "payoffFor": sorted(f.get("payoffFor", [])),
            "themes": sorted(f.get("themes", [])),
            "tags": sorted(tag_token(t) for t in card.get("tags", [])),
            "tagPayoff": sorted(f.get("tagPayoff", [])),
            "evidence": ev,
        }

    if errors:
        print(f"{len(errors)} Fehler:")
        for e in errors[:40]:
            print("  -", e)
        raise SystemExit("Abbruch: features_curated.json ist nicht valide.")

    OUT.write_text(
        json.dumps(
            {
                "version": "curated-2026-09-04",
                "generatedBy": "build_features.py (kuratierter LLM-Lesedurchgang, Opus)",
                "cards": out_cards,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Report
    from collections import Counter

    counter: Counter = Counter()
    with_feat = 0
    for e in out_cards.values():
        if e["provides"] or e["payoffFor"] or e["themes"] or e["tagPayoff"]:
            with_feat += 1
        for rel in ("provides", "payoffFor", "themes", "tagPayoff"):
            for tok in e[rel]:
                counter[f"{rel}:{tok}"] += 1
    print(f"{len(out_cards)} Karten -> {OUT}")
    print(f"  mit mind. 1 Merkmal (ausser Tags): {with_feat}")
    print("  haeufigste Merkmale:")
    for key, n in counter.most_common(18):
        print(f"    {n:3d}  {key}")


if __name__ == "__main__":
    main()
