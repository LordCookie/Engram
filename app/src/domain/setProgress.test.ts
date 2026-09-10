import { describe, it, expect } from 'vitest';
import type { Card, CollectionEntry, Printing } from './types';
import { computeSetProgress, ownedCardIdSet } from './setProgress';

function card(id: string, color: Card['color'], rarity: string): Card {
  return {
    id,
    setCode: 'TST',
    name: id,
    type: 'UNIT',
    color,
    tags: [],
    rarity,
    rulesText: '',
  };
}

const catalog: Card[] = [
  card('r1', 'RED', 'Common'),
  card('r2', 'RED', 'Rare'),
  card('g1', 'GREEN', 'Common'),
  card('b1', 'BLUE', 'Epic'),
  card('y1', 'YELLOW', 'Common'),
];

const printings: Printing[] = catalog.map((c) => ({ id: c.id, cardId: c.id, variant: 'STANDARD' }));
const printingIndex = new Map(printings.map((p) => [p.id, p]));

function entry(printingId: string, quantity: number): CollectionEntry {
  return { printingId, quantity, addedAt: 0 };
}

describe('setProgress', () => {
  it('zählt eindeutige besessene Karten (Menge > 0), nicht Stückzahlen', () => {
    const owned = ownedCardIdSet([entry('r1', 3), entry('g1', 1)], printingIndex);
    const p = computeSetProgress(catalog, owned);
    expect(p.ownedCards).toBe(2);
    expect(p.totalCards).toBe(5);
  });

  it('ignoriert Einträge mit Menge 0 und unbekannte Printings', () => {
    const owned = ownedCardIdSet(
      [entry('r1', 0), entry('gibtsnicht', 5), entry('b1', 2)],
      printingIndex,
    );
    expect([...owned].sort()).toEqual(['b1']);
  });

  it('schlüsselt nach Farbe auf (feste Reihenfolge RGBY)', () => {
    const owned = ownedCardIdSet([entry('r1', 1), entry('b1', 1)], printingIndex);
    const p = computeSetProgress(catalog, owned);
    expect(p.byColor).toEqual([
      { key: 'RED', owned: 1, total: 2 },
      { key: 'GREEN', owned: 0, total: 1 },
      { key: 'BLUE', owned: 1, total: 1 },
      { key: 'YELLOW', owned: 0, total: 1 },
    ]);
  });

  it('schlüsselt nach Rarität in fester Reihenfolge auf', () => {
    const owned = ownedCardIdSet([entry('r2', 1)], printingIndex);
    const p = computeSetProgress(catalog, owned);
    expect(p.byRarity.map((b) => b.key)).toEqual(['Common', 'Rare', 'Epic']);
    const rare = p.byRarity.find((b) => b.key === 'Rare');
    expect(rare).toEqual({ key: 'Rare', owned: 1, total: 1 });
  });

  it('leere Sammlung = 0 besessen, Set-Größe bleibt', () => {
    const p = computeSetProgress(catalog, new Set());
    expect(p.ownedCards).toBe(0);
    expect(p.totalCards).toBe(5);
    expect(p.byColor.every((b) => b.owned === 0)).toBe(true);
  });
});
