import type { Card, CardIndex } from './types';

/**
 * Want-Liste (Wunschliste) — reine Sicht auf die persistierten Wünsche, gegen
 * den Bestand verrechnet: „habe X von gewünschten Y, noch Z zu besorgen".
 * Framework-frei/getestet; die Persistenz liegt in `db/db.ts` (`wants`-Tabelle).
 */

export interface WantEntryLike {
  cardId: string;
  count: number;
}

export interface WantRow {
  card: Card;
  /** Gewünschte Menge. */
  want: number;
  /** Bestand. */
  have: number;
  /** Noch zu besorgen = max(0, want − have). */
  still: number;
}

export function wantRows(
  wants: readonly WantEntryLike[],
  owned: ReadonlyMap<string, number>,
  cardIndex: CardIndex,
): WantRow[] {
  return wants
    .map((w) => {
      const card = cardIndex.get(w.cardId);
      if (!card) return undefined;
      const have = owned.get(w.cardId) ?? 0;
      return { card, want: w.count, have, still: Math.max(0, w.count - have) };
    })
    .filter((r): r is WantRow => r !== undefined)
    .sort(
      (a, b) =>
        b.still - a.still || // noch fehlende zuerst
        a.card.name.localeCompare(b.card.name),
    );
}

/** Summe der noch zu besorgenden Kopien. */
export function wantsStillTotal(rows: readonly WantRow[]): number {
  return rows.reduce((s, r) => s + r.still, 0);
}
