# Scanner v2: das ScryGlass-System für engram

Plan zur Frage: *„In ScryGlass habe ich den Scanner deutlich stärker gebaut. Sollen
wir das System auch für engram nutzen?"*

Stand: 2026-09-24 · Status: **umgesetzt**. Nach dem Handy-Test ist der neue Scanner der
einzige: alter Tesseract-only-Scanner und Beta-Schalter sind entfernt. Der Tab Scanner hat
nur noch den Knopf „Scanner starten" für den Vollbild-Scanner (App nativ, Browser mit
Webcam-Vollbild). Feinjustieren geht weiter über das Scan-Protokoll. Befunde: § 7.

## Kurzantwort

**Ja.** Der ScryGlass-Scanner ist in fast jeder Hinsicht stärker. Für engram passt er
sogar besser als für MTG:

- Der **Bild-Hash-Index** ist bei ~200 Printings winzig (ScryGlass: ~155.000). Weniger
  Kandidaten heißt weniger Verwechsler, und der Index kann direkt ins Bundle.
- Er erkennt **Alt-Arts beim Scannen automatisch**, weil jedes Printing einen eigenen
  Hash hat. Genau diese Lücke hatten wir im Scanner bewusst offengelassen.
- Die **stilisierten, wandernden Cyberpunk-Namen** sind der Schwachpunkt reiner OCR. Das
  Bild-Signal ist davon unabhängig.

Der Weg dahin: portieren statt neu schreiben, **hinter einem Beta-Schalter**, und der
bestehende Web-Scanner (Tesseract) bleibt als Fallback unverändert.

---

## 1. Vergleich

| | engram heute | ScryGlass |
|---|---|---|
| Kamera | `getUserMedia` im WebView | **natives CameraX**, Vorschau hinter transparenter WebView |
| Texterkennung | `tesseract.js` (WASM/CPU, Worker-Pool ×3) | **ML Kit** on-device (nativ, deutlich schneller und genauer) |
| Bild-Erkennung | keine | **pHash 256 Bit** (DCT) je Printing, Hamming-Distanz + **Margin** zur nächsten *fremden* Karte, Varianten (Ausschnitte + 180°) |
| Signale kombinieren | Name-Score oder Sammlernummer | **`scanFuse`**: Druck > Bild+OCR > Bild > OCR, mit Kreuz-Bestätigung |
| Auto-Korb | Bildwechsel-Gating (Thumbnail-Diff) + `lastAutoRef` | **`autoBasket`**: dieselbe Karte erst nach echtem Wechsel (unscharf/leer über 3 Frames), **zeitlicher Konsens** (2 Frames) |
| Schärfe | kontinuierlicher Autofokus | Autofokus + **Laplace-Schärfe-Gate** (nativ, `SHARP_MIN = 30`) |
| Tipp-zum-Fokussieren | `pointsOfInterest` (wenn der Browser es kann) | nativ `FocusMeteringAction` (geht auf praktisch jedem Gerät) |
| OCR-Qualität | Top-5 nach Score | **Konfidenz-Gating** (`ocrQuality`: `OCR_CONF_MIN = 55`, Deckel 0,8 bei schwachem Read) |
| Alt-Art beim Scannen | nicht erkannt | **automatisch** über den Printing-Hash |
| Testbarkeit | `nameMatch` getestet | `scanFuse`, `autoBasket`, `ocrQuality`, `focus`, `cardText`, `imageHash` rein und getestet |

Beide Projekte stehen auf demselben Fundament: Capacitor 6.2.2, minSdk 22,
compile/target SDK 34, gleiche `configChanges`, Vite + React + TS strict. Der Port ist
also Handwerk, keine Architekturänderung.

---

## 2. Was übernommen wird (Quelle → Ziel)

Pfade relativ zu `ScryGlass/app/` bzw. `engram/app/`.

| ScryGlass | engram | Anpassung |
|---|---|---|
| `android/…/ScryCameraPlugin.kt` | `android/…/engram/EngramCameraPlugin.kt` | Paket/Name umbenennen, **QR-Modus streichen** (Pairing gibt es in engram nicht), sonst 1:1 |
| `MainActivity.java` (`registerPlugin(...)`) | `MainActivity.java` | `registerPlugin(EngramCameraPlugin.class)` **vor** `super.onCreate` (heute ist die Klasse leer) |
| Gradle: Kotlin 1.9.22, CameraX 1.3.4, ML Kit `text-recognition:16.0.1` | `android/build.gradle`, `app/build.gradle`, `variables.gradle` | engram hat **noch kein Kotlin**: `kotlin-gradle-plugin`-Classpath, `apply plugin: 'kotlin-android'`, `kotlinVersion` ergänzen |
| `src/native/scryCamera.ts` | `src/native/engramCamera.ts` | ohne `qr`/`setMode`, sonst gleich (`hasNativeCamera()`, `reticleOf()`) |
| `src/ui/NativeScanOverlay.tsx` | `src/ui/NativeScanOverlay.tsx` | Portal auf `body` + `html.scan-native` (WebView transparent). Farben auf die engram-Tokens umstellen (`--c-accent`, `--c-on-accent`, Themes) |
| `src/domain/scanFuse.ts` (+test) | `src/domain/scanFuse.ts` (+test) | `oracleId` → `cardId`, Printing-ID → engram-Printing (`<cardId>` / `<cardId>#alt`) |
| `src/domain/autoBasket.ts` (+test) | `src/domain/autoBasket.ts` (+test) | unverändert |
| `src/domain/ocrQuality.ts` (+test) | `src/domain/ocrQuality.ts` (+test) | unverändert |
| `src/domain/focus.ts` (+test) | `src/domain/focus.ts` (+test) | unverändert (`laplacianVariance`, `normalizedPoint`) |
| `src/domain/cardText.ts` (+test) | `src/domain/cardText.ts` (+test) | **Cyberpunk-Layout**, siehe § 3 |
| `src/data/imageHash.ts` (+tests) | `src/data/imageHash.ts` (+tests) | Index **gebündelt** statt Dexie-Import/-Sync (siehe § 3.4) |
| `pipeline/hash_images.py` (+test) | `pipeline/hash_images.py` (+test) | Quelle NetDeck statt Scryfall, siehe § 3.4 |

**Bleibt in engram und wird weiterverwendet:** `domain/nameMatch.ts` (Fuzzy-Abgleich,
`foldOcr`), Scan-Korb mit `basketReplace` (Korrektur), „✓ … in den Korb"-Rückmeldung,
Korb-Animation, der komplette Web-Pfad (Tesseract + Otsu/Bradley + Bildwechsel-Gating).

**Nicht übernommen:** Scan-Verlauf/Rückgängig (`scanHistory`), Set-Modus-Filter,
QR-Pairing/PeerServer. Das sind MTG-spezifische Extras, die wir erst bei Bedarf holen.

---

## 3. Was für Cyberpunk angepasst werden muss

### 3.1 Kartenformat
`CARD_ASPECT = 733 / 1024` (0,716) haben wir schon. Der native Ausschnitt in ScryGlass ist
146×204 = 0,716, passt also bereits. Das Reticle im Overlay bekommt dasselbe Verhältnis.

### 3.2 Namenszeile
ScryGlass sucht den Namen im **obersten Band** (`NAME_BAND = 0.16`), dem MTG-Titelbalken.
Bei Cyberpunk sitzt der Name meist **mittig**, bei manchen Karten oben. Vorgehen:

- ML Kit liefert Zeilen mit normierter Position. Statt `pickNameLine` nehmen wir alle
  Zeilen aus **zwei Bändern** (Mitte = Grundlayout, oben = Name-oben-Karten, dieselben
  Bänder wie im Tesseract-Pfad) und gleichen jede gegen die 151 Namen ab (`nameMatch`).
  Bei 151 Kandidaten ist „alle Zeilen matchen, beste nehmen" billig.
- Die Bandgrenzen kalibrieren wir an echten Frames (Protokoll, siehe § 5, Phase 6).

### 3.3 Sammlernummer
`parseCollectorText` in ScryGlass liest das MTG-Format (`123/280 R SET EN`). Cyberpunk
nutzt ein anderes Format (z. B. `112`, `005a`), und die Nummer ist **nur pro Farbe
eindeutig**. Wir behalten die bestehende engram-Logik (Nummer als Entscheider, an den
Namens-Treffer gekoppelt) und speisen sie als `PrintSignal` („druck") in `scanFuse` ein.
Die Position (unteres Band) prüfen wir an echten Frames.

### 3.4 Hash-Index für Cyberpunk
- **Pipeline:** `pipeline/hash_images.py` lädt je Karte über den **Detail-Endpoint**
  (wie `fetch_altarts.py`) alle Printings, holt das Bild mit frischer, signierter URL,
  berechnet den pHash (Pillow, `LANCZOS` auf 32×32 → DCT → 16×16 → Median) und verwirft
  das Bild wieder. Pillow 10.4 ist lokal vorhanden. Alternativ auf `pipeline/card-images/`
  (lokales Archiv aus `fetch_images.py`) aufsetzen.
- **Ausgabe:** `app/src/data/hashes.json` mit `{ id, card, alt, h }` je Printing,
  **gitignored** wie `cards.json`. Größe grob 200–300 × 64 Hex ≈ 20 KB → wird **gebündelt**
  (bzw. lazy geladen wie `coplay.json`). Die Dexie-Import-/Sync-Maschinerie aus ScryGlass
  (für 155k Hashes) brauchen wir nicht.
- **Statistik gleich mitliefern:** die Pipeline gibt die Verteilung „Abstand zur
  nächsten *fremden* Karte" aus. Das ist die Basis für die Schwellen (§ 3.5), statt
  MTG-Werte blind zu übernehmen.
- **Parität Python ↔ TS:** `phashFromCanvas` ist bit-identisch zur Pipeline gebaut
  (ITU-R-601-Graustufe wie PIL `L`, gleiche DCT-Matrix, MSB-first). Ein
  gemeinsamer Test-Vektor (festes Bild → erwarteter Hash in beiden Tests) sichert das ab.
- **Offene Prüfung (Spike):** Liefert der Detail-Endpoint je Printing eine eigene
  Bild-URL? `fetch_altarts.py` liest bisher nur `artist`. Falls nicht: Alt-Art-Bild
  über die Printing-ID auflösen oder die Liste um die Alt-Printings ergänzen.

### 3.5 Schwellen neu kalibrieren
Die ScryGlass-Werte stammen aus 155k Kandidaten (korrekte Treffer Distanz 26–52, fremde
Karten ab ~72). Geplant waren die **Set-Modus-Werte** aus ScryGlass (dort ~800
Kandidaten). Am echten Index gemessen liegen fremde Karten bei engram aber schon ab 68,
darum etwas strenger (§ 7):

| Wert | ScryGlass (voll) | ScryGlass Set-Modus | **engram (gemessen, § 7)** |
|---|---|---|---|
| `hashMaxDist` | 60 | 70 | **64** |
| `hashMinMargin` | 12 | 8 | **10** |
| `hashAutoDist` | 56 | 64 | **58** |
| `hashAutoMargin` | 18 | 12 | **16** |
| `hashConfirmDist` / `Margin` | 70 / 4 | 70 / 4 | 70 / 4 |
| `ocrConfident` / `ocrConfirm` | 0,85 / 0,6 | 0,85 / 0,6 | 0,85 / 0,6 |
| `AUTO_CONSENSUS` | 2 | 2 | 2 (nativ), 1 (Web) |
| `SHARP_MIN` | 30 | 30 | 30 (gemessen unkritisch) |

Danach mit der Pipeline-Statistik und dem Scan-Protokoll nachziehen.

### 3.6 Alt-Arts
Hash-Treffer auf ein Alt-Printing → Korb-Eintrag mit `altPrintingId(cardId)`
(`<cardId>#alt`). Mehrere Alt-Printings einer Karte fallen, wie im Bestand, auf das
eine aggregierte `#alt` zusammen. Der Korb zeigt „Alt" sichtbar an, `basketReplace`
kann Standard ↔ Alt korrigieren. Liefert nur die OCR einen Treffer (Bild unsicher),
wird **Standard** angenommen (wie heute).

---

## 4. Kosten und Risiken

| Thema | Einschätzung | Gegenmaßnahme |
|---|---|---|
| **APK-Größe** | heute ~4 MB → ca. **15–20 MB** (ML-Kit-`.so`: arm64 ~11 MB, armv7 ~6,8 MB) | Akzeptabel. Optional: ABI-Splits (nur arm64) oder die Play-Services-Variante von ML Kit (lädt das Modell nach, braucht Google Play Services) |
| **Regressionen** im Scanner (die haben wir schon erlebt) | real | **Beta-Schalter** „Neuer Scanner (Beta)" unter „Mehr", Default **aus**; der Tesseract-Pfad bleibt unangetastet |
| **Schärfe-Gate** | ein früherer JS-Versuch in engram hat die Erkennung verschlechtert | ScryGlass misst nativ und kalibriert. Trotzdem: Schwelle im Protokoll mitloggen, per Konstante abschaltbar, erst nach Messung scharf stellen |
| **Kotlin neu im Android-Projekt** | Build-Setup wächst | Setup 1:1 aus ScryGlass (läuft dort mit derselben JDK-17-Toolchain) |
| **iOS** | ML Kit + CameraX sind Android | Native Pfad nur Android. iOS/Web behalten `getUserMedia` + Tesseract, der Hash-Index hilft dort trotzdem (siehe Phase 3) |
| **Foils/Glanz** | Hash und OCR leiden beide | Kreuz-Bestätigung + Tipp-zum-Fokussieren. Gegen Glanz kippen bleibt der Tipp an den Nutzer |

---

## 5. Phasen

Jede Phase ist für sich lauffähig und einzeln committbar. Tests im selben Commit
(Regel aus CLAUDE.md).

**Phase 0: Spike Hash-Quelle** (ohne App-Code)
- Detail-Endpoint prüfen: Bild-URL je Printing? (§ 3.4)
- Probelauf `hash_images.py` auf 10 Karten, Abstandsstatistik ansehen.
- *Fertig, wenn:* klar ist, woher die Alt-Art-Bilder kommen, und die Abstände
  zwischen fremden Karten deutlich über den Treffer-Abständen liegen.

**Phase 1: Reine Domäne** (framework-frei, keine UI-Änderung)
- `scanFuse`, `autoBasket`, `ocrQuality`, `focus` + Tests portieren.
- `cardText` mit Cyberpunk-Bändern (§ 3.2) und Anbindung an die bestehende
  Sammlernummer-Logik (§ 3.3).
- *Fertig, wenn:* alle neuen Tests grün, bestehende 203 unverändert grün.

**Phase 2: Hash-Index**
- `pipeline/hash_images.py` (+ `test_hash_images.py`) → `data/hashes.json` (gitignored).
- `data/imageHash.ts` (+ Tests, inkl. Paritäts-Vektor), Index gebündelt/lazy.
- Fehlt `hashes.json` (frischer Clone/CI), baut die App wie heute (optional per
  `import.meta.glob`, wie bei `altArts.json`/`coplay.json`).

**Phase 3: Hash im Web-Pfad** (erster echter Gewinn, ganz ohne nativen Code)
- Im bestehenden Tesseract-Scanner zusätzlich den Ausschnitt hashen und über
  `scanFuse` mit dem OCR-Treffer kombinieren. Hinter dem Beta-Schalter.
- Bringt Alt-Art-Erkennung und Bild-Bestätigung auch im Browser und auf iOS.
- *Fertig, wenn:* mit Webcam mindestens so gut wie heute (~100 %) und Alt-Arts werden
  erkannt.

**Phase 4: Nativer Pfad** (Android)
- Kotlin-Setup + Gradle-Abhängigkeiten, `EngramCameraPlugin.kt`, Registrierung in
  `MainActivity`, `native/engramCamera.ts`, `NativeScanOverlay`.
- `ScannerPanel` verzweigt: `hasNativeCamera() && betaAn` → nativer Pfad
  (`onNativeFrame`), sonst Web-Pfad wie bisher.
- *Fertig, wenn:* Debug-APK baut (JDK 17), Kamera, Torch, Zoom und Tipp-Fokus laufen
  am Handy.

**Phase 5: Alt-Art im Korb**
- Hash-Treffer → `#alt`, Korb-Anzeige, Korrektur Standard ↔ Alt, Übernahme in die
  Sammlung zählt in den Alt-Bestand (§ 3.6).

**Phase 6: Kalibrieren am Handy, dann umschalten**
- Scan-Protokoll: je Frame Distanz, Margin, OCR-Konfidenz, Schärfe, gewählte Methode.
  Testsatz: ~30 Karten inkl. Alt-Arts, Foils, Name-oben-Karten, schlechtes Licht.
- Schwellen (§ 3.5) und Namensbänder nachziehen.
- *Fertig, wenn:* der neue Scanner am Handy messbar besser ist als der alte. Dann
  Beta-Schalter entfernen (native ist Standard in der App), Release + Tag,
  `APP_VERSION` mitziehen.

---

## 6. Projektregeln (CLAUDE.md, § 8)

- **Keine Kartenbilder im Repo oder Bundle:** Die Pipeline lädt Bilder nur
  vorübergehend zum Hashen. Gebündelt werden **nur Hashes** (ausdrücklich erlaubt:
  „Nur Hashes und externe Links"). `hashes.json` ist trotzdem gitignored (wie die
  übrigen CDPR-abgeleiteten Daten).
- `domain/` bleibt framework-frei: die portierten Module sind es bereits.
- **Kein LocalStorage:** der Beta-Schalter liegt in Dexie (`meta`), wie das Farbthema.
- Keine Kamerabilder verlassen das Gerät. ML Kit läuft on-device.

---

## 7. Befunde bei der Umsetzung (2026-09-24)

- **Phase 0 geklärt:** Der Detail-Endpoint liefert je Printing eine eigene, signierte
  Bild-URL. `pipeline/hash_images.py` hasht alle **550 englischen Printings** der 151
  Karten (0 Fehler), Ausgabe `app/src/data/hashes.json` (gitignored, 89 KB, in der App
  ein eigener Lazy-Chunk von 28 KB gzip).
- **Alt-Art per Bild statt per Künstler:** Die Künstler-Heuristik aus `fetch_altarts.py`
  war doppelt falsch. Der Beta-Druck von Delamain Cab trägt einen anderen Künstler, zeigt
  aber exakt dasselbe Bild. V: Streetkid 005a/005b sind zwei Illustrationen vom selben
  Künstler. Jetzt entscheidet der Bildabstand zum Standard-Druck (`ALT_MIN_DIST = 40`):
  Nachdrucke inkl. Stempel („WTNC 2026", β) liegen bei 0–38, Full-Arts ab 42, andere
  Illustrationen ab ~64. Ergebnis: **67 Karten mit Alt-Art statt 43**. `psycho-squad` fällt
  raus (gleiches Bild), 25 kommen dazu. `--write-altarts` schreibt `altArts.json` neu.
- **Schwellen gemessen, nicht übernommen:** Fremde Karten liegen untereinander bei min 68 /
  Median 86 Bit, also enger als bei MTG (~72). `FUSE_DEFAULTS`: Anzeige ≤ 64 / Margin ≥ 10,
  Auto ≤ 58 / Margin ≥ 16, Bestätigung ≤ 70 / Margin ≥ 4.
- **Der pHash ist extrem versatz-empfindlich.** Unschärfe und Licht kosten fast nichts
  (Abstand ~4), aber 2 % Verschiebung schon ~60 Bit, bei 4 % scheitert der Abgleich. Das
  hätte am Handy den Großteil der Bild-Treffer gekostet. Lösung ohne Paritätsbruch: eine
  **Ausschnitt-Suche** (`searchRects`: 3×3 Verschiebungen ±3 % × 3 Skalierungen + 9
  gedrehte = 36 Query-Hashes, ~15 ms je Bild). Das native Plugin schickt dafür den Rahmen
  mit 8 % Rand (`cropBox`). Simuliert (Drehung ±3°, Versatz ±4,5 %, Unschärfe, Licht, JPEG):
  **50/50 korrekt statt 38/50**, 46/50 im Auto-Gate. Gegenprobe (leerer Tisch, Hand über
  der Karte, quer liegende oder überlappende Karten) ergab **0 Fehltreffer** in den Gates.
- **Parität bestätigt:** zwei gemeinsame Test-Vektoren (Python ↔ TS) liefern bit-identische
  Hashes. Simulierte native Frames echter Karten, durch den App-Code im Browser gejagt,
  treffen alle korrekt inkl. Alt-Art (Abstand 30–44, Margin 40–66).
- **Schärfe-Gate unkritisch:** An Cyberpunk-Karten gemessen (128 px breit): scharf ≈ 2000,
  stark verwackelt noch ≈ 150. `SHARP_MIN = 30` verwirft nur unbrauchbare Bilder.
- **Auto-Korb-Schlüssel ist die Karte, nicht Standard/Alt.** Sonst würde ein Bild-Aussetzer
  auf derselben Karte (Bild → Alt, nächstes Bild nur Name → Standard) doppelt zählen.
- **Web-Pfad:** Mit Beta aus läuft der bisherige Scanner unverändert. Mit Beta an kommen
  Bild-Hash und Fusion dazu. Die Tesseract-Sicherheit wird dort bewusst nicht gedeckelt,
  der Konsens bleibt 1, weil nur bei Bildwechsel gelesen wird.
- **Nummer ist kein unabhängiges Signal (E2E-Test im Browser mit künstlichem
  Kamerastream):** OCR-Rauschen traf die Sammlernummer von Gilded Matón. Das hob einen
  27-%-Namen auf 77 % und überstimmte als „Nummer + Name" den klaren Bildtreffer
  Delamain Cab (d50/m38). Fix: Die Fusion bekommt den Namen ohne Nummern-Bonus
  (`nameScore`). Außerdem schlägt eine nur durch den Namen bestätigte Nummer keinen starken
  Bildtreffer auf eine andere Karte (Test in `scanFuse.test.ts`).
- **Auto-Korb nachträglich einschalten:** Der Browser liest nur bei Bildwechsel. Beim
  Einschalten wird deshalb das aktuelle Bild sofort neu gelesen, sonst würde die bereits
  liegende Karte übersehen.
- **Kalibrier-Hilfe:** Im Scanner liegt ein „Scan-Protokoll". Es hält je Bild
  Name- und Bild-Treffer, Abstand, Margin, Schärfe und Methode fest, dazu jede Übernahme und
  Korrektur im Korb. Das Protokoll bleibt im Speicher und lässt sich per Knopf kopieren.

## 8. Später

- Wenn beide Apps den Scanner nutzen: das Kotlin-Plugin + `scanFuse`/`autoBasket`/
  `imageHash` in ein **gemeinsames Paket** auslagern (lokales npm-Paket oder
  Capacitor-Plugin-Repo), damit Fixes nicht doppelt gepflegt werden.
- Mit mehr Sets wächst der Hash-Index weiter. Ab einigen tausend Printings lohnt
  der ScryGlass-Weg (Dexie-Import + Subset-Suche per `hashIndicesFor`).
