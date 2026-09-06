import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card, type Deck } from '../domain/types';
import { rulesetV1Loaded } from './ruleset';
import {
  validate,
  computeRamCaps,
  type ValidationResult,
  type ViolationCode,
} from './validate';

const ruleset = rulesetV1Loaded;

// --- Testhilfen -----------------------------------------------------------

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return {
    setCode: 'T',
    name: over.id,
    tags: [],
    rarity: 'common',
    rulesText: '',
    ...over,
  };
}

// Feste Legends: zwei grüne (RAM 2), eine rote (RAM 3) → Caps G4 R3 B0 Y0.
const LA = card({ id: 'LA', name: 'GreenA', type: 'LEGEND', color: 'GREEN', ram: 2 });
const LB = card({ id: 'LB', name: 'GreenB', type: 'LEGEND', color: 'GREEN', ram: 2 });
const LC = card({ id: 'LC', name: 'RedC', type: 'LEGEND', color: 'RED', ram: 3 });
// Legend mit gleichem Namen wie LA (Dubletten-Test) und Legend ohne RAM.
const LA_DUP = card({ id: 'LA2', name: 'GreenA', type: 'LEGEND', color: 'GREEN', ram: 2 });
const LNULL = card({ id: 'LN', name: 'NullRam', type: 'LEGEND', color: 'YELLOW' });

// 20 billige grüne RAM-1-Karten, damit ein legales 40er-Deck baubar ist.
const cheapGreens: Card[] = Array.from({ length: 20 }, (_, i) =>
  card({
    id: `g${String(i).padStart(2, '0')}`,
    name: `Green ${i}`,
    type: 'UNIT',
    color: 'GREEN',
    ram: 1,
    cost: 1,
    power: 1,
  }),
);

// Karten mit hohem RAM bzw. anderer Farbe für RAM-Grenzfälle.
const greenRam4 = card({ id: 'gOak', name: 'Oak', type: 'UNIT', color: 'GREEN', ram: 4 });
const greenRam5 = card({ id: 'gTitan', name: 'Titan', type: 'UNIT', color: 'GREEN', ram: 5 });
const blueRam2 = card({ id: 'bWave', name: 'Wave', type: 'UNIT', color: 'BLUE', ram: 2 });

const index = buildCardIndex([
  LA, LB, LC, LA_DUP, LNULL,
  ...cheapGreens,
  greenRam4, greenRam5, blueRam2,
]);

function deck(over: Partial<Deck>): Deck {
  return {
    id: 'd1',
    name: 'Testdeck',
    rulesetVersion: ruleset.version,
    legendIds: [LA.id, LB.id, LC.id],
    cards: [],
    updatedAt: 0,
    ...over,
  };
}

/** Erzeugt Deck-Karteneinträge für die ersten `distinct` billigen Grünen. */
function greens(distinct: number, count: number): Deck['cards'] {
  return cheapGreens.slice(0, distinct).map((c) => ({ cardId: c.id, count }));
}

function has(res: ValidationResult, code: ViolationCode): boolean {
  return res.violations.some((v) => v.code === code);
}

// --- Regel 1: Legends -----------------------------------------------------

describe('Regel 1 — Legends', () => {
  it('akzeptiert genau 3 Legends mit unterschiedlichen Namen', () => {
    const res = validate(deck({ cards: greens(20, 2) }), ruleset, index);
    expect(has(res, 'LEGEND_COUNT')).toBe(false);
    expect(has(res, 'LEGEND_NAMES_NOT_UNIQUE')).toBe(false);
  });

  it('meldet Namensdubletten', () => {
    const res = validate(
      deck({ legendIds: [LA.id, LA_DUP.id, LC.id], cards: greens(20, 2) }),
      ruleset,
      index,
    );
    expect(has(res, 'LEGEND_NAMES_NOT_UNIQUE')).toBe(true);
  });

  it('meldet eine nicht gefundene Legend', () => {
    const res = validate(
      deck({ legendIds: [LA.id, LB.id, 'nope'], cards: greens(20, 2) }),
      ruleset,
      index,
    );
    expect(has(res, 'LEGEND_NOT_FOUND')).toBe(true);
    expect(has(res, 'LEGEND_COUNT')).toBe(true);
  });

  it('meldet eine Nicht-Legend im Legend-Slot', () => {
    const res = validate(
      deck({ legendIds: [LA.id, LB.id, 'g00'], cards: greens(20, 2) }),
      ruleset,
      index,
    );
    expect(has(res, 'LEGEND_WRONG_TYPE')).toBe(true);
    expect(has(res, 'LEGEND_COUNT')).toBe(true);
  });

  it('meldet eine Legend im Deck-Teil (gehört in den Slot)', () => {
    const res = validate(
      deck({ cards: [...greens(19, 2), { cardId: LA.id, count: 2 }] }),
      ruleset,
      index,
    );
    expect(has(res, 'LEGEND_IN_DECK')).toBe(true);
  });
});

// --- Regel 2: Deckgröße ---------------------------------------------------

describe('Regel 2 — Deckgröße', () => {
  it('akzeptiert genau 40 Karten', () => {
    const res = validate(deck({ cards: greens(20, 2) }), ruleset, index);
    expect(has(res, 'DECK_SIZE')).toBe(false);
  });

  it('akzeptiert genau 50 Karten', () => {
    // 10 Karten à 3 (=30) + 10 Karten à 2 (=20) = 50.
    const cards = [
      ...cheapGreens.slice(0, 10).map((c) => ({ cardId: c.id, count: 3 })),
      ...cheapGreens.slice(10, 20).map((c) => ({ cardId: c.id, count: 2 })),
    ];
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'DECK_SIZE')).toBe(false);
    expect(has(res, 'MAX_COPIES')).toBe(false);
  });

  it('lehnt 39 Karten ab', () => {
    const cards = [...greens(19, 2), { cardId: 'g19', count: 1 }]; // 38+1 = 39
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'DECK_SIZE')).toBe(true);
  });

  it('lehnt 51 Karten ab', () => {
    const cards = [
      ...cheapGreens.slice(0, 11).map((c) => ({ cardId: c.id, count: 3 })), // 33
      ...cheapGreens.slice(11, 20).map((c) => ({ cardId: c.id, count: 2 })), // 18
    ]; // 51
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'DECK_SIZE')).toBe(true);
  });

  it('zählt Legends NICHT zur Deckgröße', () => {
    // Genau 40 Deck-Karten; die 3 Legends dürfen die 40 nicht auf 43 heben.
    const res = validate(deck({ cards: greens(20, 2) }), ruleset, index);
    expect(res.ok).toBe(true);
  });
});

// --- Regel 3: maximale Kopien --------------------------------------------

describe('Regel 3 — maximale Kopien', () => {
  it('akzeptiert 3 Kopien', () => {
    const cards = [
      ...cheapGreens.slice(0, 10).map((c) => ({ cardId: c.id, count: 3 })),
      ...cheapGreens.slice(10, 20).map((c) => ({ cardId: c.id, count: 2 })),
    ];
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'MAX_COPIES')).toBe(false);
  });

  it('lehnt 4 Kopien ab', () => {
    // g00 mit 4 Kopien, disjunkte Füllung g01..g18 (18 × 2 = 36) → 40.
    const fillers = cheapGreens.slice(1, 19).map((c) => ({ cardId: c.id, count: 2 }));
    const res = validate(deck({ cards: [{ cardId: 'g00', count: 4 }, ...fillers] }), ruleset, index);
    expect(has(res, 'MAX_COPIES')).toBe(true);
  });

  it('summiert mehrfach gelistete cardIds (2+2 = 4 Kopien)', () => {
    const fillers = cheapGreens.slice(1, 19).map((c) => ({ cardId: c.id, count: 2 }));
    const cards = [
      { cardId: 'g00', count: 2 },
      { cardId: 'g00', count: 2 },
      ...fillers, // 4 + 36 = 40
    ];
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'MAX_COPIES')).toBe(true);
  });

  it('lehnt Anzahl 0 ab', () => {
    const res = validate(
      deck({ cards: [...greens(19, 2), { cardId: 'g19', count: 0 }] }),
      ruleset,
      index,
    );
    expect(has(res, 'INVALID_COUNT')).toBe(true);
  });

  it('lehnt negative Anzahl ab', () => {
    const res = validate(
      deck({ cards: [{ cardId: 'g00', count: -3 }, ...greens(20, 2)] }),
      ruleset,
      index,
    );
    expect(has(res, 'INVALID_COUNT')).toBe(true);
  });
});

// --- Regel 4: RAM-Limit pro Farbe ----------------------------------------

describe('Regel 4 — RAM-Limit pro Farbe', () => {
  it('computeRamCaps summiert RAM je Farbe', () => {
    const caps = computeRamCaps([LA, LB, LC], ruleset);
    expect(caps).toEqual({ GREEN: 4, RED: 3, BLUE: 0, YELLOW: 0 });
  });

  it('computeRamCaps behandelt Legends ohne RAM als 0', () => {
    const caps = computeRamCaps([LNULL, LNULL, LC], ruleset);
    expect(caps.YELLOW).toBe(0);
    expect(caps.RED).toBe(3);
  });

  it('akzeptiert eine Karte genau am Cap (RAM 4 bei Cap 4)', () => {
    const cards = [
      { cardId: greenRam4.id, count: 3 },
      ...greens(19, 2), // 3 + 38 = 41 (im Bereich 40..50)
    ];
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'RAM_LIMIT')).toBe(false);
  });

  it('lehnt eine Karte über dem Cap ab (RAM 5 bei Cap 4)', () => {
    const cards = [{ cardId: greenRam5.id, count: 1 }, ...greens(20, 2)];
    const res = validate(deck({ cards }), ruleset, index);
    expect(has(res, 'RAM_LIMIT')).toBe(true);
  });

  it('lehnt eine Karte einer Farbe ohne Legend dieser Farbe ab', () => {
    // Kein blaues Legend → Cap BLUE = 0 → jede blaue Karte mit RAM > 0 illegal.
    const cards = [{ cardId: blueRam2.id, count: 1 }, ...greens(20, 2)];
    const res = validate(deck({ cards }), ruleset, index);
    const ram = res.violations.find((v) => v.code === 'RAM_LIMIT');
    expect(ram?.color).toBe('BLUE');
  });
});

// --- Sonstiges & Gesamtergebnis ------------------------------------------

describe('Validator — Gesamtverhalten', () => {
  it('ein sauberes Deck ist ok mit leerer Verletzungsliste', () => {
    const res = validate(deck({ cards: greens(20, 2) }), ruleset, index);
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it('meldet eine unbekannte Karte im Deck', () => {
    const res = validate(
      deck({ cards: [{ cardId: 'ghost', count: 2 }, ...greens(19, 2)] }),
      ruleset,
      index,
    );
    expect(has(res, 'CARD_NOT_FOUND')).toBe(true);
  });

  it('sammelt mehrere Verletzungen gleichzeitig', () => {
    // Zu klein (2 Karten), 4 Kopien, RAM über Cap — alles auf einmal.
    const res = validate(
      deck({ cards: [{ cardId: greenRam5.id, count: 4 }] }),
      ruleset,
      index,
    );
    expect(res.ok).toBe(false);
    expect(has(res, 'DECK_SIZE')).toBe(true);
    expect(has(res, 'MAX_COPIES')).toBe(true);
    expect(has(res, 'RAM_LIMIT')).toBe(true);
  });

  it('jede Verletzung trägt eine nicht-leere Meldung', () => {
    const res = validate(
      deck({ cards: [{ cardId: greenRam5.id, count: 4 }] }),
      ruleset,
      index,
    );
    for (const v of res.violations) {
      expect(v.message.length).toBeGreaterThan(0);
    }
  });
});
