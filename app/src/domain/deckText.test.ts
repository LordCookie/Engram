import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import { buildCardIndex, type Card } from './types';
import { emptyDraft } from './deckDraft';
import { deckToText, parseDeckText } from './deckText';

const catalog = syntheticSet as Card[];
const index = buildCardIndex(catalog);

function ids(parsed: { legendIds: string[] }) {
  return [...parsed.legendIds].sort();
}
function counts(parsed: { cards: { cardId: string; count: number }[] }) {
  return Object.fromEntries(parsed.cards.map((c) => [c.cardId, c.count]));
}

describe('deckText', () => {
  it('Round-Trip: Deck → Text → Deck bleibt gleich', () => {
    const draft = {
      ...emptyDraft('v', 'd1', 'RT-Deck'),
      legendIds: ['leg-vex', 'leg-mara', 'leg-kilo'],
      cards: [
        { cardId: 'grn-sprout', count: 3 },
        { cardId: 'grn-mend', count: 2 },
        { cardId: 'red-blast', count: 2 },
      ],
    };
    const parsed = parseDeckText(deckToText(draft, index), catalog, index);
    expect(ids(parsed)).toEqual(['leg-kilo', 'leg-mara', 'leg-vex']);
    expect(counts(parsed)).toEqual({ 'grn-sprout': 3, 'grn-mend': 2, 'red-blast': 2 });
    expect(parsed.name).toBe('RT-Deck');
  });

  it('parst MTG-Varianten „N“, „Nx“, „N x“', () => {
    const parsed = parseDeckText('3 Sprout\n3x Mend\n3 x Vine', catalog, index);
    expect(counts(parsed)).toEqual({ 'grn-sprout': 3, 'grn-mend': 3, 'grn-vine': 3 });
  });

  it('erkennt Legends am Kartentyp (mit/ohne Subtitle, verschiedene Trenner)', () => {
    expect(ids(parseDeckText('1 Vex: Root Whisperer', catalog, index))).toEqual(['leg-vex']);
    expect(ids(parseDeckText('1 Vex — Root Whisperer', catalog, index))).toEqual(['leg-vex']);
    expect(ids(parseDeckText('1 Vex', catalog, index))).toEqual(['leg-vex']);
  });

  it('sammelt nicht erkennbare Zeilen in unresolved', () => {
    const parsed = parseDeckText('3 Sprout\n2 Gibt Es Nicht', catalog, index);
    expect(counts(parsed)).toEqual({ 'grn-sprout': 3 });
    expect(parsed.unresolved).toEqual(['2 Gibt Es Nicht']);
  });

  it('ignoriert Kommentare, nimmt aber den Decknamen', () => {
    const parsed = parseDeckText('// engram deck: Mein Deck\n# irgendwas\n3 Sprout', catalog, index);
    expect(parsed.name).toBe('Mein Deck');
    expect(counts(parsed)).toEqual({ 'grn-sprout': 3 });
  });
});
