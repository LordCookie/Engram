# Decklisten fürs Ingest (statistische Synergie)

Lege hier Decklisten als JSON ab — `python pipeline/ingest_decks.py` aggregiert sie
(nur **legale** Decks) zu `app/src/data/coplay.json`, das die App als Basis-Korpus für
die **empirische Synergie** (Co-Play) mit deinen eigenen Decks zusammenführt.

Format (eine Datei = ein Deck, oder eine Liste von Decks), **slug-basiert**:

```json
{
  "legends": ["v-corporate-exile", "viktor-vektor-sit-down-and-relax", "jackie-welles-pour-one-out-for-me"],
  "cards": { "kiroshi-optics": 3, "mandibular-upgrade": 3, "delamain-cab": 3 }
}
```

- `legends`: genau 3 Legend-Slugs (unterschiedliche Namen).
- `cards`: die Deckkarten **ohne** Legends, `slug: anzahl`.
- Slugs sind die Karten-IDs aus `app/src/data/cards.json` (z. B. `maxtac-heavy`).

Illegale Decks (falsche RAM-Farbe, > 3 Kopien, Größe außerhalb 40–50 …) werden
automatisch verworfen. Die Dateien hier sind **gitignored** (können eigene/fremde
Deckdaten sein); nur diese README wird versioniert.
