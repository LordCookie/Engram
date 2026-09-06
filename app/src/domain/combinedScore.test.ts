import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { rulesetV1Loaded } from '../rules/ruleset';
import { buildCorpus, type Corpus } from './coplay';
import { type CardFeatures, type FeatureDB } from './synergy';
import { makeCombinedScore } from './combinedScore';

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}
function feat(over: Partial<CardFeatures>): CardFeatures {
  return { provides: [], payoffFor: [], themes: [], tags: [], tagPayoff: [], evidence: '', ...over };
}

// Testwelt: Legend L. A synergiert NUR vorhergesagt (Theme) mit L. B wird NUR
// empirisch mit L zusammen gespielt. N hat weder noch.
const L = card({ id: 'L', type: 'LEGEND', color: 'GREEN', ram: 2 });
const A = card({ id: 'A', type: 'UNIT', color: 'GREEN', ram: 1 });
const B = card({ id: 'B', type: 'UNIT', color: 'GREEN', ram: 1 });
const N = card({ id: 'N', type: 'UNIT', color: 'GREEN', ram: 1 });
const X = card({ id: 'X', type: 'UNIT', color: 'GREEN', ram: 1 });
const index = buildCardIndex([L, A, B, N, X]);

const db: FeatureDB = new Map([
  ['L', feat({ themes: ['T'] })],
  ['A', feat({ themes: ['T'] })], // Theme-Match mit L → vorhergesagte Synergie
  ['B', feat({})],
  ['N', feat({})],
  ['X', feat({})],
]);
// B liegt zweimal mit L im selben Deck, A/N nie.
const corpus: Corpus = buildCorpus([['L', 'B'], ['L', 'B'], ['X', 'A']].map((cards) => ({ cards })));
const emptyCorpus: Corpus = buildCorpus([]);

const ctx = (pc: Card, legends: Card[] = [L]) => ({
  legends,
  caps: { RED: 0, GREEN: 0, BLUE: 0, YELLOW: 0 },
  playable: [{ card: pc, owned: 1, usable: 1 }],
  ruleset: rulesetV1Loaded,
});

describe('makeCombinedScore', () => {
  it('normalisiert fair: 50/50 stellt nur-vorhergesagt und nur-empirisch gleich', () => {
    const fn = makeCombinedScore(db, corpus, index, { weight: 1, blend: 0.5 });
    expect(fn(ctx(A))).toBeCloseTo(fn(ctx(B))); // trotz sehr verschiedener Rohskalen
    expect(fn(ctx(A))).toBeGreaterThan(fn(ctx(N)));
    expect(fn(ctx(N))).toBe(1); // reiner Mengenwert
  });

  it('blend = 1 gewichtet nur die Vorhersage', () => {
    const fn = makeCombinedScore(db, corpus, index, { weight: 1, blend: 1 });
    expect(fn(ctx(A))).toBeGreaterThan(fn(ctx(B)));
    expect(fn(ctx(B))).toBe(1);
  });

  it('blend = 0 gewichtet nur die Empirie', () => {
    const fn = makeCombinedScore(db, corpus, index, { weight: 1, blend: 0 });
    expect(fn(ctx(B))).toBeGreaterThan(fn(ctx(A)));
    expect(fn(ctx(A))).toBe(1);
  });

  it('mit Gewicht 0 identisch zum Mengen-Score', () => {
    const fn = makeCombinedScore(db, corpus, index, { weight: 0, blend: 0.5 });
    expect(fn(ctx(A))).toBe(1);
    expect(fn(ctx(B))).toBe(1);
  });

  it('fehlt eine Quelle, wird auf die vorhandene renormalisiert (nicht abgeschwächt)', () => {
    // Leeres Korpus → nur Vorhersage. Bei blend 0.5 zählt A trotzdem voll.
    const half = makeCombinedScore(db, emptyCorpus, index, { weight: 1, blend: 0.5 });
    const full = makeCombinedScore(db, emptyCorpus, index, { weight: 1, blend: 1 });
    expect(half(ctx(A))).toBeCloseTo(full(ctx(A)));
    expect(half(ctx(A))).toBeGreaterThan(1);
  });
});
