import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card, type Color } from '../src/domain/types';
import syntheticSetJson from './fixtures/synthetic-set.json';

/**
 * Absicherung des synthetischen Fixtures (PLAN.md Spike 0.4).
 * Das Fixture muss Validator und Solver vollständig testbar machen, bevor
 * eine echte Karte vorliegt — diese Tests verankern seine Invarianten.
 */
const cards = syntheticSetJson as Card[];

describe('synthetic-set fixture', () => {
  it('enthält rund 20 Karten', () => {
    expect(cards.length).toBeGreaterThanOrEqual(20);
  });

  it('deckt alle vier Farben ab', () => {
    const colors = new Set<Color>(cards.map((c) => c.color));
    expect([...colors].sort()).toEqual(['BLUE', 'GREEN', 'RED', 'YELLOW']);
  });

  it('deckt RAM-Werte 1 bis 6 ab', () => {
    const rams = new Set(
      cards.map((c) => c.ram).filter((r): r is number => typeof r === 'number'),
    );
    for (let r = 1; r <= 6; r++) {
      expect(rams.has(r)).toBe(true);
    }
  });

  it('enthält mehrere Legends inklusive einer ohne RAM (Grenzfall)', () => {
    const legends = cards.filter((c) => c.type === 'LEGEND');
    expect(legends.length).toBeGreaterThanOrEqual(3);
    expect(legends.some((l) => l.ram === undefined)).toBe(true);
  });

  it('hat eindeutige Karten-IDs', () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lässt sich in einen CardIndex überführen', () => {
    const index = buildCardIndex(cards);
    expect(index.size).toBe(cards.length);
    expect(index.get('leg-vex')?.color).toBe('GREEN');
  });
});
