import { describe, it, expect } from 'vitest';
import { decodeDeckQr, encodeDeckQr, isDeckQr, DECK_QR_PREFIX } from './deckQr';
import { buildCardIndex, type Card } from './types';
import starters from '../data/starters.json';

const card = (id: string): Card => ({
  id,
  setCode: 'WNC',
  name: id,
  type: 'UNIT',
  color: 'RED',
  tags: [],
  rarity: 'Common',
  rulesText: '',
});
const INDEX = buildCardIndex(['v-streetkid', 'jackie', 'delamain-cab', 'corpo-security'].map(card));

describe('Deck-QR', () => {
  it('Round-Trip: Name (mit Umlaut), Legends, Karten', () => {
    const text = encodeDeckQr({
      name: 'Grüne Übermacht',
      legendIds: ['v-streetkid', 'jackie'],
      cards: [
        { cardId: 'delamain-cab', count: 3 },
        { cardId: 'corpo-security', count: 2 },
        { cardId: 'jackie', count: 0 }, // 0er fallen weg
      ],
    });
    expect(text.startsWith(`${DECK_QR_PREFIX}\n`)).toBe(true);
    expect(/^[\x20-\x7e\n]*$/.test(text)).toBe(true); // reines ASCII
    expect(decodeDeckQr(text, INDEX)).toEqual({
      name: 'Grüne Übermacht',
      legendIds: ['v-streetkid', 'jackie'],
      cards: [
        { cardId: 'delamain-cab', count: 3 },
        { cardId: 'corpo-security', count: 2 },
      ],
      unresolved: [],
    });
  });

  it('unbekannte Karten landen in unresolved, fremde QR-Codes → null', () => {
    const r = decodeDeckQr('EGD1\nX\nv-streetkid,neu-legend\n3*delamain-cab,2*neue-karte,kaputt', INDEX);
    expect(r?.legendIds).toEqual(['v-streetkid']);
    expect(r?.cards).toEqual([{ cardId: 'delamain-cab', count: 3 }]);
    expect(r?.unresolved).toEqual(['neu-legend', '2*neue-karte', 'kaputt']);
    expect(decodeDeckQr('https://example.com', INDEX)).toBeNull();
    expect(isDeckQr('EGD1 kein Zeilenumbruch')).toBe(false);
  });

  it('ein echtes Starterdeck passt bequem in einen QR-Code', () => {
    const s = starters[0];
    const cards = Object.entries(s.cards)
      .filter((e): e is [string, number] => typeof e[1] === 'number')
      .map(([cardId, count]) => ({ cardId, count }));
    const text = encodeDeckQr({ name: s.name, legendIds: s.legendIds, cards });
    expect(text.length).toBeLessThan(900); // QR Version ~20 bei Fehlerkorrektur M
    expect(decodeDeckQr(text, buildCardIndex([...s.legendIds, ...cards.map((c) => c.cardId)].map(card)))?.cards).toHaveLength(
      cards.length,
    );
  });
});
