import { describe, it, expect } from 'vitest';
import { computeAchievements, newlyUnlocked, type AchievementInput } from './achievements';
import type { OwnedCount } from './binder';
import type { Card, CardType, Color } from './types';

const card = (id: string, color: Color = 'RED', type: CardType = 'UNIT', rarity = 'Common'): Card => ({
  id,
  setCode: 'WNC',
  collectorNumber: '001',
  name: id,
  type,
  color,
  tags: [],
  rarity,
  rulesText: '',
});

const CARDS: Card[] = [
  card('l1', 'RED', 'LEGEND'),
  card('l2', 'BLUE', 'LEGEND'),
  card('l3', 'RED', 'LEGEND'),
  card('u1', 'RED'),
  card('u2', 'BLUE'),
  card('s1', 'BLUE', 'UNIT', 'Secret'),
];

const input = (owned: [string, OwnedCount][], extra: Partial<AchievementInput> = {}): AchievementInput => ({
  cards: CARDS,
  owned: new Map(owned),
  altArtCards: new Set(['u1']),
  deckCount: 0,
  legalDeckCount: 0,
  maxCopies: 3,
  ...extra,
});

const byId = (inp: AchievementInput) => new Map(computeAchievements(inp).map((a) => [a.id, a]));

describe('Sammler-Erfolge', () => {
  it('leere Sammlung: nichts freigeschaltet, Fortschritt 0', () => {
    const a = computeAchievements(input([]));
    expect(a.every((x) => !x.unlocked)).toBe(true);
    expect(a.find((x) => x.id === 'unique-all')).toMatchObject({ current: 0, target: CARDS.length });
  });

  it('erste Karte, Legends und Farbe komplett', () => {
    const m = byId(
      input([
        ['l1', { std: 1, alt: 0 }],
        ['l3', { std: 1, alt: 0 }],
        ['u1', { std: 1, alt: 0 }],
        ['l2', { std: 1, alt: 0 }],
      ]),
    );
    expect(m.get('first-card')?.unlocked).toBe(true);
    expect(m.get('legends-3')?.unlocked).toBe(true);
    expect(m.get('legends-all')?.unlocked).toBe(true);
    expect(m.get('color-red')).toMatchObject({ unlocked: true, current: 3, target: 3 });
    expect(m.get('color-blue')).toMatchObject({ unlocked: false, current: 1, target: 3 });
  });

  it('Alt-Arts: erste Alt, beide Seiten, Galerie', () => {
    const m = byId(input([['u1', { std: 2, alt: 1 }]]));
    expect(m.get('alt-1')?.unlocked).toBe(true);
    expect(m.get('both-sides')?.unlocked).toBe(true);
    expect(m.get('alt-all')?.unlocked).toBe(true); // die einzige Alt-Art-Karte
  });

  it('Playset zählt Standard + Alt, Legends zählen nicht', () => {
    expect(byId(input([['u1', { std: 2, alt: 1 }]])).get('playset-1')?.unlocked).toBe(true);
    expect(byId(input([['l1', { std: 3, alt: 0 }]])).get('playset-1')?.unlocked).toBe(false);
  });

  it('Seltenheit und Decks', () => {
    const m = byId(input([['s1', { std: 1, alt: 0 }]], { deckCount: 5, legalDeckCount: 1 }));
    expect(m.get('secret')?.unlocked).toBe(true);
    expect(m.get('deck-legal')?.unlocked).toBe(true);
    expect(m.get('deck-5')?.unlocked).toBe(true);
    expect(m.has('nova')).toBe(false); // keine Nova Rare im Set → kein Erfolg
  });

  it('Fortschritt wird bei target gedeckelt', () => {
    const a = byId(input([['u1', { std: 200, alt: 0 }]])).get('copies-100');
    expect(a).toMatchObject({ current: 100, target: 100, unlocked: true });
  });

  it('newlyUnlocked meldet nur Neues', () => {
    const list = computeAchievements(input([['u1', { std: 1, alt: 1 }]]));
    const fresh = newlyUnlocked(list, new Set(['first-card']));
    expect(fresh.map((a) => a.id)).toContain('alt-1');
    expect(fresh.map((a) => a.id)).not.toContain('first-card');
  });
});
