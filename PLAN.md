# engram — Umsetzungsplan

> Lokale, cloudfreie Sammlungsverwaltung und
> sammlungsbewusster Deckbuilder für das Cyberpunk TCG (WeirdCo / CD PROJEKT RED).
> Web-App zuerst, Webcam-Scan als Kernfunktion, Ziel ist eine installierbare App.

---

## Umsetzungsstand (2026-09-06)

Kurzüberblick, was gebaut ist. Details in [DECISIONS.md](DECISIONS.md), Code-Zeiger
in [CLAUDE.md](CLAUDE.md). 142 JS-Tests + Python-Tests grün.

- **Phase 0 (Spikes):** 0.2 (Datenquelle) gelöst — **NetDeck-API** statt Scraping der
  offiziellen DB (`pipeline/fetch_cards.py` → 151 echte Karten). 0.4 (Fixture) erledigt.
  0.1 (iOS-PWA-Kamera) offen. Regeln gegen das offizielle Rulebook verifiziert
  (Per-Farbe-RAM bestätigt).
- **Phase 1 (Sammlungstracker):** ✅ Dexie-Persistenz, Schnellerfassung, Starter-
  Quickadd, Sammlungsansicht mit Fortschritt, JSON-Backup, Kartensuche (Name + Nummer),
  Löschen-Knöpfe. Kartenbilder nur verlinkt + **Offline-Cache** (Service-Worker, § 8).
- **Phase 2 (Validator + sammlungsbewusster Deckbau):** ✅ Validator, Legend-Solver
  (austauschbare ScoreFn), Deckeditor mit Live-Statistik, Mehr-Deck-Verwaltung,
  Deck-Textformat (MTG-artig), Swap-Analyse, **Deckbau-Filter** + **Synergie-Vorschläge
  beim Bauen**.
- **§ 12 (Synergie):** ✅ vollständig. **Vorhersage** aus Kartentext (kuratierter
  LLM-Lesedurchgang → `features.json`), **Empirie** aus legalen Decks (Co-Play/Lift,
  First-Party-Korpus), **normalisierte Kombination** — alle drei als ScoreFn im Solver
  wähl- und mischbar. Erklärung „hohe/niedrige Synergie" im UI.
- **Phase 3 (Scanner):** läuft am Handy. **Wichtige Abweichung vom Plan:** der
  perzeptuelle Bild-Hash (§ 6) war für echte Kamerafotos zu schwach → Umstieg auf
  **OCR (ManaBox-Ansatz)**: Kartennamen lesen (`tesseract.js`) und unscharf abgleichen
  (`domain/nameMatch.ts`, längengewichtet gegen Kurznamen-Fehltreffer). **Sammlernummer
  als Entscheider** (nur pro Farbe eindeutig → an Namens-Treffer gekoppelt) trennt
  gleichnamige Karten. **Scan-Korb → „In Sammlung übernehmen"** (Batch-Erfassung),
  Auto-Übernahme sicherer Treffer, manueller Fallback bei OCR-Fehlern.
  Heimnetz-Test via `LAN=1 npm run dev` (HTTPS, Kamera braucht secure context).
  Offen: OCR-Feinschliff (Namensband-Zuschnitt), iOS-Kamera (Spike 0.1).
- **README** (`README.md`) für den öffentlichen Push vorhanden (faktisch korrekt,
  mit Dev-Setup + Disclaimer). UX in zwei Runden aufgeräumt (mobile Navigation,
  Sammlung mit Suche/Filter, wiederverwendbares Kartendetail, Korb-Animation).
- **Phase 4a (Ingest-Pipeline):** Mechanismus **steht** und ist quellen-agnostisch:
  `pipeline/ingest_decks.py` liest slug-basierte Decklisten aus `pipeline/decklists/`,
  verwirft illegale (Python-Port unserer vier § 1-Regeln), aggregiert Co-Play →
  `app/src/data/coplay.json` (gitignored). Die App lädt es optional (`coplayCorpus.ts`)
  und führt es via `mergeCorpora` mit den live aus Dexie gebauten Decks zusammen —
  so wächst die empirische Synergie mit jedem ingesteten Deck (EDHREC-Gedanke, lokal).
  Fehlt die Datei (frischer Clone/CI), baut die App unverändert weiter. **Offen:** die
  Volumen-Quelle (mit dem Nutzer zu klären) — First-Party bleibt der Default.
- **Phase 4b (Stats-Service):** noch offen; die First-Party-Empirie (§ 12 C) nimmt den
  EDHREC-Gedanken lokal vorweg.
- **Phase 5 (Capacitor):** noch offen.

---

## 0. Warum dieses Projekt existiert

Es gibt bereits mehrere Deckbuilder (ripperdeck.gg, tcgcyberpunk.com, die offizielle
DB auf cyberpunktcg.com) und mehrere Meta-Seiten, die sich Domains gesichert haben.
Ein weiterer hübscher Deckbuilder gewinnt nichts.

Was **keins** dieser Tools kann:

1. **Local-first.** Die Sammlung verlässt das Gerät nie.
2. **Sammlungsbewusster Deckbau.** Nicht „welche Decks gibt es", sondern
   „welche Decks kann *ich* mit meinem Bestand bauen, und welche Legend-Kombination
   schöpft ihn maximal aus".
3. **Scan → Sammlung → Deckvorschlag als geschlossener Kreis.** Scannen, Tracken
   und Bauen sind heute drei getrennte Tools.

Diese drei Punkte sind das Produkt. Alles andere ist Beiwerk.

**Nicht-Ziele (explizit):**

- Kein Konkurrenzprodukt zum offiziellen Deckbuilder auf Feature-Ebene
- Kein Account-System in Phase 1–3
- Kein Ausliefern von Kartenbildern (siehe § 8 Lizenz)
- Kein Multiplayer, kein Simulator, kein Marktplatz

---

## 1. Fachliche Regeln (Single Source of Truth)

Diese Regeln sind die Grundlage aller Validierung. **In eine Config-Datei, niemals
hardcoden** — das Spiel ist in Beta, die Regeln haben sich zwischen Alpha und Beta
bereits geändert und werden es wieder tun.

Autoritative Quelle: `cyberpunktcg.com/comprehensive-rules`. Vor der Umsetzung
von Phase 2 einmal vollständig lesen und die Werte unten gegen das Dokument
abgleichen — die Angaben hier stammen aus Sekundärquellen.

### Deckbau-Constraints

```
1. Genau 3 Legend-Karten mit unterschiedlichen Namen.
2. 40 bis 50 Karten im Deck (Legends zählen NICHT mit).
3. Maximal 3 Kopien derselben Karte.
4. RAM-Limit pro Farbe:
   cap(Farbe C) = Summe der RAM-Werte aller Legends mit Farbe C
   Für jede Karte K der Farbe C im Deck gilt: RAM(K) <= cap(C)
   Eine Legend trägt RAM ausschließlich zu ihrer eigenen Farbe bei.
```

Beispiel: Legends mit 2 Grün, 2 Grün, 2 Rot ⇒ grüne Karten bis RAM 4,
rote Karten bis RAM 2, blaue und gelbe Karten gar nicht spielbar.

### Farben

`RED`, `GREEN`, `BLUE`, `YELLOW` — keine Fraktionen, sondern der „Color Tree".

### Weitere relevante Regeln (für spätere Analyse-Features)

- Siegbedingung: mit 6 Gig-Würfeln in den eigenen Zug starten
- Leeres Deck = sofortige Niederlage (macht Decklänge zu einer echten Entscheidung)

### Konfigurationsdatei

`src/rules/ruleset.v1.json`:

```json
{
  "version": "beta-2026-05-29",
  "legendCount": 3,
  "legendNamesMustBeUnique": true,
  "deckMin": 40,
  "deckMax": 50,
  "maxCopiesPerCard": 3,
  "colors": ["RED", "GREEN", "BLUE", "YELLOW"],
  "ramScope": "perColor"
}
```

Der Validator lädt das Ruleset. Bei Regeländerungen: neue Datei, alte behalten,
Decks referenzieren ihre Ruleset-Version.

---

## 2. Datenmodell

```ts
type Color = 'RED' | 'GREEN' | 'BLUE' | 'YELLOW';

interface Card {
  id: string;              // = slug der offiziellen DB, z.B. "v-streetkid"
  setCode: string;         // "WNC"
  collectorNumber?: string;
  name: string;
  subtitle?: string;       // "Streetkid", "Ender of Legends"
  type: 'LEGEND' | 'UNIT' | 'GEAR' | 'PROGRAM' | 'BRAINDANCE';
  color: Color;
  ram?: number;            // bei Legends: bereitgestelltes RAM. NULLABLE!
  cost?: number;           // NULLABLE — mehrere Legends haben keinen Cost
  power?: number;          // NULLABLE
  eddies?: number;
  tags: string[];
  rarity: string;
  rulesText: string;
}

// Printings sind eigene Entitäten. Die offizielle DB trennt das bereits
// (?printing=<uuid>), also übernehmen statt neu erfinden.
interface Printing {
  id: string;              // die printing-UUID der offiziellen DB
  cardId: string;
  variant: 'STANDARD' | 'FOIL' | 'ALT_ART' | string;
  imageUrl?: string;       // NUR Link nach extern, nie lokal gespeichert
}

interface CollectionEntry {
  printingId: string;      // Bestand wird pro Printing gezählt, nicht pro Karte
  quantity: number;
  addedAt: number;
  source?: string;         // "display-1", "starter-heist", "scan"
}

interface Deck {
  id: string;
  name: string;
  rulesetVersion: string;
  legendIds: [string, string, string];
  cards: { cardId: string; count: number }[];
  notes?: string;
  updatedAt: number;
}

interface CardHash {
  cardId: string;
  phash: string;           // 64-bit perceptual hash als Hex
  cropVersion: string;     // welcher Art-Ausschnitt zugrunde lag
}
```

Speicherung: **IndexedDB via Dexie.js**. Kein LocalStorage (zu klein, synchron).

---

## 3. Tech-Stack (Entscheidungen sind getroffen, nicht mehr diskutieren)

| Bereich | Wahl | Begründung |
|---|---|---|
| Build | Vite | schnell, PWA-Plugin ausgereift, sauberer Capacitor-Pfad |
| Sprache | TypeScript, `strict: true` | Der Validator ist die Kernlogik, die will typisiert sein |
| UI | React 18 | größte Auswahl an Capacitor-Rezepten |
| Styling | Tailwind + eigene CSS-Layer | Skin trennbar von Struktur |
| State | Zustand | leichtgewichtig, kein Boilerplate |
| Persistenz | Dexie.js (IndexedDB) | Migrationen, Queries, Bulk-Ops geschenkt |
| PWA | vite-plugin-pwa (Workbox) | Offline-Cache und Manifest ohne Handarbeit |
| Tests | Vitest | Validator und Solver brauchen echte Tests |
| Bildverarbeitung | Canvas API, später WASM | erst messen, dann optimieren |
| Nativ (Phase 5) | Capacitor | wickelt den bestehenden Web-Code ein statt Neuschrieb |
| Backend (Phase 4) | Python, FastAPI, SQLite | die Pipeline ist Datenarbeit, das ist Python-Heimat |

**Warum zwei Sprachen:** Frontend ist UI-Arbeit, Ingest ist Scraping und Parsing.
Der Hash-Generator ist ohnehin ein Offline-Python-Skript. Die Grenze ist eine
JSON-API, das ist kein Reibungspunkt.

---

## 4. Repo-Layout

```
engram/
├─ CLAUDE.md                  # Kontext für Claude Code (siehe § 9)
├─ PLAN.md                    # dieses Dokument
├─ DECISIONS.md               # Entscheidungslog, append-only
├─ app/                       # Vite-Frontend
│  ├─ src/
│  │  ├─ rules/               # Ruleset-JSON + Validator (framework-frei!)
│  │  ├─ db/                  # Dexie-Schema und Migrationen
│  │  ├─ domain/              # Deck-Solver, Sammlungslogik
│  │  ├─ scan/                # Kamera, Crop, pHash, Matching
│  │  ├─ ui/                  # Komponenten
│  │  └─ data/cards.json      # Kartendaten, generiert
│  └─ tests/
├─ pipeline/                  # Python
│  ├─ fetch_cards.py          # Kartendaten holen und normalisieren
│  ├─ build_hashes.py         # pHash-Index bauen
│  └─ ingest_decks.py         # Phase 4: Decklisten-Ingest
└─ service/                   # Phase 4: FastAPI + SQLite
```

**Wichtig:** `src/rules/` und `src/domain/` haben **keine** React-Abhängigkeit.
Reine Funktionen, voll testbar, und in Phase 5 unverändert wiederverwendbar.

---

## 5. Phasen

Jede Phase ist eigenständig lauffähig und nützlich. Nicht vorgreifen.

### Phase 0 — Spikes (ca. 1 Woche, vor jeder Zeile Produktionscode)

Ziel: die drei Annahmen prüfen, die den ganzen Plan tragen können oder kippen.

| # | Spike | Frage | Ergebnis nach `DECISIONS.md` |
|---|---|---|---|
| 0.1 | **iOS-Kamera im PWA-Standalone** | Läuft `getUserMedia` in einer zum Homescreen hinzugefügten PWA auf aktuellem iOS zuverlässig? | Falls nein: Capacitor rutscht von Phase 5 auf Phase 3 |
| 0.2 | **Kartendaten-Quelle** | Primärquelle steht fest (§ 11.2). Offene Frage: gibt der JSON-Endpunkt hinter der Filtermaske Farbe, Tags und Regeltext her, oder muss die Detailseite je Karte geholt werden? | Entscheidet Aufwand des Importers, nicht mehr das Ob |
| 0.3 | **Kartenlayout** | Gibt es Barcode oder QR auf der Karte? Falls nein: wie hoch ist die Sammlernummer in Pixeln unter realen Bedingungen? | Entscheidet, ob der OCR-Zweig überhaupt gebaut wird |
| 0.4 | **Synthetisches Fixture** | Reichen 20 handgeschriebene Fantasiekarten, um Validator und Solver vollständig zu testen? | Entkoppelt Phase 2 von Spike 0.2 |

**0.1 ist der wichtigste Spike des gesamten Projekts.** Er kostet einen Nachmittag
und kann dir zwei Monate Fehlinvestition ersparen. Zuerst machen.

**0.4 ist der billigste und wird trotzdem gern übersehen.** Schreib von Hand
`app/tests/fixtures/synthetic-set.json` — rund 20 erfundene Karten, alle vier
Farben, RAM-Werte von 1 bis 6, ein paar Legends, bewusst gesetzte Grenzfälle.
Damit sind Validator und Legend-Solver **vollständig entwickelbar und testbar,
bevor eine einzige echte Karte vorliegt.** Das nimmt Spike 0.2 vom kritischen
Pfad: selbst wenn die Datenfrage drei Wochen dauert, arbeitest du in der Zeit
an Phase 2 statt zu warten.

**Timebox für 0.2:** zwei Wochen. Wenn bis dahin weder eine Antwort auf die
Anfrage noch ein nutzbarer Endpunkt vorliegt, entscheidest du dich für den
Selbsterfassungsweg (§ 11.4) und ziehst ihn durch. Kein offenes Warten.

Definition of Done: vier Absätze in `DECISIONS.md`, jeder mit Datum, Testaufbau
und Ergebnis.

---

### Phase 1 — Lokaler Sammlungstracker (das Minimum, das dir wirklich hilft)

Ziel: du kannst deine zwei Displays erfassen und sehen, was du hast. Kein Server,
kein Scanner, kein Account.

**Aufgaben** (je eine Claude-Code-Session):

1. Vite-Projekt aufsetzen, TypeScript strict, Tailwind, Vitest.
2. `pipeline/fetch_cards.py`: Kartendaten aus der in Spike 0.2 gewählten Quelle
   ziehen (§ 11), ins `Card`-Schema normalisieren, nach `app/src/data/cards.json`
   schreiben. Adapter-Muster: eine Schnittstelle, mehrere Quellen-Implementierungen,
   damit ein Quellenwechsel nur eine Datei kostet. Snapshot-Test gegen Schemaänderungen.
3. Dexie-Schema und Migrationen. Tabellen: `collection`, `decks`, `meta`.
4. Kartensuche: Volltext über Name und Subtitle, Filter nach Farbe, Typ, RAM,
   Eddies, Power, Rarity. Muss unter 50 ms reagieren — bei ein paar hundert Karten
   ist das trivial, wenn du nicht bei jedem Tastendruck neu renderst.
5. **Schnellerfassung.** Das ist die wichtigste UI des Projekts:
   Eingabefeld fokussiert, drei Buchstaben tippen, Pfeiltasten, Enter setzt +1,
   Feld leert sich, Fokus bleibt. Undo mit Strg+Z. Zähler sichtbar.
   Ziel: ein Booster in unter 30 Sekunden.
6. Sammlungsansicht: gruppiert nach Set und Farbe, Fortschritt „x von y" pro Farbe.
7. **Starter-Quickadd.** Die Starter-Decks sind bekannte, feste Listen
   (The Heist: V, Jackie Welles, Viktor Vektor — Embracing Power: Saburo,
   Yorinobu, Goro Takemura). Ein Klick „Ich besitze Starter X" trägt rund
   50 Karten auf einmal ein. Kostet eine Stunde und spart dir sofort zwei.
   Listen aus dem Print-&-Play-Bereich der offiziellen Seite (§ 11.2) ziehen,
   nicht abtippen.
8. **Deck-Textformat.** Ein simples Zeilenformat (`3x Kartenname` plus
   Legend-Block), Export und Import. Brauchst du dreifach: zum Teilen, zum
   Übernehmen fremder Listen, und als Parserziel für den Ingest in Phase 4.
   Einmal sauber bauen, dreimal benutzen.
7. Export und Import als JSON. **Vor allem anderen bauen** — Datenverlust in
   IndexedDB durch einen Browser-Reset ist real, und du sammelst ab Tag eins.

**Definition of Done:** Deine beiden Displays und beide Starter sind erfasst,
in unter zwei Stunden, ohne Scanner.

---

### Phase 2 — Validator und sammlungsbewusster Deckbau

Das ist das Alleinstellungsmerkmal. Hier gründlich sein.

**Aufgaben:**

1. **Validator** (`src/rules/validate.ts`), reine Funktion:
   `validate(deck, ruleset, cardIndex) → { ok, violations[] }`.
   Jede der vier Regeln aus § 1 ist ein eigener Check mit eigener Fehlermeldung.
   Mindestens 20 Unit-Tests, inklusive Grenzfälle: genau 40, genau 50,
   vier Kopien, Legend-Namensdubletten, Karte einer Farbe ohne Legend dieser Farbe.
2. **Deckeditor** mit Live-Anzeige: RAM-Cap pro Farbe und Ausnutzung, Eddie-Kurve,
   Kartentyp-Verteilung, Deckgröße.
3. **Sammlungsmodus.** Toggle „nur was ich besitze". Im Deckeditor zeigt jede
   Karte `im Deck / im Besitz`. Fehlende Karten werden markiert, nicht versteckt.
4. **Der Legend-Solver.** Kernfeature:

   ```
   Eingabe:  Sammlung, optional Ziel-Farbe(n)
   Ablauf:   Alle Kombinationen aus 3 Legends mit unterschiedlichen Namen
             aus dem eigenen Bestand aufzählen.
             Für jede Kombination:
               - RAM-Caps pro Farbe berechnen
               - Menge der legal spielbaren Karten aus dem eigenen Bestand bestimmen
               - Score bilden (siehe unten)
   Ausgabe:  Top-N Legend-Triples, sortiert nach Score, jeweils mit
             freigeschaltetem Kartenpool
   ```

   Komplexität: bei n Legends im Bestand sind das C(n,3) Kombinationen. Bei 30
   Legends sind das 4060 — in Millisekunden erledigt. Kein Optimierungsbedarf,
   brute force ist hier die richtige Antwort.

   Score in Version 1 bewusst simpel: Anzahl legal spielbarer Karten im Besitz,
   gewichtet mit der jeweiligen Anzahl. Später ersetzbar durch Meta-Daten aus
   Phase 4. **Die Score-Funktion hinter ein Interface legen**, damit sie
   austauschbar bleibt.

5. **Swap-Analyse:** „Legend X gegen Y tauschen ⇒ +14 Karten freigeschaltet,
   −6 verloren." Das ist die Analyse, die EDHRECs Datenmodell gar nicht hergibt,
   weil dort Farbidentität ein Ja/Nein-Filter ist und kein Budget.

**Definition of Done:** Du wirfst deine reale Sammlung rein und bekommst eine
begründete Antwort auf „welche drei Legends soll ich spielen".

---

### Phase 3 — Webcam-Scanner

Erst jetzt. Bis hierhin hat die manuelle Erfassung dich problemlos getragen.

#### Leitgedanke

Bei Massenerfassung ist **die Handbewegung das Limit, nicht die Erkennung.**
Deshalb ist die einzig relevante Kennzahl: wie viele Karten laufen ohne
Nutzerinteraktion durch. Jede Bestätigung kostet zwei Sekunden und zerstört
den Rhythmus.

Daraus folgen zwei Designentscheidungen:

1. **Kein Auslöser, kein Bestätigungsdialog.** Kontinuierliche Frameverarbeitung.
2. **Kein Rechteck-Erkennungsproblem lösen.** Fester Rahmen im Videobild
   („Karte hier ausrichten"). Der Art-Ausschnitt sitzt damit an bekannter
   Position und OpenCV entfällt komplett.

#### Erkennungsstrategie: pHash primär, OCR nur als Stichentscheid

OCR der Sammlernummer als *primäres* Signal ist die falsche Wahl. Zwei Gründe:

- **Auflösung.** Bei 720p und einer Karte, die 60 % des Bildes füllt, ist die
  Nummer etwa 15–25 Pixel hoch. OCR will 30+. Das ist dauerhafter Grenzbereich,
  ausgerechnet beim kleinsten und schlechtest beleuchteten Element der Karte.
- **Stille Fehler.** 0/O, 1/7, 5/S, 8/B. „001" als „007" gelesen fügt kommentarlos
  die falsche Karte hinzu. Ein pHash-Fehltreffer ist selten *und* an der Distanz
  erkennbar. Ein falsches OCR-Ergebnis sieht genauso überzeugt aus wie ein
  richtiges. Das ist die gefährlichere Fehlerart.

```
Pro Frame:
  Art-Crop → pHash → Hamming-Distanz gegen Index
  best, second = die zwei besten Treffer

  best < 8 Bit  UND  (second − best) > 10 Bit
      → sicher, akzeptieren
  best < 14 Bit, aber Abstand zu gering
      → OCR auf das Nummernfeld, aber NUR gegen die 2–3 Kandidaten
  sonst
      → Review-Queue
```

Der entscheidende Punkt im OCR-Zweig: **kein offenes OCR.** Du weißt bereits,
dass es eine von zwei bis drei Karten ist, und musst nur zwischen bekannten
Strings unterscheiden. Das ist ein Vergleich, kein Erkennungsproblem — um
Größenordnungen robuster. Greift bei etwa 5–10 % der Karten, kostet im Mittel
also nichts.

pHash selbst ist praktisch gratis: DCT über 32×32 sind Mikrosekunden. Jeden
Frame rechnen ist kein Problem.

#### Aufgaben

1. `pipeline/build_hashes.py`: für jede Karte den Art-Ausschnitt croppen,
   auf 32×32 Graustufen reduzieren, DCT, 64-Bit-pHash bilden.
   Ausgabe: `hashes.json`, ein paar hundert Einträge à 16 Hex-Zeichen.
   **Wenige Kilobyte statt hunderter JPEGs, und die Lizenzfrage ist umgangen.**
2. Kamera-Komponente: `getUserMedia`, Rückkamera bevorzugen, Rahmen-Overlay.
   Kamera-Zugriff **hinter einem Interface** kapseln — in Phase 5 wird nur
   diese eine Implementierung gegen `@capacitor/camera` getauscht.
3. Matching-Modul, framework-frei und testbar: pHash, Hamming, Nearest Neighbor
   plus Zweitbester. Linearer Scan reicht bei ein paar hundert Kandidaten.
4. **Stabilitäts-Gate.** Erst akzeptieren, wenn 3 aufeinanderfolgende Frames
   dasselbe Ergebnis liefern (~100 ms). Killt Bewegungsunschärfe ohne jede
   Nutzeraktion.
5. **Entprellung.** Nach einem Treffer muss das Bild erst wieder leer oder
   deutlich anders werden, sonst zählst du dieselbe Karte zwanzigmal.
   Umsetzung: Hash des letzten Treffers merken, erst bei Distanz über
   Schwellwert wieder scharfstellen.
6. **Audio-Feedback.** Kurzer Ton bei sicherem Treffer, anderer Ton bei unsicher.
   Das ist der größte Einzelgewinn im ganzen Scanner — du schaust beim
   Durchziehen nicht auf den Bildschirm.
7. **Undo-Stack statt Dialoge.** Fehler passieren lassen. Am Ende eine
   Review-Ansicht: alle unsicheren Fälle plus die letzten N Treffer,
   jeweils korrigierbar. `Strg+Z` und Wisch-Geste rückgängig.
8. OCR-Zweig (nur wenn Spike 0.3 es rechtfertigt): tesseract.js, auf das
   Nummernfeld beschränkt, Zeichensatz auf Ziffern plus erwartete Buchstaben
   eingeschränkt, Ergebnis gegen die Kandidatenliste gematcht.
9. **Foil- und Variantenbehandlung.** pHash auf dem Artwork kann Foil nicht von
   Non-Foil unterscheiden. Konsequenz: **pHash bestimmt ausschließlich die
   `cardId`** (den Slug). Foil ist ein Schalter im Erfassungsmodus („die
   nächsten Scans sind Foils"), kein Erkennungsproblem. Alternate Art mit
   *abweichendem* Artwork bekommt einen eigenen Hash-Eintrag, der auf dieselbe
   `cardId` mit anderer `printingId` zeigt.
   Die offizielle DB trennt Karte und Printing bereits über `?printing=<uuid>`
   (§ 11.2) — übernimm diese UUIDs unverändert, statt eine eigene
   Variantenlogik zu erfinden.

#### Physischer Aufbau

Steht nicht im Code, entscheidet aber mehr als jede Optimierung:

- **Gerät aufstellen, nicht halten.** Beide Hände für die Karten.
- Fester Abstand ⇒ feste Kartengröße im Bild ⇒ Crop-Bereich hart kodierbar.
- Licht seitlich und diffus. Deckenlicht plus glänzende Karte legt den Reflex
  genau auf die Illustration.

#### Erwartungsmanagement

| Methode | pro Karte |
|---|---|
| Tastatur mit Autocomplete | 3–4 s |
| Flüssiges Scannen mit Audio | 1,5–2 s |

Also grob Faktor zwei, nicht Faktor zehn. Der eigentliche Gewinn ist die
geringere Ermüdung, nicht die Uhr.

**Definition of Done:** 24 Booster in unter 15 Minuten, unter 2 % Fehlerquote
nach Review, und der Durchlauf funktioniert ohne einen einzigen Klick zwischen
zwei Karten.

---

### Phase 4 — Stats-Service (der EDHREC-Teil)

Erst sinnvoll, wenn echte Decklisten existieren. Aber: **die Ingest-Pipeline
früh starten.** Daten lassen sich nicht rückwirkend sammeln, das Frontend darf
ein Jahr hässlich sein.

**Aufgaben:**

1. ✅ **Mechanismus steht** (Phase 4a): `pipeline/ingest_decks.py` liest slug-basierte
   Decklisten aus `pipeline/decklists/*.json`, verwirft illegale (Port unserer vier
   § 1-Regeln), aggregiert `df`/`co`/`n` → `app/src/data/coplay.json`. Stdlib-only.
   Die App führt das via `mergeCorpora` mit den eigenen Decks zusammen. **Noch offen:**
   die Volumen-Quelle. Interessanteste Kandidatin bleibt der Community-Simulator
   (cyberpunk-tcg-sim.online) mit Turnieren und Deckregistrierung — digitale Partien
   produzieren ein Vielfaches der Papierdecks; ToS/robots.txt vorher prüfen (§ 11).
   Roh und normalisiert getrennt speichern; die Decklisten-Dateien sind gitignored.
2. SQLite-Schema: `decks`, `deck_cards`, `tournaments`, `snapshots`.
   Rohdaten **niemals** überschreiben.
3. Aggregation, gruppiert nach **Legend-Triple** (das Commander-Äquivalent,
   nur besser: diskret, aufzählbar und gleichzeitig die harte Deckbau-Constraint):
   Kartenhäufigkeit, Inklusionsrate, Synergie-Score, typische Deckgröße.
   Formel und Bootstrap-Strategie in § 12.
4. FastAPI: read-only Endpunkte, aggressiv gecacht.
   `GET /triples/{a}/{b}/{c}` → Kartenstatistiken
   `GET /cards/{id}/triples` → mit welchen Triples wird die Karte gespielt
5. Docker-Container, hinter Reverse Proxy auf deinem Server unter Subdomain.
6. **Frontend-Integration:** die PWA liest read-only von der API.
   Die Sammlung wird **niemals** hochgeladen. Wenn du „fehlende Top-Karten
   für mein Triple" anzeigst, holst du die Statistik und schneidest sie
   **lokal** gegen deinen Bestand.

Das ist die Auflösung der Spannung zwischen „ohne Cloud" und Community-Statistik:
Aggregate kommen von außen, die Sammlung bleibt im Gerät. Und es ist ein
Verkaufsargument, das ein Account-basierter Anbieter nicht führen kann.

---

### Phase 5 — Native App via Capacitor

Nur wenn Phase 0.1 es nötig gemacht hat oder du in die Stores willst.

1. `npx cap init`, iOS- und Android-Plattform hinzufügen.
2. `@capacitor/camera` statt `getUserMedia`, hinter dem Interface aus Phase 3
   austauschen. Der übrige Code bleibt unverändert — das ist der ganze Grund
   für die saubere Trennung in § 4.
3. Store-Kram: Icons, Splash, Datenschutzerklärung. Letztere ist bei dir kurz:
   es werden keine Daten erhoben.

---

## 6. UI-Leitlinie

**Cyberpunk-Haut, langweiliges Skelett.**

Ein Sammlungstool ist ein dichtes Datenwerkzeug. Aggressive HUD-Chrome und
Glitch-Effekte machen beim ersten Öffnen Spaß und nerven ab Tag drei.

- Neunzig Prozent des Looks macht CSS: Scanlines, `clip-path` für schräge Rahmen,
  Glow, Farbversatz, Monospace-Akzente.
- Animation nur bei: Kartendetail-Reveal, Zählern (RAM, Eddies), Scan-Bestätigung,
  Validierungsfeedback.
- **Nie** bei: Listenrendering, Filtern, Suche, Schnellerfassung. Dort zählt
  ausschließlich sofortige Reaktion.
- Alle Effekte respektieren `prefers-reduced-motion`.
- Design-Tokens in CSS-Variablen an genau einer Stelle, damit der Skin
  austauschbar bleibt.

---

## 7. Testschwerpunkte

Nicht alles testen. Diese Bereiche schon:

- **Validator:** vollständige Abdeckung aller vier Regeln plus Grenzfälle
- **Solver:** feste Beispielsammlung als Fixture, erwartete Top-3 verankert
- **Dexie-Migrationen:** jede Migration mit Vorher-/Nachher-Fixture
- **pHash:** bekannte Karte, drei Aufnahmewinkel, Distanz unter Schwellwert
- **Import/Export:** Round-Trip-Test, byte-identisch

---

## 8. Lizenz und rechtliche Leitplanken

- **Keine Kartenbilder ausliefern.** Nur abgeleitete Daten (Hashes, Vektoren).
  Bilder per Link auf die offizielle Datenbank.
- Kartennamen und Regeltexte sind CDPR-IP. Für rein lokale Nutzung unkritisch,
  für eine öffentliche Subdomain relevant.
- Die offizielle Karten-DB läuft auf Fan-Infrastruktur (Netdeck), die einen
  expliziten „nicht affiliiert, nicht endorsed"-Disclaimer führt. Übernimm
  denselben Ansatz wörtlich im Footer.
- Vecteezy- und Shutterstock-Assets sind lizenzpflichtig. Für den Skin
  eigenes CSS statt Stock-Grafiken — ist ohnehin besser und leichter.
- Nutzungsbedingungen der Ingest-Quellen vor Phase 4 prüfen, `robots.txt`
  respektieren, Rate-Limit einbauen, User-Agent mit Kontaktadresse setzen.

### Ab Phase 4 zusätzlich (öffentliche Subdomain, Standort Deutschland)

- **Impressumspflicht** nach § 5 DDG. Gilt auch für ein nicht-kommerzielles
  Hobbyprojekt, sobald es öffentlich erreichbar ist.
- **Datenschutzerklärung.** Kurz, aber nicht weglassbar: die App erhebt nichts,
  aber der Reverse Proxy loggt IP-Adressen, und das sind personenbezogene Daten.
  Entweder Logging abschalten oder deklarieren.
- **Namenswahl.** `engram` ist bewusst ein eigenständiger Fachbegriff aus der
  Gedächtnisforschung (Semon, 1904) und kein Eigenname aus dem Cyberpunk-Kanon.
  Das ist der Grund für die Wahl — bitte bei späteren Umbenennungen beibehalten.
  Interne Modulnamen dürfen Lore-Anspielungen tragen, die öffentliche Marke nicht.
- **Repo-Lizenz bewusst wählen.** Wenn du nicht willst, dass jemand deinen
  Stats-Service als geschlossenen Dienst weiterbetreibt, ist AGPL das passende
  Werkzeug. MIT, wenn es dir egal ist. Nicht lizenzlos lassen.

---

## 9. Arbeiten mit Claude Code

### `CLAUDE.md` (ins Repo-Root, Startfassung)

```markdown
# engram

Local-first Sammlungs- und Deckbau-Tool für das Cyberpunk TCG.
Vollständiger Plan: siehe PLAN.md. Getroffene Entscheidungen: DECISIONS.md.

## Feste Regeln
- TypeScript strict. Kein `any` ohne Kommentar mit Begründung.
- `src/rules/` und `src/domain/` sind framework-frei. Keine React-Imports dort.
- Deckbau-Regeln kommen aus src/rules/ruleset.*.json, niemals hardcoden.
- Keine Kartenbilder im Repo oder im Bundle. Nur Hashes und externe Links.
- Kein LocalStorage. Persistenz ausschließlich über Dexie.
- Jede Änderung an Validator oder Solver braucht Tests im selben Commit.
- Antworten und Commit-Messages auf Deutsch.

## Befehle
npm run dev / build / test / typecheck

## Aktueller Stand
Phase: 0 (Spikes)
```

### Wie du die Sessions schneidest

Eine Aufgabe aus § 5 pro Session. Nicht mehr. Beim Start immer:
Ziel nennen, betroffene Dateien nennen, Definition of Done nennen.

Gutes Prompt-Muster:

> Phase 2, Aufgabe 1: Implementiere den Deck-Validator in
> `app/src/rules/validate.ts`. Regeln stehen in PLAN.md § 1 und im
> Ruleset-JSON. Reine Funktion, keine React-Abhängigkeit.
> Signatur: `validate(deck, ruleset, cardIndex) → { ok, violations[] }`.
> Schreibe die Tests zuerst, inklusive der in PLAN.md § 5 genannten Grenzfälle.
> Definition of Done: `npm test` grün, `npm run typecheck` sauber.

### Disziplin

- **Ein Commit pro Aufgabe**, Nachricht referenziert Phase und Aufgabennummer.
- Nach jeder Session `DECISIONS.md` ergänzen, wenn etwas entschieden wurde.
  Append-only, mit Datum. Das verhindert, dass ihr in Session 40 Dinge
  neu ausdiskutiert, die in Session 6 geklärt waren.
- Bei Architekturfragen: erst in `DECISIONS.md` schreiben, dann implementieren.
- Nach Phase 1 einmal `/compact` oder frischen Kontext, sonst schleppst du
  Setup-Details endlos mit.

---

## 10. Reihenfolge, kompakt

```
0.1  iOS-Kamera-Spike            ← zuerst, alles hängt daran
0.4  Synthetisches Fixture       ← billig, nimmt 0.2 vom kritischen Pfad
0.2  Datenquelle klären          ← Timebox 2 Wochen, dann Fallback
0.3  Kartenlayout prüfen
1    Sammlungstracker (Export zuerst!)
2    Validator + Legend-Solver   ← hier liegt der eigentliche Wert
4a   Ingest-Pipeline starten     ← Mechanismus steht; Quelle noch offen
3    Scanner
4b   Stats-API + Frontend-Anbindung
5    Capacitor
```

Phase 4a bewusst vorgezogen: die Pipeline läuft im Hintergrund und sammelt,
während du an Phase 2 und 3 arbeitest. Alles andere kannst du später nachholen,
verpasste Decklisten nicht.

---

## 11. Woher kommen die Kartendaten?

**Stand der Recherche:** NetDeck betreibt die Kartendatenbanken für mehrere TCGs
inklusive Cyberpunk und bewirbt sich ausdrücklich als Infrastrukturpartner für
Publisher. Eine **öffentlich dokumentierte API gibt es aber nicht** — weder auf
der Startseite noch im Footer findet sich ein Entwickler- oder API-Bereich.
Plane also nicht damit, dass die Daten einfach abrufbar bereitliegen.

Reihenfolge, in der du das angehst:

### 1. Nachfragen (zuerst, kostet einen Abend)

WeirdCo und NetDeck direkt anschreiben. Kleiner Publisher, brandneues Spiel,
funktionierendes Fan-Tooling liegt in ihrem Interesse. Frag konkret nach einem
Datenexport oder API-Zugang und beschreib in drei Sätzen, was du baust und dass
du keine Kartenbilder ausliefern willst. Die Erfolgswahrscheinlichkeit ist
deutlich höher, als man denkt, und ein „ja" spart dir alles Weitere.

### 2. Die offizielle Datenbank: `cyberpunktcg.com/cards` (Primärquelle)

Abgerufen und geprüft. Das ist die Hauptquelle, hier die konkreten Befunde:

**Umfang:** Set 1 umfasst **150 Karten**, ausgeliefert in 3 Seiten à 60.
Diese Zahl kalibriert das ganze Projekt: der komplette Pool passt mühelos in
ein Context Window, der pHash-Index ist wenige Kilobyte groß, und selbst
vollständige Handerfassung wäre ein Wochenende statt eines Monats.

**URL-Struktur:**

```
Liste:   https://cyberpunktcg.com/cards            (+ Paginierung, 60/Seite)
Karte:   https://cyberpunktcg.com/cards/{slug}?printing={uuid}

Beispiel:
  /cards/adam-smasher-ender-of-legends?printing=a9c1137e-2e33-4293-9dcc-9351c9a0bbee
  /cards/v-streetkid?printing=3fc63c58-5954-4744-a5af-047bfc5cb159
```

**Das ist die wichtigste Einzelerkenntnis:** die Datenbank trennt bereits
zwischen **Karte** (`slug`) und **Printing** (`uuid`). Genau die Unterscheidung,
die im Scanner-Abschnitt (Phase 3, Aufgabe 9) für Foils und Alternate Art nötig
ist — sie ist stromaufwärts schon modelliert. Übernimm sie unverändert:
`slug` → `Card.id`, `printing`-UUID → `Printing.id`. Erfinde keine eigene
Variantenlogik.

**In der Listenansicht direkt verfügbar:** Name, Subtitle, Typ
(LEGEND / UNIT / GEAR / PROGRAM), COST, PWR, RAM. Achtung: **Felder sind
optional.** Mehrere Legends zeigen weder COST noch PWR, mindestens eine
(Rebecca — Having a Moment) auch kein RAM. Das Schema muss nullable sein,
sonst bricht der Import an Tag eins.

**Den JSON-Endpunkt suchen.** Die Filtermaske (Farbe, Typ, Tags, Cost, Power,
RAM, Eddies, Set, Rarity) ist eine SPA-Oberfläche, dahinter liegt ein
JSON-Backend — laut Footer betrieben von NetDeck. Devtools auf, Network-Tab,
einen Filter setzen, den tatsächlichen Request ablesen. Das ist der schnellste
Weg zur „API", die es offiziell nicht gibt.

**Vier weitere Quellen auf derselben Domain, alle relevant:**

| Pfad | Wofür |
|---|---|
| `/comprehensive-rules` | Autoritative Regelquelle für `ruleset.json` (§ 1) **und** Keyword-Glossar als Kontext für die LLM-Extraktion (§ 12) |
| `/errata` | Karten werden korrigiert. Die Pipeline muss das periodisch prüfen, sonst driftet dein Cache |
| Print & Play Decks | Fertige Decklisten vom Designer — als Seed für das Synergie-System, als realistische Test-Fixtures und als Vorlage für den Starter-Quickadd |
| `/op` und Melee | Turnierdaten für den Ingest in Phase 4a |

**Vor dem Ziehen:** `cyberpunktcg.com/terms-of-service` lesen. Die Seite trägt
einen expliziten CD-PROJEKT-RED-Lizenzvermerk im Footer — die Daten sind
nicht herrenlos. Für lokale Nutzung unkritisch, für ein öffentliches Repo
siehe die Leitplanken am Ende dieses Abschnitts.

### 3. Der Simulator (der unterschätzte Weg)

`cyberpunk-tcg-sim.online` ist ein spielbarer Browser-Simulator. Ein Simulator
**muss** vollständige Kartendaten mitsamt Regeltexten client-seitig vorliegen
haben, sonst funktioniert er nicht. Diese Daten liegen fast immer als
JSON-Bundle im Asset-Verzeichnis. Das ist oft der vollständigste und am
saubersten strukturierte Datensatz, der öffentlich erreichbar ist.

### 4. Selbst erfassen

Du besitzt zwei Displays und beide Starter. Ein paar hundert Karten sind
mühsam, aber endlich — und für den Scanner brauchst du ohnehin eigene
Aufnahmen jeder Karte für den pHash-Index. Wenn du beim Fotografieren gleich
die Felder mit erfasst, fällt Weg 4 als Nebenprodukt von Phase 3 an.
Als Rückfallebene absolut tragfähig.

### Leitplanken

- Nutzungsbedingungen und `robots.txt` prüfen, bevor du Weg 2 oder 3 gehst.
- Rate-Limit einbauen, User-Agent mit Kontaktadresse setzen.
- Einmal ziehen und lokal cachen, nicht bei jedem Build neu.
- Kartendaten **nicht weiterverteilen**. Lokale Nutzung ist etwas anderes als
  ein öffentliches Repo mit `cards.json` darin. Wenn das Projekt öffentlich
  wird, gehört die Datei in `.gitignore` und wird beim Build vom Nutzer selbst
  gezogen.

---

## 12. Woher kommt das Synergie-System?

Kurze Antwort: **nirgendwoher — das ist kein Algorithmus, den man beschafft,
sondern ein Datenkorpus, den man ansammelt.**

### Was EDHREC tatsächlich rechnet

Der Synergie-Score ist verblüffend simpel:

```
synergy(Karte, Commander) = P(Karte | Decks mit diesem Commander)
                          − P(Karte | alle Decks im Format)
```

Inklusionsrate innerhalb der Gruppe minus Grundrate im Gesamtformat.
Hoher Wert heißt: „diese Karte wird *hier gezielt* gespielt, nicht bloß,
weil sie allgemein stark ist."

Das war's. Keine Magie, kein Modell. Der gesamte Wert steckt im Korpus.

### Das Problem

Es gibt noch keinen Korpus. Set 1 ist gerade erst im Umlauf. Ohne Decklisten
zeigt eine EDHREC-Nachbau-Seite an Tag eins eine leere Tabelle.

### Die Lösung: zwei Synergiebegriffe, klar getrennt

**A. LLM-generierte Synergie — funktioniert ab Tag eins, ohne eine einzige Deckliste**

Der entscheidende strukturelle Vorteil: **der gesamte Kartenpool passt in ein
Context Window.** Set 1 hat 150 Karten, das sind grob 10k Token. Für MTG war das
mit 100.000 Karten nie machbar — hier schon. Regeltexte per Regex zu parsen ist
dagegen brüchig und unnötig.

**Die zentrale Designregel: Extraktion und Urteil strikt trennen.**

| | Was | Zuverlässigkeit |
|---|---|---|
| Extraktion | Regeltext → strukturierte Merkmale | hoch, verifizierbar |
| Urteil | „wie stark ist diese Karte?" | niedrig, ungeprüfte Vermutung |

Das Modell macht **nur die Extraktion**. Den Score rechnet Code.

*Schritt 1 — Extraktion (LLM, offline, batch):*

```json
{
  "cardId": "wnc-042",
  "provides":    ["GEAR", "EVEN_GIG_VALUE"],
  "requires":    ["SPENT_UNIT_ON_BOARD"],
  "caresAbout":  ["STREET_CRED_PARITY"],
  "enablesTags": ["NETRUNNER"],
  "payoffFor":   ["DIVERGENT_GIG_VALUES"],
  "evidence":    "wörtliche Textstelle, die das belegt"
}
```

Das ist Leseverständnis, nicht Bewertung. Das `evidence`-Feld ist Pflicht:
es erzwingt Belegbarkeit und macht Halluzinationen sofort sichtbar.

*Schritt 2 — Scoring (deterministischer Code):*

Karte A `provides` X, Karte B `requires` oder `payoffFor` X ⇒ Kante.
Gewichtung über Seltenheit des Merkmals im Pool (ein Merkmal, das 80 % der
Karten liefern, ist keine Synergie). Danach Filterung über RAM-Machbarkeit:
Paare, die in keinem legalen Legend-Triple gemeinsam spielbar sind, fliegen raus.

Vorteil dieser Trennung: der Score ist debugbar, nachvollziehbar und
anpassbar, ohne das Modell erneut laufen zu lassen. Und du kannst dem Nutzer
begründen, *warum* zwei Karten zusammenpassen — statt „das Modell sagt so".

*Pflicht-Validierung nach dem LLM-Lauf:*

- Jede referenzierte `cardId` muss im Kartenindex existieren. Sonst verwerfen.
- Merkmalsnamen gegen ein festes Vokabular prüfen. Kein Freitext.
- `evidence` muss ein echtes Teilstring-Match im Regeltext der Karte sein.
- **Self-Consistency:** dreimal laufen lassen, nur Merkmale behalten, die in
  mindestens zwei Läufen auftauchen. Billigster verfügbarer Rauschfilter.

*Betriebsmodell:*

Das LLM ist ein **Build-Schritt, kein Request-Pfad.** `pipeline/extract_features.py`
läuft einmal pro Set-Release, Ergebnis ist ein statisches `synergy.json`, das mit
der App ausgeliefert wird. Damit bleibt die App vollständig offline, reproduzierbar
und kostenfrei im Betrieb. Bei **150 Karten** in Batches zu 20 sind das 8 Calls
mal drei Läufe — Kosten im Cent-Bereich, Laufzeit wenige Minuten.

Als Systemkontext für die Extraktion gehören die **Comprehensive Rules**
(§ 11.2) mit in den Prompt. Ohne das Keyword-Glossar rät das Modell bei
spielspezifischen Begriffen; mit dem Glossar liest es sie korrekt.

Kein Fine-Tuning. Das ist ein Prompt-plus-Schema-Problem, kein Trainingsproblem.

*Ehrlichkeitsgebot in der UI:*

Das ist eine **Vorhersage aus Kartentext, keine Messung.** Reale Metas widerlegen
solche Prognosen regelmäßig — die besten Decks stehen oft auf Interaktionen, die
beim Lesen niemand vorhergesehen hat. Also klar beschriften und so bauen, dass
echte Daten aus C die Vorhersage überschreiben, sobald sie existieren.

**B. Constraint-Synergie — dein Alleinstellungsmerkmal, ebenfalls ohne Daten**

Das RAM-System erzeugt Synergie aus den Regeln selbst:

> Karte X mit RAM 4 verlangt mindestens 4 grünes Legend-RAM. Das erzwingt ein
> grünlastiges Triple, das wiederum Y und Z freischaltet — und W ausschließt.

Rein deterministisch, null Datenbedarf, und **niemand sonst kann das bauen**,
weil niemand sonst RAM als Budget statt als Filter modelliert.

**C. Statistische Synergie — kommt später, ersetzt A schrittweise**

Sobald der Ingest aus Phase 4a läuft, schiebst du echte Inklusionsraten
hinein. Deshalb steht im Plan, dass die Score-Funktion **hinter einem
Interface** liegt: `score(card, triple, context) → number`. A, B und C sind
austauschbare Implementierungen, später ein gewichteter Mix.

### Zwei Fallen bei kleinen Datenmengen

1. **Mindest-n vor Prozentanzeige.** Bei 4 Decks für ein Triple ist eine
   Inklusionsrate von 75 % reines Rauschen. Setz eine Schwelle (Vorschlag: n ≥ 20)
   und zeig darunter nur die rohen Zahlen, keine Prozente.
2. **n immer sichtbar anzeigen.** „73 % (n=112)" ist ehrlich, „73 %" ist es nicht.
   EDHREC hat exakt dieses Problem bei seltenen Commandern.

### Bootstrap-Reihenfolge

```
sofort      A + B ausliefern, in der UI ehrlich als
            „vorhergesagte Synergie" beschriftet, nicht als Statistik
ab Phase 4a Ingest aus dem Community-Simulator (Turniere mit
            Deckregistrierung), sowie Beta- und Retail-Events
opt-in      eigene Nutzer: freiwilliges, anonymes Teilen einer
            Deckliste. Standardmäßig aus. Kleine Menge, aber sauber.
später      Gewichteter Mix. Sobald für ein Triple genug echte Decks
            vorliegen, verdrängt C die Vorhersage aus A schrittweise.
```

Interessantes Nebenprodukt: sobald C läuft, kannst du **A gegen C evaluieren.**
Wo lag die Vorhersage daneben? Das ist einerseits guter Content, andererseits
ein sauberes Signal dafür, wo das Spiel anders funktioniert, als der Kartentext
vermuten lässt.

Der Kern bleibt: der Score ist trivial, der Korpus ist der Burggraben.
Deshalb Phase 4a so früh wie möglich starten.

---

## 13. Bewusst nicht im Plan

Damit diese Punkte nicht als Lücke wirken, sondern als Entscheidung:

| Thema | Status | Begründung |
|---|---|---|
| Tausch- und Wunschliste | verschoben nach Phase 2+ | Datenmodell trägt es bereits (Dubletten ergeben sich aus `quantity`), aber es lenkt vom Kern ab |
| Preisdaten | draußen | eigene Datenquelle, eigene Rechtslage, kein Bezug zum Deckbau |
| Kartenpreis-Alerts, Marktplatz | draußen | anderes Produkt |
| Mehrbenutzer, Accounts, Sync | frühestens Phase 4 | widerspricht der local-first-Prämisse, nur bei echtem Bedarf |
| Sealed- und Draft-Simulation | draußen | großer Aufwand, kein Bezug zu deinem Problem |
| Mobile-App im Store | Phase 5, optional | die PWA deckt deinen Eigenbedarf vollständig ab |

### Offene Risiken (bewusst ungelöst)

1. **Kartendaten-Zugang.** Das größte Einzelrisiko des Projekts. Spike 0.2 mit
   Timebox, Fallback ist Selbsterfassung. Nicht schön, aber nicht blockierend.
2. **Beta-Regeln ändern sich.** Abgefedert über versionierte Rulesets. Rechne
   trotzdem damit, dass zwischen Beta und Retail etwas kippt.
3. **NetDeck baut dasselbe.** Sie sitzen auf Daten, Publisher-Beziehung und
   Organized Play. Deine Verteidigung ist nicht Geschwindigkeit, sondern
   die local-first-Position und spielspezifische Analyse, die ein
   Mehrspiel-Anbieter nicht baut.
4. **Du verlierst nach Phase 2 die Lust.** Der wahrscheinlichste Ausgang bei
   Hobbyprojekten. Deshalb ist Phase 1 so geschnitten, dass sie **allein schon
   nützlich ist.** Wenn danach Schluss ist, hast du trotzdem einen
   funktionierenden Sammlungstracker.
