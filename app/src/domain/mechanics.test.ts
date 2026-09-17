import { describe, it, expect } from 'vitest';
import type { CardFeatures, FeatureDB } from './synergy';
import { allMechanics, cardsWithMechanic, prettyMechanic } from './mechanics';

function f(p: Partial<CardFeatures>): CardFeatures {
  return { provides: [], payoffFor: [], themes: [], tags: [], tagPayoff: [], evidence: '', ...p };
}

const db: FeatureDB = new Map<string, CardFeatures>([
  ['a', f({ provides: ['HIGH_GIG'], tags: ['GANGER'] })],
  ['b', f({ payoffFor: ['GIG_STEAL'], themes: ['GO_SOLO'] })],
  ['c', f({ tags: ['GANGER', 'ARASAKA'] })],
]);

describe('mechanics', () => {
  it('allMechanics: eindeutig + alphabetisch', () => {
    expect(allMechanics(db)).toEqual(['ARASAKA', 'GANGER', 'GIG_STEAL', 'GO_SOLO', 'HIGH_GIG']);
  });

  it('cardsWithMechanic findet über alle Felder', () => {
    expect(cardsWithMechanic(db, 'GANGER').sort()).toEqual(['a', 'c']);
    expect(cardsWithMechanic(db, 'GO_SOLO')).toEqual(['b']);
    expect(cardsWithMechanic(db, 'GIBTS_NICHT')).toEqual([]);
  });

  it('prettyMechanic macht Tokens lesbar', () => {
    expect(prettyMechanic('GO_SOLO')).toBe('Go Solo');
    expect(prettyMechanic('HIGH_GIG')).toBe('High Gig');
    expect(prettyMechanic('ARASAKA')).toBe('Arasaka');
  });
});
