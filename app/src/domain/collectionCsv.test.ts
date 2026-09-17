import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card, type CollectionEntry, type Printing } from './types';
import { collectionToCsv, CSV_HEADER } from './collectionCsv';

function card(id: string, name: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    setCode: 'TST',
    name,
    type: 'UNIT',
    color: 'RED',
    tags: [],
    rarity: 'Common',
    rulesText: '',
    ...extra,
  };
}

const catalog: Card[] = [
  card('r1', 'Alpha', { color: 'RED', collectorNumber: '001', rarity: 'Rare' }),
  card('b1', 'Beta, Jr.', { color: 'BLUE', subtitle: 'The "Kid"', type: 'LEGEND' }),
];
const index = buildCardIndex(catalog);
const printings: Printing[] = catalog.map((c) => ({ id: c.id, cardId: c.id, variant: 'STANDARD' }));
const pIndex = new Map(printings.map((p) => [p.id, p]));

function entry(printingId: string, quantity: number): CollectionEntry {
  return { printingId, quantity, addedAt: 0 };
}

describe('collectionToCsv', () => {
  it('Kopfzeile + eine Zeile je Karte, nach Farbe/Name sortiert', () => {
    const csv = collectionToCsv([entry('r1', 2), entry('b1', 1)], pIndex, index);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    // BLUE vor RED (Farbe alphabetisch)
    expect(lines[1]).toContain('Beta');
    expect(lines[2]).toContain('Alpha');
    expect(lines).toHaveLength(3);
  });

  it('quotet Felder mit Komma/Anführungszeichen (RFC 4180)', () => {
    const csv = collectionToCsv([entry('b1', 1)], pIndex, index);
    // Name "Beta, Jr." → gequotet; Untertitel mit " → verdoppelt
    expect(csv).toContain('"Beta, Jr."');
    expect(csv).toContain('"The ""Kid"""');
  });

  it('überspringt Menge 0 und unbekannte Printings', () => {
    const csv = collectionToCsv([entry('r1', 0), entry('gibtsnicht', 3)], pIndex, index);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1); // nur Kopfzeile
  });
});
