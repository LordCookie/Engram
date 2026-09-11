# engram

Local-first Sammlungs- und Deckbau-Tool für das Cyberpunk TCG.
Vollständiger Plan: siehe [PLAN.md](PLAN.md). Getroffene Entscheidungen: [DECISIONS.md](DECISIONS.md).

## Feste Regeln
- TypeScript strict. Kein `any` ohne Kommentar mit Begründung.
- `app/src/rules/` und `app/src/domain/` sind framework-frei. Keine React-Imports dort.
- Deckbau-Regeln kommen aus `app/src/rules/ruleset.*.json`, niemals hardcoden.
- Keine Kartenbilder im Repo oder im Bundle. Nur Hashes und externe Links.
- Kein LocalStorage. Persistenz ausschließlich über Dexie.
- Jede Änderung an Validator oder Solver braucht Tests im selben Commit.
- Antworten und Commit-Messages auf Deutsch.

## Projektstruktur
- `app/` — Vite-Frontend (React 18, TypeScript strict, Tailwind, Vitest).
- `pipeline/` — Python-Skripte (Kartendaten, pHash, Ingest). Ab Phase 1/3/4.
- `service/` — FastAPI + SQLite. Ab Phase 4.

## Befehle (im Ordner `app/`)
```
npm install
npm run dev        # Dev-Server (http://localhost:5173)
LAN=1 npm run dev  # Heimnetz-Freigabe: HTTPS + 0.0.0.0:5174 (nötig für Handy-Kamera,
                   # da getUserMedia nur im secure context läuft; Cert ist selbstsigniert)
npm run build      # Typecheck + Produktionsbuild
npm run test       # Vitest einmalig
npm run typecheck  # nur Typecheck
```

## Umgebung
- Node 20.9, npm 10, git, Python 3.8, Java 25 (Android-Studio-JBR) vorhanden.
- Android Studio liegt unter `D:\Andriod Studio` — erst in Phase 5 (Capacitor) relevant.

## Aktueller Stand
Geschlossener Kreis läuft auf **echten 151 Karten**: erfassen → Sammlung → Solver.
- Phase 2: Validator (`rules/validate.ts`) + Legend-Solver (`domain/solver.ts`).
- Phase 1: Dexie-Persistenz (`db/db.ts`), Suche (`domain/search.ts`),
  Schnellerfassung + Ansichten (`ui/*`), JSON-Export/Import (`domain/collectionIo.ts`).
- **Spike 0.2 gelöst:** Datenquelle ist die NetDeck-API. `pipeline/fetch_cards.py`
  zieht sie nach `app/src/data/cards.json` + `printings.json` (beide gitignored).
- 65 JS-Tests + 3 Python-Tests grün.

- **Synergie (§ 12):** `feature-vocab.json` (kontrolliertes Vokabular, Quelle) +
  `features.json` (gitignored, CDPR-IP); Scoring in `domain/synergy.ts`, Ansicht
  Tab „Synergie" (`ui/SynergyPanel.tsx`). Suche auch per Nummer.
  **`features.json` kommt jetzt aus einem kuratierten LLM-Lesedurchgang** (Opus,
  alle 151 Regeltexte, kein API-Key): Quelle `pipeline/features_curated.json`
  (gitignored) → `pipeline/build_features.py` (validiert streng, fügt Tags an).
  135/151 Karten mit Merkmalen; „even number"=Street Cred korrekt, Anti-Steal
  nicht als Steal-Payoff, `provides FIGHT` neu. Ehrlichkeitsgebot bleibt:
  Vorhersage aus Kartentext, keine Statistik. Reihenfolge der Merkmalsquellen:
  `bootstrap_features.py` (Heuristik-Fallback) < `build_features.py` (kuratiert,
  Standard) < `extract_features.py` (reproduzierbarer API-Lauf für neue Sets,
  nutzt `pipeline/glossary.md`).
- **Starter-Quickadd** (§ 5, Aufgabe 7): `starters.json` (The Heist, Embracing
  Power — Quelle: Simulator-Presets = offizielle Retail-Listen), `domain/starters.ts`,
  `db.addCounts`, Button-Panel im Tab „Erfassen". Je 40 Deckkarten + 3 Legends.
- **Deckeditor + Sammlungsmodus** (§ 5, Aufgabe 2/3): Tab „Deck"
  (`ui/DeckEditor.tsx`) mit Live-Statistik (`domain/deckStats.ts`), Entwurf
  (`domain/deckDraft.ts`). Validator akzeptiert `ValidatableDeck` (Entwurf).
- **Mehr-Deck-Verwaltung:** beliebig viele benannte Decks in Dexie
  (`db.listDecks`/`createDeck`/`deleteDeck`/`ensureCurrentDeck`, Zeiger in `meta`).
  Deck-Leiste im Editor (wählen/anlegen/umbenennen/duplizieren/löschen).
- **Deck-Textformat** (§ 5, Aufgabe 8): MTG-artiges `.txt` Export/Import
  (`domain/deckText.ts`, `ui/DeckTextPanel.tsx`), Legends am Typ erkannt.
- **Swap-Analyse** (§ 5, Aufgabe 5): `domain/swap.ts` + Panel im Deckeditor.
  **Phase 2 ist damit vollständig.**
- **Synergie im Solver-Score** (§ 12 C): `makeSynergyScore(db, gewicht)`
  (`domain/synergy.ts`), im `SolverPanel` per **Regler Menge↔Synergie** (Gewicht
  0–2) stufenlos gewichtet. ScoreFn bleibt austauschbar.
- **Kartenbilder** (§ 6/§ 8): `data/cardImages.ts` holt frische signierte URLs
  von der NetDeck-API (source-URLs sind signatur-pflichtig/laufen ab), Anzeige via
  `<img>` vom offiziellen CDN — nur verlinkt, nichts gehostet. `ui/CardImage.tsx`
  (Platzhalter-Fallback). In Synergie/Deckeditor/Sammlung eingebaut.
  **Robust gegen die oft abstürzende NetDeck-API:** cache-first — zeigt sofort die
  zuletzt nach Dexie gespiegelten URLs (SW-Cache matcht am Pfad), aktualisiert dann
  im Hintergrund mit **8 s-Timeout** (eine hängende/tote API blockiert nicht mehr).
  Dauerhaft offline via Knopf „Alle Bilder offline laden". **`pipeline/fetch_images.py`**
  (stdlib) lädt alle Bilder in `pipeline/card-images/` (**gitignored**) — die „trotzdem
  pullen"-Möglichkeit fürs lokale Offline-Archiv; § 8: **nie ins Repo committen**
  (CDPR-Artwork).
- **Empirische Synergie** (§ 12 C, Phase 4a): `domain/coplay.ts` (rein, getestet)
  misst Ko-Vorkommen (Lift) über ein Deck-Korpus. Quelle **First-Party**: 2 Starter
  + eigene Dexie-Decks (`data/deckCorpus.ts`, reaktiv), **kein Netzwerk/Scraping**.
  **Nur legale Decks zählen** (Filter über `validate()`). Legends sind Teil der
  Kartenmenge (Legend-Triple = stärkstes Signal). In `SynergyPanel` als eigene
  Sektion „Zusammen gespielt" mit Stützzahlen + Small-N-Hinweis; vorhergesagte
  Partner tragen „✓ empirisch", wenn real zusammen gespielt. Getrennt von der
  Vorhersage (`synergy.ts`) — Ehrlichkeitsgebot § 12.
- **Empirisch im Solver-Score** (§ 12 C): `makeCoPlayScore(corpus, gewicht)` +
  `coPlayLift` (`domain/coplay.ts`), gleiche Form wie `makeSynergyScore`.
- **Normalisierte Kombination** (§ 12 C, Abschluss): `makeCombinedScore`
  (`domain/combinedScore.ts`) mischt Vorhersage × Empirie fair — beide Signale
  vorab pool-weit auf [0,1] normalisiert (Rohskalen verschieden), dann `blend`,
  mit Renormalisierung bei fehlender Quelle. Im `SolverPanel` **Dreifach-Umschalter
  Vorhersage · Empirisch · Kombiniert** + **Blend-Regler** (Vorhersage↔Empirisch)
  im Kombi-Modus. **§ 12 C ist damit vollständig.**
- **Löschen-Knöpfe:** Sammlung („−"/„✕" je Karte, `addToCollection(-1/-qty)`),
  Deckeditor (Karten haben „✕" via `setCard(…,0)`, nicht nur Legends).
- **Scanner** (§ 6, Phase 3) — **OCR-Ansatz wie ManaBox** (der frühere Bild-Hash
  war für echte Fotos zu schwach, entfernt): `domain/nameMatch.ts` (rein/getestet,
  Fuzzy-Namensabgleich) + `ui/ScannerPanel.tsx` (Tab „Scanner"): `tesseract.js`
  liest den Kartennamen aus dem Kamerabild → Abgleich gegen die 151 Namen, Top-5.
  **Sammlernummer als Entscheider** (nur pro Farbe eindeutig → an Namens-Treffer
  gekoppelt), **Scan-Korb → „In Sammlung übernehmen"**. **Bulk (Live-Modus):** „sicheren
  Treffer automatisch in den Korb" mit **Frame-Konsens 2/3** (nur live; gegen Wackel-/
  Foil-Ausreißer beim Durchblättern — manuelles „Scannen" übernimmt sofort) + klare
  „✓ … in den Korb"-Rückmeldung. Rahmen-/Zoom-Regler, zeigt
  den erkannten Text (zum Tunen). Kamera nur im eigenen Browser (localhost/HTTPS =
  secure) oder in der **nativen App** (CAMERA-Permission + Torch), nicht im Vorschau-
  fenster. LAN fürs Handy: `LAN=1 npm run dev` (HTTPS 5174, `@vitejs/plugin-basic-ssl`).
  **OCR-Tuning:** Vorverarbeitung binarisiert (nach Kontrast-Streckung/Invert) —
  **Otsu** (global) für die Ganzkarte, **adaptiv (Bradley/Integralbild)** für zwei
  Namensbänder (**Mitte** = Grundlayout, **oben** = Name-oben-Karten). Die drei Reads
  werden kombiniert und gegen die 151 Namen gematcht. **Geschwindigkeit (Handy):**
  Die Reads laufen **parallel über einen Worker-Pool** (`createScheduler` + bis zu 3
  Worker = mehrere CPU-Kerne; `tesseract.js` hat **kein** GPU-Backend, WASM/CPU) statt
  seriell. Der **Live-/Bulk-Modus** liest nur **Mitte + Ganzkarte** (die Ganzkarte
  behält die Sammlernummer als Entscheider; das obere Alt-Art-Band entfällt live) →
  mehr Frames/s, Konsens schneller; **manuelles „Scannen" bleibt voll 3-Pass**. Das
  Live-Intervall ist von fixen 2200 ms auf eine **einstellbare „Scan-Pause"**
  (Regler, Default 800 ms; Untergrenze = OCR-Zeit via `busy`-Schutz) entkoppelt —
  kleine Pause = OCR-gebundenes Back-to-Back, größere Pause **bremst gezielt die
  Auto-Übernahme**, damit sie beim schnellen Blättern nicht durchrattert. `nameMatch`
  faltet **OCR-Verwechsler** (0/O, 1/I, 5/S, 8/B) beidseitig (`foldOcr`), die Sammlernummer
  bleibt auf dem Roh-Text. **Kamera fordert kontinuierlichen Autofokus an** (`focusMode:
  continuous`, falls verfügbar) — das war der entscheidende Handy-Fix. **Tipp-zum-
  Fokussieren:** ein Tipp aufs Videobild richtet den Autofokus gezielt auf die Stelle
  (`pointsOfInterest` + kontinuierlich, sonst `single-shot` → danach zurück auf
  kontinuierlich) — gegen Glanz/Foils, mit Fokus-Ring als Feedback. **Rein additiv:**
  `try/catch`, und kann das Gerät es nicht, bleibt der kontinuierliche Autofokus
  unangetastet (der Knopf/Hinweis erscheint nur bei fähiger Kamera). **Gelernt:** mit
  einer Webcam (flach/nah/scharf) trifft die Erkennung ~100 %; die Handy-Schwäche lag an
  der **Aufnahme** (Fokus/Glanz/Framing), nicht am Algorithmus — Autofokus + „eine Karte
  formatfüllend, ruhig halten, gegen Glanz kippen" schließt die Lücke. (Ein früherer
  Versuch mit Nummern-Band/Sweep/Schärfe-Gate/Frame-Konsens verschlechterte es durch
  Text-Rauschen und wurde verworfen.)
- **Deckbau-Synergie & Filter** (§ 5/§ 12): `domain/deckSynergy.ts` (rein/getestet)
  — `suggestAdditions` (RAM-legale, synergistische Vorschläge zu den Legends) +
  `deckSynergyRating`. Im Deckeditor Sektion „Synergie" (Vorschläge mit „+"-Einbau)
  + **Filter** (Farbe/Typ/nur-legal/nur-Bestand); Erklärung `ui/SynergyInfo.tsx`
  auch in der Synergie-Ansicht. Löschen-„✕" in Sammlung & Deckeditor.
  **Vorschläge nutzen jetzt das Co-Play-Korpus** (`useCorpus` → Meta + eigene Decks):
  optionales `corpus` in `suggestAdditions` boostet & markiert Karten, die laut echten
  Decks mit den Legends zusammen laufen (Tag „✓ Meta N", `empirical`), auch solche,
  die die Textvorhersage übersieht — getrennt ausgewiesen (Ehrlichkeit). Ohne Korpus
  unverändert. Neu: **„Auf 40 auffüllen"** (`fillToMin`) — füllt das Deck mit den besten
  Vorschlägen (≤3 Kopien, RAM-legal, im Sammlungsmodus nur Bestand).
- **Kartenbilder offline** (§ 8-konform, nur lokaler Cache): Workbox-Runtime-Cache
  in `vite.config.ts` für die CDN-Bilder (`CacheFirst`, `ignoreSearch` gegen die
  wechselnde Signatur, opaque `statuses:[0,200]`, `devOptions` an). `cardImages.ts`
  spiegelt die slug→URL-Tabelle nach Dexie (`meta`) für den Offline-Fallback.
  `ui/OfflineImagesPanel.tsx` (Tab „Erfassen") lädt alle Bilder einmalig in den
  Cache; `CardImage` fällt bei Ladefehler sauber auf den Platzhalter.
- **UX-Struktur** (`App.tsx`): 6 Bereiche **Scannen · Erfassen · Sammlung · Deck ·
  Synergie · ⚙ Mehr**; auf Mobil unten fixierte Nav. Sammlung mit Suche/Filter/
  Sortierung; **einklappbar** (Knopf im Kopf, Zustand in `App` gehalten → bleibt beim
  Tab-Wechsel, kein LocalStorage) — eingeklappt zeigt sie nur die Zahlen, damit man
  schnell zum **Legend-Solver** darunter kommt. Wiederverwendbares **Kartendetail**
  (`ui/CardDetail.tsx`, Bild + Regeln + Werte + Synergie-Partner). Backup/Offline unter
  „Mehr". Korb-Animation im Scanner.
- **Combos** (§ 12): `domain/synergy.ts` `topCombos` (automatisch, stärkste Paare) +
  **kuratierte benannte Combos** (`data/combos.json`, committed, eigene Erklärungen §8)
  in der Synergie-Ansicht („Benannte Combos" + „Weitere Combos (automatisch)").
- **Ingest-Pipeline** (§ 12 C, Phase 4a — Mechanismus steht, quellen-agnostisch):
  `pipeline/ingest_decks.py` (stdlib-only) liest slug-basierte Decklisten aus
  `pipeline/decklists/*.json`, verwirft illegale (Python-Port der vier § 1-Regeln,
  `is_legal`), aggregiert `df`/`co`/`n` → `app/src/data/coplay.json` (gitignored).
  Die App lädt es **optional** (`data/coplayCorpus.ts`, `import.meta.glob` eager) und
  führt es via `mergeCorpora` (`domain/coplay.ts`) mit dem Live-Korpus (Starter +
  eigene Decks) zusammen — fehlt die Datei (frischer Clone/CI), baut die App
  unverändert. `SynergyPanel` weist die Ingest-Zahl gesondert aus. Decklisten +
  `coplay.json` sind gitignored (eigene/fremde Deckdaten).
  **Volumen-Quelle angebunden:** `ingest_decks.py` liest jetzt ZUSÄTZLICH die von
  `sim/pull_meta.ts` gezogenen Online-Meta-Decks aus `sim/meta-decks/*.json` (gleiches
  slug-Format; `index.json` übersprungen). Damit fließt echte Meta-Co-Play in die App:
  aktuell **10 Meta-Decks → `coplay.json` (n=10)**, häufigste Paare = Meta-Staples
  (River Ward, Zetatech Faceplate, Safety Override …). Refresh:
  `cd sim && npm run pull-meta` → `python pipeline/ingest_decks.py`. Beide Ordner
  bleiben gitignored (fremde Deckdaten, § 8 = nur Slugs/Zahlen).
  **Eigene Decks als Korpus-Futter (Dev-Tool, kein App-Feature):**
  `sim/import_decklists.ts` (`npm run import-decklists`) liest MTG-artige `.txt`-
  Decklisten (das Format, das die App exportiert) aus `sim/deck-import/` (oder als
  Datei-Argumente), parst sie mit `parseDeckText`, prüft die Legalität (`validate`,
  nur legale fließen ein), meldet unauflösbare Zeilen und schreibt slug-basierte
  JSONs nach `pipeline/decklists/`. Dann `ingest_decks.py` (oder `--ingest`). So
  speist man eigene Decks stapelweise ins empirische Korpus. `sim/deck-import/`
  gitignored. **Quelle cyberpunkmeta.org ist bei ~8 Decks gedeckelt** (Sitemap) —
  eigene Decks sind der realistische Hebel für mehr empirisches Signal.
- **Simulationsmodus / Playtest** (Roadmap „Proberunden") — **manuelles** Playtest
  wie ManaBox: echte Zonen (Deck/Hand/Feld/Trash + verdeckte Legends), du bewegst
  Karten selbst, **keine erzwungene Regel-Engine** (Ehrlichkeit). Reine Maschine
  `domain/playtest.ts` (getestet: Determinismus per Seed, Ziehen, Mulligan, Zug-
  wechsel, Zonenwechsel, Kartenerhaltung), Parameter aus `rules/playtest.v1.json`
  (`rules/playtest.ts`): Starthand 6, 1 ziehen/Zug, +1 Gig/Zug, **Gig-Ziel 7**
  (Beta-Variante 6/7 → als Parameter, nicht erzwungen). UI `ui/PlaytestPanel.tsx`
  im Tab **„Mehr"**; spielbar **nur mit legalen eigenen Decks + Startern** (Filter
  über `validate()`). Start-Phase = bereitstellen → ziehen → +Gig; Karten per
  **Drag & Drop** zwischen Hand/Feld/Trash/Deck (Pointer-Events + `window`-Listener,
  touch-fähig — kein HTML5-DnD; Feldkarte **tippen** = spenden/bereit), „Call a
  Legend", Gig/Eddie-Zähler.
- **Konsolen-Test-Engine** (`sim/`, internes Dev-Werkzeug, **kein App-Feature**,
  nicht im Bundle/CI): grobes Heuristik-Modell, das Decks **deck-vs-deck** durchspielt,
  um Decks/Synergien in Szenarien zu vergleichen — kein regeltreuer Simulator. Läuft
  mit `tsx` (eigenes `package.json`), lädt die App-Domäne direkt (`../app/src/...`).
  Modi `decks`/`battle`/`game` + Schrittbetrieb `agent-init`/`agent-step`, über den ein
  **Subagent** eine Seite spielen kann. Unsere Synergie-Vorhersage fließt als Power-
  Bonus ein; im A/B-Test (`--synergy off`) verschiebt sie die Siegquote messbar
  (Heist vs Embracing Power: ~89 % → ~67 % ohne Synergie). `battle` spielt beide
  Sitzpositionen (Anzieh-Vorteil neutralisiert) und zählt **nach Rolle**, nicht nach
  Objekt-Identität (sonst bräche der Spiegel-Match). Anzieh-Malus (Regel „first player
  spends 2 Legends") als Parameter → Startvorteil im Modell ~66 % statt 76 %.
  **`npm run verify`** prüft die Engine: Determinismus, Schritt-Modus == Batch,
  Invarianten (Gigs≥0/Budget/Terminierung), Spiegel≈50 %, Dominanz, Monte-Carlo-
  Stabilität, Synergie-Monotonie — alle grün. 7 Engine-Tests (`npm test`, tsx).
  **Befund:** die Engine ist deck-dominiert (ein Subagent mit Baumsuche fand über
  6 Seeds keine Gewinnlinie fürs schwächere Deck → Heuristik ≈ optimal). Bleibt ein
  grober Proxy, kein Regel-Simulator. **`npm run build-decks`** konstruiert aus allen
  legalen Legend-Triples synergie-/kurvenoptimierte Decks (RAM-legal, `validate()`)
  und ermittelt per Rundenturnier die stärksten → `sim/decks/` (gitignored, .json für
  die Sim + .txt für den App-Import). Szenario-Decklisten + Läufe sind gitignored.
- **Kampf-Modell (`engine2.ts`, `--model v2`):** näher an den echten Regeln als der
  Proxy — Einheiten aufs Feld (mit **Lag**), **Angriff → Blocken → Kampf → besiegt**,
  Gig-Klau per Angriff (1 + Power/10), Keywords **Adrenaline/Blocker/Go Solo** und
  **echte Karteneffekte** aus dem Kartentext (`model.ts`, liest rules_text nur LOKAL):
  **Removal** (inkl. „spent"/„all"/„cost N or less"), **Spend-Rival** (gegnerische Einheit
  erschöpfen = Blocker-/Tempo-Denial), **Gig-Swing** (`{Play}` und `{Attack}` „decrease/
  gain a Gig"), **Power-Buff** und **Draw**. Programme werden als imperative Ein-Karten-
  Spells geparst. **`{Defeated}`-Trigger** (Draw-on-Death, z. B. Dexter/Jackie) sind
  modelliert: beim Besiegtwerden zieht der Besitzer (`onDefeated`, via `applyEffect` mit
  Akteur-Parameter). **Gear bleibt abstrahiert** — in diesem Set gibt **kein** Gear flache
  Power (reine getriggerte Utility → nichts sinnvoll Modellierbares); ebenso `{Quick}`/
  Reaktionen/Würfel (Ehrlichkeit). Eddies aus Legends + Ramp +
  Eddie-Quellen. Synergie entsteht aus echter Interaktion, kein flacher Bonus.
  `battle`/`game`/`build-decks` nehmen `--model v2`. **18 Kampf-Tests** (`engine2.test.ts`:
  Combat, Blocken, Removal, Spend-all, Gig-Swing `{Play}`/`{Attack}`, Buff, {Defeated}-Draw,
  Lag/Adrenaline, Determinismus, Spiegel≈50 %, Dominanz). **Effekt aufs Deck-Testen:** die
  3-Farben-Power-Piles verlieren ihren Riesenvorsprung, fokussierte (mono/2-farbige)
  Decks steigen; der offizielle Heist-Starter ist im Kampf-Modell das stärkste Feld-Deck
  (~68 %). Bleibt ein Modell (Einzeltexte/Reaktionen/Würfel abstrahiert), aber Interaktion
  zählt jetzt echt.
- **Meta-Test (`pull_meta.ts` + `eval_meta.ts`, `npm run pull-meta`/`eval-meta`):**
  zieht öffentliche Online-Meta-Decklisten (Default cyberpunkmeta.org, robots `Allow: /`;
  exburst.dev nennt `anthropic-ai` in robots → bewusst gemieden) in den **gitignoreten**
  Ordner `sim/meta-decks/` (HTML-Cache + slug-JSON + `index.json`; höflich: UA + Delay).
  **Discovery zuerst über die `sitemap.xml`** (kanonisch, robots nennt sie), dann die
  Listing-Seiten als Fallback. **Die Quelle veröffentlicht aktuell nur ~8 Decks** (das
  ist die Obergrenze der Sitemap) — mehr „echte Meta-Decks" gibt es dort schlicht nicht;
  ins Ingest-Korpus fließen zusätzlich `pipeline/decklists/` (aktuell zusammen n≈13).
  § 8: nur Slugs + Stückzahlen, keine Kartentexte/-bilder. `eval_meta` fährt eine Matrix
  (v2, mit 95%-CI), nimmt die Starter als **Kontrolle**, rankt die Meta-Decks intern und
  misst „Engine-Lesbarkeit" (Körper/Effekt vs. blinde Effekt-/Gear-/Control-Karten) →
  `sim/meta-decks/REPORT.md`. **Befund mit dem Effekt-Modell (10 Meta-Decks, je 1000
  Spiele):** eigene Ø **~69 %** (Top A 77,7 · Top C 73,9 · Top B 67,4 · Unique-1 67,2 ·
  Unique-2 59,8), Heist-Kontrolle **82,5 %**, schwacher Starter 69,3 %. Die Effekte haben
  den Abstand **verkleinert** (vor den Effekten: eigene 80,6 %) und die Meta-interne
  Spanne gestaucht (Spitze 70→59 %) — die Meta wehrt sich jetzt. Aber der Bias bleibt:
  auch die Starter schlagen die Meta klar, d. h. das **Zahlurteil** ist weiter kein reales
  Meta-Ranking; belastbar ist die **Kette** (ziehen→parsen→validieren→spielen).
- **Effekt-getunter Deckbau + „unique" Decks (`build-decks --model v2`):** `build.ts`
  schreibt neben Top A/B/C zwei **bewusst andere** Decks (`unique-1/2-v2`): Auswahl über
  **Distinktheit × Viabilität** (Farb-/Struktur-/Mechanik-Neuheit + Mindest-Siegquote 40 %),
  themen-gebaut (Control/Removal, Go-Wide/Adrenaline, Gig-Swing/Tempo) plus abweichende
  Turnier-Decks. Ergebnis: **Unique-1 Gig-Swing/Tempo (BLAU/GRÜN, 57 %)** und **Unique-2
  Control/Removal (ROT/BLAU, 53 %)** — beide BLAU-basiert (die Tops meiden BLAU), < 25 %
  Kartenüberschneidung mit Top A.
- **Deck-Test im App (`ui/DeckTestPanel.tsx`, Tab „Mehr"):** das Kampf-Modell läuft
  jetzt **clientseitig in der App**. Die framework-freie Engine liegt in
  `app/src/domain/sim/` (`rng.ts`, `model.ts`, `engine2.ts`, `policies2.ts`) als
  **einzige Quelle der Wahrheit**; das Konsolen-`sim/` re-exportiert sie (`sim/model.ts`
  etc. sind nur noch `export * from '../app/src/domain/sim/…'`, `sim/engine.ts` bezieht
  rng/SimDeck von dort). `domain/sim/deckTest.ts` (rein, getestet) spielt zwei legale
  Decks seat-fair (engine2) und liefert Siegquote + 95%-CI + Beispiel-Log; das Panel
  wählt eigenes Deck vs. Gegner (eigene legale Decks + Starter), zeigt Balken/Log und
  ist ehrlich als **grobes Modell** beschriftet (Gear/Reaktionen/Würfel abstrahiert,
  Legends nur Eddie-Basis). **160→164 App-Tests** (`domain/sim/deckTest.test.ts`).
- **Native App (Phase 5, Scaffold steht):** Capacitor **6** (auf `^6` gepinnt — die
  neueste CLI v8 verlangt Node ≥22, wir haben Node 20.9). `app/capacitor.config.ts`
  (appId `com.lordcookie.engram`, `webDir: dist`), Android-Projekt in `app/android/`
  (build/.gradle/local.properties/kopierte Web-Assets sind gitignored). Bauen:
  `npm run cap:sync` (Web-Build + Copy in die Shell) → Android Studio oder
  `gradlew assembleDebug`; `npm run cap:open` öffnet das Projekt. **Lokaler Blocker:**
  installiert ist nur die Android-Studio-**JBR Java 25.0.2**; AGP/Gradle unterstützen
  **JDK 17–21** → der APK-Build braucht ein JDK 17 (oder Build via Android Studio mit
  dort heruntergeladenem JDK 17). Kein Code-Problem, reine Toolchain-Version.
- **Set-Fortschritt** (Sammlungs-Vollständigkeit): `domain/setProgress.ts`
  (rein/getestet) zählt **eindeutige** besessene Karten (nicht Stückzahlen) gegen das
  151er-Set, aufgeschlüsselt nach Farbe und Rarität. `ui/SetProgressPanel.tsx` oben im
  Tab „Sammlung" (reaktiv): Gesamtbalken + Balken je Farbe (in Legendenfarbe) und je
  Rarität. Der Kernnutzen eines Sammlungstrackers: „wie viel des Sets habe ich?".
- **Fehlende Deckkarten** („Einkaufsliste"): `domain/deckMissing.ts` (rein/getestet)
  listet, welche Karten dir zum Bauen fehlen (Sollmenge im Deck vs. Bestand) —
  **inkl. Legends** (je 1 nötig, stehen oben mit „LEGEND"-Tag; vorher blind für
  Legends). Sektion „Fehlende Karten" im Deckeditor (`have/need · −fehlt`), mit Knopf
  **„☆ → Want-Liste"** (setzt alle Fehlmengen auf die Wunschliste).
- **Want-Liste & Tausch-Liste** (Sammler-Werkzeuge, beide **einklappbar** in der
  Sammlung via `ui/Collapsible.tsx`, Default eingeklappt):
  - **Want-Liste** (Wunschliste, persistiert): neue Dexie-Tabelle `wants` (DB **v4**),
    Helfer `addWant`/`removeWant`/`wantAtLeast`. Reine Sicht `domain/wants.ts`
    (rein/getestet) verrechnet Wunsch vs. Bestand (`have/want · −still`). Befüllbar
    **hier per Suche**, **beim Erfassen** (☆ je Trefferzeile in `QuickAdd`) und **aus
    dem Deck** (fehlende Karten → Want-Liste). `ui/WantListPanel.tsx`.
  - **Tausch-Liste** (Dubletten): `domain/tradeList.ts` (rein/getestet) leitet den
    **Überschuss** ab (owned − Playset; Legends 1, sonst `maxCopiesPerCard` aus dem
    Ruleset). Keine eigene Persistenz. `ui/TradeListPanel.tsx`.
  - Beide sitzen **unter** der Sammlungsliste (Flow: Set-Fortschritt → Sammlung →
    Want → Tausch → Solver). `WantEntry` liegt in `domain/types.ts` (db re-exportiert).
- **Want-Liste im Backup** (§ 5, Datensicherheit): Das JSON-Backup ist **Format v2** —
  `collectionIo.ts` sichert jetzt **Sammlung + Want-Liste** (`replaceWants` beim Import).
  v1-Backups (ohne `wants`) bleiben importierbar; kaputte Want-Einträge werden still
  übersprungen. Schließt die Lücke, die die Want-Liste aufgemacht hatte.
- **Rarität-Budget im Deck**: `domain/deckRarity.ts` (rein/getestet) zählt Kopien je
  Seltenheit (inkl. Legends). Zeile in der Deck-Statistik; **Rare+** im Akzent
  (`isCostlyRarity`) = teurer zu beschaffen.
- 189 App-JS-Tests + Python-Tests grün; **sim: 7 v1 + 18 v2 (tsx)**. **Alle Deckbau-Aufgaben aus § 5 erledigt.**

## Regeln gegen offizielles Rulebook verifiziert (2026-09-04)
Der „Printable Gameplay Guide" (S. 10) bestätigt WÖRTLICH alle vier § 1-Regeln,
inkl. **Per-Farbe-RAM** (`ramScope: "perColor"`): „Each Legend's RAM limit only
counts towards their own color." Unser Validator ist korrekt — kein Change nötig.
Kartendatenbank verifiziert: beide offiziellen Starter-Decks sind zu 100 % legal.
(Die frühere „RAM-Regel falsch"-Vermutung aus der exburst-Probe war irreführend —
Community-Decks sind oft illegal. Details in DECISIONS.md.)

## Pipelines neu laufen lassen
```
python pipeline/fetch_cards.py        # 151 Karten von api.netdeck.gg -> cards.json + printings.json
python pipeline/build_features.py     # Synergie-Merkmale (kuratiert) -> features.json, aus features_curated.json
python pipeline/ingest_decks.py       # Decklisten aus pipeline/decklists/*.json -> coplay.json (Co-Play-Korpus)
python pipeline/test_fetch_cards.py
# bootstrap_features.py = Heuristik-Fallback (überschreibt features.json!) — nur ohne kuratierte Quelle nutzen
# extract_features.py  = reproduzierbarer API-Lauf für neue Sets, braucht ANTHROPIC_API_KEY
```

Nächste sinnvolle Schritte: **mehr Meta-Decks ins Ingest-Korpus** (nur 10 → schwaches
Signal; weitere Deck-IDs für `pull_meta` finden, dann `ingest_decks.py`); Deck-UX &
Synergie-Vorschläge im Editor; **iOS-Kamera** (Spike 0.1). (Tipp-zum-Fokussieren im
Scanner: erledigt.)
