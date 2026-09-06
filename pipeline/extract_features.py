"""LLM-Extraktion der Synergie-Merkmale (PLAN.md § 12, Variante A).

Der reproduzierbare Weg für neue Set-Releases und zur Verfeinerung des v1-
Bootstraps (`bootstrap_features.py`). Erzeugt dieselbe `features.json`.

Kernprinzip (§ 12): das Modell macht NUR Extraktion (Leseverständnis), kein
Urteil. Tokens stammen aus `feature-vocab.json`; `evidence` muss ein echtes
Teilstring-Match im Regeltext sein. Self-Consistency: 3 Läufe, behalte Merkmale
aus ≥ 2 Läufen. Das LLM ist ein BUILD-Schritt, kein Request-Pfad.

Lauf:  ANTHROPIC_API_KEY=... python pipeline/extract_features.py
Nur Standardbibliothek (urllib). Modell: Haiku 4.5 (günstig, für Extraktion ideal).
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List

DATA_DIR = Path(__file__).resolve().parent.parent / "app" / "src" / "data"
CARDS = DATA_DIR / "cards.json"
VOCAB = DATA_DIR / "feature-vocab.json"
OUT = DATA_DIR / "features.json"
GLOSSARY = Path(__file__).resolve().parent / "glossary.md"

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
BATCH = 20
RUNS = 3


def build_system(vocab: Dict[str, Any]) -> str:
    def block(name: str, d: Dict[str, str]) -> str:
        return name + ":\n" + "\n".join(f"  {k}: {v}" for k, v in d.items())

    # Keyword-Glossar als Kontext (PLAN.md § 12): ohne das raet das Modell bei
    # spielspezifischen Begriffen; mit dem Glossar liest es sie korrekt.
    glossary = GLOSSARY.read_text(encoding="utf-8") if GLOSSARY.exists() else ""

    return (
        "Du extrahierst strukturierte Merkmale aus Cyberpunk-TCG-Regeltexten. "
        "Reines Leseverständnis, KEINE Stärkebewertung.\n\n"
        + (f"SPIELREGEL-GLOSSAR (Kontext, keine Ausgabe):\n{glossary}\n\n" if glossary else "")
        "Nutze AUSSCHLIESSLICH diese Tokens:\n"
        + block("STATE (provides/payoffFor)", vocab["state"]) + "\n"
        + block("THEMES", vocab["themes"]) + "\n"
        + block("TAGPAYOFF", vocab["tagPayoff"]) + "\n\n"
        "Regeln:\n"
        "- provides = was die Karte bereitstellt; payoffFor = was sie belohnt.\n"
        "- themes = symmetrische Archetyp-Zugehörigkeit.\n"
        "- tagPayoff = welche Karten-Tags die Karte belohnt.\n"
        "- evidence = WÖRTLICHE Textstelle aus dem rules_text, die die Merkmale belegt.\n"
        "- Nur Tokens aus den Listen. Keine Erfindungen. Leere Listen sind erlaubt.\n"
        "Antworte NUR mit JSON: [{\"cardId\":..,\"provides\":[],\"payoffFor\":[],"
        "\"themes\":[],\"tagPayoff\":[],\"evidence\":\"\"}]."
    )


def call_api(system: str, user: str, key: str) -> str:
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 4096,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, headers={
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return "".join(b.get("text", "") for b in data.get("content", []))


def parse_json(text: str) -> List[Dict[str, Any]]:
    m = re.search(r"\[.*\]", text, re.DOTALL)
    return json.loads(m.group(0)) if m else []


def main() -> None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY fehlt. (Für v1 nutze bootstrap_features.py — kein Key nötig.)")

    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    system = build_system(vocab)
    allowed = {
        "provides": set(vocab["state"]), "payoffFor": set(vocab["state"]),
        "themes": set(vocab["themes"]), "tagPayoff": set(vocab["tagPayoff"]),
    }
    by_id = {c["id"]: c for c in cards}

    # Sammelt je Karte/Relation/Token, in wie vielen Läufen es auftauchte.
    votes: Dict[str, Dict[str, Counter]] = {
        c["id"]: {rel: Counter() for rel in allowed} for c in cards
    }
    for run in range(RUNS):
        for i in range(0, len(cards), BATCH):
            batch = cards[i:i + BATCH]
            user = "Karten:\n" + "\n".join(
                f'- {c["id"]} | tags={c.get("tags", [])} | {c.get("rulesText", "")!r}'
                for c in batch
            )
            try:
                items = parse_json(call_api(system, user, key))
            except Exception as e:  # noqa: BLE001
                print(f"  Lauf {run+1} Batch {i//BATCH}: Fehler {e}")
                continue
            for it in items:
                cid = it.get("cardId")
                if cid not in votes:
                    continue
                for rel in allowed:
                    for tok in it.get(rel, []) or []:
                        if tok in allowed[rel]:
                            votes[cid][rel][tok] += 1
            time.sleep(0.5)
        print(f"  Lauf {run+1}/{RUNS} fertig.")

    # Self-Consistency: Token behalten, wenn in >= 2 Läufen; evidence heuristisch.
    out_cards: Dict[str, Any] = {}
    for cid, rels in votes.items():
        card = by_id[cid]
        kept = {rel: sorted(t for t, n in rels[rel].items() if n >= 2) for rel in allowed}
        tags = sorted(t.upper().replace(" ", "_") for t in card.get("tags", []))
        out_cards[cid] = {
            "provides": kept["provides"], "payoffFor": kept["payoffFor"],
            "themes": kept["themes"], "tags": tags, "tagPayoff": kept["tagPayoff"],
            "evidence": "",  # optional: separat pro Merkmal einholbar
        }

    OUT.write_text(json.dumps({
        "version": "llm-" + time.strftime("%Y-%m-%d"),
        "generatedBy": f"extract_features.py ({MODEL}, {RUNS}x self-consistency)",
        "cards": out_cards,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Geschrieben: {OUT}")


if __name__ == "__main__":
    main()
