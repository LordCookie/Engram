import startersJson from '../data/starters.json';

/**
 * Starter-Decks (PLAN.md § 5, Aufgabe 7). Feste, bekannte Listen — ein Klick
 * „Ich besitze Starter X" trägt rund 40 Karten auf einmal ein. Framework-frei.
 */
export interface StarterDeck {
  id: string;
  name: string;
  faction: string;
  note?: string;
  legendIds: string[];
  cards: Record<string, number>;
}

export const starters: StarterDeck[] = startersJson as unknown as StarterDeck[];

export interface DeckEntry {
  cardId: string;
  count: number;
}

/** Alle Karten eines Starters als (cardId, count): Legends je 1 plus Deckkarten. */
export function starterEntries(deck: StarterDeck): DeckEntry[] {
  return [
    ...deck.legendIds.map((cardId) => ({ cardId, count: 1 })),
    ...Object.entries(deck.cards).map(([cardId, count]) => ({ cardId, count })),
  ];
}

/** Gesamtkartenzahl inklusive Legends. */
export function starterSize(deck: StarterDeck): number {
  return starterEntries(deck).reduce((sum, e) => sum + e.count, 0);
}
