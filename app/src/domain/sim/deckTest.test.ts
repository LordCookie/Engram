import { describe, it, expect } from 'vitest';
import { catalog } from '../../data/catalog';
import type { SimDeck } from './rng';
import { testMatchup, sampleGame } from './deckTest';

/**
 * Tests für die Deck-Test-API (dünne Hülle um engine2). Die Engine selbst ist im
 * sim/-Werkzeug ausführlicher getestet; hier sichern wir Determinismus,
 * Seat-Fairness und Dominanz auf App-Seite ab.
 */

function deckOf(id: string, name: string): SimDeck {
  return { name, cardIds: Array(40).fill(id) };
}

const units3 = catalog
  .filter((c) => c.type === 'UNIT' && (c.cost ?? 0) === 3 && (c.power ?? 0) > 0)
  .sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
const strong = deckOf(units3[0].id, 'Stark');
const weak = deckOf(units3[units3.length - 1].id, 'Schwach');

describe('deckTest', () => {
  it('ist deterministisch (gleicher Seed → gleiches Ergebnis)', () => {
    const r1 = testMatchup(strong, weak, 30, 1);
    const r2 = testMatchup(strong, weak, 30, 1);
    expect(r1.winPct).toBe(r2.winPct);
    expect(r1.avgTurns).toBe(r2.avgTurns);
  });

  it('Spiegel ≈ 50 % (seat-fair, kein Seite-Bias)', () => {
    const r = testMatchup(strong, deckOf(units3[0].id, 'Stark2'), 80, 1);
    expect(Math.abs(r.winPct - 50)).toBeLessThanOrEqual(8);
  });

  it('Dominanz: gleiche Kosten, mehr Power ⇒ klar überlegen', () => {
    const r = testMatchup(strong, weak, 60, 1);
    expect(r.winPct).toBeGreaterThanOrEqual(85);
  });

  it('sampleGame liefert ein Protokoll mit Ausgang', () => {
    const g = sampleGame(strong, weak, 7);
    expect(g.log.length).toBeGreaterThan(0);
    expect(['a', 'b', null]).toContain(g.winner);
    expect(g.turns).toBeGreaterThan(0);
  });
});
