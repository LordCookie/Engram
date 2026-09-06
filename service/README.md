# service

FastAPI + SQLite, read-only Stats-API (Phase 4b). Noch nicht implementiert.

Read-only Endpunkte, aggressiv gecacht:
- `GET /triples/{a}/{b}/{c}` — Kartenstatistiken je Legend-Triple
- `GET /cards/{id}/triples` — mit welchen Triples wird die Karte gespielt

Die Sammlung wird NIE hochgeladen. Aggregate kommen von außen, der Bestand
bleibt im Gerät (PLAN.md § 4, Phase 4).
