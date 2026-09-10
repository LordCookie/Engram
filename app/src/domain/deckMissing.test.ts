import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import { buildCardIndex, type Card } from './types';
import { emptyDraft } from './deckDraft';
import { deckMissing } from './deckMissing';

const catalog = syntheticSet as Card[];
const index = buildCardIndex(catalog);

function draftOf() {
  return {
    ...emptyDraft('v', 'd1', 'Test'),
    legendIds: ['leg-vex', 'leg-mara', 'leg-kilo'],
    cards: [
      { cardId: 'grn-sprout', count: 3 },
      { cardId: 'grn-mend', count: 2 },
    ],
  };
}

describe('deckMissing', () => {
  it('leere Sammlung: alles fehlt, inkl. Legends', () => {
    const m = deckMissing(draftOf(), new Map(), index);
    // 3 Legends (je 1) + 3 Sprout + 2 Mend = 8 Kopien
    expect(m.totalMissing).toBe(8);
    expect(m.cards.filter((c) => c.isLegend)).toHaveLength(3);
  });

  it('Legends stehen oben', () => {
    const m = deckMissing(draftOf(), new Map(), index);
    expect(m.cards[0].isLegend).toBe(true);
    expect(m.cards[1].isLegend).toBe(true);
    expect(m.cards[2].isLegend).toBe(true);
    expect(m.cards[3].isLegend).toBe(false);
  });

  it('Bestand wird verrechnet; voll gedeckte Karten fallen raus', () => {
    const owned = new Map([
      ['leg-vex', 1], // Legend gedeckt
      ['grn-sprout', 3], // voll gedeckt
      ['grn-mend', 1], // 1 von 2 → 1 fehlt
    ]);
    const m = deckMissing(draftOf(), owned, index);
    const ids = m.cards.map((c) => c.card.id).sort();
    expect(ids).toEqual(['grn-mend', 'leg-kilo', 'leg-mara']);
    expect(m.totalMissing).toBe(2 + 1); // 2 fehlende Legends + 1 Mend
  });

  it('vollständig besessen = nichts fehlt', () => {
    const owned = new Map([
      ['leg-vex', 1],
      ['leg-mara', 1],
      ['leg-kilo', 1],
      ['grn-sprout', 3],
      ['grn-mend', 2],
    ]);
    const m = deckMissing(draftOf(), owned, index);
    expect(m.cards).toHaveLength(0);
    expect(m.totalMissing).toBe(0);
  });
});
