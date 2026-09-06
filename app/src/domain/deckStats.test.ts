import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { rulesetV1Loaded } from '../rules/ruleset';
import { computeDeckStats } from './deckStats';

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}

const index = buildCardIndex([
  card({ id: 'LG1', type: 'LEGEND', color: 'GREEN', ram: 2 }),
  card({ id: 'LG2', type: 'LEGEND', color: 'GREEN', ram: 2 }),
  card({ id: 'LR', type: 'LEGEND', color: 'RED', ram: 3 }),
  card({ id: 'g1', type: 'UNIT', color: 'GREEN', ram: 1, cost: 1 }),
  card({ id: 'g4', type: 'UNIT', color: 'GREEN', ram: 4, cost: 4 }),
  card({ id: 'r2', type: 'GEAR', color: 'RED', ram: 2, cost: 2 }),
]);

const deck = {
  legendIds: ['LG1', 'LG2', 'LR'],
  cards: [
    { cardId: 'g1', count: 3 },
    { cardId: 'g4', count: 2 },
    { cardId: 'r2', count: 2 },
  ],
};

describe('computeDeckStats', () => {
  const stats = computeDeckStats(deck, rulesetV1Loaded, index);

  it('zählt Deckgröße und Legends', () => {
    expect(stats.deckSize).toBe(7);
    expect(stats.legendCount).toBe(3);
  });

  it('liefert Cap, Kartenzahl und max-RAM je Farbe', () => {
    const green = stats.byColor.find((c) => c.color === 'GREEN')!;
    expect(green).toMatchObject({ cap: 4, cardCount: 5, maxRam: 4 });
    const red = stats.byColor.find((c) => c.color === 'RED')!;
    expect(red).toMatchObject({ cap: 3, cardCount: 2, maxRam: 2 });
    const blue = stats.byColor.find((c) => c.color === 'BLUE')!;
    expect(blue).toMatchObject({ cap: 0, cardCount: 0, maxRam: 0 });
  });

  it('baut die Cost-Kurve inkl. Lücken', () => {
    expect(stats.costCurve).toEqual([
      { cost: 0, count: 0 },
      { cost: 1, count: 3 },
      { cost: 2, count: 2 },
      { cost: 3, count: 0 },
      { cost: 4, count: 2 },
    ]);
  });

  it('zählt Kartentypen (ohne Legends)', () => {
    expect(stats.typeCounts).toEqual({ UNIT: 5, GEAR: 2 });
  });
});
