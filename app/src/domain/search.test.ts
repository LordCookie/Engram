import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import type { Card } from './types';
import { searchCards } from './search';

// Deterministisch gegen das Fixture testen, unabhaengig von gezogenen Echtdaten.
const catalog = syntheticSet as Card[];

describe('searchCards', () => {
  it('gibt bei leerer Eingabe nichts zurück', () => {
    expect(searchCards(catalog, '')).toEqual([]);
    expect(searchCards(catalog, '   ')).toEqual([]);
  });

  it('reiht Namens-Präfixtreffer vor Teiltreffer', () => {
    const names = searchCards(catalog, 'in').map((c) => c.name);
    // „Inferno" beginnt mit „in" (Rang 0), „Vine" enthält es nur (Rang 1).
    expect(names[0]).toBe('Inferno');
    expect(names).toContain('Vine');
    expect(names.indexOf('Inferno')).toBeLessThan(names.indexOf('Vine'));
  });

  it('filtert nach Typ', () => {
    const res = searchCards(catalog, 'n', { filters: { types: ['LEGEND'] } });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((c) => c.type === 'LEGEND')).toBe(true);
  });

  it('filtert nach Farbe', () => {
    const res = searchCards(catalog, 'a', { filters: { colors: ['GREEN'] } });
    expect(res.every((c) => c.color === 'GREEN')).toBe(true);
  });

  it('begrenzt die Trefferzahl', () => {
    expect(searchCards(catalog, 'a', { limit: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('findet über die exakte Sammlernummer', () => {
    expect(searchCards(catalog, '010')[0].name).toBe('Sprout');
    expect(searchCards(catalog, '001')[0].name).toBe('Vex');
  });

  it('ist tolerant gegenüber führenden Nullen', () => {
    expect(searchCards(catalog, '10').some((c) => c.name === 'Sprout')).toBe(true);
  });

  it('findet über ein Nummern-Präfix', () => {
    expect(searchCards(catalog, '09').some((c) => c.name === 'Coin')).toBe(true);
  });
});
