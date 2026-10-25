import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import { buildCardIndex, type Card } from './types';
import { metaDeckOwnership, parseMetaDecks } from './metaDecks';

const catalog = syntheticSet as Card[];
const index = buildCardIndex(catalog);

function rawDeck(extra: Record<string, unknown> = {}) {
  return {
    id: 'test-deck',
    name: { de: 'Testdeck', en: 'Test deck' },
    tag: { de: 'Stark', en: 'Strong' },
    evidence: { de: ['Beleg'], en: ['Evidence'] },
    plan: { de: ['Plan'] },
    weak: { de: 'Langsam', en: 'Slow' },
    side: 'ohne',
    source: 'https://example.org/guide',
    legendIds: ['leg-vex', 'leg-mara', 'leg-kilo'],
    cards: [
      { cardId: 'grn-sprout', count: 3 },
      { cardId: 'grn-mend', count: 2 },
    ],
    ...extra,
  };
}

describe('parseMetaDecks', () => {
  it('liest ein gültiges Deck samt Texten', () => {
    const set = parseMetaDecks({ updated: '2026-10-25', decks: [rawDeck()] }, index);
    expect(set.updated).toBe('2026-10-25');
    expect(set.decks).toHaveLength(1);
    const d = set.decks[0];
    expect(d.name).toEqual({ de: 'Testdeck', en: 'Test deck' });
    expect(d.cards).toHaveLength(2);
    // fehlendes Englisch fällt auf Deutsch zurück, einfacher Text gilt für beide
    expect(d.plan.en).toEqual(['Plan']);
    expect(d.side).toEqual({ de: 'ohne', en: 'ohne' });
  });

  it('verwirft Decks mit unbekannter Karte oder ohne drei Legends', () => {
    const unknown = rawDeck({ id: 'a', cards: [{ cardId: 'gibt-es-nicht', count: 2 }] });
    const twoLegends = rawDeck({ id: 'b', legendIds: ['leg-vex', 'leg-mara'] });
    const legendAsCard = rawDeck({ id: 'c', cards: [{ cardId: 'leg-vex', count: 1 }] });
    const set = parseMetaDecks({ decks: [unknown, twoLegends, legendAsCard, rawDeck()] }, index);
    expect(set.decks.map((d) => d.id)).toEqual(['test-deck']);
  });

  it('kaputte oder fehlende Datei → leer', () => {
    expect(parseMetaDecks(undefined, index).decks).toEqual([]);
    expect(parseMetaDecks({ decks: 'x' }, index).decks).toEqual([]);
  });
});

describe('metaDeckOwnership', () => {
  const deck = parseMetaDecks({ decks: [rawDeck()] }, index).decks[0];

  it('leere Sammlung: alles fehlt (3 Legends + 5 Karten)', () => {
    const o = metaDeckOwnership(deck, new Map());
    expect(o).toMatchObject({ have: 0, total: 8 });
    expect(o.missing).toHaveLength(5);
  });

  it('Bestand zählt höchstens bis zur Sollmenge', () => {
    const owned = new Map([
      ['leg-vex', 2],
      ['grn-sprout', 5],
      ['grn-mend', 1],
    ]);
    const o = metaDeckOwnership(deck, owned);
    expect(o.have).toBe(1 + 3 + 1);
    expect(o.missing).toEqual([
      { cardId: 'leg-mara', count: 1 },
      { cardId: 'leg-kilo', count: 1 },
      { cardId: 'grn-mend', count: 2 },
    ]);
  });
});
