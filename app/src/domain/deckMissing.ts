import type { Card, CardIndex } from './types';
import type { DeckDraft } from './deckDraft';

/**
 * „Einkaufsliste" fürs Deck: welche Karten fehlen dir noch zum Bauen (Sollmenge
 * im Deck vs. Bestand in der Sammlung)? Rein/getestet, framework-frei.
 *
 * **Legends zählen mit** (je 1 nötig) — sie sind die wichtigsten Karten eines
 * Decks; eine fehlende Legend muss oben stehen, nicht unsichtbar sein.
 */

export interface MissingCard {
  card: Card;
  /** Wie viele Kopien das Deck braucht. */
  need: number;
  /** Wie viele du besitzt. */
  have: number;
  isLegend: boolean;
}

export interface DeckMissing {
  /** Nur wirklich fehlende Karten, Legends zuerst, dann nach Fehlmenge. */
  cards: MissingCard[];
  /** Summe fehlender Kopien. */
  totalMissing: number;
}

export function deckMissing(
  draft: DeckDraft,
  owned: ReadonlyMap<string, number>,
  cardIndex: CardIndex,
): DeckMissing {
  const rows: { card: Card; need: number; isLegend: boolean }[] = [];
  for (const id of draft.legendIds) {
    const card = cardIndex.get(id);
    if (card) rows.push({ card, need: 1, isLegend: true });
  }
  for (const { cardId, count } of draft.cards) {
    const card = cardIndex.get(cardId);
    if (card) rows.push({ card, need: count, isLegend: false });
  }
  const cards = rows
    .map((r) => ({ ...r, have: owned.get(r.card.id) ?? 0 }))
    .filter((r) => r.need > r.have)
    .sort(
      (a, b) =>
        Number(b.isLegend) - Number(a.isLegend) || // Legends zuerst
        b.need - b.have - (a.need - a.have) || // größere Fehlmenge zuerst
        a.card.name.localeCompare(b.card.name),
    );
  const totalMissing = cards.reduce((s, m) => s + (m.need - m.have), 0);
  return { cards, totalMissing };
}
