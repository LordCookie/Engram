import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import { rulesetV1Loaded } from '../rules/ruleset';
import { buildCardIndex, type Card, type CollectionEntry, type Printing } from './types';
import {
  collectionToOwnedCounts,
  totalCards,
  collectionProgress,
} from './collection';

// Deterministisch gegen das Fixture testen, unabhaengig von gezogenen Echtdaten.
const catalog = syntheticSet as Card[];
const cardIndex = buildCardIndex(catalog);
const printingIndex = new Map<string, Printing>(
  catalog.map((c) => [c.id, { id: c.id, cardId: c.id, variant: 'STANDARD' }]),
);

function entry(printingId: string, quantity: number): CollectionEntry {
  return { printingId, quantity, addedAt: 0 };
}

describe('collectionToOwnedCounts', () => {
  it('aggregiert mehrere Einträge desselben Printings auf Karten-Ebene', () => {
    const owned = collectionToOwnedCounts(
      [entry('grn-sprout', 2), entry('grn-sprout', 1), entry('leg-vex', 1)],
      printingIndex,
    );
    expect(owned.get('grn-sprout')).toBe(3);
    expect(owned.get('leg-vex')).toBe(1);
  });

  it('ignoriert Einträge mit Menge ≤ 0', () => {
    const owned = collectionToOwnedCounts([entry('grn-sprout', 0)], printingIndex);
    expect(owned.has('grn-sprout')).toBe(false);
  });
});

describe('totalCards', () => {
  it('summiert alle Stückzahlen', () => {
    expect(totalCards([entry('a', 3), entry('b', 2)])).toBe(5);
  });
});

describe('collectionProgress', () => {
  it('zählt unterschiedliche besessene Karten je Farbe gegen den Katalog', () => {
    const progress = collectionProgress(
      [entry('grn-sprout', 4), entry('leg-vex', 1)],
      printingIndex,
      catalog,
      cardIndex,
      rulesetV1Loaded.colors,
    );
    const green = progress.find((p) => p.color === 'GREEN');
    // Fixture hat 7 grüne Karten (inkl. 2 grüne Legends); besessen: 2 verschiedene.
    expect(green?.total).toBe(7);
    expect(green?.owned).toBe(2);
  });
});
