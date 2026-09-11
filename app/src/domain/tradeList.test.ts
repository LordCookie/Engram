import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import { tradeSurplus, tradeSurplusTotal } from './tradeList';

function card(id: string, type: Card['type']): Card {
  return { id, setCode: 'TST', name: id, type, color: 'RED', tags: [], rarity: 'Common', rulesText: '' };
}

const catalog: Card[] = [card('unit', 'UNIT'), card('leg', 'LEGEND'), card('gear', 'GEAR')];
const index = buildCardIndex(catalog);

// Playset: Legends 1, sonst 3 (wie Ruleset maxCopiesPerCard).
const playsetFor = (c: Card) => (c.type === 'LEGEND' ? 1 : 3);

describe('tradeList', () => {
  it('Überschuss = owned − Playset (nur > 0)', () => {
    const rows = tradeSurplus(
      new Map([
        ['unit', 5], // 5 − 3 = 2 über
        ['leg', 2], // 2 − 1 = 1 über (Legend-Playset 1)
        ['gear', 3], // genau Playset → kein Überschuss
      ]),
      index,
      playsetFor,
    );
    expect(rows.map((r) => [r.card.id, r.surplus])).toEqual([
      ['unit', 2],
      ['leg', 1],
    ]);
    expect(tradeSurplusTotal(rows)).toBe(3);
  });

  it('keine Dubletten = leere Liste', () => {
    const rows = tradeSurplus(new Map([['unit', 3], ['leg', 1]]), index, playsetFor);
    expect(rows).toHaveLength(0);
  });

  it('ignoriert unbekannte Karten-IDs', () => {
    const rows = tradeSurplus(new Map([['gibtsnicht', 9]]), index, playsetFor);
    expect(rows).toHaveLength(0);
  });
});
