# pipeline

Python-Werkzeuge (offline, Build-Schritt — kein Request-Pfad).

- `fetch_cards.py` — Kartendaten holen und ins `Card`-Schema normalisieren
  (Phase 1, Aufgabe 2). Adapter-Muster: eine Schnittstelle, mehrere Quellen.
- `build_hashes.py` — pHash-Index bauen (Phase 3).
- `extract_features.py` — LLM-Feature-Extraktion für Synergie (Phase 4, PLAN.md § 12).
- `ingest_decks.py` — Decklisten-Ingest (Phase 4a).

Noch nicht implementiert. Siehe PLAN.md § 4, § 11, § 12.
