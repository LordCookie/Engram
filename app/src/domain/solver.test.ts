import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { rulesetV1Loaded } from '../rules/ruleset';
import { solveLegends, defaultScore, type OwnedCounts, type ScoreFn } from './solver';
import syntheticSetJson from '../../tests/fixtures/synthetic-set.json';

const ruleset = rulesetV1Loaded;

// --- Testhilfen -----------------------------------------------------------

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}

function owned(pairs: Record<string, number>): OwnedCounts {
  return new Map(Object.entries(pairs));
}

// --- Aufzählung & Grundverhalten -----------------------------------------

describe('solveLegends — Aufzählung', () => {
  const L = [
    card({ id: 'LA', name: 'A', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LB', name: 'B', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LC', name: 'C', type: 'LEGEND', color: 'RED', ram: 3 }),
    card({ id: 'LD', name: 'D', type: 'LEGEND', color: 'BLUE', ram: 2 }),
  ];
  const index = buildCardIndex(L);

  it('zählt C(n,3) Triples bei n unterschiedlichen Legends', () => {
    const res = solveLegends(owned({ LA: 1, LB: 1, LC: 1, LD: 1 }), ruleset, index);
    expect(res.legendCount).toBe(4);
    expect(res.combinationCount).toBe(4); // C(4,3)
  });

  it('braucht nur je 1 Kopie einer Legend', () => {
    const res = solveLegends(owned({ LA: 1, LB: 1, LC: 1 }), ruleset, index);
    expect(res.combinationCount).toBe(1);
  });

  it('gibt bei weniger als 3 Legends keine Triples aus', () => {
    const res = solveLegends(owned({ LA: 1, LB: 1 }), ruleset, index);
    expect(res.legendCount).toBe(2);
    expect(res.combinationCount).toBe(0);
    expect(res.triples).toEqual([]);
  });

  it('überspringt Triples mit Namensdubletten', () => {
    const dup = buildCardIndex([
      L[0],
      card({ id: 'LA2', name: 'A', type: 'LEGEND', color: 'GREEN', ram: 2 }), // gleicher Name wie LA
      L[2],
      L[3],
    ]);
    // 4 Legends, aber LA und LA2 heißen gleich → Triples mit beiden fallen raus.
    const res = solveLegends(owned({ LA: 1, LA2: 1, LC: 1, LD: 1 }), ruleset, dup);
    expect(res.legendCount).toBe(4);
    expect(res.combinationCount).toBe(2); // nur {LA,LC,LD} und {LA2,LC,LD}
  });
});

// --- Spielbarer Pool & Caps ----------------------------------------------

describe('solveLegends — spielbarer Pool', () => {
  const index = buildCardIndex([
    card({ id: 'LG1', name: 'G1', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LG2', name: 'G2', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LR', name: 'R', type: 'LEGEND', color: 'RED', ram: 3 }),
    card({ id: 'cG1', name: 'grün 1', type: 'UNIT', color: 'GREEN', ram: 1 }),
    card({ id: 'cG5', name: 'grün 5', type: 'UNIT', color: 'GREEN', ram: 5 }),
    card({ id: 'cR2', name: 'rot 2', type: 'UNIT', color: 'RED', ram: 2 }),
    card({ id: 'cB2', name: 'blau 2', type: 'UNIT', color: 'BLUE', ram: 2 }),
  ]);

  const res = solveLegends(
    owned({ LG1: 1, LG2: 1, LR: 1, cG1: 5, cG5: 1, cR2: 3, cB2: 2 }),
    ruleset,
    index,
  );

  it('berechnet die RAM-Caps des Triples korrekt', () => {
    expect(res.combinationCount).toBe(1);
    expect(res.triples[0].caps).toEqual({ GREEN: 4, RED: 3, BLUE: 0, YELLOW: 0 });
  });

  it('lässt nur legal spielbare Karten in den Pool (RAM ≤ Cap, Farbe mit Cap)', () => {
    const ids = res.triples[0].playable.map((p) => p.card.id);
    expect(ids).toEqual(['cG1', 'cR2']); // cG5 (RAM 5>4) und cB2 (Cap 0) fehlen
  });

  it('kappt die nutzbare Stückzahl bei maxCopiesPerCard', () => {
    const cG1 = res.triples[0].playable.find((p) => p.card.id === 'cG1');
    expect(cG1?.owned).toBe(5);
    expect(cG1?.usable).toBe(3);
  });

  it('defaultScore summiert die nutzbaren Kopien', () => {
    expect(res.triples[0].score).toBe(6); // cG1:3 + cR2:3
    expect(res.triples[0].totalUsable).toBe(6);
    expect(res.triples[0].distinctPlayable).toBe(2);
  });
});

// --- Sortierung, topN, Determinismus, Ziel-Farben ------------------------

describe('solveLegends — Ranking & Optionen', () => {
  const index = buildCardIndex([
    card({ id: 'LG', name: 'G', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LR', name: 'R', type: 'LEGEND', color: 'RED', ram: 3 }),
    card({ id: 'LB', name: 'B', type: 'LEGEND', color: 'BLUE', ram: 2 }),
    card({ id: 'LY', name: 'Y', type: 'LEGEND', color: 'YELLOW', ram: 2 }),
    ...Array.from({ length: 5 }, (_, i) =>
      card({ id: `g${i}`, name: `g${i}`, type: 'UNIT', color: 'GREEN', ram: 1 }),
    ),
    card({ id: 'r0', name: 'r0', type: 'UNIT', color: 'RED', ram: 1 }),
    card({ id: 'b0', name: 'b0', type: 'UNIT', color: 'BLUE', ram: 1 }),
    card({ id: 'y0', name: 'y0', type: 'UNIT', color: 'YELLOW', ram: 1 }),
  ]);
  const stock = owned({
    LG: 1, LR: 1, LB: 1, LY: 1,
    g0: 1, g1: 1, g2: 1, g3: 1, g4: 1,
    r0: 1, b0: 1, y0: 1,
  });

  it('sortiert absteigend nach Score', () => {
    const res = solveLegends(stock, ruleset, index, { topN: 4 });
    // Triples mit grüner Legend schalten 5 Grüne frei → Score 7; ohne grün nur 3.
    expect(res.triples[0].score).toBe(7);
    expect(res.triples[res.triples.length - 1].score).toBe(3);
    for (let i = 1; i < res.triples.length; i++) {
      expect(res.triples[i - 1].score).toBeGreaterThanOrEqual(res.triples[i].score);
    }
  });

  it('respektiert topN', () => {
    const res = solveLegends(stock, ruleset, index, { topN: 2 });
    expect(res.triples).toHaveLength(2);
    expect(res.combinationCount).toBe(4); // ausgewertet werden trotzdem alle
  });

  it('ist deterministisch', () => {
    const a = solveLegends(stock, ruleset, index, { topN: 4 });
    const b = solveLegends(stock, ruleset, index, { topN: 4 });
    expect(a).toEqual(b);
  });

  it('schränkt bei targetColors auf Zielfarben ein und filtert Triples ohne die Farbe', () => {
    const res = solveLegends(stock, ruleset, index, { targetColors: ['GREEN'] });
    // Nur Triples mit grünem Cap > 0 → das Triple {LR,LB,LY} fällt raus.
    expect(res.combinationCount).toBe(3);
    expect(res.triples[0].score).toBe(5); // 5 grüne Karten
    for (const t of res.triples) {
      expect(t.caps.GREEN).toBeGreaterThan(0);
      for (const p of t.playable) expect(p.card.color).toBe('GREEN');
    }
  });

  it('erlaubt eine austauschbare Score-Funktion', () => {
    const constScore: ScoreFn = () => 42;
    const res = solveLegends(stock, ruleset, index, { score: constScore, topN: 1 });
    expect(res.triples[0].score).toBe(42);
  });

  it('defaultScore ist als Baustein direkt aufrufbar', () => {
    const playable = [
      { card: index.get('g0')!, owned: 1, usable: 1 },
      { card: index.get('g1')!, owned: 4, usable: 3 },
    ];
    expect(defaultScore({ legends: [], caps: { RED: 0, GREEN: 0, BLUE: 0, YELLOW: 0 }, playable, ruleset })).toBe(4);
  });
});

// --- Realistischer Durchlauf über das synthetische Fixture ---------------

describe('solveLegends — synthetisches Fixture', () => {
  const cards = syntheticSetJson as Card[];
  const index = buildCardIndex(cards);
  // Bestand: 3 Kopien von allem.
  const stock: OwnedCounts = new Map(cards.map((c) => [c.id, 3]));

  it('zählt alle 35 Triples aus 7 Legends aus', () => {
    const res = solveLegends(stock, ruleset, index);
    expect(res.legendCount).toBe(7);
    expect(res.combinationCount).toBe(35); // C(7,3)
  });

  it('findet als Bestes ein Triple mit 7 spielbaren Karten (Score 21)', () => {
    const res = solveLegends(stock, ruleset, index);
    expect(res.triples[0].distinctPlayable).toBe(7);
    expect(res.triples[0].score).toBe(21); // 7 Karten × 3 nutzbare Kopien
  });

  it('liefert bei targetColors GREEN das doppelgrüne Optimum (Score 12)', () => {
    const res = solveLegends(stock, ruleset, index, { targetColors: ['GREEN'] });
    expect(res.combinationCount).toBe(25); // 35 − C(5,3) Triples ganz ohne Grün
    expect(res.triples[0].score).toBe(12); // sprout, mend, vine, oak × 3
    for (const p of res.triples[0].playable) expect(p.card.color).toBe('GREEN');
  });
});
