import { describe, it, expect } from 'vitest';
import {
  emptyDraft,
  addLegend,
  removeLegend,
  setCard,
  incCard,
  deckCardCount,
} from './deckDraft';

const base = emptyDraft('beta-2026-05-29');

describe('deckDraft', () => {
  it('emptyDraft ist leer', () => {
    expect(base.legendIds).toEqual([]);
    expect(base.cards).toEqual([]);
  });

  it('addLegend fügt hinzu, dedupliziert und deckelt bei 3', () => {
    let d = addLegend(base, 'a');
    d = addLegend(d, 'a'); // Dublette ignoriert
    d = addLegend(d, 'b');
    d = addLegend(d, 'c');
    d = addLegend(d, 'd'); // 4. wird abgewiesen
    expect(d.legendIds).toEqual(['a', 'b', 'c']);
  });

  it('removeLegend entfernt', () => {
    const d = removeLegend(addLegend(addLegend(base, 'a'), 'b'), 'a');
    expect(d.legendIds).toEqual(['b']);
  });

  it('setCard setzt, incCard erhöht, 0 entfernt, Reihenfolge stabil', () => {
    let d = setCard(base, 'x', 2);
    d = setCard(d, 'y', 1);
    d = incCard(d, 'x', 1); // x -> 3
    expect(deckCardCount(d, 'x')).toBe(3);
    expect(d.cards.map((c) => c.cardId)).toEqual(['x', 'y']); // Reihenfolge bleibt
    d = setCard(d, 'x', 0); // entfernt x
    expect(d.cards.map((c) => c.cardId)).toEqual(['y']);
  });

  it('mutatoren sind immutabel', () => {
    addLegend(base, 'a');
    setCard(base, 'x', 2);
    expect(base.legendIds).toEqual([]);
    expect(base.cards).toEqual([]);
  });
});
