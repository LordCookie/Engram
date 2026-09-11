import type { CardIndex } from './types';
import type { DeckDraft } from './deckDraft';

/**
 * Rarität-Budget eines Decks: wie viele Kopien je Seltenheit stecken drin
 * (inkl. Legends, je 1). Zeigt auf einen Blick, wie „teuer" ein Deck ist —
 * viele Rare/Epic = schwer zu beschaffen. Rein/getestet, framework-frei.
 */

export interface RarityCount {
  rarity: string;
  /** Kopien dieser Rarität im Deck (inkl. Legends). */
  count: number;
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Nova Rare', 'Secret'];

export function deckRarityBudget(draft: DeckDraft, cardIndex: CardIndex): RarityCount[] {
  const counts = new Map<string, number>();
  const add = (cardId: string, n: number) => {
    const card = cardIndex.get(cardId);
    if (!card) return;
    counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + n);
  };
  for (const id of draft.legendIds) add(id, 1);
  for (const { cardId, count } of draft.cards) add(cardId, count);

  const rank = (r: string) => {
    const i = RARITY_ORDER.indexOf(r);
    return i === -1 ? RARITY_ORDER.length : i;
  };
  return [...counts.entries()]
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.rarity.localeCompare(b.rarity));
}

/** Rarität gilt als „teuer" (Beschaffungs-Aufwand) ab Rare aufwärts. */
export function isCostlyRarity(rarity: string): boolean {
  return rarity !== 'Common' && rarity !== 'Uncommon';
}
