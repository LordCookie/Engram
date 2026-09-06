import { describe, it, expect } from 'vitest';
import { cardIndex } from '../data/catalog';
import { starters, starterEntries, starterSize } from './starters';

describe('Starter-Decks', () => {
  it('enthält The Heist und Embracing Power', () => {
    expect(starters.map((d) => d.id).sort()).toEqual(['embracing-power', 'the-heist']);
  });

  it('jeder Starter hat 40 Deckkarten + 3 Legends (43 gesamt)', () => {
    for (const d of starters) {
      const deckCards = Object.values(d.cards).reduce((a, b) => a + b, 0);
      expect(deckCards).toBe(40); // Deckgröße nach § 1 (Legends zählen NICHT mit)
      expect(d.legendIds.length).toBe(3);
      expect(starterSize(d)).toBe(43); // physisch: 40 Deckkarten + 3 Legends
    }
  });

  it('alle Karten-IDs existieren im Katalog', () => {
    for (const d of starters) {
      for (const e of starterEntries(d)) expect(cardIndex.has(e.cardId)).toBe(true);
    }
  });

  it('legendIds sind echte Legends, Deckkarten sind es nicht', () => {
    for (const d of starters) {
      for (const id of d.legendIds) expect(cardIndex.get(id)!.type).toBe('LEGEND');
      for (const id of Object.keys(d.cards)) expect(cardIndex.get(id)!.type).not.toBe('LEGEND');
    }
  });

  it('starterEntries zählt jede der 3 Legends genau einmal', () => {
    const d = starters[0];
    const legendEntries = starterEntries(d).filter((e) => d.legendIds.includes(e.cardId));
    expect(legendEntries.length).toBe(3);
    expect(legendEntries.every((e) => e.count === 1)).toBe(true);
  });
});
