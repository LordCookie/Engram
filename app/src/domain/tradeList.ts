import type { Card, CardIndex } from './types';

/**
 * Tausch-/Dubletten-Liste — reine Ableitung aus dem Bestand: was du über einen
 * vollen Playset hinaus besitzt und daher tauschen kannst. Framework-frei/getestet.
 * `playsetFor` liefert die je Karte sinnvolle Höchstmenge (Legends 1, sonst
 * `maxCopiesPerCard`) — aus dem Ruleset, nicht hardcoden (CLAUDE.md).
 */

export interface TradeRow {
  card: Card;
  owned: number;
  /** Überschuss = owned − Playset (nur > 0). */
  surplus: number;
}

export function tradeSurplus(
  owned: ReadonlyMap<string, number>,
  cardIndex: CardIndex,
  playsetFor: (card: Card) => number,
): TradeRow[] {
  const rows: TradeRow[] = [];
  for (const [cardId, count] of owned) {
    const card = cardIndex.get(cardId);
    if (!card) continue;
    const surplus = count - playsetFor(card);
    if (surplus > 0) rows.push({ card, owned: count, surplus });
  }
  return rows.sort((a, b) => b.surplus - a.surplus || a.card.name.localeCompare(b.card.name));
}

/** Summe der überschüssigen Kopien. */
export function tradeSurplusTotal(rows: readonly TradeRow[]): number {
  return rows.reduce((s, r) => s + r.surplus, 0);
}
