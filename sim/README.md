# sim — Konsolen-Test-Engine (intern)

Kleines Dev-Werkzeug, um Decks und unsere **vorhergesagten Synergien** grob
gegeneinander durchzuspielen. Bewusst nüchtern: **kein regeltreuer Simulator**,
kein Feature der App — ein vereinfachtes Heuristik-Modell, mit dem man messen
kann, ob ein besser gebautes / synergistischeres Deck hier tendenziell öfter
gewinnt. Ein starkes Signal ist es nicht, ein bequemes schon.

Braucht die lokal generierten App-Daten (`app/src/data/cards.json`,
`features.json` — via `pipeline/`), genau wie die App. Läuft mit `tsx`.

## Nutzung

```
cd sim
npm install
npm run decks                                                   # spielbare Decks
npm run battle -- --a "The Heist" --b "Embracing Power" --games 200
npm run battle -- --a "The Heist" --b "The Heist" --synergy off # A/B-Test: Synergie an/aus
npm run game   -- --a "The Heist" --b "Embracing Power" --seed 7 # ein Spiel, ausführlich
npm test
```

## Gegen einen Subagenten spielen (Schrittbetrieb)

```
npm run agent-init -- --a "The Heist" --b "Embracing Power" --agent b
# -> JSON: aktueller Zustand + Handoptionen des Agenten
npm run agent-step -- --play "0,2" --attack true
# ... bis das JSON "done": true meldet.
```

Der Zustand liegt in `sim/.state.json` (gitignored). Der Gegner spielt die
Heuristik; die als `--agent` gewählte Seite entscheidet extern (ein Agent liest
das JSON und wählt Hand-Indizes + Angriff).

## Modell (absichtlich grob — Ehrlichkeitsgebot)

- Eddies/Zug wachsen leicht (Ramp). Karten spielen = Feld-Power; Support-Karten
  (Gear/Program) zählen mit Basiswert. **Synergie** (unsere Vorhersage) gibt einen
  Power-Bonus, wenn eine gespielte Karte mit dem bereits Entwickelten harmoniert.
- Angriff klaut Gigs: `floor((bereite Power − ½·Gegnerfeld) / 10)`, gekappt auf die
  Gigs des Gegners. Der Fixer gibt +1 Gig/Zug. Sieg bei Zugbeginn mit genug Gigs
  (Parameter, Default 7) oder wenn der Gegner auskartet.
- Legends sind nur eine „Eddie-Quelle"; **kein** Kampf/Blocken, keine Keywords,
  keine Reaktionen. Das ist Absicht — ein Messwerkzeug, kein Spiel.

Szenario-Decklisten: slug-JSON in `sim/decks/` ablegen (gitignored, Format wie
`pipeline/decklists/`). Ohne Dateien stehen die zwei Starter zur Verfügung.
