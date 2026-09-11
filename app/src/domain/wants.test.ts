import { describe, it, expect } from 'vitest';
import syntheticSet from '../../tests/fixtures/synthetic-set.json';
import { buildCardIndex, type Card } from './types';
import { wantRows, wantsStillTotal } from './wants';

const catalog = syntheticSet as Card[];
const index = buildCardIndex(catalog);

describe('wants', () => {
  it('verrechnet Bestand: still = max(0, want − have)', () => {
    const rows = wantRows(
      [
        { cardId: 'grn-sprout', count: 3 },
        { cardId: 'grn-mend', count: 2 },
      ],
      new Map([['grn-mend', 5]]), // mehr als gewünscht → erfüllt
      index,
    );
    const sprout = rows.find((r) => r.card.id === 'grn-sprout');
    const mend = rows.find((r) => r.card.id === 'grn-mend');
    expect(sprout).toMatchObject({ want: 3, have: 0, still: 3 });
    expect(mend).toMatchObject({ want: 2, have: 5, still: 0 });
    expect(wantsStillTotal(rows)).toBe(3);
  });

  it('sortiert noch fehlende zuerst', () => {
    const rows = wantRows(
      [
        { cardId: 'grn-mend', count: 1 }, // erfüllt
        { cardId: 'grn-sprout', count: 2 }, // fehlt
      ],
      new Map([['grn-mend', 1]]),
      index,
    );
    expect(rows[0].card.id).toBe('grn-sprout');
    expect(rows[0].still).toBe(2);
  });

  it('ignoriert unbekannte Karten-IDs', () => {
    const rows = wantRows([{ cardId: 'gibtsnicht', count: 1 }], new Map(), index);
    expect(rows).toHaveLength(0);
  });
});
