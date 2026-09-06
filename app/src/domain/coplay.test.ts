import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import type { Ruleset } from '../rules/ruleset';
import {
  toCorpusDeck,
  legalCorpusDecks,
  dedupeDecks,
  buildCorpus,
  mergeCorpora,
  coPlayPartners,
  coPlayLift,
  makeCoPlayScore,
  type CorpusDeck,
} from './coplay';
import { rulesetV1Loaded } from '../rules/ruleset';

// --- Testhilfen -----------------------------------------------------------

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}

const deck = (...cards: string[]): CorpusDeck => ({ cards });

// --- toCorpusDeck / dedupe ------------------------------------------------

describe('toCorpusDeck', () => {
  it('vereint Legends und Deckkarten zu einer deduplizierten Menge', () => {
    const cd = toCorpusDeck({
      legendIds: ['L1', 'L2', 'L1'],
      cards: [
        { cardId: 'A', count: 2 },
        { cardId: 'A', count: 1 },
        { cardId: 'B', count: 3 },
      ],
    });
    expect(new Set(cd.cards)).toEqual(new Set(['L1', 'L2', 'A', 'B']));
  });
});

describe('dedupeDecks', () => {
  it('entfernt inhaltsgleiche Decks unabhängig von der Reihenfolge', () => {
    const out = dedupeDecks([deck('A', 'B'), deck('B', 'A'), deck('A', 'C')]);
    expect(out).toHaveLength(2);
  });
});

// --- Legalitätsfilter -----------------------------------------------------

describe('legalCorpusDecks', () => {
  const ruleset: Ruleset = {
    version: 'test',
    legendCount: 1,
    legendNamesMustBeUnique: true,
    deckMin: 2,
    deckMax: 3,
    maxCopiesPerCard: 3,
    colors: ['RED'],
    ramScope: 'perColor',
  };
  const index = buildCardIndex([
    card({ id: 'L', type: 'LEGEND', color: 'RED', ram: 5, name: 'Legende' }),
    card({ id: 'A', type: 'UNIT', color: 'RED', ram: 1 }),
    card({ id: 'B', type: 'UNIT', color: 'RED', ram: 1 }),
  ]);

  it('behält nur validatorkonforme Decks und wandelt sie ins Korpus-Format', () => {
    const legal = { legendIds: ['L'], cards: [{ cardId: 'A', count: 1 }, { cardId: 'B', count: 1 }] };
    const tooSmall = { legendIds: ['L'], cards: [{ cardId: 'A', count: 1 }] };
    const out = legalCorpusDecks([legal, tooSmall], ruleset, index);
    expect(out).toHaveLength(1);
    expect(new Set(out[0].cards)).toEqual(new Set(['L', 'A', 'B']));
  });
});

// --- Korpus + Lift --------------------------------------------------------

describe('buildCorpus + coPlayPartners', () => {
  const index = buildCardIndex([
    card({ id: 'A', type: 'UNIT', color: 'RED' }),
    card({ id: 'B', type: 'UNIT', color: 'RED' }),
    card({ id: 'C', type: 'UNIT', color: 'GREEN' }),
    card({ id: 'D', type: 'UNIT', color: 'GREEN' }),
    card({ id: 'X', type: 'UNIT', color: 'BLUE' }),
  ]);
  // A&B immer zusammen; C&D immer zusammen; X unabhängig verstreut.
  const corpus = buildCorpus([
    deck('A', 'B', 'X'),
    deck('A', 'B'),
    deck('C', 'D', 'X'),
    deck('C', 'D'),
  ]);

  it('zählt df und Ko-Vorkommen korrekt', () => {
    expect(corpus.n).toBe(4);
    expect(corpus.df.get('A')).toBe(2);
    expect(corpus.df.get('X')).toBe(2);
    expect(corpus.co.get('A')!.get('B')).toBe(2);
    expect(corpus.co.get('A')!.get('X')).toBe(1);
    expect(corpus.co.get('A')?.get('C')).toBeUndefined();
  });

  it('rankt das stets gemeinsame Paar per Lift oben, schließt sich selbst aus', () => {
    const top = coPlayPartners('A', corpus, index, { minCoCount: 1 });
    expect(top.map((p) => p.card.id)).toEqual(['B', 'X']);
    expect(top[0].lift).toBeCloseTo(2.0); // 2*4/(2*2)
    expect(top[0].coCount).toBe(2);
    expect(top[1].lift).toBeCloseTo(1.0); // X unabhängig
    expect(top.some((p) => p.card.id === 'A')).toBe(false);
  });

  it('filtert schwach gestützte Paare über minCoCount', () => {
    const top = coPlayPartners('A', corpus, index, { minCoCount: 2 });
    expect(top.map((p) => p.card.id)).toEqual(['B']);
  });

  it('gibt für unbekannte oder nie gespielte Karten nichts zurück', () => {
    expect(coPlayPartners('unbekannt', corpus, index)).toEqual([]);
  });
});

describe('mergeCorpora', () => {
  it('summiert n, df und Ko-Vorkommen zweier Korpora', () => {
    const a = buildCorpus([deck('X', 'Y')]);
    const b = buildCorpus([deck('X', 'Y'), deck('X', 'Z')]);
    const m = mergeCorpora(a, b);
    expect(m.n).toBe(3);
    expect(m.df.get('X')).toBe(3); // 1 + 2
    expect(m.df.get('Y')).toBe(2); // 1 + 1
    expect(m.co.get('X')!.get('Y')).toBe(2); // 1 + 1 (X&Y in beiden)
    expect(m.co.get('X')!.get('Z')).toBe(1); // nur in b
  });
});

// --- Empirisch gewichteter Solver-Score -----------------------------------

describe('makeCoPlayScore', () => {
  // Legend L wird immer mit A gespielt, nie mit B.
  const corpus = buildCorpus([deck('L', 'A'), deck('L', 'A'), deck('C', 'B')]);
  const L = card({ id: 'L', type: 'LEGEND', color: 'GREEN', ram: 2 });
  const A = card({ id: 'A', type: 'UNIT', color: 'GREEN', ram: 1 });
  const B = card({ id: 'B', type: 'UNIT', color: 'GREEN', ram: 1 });
  const noCaps = { RED: 0, GREEN: 0, BLUE: 0, YELLOW: 0 };
  const ctx = (pc: typeof A) => ({
    legends: [L],
    caps: noCaps,
    playable: [{ card: pc, owned: 1, usable: 1 }],
    ruleset: rulesetV1Loaded,
  });

  it('coPlayLift misst Ko-Vorkommen, 0 ohne gemeinsames Deck', () => {
    expect(coPlayLift('L', 'A', corpus)).toBeCloseTo(1.5); // 2*3/(2*2)
    expect(coPlayLift('L', 'B', corpus)).toBe(0);
    expect(coPlayLift('L', 'unbekannt', corpus)).toBe(0);
  });

  it('bewertet mit den Legends zusammengespielte Karten höher', () => {
    const fn = makeCoPlayScore(corpus, 1);
    expect(fn(ctx(A))).toBeGreaterThan(fn(ctx(B)));
    expect(fn(ctx(B))).toBe(1); // reiner Mengenwert (kein Ko-Vorkommen mit L)
  });

  it('mit Gewicht 0 identisch zum Mengen-Score', () => {
    const fn = makeCoPlayScore(corpus, 0);
    expect(fn(ctx(A))).toBe(1);
    expect(fn(ctx(B))).toBe(1);
  });
});
