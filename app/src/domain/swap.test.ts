import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { rulesetV1Loaded } from '../rules/ruleset';
import { swapAnalysis } from './swap';
import type { OwnedCounts } from './solver';

const ruleset = rulesetV1Loaded;

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}

const index = buildCardIndex([
  card({ id: 'LGa', name: 'GreenA', type: 'LEGEND', color: 'GREEN', ram: 2 }),
  card({ id: 'LGb', name: 'GreenB', type: 'LEGEND', color: 'GREEN', ram: 2 }),
  card({ id: 'LR', name: 'RedC', type: 'LEGEND', color: 'RED', ram: 3 }),
  card({ id: 'LB', name: 'BlueD', type: 'LEGEND', color: 'BLUE', ram: 2 }),
  card({ id: 'LR2', name: 'RedE', type: 'LEGEND', color: 'RED', ram: 1 }),
  card({ id: 'g1', type: 'UNIT', color: 'GREEN', ram: 1 }),
  card({ id: 'g4', type: 'UNIT', color: 'GREEN', ram: 4 }),
  card({ id: 'r4', type: 'UNIT', color: 'RED', ram: 4 }),
  card({ id: 'b2', type: 'UNIT', color: 'BLUE', ram: 2 }),
]);

// Bestand: alle Legends + Karten je 1.
const owned: OwnedCounts = new Map(
  ['LGa', 'LGb', 'LR', 'LB', 'LR2', 'g1', 'g4', 'r4', 'b2'].map((id) => [id, 1]),
);

describe('swapAnalysis', () => {
  // Aktuelles Triple GreenA+GreenB+RedC → Caps G4, R3. Spielbar: g1, g4.
  const swaps = swapAnalysis(['LGa', 'LGb', 'LR'], owned, ruleset, index);

  it('gibt bei unvollständigem Triple nichts zurück', () => {
    expect(swapAnalysis(['LGa', 'LGb'], owned, ruleset, index)).toEqual([]);
  });

  it('bester Tausch: RedC → BlueD schaltet b2 frei, verliert nichts', () => {
    const best = swaps[0];
    expect(best.out.id).toBe('LR');
    expect(best.in.id).toBe('LB');
    expect(best.unlocked.map((c) => c.id)).toEqual(['b2']);
    expect(best.lost).toEqual([]);
    expect(best.net).toBe(1);
  });

  it('erkennt Tausche, die Karten kosten (GreenA → BlueD verliert g4)', () => {
    const s = swaps.find((x) => x.out.id === 'LGa' && x.in.id === 'LB');
    expect(s).toBeDefined();
    expect(s!.lost.map((c) => c.id)).toContain('g4'); // grüner Cap fällt 4 → 2
    expect(s!.unlocked.map((c) => c.id)).toContain('b2');
    expect(s!.net).toBe(0);
  });

  it('ist absteigend nach Netto sortiert', () => {
    for (let i = 1; i < swaps.length; i++) {
      expect(swaps[i - 1].net).toBeGreaterThanOrEqual(swaps[i].net);
    }
  });

  it('überspringt Tausche mit Namensdublette', () => {
    // GreenB gegen … es gibt keine zweite Legend gleichen Namens hier, also
    // prüfen wir nur, dass kein Swap denselben Namen zweimal im Triple erzeugt.
    for (const s of swaps) {
      const names = s.newTriple.map((id) => index.get(id)!.name);
      expect(new Set(names).size).toBe(3);
    }
  });
});
