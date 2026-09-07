# Entscheidungslog

Append-only, mit Datum. Verhindert, dass in späten Sessions Dinge neu
ausdiskutiert werden, die früh geklärt waren (PLAN.md § 9).

---

## 2026-09-03 — Projekt-Fundament (Phase 1, Aufgabe 1)

**Entscheidung:** Gerüst manuell aufgesetzt statt über `npm create vite`.

**Aufbau:** Der Testrechner hat Node 20.9.0. Die aktuelle `create-vite` verlangt
Node ≥ 20.12 (`node:util` → `styleText`) und bricht ab. Statt Node global zu
ändern, wurde das Gerüst mit fest gepinnten, zu Node 20.9 kompatiblen Versionen
von Hand angelegt: Vite 5, React 18, TypeScript 5.6 (strict), Tailwind 3,
Vitest 2, Dexie 4, Zustand 5, vite-plugin-pwa 0.20.

**Ergebnis:** `app/` läuft, Repo-Struktur nach PLAN.md § 4 angelegt
(`rules/`, `db/`, `domain/`, `scan/`, `ui/`, `data/`). Datenmodell aus § 2 in
`app/src/domain/types.ts`. Ruleset aus § 1 in `app/src/rules/ruleset.v1.json`
plus typisiertem Loader.

---

## 2026-09-03 — Spike 0.4: Synthetisches Fixture (erledigt)

**Entscheidung:** Fixture `app/tests/fixtures/synthetic-set.json` mit 22 erfundenen
Karten angelegt, alle vier Farben, RAM 1–6, sieben Legends.

**Aufbau:** Bewusste Grenzfälle eingebaut — eine Legend ohne RAM (`leg-rune`,
analog Rebecca — Having a Moment), ein Braindance ohne Cost/Power (`blu-dream`),
Karten deren RAM den maximal möglichen Farb-Cap dieses Sets übersteigt
(`grn-titan` 5, `blu-tsunami` 4, `ylw-vault` 6) sowie eine Karte genau am Cap
(`grn-oak` 4). Invarianten sind in `app/tests/synthetic-set.test.ts` verankert.

**Ergebnis:** Validator (Phase 2) und Legend-Solver sind damit vollständig
entwickelbar und testbar, bevor eine echte Karte vorliegt. Spike 0.2
(Datenquelle) ist damit vom kritischen Pfad genommen.

---

## 2026-09-03 — Offene Spikes, die Nutzeraktion brauchen

Diese Spikes kann der Agent nicht selbst durchführen; sie brauchen dich:

- **0.1 iOS-Kamera im PWA-Standalone** — Test auf echtem iPhone nötig
  (PWA zum Homescreen, `getUserMedia` prüfen). Wichtigster Spike des Projekts.
- **0.2 Kartendaten-Quelle** — GELÖST am 2026-09-03, siehe eigener Eintrag unten.
- **0.3 Kartenlayout** — physische Karte prüfen: Barcode/QR vorhanden? Pixelhöhe
  der Sammlernummer bei 720p? Entscheidet, ob der OCR-Zweig gebaut wird.

---

## 2026-09-03 — Deck-Validator (Phase 2, Aufgabe 1)

**Entscheidung:** Validator als reine Funktion `validate(deck, ruleset, cardIndex)
→ { ok, violations[] }` in `app/src/rules/validate.ts`, framework-frei.

**Aufbau:** Alle vier Regeln aus § 1 als eigene Checks mit eigenem Fehlercode und
deutscher Meldung. Zusätzliche defensive Checks: Legend nicht gefunden / falscher
Typ, Legend fälschlich im Deck-Teil, unbekannte Karte, ungültige Anzahl.
Mehrfach gelistete cardIds werden aggregiert, damit 2+2 als 4 Kopien erkannt wird.
RAM-Caps via `computeRamCaps` (exportiert, damit der Deckeditor in Aufgabe 2 sie
teilt). 24 Unit-Tests mit programmatischen Hilfskarten (voller Kontrolle über jeden
Grenzfall), inkl. genau 40 / genau 50 / 39 / 51, vier Kopien, Namensdubletten,
Karte einer Farbe ohne Legend dieser Farbe, RAM genau am Cap.

**Ergebnis:** `npm run typecheck` sauber, `npm test` 30/30 grün. Die Fehlercodes
sind maschinenlesbar (für Editor-Markierungen), die Meldungen menschenlesbar.

**Offen (Aufgabe 2+):** Deckeditor mit Live-Anzeige, Sammlungsmodus, Legend-Solver.

---

## 2026-09-03 — Legend-Solver (Phase 2, Aufgabe 4)

**Entscheidung:** Solver als reine Funktion `solveLegends(owned, ruleset,
cardIndex, options)` in `app/src/domain/solver.ts`, framework-frei. Brute Force
über alle Legend-Triples (C(n,3)).

**Seams / Entscheidungen:**
- **Eingabe auf Karten-Ebene** (`OwnedCounts = Map<cardId, qty>`), nicht auf
  Printing-Ebene. Das entkoppelt den Solver von der noch nicht existierenden
  DB-/Printing-Schicht; die Aggregation Printing→Karte gehört später in die
  Sammlungslogik.
- **Score hinter einem Interface** (`ScoreFn`, PLAN.md § 5). Default V1:
  Summe der deck-nutzbaren Kopien = Σ min(besessen, maxCopiesPerCard). Bewusst
  gekappt bei 3 — ein 4. Exemplar bringt in einem legalen Deck nichts. Später
  ersetzbar durch Meta-Score aus Phase 4 (§ 12, C).
- **targetColors-Semantik:** ist eine Zielfarbe gesetzt, werden nur Triples
  gewertet, die für JEDE Zielfarbe RAM > 0 liefern, und der spielbare Pool wird
  auf diese Farben eingeschränkt. Ohne Zielfarbe: alle Farben, kein Filter.
- **Determinismus:** stabile Sortierung (Score desc, dann distinctPlayable desc,
  dann Legend-IDs) — reproduzierbare Ausgabe für Tests und UI.

**Ergebnis:** `npm test` 47/47 grün. 17 Solver-Tests inkl. Fixture-Durchlauf
(35 Triples aus 7 Legends, bestes mit 7 spielbaren Karten). Live-Demo in der
Platzhalter-App zeigt die Top-3-Triples.

**Offen:** Swap-Analyse (Aufgabe 5), Deckeditor + Sammlungsmodus (Aufgabe 2/3).

---

## 2026-09-03 — Persistenz, Schnellerfassung, Export/Import (Phase 1, Aufgaben 3/5/7)

**Entscheidung:** Der Kreis „erfassen → Sammlung → Solver" ist geschlossen und
läuft live. Neue Module:
- `app/src/db/db.ts` — Dexie-Schema v1 (Tabellen collection/decks/meta) plus
  transaktionale Ops (`addToCollection`, `replaceCollection`, `bulkAdd`).
- `app/src/domain/search.ts` — reine Kartensuche (Name/Subtitle, Filter, Ranking).
- `app/src/domain/collection.ts` — Aggregation Printing→Karte, Fortschritt je Farbe.
- `app/src/domain/collectionIo.ts` — JSON-Export/Import, Round-Trip byte-identisch.
- `app/src/data/catalog.ts` — zentrale Katalogquelle (fällt aufs Fixture zurück,
  bis `cards.json` echte Daten hat) plus Platzhalter-Printings (id === cardId).
- `app/src/ui/*` — QuickAdd (Schnellerfassung), SolverPanel (live), CollectionView,
  CollectionIoPanel.

**Bestandsmodell (bewusst):** Sammlung wird auf **Printing-Ebene** gespeichert
(§ 2), aber solange keine echten Printing-UUIDs vorliegen, ist pro Karte ein
STANDARD-Platzhalter-Printing mit `id === cardId` im Einsatz. Der Solver bekommt
über `collectionToOwnedCounts` eine Karten-Ebene-Sicht. Wenn echte Printings
kommen, ist das eine Dexie-Migration, kein Umbau.

**Reaktivität:** Lesen über `dexie-react-hooks` (`useLiveQuery`), Schreiben direkt
über die Ops. Kein Zustand-Store nötig für Sammlungsdaten.

**Ergebnis:** `npm test` 65/65 grün (u. a. Dexie-Tests via `fake-indexeddb`,
Export/Import-Round-Trip, Suche, Aggregation). Loop im laufenden Browser
verifiziert: Erfassen aktualisiert Sammlung und Solver sofort.

**Bekannte Einschränkung der Test-Automation (kein App-Bug):** die eingebettete
Browser-Automation stellt Tastenevents (Enter/Backspace/Strg+A) nicht an das
Eingabefeld zu; nur `type` wirkt. Der Add-Pfad wurde daher per Klick verifiziert
(ruft dieselbe `addByIndex`-Logik). Die Keyboard-Handler (Enter=+1, Strg+Z=Undo)
sind Standard-React und im echten Browser wirksam.

**Offen:** Starter-Quickadd (Aufgabe 7, `bulkAdd` steht bereit), Deck-Textformat
(Aufgabe 8), Deckeditor + Sammlungsmodus (Aufgabe 2/3), Swap-Analyse (Aufgabe 5).

---

## 2026-09-03 — Spike 0.2 GELÖST + Kartendaten-Import (Phase 1, Aufgabe 2)

**Testaufbau:** `cyberpunktcg.com/cards` im Browser geladen, Netzwerk-Ressourcen
über die Performance-API ausgewertet.

**Ergebnis:** Die Filtermaske spricht eine **NetDeck-API** an (Cross-Origin,
öffentlich, keine Auth):

    https://api.netdeck.gg/api/cards/cyberpunk?limit=100&offset=0
    (weitere: .../filters, .../cyberpunk/content/query)

Die **Listenantwort liefert bereits ALLES** — keine Detailseiten nötig. Felder:
`slug`, `name`, `subname`, `rules_text`, `printing_id` (UUID), `set{code,name}`,
`rarity`, `image_url` (signiert, läuft ab) + `source_image_url` (stabil), `color`,
`card_type`, `classifications`, `keywords`, `cost`, `power`, `ram`, `print_number`
(Sammlernummer), `artist`, `legality`.

**Konkrete Befunde (kalibrieren das Projekt):**
- **151 Karten**, Seitenlimit **max. 100** → mit `limit=100` paginieren.
- Serverseitig erreichbar (WebFetch ohne Browser-Origin bekam die Daten) → das
  reine Python-Skript (urllib) funktioniert.
- Alle **4 Farben** vorhanden (Red/Green/Blue/Yellow).
- **Kein `Braindance`-Kartentyp** — die Typen sind nur Legend/Unit/Gear/Program.
  „Braindance" ist eine `classification` (Tag), kein `card_type`. Der Plan (§ 2)
  listete BRAINDANCE aus Sekundärquellen fälschlich als Typ. `CardType` bleibt
  vorerst permissiv; das Fixture nutzt BRAINDANCE weiter als reine Testfarbe.
- Nur **Rebecca — Having a Moment** ohne RAM; 19 Karten ohne Cost. Deckt sich
  mit dem Plan (nullable-Felder sind Pflicht).
- Die 151 umfassen Hauptset, Promos (`PRM01`) und **beide Starter-Decks**
  (`theheistretailstarterdeck`, `embracingpowerretailstarterdeck`) — direkte
  Vorlage für den Starter-Quickadd (Aufgabe 7).
- Keywords-Feld ist leer; Spiel-Keywords stecken im `rules_text` (`{Call}`,
  `{Go Solo}` …) — genau der Korpus für die Synergie-Extraktion (§ 12).

**Umsetzung:** `pipeline/fetch_cards.py` (stdlib-only, Adapter-Muster mit
`CardSource`/`NetDeckSource`, Rate-Limit, höflicher User-Agent OHNE persönliche
E-Mail). Normalisiert nach Card-Schema, schreibt `app/src/data/cards.json`
(151 Karten) und `app/src/data/printings.json`. Snapshot-Test
`pipeline/test_fetch_cards.py` (3 Tests grün) schützt vor Schema-Drift.
Beide Ausgabedateien sind ge-gitignored (§ 11: Kartendaten nicht weiterverteilen).

**Bilder (PLAN.md § 8):** NICHT heruntergeladen/verteilt. `printings.json` hält
nur Links: `imageUrl` (stabile source-URL) und `pageUrl` (offizielle DB-Seite).
Die App zeigt noch keine Bilder; die signierten `image_url` laufen ohnehin ab.

**Bekannte Lücke:** Die Liste liefert `is_eddiable` (bool), aber keinen Eddies-
Zahlenwert → `Card.eddies` wird vorerst nicht befüllt.

**Wirkung:** Die App nutzt ab jetzt automatisch die echten 151 Karten
(`catalog.ts` fällt nur ohne `cards.json` aufs Fixture zurück). Suche/Solver/
Sammlung laufen im Browser auf echten Cyberpunk-Karten (verifiziert: „adam" →
Adam Smasher, beide Druckvarianten). Zwei Tests (search/collection) wurden vom
Katalog aufs Fixture umgehängt, damit sie deterministisch bleiben.

---

## 2026-09-03 — Synergie-System (PLAN.md § 12) + Nummernsuche

**Entscheidung:** Vorhergesagte Synergie (Variante A) mit sauberer Trennung
Extraktion vs. Urteil.

**Vokabular** (`app/src/data/feature-vocab.json`, Quelle): kontrollierte Tokens in
drei Räumen — STATE (provides↔payoffFor), THEMES (symmetrisch), TAGPAYOFF (gegen
classifications). Gegründet auf den echten Regeltexten.

**Extraktion — bewusste Abweichung vom Plan:** Statt die 151 Einträge von Hand zu
tippen (fehleranfällig), ist die Erst-Extraktion als transparente, kuratierte
Muster-Regeln in `pipeline/bootstrap_features.py` kodiert (= mein Leseverständnis,
nachvollziehbar und reproduzierbar). Erzeugt `features.json` mit garantiert
gültigem Beleg (gematchter Teilstring). 123/151 Karten bekommen mind. ein
Mechanik-Merkmal. `pipeline/extract_features.py` ist der LLM-Weg (Anthropic,
Haiku 4.5, 3× Self-Consistency) für spätere Sets/Verfeinerung — erzeugt dieselbe
Datei. `features.json` ist gitignored (Belege = CDPR-IP, § 8).

**Scoring** (`app/src/domain/synergy.ts`, rein, getestet): Kante bei
provides↔payoffFor, themes↔themes, tags↔tagPayoff; Gewicht = Seltenheit des
Merkmals (log(1+N/freq)). **RAM-Machbarkeitsfilter** ohne C(n,3)-Enumeration:
`minSlotsForRam` je Farbe, Paar machbar wenn Slotsumme ≤ 3; bei einer Legend im
Paar entfällt der Filter. `topSynergies` liefert Partner samt belegender Tokens.

**UI** (`app/src/ui/SynergyPanel.tsx`, Tab „Synergie"): Karten-Picker → Karte +
Regeltext + Top-Partner mit Begründungs-Chips. Klar als „Vorhergesagte Synergie —
keine Statistik" beschriftet (§ 12 Ehrlichkeitsgebot). Verifiziert: Hanako
(Wert-Paar) → alle GIG_PARITY-Karten.

**Nummernsuche:** `searchCards` matcht zusätzlich `collectorNumber` (exakt/Präfix,
führende Nullen tolerant); eigener Rang, Namenstreffer bleiben vorn.

**Ergebnis:** `npm test` 81/81 grün (13 Synergie- + 3 Nummern-Tests, inkl.
Validierung der echten `features.json`). Typecheck sauber, Build ok.

**Bewusst offen:** Statistische Synergie aus Decklisten (§ 12 C, Phase 4a);
Synergie in den Solver-Score einhängen (ScoreFn steht bereit); pro-Merkmal-Belege;
Bilder in der Ansicht.

---

## 2026-09-04 — Starter-Quickadd (Phase 1, Aufgabe 7)

**Datenquelle (Spike):** Die offiziellen Print-&-Play-PDFs (`/docs/print-and-play-*.pdf`,
je ~11 MB Kartenbögen) sind als Textliste ungeeignet. Der NetDeck-Deck-Endpunkt
ist auth-gated. **Bester Weg war der Community-Simulator** (§ 11.3, genau wie im
Plan vermutet): `cyberpunk-tcg-sim.online` hält in `assets/localDecks-*.js` die
Preset-Decks, die laut eigenem Kommentar „die offiziellen 40-Karten-Retail-
Produktlisten" spiegeln. Beide Starter vollständig extrahiert (IDs = unsere Slugs
mit `_`→`-`), alle 40 IDs gegen `cards.json` verifiziert (0 fehlend).

**Wichtig — Zählung:** Die `card_ids` sind bereits **40 Deckkarten** (ohne Legends,
so zählt § 1). Physisch also **40 Deck + 3 Legends = 43 Karten** je Starter.

**Umsetzung:**
- `app/src/data/starters.json` (getrackt — reine Deckliste, kein IP-Text/Bild):
  The Heist (Mercs) und Embracing Power (Arasaka), je legendIds + cards{id:count}.
- `app/src/domain/starters.ts` — Loader + `starterEntries`/`starterSize` (rein).
- `app/src/db/db.ts` — `addCounts(items, source)` (mit Stückzahlen); `bulkAdd`
  ruft es jetzt mit count 1.
- `app/src/ui/StarterQuickadd.tsx` — Buttons im Tab „Erfassen", ein Klick →
  `addCounts`. Quelle: `source: "starter:<id>"`.

**Ergebnis:** `npm test` 87/87 grün (5 Starter-Tests validieren die Listen gegen
den Katalog: 40 Deckkarten + 3 Legends, Legends sind Legends). Im Browser
verifiziert: „+ The Heist" → 43 Karten eingetragen, Solver erkennt das
Heist-Triple (Jackie · V · Viktor).

---

## 2026-09-04 — Deckeditor + Sammlungsmodus (Phase 2, Aufgabe 2/3)

**Umsetzung:**
- Validator-Signatur auf `ValidatableDeck` (readonly legendIds/cards) gelockert,
  damit auch ein Deck-Entwurf mit < 3 Legends geprüft werden kann. `Deck` (§ 2)
  bleibt strukturell zuweisbar; bestehende Tests unverändert grün.
- `app/src/domain/deckDraft.ts` — reine, immutable Mutatoren (addLegend max 3 &
  unique, removeLegend, setCard/incCard mit stabiler Reihenfolge).
- `app/src/domain/deckStats.ts` — Live-Statistik (Deckgröße, RAM-Cap + Ausnutzung
  je Farbe, Cost-Kurve, Typverteilung), nutzt `computeRamCaps`.
- `app/src/db/db.ts` — `getWorkingDeck`/`saveWorkingDeck`; das Arbeitsdeck liegt
  in der `decks`-Tabelle unter fester ID `working` und überlebt Reloads.
- `app/src/ui/DeckEditor.tsx` (Tab „Deck"): Suche (Name/Nummer) → Legends bzw.
  Deckkarten; Legend-Slots, Live-Statistik, Live-Validierung, Deckliste mit −/+.
  **Sammlungsmodus** („nur was ich besitze"): filtert die Suche auf den Bestand
  und zeigt je Karte „im Deck / im Besitz"; fehlende werden rot markiert, nicht
  versteckt (§ 5, Aufgabe 3). Owned-Counts live über Dexie.

**Ergebnis:** `npm test` 96/96 grün (5 deckDraft- + 4 deckStats-Tests). Typecheck
sauber, Build ok. Im Browser verifiziert: Embracing-Power-Triple → GREEN Cap 4,
RED Cap 2, Cost-Kurve, Typverteilung, Live-Validierung; Sammlungsmodus markiert
nicht besessene Karten als „fehlt".

**Damit ist Phase 2 im Kern komplett** (Validator, Solver, Deckeditor,
Sammlungsmodus). Offen: Swap-Analyse (Aufgabe 5); Mehr-Deck-Verwaltung
(Speichern/Laden benannter Decks) über das eine Arbeitsdeck hinaus.

---

## 2026-09-04 — Swap-Analyse (Phase 2, Aufgabe 5) — Phase 2 vollständig

`app/src/domain/swap.ts` (rein, getestet): `swapAnalysis(currentLegendIds, owned,
ruleset, cardIndex)` — für jedes vollständige Triple jeden Ersatz einer Legend
durch eine besessene Legend bewerten: welche Bestandskarten werden freigeschaltet
(unlocked) vs. verloren (lost), Netto. Ohne C(n,3), reuse `computeRamCaps`.
Im Deckeditor als Panel (Top-5). 5 Tests. `npm test` 101/101 grün. Browser
verifiziert (Embracing→Heist-Legends: Goro→Viktor +9 frei).

---

## 2026-09-04 — Negativ-Probe gegen echte Decklisten (exburst.dev) — ZWEI Befunde

Quelle: `auth.exburst.dev` (Supabase, öffentlicher Anon-Key), `decklist_content`
+ `archetype` (= die 3 Legends als Set-Sammlernummern). Mapping über
collectorNumber. Analyse-Skripte (Wegwerf) im Scratchpad; unser Synergie-/
RAM-Modell in Python nachgebildet (identische Formeln).

> **KORRIGIERT am 2026-09-04 (siehe Eintrag unten):** Befund 1 war FALSCH. Das
> offizielle Rulebook bestätigt die Per-Farbe-Regel. Die Online-Decks waren
> unvalidierte Community-Decks.

**Befund 1 — RAM-Regel ist vermutlich FALSCH (wichtig, betrifft Validator/Solver):**
An 24 sauber gemappten Decks (nur MS01-Legends, 405 distinct Deckkarten):
- Regel A = unser Modell (`ramScope: perColor`, Cap = Summe der Legend-RAM JE
  FARBE): **2,5 % der real gespielten Karten illegal**.
- Regel B (Cap = Summe ALLER 3 Legend-RAM, farbunabhängig): **0,0 % illegal**.
Echte Decks spielen Karten einer Farbe OHNE Legend dieser Farbe (Per-Farbe-Cap 0,
z. B. „6th Street Recruits" RED). Unter Per-Farbe unmöglich, unter Gesamt-Budget
trivial legal. → Die Per-Farbe-Regel (aus Sekundärquellen, § 1) ist zu streng.
**To-do:** gegen `cyberpunktcg.com/comprehensive-rules` verifizieren; falls
bestätigt, `ruleset.v2.json` mit `ramScope: "total"` anlegen (alte behalten,
Decks referenzieren Version) und `computeRamCaps`/Validator/Solver anpassen.
Das Config-Design (§ 1) ist genau dafür gebaut.

**Befund 2 — Synergie-System: moderates, aber echtes Signal.** 48 Decks:
Paar-Synergie intern vs. zufällig **Median 1,5× / Mittel 1,6×**; Legend→Deckkarte
**Median 1,6× / Mittel 1,7×**. Thematische Decks (Braindance, Gear, Programs,
Gig-Parity) 2–4×; reine Aggro-/Tempo-Decks ≈ 1× (unser textbasiertes Modell sieht
Nicht-Synergie-Strategien nicht). Deckt sich exakt mit dem Ehrlichkeitsgebot
(§ 12): Vorhersage aus Kartentext, kein Meta-Modell. Als v1 brauchbar; verbessern
über echte Inklusionsraten (§ 12 C, Phase 4a) und feinere Merkmale.

---

## 2026-09-04 — RAM-Regel & Kartendatenbank gegen offizielles Rulebook verifiziert (KORREKTUR zu Befund 1)

Quelle: offizieller „Printable Gameplay Guide" (PDF, S. 10 „DECK BUILDING & RAM";
Text lag als Grafik vor, per pypdf-Bildextraktion + Pillow-Konvertierung gelesen).

**Wörtliche Regel:** „Each Legend's RAM limit only counts towards their own color."
Beispiel im Rulebook: Goro (2 Grün) + Saburo (2 Grün) + Yorinobu (2 Rot) ⇒
„Green cards with up to 4 RAM and Red cards with up to 2 RAM."

**Ergebnis: Unsere Per-Farbe-Regel (`ramScope: "perColor"`) ist KORREKT.** Auch
die anderen drei Regeln stimmen wörtlich (genau 3 Legends mit unterschiedlichen
Namen; 40–50 Karten ohne Legends; max. 3 Kopien). Der aus Sekundärquellen
gebaute Validator (§ 1) war die ganze Zeit richtig. **Kein Code-Change nötig.**

**Kartendatenbank verifiziert:** Beide offiziellen Starter-Decks (garantiert
legal) sind unter der Per-Farbe-Regel zu 100 % legal —
- The Heist: Caps BLUE 4, YELLOW 2 → alle 17 Karten legal.
- Embracing Power: Caps GREEN 4, RED 2 (== Rulebook-Beispiel) → alle 17 legal.
Also **keine falschen Farb-/RAM-Werte** in `cards.json` für diese Karten.

**Auflösung von Befund 1:** Die 2,5 % „illegalen" Karten der Online-Probe waren
unvalidierte Community-Decks (exburst ist ein Builder mit WIP-/Jux-/illegalen
Listen wie „Test", „block.deck", „AWP"). Fazit: Bei Regel-Fragen ist das
Rulebook + garantiert-legale Produkte (Starter) die Wahrheit, nicht
nutzergenerierte Decklisten.

---

## 2026-09-04 — Synergie mit offiziellem Keyword-Glossar geschärft (PLAN.md § 12)

Das Glossar aus dem Gameplay Guide (S. 6, 11–12) transkribiert nach
`pipeline/glossary.md` (CDPR-IP, gitignored). §-12-Intent: das Glossar gehört in
die Extraktion, sonst rät das Modell bei spielspezifischen Begriffen.

**Erkenntnisse, die dem Extraktor fehlten:** *Sell* (Karte verkaufen → 1 €$ =
Eddie-Erzeugung) und *Fixer/Würfel-Manipulation* (rollen, rerollen, Wert
setzen/tauschen). Umgesetzt:
- `feature-vocab.json`: neues Theme `DICE_FIX`; EDDIE deckt jetzt auch Sell ab.
- `bootstrap_features.py`: Regeln `sell → provides EDDIE` und `reroll/set/swap →
  themes DICE_FIX`.
- `features.json` neu erzeugt (126 statt 123 Karten mit Mechanik-Merkmalen).
- `extract_features.py` (LLM-Weg): liest `glossary.md` und legt es als
  System-Kontext in den Prompt (§ 12 buchstäblich umgesetzt).

**Wirkung (Negativ-Probe gegen echte Decks neu gemessen):** Synergie-Lift intern
vs. zufällig **Median 1,5 → 1,8×, Mittel 1,6 → 1,8×**. Das System trifft die reale
Co-Play messbar besser.

**Nebenbei (Sekundärquellen-Korrektur):** Rulebook nennt die Siegbedingung
**7+ Gigs** (PLAN.md § 1 sagte „6"). Nicht regelkritisch für uns, aber notiert.

`npm test` 101/101 grün, Build ok.

---

## 2026-09-04 — Synergie in den Solver-Score eingehängt (PLAN.md § 12 C)

Der im Plan vorgesehene Andockpunkt (austauschbare `ScoreFn`, § 5 Aufgabe 4)
wird jetzt genutzt. `makeSynergyScore(db, synergyWeight=1)` in `synergy.ts`
liefert eine `ScoreFn`:

    Score(Triple) = Σ_Karte  nutzbar × (1 + w × Synergie(Karte ↔ die 3 Legends))

Bevorzugt also Triples, deren Legends mit dem freigeschalteten Pool synergieren,
statt nur nach roher Kartenmenge. Mit Gewicht 0 identisch zum `defaultScore`
(die drei Score-Varianten A/B/C aus § 12 bleiben austauschbar). Legend↔Karte
statt volle Paar-Matrix gewählt — O(Triples × Pool × 3), schnell und dem
Nutzer-Fokus „die 3 Legends legen viel fest" entsprechend.

**UI:** `SolverPanel` bekommt einen **Regler „Menge ↔ Synergie"** (Gewicht 0–2),
die Bewertung wird live neu gerechnet. Verifiziert: dasselbe Triple Score 40
(Gewicht 0) → 43 (0.5) → 52 (2.0); bei ≥ 4 besessenen Legends sortiert das
Gewicht die Vorschläge um.

2 neue Tests (`makeSynergyScore`). `npm test` 103/103 grün, Build ok.

---

## 2026-09-04 — Mehr-Deck-Verwaltung: benannte Decks (Phase 2, Aufgabe 2)

Vom einen „Arbeitsdeck" (feste ID `working`) auf **beliebig viele benannte Decks**
umgestellt.
- `deckDraft.ts`: `newDeckId()` (crypto.randomUUID + Fallback); `emptyDraft` nimmt
  jetzt ID + Name. `WORKING_DECK_ID` entfernt.
- `db.ts`: `listDecks`, `getDeck`, `saveDeck`, `createDeck`, `deleteDeck`,
  `getCurrentDeckId`/`setCurrentDeckId`, `ensureCurrentDeck`. Aktueller Deck-Zeiger
  im `meta`-Store (`currentDeckId`). Löschen des letzten Decks legt automatisch
  ein neues an. **Migration:** ein evtl. vorhandenes altes `working`-Deck wird
  inhaltserhaltend als benanntes Deck übernommen.
- `DeckEditor.tsx`: Deck-Leiste (Auswahl-Dropdown, Namensfeld mit Umbenennen-on-Blur,
  + Neu, Duplizieren, Löschen, Leeren). Editiert stets das aktuelle Deck; alles
  live über Dexie.

6 neue DB-Tests. `npm test` 109/109 grün, Build ok. Browser verifiziert: zwei
benannte Decks nebeneinander, Umbenennen persistiert, altes Deck migriert.

**Offen (bewusst):** Deck-Textformat-Export/Import (§ 5, Aufgabe 8) — separater
kleiner Schritt.

---

## 2026-09-04 — Deck-Textformat Export/Import (Phase 2, Aufgabe 8)

MTG-artiges `.txt`-Format für Interoperabilität mit anderen Tools: eine Zeile je
Karte, `N Kartenname` (Subtitle via `Name: Subtitle`).

- `app/src/domain/deckText.ts` (rein, getestet): `deckToText` (Export mit
  `//`-Kommentaren + Legend-/Deck-Sektion) und `parseDeckText`. Parser robust:
  akzeptiert `N`, `Nx`, `N x`; Trenner `:` / `—` / `-` / `( )` / Leerzeichen;
  blanker Name nur wenn eindeutig (viele Karten teilen sich Namen).
  **Legends werden am Kartentyp erkannt** — keine Sektions-Pflicht, generische
  MTG-Listen funktionieren. Nicht erkennbare Zeilen landen in `unresolved`.
- `app/src/ui/DeckTextPanel.tsx`: Live-Export-Textarea + „.txt herunterladen";
  Import-Textarea + „.txt-Datei laden" → legt ein neues Deck an (nicht-destruktiv),
  meldet erkannte/nicht erkannte Zeilen. Eingehängt unten im Deckeditor.

5 neue Tests (Round-Trip, MTG-Varianten, Auto-Legend, unresolved, Deckname).
`npm test` 114/114 grün, Build ok. Browser verifiziert: MTG-Heist-Liste importiert →
3 Legends korrekt erkannt, Karten aufgelöst, unbekannte Zeile ignoriert.

**Damit sind alle Deckbau-Aufgaben aus § 5 (2, 3, 8) erledigt.**

---

## 2026-09-04 — Kartenbilder in den Ansichten (§ 6/§ 8)

**Problem:** Die in `printings.json` gespeicherte `source_image_url` (unsigniert)
lädt NICHT — CloudFront verlangt eine Signatur, und die signierten URLs laufen ab.
Getestet: unsigniert → `<img>`-onerror; frisch signiert → lädt (733×1024).

**Lösung:** Zur Laufzeit frische signierte URLs von der NetDeck-API holen
(`app/src/data/cardImages.ts`, `loadCardImages` + Hook `useCardImages`). CORS von
localhost ist erlaubt (getestet). In-Memory-Cache pro Session (kein LocalStorage,
§ 3). Bilder werden via `<img>` direkt vom offiziellen CDN gezeigt — **nichts
heruntergeladen/gehostet** (§ 8: nur verlinken). Keine Nutzerdaten gesendet
(generischer GET). Offline/fehlend → farbiger Platzhalter mit Kartennamen.

- `app/src/ui/CardImage.tsx` — Bild oder Platzhalter, Größe via `className`.
- `app/src/data/printingLinks.ts` — cardId → offizielle DB-Seite (aus
  `printings.json`) für „auf cyberpunktcg.com ansehen".
- Eingebaut in: **Synergie** (großes Render + Partner-Thumbnails + Link),
  **Deckeditor** (Trefferliste + Deckliste), **Sammlung** (Bestandsliste).

`npm test` 114/114 grün (Bild-Service ist Laufzeit/Netzwerk, nicht unit-getestet),
Typecheck/Build sauber. Browser verifiziert: Hanako-Render + Partner-Thumbs laden.

---

## 2026-09-04 — Synergie-Merkmale per kuratiertem LLM-Lesedurchgang (§ 12)

**Entscheidung:** Die `features.json` stammt ab jetzt aus einem sorgfältigen
Lesedurchgang des Agents (Opus) durch **alle 151 Regeltexte** statt aus der
heuristischen Muster-Extraktion (`bootstrap_features.py`). Das ist der im Plan
vorgesehene „ich erzeuge sie selbst"-Weg — **kein API-Key nötig**, weil das LLM
schon im Chat sitzt. `extract_features.py` (API/Haiku) bleibt der reproduzierbare
Weg für künftige Set-Releases; `bootstrap_features.py` bleibt der Fallback ohne
Quelle.

**Warum besser als die Heuristik:** Das Leseverständnis trifft Payoffs, die reine
Regex verpasst, und vermeidet Fehlgriffe. Beispiele:
- „even number" bei *Street Cred* wird korrekt als `STREET_CRED` gelesen, **nicht**
  als `GIG_PARITY` (Gig-Werte) — die Regex hatte beides vermischt.
- Defensive Anti-Steal-Karten (Chrome Fang, Take Control, Westbrook, Alt) werden
  **nicht** als `GIG_STEAL`-Payoff markiert — sie synergieren nicht mit der
  eigenen Steal-Engine. `provides FIGHT` (Power-Buffs) neu als Kante gegen
  `payoffFor FIGHT` (Kampf-Trigger).
- Deckung: **135/151** Karten mit mind. 1 Merkmal (Tags ausgenommen).

**Architektur (Trennung Extraktion vs. Urteil, § 12):**
- `pipeline/features_curated.json` (**gitignored**, CDPR-IP: enthält kurze
  Regeltext-Belege) = die reine Lesefassung: je Karte `provides/payoffFor/themes/
  tagPayoff/evidence`.
- `pipeline/build_features.py` (committed, **ohne** Kartentext) fügt die Tags aus
  `cards.json` hinzu und **validiert streng**: jede Katalogkarte genau einmal,
  nur Tokens aus `feature-vocab.json`, jede `evidence` echter Teilstring des
  `rules_text` — bricht sonst mit Meldung ab.

Qualitäts-Stichprobe (gleiche Gewichtung wie `synergy.ts`): Hanako → lauter
DICE_FIX/GIG_PARITY-Partner; Judy → V + Braindance-Programme; Saburo → Arasaka-
Payoffs + Fight; Panam → Dying Night (Gear+Eddie). Alle plausibel.

Ehrlichkeitsgebot bleibt gültig: weiterhin **Vorhersage aus Kartentext, keine
Statistik** — das UI-Label in `SynergyPanel` stimmt unverändert.

`npm test` 114/114 grün (inkl. der vier `features.json`-Validierungstests),
Typecheck/Build sauber.

---

## 2026-09-04 — Statistische Synergie aus Decklisten (§ 12 C, Phase 4a)

**Zwei getrennte Synergie-Begriffe, bewusst nebeneinander:**
- *Vorhergesagt* (`synergy.ts`, aus Kartentext) — funktioniert ab Tag eins.
- *Empirisch* (`coplay.ts`, aus echten Decks) — „was wird tatsächlich zusammen
  gespielt". Reine Beobachtung, keine Vorhersage.

**Quellen-Entscheidung (Nutzer):** **First-Party, wächst mit.** Das Korpus sind
die 2 offiziellen Starter PLUS die eigenen in Dexie gespeicherten/importierten
Decks — **kein Netzwerk, kein Scraping**, voll local-first. Hintergrund: es gibt
keine offene Bulk-Deck-API (NetDeck `/api/cyberpunk/decks` = 401/Login, exburst =
Supabase-anon-Key nötig = deren DB scrapen). Community-Decks waren zudem schon
früher als „oft illegal" aufgefallen. Deshalb:

**Legalitätsfilter als Kern:** jede Deckliste läuft durch unseren eigenen
`validate()`; **nur legale Decks zählen**. Damit wird der frühere Stolperstein
(„Community-Decks sind oft illegal") zum Filter statt zur Fehlerquelle.

**Umsetzung:**
- `domain/coplay.ts` (rein, getestet): `toCorpusDeck`/`legalCorpusDecks`/
  `dedupeDecks`/`buildCorpus`/`coPlayPartners`. Metrik = **Lift**
  P(a,b)/(P(a)·P(b)); Legends sind Teil der Kartenmenge, weil die Kopplung ans
  Legend-Triple das stärkste Signal ist (3 Legends legen viel fest).
  `minCoCount` (Default 2) verhindert Ein-Deck-Zufälle. Ergebnisse tragen immer
  die Stützzahlen (coCount, N).
- `data/deckCorpus.ts` (`useCorpus`, reaktiv via `useLiveQuery`): baut das Korpus
  aus Startern + Dexie-Decks, dedupliziert, liefert N + legal/gesamt.
- `ui/SynergyPanel.tsx`: neue Sektion „Zusammen gespielt" mit ehrlichem N und
  Small-N-Hinweis; vorhergesagte Partner bekommen ein **„✓ empirisch"**-Badge,
  wenn sie auch real zusammen gespielt werden (das ist der § 12 C-Brückenschlag
  Vorhersage↔Statistik).

**Bug beim Bau gefunden & gefixt:** `starterEntries()` legt die Legends auch in
`cards` (für den Sammlungs-Import) → der Validator flaggt `LEGEND_IN_DECK`, die
Starter fielen als „illegal" raus (N=0). Für ein `ValidatableDeck` nur die reinen
Deckkarten (`s.cards`) nehmen; Legends gehören ausschließlich in `legendIds`.

7 neue Tests (`coplay.test.ts`): Lift/Ranking, minCoCount-Filter, Selbst-
Ausschluss, Legalitätsfilter, Dedupe. `npm test` 121/121 grün, Typecheck/Build
sauber. Browser verifiziert: mit 4 legalen Decks zeigt „Afterparty" seine Heist-
Co-Karten + das Heist-Legend-Triple („in 3 von 4 Decks", Lift ×1.3); Dexter
DeShawn trägt in der Vorhersage-Liste das „✓ empirisch"-Badge. Ohne eigene Decks
(nur 2 Starter) greift korrekt der Small-N-Hinweis.

---

## 2026-09-04 — Empirische Synergie im Solver-Score (§ 12 C)

`domain/coplay.ts` bekommt — exakt parallel zu `makeSynergyScore` — die ScoreFn
`makeCoPlayScore(corpus, gewicht)` plus den Helfer `coPlayLift(a, b, corpus)`.
Form identisch: `Σ_Karte nutzbar × (1 + gewicht × Σ_Legend Lift(Karte ↔ Legend))`.
Mit Gewicht 0 oder leerem Korpus == reiner Mengen-Score (`defaultScore`). Der
einzige Unterschied zur Vorhersage-Variante ist die **Quelle des Signals**:
Beobachtung aus echten Decks statt Kartentext.

`SolverPanel` bekommt einen **Quellen-Umschalter „Vorhersage ↔ Empirisch"** neben
dem bestehenden Gewicht-Regler (Menge ↔ Synergie/Co-Play). Bei „Empirisch" nennt
die Beschreibung die Basis („N legale Decks", inkl. „nur Starter"-Hinweis).
Fehlen Merkmale (`hasFeatures` false), fällt die Quelle automatisch auf Empirisch.
ScoreFn bleibt austauschbar — bewusst KEIN vermischter Score (die Skalen von
Vorhersage-Synergie und Lift sind verschieden; eine sauber normalisierte
Kombination ist ein eigener nächster Schritt).

3 neue Tests: `coPlayLift` (Ko-Vorkommen, 0 ohne gemeinsames Deck), Score bevorzugt
zusammengespielte Karten, Gewicht 0 == Mengen-Score. `npm test` 124/124 grün,
Typecheck/Build sauber. Browser verifiziert: Umschalten auf „Empirisch" ändert den
Score des Heist-Triples von 49 → 160 (besessene Heist-Karten koppeln ans Heist-
Legend-Triple), N-Hinweis erscheint.

---

## 2026-09-04 — Normalisierte Kombination Vorhersage × Empirisch (§ 12 C, Abschluss)

`domain/combinedScore.ts` → `makeCombinedScore(db, corpus, cardIndex, {weight, blend})`.

**Problem:** die Rohskalen der beiden Signale sind sehr verschieden — vorhergesagte
Synergie ist merkmalsgewichtet (~0–8), empirischer Lift liegt um 1. Direkt summiert
würde die Vorhersage dominieren.

**Lösung:** jede Quelle wird VORAB über den ganzen Pool auf ihren größten
beobachteten (Karte↔Legend)-Affinitätsbeitrag normalisiert (→ pro Kante in [0,1]),
erst dann gemischt (`blend`: 1 = nur Vorhersage, 0 = nur Empirie, 0.5 = gleich). Die
Skala wird global (nicht pro Triple) bestimmt, damit der Vergleich zwischen Triples
erhalten bleibt. Fehlt eine Quelle (keine Merkmale bzw. leeres Korpus), wird die
Mischung auf die vorhandene renormalisiert — die andere wird nicht abgeschwächt.
Da die Normalisierung eine monotone Skalierung ist, ist die Rangfolge bei blend=1
identisch zur reinen Vorhersage und bei blend=0 zur reinen Empirie — kein Regress.

`SolverPanel`: Umschalter jetzt dreifach **Vorhersage · Empirisch · Kombiniert**
(Kombiniert = 50/50). Beschreibung nennt Mischung + Basis-N.

5 neue Tests (`combinedScore.test.ts`) — Kernbeleg: bei 50/50 landen eine NUR
vorhergesagte und eine NUR empirische Karte trotz völlig verschiedener Rohskalen
gleichauf (Normalisierung greift); blend 1/0 = jeweils reine Quelle; Gewicht 0 ==
Mengen-Score; fehlende Quelle wird renormalisiert. `npm test` 129/129 grün,
Typecheck/Build sauber. Browser verifiziert: Heist-Triple Vorhersage 49 / Empirisch
160 / Kombiniert 71.

**Damit ist § 12 C (statistische Synergie) vollständig:** vorhergesagt, empirisch,
und die faire Kombination beider — jeweils als austauschbare ScoreFn im Solver.

---

## 2026-09-04 — Blend-Regler, Löschen-Knöpfe, Scanner (Phase 3)

**Blend-Regler (§ 12 C):** der Kombi-Modus im `SolverPanel` hat jetzt einen
zweiten Regler „Vorhersage ↔ Empirisch" (0–100 %), der `blend` an
`makeCombinedScore` durchreicht (vorher fix 50/50). Anzeige-Wert = 1−blend, damit
links = Vorhersage, rechts = Empirisch.

**Löschen-Knöpfe (Nutzerwunsch):** Symmetrie zum Erfassen/Hinzufügen.
- Sammlung (`CollectionView`): pro Karte „−" (ein Exemplar, `addToCollection(-1)`)
  und „✕" (ganz raus, `addToCollection(-qty)`).
- Deckeditor (`DeckEditor`): Karten haben zusätzlich zu −/+ ein „✕" (ganz raus,
  `setCard(…,0)`) — vorher nur bei Legends.

**Scanner (§ 6, Phase 3):** Webcam-Frame → perzeptueller Hash → nächster Nachbar.
- Hash = **dHash** (9×8 Graustufen, Horizontalvergleich, 64 Bit) in
  `domain/phash.ts` (rein, getestet); robust gegen Helligkeit/Gamma.
- **Entscheidender Befund:** der Browser kann die CDN-Bilder NICHT selbst hashen —
  CloudFront sendet kein CORS für die Bild-Bytes, `fetch` scheitert („Failed to
  fetch"), `<img>`→Canvas ist tainted. Also werden die **Referenz-Hashes in der
  Pipeline** gebaut (`pipeline/build_hashes.py`, Pillow, kein CORS) und ins Bundle
  gelegt (`app/src/data/cardHashes.json`, gitignored — nur Hashes, §8). Der
  **Kamera-Query** wird im Browser gehasht (same-origin, kein CORS). Python-dHash
  ist bit-identisch zu `phash.ts` (gleiche 9×8-Verkleinerung LANCZOS↔Canvas-high,
  Luminanz 0.299/0.587/0.114, Bit-Reihenfolge).
- **Referenz-Qualität:** 151 Hashes, **0 Kollisionen**, kleinste Inter-Karten-
  Distanz **10**. Robustheits-Probe (Helligkeit, Unschärfe, Kontrast, JPEG,
  Drehung ±3–5°): **0/48 Fehlklassifikationen**; self-Distanz 0–2 (Foto-typisch)
  bis 13 (Drehung). Konfidenz-Schwellen daraus: ≤7 sehr sicher, ≤14 wahrscheinlich.
- UI: `ui/ScannerPanel.tsx` (Tab „Scanner") mit Ausricht-Rahmen im Kartenformat,
  „Scannen" → Top-5 mit Distanz + Konfidenz. Kamera-Fehler (z. B. keine Kamera im
  Vorschaufenster) wird sauber gemeldet. Dexie v2 legt eine `hashes`-Tabelle an
  (aktuell ungenutzt, da Referenz gebundelt — bleibt für später reserviert).

6 neue Tests (`phash.test.ts`): dHash-Verlauf/Helligkeitsinvarianz/Länge, Hamming,
nearest. `npm test` 135/135 grün, Typecheck/Build sauber. Browser verifiziert:
Referenz lädt (151), Scanner-UI rendert, Kamera-Fehlerpfad greift.

**Offen (Nutzer-Test):** echtes Scannen physischer Karten vor der Kamera — nur im
eigenen Browser möglich (localhost = secure context), nicht im Vorschaufenster.

**Nachtrag Handy-Test (2026-09-05):** Erster Test am Handy (LAN, HTTPS) schlug fehl
— die Karte füllte nur ~15 % des Rahmens, der Hash bildete also den HINTERGRUND ab
(Distanzen 23–25 „unsicher"). Zwischenschritt: verstellbarer Rahmen + Zoom + höhere
Auflösung + Live-Erkennung. LAN-Freigabe: `LAN=1 npm run dev` → HTTPS 0.0.0.0:5174
(selbstsigniert, `@vitejs/plugin-basic-ssl`), nötig weil getUserMedia einen secure
context braucht.

---

## 2026-09-05 — Scanner-Pivot: Bild-Hash → OCR (ManaBox-Ansatz)

**Befund:** Auch mit gut ausgefülltem Rahmen blieb der dHash bei Distanzen 17–23
(„unsicher") und traf die falsche Karte. Grund: der Abstand zwischen einem echten
Kamerafoto (Glanz, Farbstich, Perspektive, Kameraschärfung) und dem sauberen
CDN-Render ist für einen 64-Bit-Ganzbild-Hash zu groß — bei nur 10 Bit
Mindestabstand zwischen Karten geht das Signal unter. Die frühere Robustheitsprobe
war zu optimistisch (sie verrauschte saubere Renderbilder, kein echtes Foto).

**Entscheidung:** Wie ManaBox & Co. erkennt der Scanner jetzt **Text statt Bild**.
- `domain/nameMatch.ts` (rein, getestet): `fuzzySubstringDistance` + `matchCardName`
  — findet den Kartennamen IRGENDWO im OCR-Text und verzeiht OCR-Fehler; Rangfolge
  nach Trefferanteil, bei Gleichstand nach Länge (so entscheidet der Untertitel bei
  gleichnamigen Karten wie „Alt Cunningham").
- `ui/ScannerPanel.tsx`: `tesseract.js` (WASM, einmalig geladen/gecacht) liest den
  Namen aus dem Kameraausschnitt (grau + bei dunklem Grund invertiert, PSM sparse,
  A–Z/0–9-Whitelist) → `matchCardName` → Top-5. Zeigt den **erkannten Text** mit an
  (zum Mit-Tunen). Rahmen-/Zoom-Regler bleiben.

**Aufgeräumt:** der tote Bild-Hash-Weg entfernt — `domain/phash.ts`, `data/imageHash.ts`,
`data/cardHashes.ts`, `pipeline/build_hashes.py`, `cardHashes.json`; Dexie-Tabelle
`hashes` per v3-Migration gelöscht.

**Handy-Test (2026-09-06):** OCR trifft — „07 MAXTAC HEAVY 1 S 2 R 1 6S 08" → MaxTac
Heavy 100 % „sehr sicher". Aber False-Positives: einbuchstabige Namen („V") kamen
ebenfalls auf 100 %, weil das eine „V" zufällig im Text steht (in „HEAVY"). **Fix:**
Konfidenz = Trefferanteil × Längengewicht (`min(1, matched/6)`) → ein 1-Zeichen-Match
zählt kaum, ein 11-Zeichen-Match voll. Gegen alle 151 geprüft: MaxTac Heavy 100 %,
dahinter nur verwandte „MaxTac…"-Karten; „V" fällt raus. Panel zeigt nur Top-1 +
weitere ab 40 %. Slider (Rahmen/Zoom) bleiben (Stativ-Scannen). Feinschliff-Reserve:
Namensband gezielt zuschneiden, „Treffer in Sammlung übernehmen".

---

## 2026-09-06 — Scanner: Sammlernummer als Entscheider + Scan-in-Sammlung

**Nummer als Entscheider** (`domain/nameMatch.ts`): OCR-Zahlen mit ≥ 3 Stellen
(Cost „07" / Würfel „d12" fallen raus) werden exakt gegen `collectorNumber`
gematcht. **Wichtiger Fund:** die Sammlernummer ist NUR PRO FARBE eindeutig — „012"
tragen z. B. V (blau), Goro (grün), Kerry (rot). Deshalb wirkt die Nummer als
**Bonus + Entscheider, gekoppelt an einen minimalen Namens-Treffer** (`best.score
≥ 0.1`): sie trennt gleichnamige/gleichfarbige Karten (V-Varianten; MaxTac 080/081/
082 sind alle grün → eindeutig), zieht aber keine namensfremde Karte hoch und
überschreibt keinen klaren Namens-Volltreffer (Gleichstand → Namens-Trefferlänge,
schützt gegen eine verlesene letzte Ziffer). Anzeige „· Nr. ✓". 2 neue Tests.

**Scan → Sammlung** (`ui/ScannerPanel.tsx`): jeder Treffer hat „＋ Sammlung"
(legt in einen **Scan-Korb**); der Korb (mit ±/✕) wird per „Alle in Sammlung
übernehmen" gebündelt via `addToCollection(..., 'scan')` eingetragen. Nutzt denselben
Persistenzpfad wie die Schnellerfassung.

`npm test` 142/142 grün, Typecheck/Build sauber. Gegen die echten 151 verifiziert:
„V 012" → V Corporate Exile (Nr. ✓); „MAXTAC HEAVY 081" → MaxTac Heavy (Nr. ✓);
verlesene „080" lässt MaxTac Heavy trotzdem #1.

---

## 2026-09-06 — UX-Runde 1: Navigation, Sammlung, Kartendetail, Korb-Animation

Nutzerwunsch „benutzerfreundlicher & aufgeräumter" — erste Runde:

- **Korb-Rückmeldung** (`ui/ScannerPanel.tsx` + Keyframes in `index.css`): „＋ Sammlung"
  → Button poppt zu „✓ +1" (grün), ein „+1" schwebt auf, der Korb-Zähler pulsiert,
  am Handy `navigator.vibrate`. Respektiert `prefers-reduced-motion`.
- **Navigation entzerrt** (`App.tsx`): sechs klare Bereiche **Scannen · Erfassen ·
  Sammlung · Deck · Synergie · ⚙ Mehr** statt des überladenen „Erfassen"-Tabs. Auf
  Mobil **unten fixierte Leiste** (Daumen-erreichbar, `env(safe-area-inset-bottom)`),
  ab `sm` oben. Backup/Offline nach „Mehr", Sammlung als eigener Tab, Solver in die
  Sammlung (collection-aware).
- **Sammlung ausgebaut** (`ui/CollectionView.tsx`): Suche (Name/Nummer), Filter
  (Farbe/Typ), Sortierung (Farbe/Name/Anzahl), Kennzahlen („x Karten · y verschiedene").
- **Kartendetail** (`ui/CardDetail.tsx`, wiederverwendbar): Overlay mit großem Bild,
  Werten (RAM/Cost/Power/#), Bestand, Tags, Regeltext, offiziellem Link und den besten
  Synergie-Partnern (anklickbar → deren Detail). ESC/Backdrop schließt. Aktuell aus der
  Sammlung geöffnet; Deck/Synergie folgen.

`npm test` 142/142 grün, Typecheck/Build sauber. Browser verifiziert.

---

## 2026-09-06 — UX-Runde 2: Scanner-Komfort, Deck-Komfort, README

- **Scanner-Komfort** (`ui/ScannerPanel.tsx`): Checkbox **„Sicheren Treffer
  automatisch in den Korb"** (fügt den Top-Treffer bei Konfidenz ≥ 0.85 oder
  Nummer-Bestätigung hinzu, nur bei Kartenwechsel → kein Spam im Live-Modus).
  Fallback **„Nicht erkannt? Manuell hinzufügen"** (Suche → in den Korb), falls OCR
  mal danebenliegt.
- **Deck-Komfort** (`ui/DeckEditor.tsx`): Sektion **„Fehlende Karten"** (Einkaufsliste:
  Deck-Anzahl vs. Bestand, mit Fehlmenge) + **Kartendetail** per Tap auf eine Deckkarte
  (öffnet `CardDetail`). Kartennamen sind jetzt anklickbar.
- **README** (`README.md`, neu, für den öffentlichen Push): Draft des Nutzers
  faktisch korrigiert — Datenquelle = **NetDeck-API** (nicht „directly cyberpunktcg.com"),
  Scanner = **OCR** (pHash-Behauptungen raus), **Zustand entfernt** (ungenutzt; State =
  React + Dexie), Pipeline = stdlib-Python (FastAPI erst Phase 4), empirische Synergie =
  First-Party. Plus Dev-Setup (inkl. Hinweis, dass Kartendaten via Pipeline generiert
  werden, weil gitignored) und ehrlicher Roadmap.

`npm test` 142/142 grün, Typecheck/Build sauber. Browser verifiziert: Deck-Kartendetail
öffnet; manueller Scanner-Fallback → Korb → „Alle übernehmen".

---

## 2026-09-06 — UX-Runde 3: Tab-Reihenfolge, Deck-Empfehlungen, Synergie-Anzeige

Nutzer-Feedback nach dem Handy-Test:

- **Tab-Reihenfolge** (`App.tsx`): jetzt **Sammlung · Deck · Erfassen · Scannen ·
  Synergie · Mehr** (Scan nicht mehr zuerst). Untere Nav mobil kompakter (nowrap,
  „Mehr" ohne Icon-Umbruch).
- **Deck-Empfehlungen** (`ui/DeckEditor.tsx`): neue Sektion „Empfehlungen" über die
  Legalität hinaus — u. a. **„keine Units im Deck"** (Units greifen an/stehlen Gigs =
  Siegbedingung), „wenige Units", Gear ohne Units, ungenutztes RAM je Farbe.
- **Synergie-Anzeige** (`domain/deckSynergy.ts` `deckSynergyStats` + Deckeditor):
  statt nur eines Durchschnitts jetzt **„X/Y Karten · Ø Z"**. Hintergrund der
  Nutzerfrage „warum sinkt der Score so schnell?": der alte Wert war der **Schnitt
  pro Karte** — ein Deck braucht ~40 Karten, viele sind neutrale Füllkarten ohne
  Synergie zu den konkreten Legends, also fällt der Schnitt zwangsläufig. Die **Zahl
  synergierender Karten** wächst dagegen beim Bauen und ist das ehrlichere Signal.

`npm test` 143/143 grün, Typecheck/Build sauber. Browser verifiziert (Reihenfolge,
„0/1 Karten · Ø 0.0", „⚠ Nur 3 Units").

---

## 2026-09-06 — UX-Runde 4: Cost-Kurve-Fix, How-to-play, Combos

- **Bug: Eddie-/Cost-Kurve unsichtbar** (`ui/DeckEditor.tsx`): die Balken hatten
  `height: X%` in einem Container ohne definierte Höhe → % löst zu 0 auf. Fix: Balken
  sind jetzt direkte Kinder einer fix hohen Zeile (`items-end`, inline-Höhe), Achsen-
  labels in einer eigenen Zeile darunter; kleine Nicht-Null-Balken min. 6 %. DOM
  verifiziert (Balkenhöhe 60 px statt 0).
- **How to play** (`ui/HowToPlay.tsx`, Tab „Mehr"): aufploppendes Overlay mit einer
  **eigenen** Kurz-Spielhilfe (Ziel, 4 Deckregeln, RAM/Farben, Kartentypen, Gigs/
  Eddies/Keywords) + Link auf cyberpunktcg.com. **Kein Abtippen des Regelwerks** (§ 8).
- **Combos** (`domain/synergy.ts` `topCombos` + `ui/SynergyPanel.tsx`): Standardansicht
  der Synergie „Beste Combos im Set" — die stärksten vorhergesagten, RAM-spielbaren
  Karten-Paare, mit Vielfalt (jede Karte ≤ 3×) und Begründungs-Chips; Karte antippen →
  ihre Partner. Antwort auf „bei kleinem Pool Combos vorschlagen" — nutzt genau die
  LLM-extrahierten Merkmale.

`npm test` 144/144 grün, Typecheck/Build sauber. Browser verifiziert: Combos-Liste
(„Afterparty + Peace Offering 7.8" …), How-to-play-Overlay, Cost-Balken sichtbar.

**Nachtrag:** In der Synergie-Ansicht ersetzt die Einzelkarten-Ansicht die Combo-Liste
— ohne Rückweg war man „gefangen". Fix: **„← Zurück zu den Combos"**-Knopf oben in der
Kartenansicht (`setSelectedId(null)`), gutes Tap-Ziel. Browser verifiziert.

---

## 2026-09-06 — Kuratierte, benannte Combos

`app/src/data/combos.json` (+ Loader `data/combos.ts`): 12 handverlesene Combos aus
einem Lesedurchgang des Agents durch die 151 Karten — je **Name**, 2–3 Karten und eine
**Erklärung in eigenen Worten** (§ 8: KEIN Abtippen von Regeltext; Spielmechanik ist
nicht schützbar, die Formulierung ist original → die Datei wird **committed**, nicht
gitignored, sie ist der redaktionelle Mehrwert). Beispiele: Value-Pair-Motor, Braindance-
Maschine, Cyberware-Kreislauf, ARASAKA-Tribal, High-Gig-Rampe, Go-Solo-Tempo.

In `ui/SynergyPanel.tsx` als Sektion **„Benannte Combos"** (oberhalb der automatischen
`topCombos`, die zu „Weitere Combos (automatisch)" umbenannt sind). Karten anklickbar →
Partner; fehlende Karten (frischer Clone ohne echte Kartendaten) werden robust gefiltert.

3 neue Tests (`data/combos.test.ts`): alle Slugs existieren, ≥ 2 Karten + Name +
Erklärung, alle 12 laden. `npm test` 147/147 grün, Typecheck/Build sauber. Browser
verifiziert.

---

## 2026-09-06 — OCR-Feinschliff (Scanner)

`ui/ScannerPanel.tsx`: zwei Verbesserungen an der Texterkennung.
- **Bessere Vorverarbeitung** (`regionCanvas`): Graustufe → **Kontrast auf vollen
  Bereich strecken** (min–max), dann invert-bei-dunkel + High-Quality-Downscale.
  Macht die stilisierte Kartenschrift für Tesseract knackiger, robuster gegen Licht.
- **Namensband-Zuschnitt**: zusätzlicher, stärker gezoomter OCR-Durchgang auf das
  mittlere Drittel der Karte (grob y 44–68 %), wo der Name sitzt → saubererer Name.
  Der Ganzkarten-Durchgang bleibt (liefert die Sammlernummer). Beide Texte werden
  kombiniert an `matchCardName` gegeben — der Band-Durchgang ist damit rein additiv
  (kann nur helfen: liegt das Band mal daneben, findet der Name-Fuzzy-Match ihn
  weiterhin im Ganzkarten-Text). Die „Gelesen:"-Zeile zeigt den kombinierten Text
  zum Mit-Tunen.

Zwei `recognize`-Aufrufe pro Scan (~1,5× Zeit; `busyRef` verhindert Überlappung im
Live-Modus). Typecheck/Build sauber, 147/147 Tests grün, Scanner rendert. Echte OCR-
Güte nur am Gerät testbar — Band-Position (44–68 %) ggf. anhand echter „Gelesen:"-
Ausgaben nachjustieren.

---

## 2026-09-06 — Mobil-Layout-Fix (Synergie) + Glanz-robuste OCR

Zwei Handy-Meldungen:
- **Menü „off" im Synergie-Tab:** die Combo-Zeilen ließen lange Kartennamen rechts
  rauslaufen → horizontaler Seiten-Overflow → die fixierte untere Nav verrutschte
  („Mehr" fiel raus). Fix: `overflow-x: hidden` auf `body` (nie horizontal scrollen)
  **und** die Combo-Karten in `SynergyPanel` mit `min-w-0` + `truncate` (automatische
  Paare als zwei `flex-1`-Karten; benannte Combos `basis-[calc(50%…)]` → 2/Reihe).
  In Mobil-Emulation (375 px) verifiziert: `scrollWidth == viewport`, alle 6 Tabs
  sichtbar, Namen umbrechen sauber („Peace Offeri…").
- **Scans in Hüllen/Bindern:** Glanz/Reflexionen. Die reine min–max-Kontraststreckung
  scheiterte an solchen Ausreißern (ein Glanzpixel = 255). Umgestellt auf
  **Perzentil-Streckung** (`regionCanvas`): die hellsten/dunkelsten 2 % (Glanz/Schatten)
  werden per Histogramm gekappt, gestreckt wird der eigentliche Karteninhalt. Plus
  Hinweis „Karte leicht kippen, um Reflexionen wegzubekommen / manuell hinzufügen".

`npm test` 147/147 grün, Typecheck/Build sauber.

---

## 2026-09-05 — Deckbau: Synergie beim Bauen, Filter, Erklärung

Nutzerwunsch, drei Ergänzungen im Deckeditor bzw. der Synergie-Ansicht:
- **`domain/deckSynergy.ts`** (rein, getestet): `suggestAdditions` (RAM-legale,
  noch nicht enthaltene Karten, nach Affinität zu den Legends, optional nur Bestand)
  + `deckSynergyRating` (Synergie-Dichte des Decks). Im **Deckeditor** als Sektion
  „Synergie": Dichte-Label + Vorschläge mit Begründungs-Chips und „+"-Einbau.
- **Deckbau-Filter** im Deckeditor: Farbe · Typ · „nur legal spielbar" (unter den
  aktuellen Legends) · „nur Bestand"; ohne Suchbegriff durchblättert der Filter den
  Katalog.
- **`ui/SynergyInfo.tsx`**: aufklappbare Erklärung „hohe / niedrige Synergie" — in
  Deckeditor UND Synergie-Ansicht.

`npm test` 139/139 grün, Typecheck/Build sauber. Browser verifiziert: Filter greifen,
Vorschläge erscheinen passend zu den Legends (z. B. rotes Aggro-Triple → FIGHT/ROCKER/
GEAR-Karten oben).

---

## 2026-09-04 — Kartenbilder offline (Service-Worker-Cache)

**Problem (Nutzer):** die signierten CDN-URLs laufen ab → Bilder laden unzuverlässig
/ zeigen das Broken-Icon; gewünscht ist Offline-Ansehbarkeit.

**Warum nicht Dexie-Blobs:** der Browser kann die Bild-BYTES nicht lesen — `fetch`
scheitert an CORS, ein Cross-Origin-`<img>` macht den Canvas „tainted". Also lassen
sich Bilder nicht als Blob in Dexie legen (gleiche Wand wie beim Scanner).

**Lösung — Workbox-Runtime-Cache (Cache API):** speichert die HTTP-Antwort direkt,
auch „opaque" (cross-origin, `statuses: [0, 200]`), ganz ohne Byte-Zugriff. §8-
konform: nichts im Repo/Bundle, nur ein lokaler Cache auf dem Gerät.
- `vite.config.ts`: `workbox.runtimeCaching` für `*.cloudfront.net`, `CacheFirst`,
  **`matchOptions.ignoreSearch: true`** — matcht über die wechselnde Signatur hinweg
  am Pfad, sonst wäre jede Session ein Cache-Miss. `devOptions.enabled` an, damit es
  auch unter `npm run dev` greift.
- Offline liefert die API keine URLs → `data/cardImages.ts` spiegelt die letzte
  slug→URL-Tabelle nach Dexie (`meta.cardImageUrls`) und fällt offline darauf zurück
  (Signatur abgelaufen egal — der SW matcht per Pfad aus dem Cache).
- `ui/OfflineImagesPanel.tsx` (Tab „Erfassen"): „Alle Bilder offline laden" lädt alle
  151 via `<img>` (kein CORS nötig) → SW cacht sie; Fortschritt + Fehlerzähler.
- `ui/CardImage.tsx`: `onError` → sauberer Platzhalter statt Broken-Icon.

Browser verifiziert: 151 Bilder im `card-images`-Cache, 151 URLs in Dexie
gespiegelt; ein Bild mit ABSICHTLICH kaputter Signatur (normal 403) lädt in voller
Größe (733×1024) aus dem Cache → Offline-Anzeige bewiesen. `npm test` 135/135 grün.

---

## 2026-09-06 — Ingest-Pipeline (Phase 4a, § 12 C): Mechanismus vor Quelle

**Entscheidung:** Die Ingest-Pipeline für die statistische Synergie zuerst
**quellen-agnostisch** bauen (liest lokale Decklisten), die **Volumen-Quelle**
bewusst getrennt und mit dem Nutzer klären. Das folgt PLAN.md § 12 C / Zeitplan
(„4a so früh wie möglich, parallel"): der Mechanismus darf nicht auf eine Quelle
warten, und verpasste Decklisten lassen sich nicht rückwirkend sammeln.

**Aufbau:**
- `pipeline/ingest_decks.py` (stdlib-only, wie `fetch_cards.py`): liest slug-basierte
  Decklisten aus `pipeline/decklists/*.json` (`{legends:[3], cards:{slug:n}}`),
  **verwirft illegale** über einen Python-Port unserer vier § 1-Regeln (`is_legal`:
  3 unterschiedliche Legends, Deckgröße 40–50, ≤ 3 Kopien, **Per-Farbe-RAM-Cap**),
  aggregiert `df` (in wie vielen Decks) und `co` (paarweises Ko-Vorkommen) → schreibt
  `app/src/data/coplay.json` (`{version, generatedBy, n, df, co}`).
- App-Anbindung ohne Bruch bei fehlender Datei: `data/coplayCorpus.ts` lädt
  `coplay.json` **optional** per `import.meta.glob(..., {eager:true})` (fehlt auf
  frischem Clone/CI → `ingestedCorpus = null`, App baut unverändert). `data/deckCorpus.ts`
  führt es via neuem `mergeCorpora` (`domain/coplay.ts`, summiert `n`/`df`/`co`,
  getestet) mit dem Live-Korpus (Starter + eigene Dexie-Decks) zusammen. `SynergyPanel`
  weist die Ingest-Zahl gesondert aus.

**§ 8 / § 11 / Datenschutz:** Es werden nur Karten-Slugs + Zahlen aggregiert, **kein
Regeltext**. Decklisten-Dateien und `coplay.json` sind **gitignored** (können eigene
oder fremde Deckdaten enthalten) — nur `decklists/README.md` und der Code sind
versioniert. **Kein Scraping** im Mechanismus; eine Community-Quelle (Simulator,
exburst) wird erst nach ToS-/robots.txt-Prüfung und ausdrücklicher Nutzer-Zusage
angebunden. First-Party (eigene Listen + Starter) bleibt der Default.

**Verifiziert:** 3 Demo-Heist-Varianten → 3 legal, 0 verworfen, Co-Play korrekt
aggregiert (Heist-Paare Count 3); Leerlauf (frischer Clone) → `n=0`, App lädt `null`.
Demo-Dateien danach entfernt (keine synthetischen „empirischen" Zahlen in der App).
`npm test` 148/148 grün, `npm run build` sauber.

---

## 2026-09-07 — Simulationsmodus: manuelles Playtest statt Regel-Engine

**Entscheidung:** Der Simulationsmodus (Roadmap „Proberunden") wird als
**manuelles Playtest-Sandbox** gebaut — Vorbild **ManaBox**: echte Zonen, der
Nutzer bewegt Karten selbst, es gibt **keine erzwungene Regel-Engine**.

**Warum nicht ein echter Spiel-Simulator:** Eine vollständige Regel-Engine des
Cyberpunk TCG (Fixer/Würfel, Kämpfe, Reaktionen, Keywords, Gegner-KI) wäre riesig
und würde Regeln *vortäuschen*, die wir nicht sicher belegen können — das verstößt
gegen das Ehrlichkeitsgebot (§ 12). Ein manuelles Sandbox ist ehrlich, sofort
nützlich (Starthand/Curve/Combos testen) und robust.

**Regel-Recherche (offizielle Quellen + How-to-Play, Beta):** Startaufstellung
= 3 Legends verdeckt, Gig-Würfel in den Fixer-Bereich, Deck mischen, **6 ziehen**,
**einmal** Mulligan (ohne Nachteil), kein Hand-Limit; Zug = **Start-Phase**
(bereitstellen → 1 ziehen → 1 Würfel in den Gig-Bereich) + **Main-Phase** (spielen,
angreifen); Sieg = Zugbeginn mit genug Gigs **oder** Gegner deckt aus. **Gig-
Schwelle uneindeutig:** transkribierter „Printable Gameplay Guide" nennt **7+**,
ein Beta-How-to nennt **6** → als **Parameter** `gigWinThreshold` in
`rules/playtest.v1.json`, im UI als „Ziel" angezeigt, **nicht** hart erzwungen
(der Gig-Zähler ist würfelgetrieben/manuell). Alle Parameter aus JSON, nie
hardcodiert (wie die Deckbau-Regeln).

**Umsetzung:** `domain/playtest.ts` (rein, immutabel, deterministischer PRNG für
reproduzierbare Tests), `rules/playtest.ts`/`.v1.json`, `ui/PlaytestPanel.tsx` im
Tab „Mehr". **Nur legale eigene Decks + die Starter** sind spielbar (Filter über
`validate()`, Nutzerwunsch). 12 neue Tests (Determinismus, Ziehen, Mulligan,
Zugwechsel, Zonenwechsel, Kartenerhaltung, Gig-Sieg). 160 Tests grün, Build sauber,
Browser verifiziert (Starthand 6, Zugwechsel zieht/+Gig, Feld/Legends/Trash-Moves).

---

## 2026-09-07 — Konsolen-Test-Engine (sim/): Messwerkzeug, kein Simulator

**Entscheidung:** Eine separate **Konsolen-Test-Engine** in `sim/` (eigenes Node-
Paket, läuft mit `tsx`), die Decks deck-vs-deck durchspielt, um **Decks und unsere
vorhergesagten Synergien in Szenarien** zu vergleichen. Bewusst **kein** regeltreuer
Simulator und **kein** App-Feature — nur ein internes Dev-Werkzeug. Auf ausdrücklichen
Wunsch **nicht beworben** (nicht im öffentlichen README, keine große Ankündigung).

**Warum so grob:** Ein echtes Regelwerk-Modell (Fixer/Würfel, Kämpfe, Keywords,
Reaktionen) wäre riesig und würde Regeln vortäuschen (Ehrlichkeitsgebot § 12). Das
Modell hier ist ein simpler Proxy: Eddies-Ramp, Karten spielen = Feld-Power (Support
mit Basiswert), **Synergie (unsere Vorhersage) = Power-Bonus**, Angriff klaut Gigs
(`floor((bereite Power − ½·Gegnerfeld)/10)`), Fixer +1 Gig/Zug, Sieg bei genug Gigs
zu Zugbeginn oder Auskarten. Legends sind nur „Eddie-Quelle". Es ist ein Messgerät:
gewinnt ein synergistischeres/besseres Deck hier öfter, ist das ein schwaches Signal.

**Aufbau:** rein & deterministisch (Seed, mulberry32) → reproduzierbar/testbar; Zufall
nur beim Mischen, danach serialisierbarer Zustand (Schritt-Modus). `engine.ts` (Kern),
`policies.ts` (Heuristik/Zufall), `data.ts` (Brücke zu `cards.json`/`features.json`
+ `validate()` für Szenario-Decks), `run.ts` (CLI). `battle` spielt beide Sitz-
positionen → der Anzieh-Vorteil (~65–75 %) wird herausgemittelt. **Subagent-Spiel**
über `agent-init`/`agent-step`: der Zustand wird als JSON ausgegeben, ein Agent wählt
`--play`/`--attack` bis zum Spielende (verifiziert: ein general-purpose-Subagent
spielte Embracing Power near-optimal, 7:8 knapp verloren).

**Ergebnis (erste Messung):** The Heist schlägt Embracing Power sitz-fair 81,8 %
(Synergie an) vs. 62,2 % (aus) über je 600 Spiele — unsere Vorhersage-Synergie
verschiebt das Ergebnis deutlich und verkürzt die Spiele (Ø 6,0 statt 6,7 Züge).
7 Engine-Tests grün. `sim/node_modules`, `sim/.state.json`, `sim/decks/*.json`
gitignored (Abhängigkeiten, Läufe, Deckdaten).
