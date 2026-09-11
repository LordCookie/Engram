import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { emptyDraft } from './deckDraft';
import { deckRarityBudget, isCostlyRarity } from './deckRarity';

function card(id: string, rarity: string, type: Card['type'] = 'UNIT'): Card {
  return { id, setCode: 'TST', name: id, type, color: 'RED', tags: [], rarity, rulesText: '' };
}

const catalog: Card[] = [
  card('leg1', 'Rare', 'LEGEND'),
  card('leg2', 'Epic', 'LEGEND'),
  card('c1', 'Common'),
  card('u1', 'Uncommon'),
  card('r1', 'Rare'),
];
const index = buildCardIndex(catalog);

function draftOf() {
  return {
    ...emptyDraft('v', 'd1', 'T'),
    legendIds: ['leg1', 'leg2'],
    cards: [
      { cardId: 'c1', count: 3 },
      { cardId: 'u1', count: 2 },
      { cardId: 'r1', count: 3 },
    ],
  };
}

describe('deckRarity', () => {
  it('zählt Kopien je Rarität inkl. Legends, in fester Reihenfolge', () => {
    const budget = deckRarityBudget(draftOf(), index);
    expect(budget).toEqual([
      { rarity: 'Common', count: 3 },
      { rarity: 'Uncommon', count: 2 },
      { rarity: 'Rare', count: 4 }, // leg1 (1) + r1 (3)
      { rarity: 'Epic', count: 1 }, // leg2
    ]);
  });

  it('markiert Rare+ als „teuer"', () => {
    expect(isCostlyRarity('Common')).toBe(false);
    expect(isCostlyRarity('Uncommon')).toBe(false);
    expect(isCostlyRarity('Rare')).toBe(true);
    expect(isCostlyRarity('Epic')).toBe(true);
    expect(isCostlyRarity('Secret')).toBe(true);
  });

  it('leeres Deck = leeres Budget', () => {
    expect(deckRarityBudget(emptyDraft('v'), index)).toEqual([]);
  });
});
