import { describe, it, expect } from 'vitest';
import { netdeckPageLink, newCardsFromNetdeck, normalizeNetdeckCard, type NetdeckItem } from './cardImport';

// Dasselbe gekürzte API-Item wie in pipeline/test_fetch_cards.py (V: Streetkid) —
// TS- und Python-Normalisierung müssen dasselbe Ergebnis liefern.
const SAMPLE: NetdeckItem = {
  name: 'V',
  subname: 'Streetkid',
  display_name: 'V: Streetkid',
  slug: 'v-streetkid',
  rules_text: '{Call} Trash 3.',
  printing_id: '3fc63c58-5954-4744-a5af-047bfc5cb159',
  set: { code: 'welcometonightcityretail' },
  rarity: 'Rare',
  color: 'Red',
  card_type: 'Legend',
  classifications: ['Merc'],
  keywords: [],
  cost: 5,
  power: 6,
  ram: 2,
  print_number: '005a',
};

const SAMPLE_NULLABLE: NetdeckItem = {
  slug: 'rebecca-having-a-moment',
  name: 'Rebecca',
  subname: 'Having a Moment',
  set: { code: 'welcometonightcityretail' },
  rarity: 'Rare',
  color: 'Red',
  card_type: 'Legend',
  classifications: [],
  keywords: [],
  cost: null,
  power: null,
  ram: null,
  rules_text: '',
};

describe('normalizeNetdeckCard (gleich wie fetch_cards.py)', () => {
  it('volles Item', () => {
    expect(normalizeNetdeckCard(SAMPLE)).toEqual({
      id: 'v-streetkid',
      setCode: 'welcometonightcityretail',
      name: 'V',
      type: 'LEGEND',
      color: 'RED',
      tags: ['Merc'],
      rarity: 'Rare',
      rulesText: '{Call} Trash 3.',
      subtitle: 'Streetkid',
      collectorNumber: '005a',
      ram: 2,
      cost: 5,
      power: 6,
    });
  });

  it('leere Werte tauchen nicht auf', () => {
    const card = normalizeNetdeckCard(SAMPLE_NULLABLE);
    expect(card).not.toHaveProperty('ram');
    expect(card).not.toHaveProperty('cost');
    expect(card).not.toHaveProperty('power');
    expect(card?.type).toBe('LEGEND');
  });

  it('unbekannte Farbe oder Typ → null', () => {
    expect(normalizeNetdeckCard({ ...SAMPLE, color: 'Purple' })).toBeNull();
    expect(normalizeNetdeckCard({ ...SAMPLE, card_type: 'Location' })).toBeNull();
  });

  it('Link zur offiziellen Datenbank', () => {
    expect(netdeckPageLink(SAMPLE)?.pageUrl).toBe(
      'https://cyberpunktcg.com/cards/v-streetkid?printing=3fc63c58-5954-4744-a5af-047bfc5cb159',
    );
  });
});

describe('newCardsFromNetdeck', () => {
  it('nur unbekannte Slugs, ohne Doppelte, sortiert', () => {
    const r = newCardsFromNetdeck(
      [SAMPLE, SAMPLE_NULLABLE, { ...SAMPLE_NULLABLE }],
      new Set(['v-streetkid']),
    );
    expect(r.cards.map((c) => c.id)).toEqual(['rebecca-having-a-moment']);
    expect(r.links.map((l) => l.cardId)).toEqual(['rebecca-having-a-moment']);
  });

  it('meldet neue Karten mit unbekanntem Typ, statt sie zu übernehmen', () => {
    const r = newCardsFromNetdeck([{ ...SAMPLE, slug: 'neu', card_type: 'Location' }], new Set());
    expect(r.cards).toEqual([]);
    expect(r.skipped).toEqual(['neu']);
  });
});
