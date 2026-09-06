import { describe, it, expect } from 'vitest';
import combosJson from './combos.json';
import { cardIndex } from './catalog';
import { curatedCombos } from './combos';

const raw = (combosJson as { combos: { name: string; cards: string[]; why: string }[] }).combos;

describe('kuratierte Combos', () => {
  it('referenzieren nur existierende Karten', () => {
    for (const c of raw) {
      for (const id of c.cards) {
        expect(cardIndex.has(id), `${c.name}: unbekannte Karte "${id}"`).toBe(true);
      }
    }
  });

  it('haben ≥ 2 Karten, einen Namen und eine Erklärung', () => {
    for (const c of raw) {
      expect(c.cards.length, c.name).toBeGreaterThanOrEqual(2);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(10);
    }
  });

  it('werden vollständig geladen (keine wegen fehlender Karten verworfen)', () => {
    expect(curatedCombos.length).toBe(raw.length);
  });
});
