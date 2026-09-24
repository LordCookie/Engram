import { describe, it, expect } from 'vitest';
import { binderOrder, binderPages, buildBinder, collectorKey, pageOfCard, SLOTS_PER_PAGE } from './binder';
import type { Card, Color } from './types';

const card = (id: string, collectorNumber: string, color: Color = 'RED'): Card => ({
  id,
  setCode: 'WNC',
  collectorNumber,
  name: id,
  type: 'UNIT',
  color,
  tags: [],
  rarity: 'Common',
  rulesText: '',
});

describe('binder', () => {
  it('collectorKey trennt Zahl und Buchstaben-Suffix', () => {
    expect(collectorKey('005a')).toEqual([5, 'a']);
    expect(collectorKey('112')).toEqual([112, '']);
    expect(collectorKey(undefined)[0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('Set-Reihenfolge: numerisch (nicht lexikografisch), Suffix, dann Farbe', () => {
    const cards = [card('c', '010'), card('b', '005a'), card('a', '005'), card('y', '001', 'YELLOW'), card('r', '001')];
    expect(binderOrder(cards).map((c) => c.id)).toEqual(['r', 'y', 'a', 'b', 'c']);
  });

  it('Fächer tragen den Bestand (Standard + Alt), fehlende sind leer', () => {
    const cards = [card('a', '001'), card('b', '002')];
    const slots = buildBinder(cards, new Map([['a', { std: 2, alt: 1 }]]));
    expect(slots[0]).toMatchObject({ std: 2, alt: 1, owned: true });
    expect(slots[1]).toMatchObject({ std: 0, alt: 0, owned: false });
  });

  it('Farbfilter und 3×3-Seiten', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`k${i}`, String(i + 1).padStart(3, '0'), i % 2 ? 'BLUE' : 'RED'),
    );
    expect(buildBinder(cards, new Map(), 'BLUE')).toHaveLength(10);
    const pages = binderPages(buildBinder(cards, new Map()));
    expect(pages.map((p) => p.length)).toEqual([SLOTS_PER_PAGE, SLOTS_PER_PAGE, 2]);
  });

  it('pageOfCard findet die Seite einer Karte', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(`k${i}`, String(i + 1).padStart(3, '0')));
    const slots = buildBinder(cards, new Map());
    expect(pageOfCard(slots, 'k0')).toBe(0);
    expect(pageOfCard(slots, 'k9')).toBe(1);
    expect(pageOfCard(slots, 'nope')).toBe(-1);
  });
});
