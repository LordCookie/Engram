import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import type { Ruleset } from '../rules/ruleset';
import { type CardFeatures, type FeatureDB } from './synergy';
import { suggestAdditions, deckSynergyRating, deckSynergyStats } from './deckSynergy';

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}
function feat(over: Partial<CardFeatures>): CardFeatures {
  return { provides: [], payoffFor: [], themes: [], tags: [], tagPayoff: [], evidence: '', ...over };
}

const ruleset: Ruleset = {
  version: 'test',
  legendCount: 1,
  legendNamesMustBeUnique: true,
  deckMin: 1,
  deckMax: 60,
  maxCopiesPerCard: 3,
  colors: ['GREEN', 'RED'],
  ramScope: 'perColor',
};

// Legend L (GREEN, RAM 2). A synergiert mit L; B nicht; R ist rot (RAM-Cap 0 → illegal).
const index = buildCardIndex([
  card({ id: 'L', type: 'LEGEND', color: 'GREEN', ram: 2 }),
  card({ id: 'A', type: 'UNIT', color: 'GREEN', ram: 1 }),
  card({ id: 'B', type: 'UNIT', color: 'GREEN', ram: 1 }),
  card({ id: 'R', type: 'UNIT', color: 'RED', ram: 1 }),
]);
const db: FeatureDB = new Map([
  ['L', feat({ themes: ['T'] })],
  ['A', feat({ themes: ['T'] })],
  ['B', feat({})],
  ['R', feat({ themes: ['T'] })],
]);

describe('suggestAdditions', () => {
  it('schlägt synergierende, RAM-legale, noch nicht enthaltene Karten vor', () => {
    const s = suggestAdditions(['L'], [], index, db, ruleset);
    const ids = s.map((x) => x.card.id);
    expect(ids).toContain('A'); // synergiert + grün + RAM ok
    expect(ids).not.toContain('B'); // keine Synergie
    expect(ids).not.toContain('R'); // rot, Cap 0 → nicht spielbar
    expect(ids).not.toContain('L'); // Legends nicht vorschlagen
  });

  it('schließt bereits enthaltene Karten aus', () => {
    const s = suggestAdditions(['L'], ['A'], index, db, ruleset);
    expect(s.map((x) => x.card.id)).not.toContain('A');
  });

  it('kann auf den Bestand beschränken', () => {
    const owned = new Map([['A', 0]]); // A nicht besessen
    const s = suggestAdditions(['L'], [], index, db, ruleset, { ownedOnly: true, owned });
    expect(s.map((x) => x.card.id)).not.toContain('A');
  });
});

describe('deckSynergyRating', () => {
  it('bewertet ein synergierendes Deck höher als ein nicht synergierendes', () => {
    const withSyn = deckSynergyRating(['L'], ['A'], index, db);
    const without = deckSynergyRating(['L'], ['B'], index, db);
    expect(withSyn).toBeGreaterThan(without);
    expect(without).toBe(0);
  });
});

describe('deckSynergyStats', () => {
  it('zählt synergierende Karten; Füllkarten senken nur den Schnitt', () => {
    // A synergiert, B nicht → 1 von 2 Karten, Schnitt halb so hoch wie nur A.
    const s = deckSynergyStats(['L'], ['A', 'B'], index, db);
    expect(s.synergyCount).toBe(1);
    expect(s.cardCount).toBe(2);
    const onlyA = deckSynergyStats(['L'], ['A'], index, db);
    expect(onlyA.synergyCount).toBe(1);
    expect(onlyA.avg).toBeGreaterThan(s.avg); // Füllkarte B drückt den Schnitt
  });
});
