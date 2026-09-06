"""Bootstrap der Synergie-Merkmale (PLAN.md § 12, Variante A, v1).

Erzeugt `app/src/data/features.json` aus `cards.json` per KURATIERTER
Muster-Extraktion. Die Regeln unten kodieren das Leseverstaendnis des mechanischen
Vokabulars (Gigs, Eddies, Gear, Program, Legends, Keywords, Tags) — transparent
und nachvollziehbar. Das ist der v1-Bootstrap OHNE API-Key.

`extract_features.py` (separat) ist der LLM-Weg fuer spaetere Set-Releases und
zur Verfeinerung; er ersetzt diese Datei dann durch eine gepruefte Extraktion.

Belegpflicht (§ 12): `evidence` ist immer ein echter Teilstring des `rules_text`
(die laengste gematchte Stelle). Tokens stammen aus `feature-vocab.json`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "app" / "src" / "data"
CARDS = DATA_DIR / "cards.json"
OUT = DATA_DIR / "features.json"

# (regex, relation, token) — case-insensitiv. Reihenfolge egal; Evidence = laengster Treffer.
CI_RULES: List[Tuple[str, str, str]] = [
    # provides
    (r"ready [^.\n]{0,24}eddie", "provides", "EDDIE"),
    (r"increase a gig", "provides", "HIGH_GIG"),
    (r"decrease a gig", "provides", "LOW_GIG"),
    (r"steal a rival gig|when this unit steals a gig|steal a gig(?!s)", "provides", "GIG_STEAL"),
    (r"you may call a legend|call a legend for free", "provides", "LEGEND_BOARD"),
    # payoffFor
    (r"8\+ value|max gig", "payoffFor", "HIGH_GIG"),
    (r"min gig", "payoffFor", "LOW_GIG"),
    (r"€\$,\s*\{spend\}|pay \d+ €\$|\d+ €\$,\s*\{spend\}", "payoffFor", "EDDIE"),
    (r"equipped gear|equipped unit|for each of its equipped|friendly equipped|its equipped gear", "payoffFor", "GEAR"),
    (r"play(?:ed)? a program|braindance program|a program from|program with cost", "payoffFor", "PROGRAM"),
    (r"face-up legend|friendly legends are face-up|face-down legend|legends in your legends area", "payoffFor", "LEGEND_BOARD"),
    (r"when a friendly[^.\n]{0,40}steals|unit steals 1 or more gigs|steals a gig, ", "payoffFor", "GIG_STEAL"),
    (r"wins a fight|win a fight|loses a fight|while fighting|winning a fight", "payoffFor", "FIGHT"),
    # themes (symmetrisch)
    (r"even value|odd value|value-pair|different values|even number|value of another gig|set a gig", "themes", "GIG_PARITY"),
    (r"street cred|☆", "themes", "STREET_CRED"),
    (r"braindance", "themes", "BRAINDANCE"),
    (r"\{go solo\}", "themes", "GO_SOLO"),
    (r"\{blocker\}", "themes", "BLOCKER"),
    (r"\{adrenaline\}", "themes", "ADRENALINE"),
    (r"a rival discards|rival discards \d|rivals? discards?", "themes", "DISCARD"),
    (r"trash \d|from your trash|from among them|from .{0,20}trash for free|add .{0,30}from your trash", "themes", "TRASH_RECUR"),
    # Glossar-Ergaenzungen (Gameplay Guide S. 11-12):
    (r"\bsells?\b", "provides", "EDDIE"),  # Sell = 1 €$
    (r"reroll|ignore the result|set a gig|set a player's gig|swap a friendly gig|swap a gig|roll in a gig", "themes", "DICE_FIX"),
]

# Case-SENSITIVE: die Tags stehen im Text in GROSSBUCHSTABEN, wenn sie gemeint sind.
CS_RULES: List[Tuple[str, str, str]] = [
    (r"\bARASAKA\b", "tagPayoff", "ARASAKA"),
    (r"\bCORPO\b", "tagPayoff", "CORPO"),
    (r"\bGANGER\b", "tagPayoff", "GANGER"),
    (r"\bMERC\b", "tagPayoff", "MERC"),
    (r"\bCYBERWARE\b", "tagPayoff", "CYBERWARE"),
    (r"\bROCKER\b", "tagPayoff", "ROCKER"),
    (r"\bNETRUNNER\b", "tagPayoff", "NETRUNNER"),
]


def tag_token(tag: str) -> str:
    return tag.upper().replace(" ", "_")


def extract(card: Dict) -> Dict:
    text = card.get("rulesText") or ""
    rels: Dict[str, set] = {
        "provides": set(),
        "payoffFor": set(),
        "themes": set(),
        "tagPayoff": set(),
    }
    evidences: List[str] = []

    # Karte IST Program/Gear → provides
    if card.get("type") == "PROGRAM":
        rels["provides"].add("PROGRAM")
    if card.get("type") == "GEAR":
        rels["provides"].add("GEAR")

    for pat, rel, token in CI_RULES:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            rels[rel].add(token)
            evidences.append(m.group(0))
    for pat, rel, token in CS_RULES:
        m = re.search(pat, text)
        if m:
            rels[rel].add(token)
            evidences.append(m.group(0))

    # Braindance auch aus dem Tag ableiten.
    tags = [tag_token(t) for t in card.get("tags", [])]
    if "BRAINDANCE" in tags:
        rels["themes"].add("BRAINDANCE")

    evidence = max(evidences, key=len) if evidences else ""
    return {
        "provides": sorted(rels["provides"]),
        "payoffFor": sorted(rels["payoffFor"]),
        "themes": sorted(rels["themes"]),
        "tags": sorted(tags),
        "tagPayoff": sorted(rels["tagPayoff"]),
        "evidence": evidence,
    }


def main() -> None:
    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    out = {
        "version": "v1-2026-09-03",
        "generatedBy": "bootstrap_features.py (heuristische Muster-Extraktion)",
        "cards": {c["id"]: extract(c) for c in cards},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Report
    entries = out["cards"].values()
    with_feat = sum(
        1 for e in entries if e["provides"] or e["payoffFor"] or e["themes"] or e["tagPayoff"]
    )
    from collections import Counter
    counter: Counter = Counter()
    for e in entries:
        for rel in ("provides", "payoffFor", "themes", "tagPayoff"):
            for tok in e[rel]:
                counter[f"{rel}:{tok}"] += 1
    print(f"{len(cards)} Karten -> {OUT}")
    print(f"  mit mind. 1 Merkmal (ausser Tags): {with_feat}")
    print("  haeufigste Merkmale:")
    for key, n in counter.most_common(15):
        print(f"    {n:3d}  {key}")


if __name__ == "__main__":
    main()
