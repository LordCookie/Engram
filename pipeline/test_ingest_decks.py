"""Tests für ingest_decks.py (Quellen, Duplikate, kompaktes v2-Format).

Lauf: python pipeline/test_ingest_decks.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_decks import aggregate, deck_signature, source_of  # noqa: E402


def test_source_of() -> None:
    assert source_of({"_origin": "meta"}) == "meta"
    assert source_of({"_origin": "decklists", "source": "netdeck-community"}) == "community"
    assert source_of({"_origin": "decklists"}) == "eigene"


def test_signature_ignores_counts_and_order() -> None:
    a = {"legends": ["l2", "l1"], "cards": {"x": 3, "y": 1}}
    b = {"legends": ["l1", "l2"], "cards": {"y": 2, "x": 1}}
    assert deck_signature(a) == deck_signature(b)


def test_aggregate_v2() -> None:
    decks = [
        {"_origin": "meta", "legends": ["a"], "cards": {"b": 3, "c": 1}},
        {"_origin": "decklists", "source": "netdeck-community", "legends": ["a"], "cards": {"b": 2}},
    ]
    out = aggregate(decks)
    assert out["version"] == "ingest-v2"
    assert out["n"] == 2
    assert out["sources"] == {"community": 1, "meta": 1}
    assert out["cards"] == ["a", "b", "c"]
    assert out["df"] == [2, 2, 1]
    # nur i < j, Zahl der gemeinsamen Decks
    assert [0, 1, 2] in out["pairs"]
    assert [0, 2, 1] in out["pairs"]
    assert all(i < j for i, j, _ in out["pairs"])


def test_aggregate_counts_legend_trios() -> None:
    decks = [
        {"legends": ["l3", "l1", "l2"], "cards": {"x": 3}},
        {"legends": ["l1", "l2", "l3"], "cards": {"y": 3}},
        {"legends": ["l1", "l2", "l4"], "cards": {"x": 1}},
        {"legends": ["l1"], "cards": {"x": 1}},  # kein Trio → zählt nicht
    ]
    out = aggregate(decks)
    idx = {c: i for i, c in enumerate(out["cards"])}
    trios = {tuple(out["cards"][i] for i in t[:3]): t[3] for t in out["trios"]}
    assert trios == {("l1", "l2", "l3"): 2, ("l1", "l2", "l4"): 1}
    assert all(t[0] < t[1] < t[2] for t in out["trios"])
    assert idx["l1"] < idx["l2"]


def test_aggregate_min_co_drops_singletons() -> None:
    decks = [
        {"legends": ["a"], "cards": {"b": 1, "c": 1}},
        {"legends": ["a"], "cards": {"b": 1}},
    ]
    out = aggregate(decks, min_co=2)
    assert out["pairs"] == [[0, 1, 2]]  # a+b zweimal, a+c / b+c nur einmal
    assert out["df"] == [2, 2, 1]  # df bleibt vollständig


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for fn in tests:
        fn()
    print(f"{len(tests)} Tests grün")
