# engram 🖧

[![CI](https://github.com/LordCookie/Engram/actions/workflows/ci.yml/badge.svg)](https://github.com/LordCookie/Engram/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **local-first, cloud-free** collection tracker and synergy-aware deckbuilder for the
**Cyberpunk TCG** (WeirdCo / CD PROJEKT RED).

engram brings scanning, collection tracking, and deckbuilding into one offline workflow:
point your phone at a card to add it, see how much of the set you own, and build decks
around the Legends and cards you actually have.

Card data is sourced from the **NetDeck API** (`api.netdeck.gg`), the same data that powers
the official card lists. No card images are stored in this repository or the app bundle —
they are linked from the official CDN and cached locally on your device for offline use.

> **Android:** an unsigned debug APK is attached to each
> [Release](https://github.com/LordCookie/Engram/releases), for personal use.

## 📸 Screenshots

> Card artwork appears as engram's **own colored placeholders** in these shots — the app links
> card images from the official CDN at runtime and never bundles or redistributes them (see
> *Disclaimer & Legal*). The mobile-first UI is pictured; it scales up to desktop as well.

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/screenshots/01-sammlung.png" alt="Collection tracking" width="240"><br><sub><b>Collection</b> — per-color progress, search &amp; filter</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/02-erfassen.png" alt="Quick add and starter decks" width="240"><br><sub><b>Quick add</b> — keyboard entry &amp; starter decks</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/06-scannen.png" alt="Webcam OCR scanner" width="240"><br><sub><b>Scanner</b> — on-device OCR, ManaBox-style</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src="docs/screenshots/03-deck.png" alt="Deck editor with synergy suggestions" width="240"><br><sub><b>Deck editor</b> — Legends, RAM &amp; live synergy picks</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/03b-deck-stats.png" alt="Deck statistics, cost curve and legality" width="240"><br><sub><b>Deck stats</b> — cost curve, RAM caps &amp; legality</sub></td>
    <td align="center" width="33%"><img src="docs/screenshots/04-synergie.png" alt="Synergy view with curated combos" width="240"><br><sub><b>Synergy</b> — text predictions &amp; named combos</sub></td>
  </tr>
</table>

## Design principles

- **Local-first & private.** Your collection never leaves your device — no cloud, no
  accounts, no logins. Everything lives in your browser via **IndexedDB**.
- **Collection-aware.** engram works from *your* pool: which Legend trio unlocks the most of
  what you own, which decks you can actually build, and what you're still missing.
- **The full loop (Scan → Track → Build)** in one tool instead of three.
- **Honest about its limits.** Synergy is a *prediction* from card text, and the deck-test is
  a *rough model*, not a rules-accurate simulator — both are labelled as such in the app.

## 🚀 Features

### 📸 Scanner (on-device OCR)

Add physical cards by holding one in the frame. engram reads the card **name** with on-device
OCR (**Tesseract.js**) and matches it against the full card list, using the **collector
number** to disambiguate same-name cards (e.g. the different "V" Legends). Everything runs
locally — no images leave the device.

- **Continuous autofocus** + **tap-to-focus** and a **torch** toggle — the levers that make
  phone capture reliable against glare and foils.
- **Bulk mode:** confident hits drop into a **scan basket** automatically (guarded by a
  2-of-3 frame consensus, so flipping through a binder doesn't misfire); commit the basket to
  your collection in one tap. An adjustable **scan pause** paces the auto-add.
- **Parallel OCR:** the recognition passes run across a small **worker pool** (several CPU
  cores) instead of one at a time.

> An earlier perceptual-hash (pHash) approach was replaced by OCR after testing — text
> recognition proved far more robust for real-world photos across visually similar cards.

### 📚 Collection

- **Set progress:** how much of the 151-card set you own, broken down **by color and rarity**.
- Search / filter / sort; a reusable **card detail** view (image, rules, stats, owned count,
  synergy partners); collapse the list to jump straight to the solver.
- **Missing-cards shopping list** for any deck — what you still need to build it, with
  **Legends included**.
- **JSON** backup import/export and MTG-style **deck text** import/export.

### 🧠 Synergy & Legend Solver

Deckbuilding in the Cyberpunk TCG revolves around per-color **RAM** limits and **Legend**
combinations. engram provides:

- A **Legend Solver** that computes valid Legend trios from *only the cards you own* and ranks
  them by how much of your collection they unlock.
- **Swap analysis** — see how changing one Legend unlocks or locks out parts of your pool.
- **EDHREC-style synergy scoring** in three flavors, selectable in the solver and shown while
  building: **predicted** (from structured card-text analysis), **empirical** (co-play from
  your own legal decks plus an ingested corpus of public meta decklists), and a **normalized
  combination** of both.

### 🧪 Deck testing & playtest (in-app)

- **Deck testing** (under *More*): a combat model plays two of your legal decks head-to-head,
  seat-fair, and reports a win rate with a 95% confidence interval. It models units, combat,
  blocking, keywords and real card effects, but is a **rough model** — gear, reactions and
  dice are abstracted, and it is labelled honestly as such.
- **Playtest sandbox:** ManaBox-style **manual** practice turns (real zones, you move the
  cards, no forced rule engine) to sanity-check your curve and combos before the table.

### ⚡ Fast tracking

- Keyboard quick-add and one-click **starter-deck** import for speed.
- **Offline-capable PWA:** once loaded, card images are served from a local Service-Worker
  cache, so the app works without a connection.

## 🛠 Tech Stack

- **Frontend:** React 18, TypeScript (`strict`), Vite, Tailwind CSS (Cyberpunk-skinned).
- **State & persistence:** React state + **Dexie.js** (IndexedDB) via `dexie-react-hooks`
  live queries — no external state library, no LocalStorage.
- **Scanner:** **Tesseract.js** OCR running in a multi-worker pool (`createScheduler`).
- **PWA / offline:** `vite-plugin-pwa` (Workbox) for the app shell and a runtime image cache.
- **Native mobile:** wrapped for **Android** via **Capacitor** (`app/android/`); debug APKs
  are published in [Releases](https://github.com/LordCookie/Engram/releases). iOS is a later
  step.
- **Data pipeline (offline, Python stdlib):** scripts to fetch card data from the NetDeck API,
  build the synergy-feature set, and ingest legal decklists into a co-play corpus. A
  **FastAPI + SQLite** service to broaden the community-stats signal is planned for Phase 4.
- **Framework-free core:** the rules, validation, the solver, synergy scoring, name/number
  matching and the combat model all live in pure, unit-tested TypeScript modules (no UI
  dependencies).

## 🧑‍💻 Getting Started (developers)

Card data (`cards.json`, `features.json`, …) is **not committed** — it's fetched/generated by
the pipeline (see *Legal* below), so generate it once after cloning:

```bash
git clone https://github.com/LordCookie/Engram.git
cd Engram

# 1) Generate the (gitignored) card data + synergy features
python pipeline/fetch_cards.py         # -> app/src/data/cards.json + printings.json
python pipeline/bootstrap_features.py  # -> app/src/data/features.json (no API key needed)

# 2) Run the app
cd app
npm install
npm run dev        # dev server (http://localhost:5173)
```

Other useful commands (run inside `app/`):

```bash
npm run build      # type-check + production build
npm run test       # unit tests (Vitest)
npm run typecheck  # type-check only
```

Testing the scanner needs a camera and a **secure context** (`localhost` or HTTPS). To try it
from a phone on your LAN: `LAN=1 npm run dev` serves over self-signed HTTPS on port 5174.

Building the Android APK needs **JDK 17** (up to 21; a newer JDK 25 is not yet supported by
the Android Gradle plugin): `npm run cap:sync` builds the web app and copies it into the
native shell, then Android Studio or `gradlew assembleDebug` produces the APK.

### 🧪 Deck simulation (developer tool)

A small console-only test engine lives in `sim/` for **comparing decks and sanity-checking
synergy claims** — it plays decks head-to-head and reports win rates. It is a **rough model,
not a rules-accurate simulator**: single card texts, reactions and dice are abstracted. Two
models are available — a fast aggregate **power proxy** (`--model v1`, default) and a fuller
**combat model** (`--model v2`) with real units, blocking, keywords (Adrenaline / Blocker /
Go Solo) and real card effects (removal, gig-swing, buffs, draw, `{Defeated}` triggers). The
same v2 model also powers the in-app **Deck testing** feature; here in `sim/` it is a
development aid and is not part of the app, the bundle, or the CI.

```bash
cd sim && npm install
npm run battle -- --a "The Heist" --b "Embracing Power" --games 300 --model v2
npm run game   -- --a "The Heist" --b "Embracing Power" --seed 7 --model v2   # one game, verbose log
npm run build-decks -- --model v2    # assemble strong decks from legal Legend trios
npm run pull-meta && npm run eval-meta   # pull public meta decklists and rank them (rough)
npm test                             # engine tests (determinism, mirror ≈ 50%, dominance …)
```

## 🗺 Roadmap & Current Status

- **Phase 1 — Tracker:** ✅ Done. Fast manual entry, Dexie persistence, collection views with
  search/filter/sort, set-completion progress by color and rarity, JSON backups.
- **Phase 2 — Deckbuilder:** ✅ Done. Rule validation, collection-aware Legend Solver, live deck
  stats, swap analysis, synergy suggestions while building, and a missing-cards shopping list.
- **Synergy engine:** ✅ Done. Predicted (card-text) + empirical (your own legal decks and an
  ingested meta-decklist corpus) + normalized combination.
- **Phase 3 — Scanner:** ✅ Usable on mobile. On-device OCR name + collector-number matching,
  continuous autofocus, tap-to-focus, torch, bulk auto-add with frame consensus, and parallel
  OCR via a worker pool. iOS camera support is still open.
- **Phase 4 — Stats service:** 🔄 In progress. The **local ingest pipeline** is in place
  (`pipeline/ingest_decks.py` aggregates legal decklists — your own plus pulled meta decks —
  into a co-play corpus the app merges in); a FastAPI/SQLite service to broaden the signal is
  the next step.
- **Phase 5 — Native mobile app:** ✅ Android debug APK available in
  [Releases](https://github.com/LordCookie/Engram/releases) (built from `app/android/` via
  Capacitor). iOS is a later step.
- **Deck testing & playtest:** ✅ Live (under **More**). The v2 combat model runs client-side to
  compare two legal decks (rough model, labelled), alongside a **manual practice-turn sandbox**
  (real zones, you move the cards, no forced rule engine).

## 📄 License

The engram **source code** is released under the **MIT License** — see [LICENSE](LICENSE).
This does **not** cover the Cyberpunk TCG intellectual property (see the Disclaimer below).

## ⚖️ Disclaimer & Legal

engram is an **unofficial fan project** and is **not** affiliated with, endorsed, sponsored, or
approved by WeirdCo, CD PROJEKT RED, or NetDeck.

Card names, rules text, and the Cyberpunk IP are the property of CD PROJEKT RED and WeirdCo.
This app **does not host or redistribute card images or card data** — card data is fetched from
the NetDeck API into your local database, and images are linked from the official CDN and cached
only on your own device. Generated card data is kept out of this repository by design.

engram is built for personal, local use to enhance the physical tabletop experience.
